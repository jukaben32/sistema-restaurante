// Configuración de las alertas por demora (solo administrador): /configuracion/alertas
// Relacionado con: services/alertas.js, views/configuracion_alertas.ejs
const express = require('express');
const alertas = require('../services/alertas');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        alertas.limpiarCache();
        res.render('configuracion_alertas', { a: await alertas.obtener() });
    } catch (e) {
        console.error('Error al cargar las alertas de tiempo:', e);
        res.status(500).render('error', { error: { message: 'Error al cargar la configuración', stack: '' } });
    }
});

router.post('/', async (req, res) => {
    try {
        const r = await alertas.guardar(req.body || {});
        if (r.error) return res.status(400).json({ error: r.error });
        res.json({ ok: true });
    } catch (e) {
        console.error('Error al guardar las alertas de tiempo:', e);
        res.status(500).json({ error: 'No se pudo guardar' });
    }
});

module.exports = router;
