// Inventario: descuento automático de insumos por receta al facturar.
// Relacionado con: routes/mesas.js y routes/facturas.js (facturar), routes/inventario.js
//
// Se ejecuta dentro de la transacción de la factura (connection). Si un producto no tiene
// receta, no descuenta nada. El stock puede quedar negativo: la venta nunca se bloquea por
// inventario, pero aparece en alertas para que el administrador lo corrija.

const unidades = require('./unidades');

async function descontarPorFactura(connection, facturaId, usuario = null) {
    const [consumos] = await connection.query(
        `SELECT r.insumo_id, SUM(r.cantidad * d.cantidad) AS total
         FROM detalle_factura d
         JOIN recetas r ON r.producto_id = d.producto_id
         WHERE d.factura_id = ?
         GROUP BY r.insumo_id`,
        [facturaId]
    );
    for (const c of consumos) {
        const cantidad = Number(c.total || 0);
        if (!(cantidad > 0)) continue;
        const [upd] = await connection.query(
            'UPDATE insumos SET stock = stock - ? WHERE id = ? RETURNING stock',
            [cantidad, c.insumo_id]
        );
        const stock = upd.rows && upd.rows[0] ? Number(upd.rows[0].stock) : null;
        await connection.query(
            `INSERT INTO inventario_movimientos (insumo_id, tipo, cantidad, stock_resultante, factura_id, nota, usuario)
             VALUES (?, 'venta', ?, ?, ?, ?, ?)`,
            [c.insumo_id, -cantidad, stock, facturaId, `Factura #${facturaId}`, usuario]
        );
    }
    return consumos.length;
}

/** Registra entrada/salida/ajuste manual. Para "ajuste", cantidad es el stock final contado. */
async function registrarMovimiento(connection, { insumoId, tipo, cantidad, nota, usuario, unidad }) {
    let cant = Number(cantidad);
    if (!['entrada', 'salida', 'ajuste'].includes(tipo)) throw Object.assign(new Error('Tipo de movimiento inválido'), { publico: true });
    if (!Number.isFinite(cant) || (tipo !== 'ajuste' && cant <= 0) || cant < 0) {
        throw Object.assign(new Error('Cantidad inválida'), { publico: true });
    }
    const [rows] = await connection.query('SELECT id, stock, unidad FROM insumos WHERE id = ? FOR UPDATE', [insumoId]);
    if (!rows[0]) throw Object.assign(new Error('Insumo no encontrado'), { publico: true });
    // La cantidad puede venir en otra unidad compatible (ej. el insumo está en kg y la compra llegó en libras)
    cant = convertirCantidad(cant, unidad, rows[0].unidad);
    const actual = Number(rows[0].stock);
    let delta;
    if (tipo === 'entrada') delta = cant;
    else if (tipo === 'salida') delta = -cant;
    else delta = cant - actual;
    const nuevo = actual + delta;
    await connection.query('UPDATE insumos SET stock = ? WHERE id = ?', [nuevo, insumoId]);
    await connection.query(
        `INSERT INTO inventario_movimientos (insumo_id, tipo, cantidad, stock_resultante, nota, usuario)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [insumoId, tipo, delta, nuevo, nota || null, usuario || null]
    );
    return { stock: nuevo, delta };
}

/** Convierte una cantidad escrita en `unidadEntrada` a la unidad del insumo. Sin unidad: no convierte. */
function convertirCantidad(cantidad, unidadEntrada, unidadInsumo) {
    if (unidadEntrada == null || String(unidadEntrada).trim() === '') return cantidad;
    if (unidades.normalizar(unidadEntrada) === unidades.normalizar(unidadInsumo)) return cantidad;
    const r = unidades.convertir(cantidad, unidadEntrada, unidadInsumo);
    if (r === null) {
        throw Object.assign(new Error(`No se puede usar "${unidadEntrada}" con un insumo medido en "${unidadInsumo}"`), { publico: true });
    }
    return Math.round(r * 100000) / 100000;
}

/**
 * Cambia la unidad de un insumo (ej. kg -> lb) convirtiendo TODO lo que depende de ella:
 * stock, mínimo, costo por unidad, cantidades de las recetas y el historial de movimientos.
 * Solo dentro de la misma familia (peso o volumen).
 */
async function cambiarUnidad(connection, insumoId, nuevaUnidad) {
    const nueva = unidades.normalizar(nuevaUnidad);
    if (!nueva) throw Object.assign(new Error('Indica la nueva unidad'), { publico: true });
    const [rows] = await connection.query('SELECT id, unidad FROM insumos WHERE id = ? AND activo = 1 FOR UPDATE', [insumoId]);
    if (!rows[0]) throw Object.assign(new Error('Insumo no encontrado'), { publico: true });
    const actual = unidades.normalizar(rows[0].unidad);
    if (actual === nueva) return { unidad: nueva, convertido: false };
    const k = unidades.multiplicador(actual, nueva); // cuántas "nueva" hay en 1 "actual"
    if (k === null) {
        throw Object.assign(new Error(`No se puede convertir de "${rows[0].unidad}" a "${nuevaUnidad}": son tipos de medida distintos`), { publico: true });
    }
    await connection.query(
        `UPDATE insumos SET unidad = ?, stock = ROUND(stock * ?, 3), stock_minimo = ROUND(stock_minimo * ?, 3),
                costo_unitario = ROUND(costo_unitario / ?, 4) WHERE id = ?`,
        [nueva, k, k, k, insumoId]
    );
    await connection.query('UPDATE recetas SET cantidad = GREATEST(ROUND(cantidad * ?, 5), 0.00001) WHERE insumo_id = ?', [k, insumoId]);
    await connection.query(
        'UPDATE inventario_movimientos SET cantidad = ROUND(cantidad * ?, 3), stock_resultante = ROUND(stock_resultante * ?, 3) WHERE insumo_id = ?',
        [k, k, insumoId]
    );
    return { unidad: nueva, convertido: true, factor: k };
}

module.exports = { descontarPorFactura, registrarMovimiento, cambiarUnidad, convertirCantidad };
