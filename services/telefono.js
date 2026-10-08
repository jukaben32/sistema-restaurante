// Teléfonos: normalización para identificar clientes que llaman o escriben por WhatsApp.
// Código de país por defecto: WHATSAPP_CODIGO_PAIS (1 = República Dominicana / EE. UU.).
// Relacionado con: services/clientes.js, services/delivery.js, services/agente/*

function codigoPais() {
    return String(process.env.WHATSAPP_CODIGO_PAIS || '1').replace(/\D/g, '') || '1';
}

function digitos(raw) {
    return String(raw == null ? '' : raw).replace(/\D/g, '');
}

/** Devuelve solo dígitos con código de país (ej. 18095551234) o null si no hay número. */
function normalizar(raw) {
    let d = digitos(raw);
    if (!d) return null;
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10) d = codigoPais() + d;
    return d.length >= 8 ? d : null;
}

/** Últimos 10 dígitos: sirve para comparar el mismo número escrito de distintas formas. */
function ultimos10(raw) {
    return digitos(raw).slice(-10);
}

module.exports = { codigoPais, digitos, normalizar, ultimos10 };
