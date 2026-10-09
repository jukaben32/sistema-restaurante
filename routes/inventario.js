// Inventario (solo administrador): insumos, recetas (costeo de platos) y movimientos.
// El descuento automático por venta está en services/inventario.js (se llama al facturar).
// Relacionado con: views/inventario.ejs, public/js/inventario.js, database.sql (insumos, recetas, inventario_movimientos)
const express = require('express');
const db = require('../db');
const inventario = require('../services/inventario');
const unidades = require('../services/unidades');

const router = express.Router();

function fail(res, e, msg) {
    if (e && e.publico) return res.status(400).json({ error: e.message });
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un insumo con ese nombre' });
    console.error(msg, e);
    return res.status(500).json({ error: msg });
}

function leerInsumo(b) {
    const i = {
        nombre: String(b.nombre || '').trim().slice(0, 100),
        unidad: unidades.normalizar(String(b.unidad || 'und').trim().slice(0, 20) || 'und'),
        stock_minimo: Number(b.stock_minimo || 0),
        costo_unitario: Number(b.costo_unitario || 0)
    };
    if (!i.nombre) return { error: 'El nombre es obligatorio' };
    if (!Number.isFinite(i.stock_minimo) || i.stock_minimo < 0) return { error: 'Stock mínimo inválido' };
    if (!Number.isFinite(i.costo_unitario) || i.costo_unitario < 0) return { error: 'Costo inválido' };
    return { i };
}

router.get('/inventario', (req, res) => res.render('inventario'));

router.get('/api/inventario/insumos', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT i.*, (i.stock <= i.stock_minimo) AS bajo,
                    (SELECT COUNT(*) FROM recetas r WHERE r.insumo_id = i.id) AS en_recetas,
                    COALESCE((SELECT -SUM(m.cantidad) FROM inventario_movimientos m
                              WHERE m.insumo_id = i.id AND m.tipo = 'venta'
                                AND m.created_at >= NOW() - interval '7 days'), 0) AS consumo_7d
             FROM insumos i
             WHERE i.activo = 1
             ORDER BY (i.stock <= i.stock_minimo) DESC, i.nombre`
        );
        res.json(rows);
    } catch (e) { fail(res, e, 'Error al listar insumos'); }
});

router.post('/api/inventario/insumos', async (req, res) => {
    const { i, error } = leerInsumo(req.body || {});
    if (error) return res.status(400).json({ error });
    const stockInicial = Number(req.body?.stock || 0);
    if (!Number.isFinite(stockInicial) || stockInicial < 0) return res.status(400).json({ error: 'Stock inicial inválido' });
    let c;
    try {
        c = await db.getConnection();
        await c.beginTransaction();
        const [ins] = await c.query(
            `INSERT INTO insumos (nombre, unidad, stock, stock_minimo, costo_unitario) VALUES (?, ?, 0, ?, ?)`,
            [i.nombre, i.unidad, i.stock_minimo, i.costo_unitario]
        );
        if (stockInicial > 0) {
            await inventario.registrarMovimiento(c, {
                insumoId: ins.insertId, tipo: 'entrada', cantidad: stockInicial, nota: 'Stock inicial', usuario: req.session?.user?.usuario
            });
        }
        await c.commit();
        res.status(201).json({ id: ins.insertId });
    } catch (e) {
        if (c) await c.rollback().catch(() => {});
        fail(res, e, 'Error al crear insumo');
    } finally { if (c) c.release(); }
});

router.put('/api/inventario/insumos/:id(\\d+)', async (req, res) => {
    const { i, error } = leerInsumo(req.body || {});
    if (error) return res.status(400).json({ error });
    let c;
    try {
        c = await db.getConnection();
        await c.beginTransaction();
        const [ant] = await c.query('SELECT unidad FROM insumos WHERE id = ? AND activo = 1 FOR UPDATE', [req.params.id]);
        if (!ant[0]) { await c.rollback(); return res.status(404).json({ error: 'Insumo no encontrado' }); }
        let convertido = false;
        if (unidades.normalizar(ant[0].unidad) !== i.unidad) {
            if (unidades.multiplicador(ant[0].unidad, i.unidad) !== null) {
                // kg <-> lb, etc.: el mínimo y el costo del formulario vienen en la unidad anterior; se guardan
                // y luego se convierten junto con el stock, las recetas y el historial.
                await c.query('UPDATE insumos SET nombre = ?, stock_minimo = ?, costo_unitario = ? WHERE id = ?', [i.nombre, i.stock_minimo, i.costo_unitario, req.params.id]);
                await inventario.cambiarUnidad(c, Number(req.params.id), i.unidad);
                convertido = true;
            } else {
                await c.query('UPDATE insumos SET nombre = ?, unidad = ?, stock_minimo = ?, costo_unitario = ? WHERE id = ?', [i.nombre, i.unidad, i.stock_minimo, i.costo_unitario, req.params.id]);
            }
        } else {
            await c.query('UPDATE insumos SET nombre = ?, stock_minimo = ?, costo_unitario = ? WHERE id = ?', [i.nombre, i.stock_minimo, i.costo_unitario, req.params.id]);
        }
        await c.commit();
        res.json({ ok: true, convertido });
    } catch (e) {
        if (c) await c.rollback().catch(() => {});
        fail(res, e, 'Error al editar insumo');
    } finally { if (c) c.release(); }
});

// Se desactiva (no se borra) para conservar el historial de movimientos
router.delete('/api/inventario/insumos/:id(\\d+)', async (req, res) => {
    try {
        await db.query('DELETE FROM recetas WHERE insumo_id = ?', [req.params.id]);
        await db.query(`UPDATE insumos SET activo = 0, nombre = nombre || ' (eliminado ' || id || ')' WHERE id = ? AND activo = 1`, [req.params.id]);
        res.json({ ok: true });
    } catch (e) { fail(res, e, 'Error al eliminar insumo'); }
});

// Cambio rápido de unidad (kg <-> lb): convierte stock, mínimo, costo, recetas e historial
router.post('/api/inventario/insumos/:id(\\d+)/convertir', async (req, res) => {
    let c;
    try {
        c = await db.getConnection();
        await c.beginTransaction();
        const r = await inventario.cambiarUnidad(c, Number(req.params.id), req.body?.unidad);
        await c.commit();
        res.json(r);
    } catch (e) {
        if (c) await c.rollback().catch(() => {});
        fail(res, e, 'Error al cambiar la unidad');
    } finally { if (c) c.release(); }
});

router.post('/api/inventario/insumos/:id(\\d+)/movimiento', async (req, res) => {
    let c;
    try {
        c = await db.getConnection();
        await c.beginTransaction();
        const r = await inventario.registrarMovimiento(c, {
            insumoId: Number(req.params.id),
            tipo: String(req.body?.tipo || ''),
            cantidad: req.body?.cantidad,
            unidad: req.body?.unidad,
            nota: String(req.body?.nota || '').trim().slice(0, 300) || null,
            usuario: req.session?.user?.usuario || null
        });
        await c.commit();
        res.json(r);
    } catch (e) {
        if (c) await c.rollback().catch(() => {});
        fail(res, e, 'Error al registrar movimiento');
    } finally { if (c) c.release(); }
});

router.get('/api/inventario/movimientos', async (req, res) => {
    try {
        const insumoId = Number(req.query.insumo_id);
        const filtrar = Number.isInteger(insumoId) && insumoId > 0;
        const [rows] = await db.query(
            `SELECT m.*, i.nombre AS insumo, i.unidad
             FROM inventario_movimientos m JOIN insumos i ON i.id = m.insumo_id
             ${filtrar ? 'WHERE m.insumo_id = ?' : ''}
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT 150`,
            filtrar ? [insumoId] : []
        );
        res.json(rows);
    } catch (e) { fail(res, e, 'Error al listar movimientos'); }
});

// Productos con el costo de su receta y el margen sobre el precio por unidad
router.get('/api/inventario/costeo', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT p.id, p.codigo, p.nombre, p.categoria, p.precio_unidad,
                    COUNT(r.insumo_id) AS insumos,
                    COALESCE(SUM(r.cantidad * i.costo_unitario), 0) AS costo
             FROM productos p
             LEFT JOIN recetas r ON r.producto_id = p.id
             LEFT JOIN insumos i ON i.id = r.insumo_id
             GROUP BY p.id
             ORDER BY p.nombre`
        );
        res.json(rows.map((r) => {
            const precio = Number(r.precio_unidad || 0);
            const costo = Number(r.costo || 0);
            return { ...r, margen: precio > 0 && Number(r.insumos) > 0 ? (precio - costo) / precio : null };
        }));
    } catch (e) { fail(res, e, 'Error al calcular costeo'); }
});

