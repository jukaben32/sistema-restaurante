// Datos de demostración: estado y botón "Quitar" (solo administrador).
// Relacionado con: services/datosDemo.js, public/js/demo-aviso.js, views/configuracion.ejs
const express = require('express');
const db = require('../db');
const demo = require('../services/datosDemo');

const router = express.Router();

router.get('/api/demo/estado', async (req, res) => {
    try { res.json(await demo.estado(db)); } catch (e) { console.error('Error al consultar datos de demostración:', e); res.status(500).json({ error: 'Error al consultar el estado' }); }
});

router.post('/api/demo/quitar', async (req, res) => {
    if (String(req.body?.confirmar || '').trim().toUpperCase() !== 'QUITAR') return res.status(400).json({ error: 'Escribe QUITAR para confirmar' });
    try { res.json(await demo.quitar(db)); } catch (e) { console.error('Error al quitar datos de demostración:', e); res.status(500).json({ error: 'No se pudieron quitar los datos de demostración' }); }
});

module.exports = router;
