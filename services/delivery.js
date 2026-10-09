// Delivery y pedidos para llevar. Lo usan el tablero del personal (routes/delivery.js) y los
// agentes de voz / WhatsApp (services/agente/ejecutor.js): una sola lógica de pedidos.
//
// Flujo: por_confirmar (el personal revisa) → en_cocina → (listo, derivado) → en_camino → entregado
// El costo de envío es una línea técnica (producto ENVIO, ya "servida") para que la factura sume bien;
// cocina y reportes la ignoran.
// Relacionado con: database.sql (pedidos.tipo/estado_delivery), services/facturacion.js, services/stripe.js
const QRCode = require('qrcode');
const db = require('../db');
const stripeService = require('./stripe');
const criptoService = require('./cripto');
const facturacion = require('./facturacion');
const clientesService = require('./clientes');
const { normalizar } = require('./telefono');
const { ErrorPublico } = require('./errores');

const TIPOS = ['delivery', 'para_llevar'];
const METODOS = ['stripe', 'transferencia', 'efectivo', 'cripto'];
const ORIGENES = ['pos', 'voz', 'whatsapp', 'app'];

function codigoPedido(id, tipo) {
    return `${tipo === 'delivery' ? 'DEL' : 'LLEVAR'}-${id}`;
}

async function getConfig(conn = db) {
    const [rows] = await conn.query(
        `SELECT delivery_activo, pedido_minimo_delivery, tiempo_preparacion_min, moneda, nombre_negocio,
                datos_transferencia, telefono_humano
         FROM configuracion_impresion ORDER BY id LIMIT 1`
    );
    const c = rows[0] || {};
    return {
        deliveryActivo: Number(c.delivery_activo ?? 1) === 1,
        pedidoMinimo: Number(c.pedido_minimo_delivery || 0),
        tiempoPreparacion: Number(c.tiempo_preparacion_min || 25),
        moneda: String(c.moneda || 'dop').toLowerCase(),
        nombreNegocio: c.nombre_negocio || 'Restaurant Martin',
        datosTransferencia: c.datos_transferencia || '',
        telefonoHumano: c.telefono_humano || ''
    };
}

async function listarZonas(conn = db, soloActivas = true) {
    const [rows] = await conn.query(
        `SELECT id, nombre, costo_envio, minutos_estimados, activa
         FROM delivery_zonas ${soloActivas ? 'WHERE activa = 1' : ''} ORDER BY orden, nombre`
    );
    return rows.map((z) => ({ ...z, costo_envio: Number(z.costo_envio), minutos_estimados: Number(z.minutos_estimados) }));
}

/** Producto técnico para el costo de envío (se crea solo; el administrador no necesita tocarlo). */
async function asegurarProductoEnvio(conn) {
    const [ins] = await conn.query(
        `INSERT INTO productos (codigo, nombre, precio_unidad, categoria, en_menu, disponible)
         VALUES ('ENVIO', 'Costo de envío', 0, 'Delivery', 0, 1)
         ON CONFLICT (codigo) DO UPDATE SET en_menu = 0
         RETURNING id`
    );
    return ins.insertId;
}

/**
 * Valida productos y calcula totales con los precios de la base de datos (nunca los del cliente).
 * soloMenu = true para agentes/QR: solo productos publicados y disponibles.
 */
