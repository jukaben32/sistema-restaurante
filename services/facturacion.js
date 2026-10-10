// Facturación (mesa, delivery, para llevar y venta rápida): UNA sola implementación.
// Calcula ITBIS y propina con services/fiscal/calculo.js, asigna el NCF / e-NCF, valida pagos (incluye Stripe y cripto),
// crea factura + detalle + pagos, descuenta inventario y cierra el pedido.
// Debe ejecutarse dentro de una transacción abierta (connection.beginTransaction()). Después de confirmarla, quien llama debe
// avisar a `emision.programar(facturaId)` (envío del e-CF al proveedor) — por eso los resultados traen `facturaId` y `fiscal`.
// Relacionado con: routes/mesas.js, routes/facturas.js, services/delivery.js, services/stripe.js, services/inventario.js, services/fiscal/*
const crypto = require('crypto');
const stripeService = require('./stripe');
const criptoService = require('./cripto');
const inventario = require('./inventario');
const { ErrorPublico } = require('./errores');
const calculo = require('./fiscal/calculo');
const fiscalConfig = require('./fiscal/config');
const secuencias = require('./fiscal/secuencias');

const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'qr', 'cripto'];

function normalizarPagos(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .filter((p) => p && typeof p === 'object')
        .map((p) => ({
            metodo: String(p.metodo || '').toLowerCase().trim(),
            monto: Number(p.monto || 0),
            referencia: p.referencia != null && String(p.referencia).trim() !== '' ? String(p.referencia).trim() : null
        }))
        .filter((p) => METODOS.includes(p.metodo) && Number.isFinite(p.monto) && p.monto > 0);
}

/** Datos fiscales del cliente tal como están hoy (se copian a la factura: después no cambian). */
async function comprador(conn, clienteId) {
    const [rows] = await conn.query('SELECT id, nombre, tipo_documento, documento, razon_social FROM clientes WHERE id = ?', [clienteId]);
    const c = rows[0];
    if (!c) throw new ErrorPublico('Cliente no encontrado');
    const identificado = c.tipo_documento && c.tipo_documento !== 'ninguno' && c.documento;
    return {
        id: c.id,
        nombre: c.razon_social || c.nombre,
        tipo_documento: identificado ? c.tipo_documento : 'ninguno',
        documento: identificado ? c.documento : null,
        razon_social: c.razon_social
    };
}

/**
 * Líneas con su tasa de ITBIS (de la tabla productos). `items`: [{ producto_id, cantidad, precio_unitario, unidad_medida, subtotal }].
 * El motor calcula sobre el importe de cada línea (subtotal), así las cantidades fraccionarias (kg, lb) no acumulan redondeos.
 */
async function lineasFiscales(conn, items) {
    const ids = [...new Set(items.map((i) => Number(i.producto_id)))];
    const [prods] = await conn.query('SELECT id, nombre, codigo, itbis_tasa FROM productos WHERE id IN (?)', [ids]);
    const porId = new Map(prods.map((p) => [Number(p.id), p]));
    return items.map((i) => {
        const p = porId.get(Number(i.producto_id));
        if (!p) throw new ErrorPublico('Un producto de la cuenta ya no existe');
        const importe = calculo.round2(i.subtotal != null ? Number(i.subtotal) : Number(i.precio_unitario) * Number(i.cantidad));
        return {
            producto_id: Number(i.producto_id), nombre: p.nombre, cantidad: Number(i.cantidad), unidad_medida: i.unidad_medida || null,
            precio_unitario: Number(i.precio_unitario), importe,
            itbis_tasa: p.itbis_tasa || '18', es_envio: p.codigo === 'ENVIO',
            // para el motor: 1 unidad al importe de la línea
            _calc: { precio_unitario: importe, cantidad: 1, itbis_tasa: p.itbis_tasa || '18', es_envio: p.codigo === 'ENVIO' }
        };
    });
}

/** Calcula impuestos y propina para una lista de líneas. */
function calcular(lineas, cfg, tipoPedido) {
    const r = calculo.calcularFactura(lineas.map((l) => l._calc), { cfg: fiscalConfig.paraCalculo(cfg), tipoPedido });
    return { ...r, lineas: r.lineas.map((c, i) => ({ ...lineas[i], base: c.base, itbis: c.itbis, tasaClave: c.tasaClave, total_linea: c.total })) };
}

/** Vista previa de lo que se va a cobrar (la usan Mesas, Venta rápida, Delivery, los agentes y la app de clientes). */
async function cotizarLineas(conn, items, { tipoPedido = 'mesa', clienteId = null, quiereCreditoFiscal = false } = {}) {
    const cfg = await fiscalConfig.obtener(conn);
    const lineas = await lineasFiscales(conn, items);
    const r = calcular(lineas, cfg, tipoPedido);
    let tipo = null;
    let aviso = null;
    if (cfg.activo) {
        try {
            const comp = clienteId ? await comprador(conn, clienteId) : null;
            tipo = calculo.elegirTipo({ comprador: comp, quiereCreditoFiscal, serieB: cfg.serieB, total: r.total }).tipo;
        } catch (e) { if (e.publico) aviso = e.message; else throw e; }
    }
    return { ...r, modo: cfg.modo, fiscal: cfg.activo, tipo_comprobante: tipo, aviso, propina_tasa: r.propina_tasa };
}

