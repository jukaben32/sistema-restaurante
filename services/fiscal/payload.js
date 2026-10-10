// Construye el comprobante fiscal electrónico (e-CF) en el JSON que recibe el proveedor (MSeller convierte a XML, firma y envía a la DGII).
// Estructura según la documentación de MSeller y el formato e-CF v1.0 de la DGII.
// ⚠️ Los nombres de campo deben confirmarse con una prueba real en TesteCF usando `?validate=true` (ver Ajustes → Fiscal → "Validar comprobante de prueba").
// Relacionado con: services/fiscal/emision.js, services/fiscal/proveedor/*
const calculo = require('./calculo');

// Las notas de crédito guardan montos negativos en la base; al comprobante siempre van en positivo
const r2 = (n) => Math.abs(calculo.round2(n));

/** Fecha en el formato de la DGII: dd-MM-aaaa (hora de República Dominicana). */
function fechaDGII(d) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));
    return f.replace(/\//g, '-');
}

/**
 * Formas de pago del e-CF (TablaFormasPago, máximo 7): se agrupan por código DGII y se ajustan al total de la factura
 * (si el cliente pagó con un billete más grande, el vuelto no cuenta).
 */
function tablaFormasPago(pagos, total) {
    const lista = (pagos || []).filter((p) => Number(p.monto) !== 0);
    const suma = lista.reduce((a, p) => a + Math.abs(Number(p.monto)), 0);
    if (!lista.length || !suma) return null;
    const porCodigo = new Map();
    let asignado = 0;
    lista.forEach((p, i) => {
        const monto = i === lista.length - 1 ? r2(total - asignado) : r2(total * Math.abs(Number(p.monto)) / suma);
        asignado = r2(asignado + monto);
        const cod = calculo.formaPagoDGII(p.metodo);
        porCodigo.set(cod, r2((porCodigo.get(cod) || 0) + monto));
    });
    return { FormaDePago: [...porCodigo.entries()].map(([FormaPago, MontoPago]) => ({ FormaPago, MontoPago })) };
}

/**
 * @param factura  fila de facturas
 * @param detalles filas de detalle_factura (con nombre del producto)
 * @param cfg      configuración fiscal (services/fiscal/config.js)
 * @param extra    { vence: 'AAAA-MM-DD' (vencimiento de la secuencia), pagos: [{ metodo, monto }] }
 */
function construirECF(factura, detalles, cfg, extra = {}) {
    const tipo = String(factura.tipo_comprobante || '').replace(/^E/, ''); // '32'
    const esNota = tipo === '34';
    const compradorId = factura.comprador_documento || '';
    const tipoDoc = factura.comprador_tipo_doc || 'ninguno';

    const idDoc = {
        TipoeCF: Number(tipo),
        eNCF: factura.ncf,
        ...(tipo !== '32' && extra.vence ? { FechaVencimientoSecuencia: fechaDGII(extra.vence) } : {}),
        // Siempre se envían las cantidades SIN ITBIS (base); el ITBIS va aparte en los totales
        IndicadorMontoGravado: 0,
        ...(esNota ? { IndicadorNotaCredito: factura.indicador_nota_credito != null ? Number(factura.indicador_nota_credito) : 0 } : {}),
        TipoIngresos: '01',
        TipoPago: 1,
        ...(!esNota && tablaFormasPago(extra.pagos, r2(factura.total)) ? { TablaFormasPago: tablaFormasPago(extra.pagos, r2(factura.total)) } : {})
    };

    const emisor = {
        RNCEmisor: cfg.emisor.rnc,
        RazonSocialEmisor: cfg.emisor.razonSocial,
        ...(cfg.emisor.nombreComercial ? { NombreComercial: cfg.emisor.nombreComercial } : {}),
        DireccionEmisor: cfg.emisor.direccion,
        ...(cfg.emisor.municipio ? { Municipio: cfg.emisor.municipio } : {}),
        ...(cfg.emisor.provincia ? { Provincia: cfg.emisor.provincia } : {}),
        FechaEmision: fechaDGII(factura.fecha)
    };

    const comprador = {};
    if (compradorId && (tipoDoc === 'rnc' || tipoDoc === 'cedula')) comprador.RNCComprador = compradorId;
    else if (compradorId && tipoDoc === 'pasaporte') comprador.IdentificadorExtranjero = compradorId;
    if (factura.comprador_nombre) comprador.RazonSocialComprador = factura.comprador_nombre;

    const g18 = r2(factura.subtotal_gravado_18), g16 = r2(factura.subtotal_gravado_16), g0 = r2(factura.subtotal_gravado_0), exento = r2(factura.subtotal_exento);
    const itbis18 = r2(g18 * 0.18), itbis16 = r2(g16 * 0.16);
    const totales = {
        MontoGravadoTotal: r2(g18 + g16 + g0),
        ...(g18 ? { MontoGravadoI1: g18 } : {}),
        ...(g16 ? { MontoGravadoI2: g16 } : {}),
        ...(g0 ? { MontoGravadoI3: g0 } : {}),
        ...(exento ? { MontoExento: exento } : {}),
        ...(g18 ? { ITBIS1: 18 } : {}),
        ...(g16 ? { ITBIS2: 16 } : {}),
        TotalITBIS: r2(factura.itbis_total),
        ...(g18 ? { TotalITBIS1: itbis18 } : {}),
        ...(g16 ? { TotalITBIS2: itbis16 } : {}),
        ...(r2(factura.propina) > 0 ? {
            MontoImpuestoAdicional: r2(factura.propina),
            ImpuestosAdicionales: { ImpuestoAdicional: [{ TipoImpuesto: '001', TasaImpuestoAdicional: cfg.propinaTasa, MontoImpuestoSelectivoConsumoEspecifico: 0, OtrosImpuestosAdicionales: r2(factura.propina) }] }
        } : {}),
        MontoTotal: r2(factura.total)
    };

    const items = detalles.map((d, i) => {
        const cant = Math.abs(Number(d.cantidad));
        const base = r2(d.base != null ? d.base : d.subtotal);
        return {
            NumeroLinea: i + 1,
            IndicadorFacturacion: calculo.indicadorFacturacion(d.itbis_tasa),
            NombreItem: String(d.nombre || d.producto_nombre || 'Producto').slice(0, 80),
            IndicadorBienoServicio: Number(d.es_envio) ? 2 : 1,
            CantidadItem: cant,
            UnidadMedida: 43, // código DGII "unidad"
            PrecioUnitarioItem: cant ? Math.round((base / cant) * 10000) / 10000 : base,
            MontoItem: base
        };
    });

    // Comprador solo si hay datos (la factura de consumo menor a RD$250,000 puede ir sin comprador). La firma digital la pone el proveedor.
    const ecf = { Version: '1.0', IdDoc: idDoc, Emisor: emisor, ...(Object.keys(comprador).length ? { Comprador: comprador } : {}), Totales: totales };
    const out = { ECF: { Encabezado: ecf, DetallesItems: { Item: items } } };
    if (esNota) {
        out.ECF.InformacionReferencia = {
            NCFModificado: factura.ncf_modificado,
            FechaNCFModificado: factura.fecha_ncf_modificado ? fechaDGII(factura.fecha_ncf_modificado) : fechaDGII(factura.fecha),
            CodigoModificacion: Number(factura.codigo_modificacion || 1)
        };
    }
    return out;
}

module.exports = { construirECF, fechaDGII };
