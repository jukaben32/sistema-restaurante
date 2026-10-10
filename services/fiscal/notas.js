// Notas de crédito (E34 / B04): la forma correcta de "anular" o devolver parte de una factura fiscal.
// La factura original NO se toca (la protege un trigger). La nota guarda montos NEGATIVOS, así los reportes de ventas,
// el dashboard y los totales por método de pago restan solos; al DGII y al ticket se envían en positivo (payload.js).
// Solo el administrador puede emitirlas (routes/fiscal.js). También funciona con facturas "no fiscales" (modo práctica).
// Relacionado con: services/fiscal/emision.js, services/inventario.js, routes/fiscal.js
const crypto = require('crypto');
const db = require('../../db');
const config = require('./config');
const calculo = require('./calculo');
const secuencias = require('./secuencias');
const inventario = require('../inventario');
const { ErrorPublico } = require('../errores');

const r2 = calculo.round2;
const ESTADOS_NOTA_VALIDOS = ['aceptado', 'aceptado_condicional', 'contingencia', 'no_fiscal'];

/**
 * @param opts { facturaId, items?: [{ detalle_id, cantidad }] (vacío = anular toda la factura), motivo, devolverInventario?, usuario }
 * @returns { notaId, ncf, total, fiscal_estado }  — quien llama debe hacer `emision.programar(notaId)` después del commit
 */
