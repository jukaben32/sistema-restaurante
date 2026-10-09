// Rutas de pagos con criptomonedas (BTCPay Server)
// - staff (/api/cripto, mesero/admin): crear, consultar y cancelar cobros
// - admin (/configuracion/cripto, admin): URL, Store ID, API key, moneda, probar conexión
// Relacionado con: services/cripto.js, public/js/cripto-cobro.js, views/configuracion_cripto.ejs
const express = require('express');
const criptoService = require('../services/cripto');

function sendError(res, error, fallback) {
    if (error && error.publico) return res.status(400).json({ error: error.message });
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
        const cfg = await criptoService.getCriptoConfig();
        res.json({ habilitado: cfg.habilitado, moneda: cfg.monedaNegocio });
    } catch (e) { sendError(res, e, 'Error al consultar la configuración de cripto'); }
});

staff.post('/cobros', async (req, res) => {
    try {
        const { monto, pedido_id, descripcion } = req.body || {};
        const cobro = await criptoService.crearCobro({
            monto,
            pedidoId: pedido_id ? Number(pedido_id) : null,
            descripcion: descripcion ? String(descripcion).slice(0, 120) : null,
            usuario: req.session?.user?.usuario || null
        });
        res.status(201).json(cobro);
    } catch (e) { sendError(res, e, 'Error al crear el cobro con cripto'); }
});

staff.get('/cobros/:id', async (req, res) => {
    try {
        res.json(cobroPublico(await criptoService.consultarCobro(Number(req.params.id))));
    } catch (e) { sendError(res, e, 'Error al consultar el cobro'); }
});

staff.post('/cobros/:id/cancelar', async (req, res) => {
    try {
        res.json(cobroPublico(await criptoService.cancelarCobro(Number(req.params.id))));
    } catch (e) { sendError(res, e, 'Error al cancelar el cobro'); }
});

// ===================== ADMIN =====================
const admin = express.Router();

admin.get('/', async (req, res) => {
    try {
        const cfg = await criptoService.getCriptoConfig();
        res.render('configuracion_cripto', {
            cfg: {
                habilitado: cfg.habilitado,
                url: cfg.url,
                storeId: cfg.storeId,
                tieneApiKey: !!cfg.apiKey,
                apiKeyMascara: cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}…${cfg.apiKey.slice(-3)}` : '',
                monedaNegocio: cfg.monedaNegocio,
                monedaCripto: cfg.monedaCripto,
                tasa: cfg.tasa || ''
            }
        });
    } catch (e) {
        console.error('Error al cargar configuración de cripto:', e);
        res.status(500).render('error', { error: { message: 'Error al cargar configuración de pagos con cripto', stack: '' } });
    }
});

admin.post('/', async (req, res) => {
    try {
        const b = req.body || {};
        const url = String(b.url || '').trim().replace(/\/+$/, '');
        const storeId = String(b.storeId || '').trim();
        const apiKey = String(b.apiKey || '').trim();
        const monedaCripto = String(b.monedaCripto || 'dop').trim().toLowerCase();
        const tasa = Number(b.tasa || 0);
        if (url && !/^https?:\/\/[^\s/]+/.test(url)) return res.status(400).json({ error: 'La URL de BTCPay debe empezar con https:// (o http:// en pruebas locales)' });
        if (storeId && !/^[A-Za-z0-9]{10,60}$/.test(storeId)) return res.status(400).json({ error: 'El Store ID solo lleva letras y números (cópialo de BTCPay → Settings → General)' });
        if (apiKey && !/^[A-Za-z0-9._-]{16,200}$/.test(apiKey)) return res.status(400).json({ error: 'La API key no parece válida (cópiala completa desde BTCPay)' });
        if (!/^[a-z]{3}$/.test(monedaCripto)) return res.status(400).json({ error: 'Moneda inválida (código de 3 letras, ej: dop, usd)' });
        if (!Number.isFinite(tasa) || tasa < 0) return res.status(400).json({ error: 'Tasa de cambio inválida' });

        await criptoService.saveCriptoConfig({
            habilitado: String(b.habilitado) === '1' || b.habilitado === true,
            url, storeId, apiKey, monedaCripto, tasa
        });
        const cfg = await criptoService.getCriptoConfig();
        res.json({ ok: true, habilitado: cfg.habilitado });
    } catch (e) { sendError(res, e, 'Error al guardar la configuración de cripto'); }
});

admin.post('/probar', async (req, res) => {
    try {
        res.json(await criptoService.probarConexion());
    } catch (e) { sendError(res, e, 'No se pudo conectar con BTCPay'); }
});

module.exports = { staff, admin };
