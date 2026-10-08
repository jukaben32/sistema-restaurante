// Conversaciones de los agentes (voz y WhatsApp): historial único por cliente y canal.
// Relacionado con: services/agente/texto.js, routes/vapi.js, routes/whatsapp.js, routes/conversaciones.js
const db = require('../../db');
const { normalizar } = require('../telefono');
const clientesService = require('../clientes');

// Un silencio de más de 6 h inicia una conversación nueva (WhatsApp no tiene "colgar")
const VENTANA_WHATSAPP = '6 hours';

async function clienteIdPorTelefono(tel) {
    try {
        const c = await clientesService.buscarPorTelefono(db, tel);
        return c ? c.id : null;
    } catch (_) { return null; }
}

/** Conversación activa de WhatsApp del teléfono (o una nueva). */
async function obtenerOCrearWhatsapp(telefono, nombre = null) {
    const tel = normalizar(telefono);
    if (!tel) throw new Error('Teléfono inválido');
    const [rows] = await db.query(
        `SELECT * FROM agente_conversaciones
         WHERE canal = 'whatsapp' AND telefono = ? AND estado = 'activa'
           AND ultimo_mensaje_at > NOW() - interval '${VENTANA_WHATSAPP}'
         ORDER BY id DESC LIMIT 1`,
        [tel]
    );
    if (rows[0]) return rows[0];
    await db.query(
        `UPDATE agente_conversaciones SET estado = 'finalizada', finalizada_at = NOW()
         WHERE canal = 'whatsapp' AND telefono = ? AND estado = 'activa'`,
        [tel]
    );
    const clienteId = await clienteIdPorTelefono(tel);
    const [ins] = await db.query(
        `INSERT INTO agente_conversaciones (canal, telefono, nombre, cliente_id) VALUES ('whatsapp', ?, ?, ?)`,
        [tel, nombre ? String(nombre).slice(0, 100) : null, clienteId]
    );
    const [nueva] = await db.query('SELECT * FROM agente_conversaciones WHERE id = ?', [ins.insertId]);
    return nueva[0];
}

/** Conversación de una llamada de Vapi (una por call.id). */
async function obtenerOCrearVoz({ externalId, telefono }) {
    const tel = normalizar(telefono) || 'desconocido';
    const clienteId = tel === 'desconocido' ? null : await clienteIdPorTelefono(tel);
    const [ins] = await db.query(
        `INSERT INTO agente_conversaciones (canal, telefono, cliente_id, external_id) VALUES ('voz', ?, ?, ?)
         ON CONFLICT (external_id) DO UPDATE SET ultimo_mensaje_at = NOW()
         RETURNING id`,
        [tel, clienteId, externalId]
    );
    const [rows] = await db.query('SELECT * FROM agente_conversaciones WHERE id = ?', [ins.insertId]);
    return rows[0];
}

async function agregarMensaje(conversacionId, rol, contenido, herramienta = null) {
    const texto = String(contenido ?? '').trim();
    if (!texto) return;
    await db.query(
        'INSERT INTO agente_mensajes (conversacion_id, rol, contenido, herramienta) VALUES (?, ?, ?, ?)',
        [conversacionId, rol, texto.slice(0, 8000), herramienta]
    );
    await db.query('UPDATE agente_conversaciones SET ultimo_mensaje_at = NOW() WHERE id = ?', [conversacionId]);
}

/** Últimos mensajes en formato de chat para el modelo (el personal cuenta como "assistant"). */
async function historialParaModelo(conversacionId, limite = 30) {
    const [rows] = await db.query(
        `SELECT rol, contenido FROM (
             SELECT id, rol, contenido FROM agente_mensajes
             WHERE conversacion_id = ? AND rol IN ('cliente','agente','personal')
             ORDER BY id DESC LIMIT ?
         ) t ORDER BY id ASC`,
        [conversacionId, limite]
    );
    return rows.map((m) => ({ role: m.rol === 'cliente' ? 'user' : 'assistant', content: m.contenido }));
}

async function marcarHumano(conversacionId, valor = true) {
    await db.query('UPDATE agente_conversaciones SET necesita_humano = ? WHERE id = ?', [valor ? 1 : 0, conversacionId]);
}

async function asociarPedido(conversacionId, pedidoId) {
    if (!conversacionId || !pedidoId) return;
    await db.query('UPDATE agente_conversaciones SET pedido_id = ? WHERE id = ?', [pedidoId, conversacionId]);
}

module.exports = {
    obtenerOCrearWhatsapp, obtenerOCrearVoz, agregarMensaje, historialParaModelo, marcarHumano, asociarPedido
};
