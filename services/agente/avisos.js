// Mensajes automáticos al cliente por WhatsApp (solo transaccionales; nunca masivos, para evitar bloqueos):
// pedido confirmado / en camino / entregado (con factura) / cancelado, pago recibido,
// reserva confirmada y recordatorio de reserva 2 horas antes.
// Todo es "fire and forget": un fallo de WhatsApp NUNCA debe romper un pedido, una factura o una reserva.
// Se puede apagar en Configuración → Asistentes IA (wa_avisos).
// Relacionado con: services/whatsapp.js, routes/delivery.js, routes/reservas.js, services/stripe.js, server.js
const db = require('../../db');
const wa = require('../whatsapp');
const delivery = require('../delivery');
const { formatoMoneda } = require('./prompt');
const { normalizar, ultimos10 } = require('../telefono');

async function habilitado() {
    const c = await wa.leerFila();
    return Number(c.wa_avisos ?? 1) === 1 && !!c.wa_instancia;
}

/** Idioma del cliente según sus últimos mensajes ('en' o 'es'; por defecto español). */
async function idiomaDe(telefono) {
    try {
        const [rows] = await db.query(
            `SELECT contenido FROM agente_mensajes m JOIN agente_conversaciones c ON c.id = m.conversacion_id
             WHERE m.rol = 'cliente' AND right(regexp_replace(c.telefono, '\\D', '', 'g'), 10) = ?
             ORDER BY m.id DESC LIMIT 3`,
            [ultimos10(telefono)]
        );
        const t = rows.map((r) => r.contenido).join(' ');
        const en = (t.match(/\b(the|and|please|hello|hi|order|delivery|thanks|thank|want|would|like|can|you|my)\b/gi) || []).length;
        const es = (t.match(/\b(el|la|los|por|favor|hola|gracias|pedido|quiero|quisiera|para|con|mi)\b/gi) || []).length;
        return en > es ? 'en' : 'es';
    } catch (_) { return 'es'; }
}

async function enviar(telefono, textos) {
    try {
        if (!normalizar(telefono) || !(await habilitado())) return false;
        const idioma = await idiomaDe(telefono);
        return await wa.enviarTexto(telefono, textos[idioma] || textos.es);
    } catch (e) {
        console.error('No se pudo enviar el aviso de WhatsApp:', e.message);
        return false;
    }
}

async function datosPedido(pedidoId) {
    const [rows] = await db.query(
        `SELECT p.id, p.tipo, p.total, p.cliente_telefono, p.repartidor, p.factura_id,
                (SELECT z.minutos_estimados FROM delivery_zonas z WHERE z.id = p.zona_id) AS min_zona
         FROM pedidos p WHERE p.id = ? AND p.tipo IN ('delivery','para_llevar')`,
        [pedidoId]
    );
    if (!rows[0]) return null;
    const cfg = await delivery.getConfig(db);
    return { ...rows[0], codigo: delivery.codigoPedido(rows[0].id, rows[0].tipo), cfg, total: Number(rows[0].total) };
}

