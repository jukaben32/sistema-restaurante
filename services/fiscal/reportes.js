// Reportes para la DGII: 606 (compras), 607 (ventas), 608 (comprobantes anulados) y el resumen mensual para el IT-1, más la propina legal.
// Cada reporte devuelve `filas` (para mostrar en pantalla y en Excel) y `txt` (archivo para subir a la Oficina Virtual).
// ⚠️ Los diseños de registro siguen las Normas Generales 07-2018 / 05-2019 de la DGII; antes del primer envío real, valida el TXT con la
// herramienta de prevalidación de la DGII (el contador lo hace en un minuto). Los montos de ventas se informan sin ITBIS ni propina.
// Relacionado con: routes/fiscal.js, routes/compras.js
const ExcelJS = require('exceljs');
const db = require('../../db');
const config = require('./config');
const calculo = require('./calculo');

const r2 = calculo.round2;
const TZ = 'America/Santo_Domingo';
const err = (m) => Object.assign(new Error(m), { publico: true });
const num = (n) => Number(n || 0).toFixed(2);

function validarMes(mes) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(mes || ''))) throw err('Indica el mes con el formato AAAA-MM.');
    return String(mes);
}
const periodo = (mes) => mes.replace('-', '');

async function rncEmisor() {
    const cfg = await config.obtener();
    return calculo.normalizarDocumento('rnc', cfg.emisor.rnc);
}

