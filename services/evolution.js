// Cliente REST de Evolution API v2 (pasarela de WhatsApp self-hosted).
// Port a CommonJS de Real-Estate-Multi-AI-Agent-SaaS/src/lib/evolutionApi.ts: solo las llamadas ya
// comprobadas en tus otros proyectos. Si una llamada falla tras actualizar el servidor, revisa
// https://doc.evolution-api.com/v2 (el contrato ha cambiado entre versiones mayores).
//
// Dos credenciales que NO se mezclan:
// - EVOLUTION_API_KEY (llave global, .env): crear y borrar instancias.
// - token de la instancia (lo devuelve al crearla; se guarda cifrado en agentes_config):
//   QR, estado, webhook y envío de mensajes de ESA instancia.
const { ErrorPublico } = require('./errores');

function baseUrl() {
    const url = process.env.EVOLUTION_API_URL;
    if (!url) throw new ErrorPublico('WhatsApp no está configurado: agrega EVOLUTION_API_URL y EVOLUTION_API_KEY en el archivo .env');
    return url.replace(/\/$/, '');
}

function llaveGlobal() {
    const k = process.env.EVOLUTION_API_KEY;
    if (!k) throw new ErrorPublico('WhatsApp no está configurado: agrega EVOLUTION_API_KEY en el archivo .env');
    return k;
}

async function peticion(path, apiKey, init = {}) {
    const res = await fetch(`${baseUrl()}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', apikey: apiKey, ...(init.headers || {}) }
    });
    if (!res.ok) {
        const detalle = await res.text().catch(() => '');
        throw new Error(`Evolution API ${path} -> ${res.status}: ${detalle.slice(0, 300)}`);
    }
    const txt = await res.text();
    try { return txt ? JSON.parse(txt) : {}; } catch (_) { return {}; }
}

async function crearInstancia(nombre) {
    const data = await peticion('/instance/create', llaveGlobal(), {
        method: 'POST',
        body: JSON.stringify({ instanceName: nombre, integration: 'WHATSAPP-BAILEYS', qrcode: true })
    });
    // v2 devuelve el token como `hash` (a veces anidado en `hash.apikey`): se leen ambas formas
    const token = typeof data?.hash === 'string' ? data.hash : (data?.hash?.apikey ?? null);
    const qr = data?.qrcode?.base64 ?? null;
    return { token, qr };
}

async function obtenerQr(nombre, token) {
    const data = await peticion(`/instance/connect/${nombre}`, token, { method: 'GET' });
    return data?.qrcode?.base64 ?? data?.base64 ?? null;
}

async function estadoConexion(nombre, token) {
    const data = await peticion(`/instance/connectionState/${nombre}`, token, { method: 'GET' });
    return data?.instance?.state ?? 'close'; // open | close | connecting
}

async function configurarWebhook(nombre, token, url) {
    await peticion(`/webhook/set/${nombre}`, token, {
        method: 'POST',
        body: JSON.stringify({
            enabled: true, url, webhookByEvents: false, webhookBase64: false,
            events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
        })
    });
}

async function enviarTexto(nombre, token, numero, texto) {
    return peticion(`/message/sendText/${nombre}`, token, { method: 'POST', body: JSON.stringify({ number: numero, text: texto }) });
}

async function borrarInstancia(nombre) {
    // El logout puede dar 404 si nunca se conectó: lo importante es el borrado
    await peticion(`/instance/logout/${nombre}`, llaveGlobal(), { method: 'DELETE' }).catch(() => {});
    await peticion(`/instance/delete/${nombre}`, llaveGlobal(), { method: 'DELETE' });
}

module.exports = { crearInstancia, obtenerQr, estadoConexion, configurarWebhook, enviarTexto, borrarInstancia };
