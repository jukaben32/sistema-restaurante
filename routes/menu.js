// Menú digital por QR
// - publico: /menu/:token (carta de la mesa), /menu/img/:id, /api/menu/:token/* (pedir, llamar mesero, pedir cuenta)
// - staff (mesero/admin): avisos de mesas (/api/mesa-alertas) y hoja de QR imprimible (/mesas-qr)
//
// Seguridad: el token del QR es aleatorio por mesa (mesas.qr_token), los precios salen de la BD
// (nunca del cliente) y los pedidos del menú entran como "pendiente": el mesero los revisa y los
// envía a cocina desde Mesas.
// Relacionado con: views/menu.ejs, public/js/menu.js, views/mesas_qr.ejs, public/js/mesas.js (avisos)
const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');

const TOKEN_RE = /^[a-f0-9]{16,40}$/;

// Límite simple en memoria (por mesa + IP) para evitar abuso de los endpoints públicos
const hits = new Map();
function rateLimit(key, maxPorMinuto) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < 60000);
    if (arr.length >= maxPorMinuto) return false;
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) hits.clear();
    return true;
}

async function mesaPorToken(token) {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    const [rows] = await db.query('SELECT id, numero, descripcion, estado FROM mesas WHERE qr_token = ? LIMIT 1', [token]);
    return rows[0] || null;
}

async function negocio() {
    const [rows] = await db.query(
        `SELECT nombre_negocio, direccion, telefono, pie_pagina, moneda,
                (logo_data IS NOT NULL) AS tiene_logo
         FROM configuracion_impresion ORDER BY id LIMIT 1`
    );
    return rows[0] || { nombre_negocio: 'Restaurant Martin', moneda: 'usd' };
}

function baseUrl(req, cfgUrl) {
    return String(cfgUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

// ===================== PÚBLICO =====================
const publico = express.Router();

publico.get('/menu/img/:id(\\d+)', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT data, tipo FROM producto_imagenes WHERE producto_id = ?', [req.params.id]);
        if (!rows[0]) return res.status(404).end();
        res.setHeader('Content-Type', rows[0].tipo || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(rows[0].data);
    } catch (e) {
        res.status(500).end();
    }
});

publico.get('/menu/logo', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT logo_data, logo_tipo FROM configuracion_impresion WHERE logo_data IS NOT NULL ORDER BY id LIMIT 1');
        if (!rows[0]) return res.status(404).end();
        res.setHeader('Content-Type', `image/${String(rows[0].logo_tipo || 'png').replace(/^image\//, '')}`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.end(rows[0].logo_data);
    } catch (e) {
        res.status(500).end();
    }
});

publico.get('/menu/:token', async (req, res) => {
    try {
        const mesa = await mesaPorToken(req.params.token);
        if (!mesa) return res.status(404).render('404');
        const [productos] = await db.query(
            `SELECT p.id, p.nombre, p.descripcion, p.categoria, p.precio_unidad, p.disponible,
                    (pi.producto_id IS NOT NULL) AS tiene_imagen
             FROM productos p
             LEFT JOIN producto_imagenes pi ON pi.producto_id = p.id
             WHERE p.en_menu = 1 AND p.precio_unidad > 0
             ORDER BY COALESCE(p.categoria, 'zzz'), p.nombre`
        );
        const categorias = [];
        const porCategoria = {};
        for (const p of productos) {
            const c = p.categoria || 'Otros';
            if (!porCategoria[c]) { porCategoria[c] = []; categorias.push(c); }
            porCategoria[c].push(p);
        }
        res.render('menu', { mesa, token: req.params.token, negocio: await negocio(), categorias, porCategoria });
    } catch (e) {
        console.error('Error al cargar menú QR:', e);
        res.status(500).render('error', { error: { message: 'No se pudo cargar el menú', stack: '' } });
    }
});

// Estado del pedido actual de la mesa (para que el cliente vea si ya está en cocina / listo)
publico.get('/api/menu/:token/pedido', async (req, res) => {
    try {
        const mesa = await mesaPorToken(req.params.token);
        if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
        const [items] = await db.query(
            `SELECT i.id, pr.nombre, i.cantidad, i.subtotal, i.estado
             FROM pedidos p
             JOIN pedido_items i ON i.pedido_id = p.id
             JOIN productos pr ON pr.id = i.producto_id
             WHERE p.mesa_id = ? AND p.estado NOT IN ('cerrado','cancelado','rechazado')
               AND i.estado NOT IN ('cancelado','rechazado')
             ORDER BY i.created_at ASC, i.id ASC`,
            [mesa.id]
        );
        const total = items.reduce((a, it) => a + Number(it.subtotal || 0), 0);
        res.json({ items, total });
    } catch (e) {
        console.error('Error al consultar pedido de mesa (menú):', e);
        res.status(500).json({ error: 'Error al consultar el pedido' });
    }
});

