// Configuración → Agentes (solo administrador): datos del negocio que usan el delivery y los
// agentes de voz / WhatsApp: horario, zonas de entrega, preguntas frecuentes y datos de pago.
// Vista: /configuracion/agentes  ·  API: GET/PUT /api/negocio
// Relacionado con: views/config_agentes.ejs, public/js/config-agentes.js, services/agente/*
const express = require('express');
const db = require('../db');
const { ErrorPublico } = require('../services/errores');

const router = express.Router();
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

router.get('/configuracion/agentes', (req, res) => res.render('config_agentes'));

async function leerTodo(conn = db) {
    const [[horarios], [zonas], [faq], [cfg]] = await Promise.all([
        conn.query(`SELECT dia, to_char(abre, 'HH24:MI') AS abre, to_char(cierra, 'HH24:MI') AS cierra, cerrado, delivery FROM horarios ORDER BY dia`),
        conn.query('SELECT id, nombre, costo_envio, minutos_estimados, activa FROM delivery_zonas ORDER BY orden, id'),
        conn.query('SELECT id, pregunta, respuesta FROM negocio_faq ORDER BY orden, id'),
        conn.query(`SELECT nombre_negocio, direccion, telefono, delivery_activo, pedido_minimo_delivery, tiempo_preparacion_min,
                           telefono_humano, datos_transferencia, moneda
                    FROM configuracion_impresion ORDER BY id LIMIT 1`)
    ]);
    const c = cfg[0] || {};
    // Siempre 7 filas (0 = domingo … 6 = sábado), aunque aún no se hayan guardado
    const dias = Array.from({ length: 7 }, (_, d) => {
        const h = horarios.find((x) => Number(x.dia) === d);
        return h ? { dia: d, abre: h.abre, cierra: h.cierra, cerrado: Number(h.cerrado), delivery: Number(h.delivery) }
                 : { dia: d, abre: '', cierra: '', cerrado: 0, delivery: 1, sinConfigurar: true };
    });
    return {
        horarios: dias,
        zonas: zonas.map((z) => ({ id: z.id, nombre: z.nombre, costo_envio: Number(z.costo_envio), minutos_estimados: Number(z.minutos_estimados), activa: Number(z.activa) })),
        faq,
        config: {
            nombre_negocio: c.nombre_negocio || '', direccion: c.direccion || '', telefono: c.telefono || '',
            delivery_activo: Number(c.delivery_activo ?? 1), pedido_minimo_delivery: Number(c.pedido_minimo_delivery || 0),
            tiempo_preparacion_min: Number(c.tiempo_preparacion_min || 25), telefono_humano: c.telefono_humano || '',
            datos_transferencia: c.datos_transferencia || '', moneda: c.moneda || 'dop'
        }
    };
}

router.get('/api/negocio', async (req, res) => {
    try {
        res.json(await leerTodo());
    } catch (e) {
        console.error('Error al leer datos del negocio:', e);
        res.status(500).json({ error: 'Error al cargar la configuración' });
    }
});

