// App para clientes (/pedir): catálogo, pedido de delivery o para llevar, pago en línea y seguimiento.
// Los pedidos entran por el mismo servicio que usan el POS y los asistentes (services/delivery.js), con origen "app":
// los precios salen SIEMPRE de la base de datos y el personal confirma antes de pasar a cocina.
// El cliente no necesita cuenta: se identifica con nombre y teléfono y sigue su pedido con un código secreto (token).
// Relacionado con: routes/pedir.js, views/pedir.ejs, public/js/pedir.js, services/delivery.js, services/stripe.js, services/cripto.js
const crypto = require('crypto');
const db = require('../db');
const delivery = require('./delivery');
const stripeService = require('./stripe');
const criptoService = require('./cripto');
const { normalizar } = require('./telefono');
const { ErrorPublico } = require('./errores');

const TOKEN_RE = /^[a-f0-9]{20,40}$/;
const MINUTOS_PARA_PAGAR = 60;

// ---------------------------------------------------------------------------------------------- límites
const ipHits = new Map();
function limitePorIp(ip, max, ventanaMs) {
    const ahora = Date.now();
    const lista = (ipHits.get(ip) || []).filter((t) => ahora - t < ventanaMs);
    if (lista.length >= max) return false;
    lista.push(ahora);
    ipHits.set(ip, lista);
    if (ipHits.size > 5000) ipHits.clear();
    return true;
}

// ---------------------------------------------------------------------------------------------- datos del negocio
async function configApp() {
    const [rows] = await db.query(
        `SELECT nombre_negocio, direccion, telefono, moneda, app_pedidos_activa, delivery_activo, pedido_minimo_delivery,
                tiempo_preparacion_min, datos_transferencia, (logo_data IS NOT NULL) AS tiene_logo
         FROM configuracion_impresion ORDER BY id LIMIT 1`
    );
    const c = rows[0] || {};
    return {
        nombre: c.nombre_negocio || 'Restaurant Martin',
        direccion: c.direccion || '',
        telefono: c.telefono || '',
        moneda: String(c.moneda || 'dop').toUpperCase(),
        activa: Number(c.app_pedidos_activa ?? 1) === 1,
        deliveryActivo: Number(c.delivery_activo ?? 1) === 1,
        pedidoMinimo: Number(c.pedido_minimo_delivery || 0),
        tiempoPreparacion: Number(c.tiempo_preparacion_min || 25),
        tieneTransferencia: !!String(c.datos_transferencia || '').trim(),
        tieneLogo: !!c.tiene_logo
    };
}

async function formasDePago(cfg) {
    const formas = [{ id: 'efectivo', nombre: 'Efectivo', detalle: 'Pagas al recibir o al recoger tu pedido' }];
    if (cfg.tieneTransferencia) formas.push({ id: 'transferencia', nombre: 'Transferencia bancaria', detalle: 'Te mostramos los datos al enviar el pedido' });
    try {
        if ((await stripeService.getStripeConfig()).habilitado) formas.push({ id: 'tarjeta', nombre: 'Tarjeta, Apple Pay o Google Pay', detalle: 'Pagas ahora de forma segura' });
    } catch (_) { /* sin Stripe */ }
    try {
        if ((await criptoService.getCriptoConfig()).habilitado) formas.push({ id: 'cripto', nombre: 'Criptomonedas (Bitcoin / Lightning)', detalle: 'Pagas ahora con tu billetera' });
    } catch (_) { /* sin cripto */ }
    return formas;
}

async function estadoHorario() {
    const [horarios] = await db.query(`SELECT dia, to_char(abre, 'HH24:MI') AS abre, to_char(cierra, 'HH24:MI') AS cierra, cerrado, delivery FROM horarios ORDER BY dia`);
    const ejecutor = require('./agente/ejecutor'); // carga perezosa: evita dependencias circulares al arrancar
    const ab = ejecutor.abiertoAhora(horarios);
    const hoy = ejecutor.ahoraLocal();
    const h = horarios.find((x) => Number(x.dia) === hoy.dia);
    return {
        abierto: ab, // null = horario sin configurar (no se bloquea nada)
        hoy: h && !Number(h.cerrado) && h.abre && h.cierra ? `${h.abre} – ${h.cierra}` : (h && Number(h.cerrado) ? 'Cerrado hoy' : null)
    };
}

