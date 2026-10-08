// Trabajo en segundo plano y exclusión entre instancias, pensado para funcionar igual en un servidor
// de siempre (VPS) y en serverless (Vercel), donde cada petición puede caer en una instancia distinta.
//
// - enSegundoPlano(promesa): en Vercel usa waitUntil para que la función NO se congele al responder
//   (si no, los mensajes de WhatsApp quedarían sin contestar). En un servidor normal no hace falta.
// - conCandado(clave, fn): un solo proceso a la vez por clave (p. ej. un cliente de WhatsApp), con un
//   registro de vencimiento en la tabla "candados". NO retiene conexiones de la base de datos mientras
//   espera (con el límite de pocas conexiones de serverless, eso provocaba bloqueos) y si una instancia
//   muere, el candado vence solo.
// Relacionado con: routes/whatsapp.js, routes/delivery.js, routes/reservas.js, services/stripe.js
const db = require('../db');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function enSegundoPlano(promesa) {
    const p = Promise.resolve(promesa).catch((e) => console.error('Error en segundo plano:', e && e.message ? e.message : e));
    if (process.env.VERCEL) {
        try {
            require('@vercel/functions').waitUntil(p);
        } catch (e) {
            console.error('No se pudo usar waitUntil:', e.message);
        }
    }
    return p;
}

/** Intenta tomar el candado: true si lo obtuvo (nuevo o vencido de otro). */
async function tomar(clave, ttlSeg) {
    const [r] = await db.query(
        `INSERT INTO candados (clave, expira) VALUES (?, NOW() + (?::int * interval '1 second'))
         ON CONFLICT (clave) DO UPDATE SET expira = EXCLUDED.expira WHERE candados.expira < NOW()`,
        [clave, ttlSeg]
    );
    return r.affectedRows > 0;
}

/**
 * Ejecuta fn cuando se obtiene el candado de la clave (reintenta hasta esperaMaxMs).
 * ttlSeg: cuánto dura el candado si la instancia muere sin liberarlo.
 */
async function conCandado(clave, fn, { esperaMaxMs = 90000, ttlSeg = 90 } = {}) {
    const t0 = Date.now();
    while (!(await tomar(clave, ttlSeg))) {
        if (Date.now() - t0 > esperaMaxMs) throw new Error(`No se obtuvo el candado "${clave}"`);
        await dormir(250);
    }
    try {
        return await fn();
    } finally {
        await db.query('DELETE FROM candados WHERE clave = ?', [clave]).catch(() => {});
    }
}

module.exports = { enSegundoPlano, conCandado };
