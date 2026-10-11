// Compras y gastos (solo administrador): proveedores y facturas de compra con los campos del formato 606.
// Relacionado con: services/fiscal/compras.js, services/fiscal/reportes.js, views/compras.ejs, public/js/compras.js
const express = require('express');
const compras = require('../services/fiscal/compras');
const lector = require('../services/fiscal/lectorFactura');
const db = require('../db');

const router = express.Router();
const usuario = (req) => (req.session && req.session.user && req.session.user.usuario) || null;
const ah = (fn, msg) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
        if (e && e.publico) return res.status(400).json({ error: e.message });
        console.error(msg, e);
        res.status(500).json({ error: msg });
    }
};

router.get('/compras', ah(async (req, res) => { res.render('compras'); }, 'Error al cargar compras'));

router.get('/api/compras/catalogos', ah(async (req, res) => {
    const [insumos] = await db.query('SELECT id, nombre, unidad FROM insumos ORDER BY nombre');
    res.json({ tipos: compras.TIPOS_BIENES, formas: compras.FORMAS_PAGO, proveedores: await compras.listarProveedores(), insumos });
}, 'No se pudieron leer los catálogos'));

router.get('/api/compras/proveedores', ah(async (req, res) => { res.json(await compras.listarProveedores()); }, 'No se pudieron leer los proveedores'));
router.post('/api/compras/proveedores', ah(async (req, res) => { res.status(201).json(await compras.guardarProveedor(req.body || {})); }, 'No se pudo guardar el proveedor'));
router.put('/api/compras/proveedores/:id(\\d+)', ah(async (req, res) => { res.json(await compras.guardarProveedor({ ...(req.body || {}), id: Number(req.params.id) })); }, 'No se pudo guardar el proveedor'));

router.post('/api/compras/leer-foto', ah(async (req, res) => {
    res.json(await lector.leerFactura(req.body && req.body.imagen, { proveedores: await compras.listarProveedores() }));
}, 'No se pudo leer la factura'));

router.get('/api/compras/:id(\\d+)/foto', ah(async (req, res) => {
    const a = await compras.obtenerAdjunto(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Esta compra no tiene foto archivada' });
    res.set({ 'Content-Type': a.mime, 'Cache-Control': 'private, max-age=3600' });
    res.send(a.datos);
}, 'No se pudo leer la foto'));

router.get('/api/compras', ah(async (req, res) => {
    const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? String(req.query.mes) : null;
    res.json({ compras: await compras.listarCompras(mes) });
}, 'No se pudieron leer las compras'));
router.post('/api/compras', ah(async (req, res) => { res.status(201).json(await compras.crearCompra(req.body || {}, usuario(req))); }, 'No se pudo guardar la compra'));
router.delete('/api/compras/:id(\\d+)', ah(async (req, res) => { await compras.eliminarCompra(Number(req.params.id)); res.json({ ok: true }); }, 'No se pudo borrar la compra'));

module.exports = router;