let ultimaLimpieza = 0;

/** Lo que necesita la app para mostrar el menú. */
async function catalogo() {
    const cfg = await configApp();
    // Limpieza ligera de pedidos sin pagar (como mucho cada 5 minutos por instancia)
    if (Date.now() - ultimaLimpieza > 5 * 60 * 1000) { ultimaLimpieza = Date.now(); limpiarSinPago().catch(() => {}); }
    const [productos] = await db.query(
        `SELECT p.id, p.nombre, p.descripcion, p.categoria, p.precio_unidad, p.disponible, p.plato_del_dia,
                (pi.producto_id IS NOT NULL) AS tiene_imagen
         FROM productos p LEFT JOIN producto_imagenes pi ON pi.producto_id = p.id
         WHERE p.en_menu = 1 AND p.precio_unidad > 0 AND p.codigo <> 'ENVIO'
         ORDER BY COALESCE(p.categoria, 'zzz'), p.nombre`
    );
    const zonas = cfg.deliveryActivo ? await delivery.listarZonas(db, true) : [];
    const horario = await estadoHorario();
    return {
        negocio: { nombre: cfg.nombre, direccion: cfg.direccion, telefono: cfg.telefono, moneda: cfg.moneda, tieneLogo: cfg.tieneLogo },
        activa: cfg.activa,
        abierto: horario.abierto,
        horarioHoy: horario.hoy,
        delivery: { activo: cfg.deliveryActivo, pedidoMinimo: cfg.pedidoMinimo, minutosPreparacion: cfg.tiempoPreparacion, zonas },
        formasPago: await formasDePago(cfg),
        productos: productos.map((p) => ({
            id: Number(p.id), nombre: p.nombre, descripcion: p.descripcion || '', categoria: p.categoria || 'Otros',
            precio: Number(p.precio_unidad), disponible: Number(p.disponible) === 1, platoDelDia: Number(p.plato_del_dia) === 1,
            imagen: !!p.tiene_imagen
        }))
    };
}

