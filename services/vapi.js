// Integración con Vapi (agente de voz): sincroniza las herramientas y publica el asistente.
// Patrón de CRM.Agentevoz (lib/vapi/actions.ts + scripts/vapi-sync-tools.ts), adaptado al restaurante.
// Claves en .env: VAPI_API_KEY, VAPI_WEBHOOK_TOKEN, APP_URL (https público).
// Relacionado con: routes/vapi.js (webhook), routes/ia.js (pantalla), scripts/vapi-sync.js
const crypto = require('crypto');
const db = require('../db');
const delivery = require('./delivery');
const { HERRAMIENTAS, paraVapi, checksum } = require('./agente/herramientas');
const { construirPrompt } = require('./agente/prompt');
const { normalizar } = require('./telefono');
const { ErrorPublico } = require('./errores');

const API = 'https://api.vapi.ai';
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);

// Idioma automático: Deepgram "multi" entiende varios idiomas y la voz de Vapi V2 con language "auto"
// habla el idioma detectado. Se fijan SOLO al crear el asistente; después puedes cambiar la voz en el
// dashboard de Vapi y "Publicar" no la pisa.
const POR_DEFECTO = {
    transcriber: { provider: 'deepgram', model: 'nova-3', language: 'multi' },
    voice: { provider: 'vapi', voiceId: 'Elliot', version: 2, language: 'auto' },
    model: { provider: 'openai', model: 'gpt-4.1-mini' }
};

function apiKey() {
    const k = process.env.VAPI_API_KEY;
    if (!k) throw new ErrorPublico('Falta VAPI_API_KEY en el archivo .env del servidor');
    return k;
}

async function vapi(path, method = 'GET', body) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (_) { data = txt; }
    if (!res.ok) {
        const detalle = typeof data === 'string' ? data : (data && (Array.isArray(data.message) ? data.message.join('; ') : data.message)) || txt;
        throw new ErrorPublico(`Vapi respondió ${res.status}: ${String(detalle).slice(0, 300)}`);
    }
    return data;
}

function urlWebhook() {
    const base = String(process.env.APP_URL || '').replace(/\/+$/, '');
    if (!/^https:\/\//.test(base)) {
        throw new ErrorPublico('APP_URL debe ser la dirección https pública de la app (Vapi no puede llamar a localhost). Publica la app en el VPS primero.');
    }
    return `${base}/api/vapi/webhook`;
}

/** Cómo Vapi llama a nuestro webhook (el token viaja en la cabecera Authorization). */
function servidor() {
    const s = { url: urlWebhook(), timeoutSeconds: 20 };
    const token = process.env.VAPI_WEBHOOK_TOKEN;
    if (token) s.headers = { Authorization: `Bearer ${token}` };
    if (process.env.VAPI_SERVER_CREDENTIAL_ID) s.credentialId = process.env.VAPI_SERVER_CREDENTIAL_ID;
    return s;
}

/** Crea o actualiza en Vapi las herramientas que cambiaron. Devuelve los ids para el asistente. */
async function sincronizarHerramientas() {
    const server = servidor();
    const sufijo = hash(JSON.stringify(server));
    const defs = HERRAMIENTAS.map((t) => ({ nombre: t.name, payload: paraVapi(t, server), sum: `${checksum(t)}-${sufijo}` }));

    // Transferencia a una persona (herramienta nativa de Vapi) si hay teléfono configurado
    const cfg = await delivery.getConfig(db);
    const tel = normalizar(cfg.telefonoHumano);
    if (tel) {
        defs.push({
            nombre: 'transferirAPersona',
            payload: {
                type: 'transferCall',
                destinations: [{
                    type: 'number', number: `+${tel}`,
                    description: 'Pasar la llamada con una persona del restaurante cuando el cliente lo pide, hay una queja, una urgencia o algo que no puedes resolver.',
                    message: 'Te paso con una persona del equipo. One moment, I am transferring you to a team member.'
                }]
            },
            sum: hash(`transfer-${tel}`)
        });
    }

    const [filas] = await db.query('SELECT name, vapi_tool_id, checksum FROM vapi_tools');
    const existentes = new Map(filas.map((f) => [f.name, f]));
    const resultado = { creadas: [], actualizadas: [], sinCambios: [], toolIds: [] };

    for (const d of defs) {
        const e = existentes.get(d.nombre);
        let id;
        if (!e) {
            const creada = await vapi('/tool', 'POST', d.payload);
            id = creada.id;
            resultado.creadas.push(d.nombre);
        } else if (e.checksum !== d.sum) {
            await vapi(`/tool/${e.vapi_tool_id}`, 'PATCH', d.payload);
            id = e.vapi_tool_id;
            resultado.actualizadas.push(d.nombre);
        } else {
            id = e.vapi_tool_id;
            resultado.sinCambios.push(d.nombre);
        }
        if (!e || e.checksum !== d.sum) {
            await db.query(
                `INSERT INTO vapi_tools (name, vapi_tool_id, checksum, synced_at) VALUES (?, ?, ?, NOW())
                 ON CONFLICT (name) DO UPDATE SET vapi_tool_id = EXCLUDED.vapi_tool_id, checksum = EXCLUDED.checksum, synced_at = NOW()`,
                [d.nombre, id, d.sum]
            );
        }
        resultado.toolIds.push(id);
    }
    return resultado;
}