async function cotizar(conn, { items, zonaId = null, tipo = 'delivery', soloMenu = false }) {
    const lista = (Array.isArray(items) ? items : [])
        .map((i) => ({
            producto_id: Number(i.producto_id),
            cantidad: Math.min(50, Math.max(1, Math.floor(Number(i.cantidad) || 0))),
            nota: String(i.nota || '').trim().slice(0, 200)
        }))
        .filter((i) => Number.isInteger(i.producto_id) && i.producto_id > 0);
    if (lista.length === 0) throw new ErrorPublico('El pedido está vacío');
    if (lista.length > 40) throw new ErrorPublico('Demasiados productos en un solo pedido');

    const ids = [...new Set(lista.map((i) => i.producto_id))];
    const [prods] = await conn.query(
        `SELECT id, nombre, precio_unidad FROM productos
         WHERE id IN (?) AND precio_unidad > 0 AND codigo <> 'ENVIO'
           ${soloMenu ? 'AND en_menu = 1 AND disponible = 1' : ''}`,
        [ids]
    );
    const porId = new Map(prods.map((p) => [Number(p.id), p]));
    const faltan = lista.filter((i) => !porId.has(i.producto_id));
    if (faltan.length) {
        throw new ErrorPublico('Algunos productos no existen o no están disponibles ahora mismo');
    }

    const lineas = lista.map((i) => {
        const p = porId.get(i.producto_id);
        return { ...i, nombre: p.nombre, precio: Number(p.precio_unidad), subtotal: Number(p.precio_unidad) * i.cantidad };
    });
    const subtotal = lineas.reduce((a, l) => a + l.subtotal, 0);

    let zona = null;
    let envio = 0;
    if (tipo === 'delivery') {
        const zonas = await listarZonas(conn, true);
        if (zonaId) {
            zona = zonas.find((z) => z.id === Number(zonaId));
            if (!zona) throw new ErrorPublico('Esa zona de entrega no está disponible');
        } else if (zonas.length > 0) {
            throw new ErrorPublico('Indica la zona de entrega');
        }
        envio = zona ? zona.costo_envio : 0;
    }
    return { lineas, subtotal, envio, total: subtotal + envio, zona };
}

/**
 * Crea un pedido de delivery o para llevar en estado "por_confirmar" y avisa al personal.
 * datos: { items, tipo, nombre, telefono, direccion, referencia, zonaId, metodoPago, notas, origen, usuario, soloMenu }
 */
async function crearPedido(conn, datos) {
    const tipo = TIPOS.includes(datos.tipo) ? datos.tipo : 'delivery';
    const origen = ORIGENES.includes(datos.origen) ? datos.origen : 'pos';
    const metodo = METODOS.includes(datos.metodoPago) ? datos.metodoPago : null;
    const telefono = normalizar(datos.telefono);
    const nombre = String(datos.nombre || '').trim().slice(0, 100);
    const direccion = String(datos.direccion || '').trim().slice(0, 300);
    const referencia = String(datos.referencia || '').trim().slice(0, 300) || null;
    const notas = String(datos.notas || '').trim().slice(0, 500) || null;

    if (tipo === 'delivery') {
        if (!telefono) throw new ErrorPublico('Falta el teléfono del cliente');
        if (direccion.length < 5) throw new ErrorPublico('Falta la dirección de entrega');
    }
    const cfg = await getConfig(conn);
    if (tipo === 'delivery' && !cfg.deliveryActivo && origen !== 'pos') {
        throw new ErrorPublico('El servicio de delivery no está disponible en este momento');
    }

    const cot = await cotizar(conn, { items: datos.items, zonaId: datos.zonaId, tipo, soloMenu: !!datos.soloMenu });
    if (tipo === 'delivery' && origen !== 'pos' && cfg.pedidoMinimo > 0 && cot.subtotal < cfg.pedidoMinimo) {
        throw new ErrorPublico(`El pedido mínimo para delivery es ${cfg.pedidoMinimo.toLocaleString('es-DO')} (sin contar el envío)`);
    }

    // Cliente (para identificarlo la próxima vez y facturar)
    let cliente = null;
    if (telefono) cliente = await clientesService.buscarOCrear(conn, { telefono, nombre, direccion });
    else cliente = await clientesService.consumidorFinal(conn);

    const [ins] = await conn.query(
        `INSERT INTO pedidos (mesa_id, cliente_id, mesero_nombre, estado, total, notas, tipo, origen,
                              cliente_nombre, cliente_telefono, direccion_entrega, referencia_entrega,
                              zona_id, costo_envio, metodo_pago_previsto, estado_delivery)
         VALUES (NULL, ?, ?, 'abierto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'por_confirmar')`,
        [cliente.id, datos.usuario || null, cot.total, notas, tipo, origen,
         nombre || cliente.nombre || null, telefono, tipo === 'delivery' ? direccion : null, referencia,
         cot.zona ? cot.zona.id : null, cot.envio, metodo]
    );
    const pedidoId = ins.insertId;

    for (const l of cot.lineas) {
        await conn.query(
            `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota)
             VALUES (?, ?, ?, 'UND', ?, ?, 'pendiente', ?)`,
            [pedidoId, l.producto_id, l.cantidad, l.precio, l.subtotal, l.nota || null]
        );
    }
    if (cot.envio > 0) {
        const envioId = await asegurarProductoEnvio(conn);
        await conn.query(
            `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota, servido_at)
             VALUES (?, ?, 1, 'UND', ?, ?, 'servido', ?, NOW())`,
            [pedidoId, envioId, cot.envio, cot.envio, cot.zona ? `Zona: ${cot.zona.nombre}` : null]
        );
    }

    const resumen = cot.lineas.map((l) => `${l.cantidad}× ${l.nombre}`).join(', ');
    await conn.query(
        `INSERT INTO mesa_alertas (pedido_id, tipo, mensaje) VALUES (?, 'pedido_delivery', ?)`,
        [pedidoId, `${codigoPedido(pedidoId, tipo)} (${origen}): ${resumen}`.slice(0, 500)]
    );

    return {
        pedido_id: pedidoId,
        codigo: codigoPedido(pedidoId, tipo),
        tipo,
        subtotal: cot.subtotal,
        costo_envio: cot.envio,
        total: cot.total,
        minutos_estimados: (cot.zona ? cot.zona.minutos_estimados : 0) + cfg.tiempoPreparacion,
        metodo_pago: metodo,
        cliente_id: cliente.id,
        lineas: cot.lineas.map((l) => ({ producto_id: l.producto_id, nombre: l.nombre, cantidad: l.cantidad, subtotal: l.subtotal }))
    };
}

