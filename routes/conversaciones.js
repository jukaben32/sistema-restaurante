// Bandeja de conversaciones de los asistentes (mesero / administrador): llamadas y chats de WhatsApp.
// El personal puede leer, tomar una conversación (pausa el bot) y responder por WhatsApp desde el POS.
// Vista: /conversaciones  ·  API: /api/conversaciones/*
// Relacionado con: views/conversaciones.ejs, public/js/conversaciones.js, services/agente/conversaciones.js
const express = require('express');
const db = require('../db');
const wa = require('../services/whatsapp');
const conversaciones = require('../services/agente/conversaciones');
const delivery = require('../services/delivery');

const router = express.Router();

router.get('/conversaciones', (req, res) => res.render('conversaciones'));

router.get('/api/conversaciones', async (req, res) => {
    try {
        const filtro = String(req.query.filtro || 'todas');
        const cond = [];
        if (filtro === 'humano') cond.push('c.necesita_humano = 1');
        if (filtro === 'whatsapp') cond.push(`c.canal = 'whatsapp'`);
        if (filtro === 'voz') cond.push(`c.canal = 'voz'`);
        const [rows] = await db.query(
            `SELECT c.id, c.canal, c.telefono, COALESCE(c.nombre, cl.nombre) AS nombre, c.estado, c.bot_pausado, c.necesita_humano,
                    c.resumen, c.duracion_seg, c.ultimo_mensaje_at, c.pedido_id, p.tipo AS pedido_tipo,
                    (SELECT m.contenido FROM agente_mensajes m WHERE m.conversacion_id = c.id AND m.rol <> 'herramienta' ORDER BY m.id DESC LIMIT 1) AS ultimo
             FROM agente_conversaciones c
             LEFT JOIN clientes cl ON cl.id = c.cliente_id
             LEFT JOIN pedidos p ON p.id = c.pedido_id
             ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
             ORDER BY c.necesita_humano DESC, c.ultimo_mensaje_at DESC
             LIMIT 100`
        );
        res.json(rows.map((r) => ({ ...r, pedido_codigo: r.pedido_id ? delivery.codigoPedido(r.pedido_id, r.pedido_tipo) : null })));
    } catch (e) {
        console.error('Error al listar conversaciones:', e);
        res.status(500).json({ error: 'Error al cargar las conversaciones' });
    }
});

router.get('/api/conversaciones/:id(\\d+)', async (req, res) => {
    try {
        const [c] = await db.query(
            `SELECT c.*, COALESCE(c.nombre, cl.nombre) AS nombre_mostrar FROM agente_conversaciones c LEFT JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = ?`,
            [req.params.id]
        );
        if (!c[0]) return res.status(404).json({ error: 'Conversación no encontrada' });
        const [mensajes] = await db.query(
            `SELECT id, rol, contenido, herramienta, created_at FROM agente_mensajes WHERE conversacion_id = ? ORDER BY id ASC LIMIT 500`,
            [req.params.id]
        );
        // Las herramientas se muestran como eventos cortos (qué hizo el asistente), sin el JSON completo
        const lista = mensajes.map((m) => m.rol === 'herramienta' ? { ...m, contenido: m.herramienta } : m);
        res.json({ conversacion: { ...c[0], pedido_codigo: null }, mensajes: lista });
    } catch (e) {
        console.error('Error al leer la conversación:', e);
        res.status(500).json({ error: 'Error al cargar la conversación' });
    }
});

// El personal responde por WhatsApp desde el POS (el bot queda pausado en esa conversación)
router.post('/api/conversaciones/:id(\\d+)/responder', async (req, res) => {
    try {
        const t = String(req.body?.texto || '').trim().slice(0, 2000);
        if (!t) return res.status(400).json({ error: 'Escribe un mensaje' });
        const [c] = await db.query('SELECT id, canal, telefono FROM agente_conversaciones WHERE id = ?', [req.params.id]);
        if (!c[0]) return res.status(404).json({ error: 'Conversación no encontrada' });
        if (c[0].canal !== 'whatsapp') return res.status(400).json({ error: 'Solo se puede responder por WhatsApp; las llamadas ya terminaron' });
        const ok = await wa.enviarTexto(c[0].telefono, t);
        if (!ok) return res.status(400).json({ error: 'No se pudo enviar. Revisa que WhatsApp esté conectado (Configuración → Asistentes IA).' });
        await conversaciones.agregarMensaje(c[0].id, 'personal', t);
        await db.query('UPDATE agente_conversaciones SET bot_pausado = 1 WHERE id = ?', [c[0].id]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Error al responder la conversación:', e);
        res.status(500).json({ error: 'Error al enviar el mensaje' });
    }
});

router.post('/api/conversaciones/:id(\\d+)/pausa', async (req, res) => {
    try {
        await db.query('UPDATE agente_conversaciones SET bot_pausado = ? WHERE id = ?', [req.body?.pausado ? 1 : 0, req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Error al cambiar el estado del asistente' }); }
});

router.post('/api/conversaciones/:id(\\d+)/resuelto', async (req, res) => {
    try {
        await db.query('UPDATE agente_conversaciones SET necesita_humano = 0 WHERE id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'Error al marcar como resuelta' }); }
});

module.exports = router;