router.put('/api/negocio', async (req, res) => {
    const b = req.body || {};
    let c;
    try {
        // ----- Validación -----
        const cfg = b.config || {};
        const minimo = Number(cfg.pedido_minimo_delivery || 0);
        const prep = Math.floor(Number(cfg.tiempo_preparacion_min || 25));
        if (!Number.isFinite(minimo) || minimo < 0) throw new ErrorPublico('Pedido mínimo inválido');
        if (!(prep >= 1 && prep <= 180)) throw new ErrorPublico('El tiempo de preparación debe estar entre 1 y 180 minutos');

        const horarios = (Array.isArray(b.horarios) ? b.horarios : []).map((h) => ({
            dia: Number(h.dia), abre: String(h.abre || ''), cierra: String(h.cierra || ''),
            cerrado: Number(h.cerrado) ? 1 : 0, delivery: Number(h.delivery) ? 1 : 0
        }));
        for (const h of horarios) {
            if (!(Number.isInteger(h.dia) && h.dia >= 0 && h.dia <= 6)) throw new ErrorPublico('Día inválido en el horario');
            if (!h.cerrado && !(HORA_RE.test(h.abre) && HORA_RE.test(h.cierra))) {
                throw new ErrorPublico('Completa la hora de apertura y cierre de los días abiertos (formato HH:MM)');
            }
        }

        const zonas = (Array.isArray(b.zonas) ? b.zonas : []).map((z, i) => ({
            id: z.id ? Number(z.id) : null, nombre: String(z.nombre || '').trim().slice(0, 100),
            costo: Number(z.costo_envio || 0), minutos: Math.floor(Number(z.minutos_estimados || 40)), activa: Number(z.activa) ? 1 : 0, orden: i
        }));
        const nombres = new Set();
        for (const z of zonas) {
            if (!z.nombre) throw new ErrorPublico('Cada zona necesita un nombre');
            if (nombres.has(z.nombre.toLowerCase())) throw new ErrorPublico(`La zona "${z.nombre}" está repetida`);
            nombres.add(z.nombre.toLowerCase());
            if (!Number.isFinite(z.costo) || z.costo < 0) throw new ErrorPublico(`Costo de envío inválido en "${z.nombre}"`);
            if (!(z.minutos >= 5 && z.minutos <= 240)) throw new ErrorPublico(`Los minutos de "${z.nombre}" deben estar entre 5 y 240`);
        }

        const faq = (Array.isArray(b.faq) ? b.faq : [])
            .map((f, i) => ({ pregunta: String(f.pregunta || '').trim().slice(0, 200), respuesta: String(f.respuesta || '').trim().slice(0, 1000), orden: i }))
            .filter((f) => f.pregunta && f.respuesta);

        // ----- Guardado atómico -----
        c = await db.getConnection();
        await c.beginTransaction();

        for (const h of horarios) {
            await c.query(
                `INSERT INTO horarios (dia, abre, cierra, cerrado, delivery) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT (dia) DO UPDATE SET abre = EXCLUDED.abre, cierra = EXCLUDED.cierra,
                                                 cerrado = EXCLUDED.cerrado, delivery = EXCLUDED.delivery`,
                [h.dia, h.cerrado ? null : h.abre, h.cerrado ? null : h.cierra, h.cerrado, h.delivery]
            );
        }

        const idsConservados = zonas.filter((z) => z.id).map((z) => z.id);
        if (idsConservados.length) await c.query('DELETE FROM delivery_zonas WHERE id NOT IN (?)', [idsConservados]);
        else await c.query('DELETE FROM delivery_zonas');
        for (const z of zonas) {
            if (z.id) {
                await c.query(
                    'UPDATE delivery_zonas SET nombre = ?, costo_envio = ?, minutos_estimados = ?, activa = ?, orden = ? WHERE id = ?',
                    [z.nombre, z.costo, z.minutos, z.activa, z.orden, z.id]
                );
            } else {
                await c.query(
                    'INSERT INTO delivery_zonas (nombre, costo_envio, minutos_estimados, activa, orden) VALUES (?, ?, ?, ?, ?)',
                    [z.nombre, z.costo, z.minutos, z.activa, z.orden]
                );
            }
        }

        await c.query('DELETE FROM negocio_faq');
        if (faq.length) {
            await c.query('INSERT INTO negocio_faq (pregunta, respuesta, orden) VALUES ?', [faq.map((f) => [f.pregunta, f.respuesta, f.orden])]);
        }

        const [cur] = await c.query('SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1');
        if (!cur[0]) await c.query(`INSERT INTO configuracion_impresion (nombre_negocio) VALUES ('Restaurant Martin')`);
        await c.query(
            `UPDATE configuracion_impresion SET delivery_activo = ?, pedido_minimo_delivery = ?, tiempo_preparacion_min = ?,
                    telefono_humano = ?, datos_transferencia = ?
             WHERE id = (SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1)`,
            [Number(cfg.delivery_activo) ? 1 : 0, minimo, prep,
             String(cfg.telefono_humano || '').trim().slice(0, 30) || null,
             String(cfg.datos_transferencia || '').trim().slice(0, 1000) || null]
        );

        await c.commit();
        res.json({ ok: true, ...(await leerTodo()) });
    } catch (e) {
        if (c) await c.rollback().catch(() => {});
        if (e && e.publico) return res.status(400).json({ error: e.message });
        if (e && e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Hay zonas con el mismo nombre' });
        console.error('Error al guardar datos del negocio:', e);
        res.status(500).json({ error: 'Error al guardar la configuración' });
    } finally {
        if (c) c.release();
    }
});

module.exports = router;