// Consulta cada cobro pendiente a lo sumo cada 8 s (el tablero se refresca cada pocos segundos)
const ultimaConsulta = new Map();
async function sincronizarCobrosPendientes(pedidos) {
    const ahora = Date.now();
    for (const p of pedidos) {
        if (p.stripe_estado !== 'pendiente' || !p.stripe_id) continue;
        if (ahora - (ultimaConsulta.get(p.stripe_id) || 0) < 8000) continue;
        ultimaConsulta.set(p.stripe_id, ahora);
        try {
            const nuevo = await stripeService.consultarCobro(p.stripe_id);
            if (nuevo && nuevo.estado) p.stripe_estado = nuevo.estado;
        } catch (_) { /* Stripe sin configurar o sin red: el tablero sigue funcionando */ }
    }
    // Cobros cripto (BTCPay): misma idea
    for (const p of pedidos) {
        if (!['pendiente', 'procesando'].includes(p.cripto_estado) || !p.cripto_id) continue;
        const clave = `c${p.cripto_id}`;
        if (ahora - (ultimaConsulta.get(clave) || 0) < 8000) continue;
        ultimaConsulta.set(clave, ahora);
        try {
            const nuevo = await criptoService.consultarCobro(p.cripto_id);
            if (nuevo && nuevo.estado) p.cripto_estado = nuevo.estado;
        } catch (_) { /* BTCPay sin configurar o sin red */ }
    }
}

