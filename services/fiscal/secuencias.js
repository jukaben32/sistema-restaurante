// Secuencias autorizadas por la DGII (rangos de e-NCF y de NCF serie B) y asignación del siguiente número.
// La asignación es ATÓMICA: bloquea la fila de la secuencia dentro de la transacción de la factura, así no hay números repetidos
// ni "huecos" aunque dos cajeros facturen al mismo tiempo (si la venta falla y se deshace, el número vuelve a quedar libre).
// Relacionado con: services/facturacion.js, routes/fiscal.js
const db = require('../../db');
const calculo = require('./calculo');

const TIPOS = ['E31', 'E32', 'E33', 'E34', 'B01', 'B02', 'B04', 'B14', 'B15'];
const NOMBRES = { E31: 'e-CF crédito fiscal', E32: 'e-CF consumo', E33: 'e-CF nota de débito', E34: 'e-CF nota de crédito', B01: 'NCF crédito fiscal', B02: 'NCF consumo', B04: 'NCF nota de crédito', B14: 'NCF regímenes especiales', B15: 'NCF gubernamental' };
const MAX_SECUENCIAL = { E: 9999999999, B: 99999999 };
const err = (m) => Object.assign(new Error(m), { publico: true });

/**
 * Toma el siguiente número del tipo. `produccion` = true usa solo secuencias reales; false usa las de práctica o las reales.
 * Debe llamarse dentro de la transacción de la factura.
 */
async function asignar(conn, tipo, { produccion = false } = {}) {
    const [rows] = await conn.query(
        `SELECT id, siguiente, hasta, vence, practica FROM fiscal_secuencias
         WHERE tipo = ? AND activa = 1 AND siguiente <= hasta AND (vence IS NULL OR vence >= CURRENT_DATE)
           ${produccion ? 'AND practica = 0' : ''}
         ORDER BY practica ASC, desde ASC LIMIT 1 FOR UPDATE`, [tipo]
    );
    if (!rows[0]) {
        throw err(`No hay secuencias vigentes de ${tipo} (${NOMBRES[tipo] || tipo}). El administrador debe cargarlas en Ajustes → Fiscal; sin ellas no se puede emitir este comprobante.`);
    }
    const s = rows[0];
    await conn.query('UPDATE fiscal_secuencias SET siguiente = siguiente + 1 WHERE id = ?', [s.id]);
    return { ncf: calculo.formatearNCF(tipo, Number(s.siguiente)), vence: s.vence, secuenciaId: Number(s.id), practica: Number(s.practica) === 1 };
}

/** Lista con cuántos números quedan y alertas (se acaba pronto o vence pronto). */
async function listar(conn = db) {
    const [rows] = await conn.query(`SELECT * FROM fiscal_secuencias ORDER BY tipo, desde`);
    const hoy = new Date(new Date().toISOString().slice(0, 10));
    return rows.map((s) => {
        const restantes = Math.max(0, Number(s.hasta) - Number(s.siguiente) + 1);
        const vence = s.vence ? new Date(new Date(s.vence).toISOString().slice(0, 10)) : null;
        const diasParaVencer = vence ? Math.round((vence - hoy) / 86400000) : null;
        let estado = 'vigente';
        if (!Number(s.activa)) estado = 'inactiva';
        else if (restantes === 0) estado = 'agotada';
        else if (vence && diasParaVencer < 0) estado = 'vencida';
        const total = Number(s.hasta) - Number(s.desde) + 1;
        const alertas = [];
        if (estado === 'vigente' && restantes <= Math.max(50, Math.ceil(total * 0.1))) alertas.push('Se está acabando: solicita una nueva secuencia a la DGII');
        if (estado === 'vigente' && diasParaVencer !== null && diasParaVencer <= 30) alertas.push(`Vence en ${diasParaVencer} día(s)`);
        return { id: Number(s.id), tipo: s.tipo, nombre: NOMBRES[s.tipo], desde: Number(s.desde), hasta: Number(s.hasta), siguiente: Number(s.siguiente), restantes, total, vence: s.vence, activa: Number(s.activa) === 1, practica: Number(s.practica) === 1, estado, alertas };
    });
}

/** Registra un rango autorizado por la DGII. */
async function crear({ tipo, desde, hasta, vence, practica = false }, usuario = null) {
    if (!TIPOS.includes(tipo)) throw err('Tipo de comprobante inválido');
    const d = Number(desde), h = Number(hasta);
    if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || h < d) throw err('El rango es inválido: "desde" debe ser 1 o más y "hasta" no puede ser menor.');
    if (h > MAX_SECUENCIAL[tipo[0]]) throw err(`El número máximo para ${tipo} es ${MAX_SECUENCIAL[tipo[0]].toLocaleString('es-DO')}.`);
    if (!practica && !vence) throw err('Indica la fecha de vencimiento autorizada por la DGII.');
    if (vence && !/^\d{4}-\d{2}-\d{2}$/.test(String(vence))) throw err('La fecha de vencimiento es inválida.');
    const [sol] = await db.query(`SELECT 1 FROM fiscal_secuencias WHERE tipo = ? AND practica = ? AND NOT (hasta < ? OR desde > ?) LIMIT 1`, [tipo, practica ? 1 : 0, d, h]);
    if (sol[0]) throw err('Ese rango se cruza con otro ya cargado del mismo tipo.');
    const [r] = await db.query(`INSERT INTO fiscal_secuencias (tipo, desde, hasta, siguiente, vence, practica) VALUES (?, ?, ?, ?, ?, ?)`, [tipo, d, h, d, vence || null, practica ? 1 : 0]);
    await db.query(`INSERT INTO fiscal_eventos (evento, detalle, usuario) VALUES ('secuencia_creada', ?, ?)`, [`${tipo} ${d}-${h}${practica ? ' (práctica)' : ''}`, usuario]);
    return { id: r.insertId };
}

/** Secuencias de práctica (para aprender y probar sin la DGII). Solo se pueden usar fuera de producción. */
async function cargarPractica(usuario = null) {
    const vence = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    let n = 0;
    for (const tipo of ['E31', 'E32', 'E34', 'B01', 'B02', 'B04']) {
        const [ya] = await db.query(`SELECT 1 FROM fiscal_secuencias WHERE tipo = ? AND practica = 1 LIMIT 1`, [tipo]);
        if (ya[0]) continue;
        await crear({ tipo, desde: 1, hasta: tipo[0] === 'E' ? 100000 : 99999, vence, practica: true }, usuario);
        n++;
    }
    return { creadas: n };
}

/** Desactiva un rango (no se borra: queda el historial). */
async function desactivar(id, usuario = null) {
    const [r] = await db.query(`UPDATE fiscal_secuencias SET activa = 0 WHERE id = ?`, [id]);
    if (!r.affectedRows) throw err('Secuencia no encontrada');
    await db.query(`INSERT INTO fiscal_eventos (evento, detalle, usuario) VALUES ('secuencia_desactivada', ?, ?)`, [String(id), usuario]);
}

module.exports = { TIPOS, NOMBRES, asignar, listar, crear, cargarPractica, desactivar };
