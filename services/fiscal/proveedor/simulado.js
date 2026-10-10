// Proveedor de e-CF SIMULADO: responde como lo haría MSeller, sin llamar a nadie. Sirve para practicar y para las pruebas automáticas.
// No tiene validez fiscal. Valida la estructura del comprobante para que un error del constructor se vea aquí.
// Para probar fallas: un comprador cuyo nombre contenga "RECHAZAR" recibe un rechazo, y uno que contenga "CAIDA" simula una falla de red.
// Relacionado con: services/fiscal/proveedor/index.js
const crypto = require('crypto');

const REQUERIDOS = ['Version', 'IdDoc', 'Emisor', 'Totales'];

function validar(payload) {
    const e = payload && payload.ECF && payload.ECF.Encabezado;
    if (!e) return 'Falta ECF.Encabezado';
    for (const k of REQUERIDOS) if (!e[k]) return `Falta Encabezado.${k}`;
    if (!/^E(31|32|33|34)\d{10}$/.test(String(e.IdDoc.eNCF || ''))) return 'e-NCF inválido';
    if (!e.Emisor.RNCEmisor) return 'Falta RNCEmisor';
    if (!payload.ECF.DetallesItems || !payload.ECF.DetallesItems.Item || !payload.ECF.DetallesItems.Item.length) return 'Sin líneas de detalle';
    const sumaItems = Math.round(payload.ECF.DetallesItems.Item.reduce((a, i) => a + Number(i.MontoItem), 0) * 100) / 100;
    const t = e.Totales;
    const gravExento = Math.round((Number(t.MontoGravadoTotal || 0) + Number(t.MontoExento || 0)) * 100) / 100;
    if (Math.abs(sumaItems - gravExento) > 0.05) return `Las líneas (${sumaItems}) no cuadran con los montos de los totales (${gravExento})`;
    const esperado = Math.round((gravExento + Number(t.TotalITBIS || 0) + Number(t.MontoImpuestoAdicional || 0)) * 100) / 100;
    if (Math.abs(esperado - Number(t.MontoTotal)) > 0.05) return `MontoTotal (${t.MontoTotal}) no cuadra con la suma de sus partes (${esperado})`;
    if (e.IdDoc.TipoeCF === 34 && !(payload.ECF.InformacionReferencia && payload.ECF.InformacionReferencia.NCFModificado)) return 'La nota de crédito necesita NCFModificado';
    return null;
}

const codigo = (ncf) => crypto.createHash('sha256').update(String(ncf)).digest('hex').slice(0, 6).toUpperCase();

async function enviar(cfg, payload) {
    const nombre = (payload.ECF && payload.ECF.Encabezado && payload.ECF.Encabezado.Comprador && payload.ECF.Encabezado.Comprador.RazonSocialComprador) || '';
    if (/CAIDA/i.test(nombre)) throw Object.assign(new Error('Simulación: no hay conexión con el proveedor'), { reintentable: true });
    const problema = validar(payload);
    if (problema) return { estado: 'rechazado', error: problema, respuesta: { simulado: true, error: problema } };
    if (/RECHAZAR/i.test(nombre)) return { estado: 'rechazado', error: 'Simulación: la DGII rechazó el comprobante', respuesta: { simulado: true, estado: 'RECHAZADO' } };
    const ncf = payload.ECF.Encabezado.IdDoc.eNCF;
    const cs = codigo(ncf);
    return {
        estado: 'aceptado',
        track_id: `SIM-${ncf}`,
        codigo_seguridad: cs,
        fecha_firma: new Date().toISOString(),
        qr_url: `https://ecf.dgii.gov.do/TesteCF/ConsultaTimbre?RncEmisor=${payload.ECF.Encabezado.Emisor.RNCEmisor}&ENCF=${ncf}&MontoTotal=${payload.ECF.Encabezado.Totales.MontoTotal}&CodigoSeguridad=${cs}`,
        respuesta: { simulado: true, estado: 'ACEPTADO' }
    };
}

async function consultar(cfg, ncf) {
    return { estado: 'aceptado', track_id: `SIM-${ncf}`, codigo_seguridad: codigo(ncf), respuesta: { simulado: true } };
}

async function anularSecuencias(cfg, rangos) { return { ok: true, simulado: true, voidId: `SIM-VOID-${Date.now()}`, rangos }; }
async function probar() { return { ok: true, detalle: 'Proveedor simulado: no se conecta a ningún servicio real.' }; }

module.exports = { nombre: 'simulado', enviar, consultar, anularSecuencias, probar, validar };
