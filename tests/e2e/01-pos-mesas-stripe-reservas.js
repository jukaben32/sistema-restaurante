const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Prueba de punta a punta de las funciones nuevas
process.chdir(ROOT);
const db = require(ROOT + 'db.js');
const B = 'http://localhost:3000';
let fallos = 0;
function jar() { return { cookie: '' }; }
async function call(j, method, path, body, { form = false, expect, raw = false, headers = {} } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (j && j.cookie) h.Cookie = j.cookie;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(B + path, { method, headers: h, body: payload, redirect: 'manual' });
  const sc = r.headers.get('set-cookie'); if (sc && j) j.cookie = sc.split(';')[0];
  const txt = raw ? '' : await r.text();
  let data = txt; try { data = JSON.parse(txt); } catch (_) {}
  const ok = expect === undefined ? r.status < 400 : (Array.isArray(expect) ? expect.includes(r.status) : r.status === expect);
  if (!ok) fallos++;
  const show = typeof data === 'string' ? data.replace(/\s+/g, ' ').slice(0, 90) : JSON.stringify(data).slice(0, 140);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${method.padEnd(6)} ${path.padEnd(48)} ${r.status} ${show}`);
  return { status: r.status, data, headers: r.headers, text: txt };
}
function check(cond, msg) { if (!cond) fallos++; console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`); }

