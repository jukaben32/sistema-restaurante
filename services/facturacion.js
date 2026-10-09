// Facturación de pedidos (mesa, delivery, para llevar): UNA sola implementación.
// Valida pagos (incluye Stripe), crea factura + detalle + pagos, descuenta inventario y cierra el pedido.
// Debe ejecutarse dentro de una transacción abierta (connection.beginTransaction()).
// Relacionado con: routes/mesas.js (POST /pedidos/:id/facturar), services/delivery.js (entregar),
// services/stripe.js (aplicarPagosStripe/marcarUsados), services/inventario.js
const stripeService = require('./stripe');
const criptoService = require('./cripto');
const inventario = require('./inventario');
const { ErrorPublico } = require('./errores');

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

/**
 * @param connection  conexión con transacción abierta
 * @param opts { pedidoId, clienteId, formaPago?, pagos?, usuario? }
 * @returns { facturaId, pedido, total }
 */
async function facturarPedido(connection, { pedidoId, clienteId, formaPago, pagos, usuario = null }) {
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
    const total = items.reduce((acc, it) => acc + Number(it.subtotal || 0), 0);

    // Pagos con Stripe: se verifican contra Stripe y se convierten en pagos de tarjeta
    const stripeAplicado = await stripeService.aplicarPagosStripe(connection, pagos);
    // Pagos con cripto (BTCPay): igual, verificados y bloqueados dentro de la transacción
    const criptoAplicado = await criptoService.aplicarPagosCripto(connection, stripeAplicado.pagos);
    const pagosNorm = normalizarPagos(criptoAplicado.pagos);
    const sumaPagos = pagosNorm.reduce((acc, p) => acc + p.monto, 0);

    let formaPagoDB = String(formaPago || 'efectivo').toLowerCase();
    if (pagosNorm.length > 0) {
        // Solo rechazar si la suma es menor al total (falta dinero)
        if (sumaPagos < total - 0.01) throw new ErrorPublico('La suma de pagos no coincide con el total');
        formaPagoDB = pagosNorm.length === 1 ? pagosNorm[0].metodo : 'mixto';
    } else if (![...METODOS, 'mixto'].includes(formaPagoDB)) {
        formaPagoDB = 'efectivo';
    }

    const [facturaInsert] = await connection.query(
        'INSERT INTO facturas (cliente_id, total, forma_pago) VALUES (?, ?, ?)',
        [clienteId, total, formaPagoDB]
    );
    const facturaId = facturaInsert.insertId;

    await connection.query(
        'INSERT INTO detalle_factura (factura_id, producto_id, cantidad, precio_unitario, unidad_medida, subtotal) VALUES ?',
        [items.map((i) => [facturaId, i.producto_id, i.cantidad, i.precio_unitario, i.unidad_medida, i.subtotal])]
    );

    if (pagosNorm.length > 0) {
        await connection.query(
            'INSERT INTO factura_pagos (factura_id, metodo, monto, referencia) VALUES ?',
            [pagosNorm.map((p) => [facturaId, p.metodo, p.monto, p.referencia])]
        );
    } else {
        await connection.query(
            'INSERT INTO factura_pagos (factura_id, metodo, monto, referencia) VALUES (?, ?, ?, ?)',
            [facturaId, formaPagoDB === 'mixto' ? 'efectivo' : formaPagoDB, total, null]
        );
    }

    await stripeService.marcarUsados(connection, stripeAplicado.ids, facturaId);
    await criptoService.marcarUsados(connection, criptoAplicado.ids, facturaId);
    await inventario.descontarPorFactura(connection, facturaId, usuario);
    await connection.query(`UPDATE pedidos SET estado = 'cerrado', total = ?, factura_id = ? WHERE id = ?`, [total, facturaId, pedidoId]);

    return { facturaId, pedido, total };
}

module.exports = { facturarPedido, normalizarPagos };