// ---------------------------------------------------------------------------------------------- crear pedido
function baseUrl(req, cfgUrl) {
    return String(process.env.APP_URL || cfgUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

/**
 * Cotización pública del carrito (subtotal, envío, ITBIS, propina legal y total) con los precios de la base de datos.
 * Relacionado con: public/js/pedir.js (resumen del carrito), services/delivery.js (cotizar)
 */
async function cotizarCarrito(body, req) {
    if (!limitePorIp(`cot:${req.ip || 'x'}`, 240, 10 * 60 * 1000)) throw Object.assign(new ErrorPublico('Demasiadas consultas seguidas. Espera un momento.'), { status: 429 });
    const tipo = body && body.tipo === 'para_llevar' ? 'para_llevar' : 'delivery';
    const cot = await delivery.cotizar(db, { items: body && body.items, zonaId: body && body.zona_id, tipo, soloMenu: true });
    return { subtotal: cot.subtotal, envio: cot.envio, itbis: cot.itbis, propina: cot.propina, propina_tasa: cot.fiscal.propina_tasa, total: cot.total, fiscal: cot.fiscal.fiscal };
}

async function crearPedido(body, req) {
    const cfg = await configApp();
    if (!cfg.activa) throw new ErrorPublico('Por ahora no estamos recibiendo pedidos por la app. Llámanos o escríbenos por WhatsApp.');
    const horario = await estadoHorario();
    if (horario.abierto === false) throw new ErrorPublico('Ahora mismo estamos cerrados. Vuelve a intentarlo cuando abramos.');

    const tipo = body.tipo === 'para_llevar' ? 'para_llevar' : 'delivery';
    if (tipo === 'delivery' && !cfg.deliveryActivo) throw new ErrorPublico('El delivery no está disponible ahora. Puedes pedir para recoger.');
    const nombre = String(body.nombre || '').trim().slice(0, 60);
    if (nombre.length < 2) throw new ErrorPublico('Escribe tu nombre');
    const telefono = normalizar(body.telefono);
    if (!telefono || String(telefono).replace(/\D/g, '').length < 10) throw new ErrorPublico('Escribe un teléfono válido (con código de área, ej. 809 555 0100)');

    const formas = await formasDePago(cfg);
    const metodoCliente = String(body.metodoPago || '');
    if (!formas.some((f) => f.id === metodoCliente)) throw new ErrorPublico('Esa forma de pago no está disponible');
    const metodo = metodoCliente === 'tarjeta' ? 'stripe' : metodoCliente;

    // Antiabuso con la base de datos (funciona aunque haya varias instancias): por teléfono y en total
    const [[porTel]] = await db.query(
        `SELECT COUNT(*) AS n FROM pedidos WHERE origen = 'app' AND cliente_telefono = ? AND created_at >= NOW() - interval '10 minutes'`, [telefono]
    );
    if (Number(porTel.n) >= 3) throw Object.assign(new ErrorPublico('Ya enviaste varios pedidos. Espera unos minutos o llámanos.'), { status: 429 });
    const [[pend]] = await db.query(`SELECT COUNT(*) AS n FROM pedidos WHERE origen = 'app' AND estado_delivery = 'por_confirmar'`);
    if (Number(pend.n) >= 40) throw Object.assign(new ErrorPublico('Estamos recibiendo muchos pedidos. Intenta de nuevo en unos minutos o llámanos.'), { status: 503 });

    const items = (Array.isArray(body.items) ? body.items.slice(0, 30) : []).map((i) => ({
        producto_id: Number(i.producto_id), cantidad: Math.min(20, Math.max(1, Math.floor(Number(i.cantidad) || 0))), nota: String(i.nota || '').trim().slice(0, 200)
    }));

    // Por IP (15 cada 10 minutos: un hotel o una oficina comparten la misma IP). Solo cuentan los pedidos que pasan las validaciones.
    if (!limitePorIp(req.ip || 'x', 15, 10 * 60 * 1000)) throw Object.assign(new ErrorPublico('Se han enviado muchos pedidos desde esta conexión. Espera unos minutos o llámanos.'), { status: 429 });

    const token = crypto.randomBytes(18).toString('hex');
    const conn = await db.getConnection();
    let r;
    try {
        await conn.beginTransaction();
        r = await delivery.crearPedido(conn, {
            items, tipo, nombre, telefono, direccion: body.direccion, referencia: body.referencia,
            zonaId: body.zonaId ? Number(body.zonaId) : null, metodoPago: metodo, notas: body.notas,
            origen: 'app', usuario: 'App de clientes', soloMenu: true
        });
        await conn.query('UPDATE pedidos SET seguimiento_token = ? WHERE id = ?', [token, r.pedido_id]);
        await conn.commit();
    } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
    } finally { conn.release(); }

    // Pago en línea: se crea el cobro y se devuelve el enlace de pago (Stripe o BTCPay)
    let pago = null;
    try {
        if (metodo === 'stripe') {
            const sc = await stripeService.getStripeConfig();
            const cobro = await delivery.cobroStripe(r.pedido_id, { baseUrl: baseUrl(req, sc.appUrlPublica), usuario: 'App de clientes', retorno: `/pedir/pedido/${token}` });
            pago = { tipo: 'stripe', url: cobro.url };
        } else if (metodo === 'cripto') {
            const base = baseUrl(req, (await stripeService.getStripeConfig().catch(() => ({}))).appUrlPublica);
            const cobro = await delivery.cobroCripto(r.pedido_id, { usuario: 'App de clientes', retornoUrl: `${base}/pedir/pedido/${token}` });
            pago = { tipo: 'cripto', url: cobro.url };
        }
    } catch (e) {
        // Sin enlace de pago no dejamos un pedido huérfano en el tablero del personal
        const c2 = await db.getConnection();
        try { await c2.beginTransaction(); await delivery.cancelar(c2, r.pedido_id, 'No se pudo generar el pago en línea', 'sistema'); await c2.commit(); }
        catch (_) { await c2.rollback().catch(() => {}); } finally { c2.release(); }
        console.error('No se pudo crear el cobro del pedido de la app:', e.message);
        throw new ErrorPublico('No pudimos preparar el pago en línea. Elige otra forma de pago o inténtalo de nuevo.');
    }
    return { token, codigo: r.codigo, total: r.total, tipo, metodoPago: metodoCliente, pago, minutosParaPagar: pago ? MINUTOS_PARA_PAGAR : null };
}

// ---------------------------------------------------------------------------------------------- seguimiento
const ultimaConsulta = new Map();
async function sincronizar(clave, fn) {
    const ahora = Date.now();
    if (ahora - (ultimaConsulta.get(clave) || 0) < 4000) return;
    ultimaConsulta.set(clave, ahora);
    if (ultimaConsulta.size > 2000) ultimaConsulta.clear();
    try { await fn(); } catch (_) { /* Stripe/BTCPay sin red: se reintenta en el próximo ciclo */ }
}

async function seguimiento(token) {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    const leer = async () => {
        const [rows] = await db.query(
            `SELECT p.id, p.tipo, p.estado, p.estado_delivery, p.cliente_nombre, p.total, p.costo_envio, p.metodo_pago_previsto, p.pago_validado,
                    p.direccion_entrega, p.created_at, p.stripe_pago_id, p.cripto_pago_id,
                    sp.estado AS stripe_estado, sp.url AS stripe_url, cp.estado AS cripto_estado, cp.checkout_url AS cripto_url
             FROM pedidos p
             LEFT JOIN stripe_pagos sp ON sp.id = p.stripe_pago_id
             LEFT JOIN cripto_pagos cp ON cp.id = p.cripto_pago_id
             WHERE p.seguimiento_token = ? AND p.origen = 'app'`, [token]
        );
        return rows[0] || null;
    };
    let p = await leer();
    if (!p) return null;
    if (p.metodo_pago_previsto === 'stripe' && p.stripe_pago_id && p.stripe_estado === 'pendiente') {
        await sincronizar(`s${p.stripe_pago_id}`, () => stripeService.consultarCobro(p.stripe_pago_id));
        p = await leer();
    } else if (p.metodo_pago_previsto === 'cripto' && p.cripto_pago_id && ['pendiente', 'procesando'].includes(p.cripto_estado)) {
        await sincronizar(`c${p.cripto_pago_id}`, () => criptoService.consultarCobro(p.cripto_pago_id));
        p = await leer();
    }

    const [items] = await db.query(
        `SELECT pr.nombre, i.cantidad, i.subtotal, i.estado, i.nota
         FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id AND pr.codigo <> 'ENVIO'
         WHERE i.pedido_id = ? AND i.estado NOT IN ('cancelado','rechazado') ORDER BY i.id`, [p.id]
    );
    const todasListas = items.length > 0 && items.every((i) => ['listo', 'servido'].includes(i.estado));

    const online = ['stripe', 'cripto'].includes(p.metodo_pago_previsto);
    const estadoCobro = p.metodo_pago_previsto === 'stripe' ? p.stripe_estado : p.metodo_pago_previsto === 'cripto' ? p.cripto_estado : null;
    const pagado = online && ['pagado', 'usado'].includes(estadoCobro);
    const urlPago = p.metodo_pago_previsto === 'stripe' ? p.stripe_url : p.cripto_url;

    let fase;
    if (p.estado_delivery === 'cancelado' || p.estado === 'cancelado') fase = 'cancelado';
    else if (p.estado_delivery === 'entregado') fase = 'entregado';
    else if (p.estado_delivery === 'en_camino') fase = 'en_camino';
    else if (p.estado_delivery === 'por_confirmar') fase = online && !pagado ? 'esperando_pago' : 'recibido';
    else fase = todasListas ? 'listo' : 'preparando';

    const cfg = await configApp();
    let datosTransferencia = null;
    if (p.metodo_pago_previsto === 'transferencia' && !Number(p.pago_validado) && !['cancelado', 'entregado'].includes(fase)) {
        const [[c]] = await db.query('SELECT datos_transferencia FROM configuracion_impresion ORDER BY id LIMIT 1');
        datosTransferencia = c ? c.datos_transferencia : null;
    }
    return {
        codigo: delivery.codigoPedido(p.id, p.tipo),
        tipo: p.tipo,
        fase,
        nombre: p.cliente_nombre,
        direccion: p.direccion_entrega,
        total: Number(p.total),
        envio: Number(p.costo_envio),
        creado: p.created_at,
        items: items.map((i) => ({ nombre: i.nombre, cantidad: Number(i.cantidad), subtotal: Number(i.subtotal), nota: i.nota })),
        moneda: cfg.moneda,
        negocio: { nombre: cfg.nombre, telefono: cfg.telefono },
        pago: {
            metodo: p.metodo_pago_previsto === 'stripe' ? 'tarjeta' : p.metodo_pago_previsto,
            pagado: pagado || (p.metodo_pago_previsto === 'transferencia' && Number(p.pago_validado) === 1),
            procesando: estadoCobro === 'procesando',
            // Solo se ofrece el enlace mientras el cobro siga vigente
            url: online && !pagado && ['pendiente', 'procesando'].includes(estadoCobro) && fase === 'esperando_pago' ? urlPago : null,
            vencido: online && !pagado && ['expirado', 'invalido'].includes(estadoCobro),
            datosTransferencia
        },
        puedeCancelar: p.estado_delivery === 'por_confirmar' && !pagado && !Number(p.pago_validado)
    };
}

async function cancelarPorCliente(token) {
    if (!TOKEN_RE.test(String(token || ''))) throw new ErrorPublico('Pedido no encontrado');
    const [rows] = await db.query(`SELECT id FROM pedidos WHERE seguimiento_token = ? AND origen = 'app'`, [token]);
    if (!rows[0]) throw new ErrorPublico('Pedido no encontrado');
    const s = await seguimiento(token);
    if (!s || !s.puedeCancelar) throw new ErrorPublico('Este pedido ya no se puede cancelar desde la app. Llama al restaurante.');
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await delivery.cancelar(conn, rows[0].id, 'Cancelado por el cliente desde la app', 'cliente');
        await conn.commit();
    } catch (e) { await conn.rollback().catch(() => {}); throw e; } finally { conn.release(); }
    return { ok: true };
}