/** Tablero: pedidos activos y los entregados/cancelados de hoy, con sus platos. */
async function listar(conn = db) {
    const [pedidos] = await conn.query(
        `SELECT p.id, p.tipo, p.origen, p.estado, p.estado_delivery, p.cliente_nombre, p.cliente_telefono,
                p.direccion_entrega, p.referencia_entrega, p.total, p.costo_envio, p.metodo_pago_previsto,
                p.pago_validado, p.repartidor, p.notas, p.created_at, p.entregado_at, p.factura_id,
                (SELECT z.nombre FROM delivery_zonas z WHERE z.id = p.zona_id) AS zona,
                sp.id AS stripe_id, sp.estado AS stripe_estado, sp.url AS stripe_url,
                cp.id AS cripto_id, cp.estado AS cripto_estado,
                (SELECT COUNT(*) FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id AND pr.codigo <> 'ENVIO'
                  WHERE i.pedido_id = p.id AND i.estado NOT IN ('cancelado','rechazado')) AS lineas,
                (SELECT COUNT(*) FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id AND pr.codigo <> 'ENVIO'
                  WHERE i.pedido_id = p.id AND i.estado IN ('listo','servido')) AS listas
         FROM pedidos p
         LEFT JOIN stripe_pagos sp ON sp.id = p.stripe_pago_id
         LEFT JOIN cripto_pagos cp ON cp.id = p.cripto_pago_id
         WHERE p.tipo IN ('delivery','para_llevar')
           AND (p.estado_delivery IN ('por_confirmar','en_cocina','en_camino') OR p.created_at >= CURRENT_DATE)
         ORDER BY p.created_at DESC
         LIMIT 200`
    );
    await sincronizarCobrosPendientes(pedidos);

    const ids = pedidos.map((p) => p.id);
    let items = [];
    if (ids.length) {
        [items] = await conn.query(
            `SELECT i.pedido_id, pr.nombre, i.cantidad, i.subtotal, i.estado, i.nota
             FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id AND pr.codigo <> 'ENVIO'
             WHERE i.pedido_id IN (?) AND i.estado NOT IN ('cancelado','rechazado')
             ORDER BY i.id`,
            [ids]
        );
    }
    return pedidos.map((p) => {
        const lineas = Number(p.lineas);
        const listas = Number(p.listas);
        const columna = p.estado_delivery === 'en_cocina' && lineas > 0 && listas >= lineas ? 'listo' : p.estado_delivery;
        return {
            ...p,
            codigo: codigoPedido(p.id, p.tipo),
            total: Number(p.total),
            costo_envio: Number(p.costo_envio),
            lineas,
            listas,
            columna,
            items: items.filter((i) => i.pedido_id === p.id).map((i) => ({ ...i, cantidad: Number(i.cantidad), subtotal: Number(i.subtotal) }))
        };
    });
}

async function bloquear(conn, id) {
    const [rows] = await conn.query(`SELECT * FROM pedidos WHERE id = ? AND tipo IN ('delivery','para_llevar') FOR NO KEY UPDATE`, [id]);
    // FOR NO KEY UPDATE (no FOR UPDATE): sigue bloqueando a otros que modifiquen el pedido, pero deja que otra conexión
    // inserte avisos o pagos que apuntan a él (clave foránea). Con FOR UPDATE, un pago que llegaba justo al cancelar
    // o cobrar dejaba la operación esperándose a sí misma.
    if (!rows[0]) throw new ErrorPublico('Pedido no encontrado');
    return rows[0];
}

/** El personal revisa y confirma: los platos pasan a cocina. */
async function confirmar(conn, id, usuario) {
    const p = await bloquear(conn, id);
    if (p.estado_delivery !== 'por_confirmar') throw new ErrorPublico('Este pedido ya fue confirmado o cancelado');
    // Pedidos de la app con pago en línea: se confirman cuando el cliente ya pagó
    if (p.origen === 'app' && ['stripe', 'cripto'].includes(p.metodo_pago_previsto)) {
        const tabla = p.metodo_pago_previsto === 'stripe' ? 'stripe_pagos' : 'cripto_pagos';
        const col = p.metodo_pago_previsto === 'stripe' ? 'stripe_pago_id' : 'cripto_pago_id';
        const [pg] = p[col] ? await conn.query(`SELECT estado FROM ${tabla} WHERE id = ?`, [p[col]]) : [[]];
        if (!pg[0] || !['pagado', 'usado'].includes(pg[0].estado)) throw new ErrorPublico('El cliente aún no ha pagado en línea. Confirma el pedido cuando se vea "Pagado".');
    }
    await conn.query(
        `UPDATE pedido_items SET estado = 'enviado', enviado_at = NOW() WHERE pedido_id = ? AND estado = 'pendiente'`,
        [id]
    );
    await conn.query(
        `UPDATE pedidos SET estado_delivery = 'en_cocina', mesero_nombre = COALESCE(mesero_nombre, ?) WHERE id = ?`,
        [usuario || null, id]
    );
    await conn.query(
        `UPDATE mesa_alertas SET atendida = 1, atendida_at = NOW(), atendida_por = ?
         WHERE pedido_id = ? AND tipo = 'pedido_delivery' AND atendida = 0`,
        [usuario || null, id]
    );
    return { estado: 'en_cocina' };
}

