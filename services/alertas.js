// Alertas por demora (cocina y delivery): a los X minutos el tiempo se pone amarillo y a los Y, rojo (con sonido opcional).
// Los tiempos se editan en Configuración → Alertas de tiempo.
// Relacionado con: routes/alertas.js, views/configuracion_alertas.ejs, public/js/alertas-tiempo.js, public/js/cocina.js, public/js/delivery.js
const db = require('../db');

const POR_DEFECTO = { amarilla: 10, roja: 20, confirmar: 5, sonido: true };
let cache = null;
let cacheHasta = 0;

function limpiarCache() { cache = null; cacheHasta = 0; }

async function obtener() {
    if (cache && Date.now() < cacheHasta) return cache;
    let fila = {};
    try {
        const [rows] = await db.query('SELECT alerta_amarilla_min, alerta_roja_min, alerta_confirmar_min, alerta_sonido FROM configuracion_impresion ORDER BY id LIMIT 1');
        fila = rows[0] || {};
    } catch (_) { /* columnas aún sin crear: valores por defecto */ }
    cache = {
        amarilla: Number(fila.alerta_amarilla_min) || POR_DEFECTO.amarilla,
        roja: Number(fila.alerta_roja_min) || POR_DEFECTO.roja,
        confirmar: Number(fila.alerta_confirmar_min) || POR_DEFECTO.confirmar,
        sonido: fila.alerta_sonido == null ? POR_DEFECTO.sonido : Number(fila.alerta_sonido) === 1
    };
    cacheHasta = Date.now() + 60 * 1000;
    return cache;
}

const entero = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : NaN; };

async function guardar(b) {
    const amarilla = entero(b.amarilla);
    const roja = entero(b.roja);
    const confirmar = entero(b.confirmar);
    for (const [n, v] of [['Aviso amarillo', amarilla], ['Aviso rojo', roja], ['Confirmar pedidos', confirmar]]) {
        if (!Number.isInteger(v) || v < 1 || v > 240) return { error: `${n}: escribe un número de minutos entre 1 y 240.` };
    }
    if (amarilla >= roja) return { error: 'El aviso amarillo debe ser menor que el rojo (por ejemplo 10 y 20 minutos).' };
    const sonido = b.sonido === true || String(b.sonido) === '1' ? 1 : 0;
    const [rows] = await db.query('SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1');
    if (!rows[0]) await db.query(`INSERT INTO configuracion_impresion (nombre_negocio) VALUES ('Restaurant Martin')`);
    await db.query(
        `UPDATE configuracion_impresion SET alerta_amarilla_min = ?, alerta_roja_min = ?, alerta_confirmar_min = ?, alerta_sonido = ?
         WHERE id = (SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1)`,
        [amarilla, roja, confirmar, sonido]
    );
    limpiarCache();
    return { ok: true };
}

/** Middleware: deja los tiempos disponibles en las vistas (solo páginas, no la API). */
async function middleware(req, res, next) {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        try { res.locals.alertasTiempo = await obtener(); } catch (_) { /* valores por defecto en el navegador */ }
    }
    next();
}

module.exports = { POR_DEFECTO, obtener, guardar, limpiarCache, middleware };
