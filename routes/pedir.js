// App para clientes (instalable): menú, pedidos de delivery / para llevar, pago en línea y seguimiento.
// - publico: /pedir, /pedir/pedido/:token, /pedir/manifest.webmanifest y /api/pedir/*
// - admin: /configuracion/app-clientes (enlace, QR para campañas e interruptor)
// Relacionado con: services/appClientes.js, views/pedir.ejs, public/js/pedir.js, views/configuracion_app.ejs
const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const app = require('../services/appClientes');

function enviarError(res, e, fallback) {
    if (e && e.publico) return res.status(e.status || 400).json({ error: e.message });
    console.error(fallback, e);
    return res.status(500).json({ error: fallback });
}

// ===================== PÚBLICO =====================
const publico = express.Router();

async function vista(req, res, token) {
    try {
        const cfg = await app.configApp();
        res.render('pedir', { negocio: cfg, token: token || null });
    } catch (e) {
        console.error('Error al cargar la app de pedidos:', e);
        res.status(500).render('error', { error: { message: 'No se pudo cargar la app', stack: '' } });
    }
}

publico.get('/pedir', (req, res) => vista(req, res, null));
publico.get('/pedir/pedido/:token', (req, res) => vista(req, res, String(req.params.token || '').slice(0, 40)));

// Manifiesto propio de la app de clientes: al instalarla abre directo en /pedir (no en el login del personal)
publico.get('/pedir/manifest.webmanifest', async (req, res) => {
    let nombre = 'Restaurant Martin';
    try { nombre = (await app.configApp()).nombre || nombre; } catch (_) { /* nombre por defecto */ }
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
        id: '/pedir',
        name: nombre,
        short_name: nombre.length > 14 ? nombre.slice(0, 14) : nombre,
        description: `Pide a domicilio o para recoger en ${nombre}`,
        lang: 'es',
        start_url: '/pedir?origen=app',
        scope: '/pedir',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf8f5',
        theme_color: '#c2410c',
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
    });
});

publico.get('/api/pedir/catalogo', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        res.json(await app.catalogo());
    } catch (e) { enviarError(res, e, 'No se pudo cargar el menú'); }
});

publico.post('/api/pedir/pedido', async (req, res) => {
    try {
        res.status(201).json(await app.crearPedido(req.body || {}, req));
    } catch (e) { enviarError(res, e, 'No se pudo enviar el pedido'); }
});

publico.get('/api/pedir/pedido/:token', async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        const s = await app.seguimiento(req.params.token);
        if (!s) return res.status(404).json({ error: 'Pedido no encontrado' });
        res.json(s);
    } catch (e) { enviarError(res, e, 'No se pudo consultar el pedido'); }
});

publico.post('/api/pedir/pedido/:token/cancelar', async (req, res) => {
    try { res.json(await app.cancelarPorCliente(req.params.token)); } catch (e) { enviarError(res, e, 'No se pudo cancelar el pedido'); }
});

// ===================== ADMIN =====================
const admin = express.Router();

admin.get('/', async (req, res) => {
    try {
        const cfg = await app.configApp();
        const base = app.baseUrl(req, null);
        const enlace = `${base}/pedir`;
        const formas = await app.formasDePago(cfg);
        res.render('configuracion_app', {
            activa: cfg.activa,
            enlace,
            qr: await QRCode.toDataURL(`${enlace}?utm_source=qr`, { margin: 2, width: 640 }),
            formas,
            zonas: (await db.query('SELECT COUNT(*) AS n FROM delivery_zonas WHERE activa = 1'))[0][0].n,
            platosDelDia: (await db.query('SELECT COUNT(*) AS n FROM productos WHERE plato_del_dia = 1 AND en_menu = 1'))[0][0].n,
            productos: (await db.query('SELECT COUNT(*) AS n FROM productos WHERE en_menu = 1 AND precio_unidad > 0'))[0][0].n
        });
    } catch (e) {
        console.error('Error al cargar la configuración de la app de clientes:', e);
        res.status(500).render('error', { error: { message: 'Error al cargar la configuración', stack: '' } });
    }
});

admin.post('/', async (req, res) => {
    try {
        const activa = String(req.body?.activa) === '1' || req.body?.activa === true ? 1 : 0;
        await db.query('UPDATE configuracion_impresion SET app_pedidos_activa = ? WHERE id = (SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1)', [activa]);
        res.json({ ok: true, activa: !!activa });
    } catch (e) { enviarError(res, e, 'No se pudo guardar'); }
});

module.exports = { publico, admin };