// El cliente envía su pedido. Entra como "pendiente" para que el mesero lo confirme.
publico.post('/api/menu/:token/pedido', async (req, res) => {
    const mesa = await mesaPorToken(req.params.token).catch(() => null);
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (!rateLimit(`pedido:${mesa.id}:${req.ip}`, 4)) return res.status(429).json({ error: 'Espera un momento antes de enviar otro pedido' });

    const itemsIn = Array.isArray(req.body?.items) ? req.body.items.slice(0, 30) : [];
    const items = itemsIn
        .map((i) => ({
            producto_id: Number(i.producto_id),
            cantidad: Math.min(20, Math.max(1, Math.floor(Number(i.cantidad) || 0))),
            nota: String(i.nota || '').trim().slice(0, 200)
        }))
        .filter((i) => Number.isInteger(i.producto_id) && i.producto_id > 0 && i.cantidad > 0);
    if (items.length === 0) return res.status(400).json({ error: 'Tu pedido está vacío' });
    const nombreCliente = String(req.body?.nombre || '').trim().slice(0, 60);

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        const ids = [...new Set(items.map((i) => i.producto_id))];
        const [prods] = await connection.query(
            `SELECT id, nombre, precio_unidad FROM productos
             WHERE id IN (?) AND en_menu = 1 AND disponible = 1 AND precio_unidad > 0`,
            [ids]
        );
        const precio = new Map(prods.map((p) => [Number(p.id), p]));
        const noDisponibles = items.filter((i) => !precio.has(i.producto_id));
        if (noDisponibles.length) {
            await connection.rollback();
            return res.status(409).json({ error: 'Algunos productos ya no están disponibles. Actualiza el menú.' });
        }

        // Pedido abierto de la mesa (o uno nuevo)
        const [abiertos] = await connection.query(
            `SELECT id FROM pedidos WHERE mesa_id = ? AND estado NOT IN ('cerrado','cancelado','rechazado')
             ORDER BY id DESC LIMIT 1 FOR UPDATE`,
            [mesa.id]
        );
        let pedidoId = abiertos[0]?.id;
        if (!pedidoId) {
            const [ins] = await connection.query(
                `INSERT INTO pedidos (mesa_id, mesero_nombre, estado, total, notas) VALUES (?, NULL, 'abierto', 0, ?)`,
                [mesa.id, 'Pedido desde menú QR']
            );
            pedidoId = ins.insertId;
        }

        const etiqueta = nombreCliente ? `[Menú QR · ${nombreCliente}]` : '[Menú QR]';
        let total = 0;
        for (const it of items) {
            const p = precio.get(it.producto_id);
            const subtotal = Number(p.precio_unidad) * it.cantidad;
            total += subtotal;
            await connection.query(
                `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota)
                 VALUES (?, ?, ?, 'UND', ?, ?, 'pendiente', ?)`,
                [pedidoId, it.producto_id, it.cantidad, p.precio_unidad, subtotal, `${etiqueta}${it.nota ? ' ' + it.nota : ''}`]
            );
        }

        await connection.query(`UPDATE mesas SET estado = 'ocupada' WHERE id = ? AND estado = 'libre'`, [mesa.id]);
        const resumen = items.map((i) => `${i.cantidad}× ${precio.get(i.producto_id).nombre}`).join(', ');
        await connection.query(
            `INSERT INTO mesa_alertas (mesa_id, tipo, mensaje) VALUES (?, 'nuevo_pedido', ?)`,
            [mesa.id, resumen.slice(0, 500)]
        );

        await connection.commit();
        res.status(201).json({ ok: true, pedido_id: pedidoId, total });
    } catch (e) {
        if (connection) await connection.rollback().catch(() => {});
        console.error('Error al recibir pedido desde menú QR:', e);
        res.status(500).json({ error: 'No pudimos enviar tu pedido. Llama al mesero.' });
    } finally {
        if (connection) connection.release();
    }
});