router.get('/api/inventario/recetas/:productoId(\\d+)', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT r.insumo_id, r.cantidad, i.nombre, i.unidad, i.costo_unitario
             FROM recetas r JOIN insumos i ON i.id = r.insumo_id
             WHERE r.producto_id = ? ORDER BY i.nombre`,
            [req.params.productoId]
        );
        res.json(rows);
    } catch (e) { fail(res, e, 'Error al cargar receta'); }
});

// Reemplaza la receta completa del producto
router.put('/api/inventario/recetas/:productoId(\\d+)', async (req, res) => {
    const items = (Array.isArray(req.body?.items) ? req.body.items : [])
        .map((x) => ({ insumo_id: Number(x.insumo_id), cantidad: Number(x.cantidad), unidad: x.unidad }))
        .filter((x) => Number.isInteger(x.insumo_id) && x.insumo_id > 0 && Number.isFinite(x.cantidad) && x.cantidad > 0);
    const unicos = new Map(items.map((x) => [x.insumo_id, x]));
    let c;
    try {
        c = await db.getConnection();
        await c.beginTransaction();
        // Cada línea puede escribirse en otra unidad compatible (ej. 2 lb de un insumo en kg): se guarda en la unidad del insumo
        if (unicos.size) {
            const [uni] = await c.query('SELECT id, unidad FROM insumos WHERE id IN (?)', [[...unicos.keys()]]);
            for (const x of unicos.values()) {
                const ins = uni.find((u) => u.id === x.insumo_id);
                if (ins) x.cantidad = Math.max(inventario.convertirCantidad(x.cantidad, x.unidad, ins.unidad), 0.00001);
            }
        }
        await c.query('DELETE FROM recetas WHERE producto_id = ?', [req.params.productoId]);
        if (unicos.size) {
            await c.query(
                'INSERT INTO recetas (producto_id, insumo_id, cantidad) VALUES ?',
                [[...unicos.values()].map((x) => [Number(req.params.productoId), x.insumo_id, x.cantidad])]
            );
        }
        await c.commit();
        res.json({ ok: true, insumos: unicos.size });
    } catch (e) {
        if (c) await c.rollback().catch(() => {});
        if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Producto o insumo inexistente' });
        fail(res, e, 'Error al guardar receta');
    } finally { if (c) c.release(); }
});

module.exports = router;
