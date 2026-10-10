// Cumplimiento fiscal DGII: configuración, secuencias, comprobantes (e-CF), notas de crédito y reportes 606/607/608.
// - staff (mesero y administrador): POST /api/fiscal/cotizar (vista previa de ITBIS, propina y total) y GET /api/fiscal/estado
// - admin: todo lo demás (pantalla /fiscal y /api/fiscal/*)
// - publico: GET /f/:token (representación impresa del comprobante, sin datos internos; la usa el aviso de WhatsApp)
// Relacionado con: services/fiscal/*, services/facturacion.js, views/fiscal.ejs, views/factura_publica.ejs, public/js/fiscal.js
const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const facturacion = require('../services/facturacion');
const fiscalConfig = require('../services/fiscal/config');
const calculo = require('../services/fiscal/calculo');
const secuencias = require('../services/fiscal/secuencias');
const emision = require('../services/fiscal/emision');
const notas = require('../services/fiscal/notas');
const reportes = require('../services/fiscal/reportes');
const proveedores = require('../services/fiscal/proveedor');
const { construirECF } = require('../services/fiscal/payload');

const staff = express.Router();
const admin = express.Router();
const publico = express.Router();

const usuario = (req) => (req.session && req.session.user && req.session.user.usuario) || null;
function responder(res, e, msg) {
    if (e && e.publico) return res.status(400).json({ error: e.message });
    console.error(msg, e);
    res.status(500).json({ error: msg });
}
const ah = (fn, msg) => async (req, res) => { try { await fn(req, res); } catch (e) { responder(res, e, msg); } };

// ------------------------------------------------------------------ personal
// Vista previa del cobro. Body: { pedido_id } o { items: [{ producto_id, cantidad, unidad, precio? }], tipo_pedido, cliente_id, credito_fiscal }
staff.post('/cotizar', ah(async (req, res) => {
    const b = req.body || {};
    const opciones = { clienteId: b.cliente_id || null, quiereCreditoFiscal: b.credito_fiscal === true || b.credito_fiscal === 1 || b.credito_fiscal === '1' };
    let r;
    if (b.pedido_id) {
        r = await facturacion.cotizarPedido(db, Number(b.pedido_id), opciones);
    } else {
        const lista = Array.isArray(b.items) ? b.items : [];
        if (!lista.length) return res.status(400).json({ error: 'No hay productos para cotizar' });
        const ids = [...new Set(lista.map((i) => Number(i.producto_id)))];
        const [prods] = await db.query('SELECT id, precio_kg, precio_unidad, precio_libra FROM productos WHERE id IN (?)', [ids]);
        const porId = new Map(prods.map((p) => [Number(p.id), p]));
        const esAdmin = req.session?.user?.rol === 'administrador';
        const items = lista.map((i) => {
            const p = porId.get(Number(i.producto_id));
            if (!p) throw Object.assign(new Error('Un producto ya no existe'), { publico: true });
            const u = String(i.unidad || 'UND').toUpperCase();
            let precio = Number(u === 'KG' ? p.precio_kg : u === 'LB' ? p.precio_libra : p.precio_unidad);
            if (esAdmin && i.precio != null && Number.isFinite(Number(i.precio)) && Number(i.precio) >= 0) precio = Number(i.precio);
            const cantidad = Number(i.cantidad);
            return { producto_id: p.id, cantidad, unidad_medida: u, precio_unitario: precio, subtotal: calculo.round2(precio * cantidad) };
        });
        r = await facturacion.cotizarLineas(db, items, { tipoPedido: b.tipo_pedido || 'rapida', ...opciones });
    }
    res.json({
        fiscal: r.fiscal, modo: r.modo, tipo_comprobante: r.tipo_comprobante, aviso: r.aviso,
        subtotal: calculo.round2(r.base_total), itbis: r.itbis_total, propina: r.propina, propina_tasa: r.propina_tasa, total: r.total
    });
}, 'No se pudo calcular el total'));

staff.get('/estado', ah(async (req, res) => {
    const cfg = await fiscalConfig.obtenerCache();
    res.json({ modo: cfg.modo, activo: cfg.activo, contingencia: cfg.contingencia, propina_activa: cfg.propinaActiva, propina_tasa: cfg.propinaTasa });
}, 'Error'));

// ------------------------------------------------------------------ administrador: pantalla
admin.get('/fiscal', ah(async (req, res) => {
    res.render('fiscal', { tab: String(req.query.tab || 'estado') });
}, 'Error al cargar la pantalla fiscal'));