async function cancelar(conn, id, motivo, usuario) {
    const p = await bloquear(conn, id);
    if (['entregado', 'cancelado'].includes(p.estado_delivery) || p.estado === 'cerrado') {
        throw new ErrorPublico('Este pedido ya no se puede cancelar');
    }
    await conn.query(`UPDATE pedido_items SET estado = 'cancelado' WHERE pedido_id = ? AND estado NOT IN ('servido','rechazado')`, [id]);
    const nota = `Cancelado por ${usuario || 'personal'}${motivo ? `: ${String(motivo).slice(0, 200)}` : ''}`;
    await conn.query(
        `UPDATE pedidos SET estado = 'cancelado', estado_delivery = 'cancelado', notas = COALESCE(notas || E'\\n', '') || ? WHERE id = ?`,
        [nota, id]
    );
    await conn.query(`UPDATE mesa_alertas SET atendida = 1, atendida_at = NOW() WHERE pedido_id = ? AND atendida = 0`, [id]);
    // Si el cliente ya pagó con Stripe, el reembolso se hace manualmente en el dashboard de Stripe
    let reembolsoPendiente = false;
    if (p.stripe_pago_id) {
        const [sp] = await conn.query('SELECT estado FROM stripe_pagos WHERE id = ?', [p.stripe_pago_id]);
        reembolsoPendiente = sp[0] && ['pagado', 'usado'].includes(sp[0].estado);
        if (sp[0] && sp[0].estado === 'pendiente') {
            await stripeService.cancelarCobro(p.stripe_pago_id).catch(() => {});
        }
    }
    if (p.cripto_pago_id) {
        const [cp] = await conn.query('SELECT estado FROM cripto_pagos WHERE id = ?', [p.cripto_pago_id]);
        if (cp[0] && ['pagado', 'usado'].includes(cp[0].estado)) reembolsoPendiente = true; // el reembolso se hace a mano desde BTCPay
        if (cp[0] && cp[0].estado === 'pendiente') await criptoService.cancelarCobro(p.cripto_pago_id).catch(() => {});
    }
    return { reembolso_pendiente: reembolsoPendiente };
}

async function asignarRepartidor(conn, id, nombre) {
    await bloquear(conn, id);
    await conn.query('UPDATE pedidos SET repartidor = ? WHERE id = ?', [String(nombre || '').trim().slice(0, 100) || null, id]);
}

async function lineasPendientes(conn, id) {
    const [rows] = await conn.query(
        `SELECT COUNT(*) AS n FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id AND pr.codigo <> 'ENVIO'
         WHERE i.pedido_id = ? AND i.estado NOT IN ('cancelado','rechazado','listo','servido')`,
        [id]
    );
    return Number(rows[0].n);
}

async function marcarEnCamino(conn, id) {
    const p = await bloquear(conn, id);
    if (p.estado_delivery !== 'en_cocina') throw new ErrorPublico('El pedido debe estar en cocina para salir a entrega');
    if (await lineasPendientes(conn, id) > 0) throw new ErrorPublico('Aún hay platos sin terminar en cocina');
    await conn.query(`UPDATE pedidos SET estado_delivery = 'en_camino' WHERE id = ?`, [id]);
}

