// Cobros con Stripe para el POS (llaves propias del restaurante).
// Patrón tomado de Real-Estate-Multi-AI-Agent-SaaS (services/billing.ts):
// - Checkout Session en modo "payment" con metadata
// - webhook firmado con el webhook secret
// Además, el estado se puede consultar directamente a Stripe (polling), así el cobro funciona
// aunque el servidor esté en una PC local sin URL pública para el webhook.
//
// Relacionado con: routes/stripe.js, routes/mesas.js y routes/facturas.js (facturar),
// views/configuracion_stripe.ejs, public/js/stripe-cobro.js
const Stripe = require('stripe');
const QRCode = require('qrcode');
const db = require('../db');
const { encrypt, decrypt } = require('./crypto');

// Monedas sin decimales en Stripe (el monto se envía tal cual, no x100)
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

class StripePublicError extends Error {
    constructor(message) {
        super(message);
        this.publico = true;
    }
}

function toMinorUnits(monto, moneda) {
    const m = Number(monto);
    return ZERO_DECIMAL.has(String(moneda).toLowerCase()) ? Math.round(m) : Math.round(m * 100);
}

function fromMinorUnits(amount, moneda) {
    const a = Number(amount || 0);
    return ZERO_DECIMAL.has(String(moneda).toLowerCase()) ? a : a / 100;
}

async function getStripeConfig() {
    const [rows] = await db.query(
        `SELECT stripe_habilitado, stripe_publishable_key, stripe_secret_key_enc, stripe_webhook_secret_enc,
                moneda, app_url_publica, nombre_negocio
         FROM configuracion_impresion ORDER BY id LIMIT 1`
    );
    const c = rows[0] || {};
    let secretKey = null;
    let webhookSecret = null;
    try { secretKey = decrypt(c.stripe_secret_key_enc); } catch (e) { console.error('No se pudo descifrar la llave de Stripe:', e.message); }
    try { webhookSecret = decrypt(c.stripe_webhook_secret_enc); } catch (_) { /* noop */ }
    secretKey = secretKey || process.env.STRIPE_SECRET_KEY || null;
    webhookSecret = webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || null;
    return {
        habilitado: Number(c.stripe_habilitado || 0) === 1 && !!secretKey,
        publishableKey: c.stripe_publishable_key || null,
        secretKey,
        webhookSecret,
        moneda: String(c.moneda || 'usd').toLowerCase(),
        appUrlPublica: c.app_url_publica || null,
        nombreNegocio: c.nombre_negocio || 'Restaurante',
        modoPrueba: secretKey ? secretKey.startsWith('sk_test_') : false
    };
}

/** Guarda la configuración (las llaves secretas se cifran; vacío = conservar la actual). */
async function saveStripeConfig({ habilitado, publishableKey, secretKey, webhookSecret, moneda, appUrlPublica }) {
    const [rows] = await db.query('SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1');
    if (!rows[0]) {
        await db.query(`INSERT INTO configuracion_impresion (nombre_negocio) VALUES ('Restaurant Martin')`);
    }
    const sets = ['stripe_habilitado = ?', 'stripe_publishable_key = ?', 'moneda = ?', 'app_url_publica = ?'];
    const vals = [habilitado ? 1 : 0, publishableKey || null, String(moneda || 'usd').toLowerCase().slice(0, 3), appUrlPublica || null];
    if (secretKey) { sets.push('stripe_secret_key_enc = ?'); vals.push(encrypt(secretKey)); }
    if (webhookSecret) { sets.push('stripe_webhook_secret_enc = ?'); vals.push(encrypt(webhookSecret)); }
    await db.query(
        `UPDATE configuracion_impresion SET ${sets.join(', ')} WHERE id = (SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1)`,
        vals
    );
}

function getClient(cfg) {
    if (!cfg.secretKey) throw new StripePublicError('Stripe no está configurado (falta la llave secreta)');
    return new Stripe(cfg.secretKey);
}

/** Verifica las llaves contra Stripe (para el botón "Probar conexión"). */
async function probarConexion() {
    const cfg = await getStripeConfig();
    const stripe = getClient(cfg);
    const account = await stripe.accounts.retrieve();
    return {
        ok: true,
        cuenta: account.settings?.dashboard?.display_name || account.business_profile?.name || account.id,
        pais: account.country,
        modoPrueba: cfg.modoPrueba,
        cobrosHabilitados: account.charges_enabled
    };
}

/**
 * Crea un cobro (Checkout Session) y devuelve URL + QR para que el cliente pague desde su celular.
 * baseUrl: URL con la que el cliente vuelve al terminar (config app_url_publica o el host actual).
 */
async function crearCobro({ monto, pedidoId = null, descripcion, baseUrl, usuario = null }) {
    const cfg = await getStripeConfig();
    if (!cfg.habilitado) throw new StripePublicError('Los pagos con Stripe no están habilitados (Configuración → Stripe)');
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) throw new StripePublicError('Monto inválido para cobrar con Stripe');

    const stripe = getClient(cfg);
    const base = String(cfg.appUrlPublica || baseUrl || '').replace(/\/+$/, '');
    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
            quantity: 1,
            price_data: {
                currency: cfg.moneda,
                unit_amount: toMinorUnits(montoNum, cfg.moneda),
                product_data: { name: descripcion || `Consumo en ${cfg.nombreNegocio}` }
            }
        }],
        success_url: `${base}/pago/estado?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/pago/estado?session_id={CHECKOUT_SESSION_ID}&cancelado=1`,
        // Mínimo permitido por Stripe: 30 minutos
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        metadata: { origen: 'restaurant-martin-pos', pedido_id: pedidoId ? String(pedidoId) : '' }
    });

    const [ins] = await db.query(
        `INSERT INTO stripe_pagos (session_id, pedido_id, monto, moneda, estado, url, creado_por)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?)`,
        [session.id, pedidoId || null, montoNum, cfg.moneda, session.url, usuario]
    );
    const qr = await QRCode.toDataURL(session.url, { margin: 1, width: 320 });
    return { id: ins.insertId, session_id: session.id, url: session.url, qr, monto: montoNum, moneda: cfg.moneda, modoPrueba: cfg.modoPrueba };
}

