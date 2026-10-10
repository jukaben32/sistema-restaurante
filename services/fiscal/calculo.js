// Motor de cálculo fiscal de República Dominicana (ITBIS y propina legal) y validadores de documentos.
// MÓDULO PURO: no toca la base de datos ni la red, así se prueba por completo (tests/e2e/12-fiscal-calculo.js).
// TODO cálculo fiscal del sistema pasa por aquí; el navegador solo muestra lo que el servidor calcula.
//
// Reglas (verificadas con la DGII; confirmar siempre con el contador):
// - ITBIS general 18 %, reducido 16 %, gravado 0 % y exento ("E"). El ITBIS se calcula SIN incluir la propina legal.
// - Propina legal 10 % sobre el consumo SIN ITBIS (en el e-CF va como impuesto adicional 001).
// - El costo de envío es un servicio gravado con ITBIS y NO genera propina.
// - Total = base + ITBIS + propina.
// Relacionado con: services/facturacion.js, services/delivery.js, routes/fiscal.js

const TASAS = { '18': 18, '16': 16, '0': 0, E: 0 };
const UMBRAL_CONSUMO_IDENTIFICADO = 250000; // E32 de RD$250,000 o más: el comprador debe estar identificado

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** "18" -> 18, "E" -> 0. Valor desconocido: 18 (la tasa general). */
function tasaNumero(t) {
    const k = String(t == null ? '18' : t).toUpperCase();
    return Object.prototype.hasOwnProperty.call(TASAS, k) ? TASAS[k] : 18;
}
const tasaClave = (t) => { const k = String(t == null ? '18' : t).toUpperCase(); return Object.prototype.hasOwnProperty.call(TASAS, k) ? k : '18'; };

/** Código del e-CF `IndicadorFacturacion` según la tasa (1 = 18 %, 2 = 16 %, 3 = 0 %, 4 = exento). */
function indicadorFacturacion(t) {
    const k = tasaClave(t);
    return k === '18' ? 1 : k === '16' ? 2 : k === '0' ? 3 : 4;
}

/**
 * Calcula una línea. precio_unitario: precio tal como está en el menú (con o sin ITBIS según preciosIncluyenItbis).
 * Devuelve { base, itbis, total, tasa, tasaClave }.
 */
function calcularLinea(linea, { preciosIncluyenItbis = false, activo = true } = {}) {
    const bruto = round2(Number(linea.precio_unitario) * Number(linea.cantidad));
    if (!activo) return { base: bruto, itbis: 0, total: bruto, tasa: 0, tasaClave: null };
    const clave = tasaClave(linea.itbis_tasa);
    const tasa = tasaNumero(clave);
    if (preciosIncluyenItbis && tasa > 0) {
        const base = round2(bruto / (1 + tasa / 100));
        return { base, itbis: round2(bruto - base), total: bruto, tasa, tasaClave: clave };
    }
    const itbis = round2(bruto * tasa / 100);
    return { base: bruto, itbis, total: round2(bruto + itbis), tasa, tasaClave: clave };
}

/** ¿Aplica propina legal a este tipo de pedido según la configuración? */
function aplicaPropina(tipoPedido, cfg) {
    if (!cfg || !cfg.propinaActiva) return false;
    switch (tipoPedido) {
        case 'mesa': return true;
        case 'delivery': return !!cfg.propinaEnDelivery;
        case 'para_llevar': return !!cfg.propinaEnLlevar;
        default: return !!cfg.propinaEnRapida; // venta rápida
    }
}

/**
 * Calcula la factura completa.
 * @param items [{ precio_unitario, cantidad, itbis_tasa, es_envio }]
 * @param opciones { cfg: { activo, preciosIncluyenItbis, propinaActiva, propinaTasa, propinaEnDelivery, propinaEnLlevar, propinaEnRapida }, tipoPedido }
 */
function calcularFactura(items, { cfg = {}, tipoPedido = 'mesa' } = {}) {
    const activo = cfg.activo !== false && cfg.activo !== 0;
    const lineas = items.map((it) => ({ ...it, ...calcularLinea(it, { preciosIncluyenItbis: !!cfg.preciosIncluyenItbis, activo }) }));
    const suma = (f) => round2(lineas.reduce((a, l) => a + f(l), 0));
    const porClave = (c) => suma((l) => (l.tasaClave === c ? l.base : 0));
    const gravado18 = porClave('18');
    const gravado16 = porClave('16');
    const gravado0 = porClave('0');
    const exento = porClave('E');
    const sinImpuestos = suma((l) => (l.tasaClave === null ? l.base : 0)); // modo no fiscal
    const itbisTotal = suma((l) => l.itbis);
    const baseTotal = suma((l) => l.base);

    const baseConsumo = suma((l) => (l.es_envio ? 0 : l.base));
    const conPropina = activo && aplicaPropina(tipoPedido, cfg);
    const propina = conPropina ? round2(baseConsumo * Number(cfg.propinaTasa == null ? 10 : cfg.propinaTasa) / 100) : 0;
    const total = round2(suma((l) => l.total) + propina);

    return {
        lineas,
        activo,
        subtotal_gravado_18: gravado18,
        subtotal_gravado_16: gravado16,
        subtotal_gravado_0: gravado0,
        subtotal_exento: exento,
        subtotal_sin_impuestos: sinImpuestos,
        base_total: baseTotal,
        itbis_total: itbisTotal,
        propina,
        propina_tasa: conPropina ? Number(cfg.propinaTasa == null ? 10 : cfg.propinaTasa) : 0,
        total
    };
}