function armarTxt(codigo, rnc, mes, lineas) {
    const cab = [codigo, rnc, periodo(mes), String(lineas.length)].join('|');
    return [cab, ...lineas.map((l) => l.join('|'))].join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- 606 (compras)
const COLS_606 = ['RNC/Cédula', 'Tipo ID', 'Tipo de bienes y servicios', 'NCF', 'NCF modificado', 'Fecha comprobante', 'Fecha pago',
    'Servicios', 'Bienes', 'Total facturado', 'ITBIS facturado', 'ITBIS retenido', 'ITBIS proporcionalidad', 'ITBIS al costo', 'ITBIS por adelantar',
    'ITBIS percibido', 'Tipo retención ISR', 'Retención renta', 'ISR percibido', 'ISC', 'Otros impuestos', 'Propina legal', 'Forma de pago'];

async function reporte606(mes) {
    mes = validarMes(mes);
    const [rows] = await db.query(
        `SELECT c.*, p.documento, p.tipo_documento, p.nombre
         FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
         WHERE to_char(c.fecha_comprobante, 'YYYY-MM') = ? ORDER BY c.fecha_comprobante, c.id`, [mes]
    );
    const fecha = (d) => (d ? new Date(d).toISOString().slice(0, 10).replace(/-/g, '') : '');
    const lineas = rows.map((c) => {
        const total = r2(Number(c.monto_servicios) + Number(c.monto_bienes));
        return [calculo.normalizarDocumento(c.tipo_documento, c.documento), c.tipo_documento === 'cedula' ? '2' : '1', c.tipo_bienes_servicios, c.ncf, c.ncf_modificado || '',
            fecha(c.fecha_comprobante), fecha(c.fecha_pago), num(c.monto_servicios), num(c.monto_bienes), num(total), num(c.itbis_facturado), num(c.itbis_retenido),
            num(c.itbis_proporcionalidad), num(c.itbis_costo), num(c.itbis_adelantar), num(c.itbis_percibido), c.tipo_retencion_isr || '', num(c.monto_retencion_renta),
            num(c.isr_percibido), num(c.isc), num(c.otros_impuestos), num(c.propina), c.forma_pago];
    });
    return { mes, columnas: COLS_606, filas: lineas, txt: armarTxt('606', await rncEmisor(), mes, lineas), total: lineas.length };
}

// ---------------------------------------------------------------- 607 (ventas)
const COLS_607 = ['RNC/Cédula/Pasaporte', 'Tipo ID', 'NCF', 'NCF modificado', 'Tipo de ingreso', 'Fecha comprobante', 'Fecha retención', 'Monto facturado',
    'ITBIS facturado', 'ITBIS retenido', 'ITBIS percibido', 'Retención renta', 'ISR percibido', 'ISC', 'Otros impuestos', 'Propina legal',
    'Efectivo', 'Cheque/transferencia/depósito', 'Tarjeta', 'Venta a crédito', 'Bonos o certificados', 'Permuta', 'Otras formas de venta'];

/** Reparte el total de la factura entre los medios de pago (si se pagó con más efectivo del total, el vuelto no cuenta). */
function repartirPagos(pagos, total) {
    const dest = { efectivo: 0, transf: 0, tarjeta: 0, otras: 0 };
    const suma = pagos.reduce((a, p) => a + Math.abs(Number(p.monto)), 0);
    if (!suma) { dest.efectivo = total; return dest; }
    let acumulado = 0;
    const partes = pagos.map((p) => ({ m: p.metodo, v: r2(total * Math.abs(Number(p.monto)) / suma) }));
    partes.forEach((p) => { acumulado = r2(acumulado + p.v); });
    if (partes.length) partes[0].v = r2(partes[0].v + (total - acumulado)); // el redondeo se ajusta en el primer medio
    for (const p of partes) {
        if (p.m === 'efectivo') dest.efectivo = r2(dest.efectivo + p.v);
        else if (p.m === 'transferencia') dest.transf = r2(dest.transf + p.v);
        else if (p.m === 'tarjeta') dest.tarjeta = r2(dest.tarjeta + p.v);
        else dest.otras = r2(dest.otras + p.v);
    }
    return dest;
}

async function reporte607(mes, { soloSerieB = false } = {}) {
    mes = validarMes(mes);
    const [fs] = await db.query(
        `SELECT f.*, to_char(f.fecha AT TIME ZONE '${TZ}', 'YYYYMMDD') AS fecha_dgii
         FROM facturas f
         WHERE f.ncf IS NOT NULL AND f.fiscal_estado IN ('aceptado','aceptado_condicional','contingencia','pendiente','enviado')
           AND to_char(f.fecha AT TIME ZONE '${TZ}', 'YYYY-MM') = ? ${soloSerieB ? `AND f.ncf LIKE 'B%'` : ''}
         ORDER BY f.fecha, f.id`, [mes]
    );
    const ids = fs.map((f) => f.id);
    const pagosPor = new Map();
    if (ids.length) {
        const [pg] = await db.query('SELECT factura_id, metodo, monto FROM factura_pagos WHERE factura_id IN (?) ORDER BY id', [ids]);
        pg.forEach((p) => { if (!pagosPor.has(p.factura_id)) pagosPor.set(p.factura_id, []); pagosPor.get(p.factura_id).push(p); });
    }
    const lineas = fs.map((f) => {
        const A = (n) => Math.abs(Number(n || 0));
        const base = r2(A(f.subtotal_gravado_18) + A(f.subtotal_gravado_16) + A(f.subtotal_gravado_0) + A(f.subtotal_exento));
        const total = A(f.total);
        const d = repartirPagos(pagosPor.get(f.id) || [], total);
        const doc = f.comprador_documento ? calculo.normalizarDocumento(f.comprador_tipo_doc, f.comprador_documento) : '';
        const tipoId = f.comprador_tipo_doc === 'rnc' ? '1' : f.comprador_tipo_doc === 'cedula' ? '2' : f.comprador_tipo_doc === 'pasaporte' ? '3' : '';
        return [doc, doc ? tipoId : '', f.ncf, f.ncf_modificado || '', '01', f.fecha_dgii, '', num(base), num(A(f.itbis_total)), '0.00', '0.00', '0.00', '0.00', '0.00', '0.00',
            num(A(f.propina)), num(d.efectivo), num(d.transf), num(d.tarjeta), '0.00', '0.00', '0.00', num(d.otras)];
    });
    return { mes, columnas: COLS_607, filas: lineas, txt: armarTxt('607', await rncEmisor(), mes, lineas), total: lineas.length };
}

// ---------------------------------------------------------------- 608 (anulados)
const MOTIVOS_608 = {
    '01': 'Deterioro de factura pre-impresa', '02': 'Errores de impresión (factura pre-impresa)', '03': 'Impresión defectuosa', '04': 'Corrección de la información',
    '05': 'Cambio de productos', '06': 'Devolución de productos', '07': 'Omisión de productos', '08': 'Errores en secuencias de NCF', '09': 'Por cese de operaciones', '10': 'Pérdida o hurto de talonarios'
};
async function reporte608(mes) {
    mes = validarMes(mes);
    const [rows] = await db.query(
        `SELECT ncf, to_char(fecha, 'YYYYMMDD') AS f, motivo FROM ncf_anulados WHERE to_char(fecha, 'YYYY-MM') = ? ORDER BY fecha, ncf`, [mes]
    );
    const lineas = rows.map((r) => [r.ncf, r.f, r.motivo]);
    return { mes, columnas: ['NCF', 'Fecha', 'Tipo de anulación'], filas: lineas, txt: armarTxt('608', await rncEmisor(), mes, lineas), total: lineas.length };
}

async function anularNCF({ ncf, motivo, nota }, usuario = null) {
    const n = String(ncf || '').trim().toUpperCase();
    if (!/^B(01|02|04|14|15)\d{8}$/.test(n)) throw err('El 608 es para NCF de la serie B (por ejemplo B0200000015). Los e-CF se anulan con el botón de anular secuencias.');
    if (!MOTIVOS_608[motivo]) throw err('Motivo inválido.');
    const [usado] = await db.query('SELECT 1 FROM facturas WHERE ncf = ? LIMIT 1', [n]);
    if (usado[0]) throw err('Ese NCF ya está en una factura: corrígela con una nota de crédito en lugar de anularlo.');
    await db.query('INSERT INTO ncf_anulados (ncf, motivo, nota, usuario) VALUES (?, ?, ?, ?) ON CONFLICT (ncf) DO NOTHING', [n, motivo, nota || null, usuario]);
}

// ---------------------------------------------------------------- Resumen IT-1 y propina
async function resumenMensual(mes) {
    mes = validarMes(mes);
    const [[v]] = await db.query(
        `SELECT COALESCE(SUM(subtotal_gravado_18),0) AS g18, COALESCE(SUM(subtotal_gravado_16),0) AS g16, COALESCE(SUM(subtotal_gravado_0),0) AS g0,
                COALESCE(SUM(subtotal_exento),0) AS ex, COALESCE(SUM(itbis_total),0) AS itbis, COALESCE(SUM(propina),0) AS propina,
                COUNT(*) FILTER (WHERE factura_origen_id IS NULL) AS facturas, COUNT(*) FILTER (WHERE factura_origen_id IS NOT NULL) AS notas
         FROM facturas WHERE ncf IS NOT NULL AND fiscal_estado <> 'rechazado' AND to_char(fecha AT TIME ZONE '${TZ}', 'YYYY-MM') = ?`, [mes]
    );
    const [[c]] = await db.query(
        `SELECT COALESCE(SUM(monto_servicios + monto_bienes),0) AS total, COALESCE(SUM(itbis_facturado),0) AS itbis, COALESCE(SUM(itbis_retenido),0) AS retenido,
                COALESCE(SUM(itbis_costo),0) AS costo, COALESCE(SUM(itbis_proporcionalidad),0) AS prop, COUNT(*) AS n
         FROM compras WHERE to_char(fecha_comprobante, 'YYYY-MM') = ?`, [mes]
    );
    const itbisCobrado = r2(v.itbis);
    const itbisCompras = r2(Number(c.itbis) - Number(c.costo));
    return {
        mes,
        ventas: { gravado_18: r2(v.g18), gravado_16: r2(v.g16), gravado_0: r2(v.g0), exento: r2(v.ex), itbis_cobrado: itbisCobrado, propina_legal: r2(v.propina), comprobantes: Number(v.facturas), notas_credito: Number(v.notas) },
        compras: { total: r2(c.total), itbis_facturado: r2(c.itbis), itbis_al_costo: r2(c.costo), itbis_retenido: r2(c.retenido), registros: Number(c.n) },
        itbis_a_pagar: r2(itbisCobrado - itbisCompras),
        nota: 'Ventas netas de notas de crédito. Es una guía para tu contador: el IT-1 oficial lo presenta él en la Oficina Virtual.'
    };
}

async function propinaLegal(desde, hasta) {
    const [rows] = await db.query(
        `SELECT to_char(fecha AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS dia, COALESCE(SUM(propina),0) AS propina, COUNT(*) FILTER (WHERE propina <> 0) AS facturas
         FROM facturas WHERE propina <> 0 AND fiscal_estado <> 'rechazado' AND (fecha AT TIME ZONE '${TZ}')::date BETWEEN ? AND ?
         GROUP BY 1 ORDER BY 1`, [desde, hasta]
    );
    const total = r2(rows.reduce((a, r) => a + Number(r.propina), 0));
    return { desde, hasta, dias: rows.map((r) => ({ dia: r.dia, propina: r2(r.propina), facturas: Number(r.facturas) })), total };
}

// ---------------------------------------------------------------- Excel
async function aExcel(titulo, columnas, filas) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(String(titulo).slice(0, 31));
    ws.addRow(columnas).font = { bold: true };
    filas.forEach((f) => ws.addRow(f));
    ws.columns.forEach((c) => { c.width = 18; });
    return wb.xlsx.writeBuffer();
}

module.exports = { reporte606, reporte607, reporte608, anularNCF, resumenMensual, propinaLegal, aExcel, repartirPagos, MOTIVOS_608, COLS_606, COLS_607 };
