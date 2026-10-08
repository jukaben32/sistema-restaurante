const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Agente de voz (Vapi): webhook, herramientas, conversaciones y publicación (API de Vapi simulada)
// Se ejecuta DESPUÉS de smoke2.js y smoke3.js (usa sus datos)
process.chdir(ROOT);
const R = ROOT + '';
const db = require(R + 'db.js');
const TOKEN = process.env.VAPI_WEBHOOK_TOKEN;
const B = 'http://localhost:3000';
let fallos = 0;
const check = (c, m) => { if (!c) fallos++; console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); };

async function webhook(message, headers = { Authorization: `Bearer ${TOKEN}` }) {
  const r = await fetch(`${B}/api/vapi/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ message }) });
  const t = await r.text(); let d = t; try { d = JSON.parse(t); } catch (_) {}
  return { status: r.status, data: d };
}
const CALL = { id: 'call-test-1', type: 'inboundPhoneCall', customer: { number: '+18095557777' } };
async function tool(name, args = {}, call = CALL, forma = 'list') {
  const tc = { id: `t-${name}`, name, parameters: args };
  const msg = forma === 'list' ? { type: 'tool-calls', call, toolCallList: [tc] }
    : { type: 'tool-calls', call, toolWithToolCallList: [{ type: 'function', toolCall: { id: tc.id, type: 'function', function: { name, arguments: JSON.stringify(args) } } }] };
  const r = await webhook(msg);
  if (r.status !== 200 || !r.data.results) return { __http: r.status, __data: r.data };
  return JSON.parse(r.data.results[0].result);
}
const fechaFutura = (dias) => { const d = new Date(Date.now() + dias * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const diaDe = (f) => new Date(`${f}T12:00:00Z`).getUTCDay();
const fechaDonde = (pred, desde = 3) => { for (let i = desde; i < desde + 14; i++) { const x = fechaFutura(i); if (pred(diaDe(x))) return x; } };

(async () => {
  console.log('--- Seguridad del webhook ---');
  check((await webhook({ type: 'status-update' }, {})).status === 401, 'sin token: 401');
  check((await webhook({ type: 'status-update' }, { Authorization: 'Bearer incorrecto' })).status === 401, 'token incorrecto: 401');
  check((await webhook({ type: 'status-update', status: 'ringing', call: CALL })).status === 200, 'Bearer correcto: 200');
  check((await webhook({ type: 'status-update', status: 'in-progress', call: CALL }, { 'x-vapi-secret': TOKEN })).status === 200, 'X-Vapi-Secret correcto: 200');

  console.log('\n--- Herramientas por llamada (voz) ---');
  const id1 = await tool('identificarCliente');
  check(id1.conocido === false && id1.telefono_disponible === true, 'cliente nuevo no conocido');
  const info = await tool('infoRestaurante');
  check(Array.isArray(info.horario) && info.horario.length === 7 && info.delivery.zonas.length === 2 && typeof info.abierto_ahora === 'boolean', `info: horario, zonas y abierto_ahora=${info.abierto_ahora}`);
  check(info.formas_de_pago_delivery.includes('efectivo') && info.formas_de_pago_delivery.includes('transferencia'), `formas de pago: ${info.formas_de_pago_delivery}`);
  check(info.preguntas_frecuentes.length === 1, 'FAQ incluida');
  const menu = await tool('consultarMenu');
  const nombres = menu.platos.map((p) => p.nombre);
  check(nombres.includes('Pollo asado') && !nombres.includes('Plato fuera de la carta') && !nombres.includes('Costo de envío'), `menú solo con platos publicados (${nombres.length})`);
  const pollo = menu.platos.find((p) => p.nombre === 'Pollo asado');
  const refresco = menu.platos.find((p) => p.nombre === 'Refresco');
  const busq = await tool('consultarMenu', { busqueda: 'refre' });
  check(busq.platos.length === 1 && busq.platos[0].nombre === 'Refresco', 'búsqueda por palabra');
  check((await tool('consultarMenu', { busqueda: 'zzzz' })).platos.length === 0, 'búsqueda sin resultados');

  const cot = await tool('cotizarPedido', { tipo: 'delivery', zona: 'bavaro', items: [{ producto_id: pollo.id, cantidad: 2 }, { producto_id: refresco.id, cantidad: 1 }] });
  check(cot.total === 1450 && cot.costo_envio === 150 && cot.cumple_minimo === true, `cotización con zona sin acentos: ${cot.total}`);
  check(/Zonas disponibles/.test((await tool('cotizarPedido', { tipo: 'delivery', zona: 'Sosúa', items: [{ producto_id: pollo.id, cantidad: 1 }] })).error || ''), 'zona inexistente: error con las zonas disponibles');
  check(/zona/i.test((await tool('crearPedido', { tipo: 'delivery', nombre: 'Juan', direccion: 'Calle 1', metodoPago: 'efectivo', items: [{ producto_id: pollo.id, cantidad: 1 }] })).error || ''), 'delivery sin zona: pide la zona');
  check(/mínimo/.test((await tool('crearPedido', { tipo: 'delivery', zona: 'Bávaro', nombre: 'Juan', direccion: 'Calle 1, Bávaro', metodoPago: 'efectivo', items: [{ producto_id: refresco.id, cantidad: 1 }] })).error || ''), 'pedido bajo el mínimo: rechazado');
  check(/no están disponibles|no existen/.test((await tool('crearPedido', { tipo: 'delivery', zona: 'Bávaro', nombre: 'Juan', direccion: 'Calle 1, Bávaro', metodoPago: 'efectivo', items: [{ producto_id: 99999, cantidad: 1 }] })).error || ''), 'plato inexistente: rechazado');

  const ped = await tool('crearPedido', { tipo: 'delivery', zona: 'Bávaro', nombre: 'Juan Pérez', direccion: 'Hotel Barceló, Bávaro', referencia: 'Recepción', metodoPago: 'efectivo', items: [{ producto_id: pollo.id, cantidad: 2, nota: 'sin picante' }, { producto_id: refresco.id, cantidad: 1 }] }, CALL, 'wtl');
  check(ped.ok === true && ped.total === 1450 && ped.estado === 'por_confirmar' && /^DEL-\d+$/.test(ped.codigo), `pedido por voz creado (${ped.codigo}, total ${ped.total}) con argumentos en JSON string`);
  const [[dbp]] = await db.query(`SELECT origen, estado_delivery, mesero_nombre, cliente_telefono, metodo_pago_previsto FROM pedidos WHERE id = ?`, [Number(ped.codigo.split('-')[1])]);
  check(dbp.origen === 'voz' && dbp.estado_delivery === 'por_confirmar' && dbp.cliente_telefono === '18095557777' && dbp.mesero_nombre === 'Agente de voz', 'pedido guardado como voz / por confirmar / teléfono del llamante');
  const [al] = await db.query(`SELECT 1 FROM mesa_alertas WHERE tipo = 'pedido_delivery' AND atendida = 0 AND mensaje LIKE ?`, [`${ped.codigo}%`]);
  check(al.length === 1, 'el personal recibe el aviso del pedido');
  const id2 = await tool('identificarCliente');
  check(id2.conocido === true && id2.nombre === 'Juan Pérez' && /Barceló/.test(id2.direccion_habitual) && id2.pedido_reciente && id2.pedido_reciente.codigo === ped.codigo, 'ahora lo reconoce: nombre, dirección habitual y pedido reciente');
  const est = await tool('estadoPedido');
  check(est.encontrado === true && est.estado === 'por_confirmar', 'estado del pedido');

  const stripe = await tool('crearPedido', { tipo: 'para_llevar', nombre: 'Juan', metodoPago: 'stripe', items: [{ producto_id: pollo.id, cantidad: 1 }] });
  check(stripe.ok === true && /enlace de pago/.test(stripe.aviso_pago || ''), 'pago con tarjeta: si Stripe falla, el agente recibe instrucciones (no se rompe)');
  const transf = await tool('crearPedido', { tipo: 'para_llevar', nombre: 'Juan', metodoPago: 'transferencia', items: [{ producto_id: pollo.id, cantidad: 1 }] });
  check(transf.ok === true && /Banco Popular/.test(transf.datos_transferencia) && transf.enviado_por_whatsapp === false && !!transf.aviso_envio, 'transferencia: datos bancarios y aviso si WhatsApp no está conectado');

  console.log('\n--- Reservas por voz ---');
  const f = fechaDonde((d) => d !== 1);
  check((await tool('consultarDisponibilidadReserva', { fecha: f, hora: '20:00', personas: 4 })).disponible === true, 'hay disponibilidad a las 20:00');
  const fueraHora = await tool('consultarDisponibilidadReserva', { fecha: f, hora: '05:00', personas: 2 });
  check(fueraHora.disponible === false && /atendemos/.test(fueraHora.motivo), `fuera de horario: ${fueraHora.motivo}`);
  const lunes = fechaDonde((d) => d === 1, 2);
  check(/cerrado/.test((await tool('consultarDisponibilidadReserva', { fecha: lunes, hora: '20:00', personas: 2 })).motivo || ''), 'lunes cerrado');
  check(/personas/i.test((await tool('consultarDisponibilidadReserva', { fecha: f, hora: '20:00', personas: 100 })).error || ''), 'personas fuera de rango');
  check(/anticipación/.test((await tool('consultarDisponibilidadReserva', { fecha: '2020-01-01', hora: '20:00', personas: 2 })).motivo || ''), 'fecha pasada');
  const res1 = await tool('crearReserva', { nombre: 'Juan Pérez', fecha: f, hora: '20:00', personas: 50, notas: 'Cumpleaños' });
  check(res1.ok === true && res1.estado === 'pendiente', 'reserva creada pendiente');
  const lleno = await tool('crearReserva', { nombre: 'Otro', fecha: f, hora: '20:30', personas: 20 });
  check(/cupo lleno/.test(lleno.error || ''), `cupo: 50 + 20 > 60 se rechaza (${lleno.error})`);
  const [[rv]] = await db.query(`SELECT origen, estado, telefono FROM reservas WHERE id = ?`, [res1.reserva_id]);
  check(rv.origen === 'voz' && rv.estado === 'pendiente' && rv.telefono === '18095557777', 'reserva guardada como voz / pendiente');
  check((await db.query(`SELECT 1 FROM mesa_alertas WHERE tipo = 'reserva_nueva' AND atendida = 0`))[0].length === 1, 'aviso de reserva nueva');
  check((await tool('cancelarReserva', { motivo: 'cambio de planes' })).ok === true, 'reserva cancelada por el cliente');
  check(/No encuentro/.test((await tool('cancelarReserva')).error || ''), 'sin reservas activas: error claro');

  console.log('\n--- Atención humana, errores y llamada sin número ---');
  const h = await tool('pasarAPersona', { motivo: 'Alergia severa a mariscos, quiere hablar con el chef' });
  check(h.ok === true && /transfiere/.test(h.indicacion) && h.telefono_humano === '809-555-9999', 'pasar a persona (voz): indicación de transferir');
  check((await db.query(`SELECT 1 FROM mesa_alertas WHERE tipo = 'handoff' AND atendida = 0`))[0].length === 1, 'aviso de atención humana');
  check((await tool('herramientaInventada')).error?.includes('desconocida'), 'herramienta desconocida: error controlado');
  const sinNum = await tool('crearPedido', { tipo: 'para_llevar', nombre: 'Web', metodoPago: 'efectivo', items: [{ producto_id: pollo.id, cantidad: 1 }] }, { id: 'call-web', type: 'webCall' });
  check(/teléfono/.test(sinNum.error || ''), 'llamada web sin número: pide contacto');
  const conNum = await tool('crearPedido', { tipo: 'para_llevar', nombre: 'Web', telefonoContacto: '829-555-0000', metodoPago: 'efectivo', items: [{ producto_id: pollo.id, cantidad: 1 }] }, { id: 'call-web', type: 'webCall' });
  check(conNum.ok === true, 'con telefonoContacto crea el pedido');

  console.log('\n--- Cierre de llamada: resumen y transcripción ---');
  const [[cv0]] = await db.query(`SELECT necesita_humano, pedido_id FROM agente_conversaciones WHERE external_id = 'call-test-1'`);
  check(cv0.necesita_humano === 1 && cv0.pedido_id !== null, 'conversación marcada para humano y ligada al pedido');
  const reporte = { type: 'end-of-call-report', endedReason: 'customer-ended-call', call: CALL, cost: 0.42, durationSeconds: 187,
    analysis: { summary: 'El cliente pidió 2 pollos y un refresco para delivery en Bávaro.' },
    artifact: { recordingUrl: 'https://example.com/rec.wav', messages: [
      { role: 'system', message: 'prompt' }, { role: 'bot', message: 'Hola, Restaurant Martin' }, { role: 'user', message: 'Quiero pedir comida' }, { role: 'tool_calls', toolCalls: [] }, { role: 'bot', message: 'Claro' }] } };
  check((await webhook(reporte)).status === 200, 'end-of-call-report aceptado');
  await webhook(reporte);
  const [[cv]] = await db.query(`SELECT * FROM agente_conversaciones WHERE external_id = 'call-test-1'`);
  const [msgs] = await db.query(`SELECT rol FROM agente_mensajes WHERE conversacion_id = ? AND rol IN ('agente','cliente') ORDER BY id`, [cv.id]);
  check(cv.estado === 'finalizada' && /pollos/.test(cv.resumen) && cv.duracion_seg === 187 && cv.costo === 0.42 && cv.grabacion_url === 'https://example.com/rec.wav', 'resumen, duración, costo y grabación guardados');
  check(msgs.length === 3 && msgs[0].rol === 'agente' && msgs[1].rol === 'cliente', 'transcripción turno a turno, sin duplicar si el informe llega dos veces');

  console.log('\n--- Prompt y formatos de herramientas ---');
  const { construirPrompt } = require(R + 'services/agente/prompt.js');
  const pv = await construirPrompt('voz');
  const pt = await construirPrompt('texto');
  check(pv.includes('{{"now" | date:') && !pt.includes('{{"now"'), 'voz usa fecha Liquid de Vapi; texto calcula la fecha');
  check(/idioma en que te habla/i.test(pv) && pv.includes('Bávaro') && pv.includes('Cap Cana') && pv.includes('Parqueo') === false && pv.includes('¿Tienen parqueo?'), 'prompt: idioma automático + zonas + FAQ reales');
  check(!/undefined|\bnull\b/.test(pv) && !/undefined|\bnull\b/.test(pt), 'prompts sin "undefined" ni "null"');
  check(pv.length > 3000 && pv.length < 12000, `tamaño del prompt razonable (${pv.length} caracteres)`);
  const H = require(R + 'services/agente/herramientas.js');
  check(H.paraOpenAI().length === 10 && H.paraOpenAI().every((t) => t.type === 'function' && t.function.parameters.type === 'object'), '10 herramientas en formato OpenAI');
  check(H.HERRAMIENTAS.every((t) => !JSON.stringify(t.parameters).includes('"telefono"')), 'ninguna herramienta pide el teléfono (solo telefonoContacto de respaldo)');

  console.log('\n--- Publicación en Vapi (API simulada) ---');
  const vapiSvc = require(R + 'services/vapi.js');
  const llamadas = [];
  let n = 0;
  const fetchReal = global.fetch;
  global.fetch = async (url, opts = {}) => {
    llamadas.push({ url: String(url), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers && opts.headers.Authorization });
    const id = String(url).includes('/assistant') ? 'asst_1' : `tool_${++n}`;
    return { ok: true, status: 200, text: async () => JSON.stringify({ id }) };
  };
  try {
    process.env.VAPI_API_KEY = 'vapi_test_key';
    delete process.env.APP_URL;
    await vapiSvc.publicar().then(() => check(false, 'sin APP_URL https debía fallar'), (e) => check(/https/.test(e.message), 'sin APP_URL https: error claro'));
    process.env.APP_URL = 'https://pos.example.com';
    const p1 = await vapiSvc.publicar();
    const tcreadas = llamadas.filter((c) => c.url.endsWith('/tool') && c.method === 'POST');
    const aCrear = llamadas.find((c) => c.url.endsWith('/assistant') && c.method === 'POST');
    check(tcreadas.length === 11 && p1.herramientas.creadas.length === 11, `primera publicación: 11 herramientas (10 + transferencia) creadas`);
    check(tcreadas.every((c) => c.auth === 'Bearer vapi_test_key' && (c.body.type === 'transferCall' || c.body.server.url === 'https://pos.example.com/api/vapi/webhook')), 'herramientas apuntan al webhook https con la llave de Vapi');
    check(tcreadas.filter((c) => c.body.type === 'function').every((c) => c.body.server.headers.Authorization === `Bearer ${TOKEN}`), 'el token del webhook viaja en la cabecera Authorization');
    const tr = tcreadas.find((c) => c.body.type === 'transferCall');
    check(tr && tr.body.destinations[0].number === '+18095559999' && tr.body.destinations[0].type === 'number', `transferencia a ${tr && tr.body.destinations[0].number}`);
    check(aCrear && aCrear.body.transcriber.language === 'multi' && aCrear.body.voice.language === 'auto' && aCrear.body.model.toolIds.length === 11, 'asistente nuevo: idioma automático (Deepgram multi + voz auto) y 11 toolIds');
    check(aCrear.body.model.messages[0].role === 'system' && aCrear.body.model.messages[0].content.includes('Restaurant Martin') && aCrear.body.name.length <= 40 && aCrear.body.model.tools[0].type === 'endCall', 'prompt de sistema, nombre ≤ 40 y endCall');
    check(aCrear.body.serverMessages.join() === 'tool-calls,end-of-call-report,status-update' && aCrear.body.maxDurationSeconds === 600, 'serverMessages y duración máxima');
    const [[cfgA]] = await db.query('SELECT vapi_assistant_id, vapi_publicado_at FROM agentes_config WHERE id = 1');
    check(cfgA.vapi_assistant_id === 'asst_1' && cfgA.vapi_publicado_at, 'asistente y fecha de publicación guardados');

    llamadas.length = 0;
    const p2 = await vapiSvc.publicar();
    const patchA = llamadas.find((c) => c.url.endsWith('/assistant/asst_1') && c.method === 'PATCH');
    check(llamadas.filter((c) => c.url.includes('/tool')).length === 0 && p2.herramientas.sinCambios.length === 11, 'segunda publicación: herramientas sin cambios no se vuelven a enviar');
    check(patchA && !patchA.body.voice && !patchA.body.transcriber, 'al actualizar NO se pisa la voz ni el transcriptor (se pueden ajustar en Vapi)');

    llamadas.length = 0;
    await db.query(`UPDATE configuracion_impresion SET telefono_humano = '829-555-1111'`);
    const p3 = await vapiSvc.publicar();
    check(p3.herramientas.actualizadas.join() === 'transferirAPersona' && llamadas.some((c) => c.method === 'PATCH' && c.body && c.body.destinations && c.body.destinations[0].number === '+18295551111'), 'al cambiar el teléfono humano solo se actualiza la transferencia');
    await db.query(`UPDATE agentes_config SET vapi_phone_number_id = 'pn_123' WHERE id = 1`);
    llamadas.length = 0;
    await vapiSvc.publicar();
    check(llamadas.some((c) => c.url.endsWith('/phone-number/pn_123') && c.body.assistantId === 'asst_1'), 'el número de Vapi se vincula al asistente');
  } finally { global.fetch = fetchReal; }

  console.log(`\n==== ${fallos === 0 ? 'TODO OK' : fallos + ' FALLO(S)'} ====`);
  await db.end();
  process.exit(fallos === 0 ? 0 : 1);
})().catch(async (e) => { console.error('ERROR', e); await db.end(); process.exit(1); });