// Configuración
admin.get('/api/fiscal/config', ah(async (req, res) => {
    const d = await fiscalConfig.diagnostico();
    const c = d.cfg;
    res.json({
        modo: c.modo, proveedor: c.proveedor, contingencia: c.contingencia, contingenciaDesde: c.contingenciaDesde,
        preciosIncluyenItbis: c.preciosIncluyenItbis, propinaActiva: c.propinaActiva, propinaTasa: c.propinaTasa,
        propinaEnDelivery: c.propinaEnDelivery, propinaEnLlevar: c.propinaEnLlevar, propinaEnRapida: c.propinaEnRapida,
        emisor: c.emisor, mseller: { email: c.mseller.email, ambiente: c.mseller.ambiente, tienePassword: c.mseller.tienePassword, tieneApiKey: c.mseller.tieneApiKey },
        checklist: d.items, listo: d.listo
    });
}, 'No se pudo leer la configuración'));

admin.post('/api/fiscal/config', ah(async (req, res) => {
    await fiscalConfig.guardar(req.body || {}, usuario(req));
    res.json({ ok: true });
}, 'No se pudo guardar la configuración'));

admin.post('/api/fiscal/probar', ah(async (req, res) => {
    const cfg = await fiscalConfig.obtener(db, { secretos: true });
    try { res.json(await proveedores.obtener(cfg).probar(cfg)); } catch (e) { res.status(400).json({ error: e.message }); }
}, 'No se pudo probar la conexión'));

// Envía un comprobante de ejemplo a TesteCF con ?validate=true: comprueba el formato SIN gastar una secuencia
admin.post('/api/fiscal/validar-prueba', ah(async (req, res) => {
    const cfg = await fiscalConfig.obtener(db, { secretos: true });
    if (cfg.proveedor !== 'mseller') return res.status(400).json({ error: 'Esta prueba es para MSeller (el proveedor simulado no valida nada real).' });
    if (!calculo.validarRNC(cfg.emisor.rnc)) return res.status(400).json({ error: 'Primero guarda el RNC del restaurante.' });
    const calc = calculo.calcularFactura([{ precio_unitario: 1000, cantidad: 1, itbis_tasa: '18' }], { cfg: { ...fiscalConfig.paraCalculo(cfg), activo: true }, tipoPedido: 'mesa' });
    const factura = {
        tipo_comprobante: 'E32', ncf: 'E320000000001', fecha: new Date(), subtotal_gravado_18: calc.subtotal_gravado_18, subtotal_gravado_16: 0, subtotal_gravado_0: 0,
        subtotal_exento: 0, itbis_total: calc.itbis_total, propina: calc.propina, total: calc.total
    };
    const payload = construirECF(factura, [{ nombre: 'Producto de prueba', cantidad: 1, base: 1000, itbis_tasa: '18', subtotal: 1000 }], cfg, {});
    const prov = proveedores.mseller;
    try {
        const r = await prov.enviar({ ...cfg, modo: 'ecf_pruebas', mseller: { ...cfg.mseller, ambiente: 'TesteCF' } }, payload, { validar: true });
        res.json({ estado: r.estado, error: r.error || null, respuesta: r.respuesta });
    } catch (e) { res.status(400).json({ error: e.message }); }
}, 'No se pudo validar el comprobante de prueba'));

admin.post('/api/fiscal/contingencia', ah(async (req, res) => {
    await fiscalConfig.contingencia(req.body && (req.body.activa === true || req.body.activa === 1 || req.body.activa === '1'), usuario(req));
    res.json({ ok: true });
}, 'No se pudo cambiar la contingencia'));

