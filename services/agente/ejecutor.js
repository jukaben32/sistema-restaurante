// Ejecutor de herramientas de los agentes: la ÚNICA puerta de los agentes a los datos del restaurante.
// Voz (Vapi) y WhatsApp llaman a ejecutar(nombre, args, ctx) y reciben un objeto con la respuesta.
// - Valida todo: precios y disponibilidad salen de la base de datos, nunca del modelo.
// - Los pedidos y reservas entran "por confirmar": el personal los revisa.
// ctx = { canal: 'voz' | 'whatsapp', telefono, conversacionId, baseUrl }
// Relacionado con: services/delivery.js, services/reservas.js, services/stripe.js, routes/vapi.js, services/agente/texto.js
const db = require('../../db');
const delivery = require('../delivery');
const reservas = require('../reservas');
const stripeService = require('../stripe');
const clientesService = require('../clientes');
const conversaciones = require('./conversaciones');
const notificaciones = require('./notificaciones');
const { normalizar } = require('../telefono');
const { ErrorPublico } = require('../errores');

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const pad = (n) => String(n).padStart(2, '0');

function nombreAgente(ctx) {
    return ctx.canal === 'voz' ? 'Agente de voz' : 'Agente WhatsApp';
}

function telefonoDe(ctx, args = {}) {
    return normalizar(ctx.telefono) || normalizar(args.telefonoContacto);
}

// ---------------------------------------------------------------- hora local del restaurante
function ahoraLocal() {
    const tz = process.env.DB_TIMEZONE || 'America/Santo_Domingo';
    const partes = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const get = (t) => partes.find((p) => p.type === t).value;
    let h = Number(get('hour'));
    if (h === 24) h = 0;
    const m = Number(get('minute'));
    const dia = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
    return { dia, minutos: h * 60 + m, hora: `${pad(h)}:${pad(m)}` };
}

const aMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

/** ¿Está abierto ahora? null si el horario aún no está configurado. */
function abiertoAhora(horarios) {
    if (!horarios.length) return null;
    const { dia, minutos } = ahoraLocal();
    const hoy = horarios.find((h) => Number(h.dia) === dia);
    const ayer = horarios.find((h) => Number(h.dia) === (dia + 6) % 7);
    if (hoy && !Number(hoy.cerrado) && hoy.abre && hoy.cierra) {
        const a = aMin(hoy.abre), c = aMin(hoy.cierra);
        if (c > a ? minutos >= a && minutos < c : minutos >= a) return true;
    }
    if (ayer && !Number(ayer.cerrado) && ayer.abre && ayer.cierra && aMin(ayer.cierra) < aMin(ayer.abre) && minutos < aMin(ayer.cierra)) return true;
    return false;
}

async function resolverZona(nombre) {
    const zonas = await delivery.listarZonas(db, true);
    if (zonas.length === 0) return null;
    const lista = zonas.map((z) => z.nombre).join(', ');
    if (!nombre) throw new ErrorPublico(`Falta la zona de entrega. Zonas disponibles: ${lista}`);
    const n = sinAcentos(nombre);
    const z = zonas.find((x) => sinAcentos(x.nombre) === n)
        || zonas.find((x) => sinAcentos(x.nombre).includes(n) || n.includes(sinAcentos(x.nombre)));
    if (!z) throw new ErrorPublico(`No entregamos en "${nombre}". Zonas disponibles: ${lista}`);
    return z;
}

async function formasDePago() {
    const cfg = await delivery.getConfig(db);
    const formas = ['efectivo'];
    if (cfg.datosTransferencia) formas.push('transferencia');
    try { if ((await stripeService.getStripeConfig()).habilitado) formas.push('stripe'); } catch (_) { /* sin Stripe */ }
    return { formas, cfg };
}

