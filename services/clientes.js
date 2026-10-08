// Clientes: búsqueda por teléfono (llamadas, WhatsApp, delivery) y alta automática.
// Relacionado con: services/delivery.js, services/agente/ejecutor.js, database.sql (clientes)
const { normalizar, ultimos10 } = require('./telefono');

const NOMBRES_GENERICOS = new Set(['', 'whatsapp', 'cliente', 'cliente whatsapp', 'cliente telefono', 'cliente teléfono']);

/** Busca un cliente por teléfono (compara los últimos 10 dígitos). */
async function buscarPorTelefono(conn, telefono) {
    const u10 = ultimos10(telefono);
    if (u10.length < 7) return null;
    const [rows] = await conn.query(
        `SELECT * FROM clientes
         WHERE right(regexp_replace(telefono, '\\D', '', 'g'), 10) = ?
         ORDER BY id LIMIT 1`,
        [u10]
    );
    return rows[0] || null;
}

/**
 * Devuelve el cliente de ese teléfono; si no existe lo crea.
 * Si ya existe y llega una dirección nueva, la guarda como dirección habitual.
 */
async function buscarOCrear(conn, { telefono, nombre, direccion }) {
    const nombreLimpio = String(nombre || '').trim().slice(0, 100);
    const dir = String(direccion || '').trim() || null;
    const existente = await buscarPorTelefono(conn, telefono);
    if (existente) {
        const sets = [];
        const vals = [];
        if (dir && dir !== existente.direccion) { sets.push('direccion = ?'); vals.push(dir); }
        if (nombreLimpio && NOMBRES_GENERICOS.has(String(existente.nombre || '').trim().toLowerCase())) {
            sets.push('nombre = ?'); vals.push(nombreLimpio);
        }
        if (sets.length) {
            vals.push(existente.id);
            await conn.query(`UPDATE clientes SET ${sets.join(', ')} WHERE id = ?`, vals);
        }
        return { ...existente, nombre: sets.includes('nombre = ?') ? nombreLimpio : existente.nombre, direccion: dir || existente.direccion, nuevo: false };
    }
    const tel = normalizar(telefono) || String(telefono || '').slice(0, 20) || null;
    const [ins] = await conn.query(
        'INSERT INTO clientes (nombre, direccion, telefono) VALUES (?, ?, ?)',
        [nombreLimpio || 'Cliente', dir, tel]
    );
    return { id: ins.insertId, nombre: nombreLimpio || 'Cliente', direccion: dir, telefono: tel, nuevo: true };
}

/** Cliente genérico para ventas sin datos (pedidos para llevar sin teléfono). */
async function consumidorFinal(conn) {
    const [rows] = await conn.query(`SELECT * FROM clientes WHERE lower(nombre) = 'consumidor final' ORDER BY id LIMIT 1`);
    if (rows[0]) return rows[0];
    const [ins] = await conn.query(`INSERT INTO clientes (nombre) VALUES ('Consumidor final')`);
    return { id: ins.insertId, nombre: 'Consumidor final' };
}

module.exports = { buscarPorTelefono, buscarOCrear, consumidorFinal };
