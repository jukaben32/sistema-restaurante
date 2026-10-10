// Pie de página de la app: agencia, WhatsApp y redes sociales (editables desde Configuración → Redes y pie de página).
// Relacionado con: views/partials/footer.ejs, routes/pie.js, views/configuracion_pie.ejs, database.sql (pie_*)
const db = require('../db');

const REDES = [
    ['facebook', 'Facebook', 'bi-facebook', 'https://facebook.com/tu-pagina'],
    ['instagram', 'Instagram', 'bi-instagram', 'https://instagram.com/tu_usuario'],
    ['x', 'X (Twitter)', 'bi-twitter-x', 'https://x.com/tu_usuario'],
    ['tiktok', 'TikTok', 'bi-tiktok', 'https://tiktok.com/@tu_usuario'],
    ['youtube', 'YouTube', 'bi-youtube', 'https://youtube.com/@tu_canal'],
    ['linkedin', 'LinkedIn', 'bi-linkedin', 'https://linkedin.com/company/tu-empresa'],
    ['pinterest', 'Pinterest', 'bi-pinterest', 'https://pinterest.com/tu_usuario']
];

let cache = null;
let cacheHasta = 0;

function limpiarCache() { cache = null; cacheHasta = 0; }

/** Datos del pie (con caché de 60 s por instancia, para no consultar la base en cada página). */
async function obtener() {
    if (cache && Date.now() < cacheHasta) return cache;
    let fila = {};
    try {
        const [rows] = await db.query(
            `SELECT nombre_negocio, pie_agencia, pie_whatsapp, pie_facebook, pie_instagram, pie_x, pie_tiktok, pie_youtube, pie_linkedin, pie_pinterest, pie_ocultas
             FROM configuracion_impresion ORDER BY id LIMIT 1`
        );
        fila = rows[0] || {};
    } catch (_) { /* columnas aún sin crear: pie vacío */ }
    const ocultas = new Set(String(fila.pie_ocultas || '').split(',').map((s) => s.trim()).filter(Boolean));
    const pie = {
        negocio: fila.nombre_negocio || 'Restaurant Martin',
        agencia: fila.pie_agencia || '',
        whatsapp: String(fila.pie_whatsapp || '').replace(/\D/g, ''),
        // activa = encendida en Ajustes (si está apagada no se muestra en el pie)
        redes: REDES.map(([id, nombre, icono]) => ({ id, nombre, icono, url: fila[`pie_${id}`] || '', activa: !ocultas.has(id) }))
    };
    cache = pie;
    cacheHasta = Date.now() + 60 * 1000;
    return pie;
}

function urlValida(u) {
    try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch (_) { return false; }
}

/** Valida y guarda. Devuelve { error } si algo no es válido. */
async function guardar(b) {
    const agencia = String(b.agencia || '').trim().slice(0, 80);
    const whatsapp = String(b.whatsapp || '').replace(/\D/g, '');
    if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) return { error: 'El WhatsApp debe tener entre 8 y 15 dígitos, con código de país (ej. 18499192565).' };
    const valores = {};
    const ocultas = [];
    for (const [id, nombre] of REDES) {
        if (!(b[`mostrar_${id}`] === true || String(b[`mostrar_${id}`]) === '1')) ocultas.push(id);
        const u = String(b[id] || '').trim().slice(0, 300);
        if (u && !urlValida(u)) return { error: `El enlace de ${nombre} debe empezar con https:// (copia la dirección completa de tu perfil).` };
        valores[id] = u || null;
    }
    const [rows] = await db.query('SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1');
    if (!rows[0]) await db.query(`INSERT INTO configuracion_impresion (nombre_negocio) VALUES ('Restaurant Martin')`);
    await db.query(
        `UPDATE configuracion_impresion SET pie_agencia = ?, pie_whatsapp = ?, pie_facebook = ?, pie_instagram = ?, pie_x = ?, pie_tiktok = ?,
                pie_youtube = ?, pie_linkedin = ?, pie_pinterest = ?, pie_ocultas = ?
         WHERE id = (SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1)`,
        [agencia || null, whatsapp || null, valores.facebook, valores.instagram, valores.x, valores.tiktok, valores.youtube, valores.linkedin, valores.pinterest, ocultas.join(',') || null]
    );
    limpiarCache();
    return { ok: true };
}

/** Middleware: deja el pie disponible en las vistas (solo páginas, no la API). */
async function middleware(req, res, next) {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        try { res.locals.pie = await obtener(); } catch (_) { /* sin pie */ }
    }
    next();
}

module.exports = { REDES, obtener, guardar, limpiarCache, middleware };