// Secuencias
admin.get('/api/fiscal/secuencias', ah(async (req, res) => { res.json({ secuencias: await secuencias.listar() }); }, 'No se pudieron leer las secuencias'));
admin.post('/api/fiscal/secuencias', ah(async (req, res) => { res.status(201).json(await secuencias.crear(req.body || {}, usuario(req))); }, 'No se pudo guardar la secuencia'));
admin.post('/api/fiscal/secuencias/practica', ah(async (req, res) => {
    const cfg = await fiscalConfig.obtener();
    if (cfg.modo === 'ecf_produccion') return res.status(400).json({ error: 'En producción no se usan secuencias de práctica.' });
    res.json(await secuencias.cargarPractica(usuario(req)));
}, 'No se pudieron cargar las secuencias de práctica'));
admin.post('/api/fiscal/secuencias/:id(\\d+)/desactivar', ah(async (req, res) => { await secuencias.desactivar(Number(req.params.id), usuario(req)); res.json({ ok: true }); }, 'No se pudo desactivar'));
admin.post('/api/fiscal/secuencias/anular-no-usadas', ah(async (req, res) => {
    const d = Number(req.body && req.body.desde), h = Number(req.body && req.body.hasta);
    if (!Number.isInteger(d) || !Number.isInteger(h) || d < 1 || h < d) return res.status(400).json({ error: 'Rango inválido' });
    const cfg = await fiscalConfig.obtener(db, { secretos: true });
    const r = await proveedores.obtener(cfg).anularSecuencias(cfg, [{ desde: d, hasta: h }]);
    await db.query(`INSERT INTO fiscal_eventos (evento, detalle, usuario) VALUES ('secuencias_anuladas', ?, ?)`, [`${d}-${h}`, usuario(req)]);
    res.json(r);
}, 'No se pudieron anular las secuencias'));

// Comprobantes
admin.get('/api/fiscal/comprobantes', ah(async (req, res) => {
    const estado = String(req.query.estado || '');
    const where = ['f.ncf IS NOT NULL'];
    const params = [];
    if (estado === 'problemas') where.push(`(f.fiscal_estado IN ('rechazado','pendiente','contingencia') OR (f.fiscal_estado = 'enviado' AND f.fiscal_ultimo_intento < NOW() - interval '10 minutes'))`);
    else if (estado) { where.push('f.fiscal_estado = ?'); params.push(estado); }
    if (req.query.q) { where.push('(f.ncf ILIKE ? OR c.nombre ILIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    const [rows] = await db.query(
        `SELECT f.id, f.fecha, f.ncf, f.tipo_comprobante, f.total, f.fiscal_estado, f.fiscal_error, f.fiscal_intentos, f.ncf_modificado, f.factura_origen_id, c.nombre AS cliente
         FROM facturas f LEFT JOIN clientes c ON c.id = f.cliente_id WHERE ${where.join(' AND ')} ORDER BY f.id DESC LIMIT 200`, params
    );
    const [[res_]] = await db.query(
        `SELECT COUNT(*) FILTER (WHERE fiscal_estado = 'pendiente') AS pendientes, COUNT(*) FILTER (WHERE fiscal_estado = 'enviado') AS enviados,
                COUNT(*) FILTER (WHERE fiscal_estado = 'rechazado') AS rechazados, COUNT(*) FILTER (WHERE fiscal_estado = 'contingencia') AS contingencia,
                COUNT(*) FILTER (WHERE fiscal_estado IN ('aceptado','aceptado_condicional')) AS aceptados FROM facturas WHERE ncf IS NOT NULL`
    );
    res.json({ comprobantes: rows.map((r) => ({ ...r, total: Number(r.total) })), resumen: Object.fromEntries(Object.entries(res_).map(([k, v]) => [k, Number(v)])) });
}, 'No se pudieron leer los comprobantes'));

admin.get('/api/fiscal/comprobantes/:id(\\d+)', ah(async (req, res) => {
    const [fs] = await db.query('SELECT f.*, c.nombre AS cliente FROM facturas f LEFT JOIN clientes c ON c.id = f.cliente_id WHERE f.id = ?', [req.params.id]);
    if (!fs[0]) return res.status(404).json({ error: 'Factura no encontrada' });
    const [lineas] = await db.query(
        `SELECT d.id, d.cantidad, d.precio_unitario, d.subtotal, d.itbis_tasa, d.base, d.itbis, p.nombre,
                COALESCE((SELECT SUM(-n.cantidad) FROM detalle_factura n WHERE n.detalle_origen_id = d.id), 0) AS devuelta
         FROM detalle_factura d JOIN productos p ON p.id = d.producto_id WHERE d.factura_id = ? ORDER BY d.id`, [req.params.id]
    );
    const [eventos] = await db.query('SELECT id, evento, detalle, created_at FROM fiscal_eventos WHERE factura_id = ? ORDER BY id DESC LIMIT 50', [req.params.id]);
    res.json({ factura: fs[0], lineas: lineas.map((l) => ({ ...l, cantidad: Number(l.cantidad), devuelta: Number(l.devuelta), restan: calculo.round2(Number(l.cantidad) - Number(l.devuelta)) })), eventos });
}, 'No se pudo leer la factura'));

admin.get('/api/fiscal/comprobantes/:id(\\d+)/envio', ah(async (req, res) => {
    const [rows] = await db.query(`SELECT evento, detalle, solicitud, respuesta, created_at FROM fiscal_eventos WHERE factura_id = ? AND solicitud IS NOT NULL ORDER BY id DESC LIMIT 1`, [req.params.id]);
    res.json(rows[0] || {});
}, 'No se pudo leer el envío'));

admin.post('/api/fiscal/comprobantes/:id(\\d+)/reintentar', ah(async (req, res) => { res.json(await emision.reintentar(Number(req.params.id), usuario(req))); }, 'No se pudo reintentar'));

// Notas de crédito: anular toda la factura o devolver platos
admin.post('/api/fiscal/notas-credito', ah(async (req, res) => {
    const b = req.body || {};
    const r = await notas.emitir({ facturaId: Number(b.factura_id), items: b.items, motivo: b.motivo, devolverInventario: !!b.devolver_inventario, usuario: usuario(req) });
    emision.programar(r.notaId);
    res.status(201).json(r);
}, 'No se pudo emitir la nota de crédito'));

// Reportes DGII
admin.get('/api/fiscal/reportes/propina', ah(async (req, res) => {
    const hoy = new Date().toISOString().slice(0, 10);
    res.json(await reportes.propinaLegal(String(req.query.desde || hoy.slice(0, 8) + '01'), String(req.query.hasta || hoy)));
}, 'No se pudo calcular la propina'));
admin.get('/api/fiscal/reportes/it1', ah(async (req, res) => { res.json(await reportes.resumenMensual(req.query.mes)); }, 'No se pudo calcular el resumen'));
admin.get('/api/fiscal/reportes/:tipo(606|607|608)', ah(async (req, res) => {
    const t = req.params.tipo;
    const r = t === '606' ? await reportes.reporte606(req.query.mes) : t === '607' ? await reportes.reporte607(req.query.mes, { soloSerieB: req.query.serie === 'B' }) : await reportes.reporte608(req.query.mes);
    const formato = String(req.query.formato || 'json');
    if (formato === 'txt') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="DGII_F_${t}_${r.mes.replace('-', '')}.TXT"`);
        return res.send(r.txt);
    }
    if (formato === 'xlsx') {
        const buf = await reportes.aExcel(`Formato ${t} ${r.mes}`, r.columnas, r.filas);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="formato-${t}-${r.mes}.xlsx"`);
        return res.send(Buffer.from(buf));
    }
    res.json({ mes: r.mes, columnas: r.columnas, filas: r.filas, total: r.total });
}, 'No se pudo generar el reporte'));
admin.post('/api/fiscal/anular-ncf', ah(async (req, res) => { await reportes.anularNCF(req.body || {}, usuario(req)); res.json({ ok: true }); }, 'No se pudo registrar la anulación'));
admin.get('/api/fiscal/motivos-608', (req, res) => res.json(reportes.MOTIVOS_608));

