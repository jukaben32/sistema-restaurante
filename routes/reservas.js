// Reservas
// - staff (mesero/admin): panel /reservas y API /api/reservas
// - publico: formulario /reservar y POST /api/reservar (entra como "pendiente", origen "web")
// Las fechas se envían como "YYYY-MM-DDTHH:mm" en hora local del restaurante; la sesión de BD
// usa DB_TIMEZONE (db.js), así que PostgreSQL las interpreta en esa zona.
// Relacionado con: views/reservas.ejs, public/js/reservas.js, views/reservar.ejs, database.sql (reservas)
const express = require('express');
const db = require('../db');

const ESTADOS = ['pendiente', 'confirmada', 'sentada', 'completada', 'cancelada', 'no_show'];
const ACTIVAS = ['pendiente', 'confirmada'];
const FECHA_HORA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(res, status, message) {
    return res.status(status).json({ error: message });
}

function leerReserva(body) {
    const r = {
        nombre: String(body.nombre || '').trim().slice(0, 100),
        telefono: String(body.telefono || '').trim().slice(0, 30) || null,
        email: String(body.email || '').trim().slice(0, 120) || null,
        personas: Math.floor(Number(body.personas) || 0),
        fecha_hora: String(body.fecha_hora || '').trim(),
        notas: String(body.notas || '').trim().slice(0, 500) || null,
        mesa_id: body.mesa_id ? Number(body.mesa_id) : null
    };
    if (!r.nombre) return { error: 'El nombre es obligatorio' };
    if (!r.telefono && !r.email) return { error: 'Deja un teléfono o un correo para contactarte' };
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return { error: 'Correo inválido' };
    if (!(r.personas >= 1 && r.personas <= 50)) return { error: 'Número de personas inválido' };
    if (!FECHA_HORA_RE.test(r.fecha_hora)) return { error: 'Fecha y hora inválidas' };
    if (r.mesa_id !== null && !(Number.isInteger(r.mesa_id) && r.mesa_id > 0)) return { error: 'Mesa inválida' };
    return { r };
}

// ¿La mesa ya tiene otra reserva activa a menos de 2 horas?
async function choqueMesa(conn, mesaId, fechaHora, excluirId = null) {
    if (!mesaId) return null;
    const [rows] = await conn.query(
        `SELECT id, nombre, fecha_hora FROM reservas
         WHERE mesa_id = ? AND estado IN ('pendiente','confirmada')
           AND ABS(EXTRACT(EPOCH FROM (fecha_hora - ?::timestamptz))) < 7200
           AND (?::int IS NULL OR id <> ?::int)
         LIMIT 1`,
        [mesaId, fechaHora, excluirId, excluirId]
    );
    return rows[0] || null;
}

// ===================== STAFF =====================
const staff = express.Router();

staff.get('/reservas', async (req, res) => {
    try {
        const [mesas] = await db.query('SELECT id, numero FROM mesas ORDER BY id');
        res.render('reservas', { mesas });
    } catch (e) {
        console.error('Error al cargar reservas:', e);
        res.status(500).render('error', { error: { message: 'Error al cargar reservas', stack: '' } });
    }
});

staff.get('/api/reservas', async (req, res) => {
    try {
        const fecha = String(req.query.fecha || '');
        const params = [];
        let where;
        if (FECHA_RE.test(fecha)) {
            where = 'r.fecha_hora::date = ?::date';
            params.push(fecha);
        } else {
            // Próximas (desde hoy) si no se indica fecha
            where = `r.fecha_hora::date >= CURRENT_DATE AND r.estado IN ('pendiente','confirmada')`;
        }
        const [rows] = await db.query(
            `SELECT r.*, to_char(r.fecha_hora, 'YYYY-MM-DD"T"HH24:MI') AS fecha_hora_local,
                    to_char(r.fecha_hora, 'HH24:MI') AS hora, m.numero AS mesa_numero
             FROM reservas r LEFT JOIN mesas m ON m.id = r.mesa_id
             WHERE ${where}
             ORDER BY r.fecha_hora ASC
             LIMIT 300`,
            params
        );
        res.json(rows);
    } catch (e) {
        console.error('Error al listar reservas:', e);
        err(res, 500, 'Error al listar reservas');
    }
});