// ---------------------------------------------------------------- herramientas
const HANDLERS = {
    async identificarCliente(args, ctx) {
        const tel = telefonoDe(ctx);
        if (!tel) return { conocido: false, telefono_disponible: false, nota: 'No se ve el número de teléfono. Si va a pedir o reservar, pregúntale un número de contacto.' };
        const c = await clientesService.buscarPorTelefono(db, tel);
        const pedido = await delivery.estadoPorTelefono(db, tel);
        const reserva = await reservas.proximaPorTelefono(db, tel);
        return {
            conocido: !!c,
            telefono_disponible: true,
            nombre: c && c.nombre && !/^(cliente|consumidor final)$/i.test(c.nombre) ? c.nombre : null,
            direccion_habitual: c ? c.direccion || null : null,
            pedido_reciente: pedido,
            reserva_proxima: reserva
        };
    },

    async consultarMenu(args) {
        const cond = ["en_menu = 1", "disponible = 1", "precio_unidad > 0", "codigo <> 'ENVIO'"];
        const params = [];
        if (args.categoria) { cond.push('categoria ILIKE ?'); params.push(`%${String(args.categoria).trim()}%`); }
        if (args.busqueda) { cond.push('(nombre ILIKE ? OR descripcion ILIKE ?)'); params.push(`%${String(args.busqueda).trim()}%`, `%${String(args.busqueda).trim()}%`); }
        const [rows] = await db.query(
            `SELECT id, nombre, descripcion, categoria, precio_unidad FROM productos
             WHERE ${cond.join(' AND ')} ORDER BY categoria NULLS LAST, nombre LIMIT 60`,
            params
        );
        const cfg = await delivery.getConfig(db);
        const filtrado = !!(args.categoria || args.busqueda);
        if (rows.length === 0) {
            return { moneda: cfg.moneda, platos: [], nota: filtrado ? 'Sin coincidencias. Prueba consultarMenu sin filtros.' : 'El menú aún no tiene platos publicados.' };
        }
        return {
            moneda: cfg.moneda,
            platos: rows.map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria || 'Otros', precio: Number(p.precio_unidad), descripcion: p.descripcion ? String(p.descripcion).slice(0, 120) : null }))
        };
    },

    async infoRestaurante() {
        const [[cfgRows], [horarios], [faq], zonas, pago] = await Promise.all([
            db.query('SELECT nombre_negocio, direccion, telefono FROM configuracion_impresion ORDER BY id LIMIT 1'),
            db.query(`SELECT dia, to_char(abre, 'HH24:MI') AS abre, to_char(cierra, 'HH24:MI') AS cierra, cerrado, delivery FROM horarios ORDER BY dia`),
            db.query('SELECT pregunta, respuesta FROM negocio_faq ORDER BY orden, id'),
            delivery.listarZonas(db, true),
            formasDePago()
        ]);
        const c = cfgRows[0] || {};
        const orden = [1, 2, 3, 4, 5, 6, 0];
        const horario = orden.map((d) => {
            const h = horarios.find((x) => Number(x.dia) === d);
            if (!h) return null;
            return Number(h.cerrado) ? `${DIAS[d]}: cerrado` : `${DIAS[d]}: ${h.abre} a ${h.cierra}${Number(h.delivery) ? '' : ' (sin delivery)'}`;
        }).filter(Boolean);
        return {
            nombre: c.nombre_negocio, direccion: c.direccion || null, telefono: c.telefono || null,
            hora_actual: ahoraLocal().hora, abierto_ahora: abiertoAhora(horarios),
            horario: horario.length ? horario : 'Horario aún no configurado: no lo inventes, ofrece que el equipo lo confirme',
            delivery: pago.cfg.deliveryActivo
                ? { disponible: true, pedido_minimo: pago.cfg.pedidoMinimo, minutos_preparacion: pago.cfg.tiempoPreparacion, zonas: zonas.map((z) => ({ nombre: z.nombre, costo_envio: z.costo_envio, minutos: z.minutos_estimados })) }
                : { disponible: false },
            formas_de_pago_delivery: pago.formas,
            moneda: pago.cfg.moneda,
            preguntas_frecuentes: faq
        };
    },

    async cotizarPedido(args) {
        const tipo = args.tipo === 'para_llevar' ? 'para_llevar' : 'delivery';
        const zona = tipo === 'delivery' ? await resolverZona(args.zona) : null;
        const cot = await delivery.cotizar(db, { items: args.items, zonaId: zona ? zona.id : null, tipo, soloMenu: true });
        const cfg = await delivery.getConfig(db);
        return {
            moneda: cfg.moneda,
            lineas: cot.lineas.map((l) => ({ plato: l.nombre, cantidad: l.cantidad, subtotal: l.subtotal })),
            subtotal: cot.subtotal, costo_envio: cot.envio, total: cot.total,
            pedido_minimo: tipo === 'delivery' ? cfg.pedidoMinimo : 0,
            cumple_minimo: tipo !== 'delivery' || cfg.pedidoMinimo <= 0 || cot.subtotal >= cfg.pedidoMinimo
        };
    },

    async crearPedido(args, ctx) {
        const tipo = args.tipo === 'para_llevar' ? 'para_llevar' : 'delivery';
        const tel = telefonoDe(ctx, args);
        if (!tel) throw new ErrorPublico('No tengo el teléfono del cliente. Pídele un número de contacto y vuelve a intentarlo con telefonoContacto.');
        const { formas, cfg } = await formasDePago();
        const metodo = String(args.metodoPago || '');
        if (!formas.includes(metodo)) throw new ErrorPublico(`Esa forma de pago no está disponible. Opciones: ${formas.join(', ')}`);
        const zona = tipo === 'delivery' ? await resolverZona(args.zona) : null;

        const connection = await db.getConnection();
        let r;
        try {
            await connection.beginTransaction();
            r = await delivery.crearPedido(connection, {
                items: args.items, tipo, nombre: args.nombre, telefono: tel, direccion: args.direccion, referencia: args.referencia,
                zonaId: zona ? zona.id : null, metodoPago: metodo, notas: args.notas,
                origen: ctx.canal === 'voz' ? 'voz' : 'whatsapp', usuario: nombreAgente(ctx), soloMenu: true
            });
            await connection.commit();
        } catch (e) {
            await connection.rollback().catch(() => {});
            throw e;
        } finally {
            connection.release();
        }
        await conversaciones.asociarPedido(ctx.conversacionId, r.pedido_id);

        const out = {
            ok: true, codigo: r.codigo, estado: 'por_confirmar', total: r.total, costo_envio: r.costo_envio,
            minutos_estimados: r.minutos_estimados, metodo_pago: metodo, moneda: cfg.moneda,
            mensaje: 'Pedido registrado. El restaurante lo confirma en unos minutos; avísale al cliente que recibirá la confirmación.'
        };
        let textoExtra = '';
        if (metodo === 'stripe') {
            try {
                const cobro = await delivery.cobroStripe(r.pedido_id, { baseUrl: ctx.baseUrl || process.env.APP_URL || '', usuario: nombreAgente(ctx) });
                out.enlace_pago = cobro.url;
                textoExtra = `Paga tu pedido ${r.codigo} de forma segura aquí: ${cobro.url}`;
            } catch (e) {
                console.error('No se pudo crear el enlace de pago del agente:', e.message);
                out.aviso_pago = 'No pude generar el enlace de pago. Dile al cliente que el restaurante se lo enviará por WhatsApp.';
            }
        } else if (metodo === 'transferencia') {
            out.datos_transferencia = cfg.datosTransferencia;
            out.indicacion_transferencia = 'Pídele que envíe la foto del comprobante por WhatsApp a este mismo número.';
            textoExtra = `Datos para tu transferencia (${r.codigo}, total ${r.total}):\n${cfg.datosTransferencia}\nEnvíanos aquí la foto del comprobante.`;
        }
        // En una llamada, el enlace o los datos bancarios se mandan por WhatsApp
        if (ctx.canal === 'voz' && textoExtra) {
            out.enviado_por_whatsapp = await notificaciones.enviarTexto(tel, textoExtra);
            if (!out.enviado_por_whatsapp) out.aviso_envio = 'No pude enviarlo por WhatsApp; dile que el restaurante se lo enviará enseguida.';
        }
        return out;
    },

    async estadoPedido(args, ctx) {
        const tel = telefonoDe(ctx);
        if (!tel) return { encontrado: false, nota: 'No tengo el teléfono del cliente.' };
        const e = await delivery.estadoPorTelefono(db, tel);
        return e ? { encontrado: true, ...e } : { encontrado: false, nota: 'No hay pedidos de delivery o para llevar en las últimas 24 horas con este teléfono.' };
    },

    async consultarDisponibilidadReserva(args) {
        const fh = reservas.armarFechaHora(args.fecha, args.hora);
        if (!fh) throw new ErrorPublico('Fecha u hora inválidas. Usa YYYY-MM-DD y HH:MM.');
        return reservas.disponibilidad(db, { fechaHora: fh, personas: args.personas });
    },

    async crearReserva(args, ctx) {
        const fh = reservas.armarFechaHora(args.fecha, args.hora);
        if (!fh) throw new ErrorPublico('Fecha u hora inválidas. Usa YYYY-MM-DD y HH:MM.');
        const tel = telefonoDe(ctx, args);
        if (!tel) throw new ErrorPublico('No tengo el teléfono del cliente. Pídele un número de contacto y usa telefonoContacto.');
        const r = await reservas.crear(db, { nombre: args.nombre, telefono: tel, personas: args.personas, fechaHora: fh, notas: args.notas, origen: ctx.canal === 'voz' ? 'voz' : 'whatsapp' });
        await db.query(
            `INSERT INTO mesa_alertas (tipo, mensaje) VALUES ('reserva_nueva', ?)`,
            [`${args.nombre} · ${Math.floor(Number(args.personas))} pers. · ${args.fecha} ${args.hora}`.slice(0, 300)]
        );
        return { ok: true, reserva_id: r.id, estado: 'pendiente', mensaje: 'Reserva registrada. El equipo la confirmará; avísale al cliente.' };
    },

    async cancelarReserva(args, ctx) {
        const tel = telefonoDe(ctx);
        if (!tel) throw new ErrorPublico('No tengo el teléfono del cliente para buscar su reserva.');
        const r = await reservas.cancelarProxima(db, tel, args.motivo);
        return { ok: true, cancelada: { nombre: r.nombre, personas: r.personas, fecha: r.fecha, hora: r.hora } };
    },

    async pasarAPersona(args, ctx) {
        const motivo = String(args.motivo || 'Solicitud de atención humana').slice(0, 300);
        const tel = telefonoDe(ctx) || 'desconocido';
        await db.query(`INSERT INTO mesa_alertas (tipo, mensaje) VALUES ('handoff', ?)`, [`${tel} (${ctx.canal}): ${motivo}`.slice(0, 500)]);
        if (ctx.conversacionId) {
            await conversaciones.marcarHumano(ctx.conversacionId, true);
            // En WhatsApp el bot se pausa para que el personal tome la conversación
            if (ctx.canal === 'whatsapp') await db.query('UPDATE agente_conversaciones SET bot_pausado = 1 WHERE id = ?', [ctx.conversacionId]);
        }
        const cfg = await delivery.getConfig(db);
        return {
            ok: true,
            telefono_humano: cfg.telefonoHumano || null,
            indicacion: ctx.canal === 'voz'
                ? 'Avisa al cliente que vas a pasarlo con una persona y transfiere la llamada si está disponible; si no, dile que le devolverán la llamada.'
                : 'Dile al cliente que una persona del equipo le escribirá en breve.'
        };
    }
};

/** Ejecuta una herramienta y SIEMPRE devuelve un objeto (los errores van como { error }). */
async function ejecutar(nombre, args, ctx = {}) {
    const fn = HANDLERS[nombre];
    if (!fn) return { error: `Herramienta desconocida: ${nombre}` };
    try {
        const r = await fn(args && typeof args === 'object' ? args : {}, ctx);
        if (ctx.conversacionId) {
            await conversaciones.agregarMensaje(ctx.conversacionId, 'herramienta', JSON.stringify({ args, resultado: r }).slice(0, 4000), nombre).catch(() => {});
        }
        return r;
    } catch (e) {
        if (e && e.publico) return { error: e.message };
        if (e && e.type && String(e.type).startsWith('Stripe')) return { error: 'No pude generar el pago en línea ahora mismo.' };
        console.error(`Error en la herramienta ${nombre}:`, e);
        return { error: 'No pude completar la operación en este momento. Ofrece que el equipo le ayude.' };
    }
}

module.exports = { ejecutar, HANDLERS, ahoraLocal, abiertoAhora };
