// WhatsApp del restaurante: conexión (instancia de Evolution API), envío y verificación del webhook.
// El estado vive en agentes_config (una sola instancia); los tokens se guardan cifrados.
// Relacionado con: services/evolution.js, routes/whatsapp.js, routes/ia.js, services/agente/notificaciones.js
const crypto = require('crypto');
const db = require('../db');
const evolution = require('./evolution');
const { encrypt, decrypt } = require('./crypto');
const { normalizar } = require('./telefono');
const { ErrorPublico } = require('./errores');

// Ids de los mensajes que envió el sistema: cuando Evolution avisa de un mensaje "fromMe" que NO está aquí,
// lo escribió una persona desde el teléfono del restaurante (el bot se pausa en esa conversación).
const idsEnviados = new Set();
function registrarEnviado(id) {
    if (!id) return;
    idsEnviados.add(id);
    if (idsEnviados.size > 1000) idsEnviados.delete(idsEnviados.values().next().value);
}
function fueEnviadoPorSistema(id) { return idsEnviados.has(id); }

async function leerFila() {
    const [rows] = await db.query('SELECT * FROM agentes_config WHERE id = 1');
    return rows[0] || {};
}

/** Conexión lista para usar (con el token descifrado) o null si no hay instancia creada. */
async function conexion() {
    const c = await leerFila();
    if (!c.wa_instancia || !c.wa_token_enc) return null;
    let token = null;
    try { token = decrypt(c.wa_token_enc); } catch (e) { console.error('No se pudo descifrar el token de WhatsApp:', e.message); }
    if (!token) return null;
    return { instancia: c.wa_instancia, token, activo: Number(c.wa_activo) === 1, estado: c.wa_estado || 'close', numero: c.wa_numero || null };
}

function urlWebhook(secreto) {
    const base = String(process.env.APP_URL || '').replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) throw new ErrorPublico('Define APP_URL en el .env (dirección pública de la app) para que WhatsApp pueda avisarle de los mensajes');
    return `${base}/api/whatsapp/webhook/${secreto}`;
}

/** Crea la instancia, deja configurado el webhook y devuelve el QR para vincular el teléfono. */
async function crearInstancia() {
    const actual = await leerFila();
    if (actual.wa_instancia) throw new ErrorPublico('Ya hay una instancia de WhatsApp creada. Desconéctala primero si quieres crear otra.');
    const secreto = crypto.randomBytes(24).toString('hex');
    const url = urlWebhook(secreto);
    const nombre = `restaurant-martin-${crypto.randomBytes(3).toString('hex')}`;
    const { token, qr } = await evolution.crearInstancia(nombre);
    if (!token) throw new ErrorPublico('Evolution API no devolvió el token de la instancia. Revisa la versión del servidor.');
    await evolution.configurarWebhook(nombre, token, url);
    await db.query(
        `UPDATE agentes_config SET wa_instancia = ?, wa_token_enc = ?, wa_secreto_enc = ?, wa_estado = 'connecting', updated_at = NOW() WHERE id = 1`,
        [nombre, encrypt(token), encrypt(secreto)]
    );
    return { instancia: nombre, qr };
}

/** Estado actual (consultando a Evolution) y QR si aún no está conectado. */
async function estado({ conQr = false } = {}) {
    const c = await conexion();
    if (!c) return { creada: false, estado: 'sin_instancia' };
    let st = c.estado;
    try { st = await evolution.estadoConexion(c.instancia, c.token); } catch (e) { return { creada: true, instancia: c.instancia, estado: c.estado, activo: c.activo, error: e.message }; }
    if (st !== c.estado) await db.query('UPDATE agentes_config SET wa_estado = ?, updated_at = NOW() WHERE id = 1', [st]);
    const out = { creada: true, instancia: c.instancia, estado: st, activo: c.activo };
    if (conQr && st !== 'open') {
        try { out.qr = await evolution.obtenerQr(c.instancia, c.token); } catch (e) { out.error = e.message; }
    }
    return out;
}

async function desconectar() {
    const c = await leerFila();
    if (c.wa_instancia) {
        try { await evolution.borrarInstancia(c.wa_instancia); } catch (e) { console.error('No se pudo borrar la instancia en Evolution:', e.message); }
    }
    await db.query(
        `UPDATE agentes_config SET wa_instancia = NULL, wa_token_enc = NULL, wa_secreto_enc = NULL, wa_estado = NULL, wa_numero = NULL, wa_activo = 0, updated_at = NOW() WHERE id = 1`
    );
}

/** ¿El secreto de la URL del webhook es el nuestro? (comparación en tiempo constante) */
async function secretoValido(secreto) {
    const c = await leerFila();
    if (!c.wa_secreto_enc || !secreto) return false;
    let esperado;
    try { esperado = decrypt(c.wa_secreto_enc); } catch (_) { return false; }
    const a = crypto.createHash('sha256').update(String(esperado)).digest();
    const b = crypto.createHash('sha256').update(String(secreto)).digest();
    return crypto.timingSafeEqual(a, b);
}

async function actualizarEstado(st) {
    if (['open', 'close', 'connecting'].includes(st)) {
        await db.query('UPDATE agentes_config SET wa_estado = ?, updated_at = NOW() WHERE id = 1', [st]);
    }
}

/**
 * Envía un texto por WhatsApp. `destino` puede ser un teléfono o un JID completo.
 * Devuelve true/false (nunca lanza): un fallo de WhatsApp no debe romper pedidos ni llamadas.
 */
async function enviarTexto(destino, texto) {
    try {
        const c = await conexion();
        if (!c) return false;
        if (c.estado !== 'open') {
            // El estado guardado puede estar atrasado (p. ej. recién escaneado el QR): se confirma con Evolution
            const st = await evolution.estadoConexion(c.instancia, c.token);
            await actualizarEstado(st);
            if (st !== 'open') return false;
        }
        const numero = String(destino).includes('@') ? String(destino) : normalizar(destino);
        if (!numero || !String(texto || '').trim()) return false;
        const r = await evolution.enviarTexto(c.instancia, c.token, numero, String(texto));
        registrarEnviado(r && r.key && r.key.id);
        return true;
    } catch (e) {
        console.error('No se pudo enviar el WhatsApp:', e.message);
        return false;
    }
}

module.exports = { conexion, crearInstancia, estado, desconectar, secretoValido, actualizarEstado, enviarTexto, leerFila, fueEnviadoPorSistema };
