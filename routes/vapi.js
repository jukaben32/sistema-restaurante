// Webhook público de Vapi (agente de voz): POST /api/vapi/webhook
// - tool-calls:        ejecuta las herramientas del restaurante (services/agente/ejecutor.js)
// - status-update:     abre / cierra la conversación de la llamada
// - end-of-call-report: guarda resumen, transcripción, duración, costo y grabación
// Patrón de CRM.Agentevoz/app/api/vapi/webhook/route.ts. Seguridad: token Bearer (o X-Vapi-Secret)
// comparado en tiempo constante; sin token configurado, en producción se rechaza todo.
// Relacionado con: services/vapi.js, services/agente/*, views/conversaciones.ejs
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const ejecutor = require('../services/agente/ejecutor');
const conversaciones = require('../services/agente/conversaciones');
const notificaciones = require('../services/agente/notificaciones');
const delivery = require('../services/delivery');
const { normalizar } = require('../services/telefono');

const router = express.Router();

function autorizado(req) {
    const token = process.env.VAPI_WEBHOOK_TOKEN;
    if (!token) return process.env.NODE_ENV !== 'production'; // en producción, sin token no se acepta nada
    const auth = String(req.headers.authorization || '');
    const dado = auth.startsWith('Bearer ') ? auth.slice(7).trim() : String(req.headers['x-vapi-secret'] || '').trim();
    if (!dado) return false;
    const a = crypto.createHash('sha256').update(token).digest();
    const b = crypto.createHash('sha256').update(dado).digest();
    return crypto.timingSafeEqual(a, b);
}

/** Nombre y argumentos de una llamada a herramienta (Vapi usa varias formas). */
function detallesHerramienta(tc) {
    const nombre = tc.function?.name ?? tc.name ?? null;
    let args = tc.function?.arguments ?? tc.parameters ?? tc.arguments ?? {};
    if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch (_) { args = {}; }
    }
    return { nombre, args };
}

function listaHerramientas(message) {
    if (Array.isArray(message.toolCallList) && message.toolCallList.length) return message.toolCallList;
    if (Array.isArray(message.toolWithToolCallList)) return message.toolWithToolCallList.map((x) => x.toolCall).filter(Boolean);
    return [];
}

function baseUrl() {
    return String(process.env.APP_URL || '').replace(/\/+$/, '');
}

async function alTerminar(message, call) {
    const telefono = call.customer?.number;
    const conv = await conversaciones.obtenerOCrearVoz({ externalId: call.id, telefono });
    const artifact = message.artifact || {};
    const resumen = message.analysis?.summary || artifact.summary || null;
    const inicio = message.startedAt ? new Date(message.startedAt) : null;
    const fin = message.endedAt ? new Date(message.endedAt) : null;
    const duracion = Math.round(message.durationSeconds ?? (inicio && fin ? (fin - inicio) / 1000 : 0)) || null;
    const costo = Number(message.cost ?? call.cost ?? 0) || null;
    const grabacion = artifact.recordingUrl || artifact.recording?.mono?.combinedUrl || call.recordingUrl || null;

    await db.query(
        `UPDATE agente_conversaciones
         SET estado = 'finalizada', finalizada_at = NOW(), resumen = ?, duracion_seg = ?, costo = ?, grabacion_url = ?, motivo_fin = ?
         WHERE id = ?`,
        [resumen, duracion, costo, grabacion, String(message.endedReason || call.endedReason || '').slice(0, 100) || null, conv.id]
    );

    // Transcripción turno a turno (se reemplaza si el informe llega dos veces)
    const turnos = (artifact.messages || [])
        .map((m) => ({ rol: ['bot', 'assistant'].includes(m.role) ? 'agente' : m.role === 'user' ? 'cliente' : null, texto: String(m.message ?? m.content ?? '').trim() }))
        .filter((m) => m.rol && m.texto);
    if (turnos.length) {
        await db.query(`DELETE FROM agente_mensajes WHERE conversacion_id = ? AND rol IN ('agente','cliente')`, [conv.id]);
        for (const t of turnos) await conversaciones.agregarMensaje(conv.id, t.rol, t.texto);
    }

    // Si la llamada generó un pedido, el cliente recibe la confirmación por WhatsApp
    const [c] = await db.query('SELECT pedido_id, telefono FROM agente_conversaciones WHERE id = ?', [conv.id]);
    if (c[0] && c[0].pedido_id && normalizar(c[0].telefono)) {
        const [p] = await db.query('SELECT id, tipo, total FROM pedidos WHERE id = ?', [c[0].pedido_id]);
        if (p[0]) {
            const cfg = await delivery.getConfig(db);
            const texto = `¡Gracias por tu pedido ${delivery.codigoPedido(p[0].id, p[0].tipo)}! Total: ${Number(p[0].total).toLocaleString('es-DO')} ${cfg.moneda.toUpperCase()}. `
                + 'El restaurante lo confirmará en unos minutos y te avisaremos por aquí. / Thank you for your order! We will confirm it shortly.';
            await notificaciones.enviarTexto(c[0].telefono, texto);
        }
    }
}

router.post('/api/vapi/webhook', async (req, res) => {
    if (!autorizado(req)) return res.status(401).json({ error: 'No autorizado' });
    const body = req.body || {};
    const message = body.message || body;
    const tipo = message.type;
    const call = message.call || {};

    try {
        if (tipo === 'tool-calls') {
            const telefono = call.customer?.number || null;
            const conv = call.id ? await conversaciones.obtenerOCrearVoz({ externalId: call.id, telefono }) : null;
            const ctx = { canal: 'voz', telefono, conversacionId: conv ? conv.id : null, baseUrl: baseUrl() };
            const results = [];
            for (const tc of listaHerramientas(message)) {
                const { nombre, args } = detallesHerramienta(tc);
                const r = nombre ? await ejecutor.ejecutar(nombre, args, ctx) : { error: 'Herramienta no especificada' };
                results.push({ toolCallId: tc.id, result: JSON.stringify(r) });
            }
            return res.json({ results });
        }

        if (tipo === 'status-update') {
            if (call.id) {
                const conv = await conversaciones.obtenerOCrearVoz({ externalId: call.id, telefono: call.customer?.number });
                if (message.status === 'ended') {
                    await db.query(`UPDATE agente_conversaciones SET estado = 'finalizada', finalizada_at = COALESCE(finalizada_at, NOW()) WHERE id = ?`, [conv.id]);
                }
            }
            return res.json({ ok: true });
        }

        if (tipo === 'end-of-call-report' && call.id) {
            await alTerminar(message, call);
            return res.json({ ok: true });
        }
    } catch (e) {
        console.error('Error en el webhook de Vapi:', e);
        // Vapi reintenta si respondemos error; para tool-calls devolvemos un mensaje usable
        if (tipo === 'tool-calls') {
            const fallo = JSON.stringify({ error: 'No pude completar la operación en este momento. Ofrece que el equipo le ayude.' });
            return res.json({ results: listaHerramientas(message).map((tc) => ({ toolCallId: tc.id, result: fallo })) });
        }
        return res.status(500).json({ error: 'Error interno' });
    }
    res.json({ ok: true });
});

module.exports = router;
module.exports.autorizado = autorizado;
