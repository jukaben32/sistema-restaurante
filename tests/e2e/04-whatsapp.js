const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// WhatsApp (Evolution API) + agente de texto + avisos + bandeja, con Evolution y OpenAI SIMULADOS.
// El servidor debe haberse iniciado con: EVOLUTION_API_URL=http://localhost:4801 EVOLUTION_API_KEY=globalkey
//   OPENAI_API_KEY=test OPENAI_BASE_URL=http://localhost:4802/v1 APP_URL=https://pos.example.com WA_PAUSA_MIN_MS=0 WA_PAUSA_MAX_MS=0
// Se ejecuta DESPUÉS de smoke2, smoke3 y smoke4.
process.chdir(ROOT);
process.env.EVOLUTION_API_URL = 'http://localhost:4801';
process.env.EVOLUTION_API_KEY = 'globalkey';
process.env.OPENAI_API_KEY = 'test';
process.env.OPENAI_BASE_URL = 'http://localhost:4802/v1';
process.env.APP_URL = 'https://pos.example.com';
const R = ROOT + '';
const http = require('http');
const db = require(R + 'db.js');
const { decrypt } = require(R + 'services/crypto.js');
const B = 'http://localhost:3000';
let fallos = 0;
const check = (c, m) => { if (!c) fallos++; console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); };
const esperar = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const r = await fn(); if (r) return r; await new Promise((x) => setTimeout(x, 80)); } return null; };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Evolution API falso ----------
const evo = { estado: 'close', enviados: [], webhookUrl: null, creadas: 0, borradas: 0, errores: [], n: 0 };
const servidorEvo = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const key = req.headers.apikey;
    const json = (o, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const url = req.url;
    const necesitaGlobal = url.startsWith('/instance/create') || url.startsWith('/instance/logout') || url.startsWith('/instance/delete');
    if (necesitaGlobal ? key !== 'globalkey' : key !== 'tok123') { evo.errores.push(`${req.method} ${url} apikey incorrecta`); return json({ error: 'unauthorized' }, 401); }
    const b = body ? JSON.parse(body) : {};
    if (url === '/instance/create') { evo.creadas++; return json({ instance: { instanceName: b.instanceName }, hash: 'tok123', qrcode: { base64: 'data:image/png;base64,QR1' } }); }
    if (url.startsWith('/webhook/set/')) { evo.webhookUrl = b.url; evo.webhookEventos = b.events; return json({ ok: true }); }
    if (url.startsWith('/instance/connect/')) return json({ base64: 'data:image/png;base64,QR2' });
    if (url.startsWith('/instance/connectionState/')) return json({ instance: { state: evo.estado } });
    if (url.startsWith('/message/sendText/')) { evo.enviados.push({ number: b.number, text: b.text }); return json({ key: { id: `sent-${++evo.n}` } }); }
    if (url.startsWith('/instance/logout/') || url.startsWith('/instance/delete/')) { if (url.includes('delete')) evo.borradas++; return json({}); }
    json({ error: 'not found' }, 404);
  });
});

// ---------- OpenAI falso ----------
const oa = { cola: [], peticiones: [], fallar: false };
const servidorOa = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    oa.peticiones.push(b);
    if (oa.fallar) { res.writeHead(500); return res.end('boom'); }
    const sig = oa.cola.shift() || { content: 'Respuesta de prueba' };
    const message = sig.tool ? { role: 'assistant', content: null, tool_calls: [{ id: `call_${oa.peticiones.length}`, type: 'function', function: { name: sig.tool, arguments: JSON.stringify(sig.args || {}) } }] } : { role: 'assistant', content: sig.content };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message }] }));
  });
});

async function jarLogin(usuario, password) {
  const j = { cookie: '' };
  const r = await fetch(`${B}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ usuario, password }).toString(), redirect: 'manual' });
  j.cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  return j;
}
async function api(j, method, path, body, expect) {
  const r = await fetch(B + path, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json', Cookie: j.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let d = t; try { d = JSON.parse(t); } catch (_) {}
  if (expect !== undefined && r.status !== expect) { fallos++; console.log(`FAIL ${method} ${path} -> ${r.status} (esperaba ${expect}) ${String(t).slice(0, 100)}`); }
  return { status: r.status, data: d };
}
let secreto = null;
async function entrante(data, tipoEvento = 'messages.upsert') {
  const r = await fetch(`${B}/api/whatsapp/webhook/${secreto}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: tipoEvento, instance: 'x', data }) });
  return r.status;
}
const texto = (id, tel, t, extra = {}) => ({ key: { remoteJid: `${tel}@s.whatsapp.net`, fromMe: false, id }, pushName: extra.pushName || 'Cliente', message: { conversation: t } });