// Llamar al mesero / pedir la cuenta
publico.post('/api/menu/:token/alerta', async (req, res) => {
    try {
        const mesa = await mesaPorToken(req.params.token);
        if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
        const tipo = String(req.body?.tipo || '');
        if (!['llamar_mesero', 'pedir_cuenta'].includes(tipo)) return res.status(400).json({ error: 'Aviso inválido' });
        if (!rateLimit(`alerta:${mesa.id}:${req.ip}`, 6)) return res.status(429).json({ error: 'Ya avisamos al personal, en breve te atienden' });

        // No duplicar un aviso igual que siga sin atender
        const [pend] = await db.query(
            'SELECT id FROM mesa_alertas WHERE mesa_id = ? AND tipo = ? AND atendida = 0 LIMIT 1',
            [mesa.id, tipo]
        );
        if (!pend[0]) {
            const metodo = String(req.body?.metodo || '').slice(0, 30);
            await db.query('INSERT INTO mesa_alertas (mesa_id, tipo, mensaje) VALUES (?, ?, ?)',
                [mesa.id, tipo, metodo ? `Pago con: ${metodo}` : null]);
        }
        res.json({ ok: true });
    } catch (e) {
        console.error('Error al registrar aviso de mesa:', e);
        res.status(500).json({ error: 'No pudimos avisar al personal' });
    }
});

// ===================== STAFF =====================
const staff = express.Router();

staff.get('/api/mesa-alertas', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT a.id, a.tipo, a.mensaje, a.created_at, m.id AS mesa_id, m.numero AS mesa_numero
             FROM mesa_alertas a JOIN mesas m ON m.id = a.mesa_id
             WHERE a.atendida = 0
             ORDER BY a.created_at ASC
             LIMIT 50`
        );
        res.json(rows);
    } catch (e) {
        console.error('Error al listar avisos de mesas:', e);
        res.status(500).json({ error: 'Error al listar avisos' });
    }
});

staff.post('/api/mesa-alertas/:id(\\d+)/atender', async (req, res) => {
    try {
        const quien = req.session?.user?.nombre || req.session?.user?.usuario || null;
        await db.query(
            'UPDATE mesa_alertas SET atendida = 1, atendida_at = NOW(), atendida_por = ? WHERE id = ? AND atendida = 0',
            [quien, req.params.id]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('Error al atender aviso:', e);
        res.status(500).json({ error: 'Error al atender aviso' });
    }
});

// Hoja imprimible con el QR de cada mesa
staff.get('/mesas-qr', async (req, res) => {
    try {
        const [cfgRows] = await db.query('SELECT app_url_publica, nombre_negocio FROM configuracion_impresion ORDER BY id LIMIT 1');
        const cfg = cfgRows[0] || {};
        const base = baseUrl(req, cfg.app_url_publica);
        const [mesas] = await db.query('SELECT id, numero, descripcion, qr_token FROM mesas ORDER BY id');
        const tarjetas = [];
        for (const m of mesas) {
            const url = `${base}/menu/${m.qr_token}`;
            tarjetas.push({ ...m, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 360 }) });
        }
        const host = String(req.get('host') || '');
        res.render('mesas_qr', {
            tarjetas,
            negocio: cfg.nombre_negocio || 'Restaurant Martin',
            base,
            avisoLocal: !cfg.app_url_publica && /^(localhost|127\.0\.0\.1)(:|$)/.test(host)
        });
    } catch (e) {
        console.error('Error al generar QR de mesas:', e);
        res.status(500).render('error', { error: { message: 'No se pudieron generar los QR', stack: '' } });
    }
});

// Regenera el token de una mesa (invalida el QR anterior, p. ej. si alguien se lo llevó)
staff.post('/api/mesas-qr/:id(\\d+)/regenerar', async (req, res) => {
    if (String(req.session?.user?.rol || '') !== 'administrador') return res.status(403).json({ error: 'Solo el administrador' });
    try {
        await db.query(
            `UPDATE mesas SET qr_token = substr(md5(random()::text || clock_timestamp()::text), 1, 24) WHERE id = ?`,
            [req.params.id]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('Error al regenerar QR:', e);
        res.status(500).json({ error: 'Error al regenerar el QR' });
    }
});

module.exports = { publico, staff };
