// Rutas de Stripe
// - staff  (/api/stripe, mesero/admin): crear, consultar y cancelar cobros
// - admin  (/configuracion/stripe, admin): llaves, moneda, probar conexión
// - publico: webhook firmado (/stripe/webhook) y página de retorno (/pago/estado)
// Relacionado con: services/stripe.js, public/js/stripe-cobro.js, views/configuracion_stripe.ejs
const express = require('express');
const stripeService = require('../services/stripe');

function baseUrlFrom(req) {
    return `${req.protocol}://${req.get('host')}`;
}

function sendError(res, error, fallback) {
    if (error && error.publico) return res.status(400).json({ error: error.message });
    // Errores de Stripe (llave inválida, monto mínimo, etc.) traen un mensaje útil
    if (error && error.type && String(error.type).startsWith('Stripe')) {
        return res.status(400).json({ error: `Stripe: ${error.message}` });
    }
    console.error(fallback, error);
    return res.status(500).json({ error: fallback });
}

function cobroPublico(p) {
    if (!p) return null;
    return { id: p.id, estado: p.estado, monto: Number(p.monto), moneda: p.moneda, pedido_id: p.pedido_id, factura_id: p.factura_id };
}

// ===================== STAFF =====================
const staff = express.Router();

staff.get('/estado', async (req, res) => {
    try {
        const cfg = await stripeService.getStripeConfig();
        res.json({ habilitado: cfg.habilitado, moneda: cfg.moneda, modoPrueba: cfg.modoPrueba });
    } catch (e) { sendError(res, e, 'Error al consultar Stripe'); }
});

staff.post('/cobros', async (req, res) => {
    try {
        const { monto, pedido_id, descripcion } = req.body || {};
        const cobro = await stripeService.crearCobro({
            monto,
            pedidoId: pedido_id ? Number(pedido_id) : null,
            descripcion: descripcion ? String(descripcion).slice(0, 120) : null,
            baseUrl: baseUrlFrom(req),
            usuario: req.session?.user?.usuario || null
        });
        res.status(201).json(cobro);
    } catch (e) { sendError(res, e, 'Error al crear el cobro con Stripe'); }
});

staff.get('/cobros/:id', async (req, res) => {
    try {
        res.json(cobroPublico(await stripeService.consultarCobro(Number(req.params.id))));
    } catch (e) { sendError(res, e, 'Error al consultar el cobro'); }
});

staff.post('/cobros/:id/cancelar', async (req, res) => {
    try {
        res.json(cobroPublico(await stripeService.cancelarCobro(Number(req.params.id))));
    } catch (e) { sendError(res, e, 'Error al cancelar el cobro'); }
});

// ===================== ADMIN =====================
const admin = express.Router();

admin.get('/', async (req, res) => {
    try {
        const cfg = await stripeService.getStripeConfig();
        res.render('configuracion_stripe', {
            cfg: {
                habilitado: cfg.habilitado,
                publishableKey: cfg.publishableKey || '',
                tieneSecretKey: !!cfg.secretKey,
                secretKeyMascara: cfg.secretKey ? `${cfg.secretKey.slice(0, 8)}…${cfg.secretKey.slice(-4)}` : '',
                tieneWebhookSecret: !!cfg.webhookSecret,
                moneda: cfg.moneda,
                appUrlPublica: cfg.appUrlPublica || '',
                modoPrueba: cfg.modoPrueba
            },
            webhookUrl: `${(cfg.appUrlPublica || baseUrlFrom(req)).replace(/\/+$/, '')}/stripe/webhook`
        });
    } catch (e) {
        console.error('Error al cargar configuración de Stripe:', e);
        res.status(500).render('error', { error: { message: 'Error al cargar configuración de Stripe', stack: '' } });
    }
});

admin.post('/', async (req, res) => {
    try {
        const b = req.body || {};
        const publishableKey = String(b.publishableKey || '').trim();
        const secretKey = String(b.secretKey || '').trim();
        const webhookSecret = String(b.webhookSecret || '').trim();
        const moneda = String(b.moneda || 'dop').trim().toLowerCase();
        const appUrlPublica = String(b.appUrlPublica || '').trim().replace(/\/+$/, '');

        if (publishableKey && !/^pk_(test|live)_/.test(publishableKey)) return res.status(400).json({ error: 'La llave publicable debe empezar con pk_test_ o pk_live_' });
        if (secretKey && !/^(sk|rk)_(test|live)_/.test(secretKey)) return res.status(400).json({ error: 'La llave secreta debe empezar con sk_test_ o sk_live_' });
        if (webhookSecret && !/^whsec_/.test(webhookSecret)) return res.status(400).json({ error: 'El webhook secret debe empezar con whsec_' });
        if (!/^[a-z]{3}$/.test(moneda)) return res.status(400).json({ error: 'Moneda inválida (código ISO de 3 letras, ej: usd, dop, cop)' });
        if (appUrlPublica && !/^https?:\/\//.test(appUrlPublica)) return res.status(400).json({ error: 'La URL pública debe empezar con http:// o https://' });

        await stripeService.saveStripeConfig({
            habilitado: String(b.habilitado) === '1' || b.habilitado === true,
            publishableKey, secretKey, webhookSecret, moneda, appUrlPublica
        });
        const cfg = await stripeService.getStripeConfig();
        res.json({ ok: true, habilitado: cfg.habilitado, modoPrueba: cfg.modoPrueba });
    } catch (e) { sendError(res, e, 'Error al guardar configuración de Stripe'); }
});

admin.post('/probar', async (req, res) => {
    try {
        res.json(await stripeService.probarConexion());
    } catch (e) { sendError(res, e, 'No se pudo conectar con Stripe'); }
});

// ===================== PÚBLICO =====================
const publico = express.Router();

// Webhook: necesita el body crudo para verificar la firma (se monta antes de express.json en server.js)
publico.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).json({ error: 'Missing signature' });
    try {
        const tipo = await stripeService.procesarWebhook(req.body, signature);
        res.json({ received: true, type: tipo });
    } catch (e) {
        console.error('Webhook de Stripe rechazado:', e.message);
        res.status(400).json({ error: `Webhook signature verification failed: ${e.message}` });
    }
});

// Página a la que vuelve el cliente después de pagar en su celular
publico.get('/pago/estado', async (req, res) => {
    const sessionId = String(req.query.session_id || '');
    let pago = null;
    try {
        if (/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) pago = await stripeService.estadoPublicoSesion(sessionId);
    } catch (_) { /* página informativa: no rompemos */ }
    let negocio = 'Restaurant Martin';
    try { negocio = (await stripeService.getStripeConfig()).nombreNegocio || negocio; } catch (_) { /* noop */ }
    res.render('pago_estado', {
        negocio,
        cancelado: String(req.query.cancelado || '') === '1',
        pago: pago ? { estado: pago.estado, monto: Number(pago.monto), moneda: String(pago.moneda || '').toUpperCase() } : null
    });
});

module.exports = { staff, admin, publico };
