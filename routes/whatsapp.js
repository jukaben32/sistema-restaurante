// Webhook público de WhatsApp (Evolution API): POST /api/whatsapp/webhook/:secreto
// Evolution no firma sus webhooks, así que el secreto aleatorio de la URL (guardado cifrado) es la
// barrera de confianza. Se responde 200 de inmediato y el mensaje se procesa en segundo plano
// (así Evolution no reintenta y no se duplican respuestas). En Vercel el trabajo sigue con waitUntil.
// Todo el estado vive en la base de datos (ids vistos/enviados, ritmo, candado por cliente) para que
// funcione igual con varias instancias o en serverless.
// Patrón de Real-Estate-Multi-AI-Agent-SaaS/src/app/api/whatsapp/webhook/[businessId]/route.ts.
// Relacionado con: services/whatsapp.js, services/agente/texto.js, services/segundoPlano.js, routes/conversaciones.js
const express = require('express');
const db = require('../db');
const wa = require('../services/whatsapp');
const texto = require('../services/agente/texto');
const conversaciones = require('../services/agente/conversaciones');
const { enSegundoPlano, conCandado } = require('../services/segundoPlano');
const { normalizar, ultimos10 } = require('../services/telefono');

const router = express.Router();

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// Pausa "humana" antes de responder: una respuesta instantánea es señal fácil de automatización
function pausa() {
    const min = Number(process.env.WA_PAUSA_MIN_MS ?? 2000);
    const max = Number(process.env.WA_PAUSA_MAX_MS ?? 5000);
    return max <= 0 ? 0 : min + Math.random() * Math.max(0, max - min);
}

/** Freno anti-bucle / abuso: más de 25 mensajes en 10 minutos de un mismo número se ignoran. */
async function demasiados(tel) {
    const [r] = await db.query(
        `SELECT COUNT(*) AS n FROM agente_mensajes m JOIN agente_conversaciones c ON c.id = m.conversacion_id
         WHERE c.canal = 'whatsapp' AND c.telefono = ? AND m.rol = 'cliente' AND m.created_at > NOW() - interval '10 minutes'`,
        [tel]
    );
    return Number(r[0].n) >= 25;
}

function extraerTexto(data) {
    const m = data.message || {};
    return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption
        || m.buttonsResponseMessage?.selectedDisplayText || m.listResponseMessage?.title || null;
}

function tipoMedia(data) {
    const m = data.message || {};
    if (m.imageMessage) return 'imagen';
    if (m.audioMessage) return 'audio';
    if (m.documentMessage) return 'documento';
    if (m.videoMessage) return 'video';
    if (m.stickerMessage) return 'sticker';
    return null;
}

/** Teléfono del cliente y a dónde responder (soporta JID de teléfono y los nuevos @lid). */
function remitente(data) {
    const key = data.key || {};
    const jid = String(key.remoteJid || '');
    for (const c of [key.senderPn, key.remoteJidAlt, data.senderPn]) {
        if (c && /^\d+(@s\.whatsapp\.net)?$/.test(String(c))) {
            const tel = normalizar(String(c).split('@')[0]);
            if (tel) return { tel, destino: tel };
        }
    }
    if (jid.endsWith('@s.whatsapp.net')) {
        const tel = normalizar(jid.split('@')[0]);
        return tel ? { tel, destino: tel } : null;
    }
    if (jid.endsWith('@lid')) return { tel: jid.split('@')[0], destino: jid };
    return null;
}

async function manejarMedia(conv, rem, tipo) {
    if (tipo === 'imagen') {
        // ¿Es el comprobante de una transferencia pendiente de este cliente?
        const [rows] = await db.query(
            `SELECT id, tipo FROM pedidos
             WHERE tipo IN ('delivery','para_llevar') AND metodo_pago_previsto = 'transferencia' AND pago_validado = 0
               AND estado_delivery IN ('por_confirmar','en_cocina','en_camino')
               AND right(regexp_replace(COALESCE(cliente_telefono, ''), '\\D', '', 'g'), 10) = ?
             ORDER BY id DESC LIMIT 1`,
            [ultimos10(rem.tel)]
        );
        if (rows[0]) {
            const codigo = `${rows[0].tipo === 'delivery' ? 'DEL' : 'LLEVAR'}-${rows[0].id}`;
            await db.query(`INSERT INTO mesa_alertas (pedido_id, tipo, mensaje) VALUES (?, 'comprobante', ?)`, [rows[0].id, `Foto recibida de ${rem.tel} (revisa el WhatsApp del restaurante)`]);
            return `¡Recibimos tu comprobante del pedido ${codigo}! El equipo lo validará en unos minutos y te avisamos. / We received your payment proof, our team will verify it shortly.`;
        }
        return 'Recibí tu foto, pero por este medio solo puedo leer mensajes de texto. ¿Me cuentas qué necesitas? / I received your photo, but I can only read text messages here. How can I help you?';
    }
    if (tipo === 'audio') {
        return 'Por ahora no puedo escuchar audios. ¿Me lo escribes, por favor? / I cannot listen to voice notes yet. Could you write it down, please?';
    }
    return 'Por este medio solo puedo leer mensajes de texto. ¿Me escribes qué necesitas? / I can only read text messages here. How can I help you?';
}