(async () => {
  await new Promise((r) => servidorEvo.listen(4801, r));
  await new Promise((r) => servidorOa.listen(4802, r));
  const admin = await jarLogin('admin', 'Prueba#2026');
  const mesero = await jarLogin('mesero1', 'Mesero#2026');
  const cocinero = await jarLogin('cocina1', 'Cocina#2026');
  const [prods] = await db.query(`SELECT id, nombre FROM productos WHERE nombre IN ('Pollo asado','Refresco')`);
  const pollo = prods.find((p) => p.nombre === 'Pollo asado').id;
  const enviosA = (tel) => evo.enviados.filter((e) => e.number === tel);

  console.log('--- Conexión de WhatsApp (Evolution simulado) ---');
  const e0 = await api(admin, 'GET', '/api/ia/estado', undefined, 200);
  check(e0.data.whatsapp.creada === false && e0.data.whatsapp.evolution_configurado === true && e0.data.whatsapp.openai_api_key === true, 'estado inicial: sin instancia, Evolution y OpenAI configurados');
  await api(mesero, 'GET', '/api/ia/estado', undefined, 403);
  const cr = await api(admin, 'POST', '/api/ia/whatsapp/crear', {}, 200);
  check(cr.data.qr === 'data:image/png;base64,QR1' && /^restaurant-martin-/.test(cr.data.instancia), 'instancia creada y QR devuelto');
  const [[fila]] = await db.query('SELECT wa_token_enc, wa_secreto_enc, wa_estado FROM agentes_config WHERE id = 1');
  secreto = decrypt(fila.wa_secreto_enc);
  check(fila.wa_token_enc.startsWith('v1:') && decrypt(fila.wa_token_enc) === 'tok123' && !fila.wa_token_enc.includes('tok123'), 'token de la instancia guardado cifrado');
  check(evo.webhookUrl === `https://pos.example.com/api/whatsapp/webhook/${secreto}` && evo.webhookEventos.includes('MESSAGES_UPSERT'), 'webhook configurado con el secreto en la URL');
  await api(admin, 'POST', '/api/ia/whatsapp/crear', {}, 400);
  evo.estado = 'connecting';
  const q = await api(admin, 'GET', '/api/ia/estado?qr=1', undefined, 200);
  check(q.data.whatsapp.estado === 'connecting' && q.data.whatsapp.qr === 'data:image/png;base64,QR2', 'mientras no se conecta: devuelve QR actualizado');
  evo.estado = 'open';
  check((await api(admin, 'GET', '/api/ia/estado', undefined, 200)).data.whatsapp.estado === 'open', 'conectado (open)');
  await api(admin, 'PUT', '/api/ia/config', { wa_activo: 1, wa_avisos: 1, wa_instrucciones: 'Menciona la música en vivo de los viernes.' }, 200);
  const prm = await api(admin, 'GET', '/api/ia/prompt?canal=texto', undefined, 200);
  check(prm.data.prompt.includes('música en vivo') && prm.data.prompt.includes('Instrucciones del restaurante'), 'instrucciones adicionales entran al prompt');
  const ok = await api(admin, 'POST', '/api/ia/whatsapp/probar', { telefono: '829-555-0000' }, 200);
  check(enviosA('18295550000').length === 1 && /Prueba/.test(enviosA('18295550000')[0].text), 'mensaje de prueba enviado');

  console.log('\n--- Seguridad del webhook ---');
  const mal = await fetch(`${B}/api/whatsapp/webhook/incorrecto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check(mal.status === 404, 'secreto incorrecto: 404');
  const sin = await fetch(`${B}/api/whatsapp/webhook/${secreto}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check(sin.status === 200, 'secreto correcto: 200');

  console.log('\n--- Conversación en inglés: menú con herramienta ---');
  oa.cola = [{ tool: 'consultarMenu', args: {} }, { content: 'We have roast chicken (Pollo asado) and soft drinks. What would you like?' }];
  check(await entrante(texto('MSG1', '18095551111', 'Hi, what is on the menu?', { pushName: 'Mike' })) === 200, 'mensaje entrante aceptado al instante');
  const r1 = await esperar(() => enviosA('18095551111')[0]);
  check(r1 && /roast chicken/.test(r1.text), 'el asistente responde en inglés por WhatsApp');
  check(oa.peticiones.length === 2 && oa.peticiones[0].tools.length === 10 && oa.peticiones[0].messages[0].role === 'system' && oa.peticiones[0].messages[0].content.includes('Restaurant Martin'), 'OpenAI recibe el prompt del restaurante y las 10 herramientas');
  check(oa.peticiones[1].messages.some((m) => m.role === 'tool' && m.content.includes('Pollo asado')), 'la herramienta consultarMenu devolvió el menú real al modelo');
  const [[cv]] = await db.query(`SELECT id, canal, nombre, estado FROM agente_conversaciones WHERE telefono = '18095551111'`);
  const [ms] = await db.query(`SELECT rol FROM agente_mensajes WHERE conversacion_id = ? ORDER BY id`, [cv.id]);
  check(cv.canal === 'whatsapp' && cv.nombre === 'Mike' && ms.map((m) => m.rol).join() === 'cliente,herramienta,agente', `historial guardado: ${ms.map((m) => m.rol)}`);
  await entrante(texto('MSG1', '18095551111', 'Hi, what is on the menu?'));
  await pausa(600);
  check(enviosA('18095551111').length === 1, 'mensaje repetido (mismo id): no responde dos veces');

  console.log('\n--- Pedido por WhatsApp y avisos automáticos en el idioma del cliente ---');
  oa.cola = [{ tool: 'crearPedido', args: { tipo: 'delivery', zona: 'Bávaro', nombre: 'Mike', direccion: 'Hotel Riu, Bávaro', metodoPago: 'efectivo', items: [{ producto_id: pollo, cantidad: 2 }] } }, { content: 'Done! Your order is registered and the restaurant will confirm it shortly.' }];
  await entrante(texto('MSG2', '18095551111', 'I want 2 roast chickens delivered please'));
  await esperar(() => enviosA('18095551111').length >= 2);
  const [[pw]] = await db.query(`SELECT id, origen, estado_delivery, mesero_nombre, cliente_telefono FROM pedidos WHERE cliente_telefono = '18095551111'`);
  check(pw && pw.origen === 'whatsapp' && pw.estado_delivery === 'por_confirmar' && pw.mesero_nombre === 'Agente WhatsApp', `pedido de WhatsApp creado por confirmar (DEL-${pw && pw.id})`);
  const [[cv2]] = await db.query(`SELECT pedido_id FROM agente_conversaciones WHERE id = ?`, [cv.id]);
  check(cv2.pedido_id === pw.id, 'la conversación queda ligada al pedido');
  await api(mesero, 'POST', `/api/delivery/${pw.id}/confirmar`, {}, 200);
  const aviso1 = await esperar(() => enviosA('18095551111').find((e) => /confirmed/.test(e.text)));
  check(aviso1 && aviso1.text.includes(`DEL-${pw.id}`), `aviso de pedido confirmado EN INGLÉS: ${aviso1 && aviso1.text.slice(0, 60)}`);
  await db.query(`UPDATE pedido_items SET estado = 'listo' WHERE pedido_id = ? AND estado = 'enviado'`, [pw.id]);
  await api(mesero, 'POST', `/api/delivery/${pw.id}/en-camino`, {}, 200);
  check(await esperar(() => enviosA('18095551111').find((e) => /on its way/.test(e.text))), 'aviso "en camino"');
  await api(mesero, 'POST', `/api/delivery/${pw.id}/entregar`, {}, 200);
  const fact = await esperar(() => enviosA('18095551111').find((e) => /Invoice #/.test(e.text)));
  check(fact && /2 Pollo asado/.test(fact.text) && /Total/.test(fact.text), 'factura enviada por WhatsApp al entregar');

  console.log('\n--- Comprobantes, audios y toma de control humana ---');
  const ejecutor = require(R + 'services/agente/ejecutor.js');
  const t = await ejecutor.ejecutar('crearPedido', { tipo: 'para_llevar', nombre: 'Ana', metodoPago: 'transferencia', items: [{ producto_id: pollo, cantidad: 1 }] }, { canal: 'whatsapp', telefono: '18095552222' });
  check(t.ok === true, 'pedido por transferencia (para el comprobante)');
  await entrante({ key: { remoteJid: '18095552222@s.whatsapp.net', fromMe: false, id: 'IMG1' }, pushName: 'Ana', message: { imageMessage: { caption: '' } } });
  const rc = await esperar(() => enviosA('18095552222').find((e) => /comprobante|payment proof/.test(e.text)));
  check(!!rc, 'foto de cliente con transferencia pendiente: confirma recepción');
  check((await db.query(`SELECT 1 FROM mesa_alertas WHERE tipo = 'comprobante' AND atendida = 0`))[0].length === 1, 'el personal recibe el aviso de comprobante');
  await entrante({ key: { remoteJid: '18095553333@s.whatsapp.net', fromMe: false, id: 'AUD1' }, message: { audioMessage: {} } });
  check(await esperar(() => enviosA('18095553333').find((e) => /audios|voice notes/.test(e.text))), 'nota de voz: pide escribir');
  check(oa.peticiones.length === 4, 'fotos y audios no gastan llamadas a OpenAI');

  const antes = evo.enviados.length;
  await entrante({ key: { remoteJid: '18095551111@s.whatsapp.net', fromMe: true, id: 'HUMANO1' }, message: { conversation: 'Hola Mike, soy Pedro del restaurante, ¿todo bien con el pedido?' } });
  await esperar(async () => (await db.query('SELECT bot_pausado FROM agente_conversaciones WHERE id = ?', [cv.id]))[0][0].bot_pausado === 1, 4000);
  const [[cvP]] = await db.query('SELECT bot_pausado FROM agente_conversaciones WHERE id = ?', [cv.id]);
  const [pers] = await db.query(`SELECT contenido FROM agente_mensajes WHERE conversacion_id = ? AND rol = 'personal'`, [cv.id]);
  check(cvP.bot_pausado === 1 && pers.length === 1, 'una persona escribe desde el teléfono: el bot se pausa y queda registrado');
  const peticionesAntes = oa.peticiones.length;
  await entrante(texto('MSG3', '18095551111', 'Thanks Pedro, all good!'));
  await pausa(700);
  check(evo.enviados.length === antes && oa.peticiones.length === peticionesAntes, 'con el bot pausado, el cliente escribe y el asistente NO responde');
  check((await api(cocinero, 'GET', '/api/conversaciones', undefined, 403)).status === 403, 'cocinero no accede a conversaciones');
  await api(mesero, 'POST', `/api/conversaciones/${cv.id}/pausa`, { pausado: false }, 200);
  oa.cola = [{ content: 'You are welcome, Mike! Anything else?' }];
  await entrante(texto('MSG4', '18095551111', 'One more question about dessert'));
  check(await esperar(() => enviosA('18095551111').find((e) => /You are welcome/.test(e.text))), 'al devolver al asistente, vuelve a responder');

  console.log('\n--- Bandeja de conversaciones ---');
  const lst = await api(mesero, 'GET', '/api/conversaciones', undefined, 200);
  check(lst.data.length >= 3 && lst.data.some((c) => c.pedido_codigo === `DEL-${pw.id}`), `lista de conversaciones (${lst.data.length}) con el pedido ligado`);
  const det = await api(mesero, 'GET', `/api/conversaciones/${cv.id}`, undefined, 200);
  check(det.data.mensajes.some((m) => m.rol === 'herramienta' && m.contenido === 'crearPedido') && det.data.mensajes.some((m) => m.rol === 'personal'), 'detalle: mensajes, herramientas usadas y respuestas del personal');
  const antes2 = enviosA('18095551111').length;
  await api(mesero, 'POST', `/api/conversaciones/${cv.id}/responder`, { texto: 'Perfecto, ¡buen provecho!' }, 200);
  check(enviosA('18095551111').length === antes2 + 1 && enviosA('18095551111').pop().text === 'Perfecto, ¡buen provecho!', 'el personal responde desde el POS por WhatsApp');
  const [[cvQ]] = await db.query('SELECT bot_pausado FROM agente_conversaciones WHERE id = ?', [cv.id]);
  check(cvQ.bot_pausado === 1, 'al responder una persona, el asistente queda pausado');
  await api(mesero, 'POST', `/api/conversaciones/${cv.id}/responder`, { texto: '' }, 400);

  console.log('\n--- Atención humana por herramienta, fallo de OpenAI y freno anti-abuso ---');
  oa.cola = [{ tool: 'pasarAPersona', args: { motivo: 'Alergia a mariscos' } }, { content: 'Una persona del equipo te escribirá enseguida.' }];
  await entrante(texto('MSG5', '18095554444', 'Tengo alergia severa, quiero hablar con alguien'));
  await esperar(() => enviosA('18095554444').length >= 1);
  const [[cvH]] = await db.query(`SELECT bot_pausado, necesita_humano FROM agente_conversaciones WHERE telefono = '18095554444'`);
  check(cvH.bot_pausado === 1 && cvH.necesita_humano === 1, 'pasarAPersona en WhatsApp: pausa al bot y marca "necesita una persona"');
  const hum = await api(mesero, 'GET', '/api/conversaciones?filtro=humano', undefined, 200);
  check(hum.data.length >= 1 && hum.data.every((c) => c.necesita_humano === 1), 'filtro "necesitan una persona"');

  oa.fallar = true;
  await entrante(texto('MSG6', '18095555555', 'Hola'));
  const rf = await esperar(() => enviosA('18095555555')[0]);
  check(rf && /problema|problem/i.test(rf.text), 'si OpenAI falla, el cliente recibe un mensaje de respaldo');
  check((await db.query(`SELECT 1 FROM agente_conversaciones WHERE telefono = '18095555555' AND necesita_humano = 1`))[0].length === 1, 'y la conversación queda marcada para una persona');
  oa.fallar = false;

  oa.cola = [];
  for (let i = 0; i < 28; i++) await entrante(texto(`SPAM${i}`, '18095556666', `mensaje ${i}`));
  // Espera a que la cola termine (el contador deja de crecer)
  let previo = -1, estable = 0;
  for (let i = 0; i < 200 && estable < 12; i++) { await pausa(250); const n = enviosA('18095556666').length; estable = n === previo ? estable + 1 : 0; previo = n; }
  const resp = enviosA('18095556666').length;
  check(resp === 25, `freno anti-abuso: de 28 mensajes seguidos solo se atienden ${resp} (tope 25)`);

  console.log('\n--- Reservas: confirmación y recordatorio por WhatsApp ---');
  const avisos = require(R + 'services/agente/avisos.js');
  const man = new Date(Date.now() + 2 * 86400000); const fm = `${man.getFullYear()}-${String(man.getMonth() + 1).padStart(2, '0')}-${String(man.getDate()).padStart(2, '0')}`;
  const [rIns] = await db.query(`INSERT INTO reservas (nombre, telefono, personas, fecha_hora, estado, origen) VALUES ('Mike', '18095551111', 3, ?, 'pendiente', 'whatsapp')`, [`${fm}T20:00`]);
  await api(mesero, 'PUT', `/api/reservas/${rIns.insertId}/estado`, { estado: 'confirmada' }, 200);
  const rcf = await esperar(() => enviosA('18095551111').find((e) => /Reservation confirmed/.test(e.text)));
  check(rcf && /3 guest/.test(rcf.text), 'confirmación de reserva enviada en inglés');
  const [rr] = await db.query(`INSERT INTO reservas (nombre, telefono, personas, fecha_hora, estado, origen) VALUES ('Luis', '18095557777', 2, NOW() + interval '2 hours', 'confirmada', 'interno')`);
  const n1 = await avisos.enviarRecordatorios();
  const n2 = await avisos.enviarRecordatorios();
  check(n1 === 1 && n2 === 0 && enviosA('18095557777').some((e) => /Recordatorio|Reminder/.test(e.text)), `recordatorio 2 h antes: se envía una sola vez (${n1}, luego ${n2})`);
  await db.query('UPDATE agentes_config SET wa_avisos = 0 WHERE id = 1');
  const pre = enviosA('18095551111').length;
  await avisos.pedido(pw.id, 'cancelado');
  await pausa(500);
  check(enviosA('18095551111').length === pre, 'con los avisos apagados no se envía nada');
  await db.query('UPDATE agentes_config SET wa_avisos = 1 WHERE id = 1');
  await avisos.pedido(pw.id, 'cancelado');
  check(enviosA('18095551111').length === pre + 1 && /cancelled/.test(enviosA('18095551111').pop().text), 'con los avisos activos sí se envía (en inglés)');
  await db.query('UPDATE agentes_config SET wa_avisos = 0 WHERE id = 1');
  await db.query('UPDATE agentes_config SET wa_avisos = 1 WHERE id = 1');

  console.log('\n--- Desconexión ---');
  await api(admin, 'POST', '/api/ia/whatsapp/desconectar', {}, 200);
  const [[fin]] = await db.query('SELECT wa_instancia, wa_token_enc, wa_activo FROM agentes_config WHERE id = 1');
  check(evo.borradas === 1 && fin.wa_instancia === null && fin.wa_token_enc === null && fin.wa_activo === 0, 'instancia borrada en Evolution y datos limpiados');
  const wa = require(R + 'services/whatsapp.js');
  check((await wa.enviarTexto('18095551111', 'x')) === false, 'sin instancia, enviar devuelve false (no rompe nada)');
  check(evo.errores.length === 0, `Evolution recibió siempre la llave correcta (${evo.errores.join('; ') || 'sin errores'})`);

  console.log(`\n==== ${fallos === 0 ? 'TODO OK' : fallos + ' FALLO(S)'} ====`);
  servidorEvo.close(); servidorOa.close();
  await db.end();
  process.exit(fallos === 0 ? 0 : 1);
})().catch(async (e) => { console.error('ERROR', e); servidorEvo.close(); servidorOa.close(); await db.end(); process.exit(1); });
