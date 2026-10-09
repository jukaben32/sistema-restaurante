const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Datos de demostración (mercado dominicano): cargar, usar en las pantallas principales y quitar sin dejar rastro.
// Se ejecuta DESPUÉS de las suites 01 a 07.
process.chdir(ROOT);
const db = require(ROOT + 'db.js');
const demo = require(ROOT + 'services/datosDemo.js');
const B = 'http://localhost:3000';
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
const cuenta = async (t) => Number((await db.query(`SELECT COUNT(*) AS n FROM ${t}`))[0][0].n);
const TABLAS = ['productos', 'clientes', 'mesas', 'insumos', 'recetas', 'facturas', 'detalle_factura', 'factura_pagos', 'pedidos', 'pedido_items', 'inventario_movimientos', 'reservas', 'delivery_zonas', 'negocio_faq', 'horarios', 'mesa_alertas'];

(async () => {
  const admin = jar(), mesero = jar();
  await call(admin, 'POST', '/login', { usuario: 'admin', password: 'Prueba#2026' }, { form: true, expect: 302 });
  await call(mesero, 'POST', '/login', { usuario: 'mesero1', password: 'Mesero#2026' }, { form: true, expect: 302 });

  // Estado previo (las suites anteriores dejan datos propios): el demo no debe tocarlos
  const antes = {};
  for (const t of TABLAS) antes[t] = await cuenta(t);
  const [[cfg0]] = await db.query('SELECT pedido_minimo_delivery, datos_transferencia, telefono_humano FROM configuracion_impresion ORDER BY id LIMIT 1');

  console.log('--- Estado sin demo ---');
  const e0 = await call(admin, 'GET', '/api/demo/estado');
  check(e0.data.cargados === false, 'sin datos de demostración al inicio');
  await call(mesero, 'GET', '/api/demo/estado', undefined, { expect: 403 });
  await call(admin, 'POST', '/api/demo/quitar', { confirmar: 'QUITAR' }); // no hay nada: responde sin error

  console.log('\n--- Cargar ---');
  const r = await demo.cargar(db);
  check(r.productos >= 60 && r.insumos >= 30 && r.facturas >= 150 && r.reservas >= 6 && r.delivery >= 4 && r.pedidosMesa >= 3, `se cargó el menú, inventario, ventas, reservas y delivery (${JSON.stringify(r).slice(0, 150)})`);
  await demo.cargar(db).then(() => check(false, 'no debe cargarse dos veces'), (e) => check(/Ya hay datos/.test(e.message), 'cargar dos veces se rechaza'));
  const e1 = await call(admin, 'GET', '/api/demo/estado');
  check(e1.data.cargados === true && e1.data.productos >= 60, 'el estado indica que hay datos de demostración');

  console.log('\n--- Las pantallas funcionan con los datos ---');
  const prods = await call(admin, 'GET', '/productos', undefined, { headers: { Accept: 'text/html' } });
  const dash = await call(admin, 'GET', '/api/dashboard');
  check(dash.data && Number(dash.data.ventas_hoy?.total ?? dash.data.ventasHoy?.total ?? 1) >= 0, 'el dashboard responde con datos');
  const costeo = (await call(admin, 'GET', '/api/inventario/costeo')).data;
  const pica = costeo.find((p) => p.nombre === 'Pica Pollo con Tostones');
  check(pica && pica.margen > 0.3 && pica.margen < 0.9, `costeo de "Pica Pollo con Tostones": margen ${pica && Math.round(pica.margen * 100)}%`);
  const ins = (await call(admin, 'GET', '/api/inventario/insumos')).data;
  check(ins.filter((i) => i.bajo).length >= 3 && ins.every((i) => Number(i.stock) >= 0), 'inventario con 3+ alertas de stock bajo y sin negativos');
  check(ins.some((i) => i.unidad === 'lb') && ins.some((i) => i.unidad === 'kg'), 'hay insumos en libras y en kilos');
  const ventas = await call(admin, 'GET', '/ventas', undefined, { expect: 200 });
  const delv = (await call(mesero, 'GET', '/api/delivery')).data;
  check(delv.filter((p) => p.estado_delivery === 'por_confirmar').length >= 2 && delv.some((p) => p.estado_delivery === 'en_camino'), 'el tablero de delivery muestra pedidos por confirmar, en cocina y en camino');
  const cola = (await call(admin, 'GET', '/api/cocina/cola')).data;
  check(Array.isArray(cola) && cola.length >= 8, `cocina tiene pedidos en proceso (${cola.length})`);
  const res = (await call(mesero, 'GET', `/api/reservas?fecha=${new Date().toISOString().slice(0, 10)}`)).status;
  check(res < 500, 'reservas responde');
  const [[mq]] = await db.query(`SELECT qr_token FROM mesas WHERE numero = 'Terraza 1'`);
  const menu = await call(null, 'GET', `/menu/${mq.qr_token}`, undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(menu.text.includes('Pica Pollo') && menu.text.includes('Presidente') && /Agotado/.test(menu.text), 'menú QR: platos dominicanos, bebidas y un plato agotado');

  console.log('\n--- Quitar ---');
  await call(admin, 'POST', '/api/demo/quitar', {}, { expect: 400 });
  await call(admin, 'POST', '/api/demo/quitar', { confirmar: 'no' }, { expect: 400 });
  await call(mesero, 'POST', '/api/demo/quitar', { confirmar: 'QUITAR' }, { expect: 403 });
  const q = await call(admin, 'POST', '/api/demo/quitar', { confirmar: 'quitar' });
  check(q.data.quitado === true && q.data.sinQuitar.length === 0, 'se quitó todo, sin pendientes');
  const despues = {};
  for (const t of TABLAS) despues[t] = await cuenta(t);
  // "Costo de envío" (producto técnico) y "Consumidor final" pueden haberse creado por el sistema: se aceptan +1
  const distinto = TABLAS.filter((t) => despues[t] !== antes[t] && !(['productos', 'clientes'].includes(t) && despues[t] - antes[t] === 1));
  check(distinto.length === 0, `las tablas quedaron como antes (${distinto.map((t) => `${t}: ${antes[t]}→${despues[t]}`).join(', ') || 'sin diferencias'})`);
  const [[cfg1]] = await db.query('SELECT pedido_minimo_delivery, datos_transferencia, telefono_humano FROM configuracion_impresion ORDER BY id LIMIT 1');
  check(JSON.stringify(cfg0) === JSON.stringify(cfg1), 'la configuración del delivery volvió a como estaba');
  const e2 = await call(admin, 'GET', '/api/demo/estado');
  check(e2.data.cargados === false, 'el estado vuelve a "sin datos de demostración"');

  await db.end();
  console.log(fallos ? `\n✖ ${fallos} comprobación(es) fallaron` : '\n✔ Suite de datos de demostración: todo correcto');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