async function procesarMensaje(data, ctxBase) {
    const key = data.key || {};
    const id = key.id;
    const rem = remitente(data);
    if (!rem) return;
    if (String(key.remoteJid || '').endsWith('@g.us') || String(key.remoteJid || '') === 'status@broadcast') return; // grupos y estados: fuera de alcance

    // Mensaje escrito por una persona desde el teléfono del restaurante: el bot cede la conversación
    if (key.fromMe) {
        await dormir(1500); // da tiempo a que registremos los ids de lo que envió el sistema
        if (await wa.fueEnviadoPorSistema(id)) return;
        const t = extraerTexto(data);
        const conv = await conversaciones.obtenerOCrearWhatsapp(rem.tel);
        await db.query('UPDATE agente_conversaciones SET bot_pausado = 1 WHERE id = ?', [conv.id]);
        if (t) await conversaciones.agregarMensaje(conv.id, 'personal', t);
        return;
    }

    if (!(await wa.marcarVisto(id))) return; // Evolution reintentó: ya lo atendimos
    if (await demasiados(rem.tel)) return;

    const cfg = await wa.leerFila();
    if (!Number(cfg.wa_activo)) return;

    const pushName = typeof data.pushName === 'string' ? data.pushName : null;
    const conv = await conversaciones.obtenerOCrearWhatsapp(rem.tel, pushName);
    const t = extraerTexto(data);
    const media = tipoMedia(data);

    if (!t) {
        if (!media) return;
        await conversaciones.agregarMensaje(conv.id, 'cliente', `[${media}]`);
        if (Number(conv.bot_pausado)) return;
        const respuesta = await manejarMedia(conv, rem, media);
        await conversaciones.agregarMensaje(conv.id, 'agente', respuesta);
        await wa.enviarTexto(rem.destino, respuesta);
        return;
    }

    await conversaciones.agregarMensaje(conv.id, 'cliente', t);
    if (Number(conv.bot_pausado)) return; // atiende una persona

    const espera = pausa();
    if (espera > 0) await dormir(espera);

    let respuesta;
    try {
        respuesta = await texto.responder({ canal: 'whatsapp', telefono: rem.tel, conversacionId: conv.id, baseUrl: ctxBase });
    } catch (e) {
        console.error('Falló el turno del agente de WhatsApp:', e.message);
        respuesta = texto.RESPALDO;
        await conversaciones.marcarHumano(conv.id, true);
        await db.query(`INSERT INTO mesa_alertas (tipo, mensaje) VALUES ('handoff', ?)`, [`${rem.tel} (whatsapp): el asistente tuvo un problema técnico`]).catch(() => {});
    }
    await conversaciones.agregarMensaje(conv.id, 'agente', respuesta);
    const enviado = await wa.enviarTexto(rem.destino, respuesta);
    if (!enviado) console.error('No se pudo entregar la respuesta de WhatsApp a', rem.tel);
}

async function procesarPayload(payload, base) {
    const evento = String(payload.event || '').toUpperCase().replace(/[.\-]/g, '_');
    if (evento === 'CONNECTION_UPDATE') {
        await wa.actualizarEstado(payload.data && (payload.data.state || payload.data.status));
        return;
    }
    if (evento !== 'MESSAGES_UPSERT') return;
    const lista = Array.isArray(payload.data) ? payload.data : [payload.data];
    for (const data of lista) {
        if (!data || !data.key) continue;
        const rem = remitente(data);
        // Un cliente a la vez (candado de Postgres): sus mensajes se atienden en orden aunque haya varias instancias
        await conCandado(`wa:${rem ? rem.tel : 'x'}`, () => procesarMensaje(data, base))
            .catch((e) => console.error('Error al procesar el WhatsApp:', e.message));
    }
}

router.post('/api/whatsapp/webhook/:secreto', async (req, res) => {
    let valido = false;
    try { valido = await wa.secretoValido(req.params.secreto); } catch (_) { /* tratado como inválido */ }
    if (!valido) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true }); // respuesta inmediata; el trabajo sigue en segundo plano
    const base = String(process.env.APP_URL || '').replace(/\/+$/, '');
    enSegundoPlano(procesarPayload(req.body || {}, base));
});

module.exports = router;
