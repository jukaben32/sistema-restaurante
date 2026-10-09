// Cobros con criptomonedas (Bitcoin y Lightning) usando BTCPay Server del propio restaurante.
// Mismo patrón que services/stripe.js: el servidor crea el cobro, el POS muestra un QR, el estado se
// consulta directamente a BTCPay (no hace falta webhook, que en Vercel no se puede verificar) y al
// facturar se verifica el pago dentro de la transacción para que no se aplique dos veces.
// BTCPay: https://docs.btcpayserver.org/API/Greenfield/v1/  (usa fetch nativo, sin librerías).
//
// Relacionado con: routes/cripto.js, services/facturacion.js, routes/facturas.js, services/delivery.js,
// views/configuracion_cripto.ejs, public/js/cripto-cobro.js
const QRCode = require('qrcode');
const db = require('../db');
const { encrypt, decrypt } = require('./crypto');

class CriptoPublicError extends Error {
    constructor(message) {
        super(message);
        this.publico = true;
    }
}

const TIMEOUT_MS = 15000;

async function getCriptoConfig() {
    const [rows] = await db.query(
        `SELECT cripto_habilitado, btcpay_url, btcpay_store_id, btcpay_api_key_enc, cripto_moneda, cripto_tasa, moneda, nombre_negocio
         FROM configuracion_impresion ORDER BY id LIMIT 1`
    );
    const c = rows[0] || {};
    let apiKey = null;
    try { apiKey = decrypt(c.btcpay_api_key_enc); } catch (e) { console.error('No se pudo descifrar la llave de BTCPay:', e.message); }
    const url = String(c.btcpay_url || '').trim().replace(/\/+$/, '');
    const storeId = String(c.btcpay_store_id || '').trim();
    return {
        habilitado: Number(c.cripto_habilitado || 0) === 1 && !!(apiKey && url && storeId),
        url,
        storeId,
        apiKey,
        monedaNegocio: String(c.moneda || 'dop').toLowerCase(),
        monedaCripto: String(c.cripto_moneda || c.moneda || 'dop').toLowerCase(),
        tasa: c.cripto_tasa != null ? Number(c.cripto_tasa) : null,
        nombreNegocio: c.nombre_negocio || 'Restaurante'
    };
}

/** Guarda la configuración (la API key se cifra; vacía = conservar la actual). */
async function saveCriptoConfig({ habilitado, url, storeId, apiKey, monedaCripto, tasa }) {
    const [rows] = await db.query('SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1');
    if (!rows[0]) await db.query(`INSERT INTO configuracion_impresion (nombre_negocio) VALUES ('Restaurant Martin')`);
    const sets = ['cripto_habilitado = ?', 'btcpay_url = ?', 'btcpay_store_id = ?', 'cripto_moneda = ?', 'cripto_tasa = ?'];
    const vals = [habilitado ? 1 : 0, url || null, storeId || null, String(monedaCripto || 'dop').toLowerCase().slice(0, 3), tasa > 0 ? tasa : null];
    if (apiKey) { sets.push('btcpay_api_key_enc = ?'); vals.push(encrypt(apiKey)); }
    await db.query(
        `UPDATE configuracion_impresion SET ${sets.join(', ')} WHERE id = (SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1)`,
        vals
    );
}

function exigirConfig(cfg) {
    if (!cfg.url || !cfg.storeId || !cfg.apiKey) throw new CriptoPublicError('BTCPay no está configurado (falta la URL, el Store ID o la API key)');
}

