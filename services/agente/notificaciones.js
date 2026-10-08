// Mensajes salientes de los agentes por WhatsApp (enlaces de pago, confirmaciones, etc.).
// Si WhatsApp no está conectado devuelve false y el agente le dice al cliente que el
// restaurante se lo enviará (nunca se rompe una llamada por esto).
// Relacionado con: services/whatsapp.js (Evolution API), services/agente/ejecutor.js

async function enviarTexto(telefono, texto) {
    let wa;
    try {
        wa = require('../whatsapp');
    } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') return false;
        throw e;
    }
    try {
        return await wa.enviarTexto(telefono, texto);
    } catch (e) {
        console.error('No se pudo enviar el mensaje de WhatsApp:', e.message);
        return false;
    }
}

module.exports = { enviarTexto };