/** Cancela los pedidos de la app con pago en línea que no se pagaron a tiempo. Lo usa el mantenimiento programado. */
async function limpiarSinPago(minutos = MINUTOS_PARA_PAGAR) {
    const [rows] = await db.query(
        `SELECT p.id FROM pedidos p
         LEFT JOIN stripe_pagos sp ON sp.id = p.stripe_pago_id
         LEFT JOIN cripto_pagos cp ON cp.id = p.cripto_pago_id
         WHERE p.origen = 'app' AND p.estado_delivery = 'por_confirmar' AND p.metodo_pago_previsto IN ('stripe','cripto')
           AND p.created_at < NOW() - (? || ' minutes')::interval
           AND COALESCE(sp.estado, cp.estado, 'pendiente') NOT IN ('pagado','usado','procesando')
         LIMIT 50`, [String(minutos)]
    );
    let n = 0;
    for (const r of rows) {
        // Antes de cancelar se confirma con el proveedor que de verdad no pagó (el pago pudo llegar hace un momento)
        const [[cob]] = await db.query('SELECT metodo_pago_previsto AS m, stripe_pago_id AS s, cripto_pago_id AS c FROM pedidos WHERE id = ?', [r.id]);
        try {
            if (cob.m === 'stripe' && cob.s) await stripeService.consultarCobro(cob.s);
            if (cob.m === 'cripto' && cob.c) await criptoService.consultarCobro(cob.c);
        } catch (_) { /* proveedor sin conexión: se decide con lo que hay en la base */ }
        const [[aun]] = await db.query(
            `SELECT COALESCE(sp.estado, cp.estado, 'pendiente') AS e FROM pedidos p
             LEFT JOIN stripe_pagos sp ON sp.id = p.stripe_pago_id LEFT JOIN cripto_pagos cp ON cp.id = p.cripto_pago_id WHERE p.id = ?`, [r.id]
        );
        if (['pagado', 'usado', 'procesando'].includes(aun.e)) continue;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await delivery.cancelar(conn, r.id, 'No se pagó a tiempo', 'sistema');
            await conn.commit();
            n++;
        } catch (_) { await conn.rollback().catch(() => {}); } finally { conn.release(); }
    }
    return n;
}

module.exports = { catalogo, cotizarCarrito, crearPedido, seguimiento, cancelarPorCliente, limpiarSinPago, configApp, baseUrl, formasDePago, MINUTOS_PARA_PAGAR };