// ------------------------------------------------------------------ público: representación impresa por enlace
publico.get('/f/:token([0-9a-f]{32})', async (req, res) => {
    try {
        const [fs] = await db.query('SELECT * FROM facturas WHERE token_publico = ?', [req.params.token]);
        if (!fs[0]) return res.status(404).render('404');
        const f = fs[0];
        const [detalles] = await db.query(`SELECT d.*, p.nombre AS producto_nombre FROM detalle_factura d JOIN productos p ON p.id = d.producto_id WHERE d.factura_id = ? ORDER BY d.id`, [f.id]);
        const [pagos] = await db.query('SELECT metodo, monto FROM factura_pagos WHERE factura_id = ? ORDER BY id', [f.id]);
        const [cl] = await db.query('SELECT nombre FROM clientes WHERE id = ?', [f.cliente_id]);
        const [cfgRows] = await db.query('SELECT * FROM configuracion_impresion ORDER BY id LIMIT 1');
        const qr = f.qr_url ? await QRCode.toDataURL(f.qr_url, { margin: 1, width: 180 }) : null;
        res.render('factura_publica', { factura: { ...f, cliente_nombre: (cl[0] || {}).nombre }, detalles, pagos, cliente: cl[0] || {}, config: cfgRows[0] || {}, qr });
    } catch (e) {
        console.error('Error al mostrar el comprobante público:', e);
        res.status(500).render('error', { error: { message: 'No se pudo mostrar el comprobante', stack: '' } });
    }
});

module.exports = { staff, admin, publico };
