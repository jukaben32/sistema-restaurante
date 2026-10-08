// Delivery y pedidos para llevar (mesero / administrador).
// Vista: /delivery  ·  API: /api/delivery/*
// La lógica está en services/delivery.js (la comparten los agentes de voz y WhatsApp).
// Relacionado con: views/delivery.ejs, public/js/delivery.js, services/delivery.js
const express = require('express');
const db = require('../db');
const delivery = require('../services/delivery');
const clientesService = require('../services/clientes');
const avisos = require('../services/agente/avisos');

const router = express.Router();

function usuario(req) {
    return req.session?.user?.nombre || req.session?.user?.usuario || null;
}

function baseUrl(req) {
    return `${req.protocol}://${req.get('host')}`;
}

function responderError(res, e, msg) {
    if (e && e.publico) return res.status(400).json({ error: e.message });
    if (e && e.type && String(e.type).startsWith('Stripe')) return res.status(400).json({ error: `Stripe: ${e.message}` });
    console.error(msg, e);
    return res.status(500).json({ error: msg });
}

// Ejecuta fn(connection) dentro de una transacción
async function enTransaccion(fn) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const out = await fn(connection);
        await connection.commit();
        return out;
    } catch (e) {
        await connection.rollback().catch(() => {});
        throw e;
    } finally {
        connection.release();
    }
}

router.get('/delivery', async (req, res) => {
    try {
        const [zonas, cfg] = await Promise.all([delivery.listarZonas(db, true), delivery.getConfig(db)]);
        res.render('delivery', { zonas, cfg });
    } catch (e) {
        console.error('Error al cargar delivery:', e);
        res.status(500).render('error', { error: { message: 'Error al cargar delivery', stack: '' } });
    }
});

router.get('/api/delivery', async (req, res) => {
    try {
        res.json(await delivery.listar(db));
    } catch (e) { responderError(res, e, 'Error al listar pedidos de delivery'); }
});

// Datos del cliente por teléfono (autocompletar nombre y dirección habitual)
router.get('/api/delivery/cliente', async (req, res) => {
    try {
        const c = await clientesService.buscarPorTelefono(db, req.query.telefono);
        res.json(c ? { id: c.id, nombre: c.nombre, direccion: c.direccion || '' } : null);
    } catch (e) { responderError(res, e, 'Error al buscar el cliente'); }
});

// Crear pedido desde el POS. Por defecto va directo a cocina (lo crea el personal).
router.post('/api/delivery', async (req, res) => {
    try {
        const b = req.body || {};
        const out = await enTransaccion(async (c) => {
            const r = await delivery.crearPedido(c, {
                items: b.items, tipo: b.tipo, nombre: b.nombre, telefono: b.telefono, direccion: b.direccion,
                referencia: b.referencia, zonaId: b.zona_id, metodoPago: b.metodo_pago, notas: b.notas,
                origen: 'pos', usuario: usuario(req)
            });
            if (b.confirmar !== false) await delivery.confirmar(c, r.pedido_id, usuario(req));
            return r;
        });
        res.status(201).json(out);
    } catch (e) { responderError(res, e, 'Error al crear el pedido'); }
});

// despues(id, resultado): aviso por WhatsApp al cliente (nunca bloquea ni rompe la acción)
const accion = (nombre, fn, msg, despues) => router.post(`/api/delivery/:id(\\d+)/${nombre}`, async (req, res) => {
    try {
        const out = await fn(req);
        res.json({ ok: true, ...out });
        if (despues) Promise.resolve(despues(Number(req.params.id), out)).catch(() => {});
    } catch (e) { responderError(res, e, msg); }
});

accion('confirmar', (req) => enTransaccion((c) => delivery.confirmar(c, Number(req.params.id), usuario(req))), 'Error al confirmar el pedido', (id) => avisos.pedido(id, 'confirmado'));
accion('cancelar', (req) => enTransaccion((c) => delivery.cancelar(c, Number(req.params.id), req.body?.motivo, usuario(req))), 'Error al cancelar el pedido', (id) => avisos.pedido(id, 'cancelado'));
accion('repartidor', (req) => enTransaccion((c) => delivery.asignarRepartidor(c, Number(req.params.id), req.body?.repartidor)).then(() => ({})), 'Error al asignar repartidor');
accion('en-camino', (req) => enTransaccion((c) => delivery.marcarEnCamino(c, Number(req.params.id))).then(() => ({})), 'Error al marcar en camino', (id) => avisos.pedido(id, 'en_camino'));
accion('validar-pago', (req) => enTransaccion((c) => delivery.validarTransferencia(c, Number(req.params.id))).then(() => ({})), 'Error al validar el pago');
accion('cobro-stripe', (req) => delivery.cobroStripe(Number(req.params.id), { baseUrl: baseUrl(req), usuario: usuario(req) }), 'Error al generar el enlace de pago');
accion('entregar', (req) => enTransaccion((c) => delivery.entregarYFacturar(c, Number(req.params.id), { pagos: req.body?.pagos, usuario: req.session?.user?.usuario || null })), 'Error al entregar y facturar', (id) => avisos.pedido(id, 'entregado'));

module.exports = router;
