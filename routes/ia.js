// Configuración → Asistentes IA (solo administrador): agente de voz (Vapi) y WhatsApp (Evolution API).
// Vista: /configuracion/ia  ·  API: /api/ia/*
// Las claves (VAPI_API_KEY, OPENAI_API_KEY, EVOLUTION_*) viven SOLO en el .env del servidor.
// Relacionado con: views/config_ia.ejs, public/js/config-ia.js, services/vapi.js, services/whatsapp.js
const express = require('express');
const db = require('../db');
const vapi = require('../services/vapi');
const wa = require('../services/whatsapp');
const texto = require('../services/agente/texto');
const { construirPrompt } = require('../services/agente/prompt');
const { normalizar } = require('../services/telefono');

const router = express.Router();

function responderError(res, e, msg) {
    if (e && e.publico) return res.status(400).json({ error: e.message });
    console.error(msg, e);
    return res.status(500).json({ error: msg });
}

router.get('/configuracion/ia', (req, res) => res.render('config_ia'));

router.get('/api/ia/estado', async (req, res) => {
    try {
        const cfg = await wa.leerFila();
        const [voz, whatsapp] = await Promise.all([vapi.diagnostico(), wa.estado({ conQr: req.query.qr === '1' })]);
        res.json({
            voz,
            whatsapp: {
                ...whatsapp,
                evolution_configurado: !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY),
                openai_api_key: !!process.env.OPENAI_API_KEY,
                app_url: !!process.env.APP_URL
            },
            config: {
                voz_primer_mensaje: cfg.voz_primer_mensaje || '', voz_instrucciones: cfg.voz_instrucciones || '',
                vapi_phone_number_id: cfg.vapi_phone_number_id || '', vapi_numero: cfg.vapi_numero || '',
                wa_instrucciones: cfg.wa_instrucciones || '', wa_activo: Number(cfg.wa_activo || 0), wa_avisos: Number(cfg.wa_avisos ?? 1)
            }
        });
    } catch (e) { responderError(res, e, 'Error al cargar el estado de los asistentes'); }
});

router.put('/api/ia/config', async (req, res) => {
    try {
        const b = req.body || {};
        const lim = (v, n) => String(v || '').trim().slice(0, n) || null;
        await db.query(
            `UPDATE agentes_config SET voz_primer_mensaje = ?, voz_instrucciones = ?, vapi_phone_number_id = ?, vapi_numero = ?,
                    wa_instrucciones = ?, wa_activo = ?, wa_avisos = ?, updated_at = NOW() WHERE id = 1`,
            [lim(b.voz_primer_mensaje, 500), lim(b.voz_instrucciones, 2000), lim(b.vapi_phone_number_id, 100), lim(b.vapi_numero, 30),
             lim(b.wa_instrucciones, 2000), Number(b.wa_activo) ? 1 : 0, Number(b.wa_avisos) ? 1 : 0]
        );
        texto.invalidarPrompt();
        res.json({ ok: true });
    } catch (e) { responderError(res, e, 'Error al guardar la configuración'); }
});

router.post('/api/ia/vapi/publicar', async (req, res) => {
    try {
        res.json({ ok: true, ...(await vapi.publicar()) });
    } catch (e) { responderError(res, e, 'Error al publicar en Vapi'); }
});

// Vista previa del prompt que usará cada agente (con los datos reales del restaurante)
router.get('/api/ia/prompt', async (req, res) => {
    try {
        const canal = req.query.canal === 'voz' ? 'voz' : 'texto';
        res.json({ canal, prompt: await construirPrompt(canal) });
    } catch (e) { responderError(res, e, 'Error al generar el prompt'); }
});

router.post('/api/ia/whatsapp/crear', async (req, res) => {
    try {
        res.json({ ok: true, ...(await wa.crearInstancia()) });
    } catch (e) { responderError(res, e, 'Error al crear la conexión de WhatsApp'); }
});

router.post('/api/ia/whatsapp/desconectar', async (req, res) => {
    try {
        await wa.desconectar();
        res.json({ ok: true });
    } catch (e) { responderError(res, e, 'Error al desconectar WhatsApp'); }
});

router.post('/api/ia/whatsapp/probar', async (req, res) => {
    try {
        const tel = normalizar(req.body?.telefono);
        if (!tel) return res.status(400).json({ error: 'Escribe un número válido (con código de país si no es de República Dominicana)' });
        const ok = await wa.enviarTexto(tel, '✅ Prueba de Restaurant Martin: WhatsApp está conectado correctamente.');
        if (!ok) return res.status(400).json({ error: 'No se pudo enviar. Revisa que WhatsApp esté conectado (estado "open").' });
        res.json({ ok: true });
    } catch (e) { responderError(res, e, 'Error al enviar el mensaje de prueba'); }
});

module.exports = router;
