// Proveedor de e-CF: MSeller (https://docs.ecf.mseller.app). REST con JSON; MSeller firma el XML, lo envía a la DGII y lo guarda 10 años.
// Ambientes: TesteCF (pruebas), CerteCF (certificación) y eCF (producción). Autenticación: POST /{env}/customer/authentication
// devuelve `idToken` (se usa como Bearer) y además se envía el header X-API-KEY. El software asigna el e-NCF.
// Relacionado con: services/fiscal/proveedor/index.js, services/fiscal/emision.js
const BASE = process.env.MSELLER_BASE_URL || 'https://ecf.api.mseller.app';
const TIMEOUT_MS = 25000;

const tokens = new Map(); // `${ambiente}:${email}` -> { idToken, hasta }

function ambienteDe(cfg) {
    if (cfg.modo === 'ecf_produccion') return 'eCF';
    return cfg.mseller.ambiente === 'CerteCF' ? 'CerteCF' : 'TesteCF';
}

function errorDe(msg, extra = {}) { return Object.assign(new Error(msg), extra); }

async function peticion(url, opciones = {}) {
    let resp;
    try {
        resp = await fetch(url, { ...opciones, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
        throw errorDe(`No se pudo conectar con MSeller (${e.name === 'TimeoutError' ? 'tardó demasiado' : e.message})`, { reintentable: true });
    }
    const texto = await resp.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch (_) { datos = { raw: texto.slice(0, 500) }; }
    return { status: resp.status, ok: resp.ok, datos };
}

async function token(cfg, forzar = false) {
    const m = cfg.mseller;
    if (!m.email || !m.password || !m.apiKey) throw errorDe('Faltan las credenciales de MSeller (correo, contraseña y API key) en Ajustes → Fiscal.', { config: true });
    const amb = ambienteDe(cfg);
    const clave = `${amb}:${m.email}`;
    const c = tokens.get(clave);
    if (!forzar && c && Date.now() < c.hasta) return c.idToken;
    const r = await peticion(`${BASE}/${amb}/customer/authentication`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: m.email, password: m.password })
    });
    if (!r.ok || !r.datos || !r.datos.idToken) {
        throw errorDe(r.status === 401 || r.status === 403 ? 'MSeller rechazó el correo o la contraseña.' : `MSeller no respondió bien al iniciar sesión (HTTP ${r.status}).`, { config: r.status === 401 || r.status === 403, reintentable: r.status >= 500 });
    }
    tokens.set(clave, { idToken: r.datos.idToken, hasta: Date.now() + 25 * 60 * 1000 });
    return r.datos.idToken;
}

/** Llamada autenticada; si el token venció (401) inicia sesión de nuevo una vez. */
async function api(cfg, metodo, ruta, cuerpo, { apiKey = true } = {}) {
    const amb = ambienteDe(cfg);
    const llamar = async (forzar) => {
        const t = await token(cfg, forzar);
        const headers = { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json' };
        if (apiKey) headers['X-API-KEY'] = cfg.mseller.apiKey;
        return peticion(`${BASE}/${amb}${ruta}`, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    };
    let r = await llamar(false);
    if (r.status === 401) r = await llamar(true);
    return r;
}

/** Traduce los estados de MSeller (hay dos nomenclaturas en su documentación) a los nuestros. */
function estadoNuestro(s) {
    const x = String(s || '').toUpperCase().replace(/\s+/g, '_');
    if (x === 'ACEPTADO') return 'aceptado';
    if (x === 'ACEPTADO_CONDICIONAL') return 'aceptado_condicional';
    if (x === 'RECHAZADO') return 'rechazado';
    return 'enviado'; // RECIBIDO, PROCESANDO, EN_COLA, EN_PROCESO, ENVIADO_A_DGII…
}

function resultado(datos, estadoPorDefecto = 'enviado') {
    const d = datos || {};
    const doc = d.data || d;
    return {
        estado: d.status || doc.status ? estadoNuestro(d.status || doc.status) : estadoPorDefecto,
        track_id: doc.internalTrackId || doc.trackId || null,
        codigo_seguridad: doc.securityCode || null,
        qr_url: doc.qr_url || doc.qrUrl || null,
        fecha_firma: doc.signedDate || null,
        error: doc.error || doc.message || (Array.isArray(doc.mensajes) ? doc.mensajes.map((m) => m.valor || m).join('; ') : null),
        respuesta: d
    };
}

async function enviar(cfg, payload, { validar = false } = {}) {
    const r = await api(cfg, 'POST', `/documentos-ecf${validar ? '?validate=true' : ''}`, payload);
    if (r.status === 429) throw errorDe('MSeller pidió esperar (límite de peticiones o cuota del plan agotada).', { reintentable: true });
    if (r.status >= 500) throw errorDe(`MSeller tuvo un error (HTTP ${r.status}).`, { reintentable: true });
    if (r.status === 401 || r.status === 403) throw errorDe('MSeller rechazó las credenciales o la API key.', { config: true });
    if (!r.ok) {
        const msg = (r.datos && (r.datos.message || r.datos.error)) || `HTTP ${r.status}`;
        return { estado: 'rechazado', error: `MSeller rechazó el comprobante: ${msg}`, respuesta: r.datos };
    }
    return resultado(r.datos, 'enviado');
}

async function consultar(cfg, ncf) {
    const r = await api(cfg, 'GET', `/documentos-ecf?ecf=${encodeURIComponent(ncf)}`);
    if (r.status === 404) return { estado: 'enviado', error: null, respuesta: r.datos };
    if (r.status === 429 || r.status >= 500) throw errorDe(`MSeller no respondió bien (HTTP ${r.status}).`, { reintentable: true });
    if (!r.ok) throw errorDe(`No se pudo consultar el estado (HTTP ${r.status}).`, { reintentable: true });
    return resultado(r.datos, 'enviado');
}

/** Anula rangos de e-NCF NO usados (POST /customer/void-ncf; no lleva X-API-KEY). */
async function anularSecuencias(cfg, rangos) {
    const r = await api(cfg, 'POST', '/customer/void-ncf', { ranges: rangos.map((x) => ({ secuenciaDesde: x.desde, secuenciaHasta: x.hasta })) }, { apiKey: false });
    if (!r.ok) throw errorDe(`MSeller no pudo anular las secuencias (HTTP ${r.status}).`);
    return { ok: true, respuesta: r.datos };
}

async function probar(cfg) {
    await token(cfg, true);
    return { ok: true, detalle: `Conectado a MSeller (${ambienteDe(cfg)}).` };
}

module.exports = { nombre: 'mseller', enviar, consultar, anularSecuencias, probar, estadoNuestro, ambienteDe };