async function validarTransferencia(conn, id) {
    await bloquear(conn, id);
    await conn.query('UPDATE pedidos SET pago_validado = 1, metodo_pago_previsto = \'transferencia\' WHERE id = ?', [id]);
}

/** Genera (o reutiliza) el enlace de pago de Stripe del pedido. Devuelve url y QR. */
async function cobroStripe(id, { baseUrl, usuario, retorno = null }) {
    const [rows] = await db.query(
        `SELECT p.*, sp.estado AS sp_estado, sp.url AS sp_url FROM pedidos p
         LEFT JOIN stripe_pagos sp ON sp.id = p.stripe_pago_id
         WHERE p.id = ? AND p.tipo IN ('delivery','para_llevar')`,
        [id]
    );
    const p = rows[0];
    if (!p) throw new ErrorPublico('Pedido no encontrado');
    if (['entregado', 'cancelado'].includes(p.estado_delivery)) throw new ErrorPublico('Este pedido ya está cerrado');
    if (p.sp_estado === 'pagado' || p.sp_estado === 'usado') return { estado: 'pagado' };
    if (p.sp_estado === 'pendiente' && p.sp_url) {
        return { estado: 'pendiente', url: p.sp_url, qr: await QRCode.toDataURL(p.sp_url, { margin: 1, width: 320 }), monto: Number(p.total) };
    }
    const cobro = await stripeService.crearCobro({
        monto: Number(p.total),
        pedidoId: id,
        descripcion: `Pedido ${codigoPedido(id, p.tipo)}`,
        baseUrl,
        usuario,
        expiraMin: 180,
        retorno
    });
    await db.query(`UPDATE pedidos SET stripe_pago_id = ?, metodo_pago_previsto = 'stripe' WHERE id = ?`, [cobro.id, id]);
    return { estado: 'pendiente', url: cobro.url, qr: cobro.qr, monto: cobro.monto, moneda: cobro.moneda };
}

/** Genera (o reutiliza) el cobro cripto del pedido. Devuelve el enlace de pago, el QR y los datos de Lightning/Bitcoin. */
async function cobroCripto(id, { usuario, retornoUrl = null }) {
    const [rows] = await db.query(
        `SELECT p.*, cp.estado AS cp_estado, cp.checkout_url AS cp_url, cp.lightning AS cp_ln, cp.onchain AS cp_oc, cp.monto_btc AS cp_btc
         FROM pedidos p LEFT JOIN cripto_pagos cp ON cp.id = p.cripto_pago_id
         WHERE p.id = ? AND p.tipo IN ('delivery','para_llevar')`,
        [id]
    );
    const p = rows[0];
    if (!p) throw new ErrorPublico('Pedido no encontrado');
    if (['entregado', 'cancelado'].includes(p.estado_delivery)) throw new ErrorPublico('Este pedido ya está cerrado');
    if (p.cp_estado === 'pagado' || p.cp_estado === 'usado') return { estado: 'pagado' };
    if (['pendiente', 'procesando'].includes(p.cp_estado) && p.cp_url) {
        return { estado: p.cp_estado, url: p.cp_url, qr: await criptoService.qrDe(p.cp_url), monto: Number(p.total), lightning: p.cp_ln, onchain: p.cp_oc, monto_btc: p.cp_btc };
    }
    const cobro = await criptoService.crearCobro({ monto: Number(p.total), pedidoId: id, descripcion: `Pedido ${codigoPedido(id, p.tipo)}`, usuario, expiraMin: 180, retornoUrl });
    await db.query(`UPDATE pedidos SET cripto_pago_id = ?, metodo_pago_previsto = 'cripto' WHERE id = ?`, [cobro.id, id]);
    return { estado: 'pendiente', url: cobro.url, qr: cobro.qr_checkout, monto: cobro.monto, moneda: cobro.moneda, lightning: cobro.lightning, onchain: cobro.onchain, monto_btc: cobro.monto_btc };
}