(async () => {
  const admin = jar(), mesero = jar(), cocinero = jar(), anon = jar();
  await call(admin, 'POST', '/setup', { usuario: 'admin', nombre: 'Admin', password: 'Prueba#2026', password2: 'Prueba#2026' }, { form: true, expect: 302 });
  const lg = await call(admin, 'POST', '/login', { usuario: 'admin', password: 'Prueba#2026' }, { form: true, expect: 302 });
  check(lg.headers.get('location') === '/dashboard', 'admin entra al dashboard tras login');
  await call(admin, 'POST', '/api/usuarios', { usuario: 'mesero1', nombre: 'Mesero Uno', password: 'Mesero#2026', rol: 'mesero', activo: 1 });
  await call(admin, 'POST', '/api/usuarios', { usuario: 'cocina1', nombre: 'Cocina Uno', password: 'Cocina#2026', rol: 'cocinero', activo: 1 });
  await call(mesero, 'POST', '/login', { usuario: 'mesero1', password: 'Mesero#2026' }, { form: true, expect: 302 });
  await call(cocinero, 'POST', '/login', { usuario: 'cocina1', password: 'Cocina#2026' }, { form: true, expect: 302 });

  console.log('\n--- Productos con carta digital ---');
  const p1 = await call(admin, 'POST', '/productos', { codigo: 'HAM1', nombre: 'Hamburguesa Martin', precio_unidad: 25000, categoria: 'Platos fuertes', descripcion: 'Carne 200g, queso, papas', en_menu: 1, disponible: 1 }, { expect: 201 });
  const p2 = await call(admin, 'POST', '/productos', { codigo: 'LIM1', nombre: 'Limonada de coco', precio_unidad: 8000, categoria: 'Bebidas', en_menu: 1, disponible: 1 }, { expect: 201 });
  const p3 = await call(admin, 'POST', '/productos', { codigo: 'AGO1', nombre: 'Postre agotado', precio_unidad: 9000, categoria: 'Postres', disponible: 0 }, { expect: 201 });
  check(Number.isInteger(p1.data.id), 'POST /productos devuelve id (antes era undefined)');
  const fd = new FormData();
  const png = require('fs').readFileSync('public/icons/icon-192.png');
  fd.append('imagen', new Blob([png], { type: 'image/png' }), 'h.png');
  await call(admin, 'POST', `/productos/${p1.data.id}/imagen`, fd, { expect: 201 });
  const img = await fetch(`${B}/menu/img/${p1.data.id}`);
  check(img.status === 200 && img.headers.get('content-type') === 'image/png', 'foto del producto se sirve públicamente');
  const g = await call(admin, 'GET', `/productos/${p1.data.id}`);
  check(g.data.tiene_imagen === true && g.data.categoria === 'Platos fuertes', 'producto trae categoría y tiene_imagen');
  await call(mesero, 'PUT', `/api/productos/${p1.data.id}`, { codigo: 'HAM1', nombre: 'hack', precio_unidad: 1 }, { expect: 403 });
  await call(mesero, 'GET', '/api/productos/buscar?q=hambur');

  console.log('\n--- Mesas, QR y menú público ---');
  const m = await call(admin, 'POST', '/api/mesas/crear', { numero: '1', descripcion: 'Terraza' }, { expect: 201 });
  const [[mesa]] = await db.query('SELECT qr_token FROM mesas WHERE id = ?', [m.data.id]);
  check(/^[a-f0-9]{24}$/.test(mesa.qr_token), 'mesa nueva recibe token de QR automáticamente');
  await call(mesero, 'GET', '/mesas-qr');
  await call(cocinero, 'GET', '/mesas-qr', undefined, { expect: 403 });
  const menu = await call(anon, 'GET', `/menu/${mesa.qr_token}`, undefined, { headers: { Accept: 'text/html' } });
  check(menu.text.includes('Hamburguesa Martin') && menu.text.includes('Agotado') && menu.text.includes('Bebidas'), 'menú muestra productos, categorías y agotados');
  await call(anon, 'GET', '/menu/ffffffffffffffffffffffff', undefined, { expect: 404, headers: { Accept: 'text/html' } });
  await call(anon, 'POST', `/api/menu/${mesa.qr_token}/pedido`, { items: [{ producto_id: p3.data.id, cantidad: 1 }] }, { expect: 409 });
  const ped = await call(anon, 'POST', `/api/menu/${mesa.qr_token}/pedido`, { nombre: 'Ana', items: [{ producto_id: p1.data.id, cantidad: 2, nota: 'sin cebolla' }, { producto_id: p2.data.id, cantidad: 1, precio: 1 }] }, { expect: 201 });
  check(ped.data.total === 58000, 'el precio sale de la BD, no del cliente (58.000)');
  await call(anon, 'POST', `/api/menu/${mesa.qr_token}/alerta`, { tipo: 'llamar_mesero' });
  await call(anon, 'POST', `/api/menu/${mesa.qr_token}/alerta`, { tipo: 'pedir_cuenta', metodo: 'tarjeta' });
  const est = await call(anon, 'GET', `/api/menu/${mesa.qr_token}/pedido`);
  check(est.data.items.length === 2 && est.data.items.every((i) => i.estado === 'pendiente'), 'cliente ve su pedido como "Por confirmar"');
  const al = await call(mesero, 'GET', '/api/mesa-alertas');
  check(al.data.length === 3, 'mesero recibe 3 avisos (pedido, llamar, cuenta)');
  await call(mesero, 'POST', `/api/mesa-alertas/${al.data[0].id}/atender`);
  await call(anon, 'GET', '/api/mesa-alertas', undefined, { expect: 401 });

  console.log('\n--- Inventario y recetas ---');
  const ins1 = await call(admin, 'POST', '/api/inventario/insumos', { nombre: 'Carne de res', unidad: 'kg', stock: 5, stock_minimo: 1, costo_unitario: 30000 }, { expect: 201 });
  const ins2 = await call(admin, 'POST', '/api/inventario/insumos', { nombre: 'Pan', unidad: 'und', stock: 3, stock_minimo: 2, costo_unitario: 800 }, { expect: 201 });
  await call(admin, 'POST', '/api/inventario/insumos', { nombre: 'Pan', unidad: 'und' }, { expect: 409 });
  await call(admin, 'PUT', `/api/inventario/recetas/${p1.data.id}`, { items: [{ insumo_id: ins1.data.id, cantidad: 0.2 }, { insumo_id: ins2.data.id, cantidad: 1 }] });
  const cst = await call(admin, 'GET', '/api/inventario/costeo');
  const ham = cst.data.find((x) => x.id === p1.data.id);
  check(Math.abs(ham.costo - 6800) < 0.01 && Math.abs(ham.margen - 0.728) < 0.001, `costeo: costo 6.800 y margen 73% (${ham.costo}, ${ham.margen})`);
  await call(admin, 'POST', `/api/inventario/insumos/${ins2.data.id}/movimiento`, { tipo: 'entrada', cantidad: 10, nota: 'Compra panadería' });
  await call(admin, 'POST', `/api/inventario/insumos/${ins2.data.id}/movimiento`, { tipo: 'salida', cantidad: -1 }, { expect: 400 });
  await call(mesero, 'GET', '/api/inventario/insumos', undefined, { expect: 403 });

  console.log('\n--- Mesero confirma pedido QR, cocina, facturación con Stripe (simulado) ---');
  const pedido = await call(mesero, 'POST', '/api/mesas/abrir', { mesa_id: m.data.id });
  check(pedido.data.pedido.id === ped.data.pedido_id, 'el mesero abre el mismo pedido creado desde el QR');
  const det = await call(mesero, 'GET', `/api/mesas/pedidos/${pedido.data.pedido.id}`);
  for (const it of det.data.items) await call(mesero, 'PUT', `/api/mesas/items/${it.id}/enviar`, {});
  await call(cocinero, 'PUT', `/api/cocina/mesa/${m.data.id}/preparar`, {});

  const se = await call(mesero, 'GET', '/api/stripe/estado');
  check(se.data.habilitado === false, 'Stripe deshabilitado por defecto');
  await call(mesero, 'POST', '/api/stripe/cobros', { monto: 10 }, { expect: 400 });
  // Simula un cobro ya pagado en Stripe (sin llamar a Stripe)
  const [sp] = await db.query(`INSERT INTO stripe_pagos (session_id, pedido_id, monto, moneda, estado, payment_intent) VALUES ('cs_test_simulado1', ?, 30000, 'cop', 'pagado', 'pi_test_simulado1')`, [pedido.data.pedido.id]);
  const [spPend] = await db.query(`INSERT INTO stripe_pagos (session_id, monto, moneda, estado) VALUES ('cs_test_pend', 28000, 'cop', 'expirado')`);
  await call(mesero, 'POST', `/api/mesas/pedidos/${pedido.data.pedido.id}/facturar`, { cliente_id: 0, pagos: [] }, { expect: [400, 500] });
  const cl = await call(admin, 'POST', '/api/clientes', { nombre: 'Ana Pérez', telefono: '8095551234' }, { expect: 201 });
  await call(mesero, 'POST', `/api/mesas/pedidos/${pedido.data.pedido.id}/facturar`,
    { cliente_id: cl.data.id, pagos: [{ metodo: 'stripe', monto: 28000, stripe_pago_id: spPend.insertId }, { metodo: 'efectivo', monto: 28000 }] }, { expect: 400 });
  const fac = await call(mesero, 'POST', `/api/mesas/pedidos/${pedido.data.pedido.id}/facturar`,
    { cliente_id: cl.data.id, pagos: [{ metodo: 'stripe', monto: 1, stripe_pago_id: sp.insertId }, { metodo: 'efectivo', monto: 28000 }] }, { expect: 201 });
  const [[pagoUsado]] = await db.query('SELECT estado, factura_id FROM stripe_pagos WHERE id = ?', [sp.insertId]);
  check(pagoUsado.estado === 'usado' && pagoUsado.factura_id === fac.data.factura_id, 'cobro Stripe queda "usado" y ligado a la factura');
  const [fp] = await db.query('SELECT metodo, monto, referencia FROM factura_pagos WHERE factura_id = ? ORDER BY id', [fac.data.factura_id]);
  check(fp[0].metodo === 'tarjeta' && fp[0].monto === 30000 && fp[0].referencia === 'Stripe pi_test_simulado1', 'monto Stripe se toma del cobro verificado (30.000), no del cliente');
  // Reusar el mismo cobro en otra factura -> rechazado
  const p4 = await call(admin, 'POST', '/api/mesas/abrir', { mesa_id: m.data.id });
  await call(admin, 'POST', `/api/mesas/pedidos/${p4.data.pedido.id}/items`, { producto_id: p2.data.id, cantidad: 1, precio: 8000 }, { expect: 201 });
  const re = await call(admin, 'POST', `/api/mesas/pedidos/${p4.data.pedido.id}/facturar`, { cliente_id: cl.data.id, pagos: [{ metodo: 'stripe', monto: 8000, stripe_pago_id: sp.insertId }] }, { expect: 400 });
  check(/ya fue aplicado/.test(re.data.error), 'un pago de Stripe no se puede usar dos veces');
  const [stock] = await db.query('SELECT nombre, stock FROM insumos ORDER BY id');
  check(stock[0].stock === 4.6 && stock[1].stock === 11, `inventario descontado al facturar (carne 4.6 kg, pan 11): ${JSON.stringify(stock)}`);
  const [[alPend]] = await db.query('SELECT COUNT(*) AS n FROM mesa_alertas WHERE atendida = 0');
  check(alPend.n === 0, 'avisos de la mesa se cierran al facturar');
  const imp = await call(admin, 'GET', `/api/facturas/${fac.data.factura_id}/imprimir`, undefined, { headers: { Accept: 'text/html' } });
  check(imp.text.includes('wa.me/8095551234') || imp.text.includes('wa.me/18095551234'), 'factura trae botón de WhatsApp con el teléfono del cliente');

  console.log('\n--- Venta rápida (index) con Stripe ---');
  const [sp2] = await db.query(`INSERT INTO stripe_pagos (session_id, monto, moneda, estado, payment_intent) VALUES ('cs_test_simulado2', 8000, 'cop', 'pagado', 'pi_test_2')`);
  await call(admin, 'POST', '/api/facturas', { cliente_id: cl.data.id, total: 8000, forma_pago: 'stripe', pagos: [{ metodo: 'stripe', monto: 8000, stripe_pago_id: sp2.insertId }], productos: [{ producto_id: p2.data.id, cantidad: 1, precio: 8000, unidad: 'UND', subtotal: 8000 }] }, { expect: 201 });
  await call(admin, 'POST', '/api/facturas', { cliente_id: cl.data.id, total: 8000, forma_pago: 'efectivo', productos: [{ producto_id: p2.data.id, cantidad: 1, precio: 8000, unidad: 'UND', subtotal: 8000 }] }, { expect: 201 });

  console.log('\n--- Reservas ---');
  const man = new Date(Date.now() + 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const fechaMan = `${man.getFullYear()}-${pad(man.getMonth() + 1)}-${pad(man.getDate())}`;
  await call(anon, 'GET', '/reservar', undefined, { headers: { Accept: 'text/html' } });
  await call(anon, 'POST', '/api/reservar', { nombre: 'Luis', telefono: '8095550000', personas: 4, fecha_hora: `${fechaMan}T20:00` }, { expect: 201 });
  await call(anon, 'POST', '/api/reservar', { nombre: 'Pasado', telefono: '1', personas: 2, fecha_hora: '2020-01-01T20:00' }, { expect: 400 });
  await call(anon, 'POST', '/api/reservar', { nombre: 'Sin contacto', personas: 2, fecha_hora: `${fechaMan}T20:00` }, { expect: 400 });
  const r1 = await call(mesero, 'POST', '/api/reservas', { nombre: 'Carla', telefono: '8095551111', personas: 2, fecha_hora: `${fechaMan}T19:30`, mesa_id: m.data.id }, { expect: 201 });
  await call(mesero, 'POST', '/api/reservas', { nombre: 'Choque', telefono: '1', personas: 2, fecha_hora: `${fechaMan}T20:30`, mesa_id: m.data.id }, { expect: 409 });
  const lr = await call(mesero, 'GET', `/api/reservas?fecha=${fechaMan}`);
  check(lr.data.length === 2 && lr.data[0].hora === '19:30', 'reservas del día ordenadas por hora local');
  await call(mesero, 'PUT', `/api/reservas/${r1.data.id}/estado`, { estado: 'sentada' });
  await call(mesero, 'GET', '/api/reservas/resumen');
  await call(cocinero, 'GET', '/api/reservas', undefined, { expect: 403 });

  console.log('\n--- Dashboard, páginas y PWA ---');
  const dsh = await call(admin, 'GET', '/api/dashboard');
  check(dsh.data.hoy.facturas === 3 && dsh.data.hoy.ventas === 74000 && dsh.data.semana.length === 7, `dashboard: 3 facturas, 74.000 hoy (${dsh.data.hoy.facturas}, ${dsh.data.hoy.ventas})`);
  check(dsh.data.top[0].nombre === 'Hamburguesa Martin' && dsh.data.stripe_hoy.cobros === 2, 'dashboard: top producto y cobros Stripe');
  await call(mesero, 'GET', '/api/dashboard', undefined, { expect: 403 });
  for (const pth of ['/dashboard', '/inventario', '/reservas', '/configuracion/stripe', '/configuracion', '/productos', '/mesas', '/ventas', '/']) {
    await call(admin, 'GET', pth, undefined, { headers: { Accept: 'text/html' } });
  }
  await call(cocinero, 'GET', '/cocina', undefined, { headers: { Accept: 'text/html' } });
  await call(anon, 'GET', '/manifest.webmanifest');
  await call(anon, 'GET', '/sw.js');
  await call(anon, 'GET', '/pago/estado?session_id=cs_test_simulado1', undefined, { headers: { Accept: 'text/html' } });

  console.log('\n--- Configuración Stripe ---');
  await call(admin, 'POST', '/configuracion/stripe', { habilitado: '1', secretKey: 'clave_mala', moneda: 'cop' }, { expect: 400 });
  await call(admin, 'POST', '/configuracion/stripe', { habilitado: '1', secretKey: 'sk_test_51FakeKeyForTestingOnly000', moneda: 'cop' });
  const [[cfg]] = await db.query('SELECT stripe_secret_key_enc, stripe_habilitado FROM configuracion_impresion LIMIT 1');
  check(cfg.stripe_secret_key_enc.startsWith('v1:') && !cfg.stripe_secret_key_enc.includes('sk_test'), 'llave secreta guardada cifrada');
  const pr = await call(admin, 'POST', '/configuracion/stripe/probar', {}, { expect: 400 });
  check(/Stripe/.test(pr.data.error || ''), 'probar conexión con llave falsa informa error de Stripe');
  const cb = await call(mesero, 'POST', '/api/stripe/cobros', { monto: 1000 }, { expect: 400 });
  check(/Stripe/.test(cb.data.error || ''), 'crear cobro con llave inválida devuelve error claro');
  await call(mesero, 'POST', '/configuracion/stripe', { habilitado: '0' }, { expect: 403 });
  await call(anon, 'POST', '/stripe/webhook', '{}', { expect: 400, headers: { 'stripe-signature': 't=1,v1=bad' } });

  console.log(`\n==== ${fallos === 0 ? 'TODO OK' : fallos + ' FALLO(S)'} ====`);
  await db.end();
  process.exit(fallos === 0 ? 0 : 1);
})().catch(async (e) => { console.error('ERROR', e); await db.end(); process.exit(1); });