/** Llamada a la API Greenfield de BTCPay. */
async function btcpay(cfg, metodo, ruta, cuerpo) {
    exigirConfig(cfg);
    let resp;
    try {
        resp = await fetch(`${cfg.url}/api/v1${ruta}`, {
            method: metodo,
            headers: { Authorization: `token ${cfg.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: cuerpo ? JSON.stringify(cuerpo) : undefined,
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (e) {
        throw new CriptoPublicError(`No se pudo conectar con BTCPay (${e.name === 'TimeoutError' ? 'tardó demasiado' : e.message})`);
    }
    const texto = await resp.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch (_) { /* respuesta no JSON */ }
    if (!resp.ok) {
        const detalle = (datos && (datos.message || (Array.isArray(datos) && datos[0] && datos[0].message))) || `HTTP ${resp.status}`;
        if (resp.status === 401 || resp.status === 403) throw new CriptoPublicError('BTCPay rechazó la API key (revisa sus permisos y el Store ID)');
        throw new CriptoPublicError(`BTCPay: ${detalle}`);
    }
    return datos;
}

/** Verifica la conexión (botón "Probar conexión"). */
async function probarConexion() {
    const cfg = await getCriptoConfig();
    const tienda = await btcpay(cfg, 'GET', `/stores/${encodeURIComponent(cfg.storeId)}`);
    // Un cobro de prueba por 1 unidad confirma que la tienda tiene billetera y tasa de cambio para la moneda
    let tasaOk = true; let aviso = null;
    try {
        const inv = await crearFactura(cfg, 1, 'Prueba de conexión', 'prueba', 15);
        await btcpay(cfg, 'POST', `/stores/${encodeURIComponent(cfg.storeId)}/invoices/${encodeURIComponent(inv.id)}/status`, { status: 'Invalid' }).catch(() => {});
    } catch (e) { tasaOk = false; aviso = e.message; }
    return { ok: true, tienda: tienda.name || cfg.storeId, tasaOk, aviso };
}

function aMonedaCripto(cfg, monto) {
    const m = Number(monto);
    if (cfg.monedaCripto === cfg.monedaNegocio) return m;
    if (!(cfg.tasa > 0)) throw new CriptoPublicError(`Falta la tasa de cambio: indica cuántos ${cfg.monedaNegocio.toUpperCase()} vale 1 ${cfg.monedaCripto.toUpperCase()} (Configuración → Pagos con cripto)`);
    return m / cfg.tasa;
}

async function crearFactura(cfg, monto, descripcion, referencia, expiraMin, redirectURL = null) {
    return btcpay(cfg, 'POST', `/stores/${encodeURIComponent(cfg.storeId)}/invoices`, {
        amount: Number(aMonedaCripto(cfg, monto)).toFixed(2),
        currency: cfg.monedaCripto.toUpperCase(),
        metadata: { orderId: String(referencia || ''), itemDesc: descripcion, origen: 'restaurant-martin-pos' },
        checkout: { expirationMinutes: Math.min(1440, Math.max(10, Number(expiraMin) || 30)), speedPolicy: 'HighSpeed', ...(redirectURL ? { redirectURL, redirectAutomatically: true } : {}) }
    });
}

/** Separa los métodos de pago de una factura de BTCPay en Lightning y on-chain (nombres nuevos y antiguos). */
function leerMetodos(lista) {
    const salida = { lightning: null, onchain: null, montoBtc: null };
    for (const m of Array.isArray(lista) ? lista : []) {
        const id = String(m.paymentMethodId || m.paymentMethod || '');
        if (!/^BTC/i.test(id)) continue;
        const enlace = m.paymentLink || m.destination || null;
        if (/LN|Lightning/i.test(id)) {
            if (!salida.lightning) { salida.lightning = enlace && !/^lightning:/i.test(enlace) ? `lightning:${enlace.toUpperCase()}` : enlace; salida.montoBtc = salida.montoBtc || m.amount || null; }
        } else if (!salida.onchain) {
            salida.onchain = enlace; salida.montoBtc = m.amount || salida.montoBtc;
        }
    }
    return salida;
}

async function qrDe(texto) {
    return texto ? QRCode.toDataURL(texto, { margin: 1, width: 320, errorCorrectionLevel: 'L' }) : null;
}

/** Crea un cobro y devuelve los enlaces y QR (Lightning y on-chain) para que el cliente pague. */
async function crearCobro({ monto, pedidoId = null, descripcion, usuario = null, expiraMin = 30, retornoUrl = null }) {
    const cfg = await getCriptoConfig();
    if (!cfg.habilitado) throw new CriptoPublicError('Los pagos con cripto no están habilitados (Configuración → Pagos con cripto)');
    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) throw new CriptoPublicError('Monto inválido para cobrar con cripto');

    const inv = await crearFactura(cfg, montoNum, descripcion || `Consumo en ${cfg.nombreNegocio}`, pedidoId ? `pedido-${pedidoId}` : 'pos', expiraMin, retornoUrl);
    const m = leerMetodos(await btcpay(cfg, 'GET', `/stores/${encodeURIComponent(cfg.storeId)}/invoices/${encodeURIComponent(inv.id)}/payment-methods`).catch(() => []));
    const checkout = inv.checkoutLink || `${cfg.url}/i/${inv.id}`;

    const [ins] = await db.query(
        `INSERT INTO cripto_pagos (invoice_id, pedido_id, monto, moneda, estado, checkout_url, lightning, onchain, monto_btc, creado_por)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?)`,
        [inv.id, pedidoId || null, montoNum, cfg.monedaNegocio, checkout, m.lightning, m.onchain, m.montoBtc ? String(m.montoBtc) : null, usuario]
    );
    return {
        id: ins.insertId, invoice_id: inv.id, url: checkout, monto: montoNum, moneda: cfg.monedaNegocio,
        monto_btc: m.montoBtc, lightning: m.lightning, onchain: m.onchain,
        qr_lightning: await qrDe(m.lightning), qr_onchain: await qrDe(m.onchain), qr_checkout: await qrDe(checkout)
    };
}

const ESTADOS = { New: 'pendiente', Processing: 'procesando', Settled: 'pagado', Expired: 'expirado', Invalid: 'invalido' };

/** Actualiza el cobro según la factura de BTCPay. */
async function actualizarDesdeFactura(invoice) {
    if (!invoice || !invoice.id) return;
    const estado = ESTADOS[invoice.status];
    if (!estado || estado === 'pendiente') return;
    const [upd] = await db.query(
        `UPDATE cripto_pagos SET estado = ? WHERE invoice_id = ? AND estado IN ('pendiente','procesando') OR (invoice_id = ? AND estado = 'expirado' AND ? = 'pagado')`,
        [estado, invoice.id, invoice.id, estado]
    );
    if (estado === 'pagado' && upd.affectedRows > 0) {
        // Pago de un pedido de delivery / para llevar: avisar al personal y al cliente (una sola vez)
        try {
            const [ped] = await db.query(
                `SELECT p.id FROM cripto_pagos cp JOIN pedidos p ON p.id = cp.pedido_id WHERE cp.invoice_id = ? AND p.tipo <> 'mesa'`,
                [invoice.id]
            );
            if (ped[0]) {
                await db.query(`INSERT INTO mesa_alertas (pedido_id, tipo, mensaje) VALUES (?, 'pago_recibido', 'Pago con cripto confirmado')`, [ped[0].id]);
                require('./segundoPlano').enSegundoPlano(require('./agente/avisos').pedido(ped[0].id, 'pago'));
            }
        } catch (e) { console.error('No se pudo registrar el aviso de pago cripto:', e.message); }
    }
}

/** Devuelve el estado del cobro; si sigue pendiente o en proceso, consulta a BTCPay. */
async function consultarCobro(id) {
    const [rows] = await db.query('SELECT * FROM cripto_pagos WHERE id = ?', [id]);
    const pago = rows[0];
    if (!pago) throw new CriptoPublicError('Cobro no encontrado');
    if (['pendiente', 'procesando'].includes(pago.estado)) {
        const cfg = await getCriptoConfig();
        const inv = await btcpay(cfg, 'GET', `/stores/${encodeURIComponent(cfg.storeId)}/invoices/${encodeURIComponent(pago.invoice_id)}`);
        await actualizarDesdeFactura(inv);
        const [again] = await db.query('SELECT * FROM cripto_pagos WHERE id = ?', [id]);
        return again[0];
    }
    return pago;
}

async function cancelarCobro(id) {
    const [rows] = await db.query('SELECT * FROM cripto_pagos WHERE id = ?', [id]);
    const pago = rows[0];
    if (!pago || pago.estado !== 'pendiente') return pago || null;
    try {
        const cfg = await getCriptoConfig();
        await btcpay(cfg, 'POST', `/stores/${encodeURIComponent(cfg.storeId)}/invoices/${encodeURIComponent(pago.invoice_id)}/status`, { status: 'Invalid' });
    } catch (e) {
        // Si ya se pagó (o BTCPay no responde), re-consultamos en vez de dar por cancelado
        return consultarCobro(id).catch(() => pago);
    }
    await db.query(`UPDATE cripto_pagos SET estado = 'invalido' WHERE id = ? AND estado = 'pendiente'`, [id]);
    return { ...pago, estado: 'invalido' };
}

/**
 * Convierte pagos {metodo:'cripto', cripto_pago_id} en pagos verificados.
 * Se ejecuta dentro de la transacción de facturación: bloquea la fila para que un mismo cobro
 * no se aplique a dos facturas. Devuelve { pagos, ids } (ids se marcan con marcarUsados()).
 */
async function aplicarPagosCripto(connection, pagos) {
    if (!Array.isArray(pagos)) return { pagos, ids: [] };
    const salida = [];
    const ids = [];
    for (const p of pagos) {
        if (!p || String(p.metodo || '').toLowerCase() !== 'cripto') {
            salida.push(p);
            continue;
        }
        const id = Number(p.cripto_pago_id);
        if (!Number.isInteger(id) || id <= 0) throw new CriptoPublicError('Pago cripto sin identificador');
        await consultarCobro(id); // sincroniza con BTCPay
        const [rows] = await connection.query('SELECT * FROM cripto_pagos WHERE id = ? FOR UPDATE', [id]);
        const cp = rows[0];
        if (!cp) throw new CriptoPublicError('Pago cripto no encontrado');
        if (cp.estado === 'usado') throw new CriptoPublicError('Ese pago cripto ya fue aplicado a otra factura');
        if (cp.estado !== 'pagado') throw new CriptoPublicError('El pago cripto aún no está confirmado');
        ids.push(id);
        salida.push({ metodo: 'cripto', monto: Number(cp.monto), referencia: `BTCPay ${cp.invoice_id}` });
    }
    return { pagos: salida, ids };
}

async function marcarUsados(connection, ids, facturaId) {
    if (!ids || ids.length === 0) return;
    await connection.query(`UPDATE cripto_pagos SET estado = 'usado', factura_id = ? WHERE id IN (?)`, [facturaId, ids]);
}

/** Mantenimiento (cron): sincroniza cobros pendientes de pedidos de las últimas 24 h. */
async function sincronizarPendientes() {
    const [rows] = await db.query(
        `SELECT id FROM cripto_pagos WHERE estado IN ('pendiente','procesando') AND created_at >= NOW() - INTERVAL '24 hours' LIMIT 50`
    );
    let n = 0;
    for (const r of rows) {
        try { await consultarCobro(r.id); n++; } catch (_) { /* BTCPay sin configurar o sin red */ }
    }
    return n;
}

module.exports = {
    CriptoPublicError,
    getCriptoConfig,
    saveCriptoConfig,
    probarConexion,
    crearCobro,
    consultarCobro,
    cancelarCobro,
    aplicarPagosCripto,
    marcarUsados,
    sincronizarPendientes,
    qrDe
};
