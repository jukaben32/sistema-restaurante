// Formato de la representación impresa de los comprobantes (ticket, pantalla, texto para la impresora del servidor y WhatsApp).
// Relacionado con: views/partials/comprobante.ejs, routes/facturas.js (buildFacturaTexto), routes/fiscal.js (/f/:token)

/** Dinero dominicano: "RD$ 1,234.50". Las notas de crédito guardan montos negativos; se muestran en positivo. */
function rd(n, { signo = false } = {}) {
    const v = Number(n || 0);
    const t = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${signo && v < 0 ? '-' : ''}RD$ ${t}`;
}
const cant = (n) => Number(Math.abs(Number(n || 0))).toLocaleString('en-US', { maximumFractionDigits: 3 });

const NOMBRES = {
    E31: 'Factura de Crédito Fiscal Electrónica', E32: 'Factura de Consumo Electrónica', E33: 'Nota de Débito Electrónica', E34: 'Nota de Crédito Electrónica',
    B01: 'Factura de Crédito Fiscal', B02: 'Factura de Consumo', B04: 'Nota de Crédito', B14: 'Factura de Régimen Especial', B15: 'Factura Gubernamental'
};

const esNota = (f) => !!f.factura_origen_id;

/** Título del documento. */
function titulo(f) {
    if (f.fiscal_estado === 'no_fiscal') return esNota(f) ? 'DEVOLUCIÓN (NO FISCAL)' : 'FACTURA (NO FISCAL)';
    return (NOMBRES[f.tipo_comprobante] || 'Comprobante').toUpperCase();
}

/** Leyenda destacada según el estado del comprobante (o null si no hace falta). */
function leyenda(f) {
    switch (f.fiscal_estado) {
        case 'no_fiscal': return 'DOCUMENTO NO FISCAL — sin valor tributario';
        case 'pendiente': case 'enviado': return 'Comprobante en proceso de validación ante la DGII';
        case 'contingencia': return 'Emitido en contingencia: NCF serie B. Se regulariza ante la DGII';
        case 'rechazado': return 'COMPROBANTE RECHAZADO POR LA DGII — sin validez. Pide una factura nueva.';
        case 'aceptado_condicional': return 'Aceptado condicional por la DGII';
        default: return null;
    }
}

/** ¿Es un comprobante electrónico (lleva QR y código de seguridad)? */
const esElectronico = (f) => /^E/.test(String(f.tipo_comprobante || ''));

/** Texto plano para la impresora del servidor (ticket térmico de 42 columnas). */
function texto({ factura: f, cliente, detalles, pagos, negocio }) {
    const linea = '-'.repeat(42);
    const o = [];
    const fiscal = f.fiscal_estado !== 'no_fiscal';
    o.push(String(negocio?.razon_social || negocio?.nombre_negocio || 'FACTURA'));
    if (negocio?.razon_social && negocio?.nombre_negocio && negocio.razon_social !== negocio.nombre_negocio) o.push(String(negocio.nombre_negocio));
    if (negocio?.rnc_emisor) o.push(`RNC: ${negocio.rnc_emisor}`);
    const dir = negocio?.direccion_fiscal || negocio?.direccion;
    if (dir) o.push(String(dir));
    if (negocio?.telefono) o.push(`Tel: ${negocio.telefono}`);
    o.push(linea);
    o.push(titulo(f));
    if (f.ncf) o.push(`${esElectronico(f) ? 'e-NCF' : 'NCF'}: ${f.ncf}`);
    if (f.ncf_modificado) o.push(`NCF modificado: ${f.ncf_modificado}`);
    o.push(`Fecha: ${new Date(f.fecha || Date.now()).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}`);
    if (!f.ncf) o.push(`Factura #: ${f.id ?? '-'}`);
    o.push(`Cliente: ${f.comprador_nombre || cliente?.nombre || '-'}`);
    if (f.comprador_documento) o.push(`${f.comprador_tipo_doc === 'rnc' ? 'RNC' : f.comprador_tipo_doc === 'cedula' ? 'Cédula' : 'Documento'}: ${f.comprador_documento}`);
    o.push(linea);
    (detalles || []).forEach((d) => {
        o.push(String(d?.producto_nombre || ''));
        o.push(`${cant(d?.cantidad)}${String(d?.unidad_medida || '')}  ${rd(d?.precio_unitario)}  ${rd(d?.subtotal)}`);
    });
    o.push(linea);
    if (fiscal) {
        const g = (k) => Math.abs(Number(f[k] || 0));
        const base = g('subtotal_gravado_18') + g('subtotal_gravado_16') + g('subtotal_gravado_0') + g('subtotal_exento');
        o.push(`Subtotal: ${rd(base)}`);
        if (g('itbis_total') > 0) o.push(`ITBIS: ${rd(g('itbis_total'))}`);
        if (g('propina') > 0) o.push(`Propina legal 10%: ${rd(g('propina'))}`);
    }
    o.push(`TOTAL: ${rd(f.total)}`);
    if (Array.isArray(pagos) && pagos.length > 0) {
        o.push('Pagos:');
        pagos.forEach((p) => {
            const ref = String(p?.referencia || '').trim();
            o.push(`${String(p?.metodo || '').trim()}: ${rd(p?.monto)}${ref ? ` (${ref})` : ''}`);
        });
    } else {
        o.push(`Forma de pago: ${String(f.forma_pago || '')}`);
    }
    if (esElectronico(f) && f.codigo_seguridad) {
        o.push(linea);
        o.push(`Código de seguridad: ${f.codigo_seguridad}`);
        if (f.fecha_firma) o.push(`Fecha de firma: ${String(f.fecha_firma).replace('T', ' ').slice(0, 19)}`);
    }
    const ley = leyenda(f);
    if (ley) { o.push(linea); o.push(ley); }
    o.push(String(negocio?.pie_pagina || 'Gracias por su compra'));
    return o.join('\r\n');
}

module.exports = { rd, cant, titulo, leyenda, esElectronico, esNota, texto, NOMBRES };
