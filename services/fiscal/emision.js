// Emisión del comprobante electrónico: envía la factura al proveedor (MSeller o simulado), guarda la respuesta y consulta el estado
// hasta que sea final. Se ejecuta DESPUÉS de confirmar la venta: la venta nunca espera a la DGII ni se pierde si el proveedor falla
// (queda "pendiente" y se reintenta desde el cron y desde el botón de la pantalla Fiscal).
// Relacionado con: services/facturacion.js, services/fiscal/payload.js, services/fiscal/proveedor/*, routes/cron.js, routes/fiscal.js
const db = require('../../db');
const { enSegundoPlano } = require('../segundoPlano');
const config = require('./config');
const { construirECF } = require('./payload');
const proveedores = require('./proveedor');

const MAX_INTENTOS = 12; // pasados estos intentos hace falta que el administrador intervenga
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const FINALES = ['aceptado', 'aceptado_condicional', 'rechazado'];

async function evento(facturaId, ev, detalle, solicitud = null, respuesta = null) {
    try {
        await db.query(
            'INSERT INTO fiscal_eventos (factura_id, evento, detalle, solicitud, respuesta) VALUES (?, ?, ?, ?, ?)',
            [facturaId, ev, detalle ? String(detalle).slice(0, 1000) : null,
                solicitud ? JSON.stringify(solicitud).slice(0, 20000) : null, respuesta ? JSON.stringify(respuesta).slice(0, 20000) : null]
        );
    } catch (e) { console.error('No se pudo registrar el evento fiscal:', e.message); }
}

/** Marca la factura como "en trámite" para que dos procesos no envíen el mismo comprobante a la vez. */
async function reservar(facturaId) {
    const [r] = await db.query(
        `UPDATE facturas SET fiscal_ultimo_intento = NOW(), fiscal_intentos = fiscal_intentos + 1
         WHERE id = ? AND fiscal_estado IN ('pendiente','enviado') AND tipo_comprobante LIKE 'E%'
           AND (fiscal_ultimo_intento IS NULL OR fiscal_ultimo_intento < NOW() - interval '15 seconds')`, [facturaId]
    );
    return r.affectedRows > 0;
}

async function guardarRespuesta(facturaId, r, estadoFinal) {
    await db.query(
        `UPDATE facturas SET fiscal_estado = ?, track_id = COALESCE(?, track_id), codigo_seguridad = COALESCE(?, codigo_seguridad),
                qr_url = COALESCE(?, qr_url), fecha_firma = COALESCE(?, fecha_firma), fiscal_error = ? WHERE id = ?`,
        [estadoFinal, r.track_id || null, r.codigo_seguridad || null, r.qr_url || null, r.fecha_firma || null,
            estadoFinal === 'rechazado' ? (r.error || 'Comprobante rechazado') : null, facturaId]
    );
}

async function cargar(facturaId) {
    const [fs] = await db.query('SELECT * FROM facturas WHERE id = ?', [facturaId]);
    if (!fs[0]) return null;
    const [detalles] = await db.query(
        `SELECT d.*, p.nombre FROM detalle_factura d JOIN productos p ON p.id = d.producto_id WHERE d.factura_id = ? ORDER BY d.id`, [facturaId]
    );
    return { factura: fs[0], detalles };
}

/**
 * Envía (o consulta) un comprobante. Devuelve el estado resultante.
 * @param opciones { esperar: cuántas veces consultar el estado si el proveedor aún lo está procesando }
 */
