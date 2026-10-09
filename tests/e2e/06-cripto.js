const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Pagos con criptomonedas (BTCPay Server SIMULADO): configuración, cobros, estados, facturación de mesa,
// pago mixto, venta rápida, delivery y herramienta del agente. Se ejecuta DESPUÉS de las suites 01 a 05.
process.chdir(ROOT);
const http = require('http');
const db = require(ROOT + 'db.js');
const ejecutor = require(ROOT + 'services/agente/ejecutor.js');
const B = 'http://localhost:3000';
const BTC = 'http://localhost:4803';
const API_KEY = 'btcpay-api-key-de-prueba-123456';
const STORE = 'StoreDePrueba123';
let fallos = 0;
const jar = () => ({ cookie: '' });
async function call(j, method, path, body, { form = false, expect } = {}) {
  const h = { Accept: 'application/json' };
  if (j && j.cookie) h.Cookie = j.cookie;
  let payload;
  if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(B + path, { method, headers: h, body: payload, redirect: 'manual' });
  const sc = r.headers.get('set-cookie'); if (sc && j) j.cookie = sc.split(';')[0];
  const txt = await r.text();
  let data = txt; try { data = JSON.parse(txt); } catch (_) {}
  const ok = expect === undefined ? r.status < 400 : (Array.isArray(expect) ? expect.includes(r.status) : r.status === expect);
  if (!ok) fallos++;
  const show = typeof data === 'string' ? data.replace(/\s+/g, ' ').slice(0, 80) : JSON.stringify(data).slice(0, 130);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${method.padEnd(6)} ${path.padEnd(40)} ${r.status} ${show}`);
  return { status: r.status, data, text: txt };
}
const check = (c, m) => { if (!c) fallos++; console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); };

// ---------- BTCPay Server falso ----------
const btc = { facturas: {}, n: 0, errores: [], caido: false };
const servidor = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const json = (o, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (btc.caido) return json({ message: 'caído' }, 500);
    if (req.headers.authorization !== `token ${API_KEY}`) { btc.errores.push(`${req.method} ${req.url} sin token válido`); return json({ message: 'unauthorized' }, 401); }
    const b = body ? JSON.parse(body) : {};
    const base = `/api/v1/stores/${STORE}`;
    const m = req.url.match(new RegExp(`^${base}/invoices/([^/]+)(/payment-methods|/status)?$`));
    if (req.method === 'GET' && req.url === base) return json({ id: STORE, name: 'Tienda de Prueba' });
    if (req.method === 'POST' && req.url === `${base}/invoices`) {
      const id = `INV${++btc.n}`;
      btc.facturas[id] = { id, status: 'New', amount: b.amount, currency: b.currency, metadata: b.metadata, checkout: b.checkout };
      return json({ id, status: 'New', checkoutLink: `${BTC}/i/${id}`, amount: b.amount, currency: b.currency });
    }
    if (m && req.method === 'GET' && !m[2]) { const f = btc.facturas[m[1]]; return f ? json(f) : json({ message: 'no existe' }, 404); }
    if (m && req.method === 'GET' && m[2] === '/payment-methods') {
      return json([
        { paymentMethodId: 'BTC-CHAIN', destination: 'bc1qtest', paymentLink: 'bitcoin:bc1qtest?amount=0.0005', amount: '0.0005' },
        { paymentMethodId: 'BTC-LN', destination: 'lnbc5000test', paymentLink: 'lightning:lnbc5000test', amount: '0.0005' }
      ]);
    }
    if (m && req.method === 'POST' && m[2] === '/status') {
      const f = btc.facturas[m[1]];
      if (!f || f.status !== 'New') return json({ message: 'no se puede' }, 422);
      f.status = b.status; return json(f);
    }
    json({ message: 'not found' }, 404);
  });
});
const marcar = (id, status) => { btc.facturas[id].status = status; };

(async () => {
  await new Promise((r) => servidor.listen(4803, r));
  const admin = jar(), mesero = jar(), cocinero = jar();
  await call(admin, 'POST', '/login', { usuario: 'admin', password: 'Prueba#2026' }, { form: true, expect: 302 });
  await call(mesero, 'POST', '/login', { usuario: 'mesero1', password: 'Mesero#2026' }, { form: true, expect: 302 });
  await call(cocinero, 'POST', '/login', { usuario: 'cocina1', password: 'Cocina#2026' }, { form: true, expect: 302 });

  console.log('\n--- Configuración ---');
  const e0 = await call(mesero, 'GET', '/api/cripto/estado');
  check(e0.data.habilitado === false, 'cripto deshabilitado por defecto');
  const MON = e0.data.moneda; // moneda del negocio (la de Stripe en esta base de pruebas)
  await call(mesero, 'POST', '/api/cripto/cobros', { monto: 100 }, { expect: 400 });
  await call(mesero, 'GET', '/configuracion/cripto', undefined, { expect: 403 });
  await call(mesero, 'POST', '/configuracion/cripto', {}, { expect: 403 });
  await call(admin, 'GET', '/configuracion/cripto', undefined, { expect: 200 });
  await call(admin, 'POST', '/configuracion/cripto', { habilitado: '1', url: 'no-es-url', storeId: STORE, apiKey: API_KEY, monedaCripto: MON }, { expect: 400 });
  await call(admin, 'POST', '/configuracion/cripto', { habilitado: '1', url: BTC, storeId: 'x y', apiKey: API_KEY, monedaCripto: MON }, { expect: 400 });
  await call(admin, 'POST', '/configuracion/cripto', { habilitado: '1', url: BTC, storeId: STORE, apiKey: 'corta', monedaCripto: MON }, { expect: 400 });
  const sv = await call(admin, 'POST', '/configuracion/cripto', { habilitado: '1', url: BTC, storeId: STORE, apiKey: API_KEY, monedaCripto: MON });
  check(sv.data.habilitado === true, 'configuración guardada y activa');
  const [[cfgDb]] = await db.query('SELECT btcpay_api_key_enc FROM configuracion_impresion ORDER BY id LIMIT 1');
  check(cfgDb.btcpay_api_key_enc && !cfgDb.btcpay_api_key_enc.includes(API_KEY), 'la API key se guarda cifrada');
  const pr = await call(admin, 'POST', '/configuracion/cripto/probar');
  check(pr.data.ok && pr.data.tienda === 'Tienda de Prueba' && pr.data.tasaOk === true, 'probar conexión: tienda y cobro de prueba correctos');
  check(Object.values(btc.facturas).every((f) => f.status === 'Invalid'), 'el cobro de la prueba de conexión se invalida');
  // Guardar sin API key conserva la anterior
  await call(admin, 'POST', '/configuracion/cripto', { habilitado: '1', url: BTC, storeId: STORE, apiKey: '', monedaCripto: MON });
  const e1 = await call(mesero, 'GET', '/api/cripto/estado');
  check(e1.data.habilitado === true, 'dejar la API key vacía conserva la guardada');

  console.log('\n--- Cobro: crear, estados y cancelar ---');
  const c1 = await call(mesero, 'POST', '/api/cripto/cobros', { monto: 1500, descripcion: 'Prueba' }, { expect: 201 });
  const inv1 = btc.facturas[c1.data.invoice_id];
  check(inv1 && inv1.amount === '1500.00' && inv1.currency === MON.toUpperCase(), `factura en BTCPay por 1500.00 ${MON.toUpperCase()} (${inv1 && inv1.amount} ${inv1 && inv1.currency})`);
  check(/^lightning:/.test(c1.data.lightning) && /^bitcoin:/.test(c1.data.onchain) && c1.data.qr_lightning.startsWith('data:image/png') && c1.data.qr_onchain.startsWith('data:image/png'), 'devuelve enlaces y QR de Lightning y Bitcoin');
  check(c1.data.monto_btc === '0.0005' && c1.data.url.includes('/i/INV'), 'devuelve el monto en BTC y la página de pago');
  await call(mesero, 'POST', '/api/cripto/cobros', { monto: 0 }, { expect: 400 });
  await call(mesero, 'POST', '/api/cripto/cobros', { monto: 'abc' }, { expect: 400 });
  let s = await call(mesero, 'GET', `/api/cripto/cobros/${c1.data.id}`);
  check(s.data.estado === 'pendiente', 'estado inicial: pendiente');
  marcar(c1.data.invoice_id, 'Processing');
  s = await call(mesero, 'GET', `/api/cripto/cobros/${c1.data.id}`);
  check(s.data.estado === 'procesando', 'pago detectado: procesando');
  marcar(c1.data.invoice_id, 'Settled');
  s = await call(mesero, 'GET', `/api/cripto/cobros/${c1.data.id}`);
  check(s.data.estado === 'pagado', 'pago confirmado: pagado');
  const cn = await call(mesero, 'POST', `/api/cripto/cobros/${c1.data.id}/cancelar`);
  check(cn.data.estado === 'pagado', 'un cobro ya pagado no se puede cancelar');
  const c2 = await call(mesero, 'POST', '/api/cripto/cobros', { monto: 300 }, { expect: 201 });
  const cn2 = await call(mesero, 'POST', `/api/cripto/cobros/${c2.data.id}/cancelar`);
  check(cn2.data.estado === 'invalido' && btc.facturas[c2.data.invoice_id].status === 'Invalid', 'cancelar invalida el cobro en BTCPay');
  const c3 = await call(mesero, 'POST', '/api/cripto/cobros', { monto: 300 }, { expect: 201 });
  marcar(c3.data.invoice_id, 'Expired');
  s = await call(mesero, 'GET', `/api/cripto/cobros/${c3.data.id}`);
  check(s.data.estado === 'expirado', 'cobro vencido: expirado');
  btc.caido = true;
  await call(mesero, 'POST', '/api/cripto/cobros', { monto: 100 }, { expect: 400 });
  btc.caido = false;
  check(btc.errores.length === 0, `todas las llamadas a BTCPay llevaron la API key (${btc.errores.length} errores)`);

  console.log('\n--- Facturar una mesa con cripto ---');
  const mk = async (codigo, nombre, precio) => (await call(admin, 'POST', '/productos', { codigo, nombre, precio_unidad: precio, categoria: 'Cripto test', en_menu: 1, disponible: 1 }, { expect: 201 })).data.id;
  const plato = await mk('CRI1', 'Langosta', 2000);
  const cl = await call(admin, 'POST', '/api/clientes', { nombre: 'Cliente Cripto', telefono: '8095550777' }, { expect: 201 });
  const [mi] = await db.query(`INSERT INTO mesas (numero, descripcion) VALUES ('CRIPTO1', 'Mesa de prueba cripto')`);
  const abrirPedido = async (cant) => {
    const p = await call(mesero, 'POST', '/api/mesas/abrir', { mesa_id: mi.insertId });
    await call(mesero, 'POST', `/api/mesas/pedidos/${p.data.pedido.id}/items`, { producto_id: plato, cantidad: cant, precio: 2000 }, { expect: 201 });
    return p.data.pedido.id;
  };
  let ped = await abrirPedido(1); // total 2000
  const cobroMesa = await call(mesero, 'POST', '/api/cripto/cobros', { monto: 2000, pedido_id: ped }, { expect: 201 });
  await call(mesero, 'POST', `/api/mesas/pedidos/${ped}/facturar`, { cliente_id: cl.data.id, pagos: [{ metodo: 'cripto', monto: 2000, cripto_pago_id: cobroMesa.data.id }] }, { expect: 400 });
  const noPag = await call(mesero, 'POST', `/api/mesas/pedidos/${ped}/facturar`, { cliente_id: cl.data.id, pagos: [{ metodo: 'cripto', monto: 2000, cripto_pago_id: cobroMesa.data.id }] }, { expect: 400 });
  check(/aún no está confirmado/.test(noPag.data.error), 'no se factura con un cobro cripto sin pagar');
  await call(mesero, 'POST', `/api/mesas/pedidos/${ped}/facturar`, { cliente_id: cl.data.id, pagos: [{ metodo: 'cripto', monto: 2000 }] }, { expect: 400 });
  marcar(cobroMesa.data.invoice_id, 'Settled');
  // Intenta colar un monto menor: se toma el del cobro verificado
  const fac = await call(mesero, 'POST', `/api/mesas/pedidos/${ped}/facturar`, { cliente_id: cl.data.id, pagos: [{ metodo: 'cripto', monto: 1, cripto_pago_id: cobroMesa.data.id }] }, { expect: 201 });
  const [[fCab]] = await db.query('SELECT forma_pago, total FROM facturas WHERE id = ?', [fac.data.factura_id]);
  const [fPag] = await db.query('SELECT metodo, monto, referencia FROM factura_pagos WHERE factura_id = ?', [fac.data.factura_id]);
  check(fCab.forma_pago === 'cripto' && fCab.total === 2000, 'factura con forma de pago "cripto" por 2.000');
  check(fPag.length === 1 && fPag[0].metodo === 'cripto' && fPag[0].monto === 2000 && fPag[0].referencia === `BTCPay ${cobroMesa.data.invoice_id}`, 'el monto sale del cobro verificado y la referencia es la factura de BTCPay');
  const [[usado]] = await db.query('SELECT estado, factura_id FROM cripto_pagos WHERE id = ?', [cobroMesa.data.id]);
  check(usado.estado === 'usado' && usado.factura_id === fac.data.factura_id, 'el cobro queda "usado" y ligado a la factura');
  // Reutilizar el cobro en otra factura
  const ped2 = await abrirPedido(1);
  const re = await call(mesero, 'POST', `/api/mesas/pedidos/${ped2}/facturar`, { cliente_id: cl.data.id, pagos: [{ metodo: 'cripto', monto: 2000, cripto_pago_id: cobroMesa.data.id }] }, { expect: 400 });
  check(/ya fue aplicado/.test(re.data.error), 'un pago cripto no se puede usar dos veces');

  console.log('\n--- Pago mixto: cripto + efectivo ---');
  const mixto = await call(mesero, 'POST', '/api/cripto/cobros', { monto: 1200, pedido_id: ped2 }, { expect: 201 });
  marcar(mixto.data.invoice_id, 'Settled');
  const fm = await call(mesero, 'POST', `/api/mesas/pedidos/${ped2}/facturar`, { cliente_id: cl.data.id, pagos: [{ metodo: 'cripto', monto: 1200, cripto_pago_id: mixto.data.id }, { metodo: 'efectivo', monto: 800 }] }, { expect: 201 });
  const [[fMix]] = await db.query('SELECT forma_pago FROM facturas WHERE id = ?', [fm.data.factura_id]);
  check(fMix.forma_pago === 'mixto', 'pago mixto cripto + efectivo → factura "mixto"');
  // Suma insuficiente
  const ped3 = await abrirPedido(1);
  const corto = await call(mesero, 'POST', '/api/cripto/cobros', { monto: 500, pedido_id: ped3 }, { expect: 201 });
  marcar(corto.data.invoice_id, 'Settled');
  await call(mesero, 'POST', `/api/mesas/pedidos/${ped3}/facturar`, { cliente_id: cl.data.id, pagos: [{ metodo: 'cripto', monto: 500, cripto_pago_id: corto.data.id }] }, { expect: 400 });

  console.log('\n--- Venta rápida con cripto ---');
  const vr = await call(mesero, 'POST', '/api/cripto/cobros', { monto: 2000 }, { expect: 201 });
  await call(admin, 'POST', '/api/facturas', { cliente_id: cl.data.id, total: 2000, forma_pago: 'cripto', pagos: [{ metodo: 'cripto', monto: 2000, cripto_pago_id: vr.data.id }], productos: [{ producto_id: plato, cantidad: 1, precio: 2000, unidad: 'UND', subtotal: 2000 }] }, { expect: [400, 500] });
  marcar(vr.data.invoice_id, 'Settled');
  const vf = await call(admin, 'POST', '/api/facturas', { cliente_id: cl.data.id, total: 2000, forma_pago: 'cripto', pagos: [{ metodo: 'cripto', monto: 2000, cripto_pago_id: vr.data.id }], productos: [{ producto_id: plato, cantidad: 1, precio: 2000, unidad: 'UND', subtotal: 2000 }] }, { expect: 201 });
  const [[vfDb]] = await db.query('SELECT forma_pago FROM facturas WHERE id = ?', [vf.data.factura_id || vf.data.id]);
  check(vfDb && vfDb.forma_pago === 'cripto', 'venta rápida registrada como "cripto"');
  const rep = await call(admin, 'GET', '/ventas', undefined, { expect: 200 });
  check(rep.text.includes('Total Cripto'), 'el reporte de ventas muestra el total en cripto');
  const [[tot]] = await db.query(`SELECT COALESCE(SUM(monto),0) AS t FROM factura_pagos WHERE metodo = 'cripto'`);
  check(tot.t === 2000 + 1200 + 2000, `suma de pagos cripto en la base: ${tot.t}`);

  console.log('\n--- Delivery con cripto ---');
  const base = { tipo: 'para_llevar', telefono: '809-555-0888', nombre: 'Marta', metodo_pago: 'cripto', items: [{ producto_id: plato, cantidad: 1 }] };
  const d = await call(mesero, 'POST', '/api/delivery', base, { expect: 201 });
  check(d.data.metodo_pago === 'cripto', 'pedido creado con pago previsto "cripto"');
  const pedidoId = d.data.pedido_id;
  const ob = await call(mesero, 'POST', `/api/delivery/${pedidoId}/cobro-cripto`);
  check(ob.data.estado === 'pendiente' && /\/i\/INV/.test(ob.data.url) && ob.data.qr.startsWith('data:image/png') && ob.data.lightning, 'enlace y QR de pago generados para el pedido');
  const ob2 = await call(mesero, 'POST', `/api/delivery/${pedidoId}/cobro-cripto`);
  check(ob2.data.url === ob.data.url, 'se reutiliza el cobro pendiente (no crea otro)');
  let lista = (await call(mesero, 'GET', '/api/delivery')).data;
  let t = lista.find((x) => x.id === pedidoId);
  check(t && t.cripto_estado === 'pendiente', 'tablero: cobro cripto pendiente');
  const [[cpDel]] = await db.query('SELECT cp.invoice_id FROM pedidos p JOIN cripto_pagos cp ON cp.id = p.cripto_pago_id WHERE p.id = ?', [pedidoId]);
  await call(mesero, 'POST', `/api/delivery/${pedidoId}/confirmar`, {}, { expect: 400 }); // el personal lo crea ya confirmado
  // Cocina termina el pedido
  await call(cocinero, 'PUT', `/api/cocina/pedido/${pedidoId}/preparar`, {});
  const cola = (await call(cocinero, 'GET', '/api/cocina/cola')).data.filter((i) => i.pedido_id === pedidoId);
  for (const it of cola) await call(cocinero, 'PUT', `/api/cocina/item/${it.id}/estado`, { estado: 'listo' });
  const ant = await call(mesero, 'POST', `/api/delivery/${pedidoId}/entregar`, {}, { expect: 400 });
  check(/aún no está confirmado/.test(ant.data.error), 'no se entrega ni factura sin el pago cripto confirmado');
  const [[alAntes]] = await db.query(`SELECT COUNT(*) AS n FROM mesa_alertas WHERE pedido_id = ? AND tipo = 'pago_recibido'`, [pedidoId]);
  marcar(cpDel.invoice_id, 'Settled');
  await new Promise((r) => setTimeout(r, 8300)); // el tablero consulta cada cobro como máximo cada 8 s
  lista = (await call(mesero, 'GET', '/api/delivery')).data;
  t = lista.find((x) => x.id === pedidoId);
  check(t && t.cripto_estado === 'pagado', 'tablero: pago cripto confirmado');
  const [[alDesp]] = await db.query(`SELECT COUNT(*) AS n FROM mesa_alertas WHERE pedido_id = ? AND tipo = 'pago_recibido'`, [pedidoId]);
  check(alAntes.n === 0 && alDesp.n === 1, 'aviso "pago recibido" para el personal (una sola vez)');
  await call(mesero, 'GET', '/api/delivery');
  const [[alOtra]] = await db.query(`SELECT COUNT(*) AS n FROM mesa_alertas WHERE pedido_id = ? AND tipo = 'pago_recibido'`, [pedidoId]);
  check(alOtra.n === 1, 'el aviso no se duplica al refrescar');
  const ent = await call(mesero, 'POST', `/api/delivery/${pedidoId}/entregar`, {});
  const [[fEnt]] = await db.query('SELECT forma_pago, total FROM facturas WHERE id = ?', [ent.data.factura_id]);
  check(fEnt.forma_pago === 'cripto' && fEnt.total === 2000, 'delivery entregado y facturado con cripto');
  // Cancelar un pedido ya pagado con cripto avisa de reembolso manual
  const d2 = await call(mesero, 'POST', '/api/delivery', base, { expect: 201 });
  await call(mesero, 'POST', `/api/delivery/${d2.data.pedido_id}/cobro-cripto`);
  const [[cp2]] = await db.query('SELECT cp.invoice_id FROM pedidos p JOIN cripto_pagos cp ON cp.id = p.cripto_pago_id WHERE p.id = ?', [d2.data.pedido_id]);
  marcar(cp2.invoice_id, 'Settled');
  await call(mesero, 'GET', '/api/delivery');
  const canc = await call(mesero, 'POST', `/api/delivery/${d2.data.pedido_id}/cancelar`, { motivo: 'prueba' });
  check(canc.data.reembolso_pendiente === true, 'cancelar un pedido ya pagado con cripto marca reembolso pendiente');

  console.log('\n--- Agente (voz/WhatsApp) ---');
  const info = await ejecutor.ejecutar('infoRestaurante', {}, { canal: 'whatsapp', telefono: '8095550123' });
  check(Array.isArray(info.formas_de_pago_delivery) && info.formas_de_pago_delivery.includes('cripto'), 'el agente ofrece "cripto" como forma de pago');
  const ped4 = await ejecutor.ejecutar('crearPedido', { tipo: 'para_llevar', nombre: 'Juan', metodoPago: 'cripto', items: [{ producto_id: plato, cantidad: 1 }] }, { canal: 'whatsapp', telefono: '8095550123' });
  check(ped4.ok && /\/i\/INV/.test(ped4.enlace_pago || ''), `el agente crea el pedido y devuelve el enlace de pago cripto (${ped4.enlace_pago || ped4.error})`);

  console.log('\n--- Mantenimiento (sincronización) ---');
  const pend = await call(mesero, 'POST', '/api/cripto/cobros', { monto: 100 }, { expect: 201 });
  marcar(pend.data.invoice_id, 'Settled');
  const sincro = await require(ROOT + 'services/cripto.js').sincronizarPendientes();
  const [[sp]] = await db.query('SELECT estado FROM cripto_pagos WHERE id = ?', [pend.data.id]);
  check(sincro >= 1 && sp.estado === 'pagado', 'el mantenimiento sincroniza cobros pendientes');

  servidor.close();
  await db.end();
  console.log(fallos ? `\n✖ ${fallos} comprobación(es) fallaron` : '\n✔ Suite de cripto: todo correcto');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