async function leerConfig() {
    const [rows] = await db.query('SELECT * FROM agentes_config WHERE id = 1');
    return rows[0] || {};
}

/** Construye el payload del asistente. En la actualización no se tocan voz ni transcriptor. */
async function armarAsistente({ toolIds, crear }) {
    const [cfg, negocio] = await Promise.all([
        leerConfig(),
        db.query('SELECT nombre_negocio FROM configuracion_impresion ORDER BY id LIMIT 1').then(([r]) => r[0] || {})
    ]);
    const nombre = negocio.nombre_negocio || 'Restaurant Martin';
    const prompt = await construirPrompt('voz');

    const payload = {
        name: nombre.slice(0, 40), // Vapi exige máximo 40 caracteres
        firstMessage: cfg.voz_primer_mensaje
            || `¡Hola! Gracias por llamar a ${nombre}. ¿En qué te puedo ayudar? Hello! Thanks for calling ${nombre}, how can I help you?`,
        model: {
            ...POR_DEFECTO.model,
            toolIds,
            // Nativa: sin ella la llamada nunca cuelga sola y sigue cobrando minutos
            tools: [{
                type: 'endCall',
                function: {
                    name: 'end_completed_call',
                    description: 'Cuelga la llamada. Úsala solo cuando el objetivo esté resuelto y ya te hayas despedido. No la uses solo porque el cliente calla un momento.'
                }
            }],
            messages: [{ role: 'system', content: prompt }]
        },
        server: servidor(),
        serverMessages: ['tool-calls', 'end-of-call-report', 'status-update'],
        analysisPlan: {
            summaryPlan: {
                enabled: true,
                messages: [{
                    role: 'system',
                    content: 'Resume la llamada en español: motivo, si se hizo un pedido (código, platos y total) o una reserva (fecha, hora, personas), idioma del cliente y si quedó algo pendiente.'
                }]
            }
        },
        maxDurationSeconds: 600,
        backgroundDenoisingEnabled: true
    };
    if (crear) {
        payload.transcriber = POR_DEFECTO.transcriber;
        payload.voice = POR_DEFECTO.voice;
    }
    return { payload, promptChars: prompt.length };
}

/** Publica (crea o actualiza) el asistente de voz en Vapi y lo vincula al número. */
async function publicar() {
    const cfg = await leerConfig();
    const tools = await sincronizarHerramientas();
    const crear = !cfg.vapi_assistant_id;
    const { payload, promptChars } = await armarAsistente({ toolIds: tools.toolIds, crear });

    let assistantId = cfg.vapi_assistant_id;
    if (assistantId) await vapi(`/assistant/${assistantId}`, 'PATCH', payload);
    else assistantId = (await vapi('/assistant', 'POST', payload)).id;

    let numeroVinculado = false;
    if (cfg.vapi_phone_number_id) {
        await vapi(`/phone-number/${cfg.vapi_phone_number_id}`, 'PATCH', { assistantId });
        numeroVinculado = true;
    }
    await db.query('UPDATE agentes_config SET vapi_assistant_id = ?, vapi_publicado_at = NOW(), updated_at = NOW() WHERE id = 1', [assistantId]);
    return { assistantId, creado: crear, herramientas: tools, promptChars, numeroVinculado };
}

/** ¿Qué falta para que el agente de voz funcione? (para la pantalla de configuración) */
async function diagnostico() {
    const cfg = await leerConfig();
    const base = String(process.env.APP_URL || '');
    return {
        vapi_api_key: !!process.env.VAPI_API_KEY,
        webhook_token: !!process.env.VAPI_WEBHOOK_TOKEN,
        app_url_https: /^https:\/\//.test(base),
        app_url: base,
        openai_api_key: !!process.env.OPENAI_API_KEY,
        publicado: !!cfg.vapi_assistant_id,
        assistant_id: cfg.vapi_assistant_id || null,
        phone_number_id: cfg.vapi_phone_number_id || null,
        publicado_at: cfg.vapi_publicado_at || null
    };
}

module.exports = { sincronizarHerramientas, publicar, diagnostico, leerConfig, armarAsistente, servidor, POR_DEFECTO };
