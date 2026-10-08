// Guía de uso dentro del programa (todos los roles con sesión): /ayuda
// - muestra las secciones de tu rol (y las generales), con buscador y botón para ver toda la guía
// - /ayuda/guia.md descarga el archivo original para compartirlo o editarlo
// Relacionado con: services/ayuda.js, views/ayuda.ejs, ayuda/GUIA-DE-USO.md
const express = require('express');
const ayuda = require('../services/ayuda');

const router = express.Router();

router.get('/ayuda', (req, res) => {
    try {
        const rol = String(req.session?.user?.rol || '').toLowerCase();
        const g = ayuda.contenido();
        res.render('ayuda', {
            guia: g,
            rol,
            // Por defecto: lo de tu rol; ?todo=1 muestra toda la guía
            verTodo: String(req.query.todo || '') === '1',
            aplica: (s) => ayuda.aplica(s, rol)
        });
    } catch (e) {
        console.error('Error al cargar la guía de uso:', e);
        res.status(500).render('error', { error: { message: 'No se pudo cargar la guía de uso', stack: '' } });
    }
});

router.get('/ayuda/guia.md', (req, res) => {
    res.download(ayuda.rutaArchivo(), 'Guia-de-uso-Restaurant-Martin.md', (err) => {
        if (err && !res.headersSent) res.status(404).send('Archivo no encontrado');
    });
});

module.exports = router;
