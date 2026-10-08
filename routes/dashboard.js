// Dashboard en vivo (administrador): ventas de hoy vs. ayer, últimos 7 días, top de platos,
// estado de mesas y cocina, reservas del día, stock bajo y cobros en línea.
// Relacionado con: views/dashboard.ejs, public/js/dashboard.js
const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/dashboard', (req, res) => res.render('dashboard'));

router.get('/api/dashboard', async (req, res) => {
    try {
        const q = async (sql, params = []) => (await db.query(sql, params))[0];
        const [
            hoyAyer, semana, top, metodos, mesas, cocina, reservas, stock, alertas, stripe, delivery
        ] = await Promise.all([
            q(`SELECT
                 COALESCE(SUM(total) FILTER (WHERE fecha::date = CURRENT_DATE), 0)      AS ventas_hoy,
                 COUNT(*)            FILTER (WHERE fecha::date = CURRENT_DATE)          AS facturas_hoy,
                 COALESCE(SUM(total) FILTER (WHERE fecha::date = CURRENT_DATE - 1
                                               AND fecha::time <= LOCALTIME), 0)       AS ventas_ayer_a_esta_hora,
                 COALESCE(SUM(total) FILTER (WHERE fecha::date = CURRENT_DATE - 1), 0)  AS ventas_ayer,
                 COUNT(*)            FILTER (WHERE fecha::date = CURRENT_DATE - 1)      AS facturas_ayer
               FROM facturas WHERE fecha >= CURRENT_DATE - 1`),
            q(`SELECT to_char(d::date, 'YYYY-MM-DD') AS fecha, COALESCE(SUM(f.total), 0) AS total, COUNT(f.id) AS facturas
               FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day') d
               LEFT JOIN facturas f ON f.fecha::date = d::date
               GROUP BY d ORDER BY d`),
            q(`SELECT p.nombre, SUM(df.cantidad) AS cantidad, SUM(df.subtotal) AS ingresos
               FROM detalle_factura df
               JOIN facturas f ON f.id = df.factura_id
               JOIN productos p ON p.id = df.producto_id
               WHERE f.fecha::date >= CURRENT_DATE - 6 AND p.codigo <> 'ENVIO'
               GROUP BY p.id, p.nombre ORDER BY ingresos DESC LIMIT 6`),
            q(`SELECT fp.metodo, SUM(fp.monto) AS total
               FROM factura_pagos fp JOIN facturas f ON f.id = fp.factura_id
               WHERE f.fecha::date = CURRENT_DATE
               GROUP BY fp.metodo ORDER BY total DESC`),
            q(`SELECT estado, COUNT(*) AS n FROM mesas GROUP BY estado`),
            q(`SELECT estado, COUNT(*) AS n FROM pedido_items
               WHERE estado IN ('pendiente','enviado','preparando','listo') GROUP BY estado`),
            q(`SELECT r.id, r.nombre, r.personas, r.estado, to_char(r.fecha_hora, 'HH24:MI') AS hora, m.numero AS mesa_numero
               FROM reservas r LEFT JOIN mesas m ON m.id = r.mesa_id
               WHERE r.fecha_hora::date = CURRENT_DATE AND r.estado IN ('pendiente','confirmada','sentada')
               ORDER BY r.fecha_hora LIMIT 8`),
            q(`SELECT id, nombre, unidad, stock, stock_minimo FROM insumos
               WHERE activo = 1 AND stock <= stock_minimo ORDER BY (stock - stock_minimo) ASC LIMIT 8`),
            q(`SELECT COUNT(*) AS n FROM mesa_alertas WHERE atendida = 0`),
            q(`SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS n FROM stripe_pagos
               WHERE estado IN ('pagado','usado') AND created_at::date = CURRENT_DATE`),
            q(`SELECT COALESCE(estado_delivery, 'otro') AS estado, COUNT(*) AS n FROM pedidos
               WHERE tipo <> 'mesa' AND (estado_delivery IN ('por_confirmar','en_cocina','en_camino')
                     OR (estado_delivery = 'entregado' AND entregado_at::date = CURRENT_DATE))
               GROUP BY 1`)
        ]);

        const h = hoyAyer[0];
        const contar = (rows) => Object.fromEntries(rows.map((r) => [r.estado, Number(r.n)]));
        res.json({
            generado: new Date().toISOString(),
            hoy: {
                ventas: Number(h.ventas_hoy),
                facturas: Number(h.facturas_hoy),
                ticket: Number(h.facturas_hoy) ? Number(h.ventas_hoy) / Number(h.facturas_hoy) : 0
            },
            ayer: {
                ventas: Number(h.ventas_ayer),
                ventas_a_esta_hora: Number(h.ventas_ayer_a_esta_hora),
                facturas: Number(h.facturas_ayer),
                ticket: Number(h.facturas_ayer) ? Number(h.ventas_ayer) / Number(h.facturas_ayer) : 0
            },
            semana: semana.map((d) => ({ fecha: d.fecha, total: Number(d.total), facturas: Number(d.facturas) })),
            top: top.map((t) => ({ nombre: t.nombre, cantidad: Number(t.cantidad), ingresos: Number(t.ingresos) })),
            metodos: metodos.map((m) => ({ metodo: m.metodo, total: Number(m.total) })),
            mesas: contar(mesas),
            cocina: contar(cocina),
            reservas,
            stock_bajo: stock,
            alertas_pendientes: Number(alertas[0].n),
            stripe_hoy: { total: Number(stripe[0].total), cobros: Number(stripe[0].n) },
            delivery: contar(delivery)
        });
    } catch (e) {
        console.error('Error en dashboard:', e);
        res.status(500).json({ error: 'Error al cargar el dashboard' });
    }
});

module.exports = router;
