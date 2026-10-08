// Reservas: reglas compartidas por el formulario público y los agentes (voz / WhatsApp).
// Valida anticipación, horario del local y capacidad; el personal confirma después (estado "pendiente").
// Relacionado con: routes/reservas.js (formulario público), services/agente/ejecutor.js, database.sql (reservas)
const db = require('../db');
const { ErrorPublico } = require('./errores');
const { normalizar, ultimos10 } = require('./telefono');

const FECHA_HORA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function aMinutos(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
}

/** Une "YYYY-MM-DD" + "HH:MM" (con tolerancia a "8:30", "20:00:00") en "YYYY-MM-DDTHH:mm". */
function armarFechaHora(fecha, hora) {
    const f = String(fecha || '').trim();
    const m = /^(\d{1,2}):(\d{2})/.exec(String(hora || '').trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !m) return null;
    return `${f}T${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Si el horario del día está configurado, la hora debe caer dentro de él. */
async function validarHorario(conn, fechaHora) {
    const [fecha, hora] = fechaHora.split('T');
    const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
    const [rows] = await conn.query(
        `SELECT cerrado, to_char(abre, 'HH24:MI') AS abre, to_char(cierra, 'HH24:MI') AS cierra FROM horarios WHERE dia = ?`,
        [dia]
    );
    const h = rows[0];
    if (!h) return; // horario aún sin configurar: no se bloquea
    if (Number(h.cerrado)) throw new ErrorPublico(`El restaurante está cerrado los ${DIAS[dia]}`);
    const t = aMinutos(hora);
    const abre = aMinutos(h.abre);
    const cierra = aMinutos(h.cierra);
    const dentro = cierra > abre ? t >= abre && t < cierra - 30 : t >= abre || t < cierra - 30;
    if (!dentro) throw new ErrorPublico(`Ese día atendemos de ${h.abre} a ${h.cierra}. Elige una hora dentro de ese horario`);
}

/** Comensales ya reservados cerca de esa hora (±90 min) en reservas activas. */
async function comensalesCerca(conn, fechaHora) {
    const [rows] = await conn.query(
        `SELECT COALESCE(SUM(personas), 0) AS n FROM reservas
         WHERE estado IN ('pendiente','confirmada','sentada')
           AND ABS(EXTRACT(EPOCH FROM (fecha_hora - ?::timestamptz))) < 5400`,
        [fechaHora]
    );
    return Number(rows[0].n);
}

/**
 * Comprueba si hay lugar. Devuelve { disponible, motivo? }. Nunca lanza por falta de cupo.
 */
async function disponibilidad(conn, { fechaHora, personas }) {
    if (!FECHA_HORA_RE.test(fechaHora || '')) throw new ErrorPublico('Fecha u hora inválidas');
    const n = Math.floor(Number(personas) || 0);
    if (!(n >= 1 && n <= 50)) throw new ErrorPublico('Número de personas inválido');
    const [chk] = await conn.query(
        `SELECT (?::timestamptz > NOW() + interval '30 minutes') AS futura,
                (?::timestamptz < NOW() + interval '90 days') AS cercana`,
        [fechaHora, fechaHora]
    );
    if (!chk[0].futura) return { disponible: false, motivo: 'Debe ser con al menos 30 minutos de anticipación' };
    if (!chk[0].cercana) return { disponible: false, motivo: 'Solo se reserva hasta 90 días antes' };
    try {
        await validarHorario(conn, fechaHora);
    } catch (e) {
        if (e.publico) return { disponible: false, motivo: e.message };
        throw e;
    }
    const [cfg] = await conn.query('SELECT reservas_capacidad FROM configuracion_impresion ORDER BY id LIMIT 1');
    const capacidad = Number(cfg[0]?.reservas_capacidad || 60);
    const ocupados = await comensalesCerca(conn, fechaHora);
    if (ocupados + n > capacidad) {
        return { disponible: false, motivo: 'A esa hora ya tenemos el cupo lleno', cupo_restante: Math.max(0, capacidad - ocupados) };
    }
    return { disponible: true, cupo_restante: capacidad - ocupados };
}

/** Crea la reserva (siempre "pendiente"; el personal la confirma). */
async function crear(conn, { nombre, telefono, email = null, personas, fechaHora, notas = null, origen }) {
    const nom = String(nombre || '').trim().slice(0, 100);
    if (!nom) throw new ErrorPublico('Falta el nombre para la reserva');
    const tel = normalizar(telefono);
    if (!tel && !email) throw new ErrorPublico('Falta un teléfono o correo de contacto');
    const d = await disponibilidad(conn, { fechaHora, personas });
    if (!d.disponible) throw new ErrorPublico(d.motivo);
    const [ins] = await conn.query(
        `INSERT INTO reservas (nombre, telefono, email, personas, fecha_hora, estado, origen, notas)
         VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
        [nom, tel, email, Math.floor(Number(personas)), fechaHora, origen, notas ? String(notas).slice(0, 500) : null]
    );
    return { id: ins.insertId };
}

/** Próxima reserva activa de un teléfono. */
async function proximaPorTelefono(conn, telefono) {
    const u10 = ultimos10(telefono);
    if (u10.length < 7) return null;
    const [rows] = await conn.query(
        `SELECT id, nombre, personas, estado, to_char(fecha_hora, 'YYYY-MM-DD') AS fecha, to_char(fecha_hora, 'HH24:MI') AS hora
         FROM reservas
         WHERE estado IN ('pendiente','confirmada') AND fecha_hora >= NOW() - interval '1 hour'
           AND right(regexp_replace(COALESCE(telefono, ''), '\\D', '', 'g'), 10) = ?
         ORDER BY fecha_hora ASC LIMIT 1`,
        [u10]
    );
    return rows[0] || null;
}

async function cancelarProxima(conn, telefono, motivo) {
    const r = await proximaPorTelefono(conn, telefono);
    if (!r) throw new ErrorPublico('No encuentro una reserva activa con este teléfono');
    await conn.query(
        `UPDATE reservas SET estado = 'cancelada', notas = COALESCE(notas || E'\\n', '') || ? WHERE id = ?`,
        [`Cancelada por el cliente${motivo ? `: ${String(motivo).slice(0, 200)}` : ''}`, r.id]
    );
    return r;
}

module.exports = { FECHA_HORA_RE, armarFechaHora, validarHorario, disponibilidad, crear, proximaPorTelefono, cancelarProxima };
