// Configuración del pie de página (solo administrador): /configuracion/redes
// Relacionado con: services/pie.js, views/configuracion_pie.ejs, views/partials/footer.ejs
const express = require('express');
const pie = require('../services/pie');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        pie.limpiarCache();
        res.render('configuracion_pie', { datos: await pie.obtener(), ejemplos: Object.fromEntries(pie.REDES.map((r) => [r[0], r[3]])) });
    } catch (e) {
        console.error('Error al cargar redes y pie de página:', e);
        res.status(500).render('error', { error: { message: 'Error al cargar la configuración', stack: '' } });
    }
});

router.post('/', async (req, res) => {
    try {
        const r = await pie.guardar(req.body || {});
        if (r.error) return res.status(400).json({ error: r.error });
        res.json({ ok: true });
    } catch (e) {
        console.error('Error al guardar redes y pie de página:', e);
        res.status(500).json({ error: 'No se pudo guardar' });
    }
});

module.exports = router;
