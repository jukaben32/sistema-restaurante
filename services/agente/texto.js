// Agente de texto (WhatsApp): un turno de conversación con herramientas.
// Port de Real-Estate-Multi-AI-Agent-SaaS/src/ai/textAgent.ts (runWhatsappAgentTurn): envía la
// conversación a OpenAI Chat Completions, ejecuta las herramientas que pida el modelo con el MISMO
// ejecutor que usa la voz (la lógica de pedidos y reservas no puede divergir por canal) y repite
// hasta que el modelo responde con texto.
// Relacionado con: services/agente/ejecutor.js, services/agente/prompt.js, routes/whatsapp.js
const herramientas = require('./herramientas');
const ejecutor = require('./ejecutor');
const conversaciones = require('./conversaciones');
const { construirPrompt } = require('./prompt');
const { ErrorPublico } = require('../errores');

const RONDAS_MAX = 5;
const RESPALDO = 'Perdón, tuve un problema procesando tu mensaje. En breve te escribe alguien del equipo. / Sorry, I had a problem. Someone from our team will write to you shortly.';

// El prompt se arma desde la base de datos: se reutiliza 60 s para no consultarla en cada mensaje
let cachePrompt = { texto: null, hasta: 0 };
async function promptCacheado() {
    if (cachePrompt.texto && Date.now() < cachePrompt.hasta) return cachePrompt.texto;
    cachePrompt = { texto: await construirPrompt('texto'), hasta: Date.now() + 60000 };
    return cachePrompt.texto;
}
function invalidarPrompt() { cachePrompt = { texto: null, hasta: 0 }; }

async function chat(mensajes) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new ErrorPublico('Falta OPENAI_API_KEY en el archivo .env');
    const base = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
            messages: mensajes,
            tools: herramientas.paraOpenAI(),
            temperature: 0.3
        })
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error('OpenAI no devolvió ningún mensaje');
    return msg;
}

/**
 * Responde al último mensaje del cliente (ya guardado en la conversación).
 * ctx = { canal: 'whatsapp', telefono, conversacionId, baseUrl }
 * @returns {Promise<string>} texto para enviar al cliente
 */
async function responder(ctx) {
    const sistema = await promptCacheado();
    const historial = await conversaciones.historialParaModelo(ctx.conversacionId, 30);
    const mensajes = [{ role: 'system', content: sistema }, ...historial];

    for (let ronda = 0; ronda < RONDAS_MAX; ronda++) {
        const msg = await chat(mensajes);
        if (!msg.tool_calls || !msg.tool_calls.length) {
            const texto = String(msg.content || '').trim();
            return texto || RESPALDO;
        }
        mensajes.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
        for (const call of msg.tool_calls) {
            let args = {};
            try { args = JSON.parse(call.function.arguments || '{}'); } catch (_) { /* argumentos mal formados: sin argumentos */ }
            const resultado = await ejecutor.ejecutar(call.function.name, args, ctx);
            mensajes.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(resultado) });
        }
    }
    return RESPALDO;
}

module.exports = { responder, invalidarPrompt, RESPALDO };