// Resumen de los próximos 14 días (cantidad de reservas y personas por día)
staff.get('/api/reservas/resumen', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT to_char(fecha_hora::date, 'YYYY-MM-DD') AS fecha, COUNT(*) AS reservas, SUM(personas) AS personas
             FROM reservas
             WHERE fecha_hora::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 13
               AND estado IN ('pendiente','confirmada','sentada')
             GROUP BY 1 ORDER BY 1`
        );
        res.json(rows);
    } catch (e) {
        console.error('Error en resumen de reservas:', e);
        err(res, 500, 'Error en resumen de reservas');
    }
});

staff.post('/api/reservas', async (req, res) => {
    const { r, error } = leerReserva(req.body || {});
    if (error) return err(res, 400, error);
    try {
        const choque = await choqueMesa(db, r.mesa_id, r.fecha_hora);
        if (choque) return err(res, 409, `La mesa ya está reservada cerca de esa hora (${choque.nombre})`);
        const estado = ACTIVAS.includes(req.body?.estado) ? req.body.estado : 'confirmada';
        const [ins] = await db.query(
            `INSERT INTO reservas (nombre, telefono, email, personas, fecha_hora, mesa_id, estado, origen, notas)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'interno', ?)`,
            [r.nombre, r.telefono, r.email, r.personas, r.fecha_hora, r.mesa_id, estado, r.notas]
        );
        res.status(201).json({ id: ins.insertId });
    } catch (e) {
        if (e.code === 'ER_NO_REFERENCED_ROW_2') return err(res, 400, 'La mesa no existe');
        console.error('Error al crear reserva:', e);
        err(res, 500, 'Error al crear la reserva');
    }
});

staff.put('/api/reservas/:id(\\d+)', async (req, res) => {
    const { r, error } = leerReserva(req.body || {});
    if (error) return err(res, 400, error);
    try {
        const choque = await choqueMesa(db, r.mesa_id, r.fecha_hora, Number(req.params.id));
        if (choque) return err(res, 409, `La mesa ya está reservada cerca de esa hora (${choque.nombre})`);
        const [upd] = await db.query(
            `UPDATE reservas SET nombre = ?, telefono = ?, email = ?, personas = ?, fecha_hora = ?, mesa_id = ?, notas = ?
             WHERE id = ?`,
            [r.nombre, r.telefono, r.email, r.personas, r.fecha_hora, r.mesa_id, r.notas, req.params.id]
        );
        if (!upd.affectedRows) return err(res, 404, 'Reserva no encontrada');
        res.json({ ok: true });
    } catch (e) {
        if (e.code === 'ER_NO_REFERENCED_ROW_2') return err(res, 400, 'La mesa no existe');
        console.error('Error al editar reserva:', e);
        err(res, 500, 'Error al editar la reserva');
    }
});

staff.put('/api/reservas/:id(\\d+)/estado', async (req, res) => {
    const estado = String(req.body?.estado || '');
    if (!ESTADOS.includes(estado)) return err(res, 400, 'Estado inválido');
    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT id, mesa_id FROM reservas WHERE id = ? FOR UPDATE', [req.params.id]);
        if (!rows[0]) { await connection.rollback(); return err(res, 404, 'Reserva no encontrada'); }
        await connection.query('UPDATE reservas SET estado = ? WHERE id = ?', [estado, req.params.id]);
        const mesaId = rows[0].mesa_id;
        if (mesaId) {
            if (estado === 'confirmada') {
                // Solo marca la mesa como reservada si la reserva es hoy y la mesa está libre
                await connection.query(
                    `UPDATE mesas SET estado = 'reservada'
                     WHERE id = ? AND estado = 'libre'
                       AND EXISTS (SELECT 1 FROM reservas WHERE id = ? AND fecha_hora::date = CURRENT_DATE)`,
                    [mesaId, req.params.id]
                );
            } else {
                // Al sentar / cerrar / cancelar, la mesa deja de estar "reservada"
                await connection.query(`UPDATE mesas SET estado = 'libre' WHERE id = ? AND estado = 'reservada'`, [mesaId]);
            }
        }
        await connection.commit();
        res.json({ ok: true });
    } catch (e) {
        if (connection) await connection.rollback().catch(() => {});
        console.error('Error al cambiar estado de reserva:', e);
        err(res, 500, 'Error al cambiar el estado');
    } finally {
        if (connection) connection.release();
    }
});

// ===================== PÚBLICO =====================
const publico = express.Router();
const hits = new Map();

publico.get('/reservar', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT nombre_negocio, direccion, telefono FROM configuracion_impresion ORDER BY id LIMIT 1');
        res.render('reservar', { negocio: rows[0] || { nombre_negocio: 'Restaurant Martin' } });
    } catch (e) {
        res.render('reservar', { negocio: { nombre_negocio: 'Restaurant Martin' } });
    }
});

publico.post('/api/reservar', async (req, res) => {
    // Honeypot anti-bots: campo oculto que una persona deja vacío
    if (String(req.body?.website || '').trim()) return res.status(201).json({ ok: true });

    const now = Date.now();
    const key = String(req.ip);
    const arr = (hits.get(key) || []).filter((t) => now - t < 3600000);
    if (arr.length >= 5) return err(res, 429, 'Demasiadas solicitudes. Llámanos para reservar.');

    const { r, error } = leerReserva({ ...(req.body || {}), mesa_id: null });
    if (error) return err(res, 400, error);
    try {
        const [chk] = await db.query(
            `SELECT (?::timestamptz > NOW() + interval '30 minutes') AS futura,
                    (?::timestamptz < NOW() + interval '90 days') AS cercana`,
            [r.fecha_hora, r.fecha_hora]
        );
        if (!chk[0].futura) return err(res, 400, 'Elige una hora con al menos 30 minutos de anticipación');
        if (!chk[0].cercana) return err(res, 400, 'Solo aceptamos reservas hasta 90 días antes');
        if (r.personas > 20) return err(res, 400, 'Para grupos de más de 20 personas, llámanos');

        arr.push(now);
        hits.set(key, arr);
        await db.query(
            `INSERT INTO reservas (nombre, telefono, email, personas, fecha_hora, estado, origen, notas)
             VALUES (?, ?, ?, ?, ?, 'pendiente', 'web', ?)`,
            [r.nombre, r.telefono, r.email, r.personas, r.fecha_hora, r.notas]
        );
        res.status(201).json({ ok: true });
    } catch (e) {
        console.error('Error al recibir reserva web:', e);
        err(res, 500, 'No pudimos registrar tu reserva. Intenta de nuevo o llámanos.');
    }
});

module.exports = { staff, publico };
