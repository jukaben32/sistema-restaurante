// Mantenimiento periódico: GET|POST /api/cron/mantenimiento
// Reemplaza a los temporizadores internos cuando la app corre en Vercel (serverless no tiene procesos
// de larga vida). Lo invoca Vercel Cron o un "pinger" externo cada ~10 minutos.
// - envía los recordatorios de reservas (2 h antes) por WhatsApp
// - limpia sesiones vencidas e ids de WhatsApp antiguos
// Seguridad: exige CRON_SECRET en la cabecera Authorization: Bearer <secreto> (Vercel Cron la envía sola)
// o en ?secret=<secreto> (para pingers externos). Sin CRON_SECRET configurado, se rechaza.
// Relacionado con: services/agente/avisos.js, vercel.json
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const avisos = require('../services/agente/avisos');

const router = express.Router();

function autorizado(req) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) return false;
    const auth = String(req.headers.authorization || '');
    const dado = auth.startsWith('Bearer ') ? auth.slice(7).trim() : String(req.query.secret || '').trim();
    if (!dado) return false;
    const a = crypto.createHash('sha256').update(esperado).digest();
    const b = crypto.createHash('sha256').update(dado).digest();
    return crypto.timingSafeEqual(a, b);
}

async function mantenimiento(req, res) {
    if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'Define CRON_SECRET en las variables de entorno' });
    if (!autorizado(req)) return res.status(401).json({ error: 'No autorizado' });
    try {
        const recordatorios = await avisos.enviarRecordatorios();
        const [s] = await db.query('DELETE FROM user_sessions WHERE expire < NOW()');
        const [w] = await db.query(`DELETE FROM wa_ids WHERE created_at < NOW() - interval '2 days'`);
        res.json({ ok: true, recordatorios, sesiones_borradas: s.affectedRows, ids_borrados: w.affectedRows });
    } catch (e) {
        console.error('Error en el mantenimiento programado:', e);
        res.status(500).json({ error: 'Error en el mantenimiento' });
    }
}

router.get('/api/cron/mantenimiento', mantenimiento);
router.post('/api/cron/mantenimiento', mantenimiento);

module.exports = router;