/** evento: confirmado | en_camino | entregado | cancelado | pago */
async function pedido(pedidoId, evento) {
    try {
        const p = await datosPedido(pedidoId);
        if (!p || !p.cliente_telefono) return false;
        const money = formatoMoneda(p.total, p.cfg.moneda);
        const nombre = p.cfg.nombreNegocio;
        if (evento === 'confirmado') {
            const min = p.cfg.tiempoPreparacion + Number(p.min_zona || 0);
            return enviar(p.cliente_telefono, {
                es: `✅ ¡Tu pedido ${p.codigo} fue confirmado! Ya lo estamos preparando. Tiempo estimado: ${min} min. Total: ${money}.`,
                en: `✅ Your order ${p.codigo} is confirmed! We're preparing it now. Estimated time: ${min} min. Total: ${money}.`
            });
        }
        if (evento === 'en_camino') {
            return enviar(p.cliente_telefono, {
                es: `🛵 Tu pedido ${p.codigo} va en camino${p.repartidor ? ` con ${p.repartidor}` : ''}. ¡Buen provecho!`,
                en: `🛵 Your order ${p.codigo} is on its way${p.repartidor ? ` with ${p.repartidor}` : ''}. Enjoy your meal!`
            });
        }
        if (evento === 'cancelado') {
            return enviar(p.cliente_telefono, {
                es: `Lamentamos informarte que tu pedido ${p.codigo} fue cancelado. Si ya habías pagado, te devolveremos el dinero. Escríbenos por aquí si tienes dudas.`,
                en: `We're sorry, your order ${p.codigo} was cancelled. If you already paid, we'll refund you. Write to us here if you have questions.`
            });
        }
        if (evento === 'pago') {
            return enviar(p.cliente_telefono, {
                es: `💳 ¡Recibimos tu pago de ${money} del pedido ${p.codigo}! Gracias.`,
                en: `💳 We received your payment of ${money} for order ${p.codigo}. Thank you!`
            });
        }
        if (evento === 'entregado' && p.factura_id) {
            const [det] = await db.query(
                `SELECT pr.nombre, d.cantidad, d.subtotal FROM detalle_factura d JOIN productos pr ON pr.id = d.producto_id WHERE d.factura_id = ? ORDER BY d.id`,
                [p.factura_id]
            );
            const lineas = det.map((d) => `• ${Number(d.cantidad)} ${d.nombre} — ${formatoMoneda(d.subtotal, p.cfg.moneda)}`).join('\n');
            return enviar(p.cliente_telefono, {
                es: `Gracias por tu compra en ${nombre} 🙌\nFactura #${p.factura_id}\n${lineas}\n*Total: ${money}*`,
                en: `Thank you for your order at ${nombre} 🙌\nInvoice #${p.factura_id}\n${lineas}\n*Total: ${money}*`
            });
        }
    } catch (e) {
        console.error('Error al preparar el aviso del pedido:', e.message);
    }
    return false;
}

const fechaLegible = (fecha, idioma) => new Intl.DateTimeFormat(idioma === 'en' ? 'en-US' : 'es-DO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));

async function datosReserva(reservaId) {
    const [rows] = await db.query(
        `SELECT id, nombre, telefono, personas, to_char(fecha_hora, 'YYYY-MM-DD') AS fecha, to_char(fecha_hora, 'HH24:MI') AS hora
         FROM reservas WHERE id = ?`,
        [reservaId]
    );
    return rows[0] || null;
}

async function reservaConfirmada(reservaId) {
    try {
        const r = await datosReserva(reservaId);
        if (!r || !r.telefono) return false;
        const { nombreNegocio } = await delivery.getConfig(db);
        return enviar(r.telefono, {
            es: `✅ ¡Reserva confirmada! ${nombreNegocio}: ${r.personas} persona(s), ${fechaLegible(r.fecha, 'es')} a las ${r.hora}. ¡Te esperamos, ${r.nombre}!`,
            en: `✅ Reservation confirmed! ${nombreNegocio}: ${r.personas} guest(s), ${fechaLegible(r.fecha, 'en')} at ${r.hora}. See you soon, ${r.nombre}!`
        });
    } catch (e) { console.error('Error en el aviso de reserva:', e.message); return false; }
}

/** Envía el recordatorio de las reservas confirmadas que empiezan en ~2 horas (una sola vez). */
async function enviarRecordatorios() {
    if (!(await habilitado())) return 0;
    const [rows] = await db.query(
        `SELECT id FROM reservas
         WHERE estado = 'confirmada' AND recordatorio_enviado_at IS NULL AND telefono IS NOT NULL
           AND fecha_hora BETWEEN NOW() + interval '90 minutes' AND NOW() + interval '150 minutes'
         LIMIT 50`
    );
    let n = 0;
    for (const { id } of rows) {
        const r = await datosReserva(id);
        const { nombreNegocio } = await delivery.getConfig(db);
        const ok = await enviar(r.telefono, {
            es: `⏰ Recordatorio: hoy tienes reserva en ${nombreNegocio} a las ${r.hora} (${r.personas} persona(s)). Si no puedes venir, avísanos por aquí.`,
            en: `⏰ Reminder: you have a reservation at ${nombreNegocio} today at ${r.hora} (${r.personas} guest(s)). If you can't make it, let us know here.`
        });
        if (ok) {
            await db.query('UPDATE reservas SET recordatorio_enviado_at = NOW() WHERE id = ?', [id]);
            n++;
        }
    }
    return n;
}

let temporizador = null;
function iniciarRecordatorios() {
    if (temporizador) return;
    temporizador = setInterval(() => { enviarRecordatorios().catch((e) => console.error('Error en recordatorios:', e.message)); }, 5 * 60 * 1000);
    temporizador.unref();
}

module.exports = { pedido, reservaConfirmada, enviarRecordatorios, iniciarRecordatorios, idiomaDe };