/** Entrega y factura: usa el medio de pago previsto o los pagos indicados por el personal. */
async function entregarYFacturar(conn, id, { pagos, usuario }) {
    const p = await bloquear(conn, id);
    if (!['en_cocina', 'en_camino'].includes(p.estado_delivery)) throw new ErrorPublico('El pedido debe estar confirmado para entregarlo');
    if (await lineasPendientes(conn, id) > 0) throw new ErrorPublico('Aún hay platos sin terminar en cocina');

    let pagosFinal = Array.isArray(pagos) && pagos.length ? pagos : null;
    if (!pagosFinal) {
        const total = Number(p.total);
        if (p.metodo_pago_previsto === 'stripe') {
            if (!p.stripe_pago_id) throw new ErrorPublico('Genera el enlace de pago de Stripe primero');
            pagosFinal = [{ metodo: 'stripe', monto: total, stripe_pago_id: p.stripe_pago_id }];
        } else if (p.metodo_pago_previsto === 'cripto') {
            if (!p.cripto_pago_id) throw new ErrorPublico('Genera el cobro cripto primero');
            pagosFinal = [{ metodo: 'cripto', monto: total, cripto_pago_id: p.cripto_pago_id }];
        } else if (p.metodo_pago_previsto === 'transferencia') {
            if (!Number(p.pago_validado)) throw new ErrorPublico('Valida primero la transferencia del cliente');
            pagosFinal = [{ metodo: 'transferencia', monto: total, referencia: `Validada por ${usuario || 'personal'}` }];
        } else {
            pagosFinal = [{ metodo: 'efectivo', monto: total }];
        }
    }

    await conn.query(`UPDATE pedido_items SET estado = 'servido', servido_at = NOW() WHERE pedido_id = ? AND estado = 'listo'`, [id]);
    const { facturaId } = await facturacion.facturarPedido(conn, {
        pedidoId: id, clienteId: p.cliente_id, pagos: pagosFinal, usuario
    });
    await conn.query(`UPDATE pedidos SET estado_delivery = 'entregado', entregado_at = NOW() WHERE id = ?`, [id]);
    return { factura_id: facturaId };
}

/** Último pedido del teléfono (para "¿cómo va mi pedido?" de los agentes). */
async function estadoPorTelefono(conn, telefono) {
    const tel = normalizar(telefono);
    if (!tel) return null;
    const [rows] = await conn.query(
        `SELECT p.id, p.tipo, p.estado_delivery, p.total, p.metodo_pago_previsto, p.created_at,
                (SELECT COUNT(*) FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id AND pr.codigo <> 'ENVIO'
                  WHERE i.pedido_id = p.id AND i.estado NOT IN ('cancelado','rechazado')) AS lineas,
                (SELECT COUNT(*) FROM pedido_items i JOIN productos pr ON pr.id = i.producto_id AND pr.codigo <> 'ENVIO'
                  WHERE i.pedido_id = p.id AND i.estado IN ('listo','servido')) AS listas
         FROM pedidos p
         WHERE p.tipo IN ('delivery','para_llevar') AND right(regexp_replace(p.cliente_telefono, '\\D', '', 'g'), 10) = ?
           AND p.created_at >= NOW() - interval '1 day'
         ORDER BY p.created_at DESC LIMIT 1`,
        [tel.slice(-10)]
    );
    if (!rows[0]) return null;
    const p = rows[0];
    const lista = p.estado_delivery === 'en_cocina' && Number(p.lineas) > 0 && Number(p.listas) >= Number(p.lineas);
    return { id: p.id, codigo: codigoPedido(p.id, p.tipo), estado: lista ? 'listo' : p.estado_delivery, total: Number(p.total), metodo_pago: p.metodo_pago_previsto };
}

module.exports = {
    getConfig, listarZonas, cotizar, crearPedido, listar, confirmar, cancelar, asignarRepartidor,
    marcarEnCamino, validarTransferencia, cobroStripe, cobroCripto, entregarYFacturar, estadoPorTelefono, codigoPedido,
    asegurarProductoEnvio
};