async function emitir({ facturaId, items = [], motivo, devolverInventario = false, usuario = null }) {
    const texto = String(motivo || '').trim();
    if (texto.length < 5) throw new ErrorPublico('Escribe el motivo de la nota de crédito (mínimo 5 letras).');
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const cfg = await config.obtener(conn);
        const [fs] = await conn.query('SELECT * FROM facturas WHERE id = ? FOR UPDATE', [facturaId]);
        const orig = fs[0];
        if (!orig) throw new ErrorPublico('Factura no encontrada');
        if (orig.factura_origen_id) throw new ErrorPublico('Una nota de crédito no se puede anular: emite una nueva factura si hace falta.');
        if (!ESTADOS_NOTA_VALIDOS.includes(orig.fiscal_estado)) {
            throw new ErrorPublico(orig.fiscal_estado === 'rechazado'
                ? 'Esta factura fue rechazada por la DGII: no tiene validez, así que no lleva nota de crédito. Revisa el error en Fiscal.'
                : 'Esta factura todavía se está enviando a la DGII. Espera a que sea aceptada para anularla.');
        }

        const [lineas] = await conn.query(
            `SELECT d.*, COALESCE((SELECT SUM(-n.cantidad) FROM detalle_factura n WHERE n.detalle_origen_id = d.id), 0) AS devuelta,
                    COALESCE((SELECT SUM(-n.base) FROM detalle_factura n WHERE n.detalle_origen_id = d.id), 0) AS base_devuelta,
                    COALESCE((SELECT SUM(-n.itbis) FROM detalle_factura n WHERE n.detalle_origen_id = d.id), 0) AS itbis_devuelto,
                    COALESCE((SELECT SUM(-n.subtotal) FROM detalle_factura n WHERE n.detalle_origen_id = d.id), 0) AS importe_devuelto
             FROM detalle_factura d WHERE d.factura_id = ? ORDER BY d.id`, [facturaId]
        );
        if (!lineas.length) throw new ErrorPublico('La factura no tiene líneas');

        // ¿Qué se devuelve? Todo lo que reste, o las cantidades indicadas
        const pedido = new Map();
        if (Array.isArray(items) && items.length) {
            for (const it of items) {
                const cant = Number(it.cantidad);
                if (!Number.isFinite(cant) || cant <= 0) continue;
                pedido.set(Number(it.detalle_id), (pedido.get(Number(it.detalle_id)) || 0) + cant);
            }
            if (!pedido.size) throw new ErrorPublico('Indica qué platos se devuelven y en qué cantidad.');
        }
        const total_completo = pedido.size === 0;
        const devolver = [];
        for (const l of lineas) {
            const resta = r2(Number(l.cantidad) - Number(l.devuelta));
            const quiere = total_completo ? resta : (pedido.get(Number(l.id)) || 0);
            if (!(quiere > 0)) continue;
            if (quiere > resta + 0.0001) throw new ErrorPublico(`De la línea ${l.id} solo quedan ${resta} por devolver.`);
            const ultima = Math.abs(quiere - resta) < 0.0001; // devuelve todo lo que quedaba: toma el resto exacto (sin centavos sueltos)
            const frac = quiere / Number(l.cantidad);
            const base = ultima ? r2(Number(l.base ?? l.subtotal) - Number(l.base_devuelta)) : r2(Number(l.base ?? l.subtotal) * frac);
            const itbis = ultima ? r2(Number(l.itbis || 0) - Number(l.itbis_devuelto)) : r2(Number(l.itbis || 0) * frac);
            const importe = ultima ? r2(Number(l.subtotal) - Number(l.importe_devuelto)) : r2(Number(l.subtotal) * frac);
            devolver.push({ l, cantidad: quiere, base, itbis, importe, ultima });
        }
        if (!devolver.length) throw new ErrorPublico(total_completo ? 'Esta factura ya fue devuelta por completo.' : 'No hay nada que devolver con esas cantidades.');
        for (const x of devolver) { if (pedido.size && !lineas.some((l) => Number(l.id) === Number(x.l.id))) throw new ErrorPublico('Línea inválida'); }
        for (const id of pedido.keys()) if (!lineas.some((l) => Number(l.id) === id)) throw new ErrorPublico('Una de las líneas no pertenece a esta factura.');

        // Propina: proporcional a la base de consumo devuelta; si se devuelve todo el consumo, toma lo que reste
        const baseConsumoTotal = r2(lineas.filter((l) => !Number(l.es_envio)).reduce((a, l) => a + Number(l.base ?? l.subtotal), 0));
        const baseConsumoDev = r2(devolver.filter((x) => !Number(x.l.es_envio)).reduce((a, x) => a + x.base, 0));
        const [[pdev]] = await conn.query(`SELECT COALESCE(SUM(-propina), 0) AS p FROM facturas WHERE factura_origen_id = ?`, [facturaId]);
        const propinaResta = r2(Number(orig.propina) - Number(pdev.p));
        const todoConsumoDevuelto = lineas.filter((l) => !Number(l.es_envio)).every((l) => {
            const x = devolver.find((d) => Number(d.l.id) === Number(l.id));
            return Number(l.cantidad) - Number(l.devuelta) - (x ? x.cantidad : 0) < 0.0001;
        });
        const propina = Number(orig.propina) > 0 && baseConsumoTotal > 0
            ? (todoConsumoDevuelto ? propinaResta : Math.min(propinaResta, r2(Number(orig.propina) * baseConsumoDev / baseConsumoTotal)))
            : 0;

        const suma = (clave) => r2(devolver.filter((x) => String(x.l.itbis_tasa) === clave).reduce((a, x) => a + x.base, 0));
        const itbis_total = r2(devolver.reduce((a, x) => a + x.itbis, 0));
        const importes = r2(devolver.reduce((a, x) => a + x.base + x.itbis, 0));
        const sinImpuestos = String(orig.fiscal_estado) === 'no_fiscal';
        const total = sinImpuestos ? r2(devolver.reduce((a, x) => a + x.importe, 0)) : r2(importes + propina);
        if (!(total > 0)) throw new ErrorPublico('El total de la nota de crédito es 0.');

        // Número del comprobante
        let tipo = null, ncf = null, estado = 'no_fiscal', token = null;
        if (!sinImpuestos) {
            const esB = !String(orig.tipo_comprobante).startsWith('E');
            tipo = esB ? 'B04' : 'E34';
            const a = await secuencias.asignar(conn, tipo, { produccion: orig.fiscal_modo === 'ecf_produccion' });
            ncf = a.ncf;
            estado = esB ? (cfg.modo === 'ncf_b' ? 'aceptado' : 'contingencia') : 'pendiente';
            token = crypto.randomBytes(16).toString('hex');
        }
        const dias = (Date.now() - new Date(orig.fecha).getTime()) / 86400000;
        const completa = lineas.every((l) => {
            const x = devolver.find((d) => Number(d.l.id) === Number(l.id));
            return Number(l.cantidad) - Number(l.devuelta) - (x ? x.cantidad : 0) < 0.0001;
        });

        const [ins] = await conn.query(
            `INSERT INTO facturas (cliente_id, total, forma_pago, fiscal_estado, fiscal_modo, tipo_comprobante, ncf, token_publico,
                subtotal_gravado_18, subtotal_gravado_16, subtotal_gravado_0, subtotal_exento, itbis_total, propina,
                comprador_documento, comprador_tipo_doc, comprador_nombre,
                ncf_modificado, codigo_modificacion, factura_origen_id, motivo_nota, indicador_nota_credito, fecha_ncf_modificado)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [orig.cliente_id, -total, orig.forma_pago, estado, orig.fiscal_modo, tipo, ncf, token,
                -suma('18'), -suma('16'), -suma('0'), -suma('E'), -itbis_total, -propina,
                orig.comprador_documento, orig.comprador_tipo_doc, orig.comprador_nombre,
                orig.ncf, completa ? 1 : 3, facturaId, texto.slice(0, 500), dias > 30 ? 1 : 0, orig.fecha]
        );
        const notaId = ins.insertId;

        await conn.query(
            `INSERT INTO detalle_factura (factura_id, producto_id, cantidad, precio_unitario, unidad_medida, subtotal, itbis_tasa, base, itbis, es_envio, detalle_origen_id) VALUES ?`,
            [devolver.map((x) => [notaId, x.l.producto_id, -x.cantidad, x.l.precio_unitario, x.l.unidad_medida, -x.importe, x.l.itbis_tasa, -x.base, -x.itbis, x.l.es_envio, x.l.id])]
        );
        // Reembolso: por el medio principal de la venta original (puede ajustarse a mano en caja)
        const [pg] = await conn.query('SELECT metodo FROM factura_pagos WHERE factura_id = ? ORDER BY monto DESC, id LIMIT 1', [facturaId]);
        await conn.query('INSERT INTO factura_pagos (factura_id, metodo, monto, referencia) VALUES (?, ?, ?, ?)',
            [notaId, pg[0] ? pg[0].metodo : 'efectivo', -total, `Reembolso de ${orig.ncf || `#${facturaId}`}`]);
        if (devolverInventario) await inventario.descontarPorFactura(conn, notaId, usuario);
        await conn.query(`INSERT INTO fiscal_eventos (factura_id, evento, detalle, usuario) VALUES (?, 'nota_credito', ?, ?)`,
            [notaId, `${ncf || 'sin NCF'} modifica ${orig.ncf || `#${facturaId}`}: ${texto}`.slice(0, 500), usuario]);
        await conn.commit();
        return { notaId, ncf, total, fiscal_estado: estado, completa };
    } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
    } finally {
        conn.release();
    }
}

module.exports = { emitir };