/** Marca un cobro según la sesión de Stripe (usado por webhook y por consulta directa). */
async function actualizarDesdeSesion(session) {
    if (!session || !session.id) return;
    const pagado = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
    if (pagado) {
        await db.query(
            `UPDATE stripe_pagos SET estado = 'pagado', payment_intent = COALESCE(?, payment_intent)
             WHERE session_id = ? AND estado IN ('pendiente','expirado')`,
            [typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null, session.id]
        );
    } else if (session.status === 'expired') {
        await db.query(`UPDATE stripe_pagos SET estado = 'expirado' WHERE session_id = ? AND estado = 'pendiente'`, [session.id]);
    }
}

/** Devuelve el estado del cobro; si sigue pendiente, consulta a Stripe. */
async function consultarCobro(id) {
    const [rows] = await db.query('SELECT * FROM stripe_pagos WHERE id = ?', [id]);
    const pago = rows[0];
    if (!pago) throw new StripePublicError('Cobro no encontrado');
    if (pago.estado === 'pendiente') {
        const cfg = await getStripeConfig();
        const stripe = getClient(cfg);
        const session = await stripe.checkout.sessions.retrieve(pago.session_id);
        await actualizarDesdeSesion(session);
        const [again] = await db.query('SELECT * FROM stripe_pagos WHERE id = ?', [id]);
        return again[0];
    }
    return pago;
}

async function cancelarCobro(id) {
    const [rows] = await db.query('SELECT * FROM stripe_pagos WHERE id = ?', [id]);
    const pago = rows[0];
    if (!pago || pago.estado !== 'pendiente') return pago || null;
    try {
        const cfg = await getStripeConfig();
        await getClient(cfg).checkout.sessions.expire(pago.session_id);
    } catch (e) {
        // Si ya se pagó justo en este momento, Stripe no deja expirarla: re-consultamos.
        return consultarCobro(id);
    }
    await db.query(`UPDATE stripe_pagos SET estado = 'expirado' WHERE id = ? AND estado = 'pendiente'`, [id]);
    return { ...pago, estado: 'expirado' };
}

/**
 * Convierte pagos {metodo:'stripe', stripe_pago_id} en pagos de tarjeta verificados.
 * Se ejecuta dentro de la transacción de facturación: bloquea la fila para que un mismo
 * pago de Stripe no se aplique a dos facturas.
 * Devuelve { pagos, ids } (ids = cobros a marcar como usados con marcarUsados()).
 */
async function aplicarPagosStripe(connection, pagos) {
    if (!Array.isArray(pagos)) return { pagos, ids: [] };
    const salida = [];
    const ids = [];
    for (const p of pagos) {
        if (!p || String(p.metodo || '').toLowerCase() !== 'stripe') {
            salida.push(p);
            continue;
        }
        const id = Number(p.stripe_pago_id);
        if (!Number.isInteger(id) || id <= 0) throw new StripePublicError('Pago de Stripe sin identificador');
        // Sincroniza con Stripe por si el webhook aún no llegó
        await consultarCobro(id);
        const [rows] = await connection.query('SELECT * FROM stripe_pagos WHERE id = ? FOR UPDATE', [id]);
        const sp = rows[0];
        if (!sp) throw new StripePublicError('Pago de Stripe no encontrado');
        if (sp.estado === 'usado') throw new StripePublicError('Ese pago de Stripe ya fue aplicado a otra factura');
        if (sp.estado !== 'pagado') throw new StripePublicError('El pago de Stripe aún no está confirmado');
        ids.push(id);
        salida.push({ metodo: 'tarjeta', monto: Number(sp.monto), referencia: `Stripe ${sp.payment_intent || sp.session_id}` });
    }
    return { pagos: salida, ids };
}

async function marcarUsados(connection, ids, facturaId) {
    if (!ids || ids.length === 0) return;
    await connection.query(`UPDATE stripe_pagos SET estado = 'usado', factura_id = ? WHERE id IN (?)`, [facturaId, ids]);
}

/** Procesa un webhook firmado (body crudo). */
async function procesarWebhook(rawBody, signature) {
    const cfg = await getStripeConfig();
    if (!cfg.webhookSecret) throw new StripePublicError('Falta el webhook secret de Stripe');
    const stripe = getClient(cfg);
    const event = stripe.webhooks.constructEvent(rawBody, signature, cfg.webhookSecret);
    switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
        case 'checkout.session.expired':
            await actualizarDesdeSesion(event.data.object);
            break;
        default:
            break;
    }
    return event.type;
}

/** Estado público de una sesión (página de retorno /pago/estado). */
async function estadoPublicoSesion(sessionId) {
    const [rows] = await db.query('SELECT id, estado, monto, moneda FROM stripe_pagos WHERE session_id = ?', [sessionId]);
    if (!rows[0]) return null;
    if (rows[0].estado === 'pendiente') {
        try { return await consultarCobro(rows[0].id); } catch (_) { return rows[0]; }
    }
    return rows[0];
}

module.exports = {
    StripePublicError,
    toMinorUnits,
    fromMinorUnits,
    getStripeConfig,
    saveStripeConfig,
    probarConexion,
    crearCobro,
    consultarCobro,
    cancelarCobro,
    aplicarPagosStripe,
    marcarUsados,
    procesarWebhook,
    estadoPublicoSesion
};
