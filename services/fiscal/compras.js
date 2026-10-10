// Compras y gastos del restaurante: proveedores con RNC/cédula validados y facturas de compra con todos los campos del formato 606.
// Una compra puede registrar a la vez la entrada de insumos al inventario.
// Relacionado con: services/fiscal/reportes.js (606), routes/compras.js, services/inventario.js
const db = require('../../db');
const calculo = require('./calculo');
const inventario = require('../inventario');

const err = (m) => Object.assign(new Error(m), { publico: true });
const r2 = calculo.round2;

// Tipos de bienes y servicios comprados (606, columna 3)
const TIPOS_BIENES = {
    '01': 'Gastos de personal', '02': 'Gastos por trabajos, suministros y servicios', '03': 'Arrendamientos', '04': 'Gastos de activos fijos',
    '05': 'Gastos de representación', '06': 'Otras deducciones admitidas', '07': 'Gastos financieros', '08': 'Gastos extraordinarios',
    '09': 'Compras y gastos que formarán parte del costo de venta', '10': 'Adquisiciones de activos', '11': 'Gastos de seguros'
};
// Forma de pago (606, columna 23)
const FORMAS_PAGO = { '01': 'Efectivo', '02': 'Cheque / transferencia / depósito', '03': 'Tarjeta crédito / débito', '04': 'Compra a crédito', '05': 'Permuta', '06': 'Nota de crédito', '07': 'Mixto' };

async function listarProveedores() {
    const [rows] = await db.query('SELECT * FROM proveedores WHERE activo = 1 ORDER BY nombre');
    return rows;
}

async function guardarProveedor({ id, tipo_documento, documento, nombre, telefono }) {
    const tipo = ['rnc', 'cedula'].includes(tipo_documento) ? tipo_documento : tipoPorLongitud(documento);
    const doc = calculo.normalizarDocumento(tipo, documento);
    if (!tipo || !calculo.validarDocumento(tipo, doc)) throw err('El RNC (9 dígitos) o la cédula (11 dígitos) del proveedor no es válido. Revisa el número.');
    const nom = String(nombre || '').trim().slice(0, 150);
    if (nom.length < 2) throw err('Escribe el nombre del proveedor.');
    const tel = String(telefono || '').trim().slice(0, 30) || null;
    if (id) {
        const [r] = await db.query('UPDATE proveedores SET tipo_documento = ?, documento = ?, nombre = ?, telefono = ? WHERE id = ?', [tipo, doc, nom, tel, id]);
        if (!r.affectedRows) throw err('Proveedor no encontrado');
        return { id: Number(id) };
    }
    const [dup] = await db.query('SELECT id FROM proveedores WHERE documento = ?', [doc]);
    if (dup[0]) throw err('Ya existe un proveedor con ese RNC / cédula.');
    const [r] = await db.query('INSERT INTO proveedores (tipo_documento, documento, nombre, telefono) VALUES (?, ?, ?, ?)', [tipo, doc, nom, tel]);
    return { id: r.insertId };
}
const tipoPorLongitud = (d) => calculo.tipoDocumentoPorLongitud(d);

const monto = (v, campo) => {
    const n = Number(v == null || v === '' ? 0 : v);
    if (!Number.isFinite(n) || n < 0) throw err(`El monto "${campo}" no es válido.`);
    return r2(n);
};
const hoyISO = () => new Date().toISOString().slice(0, 10);