async function cotizarPedido(conn, pedidoId, opciones = {}) {
    const [peds] = await conn.query('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);
    if (!peds[0]) throw new ErrorPublico('Pedido no encontrado');
    const [items] = await conn.query(`SELECT * FROM pedido_items WHERE pedido_id = ? AND estado NOT IN ('cancelado','rechazado')`, [pedidoId]);
    if (!items.length) throw new ErrorPublico('Pedido sin items');
    return cotizarLineas(conn, items, { tipoPedido: peds[0].tipo || 'mesa', ...opciones });
}

/**
 * Crea la factura (con su NCF si el modo fiscal está activo), el detalle, los pagos, el descuento de inventario.
 * @returns { facturaId, total, fiscal: { estado, ncf, tipo } }
 */
async function emitir(conn, { clienteId, items, tipoPedido, formaPago, pagos, usuario, quiereCreditoFiscal = false }) {
    const cfg = await fiscalConfig.obtener(conn);
    const lineas = await lineasFiscales(conn, items);
    const calc = calcular(lineas, cfg, tipoPedido);
    const total = calc.total;
    if (!(total > 0)) throw new ErrorPublico('El total de la cuenta es 0');

    // Pagos con Stripe / cripto: se verifican contra su proveedor y se convierten en pagos de tarjeta / cripto
    const stripeAplicado = await stripeService.aplicarPagosStripe(conn, pagos);
    const criptoAplicado = await criptoService.aplicarPagosCripto(conn, stripeAplicado.pagos);
    const pagosNorm = normalizarPagos(criptoAplicado.pagos);
    const sumaPagos = pagosNorm.reduce((acc, p) => acc + p.monto, 0);
    let formaPagoDB = String(formaPago || 'efectivo').toLowerCase();
    if (pagosNorm.length > 0) {
        if (sumaPagos < total - 0.01) throw new ErrorPublico(`La suma de pagos (${sumaPagos.toFixed(2)}) no cubre el total (${total.toFixed(2)})`);
        formaPagoDB = pagosNorm.length === 1 ? pagosNorm[0].metodo : 'mixto';
    } else if (![...METODOS, 'mixto'].includes(formaPagoDB)) {
        formaPagoDB = 'efectivo';
    }

    // Comprobante fiscal
    const comp = await comprador(conn, clienteId);
    let tipo = null, ncf = null, estado = 'no_fiscal', token = null;
    if (cfg.activo) {
        const el = calculo.elegirTipo({ comprador: comp, quiereCreditoFiscal, serieB: cfg.serieB, total });
        tipo = el.tipo;
        const asignado = await secuencias.asignar(conn, tipo, { produccion: cfg.modo === 'ecf_produccion' });
        ncf = asignado.ncf;
        estado = el.serie === 'B' ? (cfg.modo === 'ncf_b' ? 'aceptado' : 'contingencia') : 'pendiente';
        token = crypto.randomBytes(16).toString('hex');
    }

    const [ins] = await conn.query(
        `INSERT INTO facturas (cliente_id, total, forma_pago, fiscal_estado, fiscal_modo, tipo_comprobante, ncf, token_publico,
            subtotal_gravado_18, subtotal_gravado_16, subtotal_gravado_0, subtotal_exento, itbis_total, propina,
            comprador_documento, comprador_tipo_doc, comprador_nombre)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [clienteId, total, formaPagoDB, estado, cfg.modo, tipo, ncf, token,
            calc.subtotal_gravado_18, calc.subtotal_gravado_16, calc.subtotal_gravado_0, calc.subtotal_exento, calc.itbis_total, calc.propina,
            comp.documento, comp.tipo_documento === 'ninguno' ? null : comp.tipo_documento, cfg.activo ? comp.nombre : null]
    );
    const facturaId = ins.insertId;

    await conn.query(
        'INSERT INTO detalle_factura (factura_id, producto_id, cantidad, precio_unitario, unidad_medida, subtotal, itbis_tasa, base, itbis, es_envio) VALUES ?',
        [calc.lineas.map((l) => [facturaId, l.producto_id, l.cantidad, l.precio_unitario, l.unidad_medida, l.importe,
            cfg.activo ? l.tasaClave : null, l.base, l.itbis, l.es_envio ? 1 : 0])]
    );

    if (pagosNorm.length > 0) {
        await conn.query('INSERT INTO factura_pagos (factura_id, metodo, monto, referencia) VALUES ?', [pagosNorm.map((p) => [facturaId, p.metodo, p.monto, p.referencia])]);
    } else {
        await conn.query('INSERT INTO factura_pagos (factura_id, metodo, monto, referencia) VALUES (?, ?, ?, ?)', [facturaId, formaPagoDB === 'mixto' ? 'efectivo' : formaPagoDB, total, null]);
    }

    await stripeService.marcarUsados(conn, stripeAplicado.ids, facturaId);
    await criptoService.marcarUsados(conn, criptoAplicado.ids, facturaId);
    await inventario.descontarPorFactura(conn, facturaId, usuario);
    if (cfg.activo) {
        await conn.query(`INSERT INTO fiscal_eventos (factura_id, evento, detalle, usuario) VALUES (?, 'emitida', ?, ?)`, [facturaId, `${ncf} (${tipo}) total ${total.toFixed(2)}`, usuario]);
    }
    return { facturaId, total, calculo: calc, fiscal: { activo: cfg.activo, estado, ncf, tipo } };
}

/**
 * Factura un pedido de mesa / delivery / para llevar.
 * @param opts { pedidoId, clienteId, formaPago?, pagos?, usuario?, quiereCreditoFiscal? }
 * @returns { facturaId, pedido, total, fiscal }
 */
async function facturarPedido(connection, { pedidoId, clienteId, formaPago, pagos, usuario = null, quiereCreditoFiscal = false }) {
    const [pedidos] = await connection.query('SELECT * FROM pedidos WHERE id = ? FOR UPDATE', [pedidoId]);
    if (pedidos.length === 0) throw new ErrorPublico('Pedido no encontrado');
    const pedido = pedidos[0];
    if (pedido.estado === 'cerrado') throw new ErrorPublico('Este pedido ya fue facturado');
    if (['cancelado', 'rechazado'].includes(pedido.estado)) throw new ErrorPublico('Este pedido fue cancelado');

    const [items] = await connection.query(
        // Excluir items cancelados o rechazados de la factura
        `SELECT * FROM pedido_items WHERE pedido_id = ? AND estado NOT IN ('cancelado','rechazado')`,
        [pedidoId]
    );
    if (items.length === 0) throw new ErrorPublico('Pedido sin items');

    const r = await emitir(connection, { clienteId, items, tipoPedido: pedido.tipo || 'mesa', formaPago, pagos, usuario, quiereCreditoFiscal });
    await connection.query(`UPDATE pedidos SET estado = 'cerrado', total = ?, factura_id = ? WHERE id = ?`, [r.total, r.facturaId, pedidoId]);
    return { facturaId: r.facturaId, pedido, total: r.total, fiscal: r.fiscal };
}

/**
 * Venta rápida (sin pedido). Los precios salen de la base de datos; solo un administrador puede cambiarlos.
 * @param opts { clienteId, productos: [{ producto_id, cantidad, unidad, precio? }], formaPago, pagos, usuario, esAdmin, quiereCreditoFiscal }
 */
async function facturarVenta(conn, { clienteId, productos, formaPago, pagos, usuario = null, esAdmin = false, quiereCreditoFiscal = false }) {
    if (!Array.isArray(productos) || !productos.length) throw new ErrorPublico('Agrega al menos un producto');
    const ids = [...new Set(productos.map((p) => Number(p.producto_id)))];
    const [prods] = await conn.query('SELECT id, precio_kg, precio_unidad, precio_libra FROM productos WHERE id IN (?)', [ids]);
    const porId = new Map(prods.map((p) => [Number(p.id), p]));
    const items = productos.map((p) => {
        const prod = porId.get(Number(p.producto_id));
        if (!prod) throw new ErrorPublico('Un producto de la venta ya no existe');
        const cantidad = Number(p.cantidad);
        if (!Number.isFinite(cantidad) || cantidad <= 0) throw new ErrorPublico('Cantidad inválida');
        const unidad = String(p.unidad || 'UND').toUpperCase();
        const base = unidad === 'KG' ? prod.precio_kg : unidad === 'LB' ? prod.precio_libra : prod.precio_unidad;
        let precio = Number(base);
        if (esAdmin && p.precio != null && Number.isFinite(Number(p.precio)) && Number(p.precio) >= 0) precio = Number(p.precio);
        if (!(precio > 0)) throw new ErrorPublico('Un producto no tiene precio para esa unidad de medida');
        return { producto_id: prod.id, cantidad, unidad_medida: unidad, precio_unitario: precio, subtotal: calculo.round2(precio * cantidad) };
    });
    return emitir(conn, { clienteId, items, tipoPedido: 'rapida', formaPago, pagos, usuario, quiereCreditoFiscal });
}

module.exports = { facturarPedido, facturarVenta, cotizarLineas, cotizarPedido, normalizarPagos, comprador };
