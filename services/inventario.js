// Inventario: descuento automático de insumos por receta al facturar.
// Relacionado con: routes/mesas.js y routes/facturas.js (facturar), routes/inventario.js
//
// Se ejecuta dentro de la transacción de la factura (connection). Si un producto no tiene
// receta, no descuenta nada. El stock puede quedar negativo: la venta nunca se bloquea por
// inventario, pero aparece en alertas para que el administrador lo corrija.

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
async function registrarMovimiento(connection, { insumoId, tipo, cantidad, nota, usuario }) {
    const cant = Number(cantidad);
    if (!['entrada', 'salida', 'ajuste'].includes(tipo)) throw Object.assign(new Error('Tipo de movimiento inválido'), { publico: true });
    if (!Number.isFinite(cant) || (tipo !== 'ajuste' && cant <= 0) || cant < 0) {
        throw Object.assign(new Error('Cantidad inválida'), { publico: true });
    }
    const [rows] = await connection.query('SELECT id, stock FROM insumos WHERE id = ? FOR UPDATE', [insumoId]);
    if (!rows[0]) throw Object.assign(new Error('Insumo no encontrado'), { publico: true });
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

module.exports = { descontarPorFactura, registrarMovimiento };