// ------------------------------------------------------------------ validadores
const soloDigitos = (s) => String(s == null ? '' : s).replace(/\D/g, '');

/** RNC (9 dígitos) con su dígito verificador (módulo 11, pesos 7,9,8,6,5,4,3,2). */
function validarRNC(valor) {
    const d = soloDigitos(valor);
    if (d.length !== 9) return false;
    const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
    const suma = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0);
    const r = suma % 11;
    const dv = r === 0 ? 2 : r === 1 ? 1 : 11 - r;
    return dv === Number(d[8]);
}

/** Cédula (11 dígitos) con el algoritmo de Luhn (pesos 1,2 alternados). */
function validarCedula(valor) {
    const d = soloDigitos(valor);
    if (d.length !== 11) return false;
    let suma = 0;
    for (let i = 0; i < 10; i++) {
        let v = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
        if (v > 9) v -= 9;
        suma += v;
    }
    return ((10 - (suma % 10)) % 10) === Number(d[10]);
}

const validarPasaporte = (v) => /^[A-Za-z0-9]{5,20}$/.test(String(v || '').trim());

/** Valida un documento según su tipo. */
function validarDocumento(tipo, valor) {
    if (tipo === 'rnc') return validarRNC(valor);
    if (tipo === 'cedula') return validarCedula(valor);
    if (tipo === 'pasaporte') return validarPasaporte(valor);
    return false;
}

/** Normaliza el documento: RNC y cédula solo dígitos; pasaporte en mayúsculas. */
function normalizarDocumento(tipo, valor) {
    return tipo === 'pasaporte' ? String(valor || '').trim().toUpperCase() : soloDigitos(valor);
}

/** Detecta si un número de 9 u 11 dígitos es RNC o cédula (para campos de un solo recuadro). */
function tipoDocumentoPorLongitud(valor) {
    const d = soloDigitos(valor);
    return d.length === 9 ? 'rnc' : d.length === 11 ? 'cedula' : null;
}

// ------------------------------------------------------------------ comprobantes
const TIPOS_E = ['E31', 'E32', 'E33', 'E34'];
const TIPOS_B = ['B01', 'B02', 'B04', 'B14', 'B15'];

/**
 * Elige el tipo de comprobante.
 * @returns { tipo, serie } o lanza Error con `.publico = true` si faltan datos.
 */
function elegirTipo({ comprador = null, quiereCreditoFiscal = false, esNota = false, serieB = false, total = 0 }) {
    const serie = serieB ? 'B' : 'E';
    const err = (m) => Object.assign(new Error(m), { publico: true });
    if (esNota) return { tipo: serie === 'B' ? 'B04' : 'E34', serie };
    const identificado = comprador && comprador.tipo_documento && comprador.tipo_documento !== 'ninguno' && comprador.documento
        && validarDocumento(comprador.tipo_documento, comprador.documento);
    if (quiereCreditoFiscal) {
        if (!identificado || !['rnc', 'cedula'].includes(comprador.tipo_documento)) {
            throw err('Para un comprobante de crédito fiscal el cliente debe tener un RNC o una cédula válidos.');
        }
        if (!comprador.razon_social && !comprador.nombre) throw err('Falta el nombre o la razón social del cliente para el crédito fiscal.');
        return { tipo: serie === 'B' ? 'B01' : 'E31', serie };
    }
    if (Number(total) >= UMBRAL_CONSUMO_IDENTIFICADO && !identificado) {
        throw err(`Las facturas de consumo de RD$${UMBRAL_CONSUMO_IDENTIFICADO.toLocaleString('es-DO')} o más requieren identificar al cliente (RNC, cédula o pasaporte).`);
    }
    return { tipo: serie === 'B' ? 'B02' : 'E32', serie };
}

/** Da formato al número: e-NCF = "E" + tipo de 2 dígitos + secuencial de 10; NCF serie B = "B" + tipo + secuencial de 8. */
function formatearNCF(tipo, numero) {
    const n = String(numero);
    return tipo[0] === 'E' ? `E${tipo.slice(1)}${n.padStart(10, '0')}` : `B${tipo.slice(1)}${n.padStart(8, '0')}`;
}
const validarNCF = (v) => /^(E(31|32|33|34|41|43|44|45|46|47)\d{10}|B(01|02|04|11|12|13|14|15|16|17)\d{8})$/.test(String(v || '').trim());

// Forma de pago de la DGII (e-CF "FormaPago" y columna del 607): 1 efectivo, 2 cheque/transferencia/depósito, 3 tarjeta,
// 4 crédito, 5 bonos o certificados, 6 permuta, 7 nota de crédito, 8 otras formas
function formaPagoDGII(metodo) {
    switch (String(metodo || '').toLowerCase()) {
        case 'efectivo': return 1;
        case 'transferencia': return 2;
        case 'tarjeta': return 3;
        default: return 8; // qr, cripto, etc.
    }
}

module.exports = {
    TASAS, UMBRAL_CONSUMO_IDENTIFICADO, TIPOS_E, TIPOS_B,
    round2, tasaNumero, tasaClave, indicadorFacturacion, calcularLinea, aplicaPropina, calcularFactura,
    validarRNC, validarCedula, validarPasaporte, validarDocumento, normalizarDocumento, tipoDocumentoPorLongitud,
    elegirTipo, formatearNCF, validarNCF, formaPagoDGII
};