async function procesar(facturaId, { esperar = 3 } = {}) {
    const datos = await cargar(facturaId);
    if (!datos) return { estado: 'no_encontrada' };
    const { factura, detalles } = datos;
    if (!['pendiente', 'enviado'].includes(factura.fiscal_estado) || !String(factura.tipo_comprobante || '').startsWith('E')) return { estado: factura.fiscal_estado };
    if (!(await reservar(facturaId))) return { estado: factura.fiscal_estado, ocupada: true };

    const cfg = await config.obtener(db, { secretos: true });
    const prov = proveedores.obtener(cfg);
    let r;
    try {
        if (factura.fiscal_estado === 'enviado') {
            r = await prov.consultar(cfg, factura.ncf);
        } else {
            const [sec] = await db.query(
                `SELECT vence FROM fiscal_secuencias WHERE tipo = ? AND desde <= ? AND hasta >= ? LIMIT 1`,
                [factura.tipo_comprobante, Number(factura.ncf.slice(3)), Number(factura.ncf.slice(3))]
            );
            const [pagos] = await db.query('SELECT metodo, monto FROM factura_pagos WHERE factura_id = ? ORDER BY id', [facturaId]);
            const payload = construirECF(factura, detalles, cfg, { vence: sec[0] && sec[0].vence ? new Date(sec[0].vence).toISOString().slice(0, 10) : null, pagos });
            r = await prov.enviar(cfg, payload);
            await evento(facturaId, 'envio', `${factura.ncf} → ${r.estado}`, payload, r.respuesta);
        }
    } catch (e) {
        await db.query('UPDATE facturas SET fiscal_error = ? WHERE id = ?', [String(e.message).slice(0, 500), facturaId]);
        await evento(facturaId, 'error_envio', e.message);
        return { estado: factura.fiscal_estado, error: e.message, reintentable: !!e.reintentable || !!e.config };
    }

    let estado = r.estado === 'rechazado' ? 'rechazado' : ['aceptado', 'aceptado_condicional'].includes(r.estado) ? r.estado : 'enviado';
    await guardarRespuesta(facturaId, r, estado);
    if (estado === 'rechazado') await evento(facturaId, 'rechazado', r.error, null, r.respuesta);

    // El proveedor aún está procesando: consultar unas veces con espera creciente
    for (let i = 0; i < esperar && estado === 'enviado'; i++) {
        await dormir(1500 * (i + 1));
        try {
            const c = await prov.consultar(cfg, factura.ncf);
            estado = c.estado === 'rechazado' ? 'rechazado' : ['aceptado', 'aceptado_condicional'].includes(c.estado) ? c.estado : 'enviado';
            await guardarRespuesta(facturaId, c, estado);
            if (FINALES.includes(estado)) await evento(facturaId, 'estado', `${factura.ncf} → ${estado}`, null, c.respuesta);
        } catch (_) { break; } // se sigue desde el cron
    }
    return { estado };
}

/**
 * Envía en segundo plano después de confirmar la venta (en Vercel se mantiene viva con waitUntil).
 * Aprovecha para reintentar de paso unos pocos comprobantes que hayan quedado pendientes (en Vercel gratis el cron corre solo una vez al día).
 */
function programar(facturaId) {
    return enSegundoPlano(procesar(facturaId).then(() => procesarPendientes({ limite: 3 })));
}

/** Para el cron: reintenta lo pendiente o en proceso, con espera creciente según los intentos. */
async function procesarPendientes({ limite = 20 } = {}) {
    const [rows] = await db.query(
        `SELECT id FROM facturas
         WHERE fiscal_estado IN ('pendiente','enviado') AND tipo_comprobante LIKE 'E%' AND fiscal_intentos < ?
           AND (fiscal_ultimo_intento IS NULL OR fiscal_ultimo_intento < NOW() - (LEAST(fiscal_intentos, 8) * interval '1 minute'))
         ORDER BY id LIMIT ?`, [MAX_INTENTOS, limite]
    );
    let hechas = 0;
    for (const f of rows) {
        const r = await procesar(f.id, { esperar: 1 });
        if (!r.ocupada) hechas++;
    }
    return { revisadas: rows.length, procesadas: hechas };
}

/** Botón "Reintentar" del administrador: permite volver a intentar aunque se hayan agotado los intentos. */
async function reintentar(facturaId, usuario = null) {
    const [r] = await db.query(
        `UPDATE facturas SET fiscal_intentos = 0, fiscal_ultimo_intento = NULL, fiscal_error = NULL
         WHERE id = ? AND fiscal_estado IN ('pendiente','enviado')`, [facturaId]
    );
    if (!r.affectedRows) throw Object.assign(new Error('Solo se puede reintentar un comprobante pendiente o en proceso.'), { publico: true });
    await evento(facturaId, 'reintento_manual', usuario);
    return procesar(facturaId);
}

module.exports = { procesar, programar, procesarPendientes, reintentar, MAX_INTENTOS };