async function crearCompra(b, usuario = null) {
    const [prov] = await db.query('SELECT id FROM proveedores WHERE id = ? AND activo = 1', [b.proveedor_id]);
    if (!prov[0]) throw err('Elige un proveedor.');
    const ncf = String(b.ncf || '').trim().toUpperCase();
    if (!calculo.validarNCF(ncf)) throw err('El NCF no es válido. Debe tener 11 caracteres si es NCF (ejemplo B0100000123) o 13 si es e-CF (ejemplo E310000000123).');
    const ncfMod = String(b.ncf_modificado || '').trim().toUpperCase() || null;
    if (ncfMod && !calculo.validarNCF(ncfMod)) throw err('El NCF modificado no es válido.');
    if (/^(B04|E34)/.test(ncf) && !ncfMod) throw err('Una nota de crédito de un proveedor debe indicar el NCF que modifica.');
    const fecha = String(b.fecha_comprobante || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoyISO()) throw err('La fecha del comprobante es inválida (no puede ser futura).');
    const fechaPago = b.fecha_pago ? String(b.fecha_pago) : null;
    if (fechaPago && (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago) || fechaPago < fecha)) throw err('La fecha de pago no puede ser anterior al comprobante.');
    const tipoBS = String(b.tipo_bienes_servicios || '02').padStart(2, '0');
    if (!TIPOS_BIENES[tipoBS]) throw err('Tipo de bienes y servicios inválido.');
    const forma = String(b.forma_pago || '01').padStart(2, '0');
    if (!FORMAS_PAGO[forma]) throw err('Forma de pago inválida.');

    const servicios = monto(b.monto_servicios, 'servicios');
    const bienes = monto(b.monto_bienes, 'bienes');
    if (servicios + bienes <= 0) throw err('Indica el monto facturado en servicios o en bienes.');
    const itbisFacturado = monto(b.itbis_facturado, 'ITBIS facturado');
    const itbisRetenido = monto(b.itbis_retenido, 'ITBIS retenido');
    const itbisCosto = monto(b.itbis_costo, 'ITBIS al costo');
    const itbisProp = monto(b.itbis_proporcionalidad, 'ITBIS proporcionalidad');
    if (itbisFacturado > r2((servicios + bienes) * 0.3)) throw err('El ITBIS facturado parece demasiado alto para ese monto. Revisa los números.');
    // ITBIS por adelantar = facturado - llevado al costo - proporcionalidad (si no se indica)
    const itbisAdelantar = b.itbis_adelantar != null && b.itbis_adelantar !== '' ? monto(b.itbis_adelantar, 'ITBIS por adelantar') : Math.max(0, r2(itbisFacturado - itbisCosto - itbisProp));
    const tipoRet = b.tipo_retencion_isr ? String(b.tipo_retencion_isr).padStart(2, '0') : null;

    try {
        const [r] = await db.query(
            `INSERT INTO compras (proveedor_id, tipo_bienes_servicios, ncf, ncf_modificado, fecha_comprobante, fecha_pago, monto_servicios, monto_bienes,
                itbis_facturado, itbis_retenido, itbis_proporcionalidad, itbis_costo, itbis_adelantar, itbis_percibido, tipo_retencion_isr, monto_retencion_renta,
                isr_percibido, isc, otros_impuestos, propina, forma_pago, nota, usuario)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [prov[0].id, tipoBS, ncf, ncfMod, fecha, fechaPago, servicios, bienes, itbisFacturado, itbisRetenido, itbisProp, itbisCosto, itbisAdelantar,
                monto(b.itbis_percibido, 'ITBIS percibido'), tipoRet, monto(b.monto_retencion_renta, 'retención de renta'), monto(b.isr_percibido, 'ISR percibido'),
                monto(b.isc, 'ISC'), monto(b.otros_impuestos, 'otros impuestos'), monto(b.propina, 'propina'), forma, String(b.nota || '').slice(0, 500) || null, usuario]
        );
        // Entrada de inventario en el mismo paso (opcional)
        const entradas = Array.isArray(b.entradas) ? b.entradas : [];
        for (const e of entradas) {
            if (!e || !e.insumo_id || !(Number(e.cantidad) > 0)) continue;
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                await inventario.registrarMovimiento(conn, { insumoId: e.insumo_id, tipo: 'entrada', cantidad: e.cantidad, unidad: e.unidad, nota: `Compra ${ncf}`, usuario });
                await conn.commit();
            } catch (x) { await conn.rollback().catch(() => {}); throw x; } finally { conn.release(); }
        }
        return { id: r.insertId };
    } catch (e) {
        if (e && (e.code === '23505' || e.code === 'ER_DUP_ENTRY')) throw err('Esa factura de compra ya está registrada para ese proveedor.');
        throw e;
    }
}

async function listarCompras(mes) {
    const [rows] = await db.query(
        `SELECT c.*, p.nombre AS proveedor, p.documento, p.tipo_documento
         FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
         WHERE (?::text IS NULL OR to_char(c.fecha_comprobante, 'YYYY-MM') = ?) ORDER BY c.fecha_comprobante DESC, c.id DESC LIMIT 500`, [mes || null, mes || null]
    );
    return rows;
}

async function eliminarCompra(id) {
    const [r] = await db.query('DELETE FROM compras WHERE id = ?', [id]);
    if (!r.affectedRows) throw err('Compra no encontrada');
}

module.exports = { TIPOS_BIENES, FORMAS_PAGO, listarProveedores, guardarProveedor, crearCompra, listarCompras, eliminarCompra };
