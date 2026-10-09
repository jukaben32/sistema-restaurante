const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Unidades de medida del inventario: kg <-> lb con conversión de stock, mínimo, costo, recetas e historial.
// Se ejecuta DESPUÉS de las suites 01 a 06 (usa el usuario administrador creado por la 01).
process.chdir(ROOT);
const db = require(ROOT + 'db.js');
const unidades = require(ROOT + 'services/unidades.js');
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
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${method.padEnd(6)} ${path.padEnd(48)} ${r.status} ${show}`);
  return { status: r.status, data, text: txt };
}
const check = (c, m) => { if (!c) fallos++; console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); };
const cerca = (a, b, tol = 0.002) => Math.abs(Number(a) - Number(b)) <= tol;

(async () => {
  console.log('--- Conversión (servicio) ---');
  check(cerca(unidades.convertir(1, 'kg', 'lb'), 2.20462, 0.00001), '1 kg = 2.20462 lb');
  check(cerca(unidades.convertir(1, 'libras', 'kilos'), 0.45359237, 0.0000001), 'alias: 1 libra = 0.4536 kilos');
  check(unidades.convertir(1, 'kg', 'l') === null && unidades.convertir(1, 'und', 'kg') === null, 'no convierte entre familias distintas (peso/volumen/unidades)');
  check(unidades.normalizar('Libras') === 'lb' && unidades.normalizar('porción') === 'porción', 'normaliza alias y deja intactas las unidades desconocidas');

  const admin = jar(), mesero = jar();
  await call(admin, 'POST', '/login', { usuario: 'admin', password: 'Prueba#2026' }, { form: true, expect: 302 });
  await call(mesero, 'POST', '/login', { usuario: 'mesero1', password: 'Mesero#2026' }, { form: true, expect: 302 });

  console.log('\n--- Insumo en kg, receta y compra en libras ---');
  const ins = await call(admin, 'POST', '/api/inventario/insumos', { nombre: 'Pollo (prueba unidades)', unidad: 'Kilos', stock: 10, stock_minimo: 2, costo_unitario: 300 }, { expect: 201 });
  const [[i0]] = await db.query('SELECT unidad, stock FROM insumos WHERE id = ?', [ins.data.id]);
  check(i0.unidad === 'kg' && i0.stock === 10, 'el alias "Kilos" se guarda como kg');
  const plato = (await call(admin, 'POST', '/productos', { codigo: 'UNI1', nombre: 'Pollo guisado', precio_unidad: 500, en_menu: 1, disponible: 1 }, { expect: 201 })).data.id;
  // La receta se escribe en libras: 1 lb de pollo por plato -> se guarda en la unidad del insumo (kg)
  await call(admin, 'PUT', `/api/inventario/recetas/${plato}`, { items: [{ insumo_id: ins.data.id, cantidad: 1, unidad: 'lb' }] });
  let rec = (await call(admin, 'GET', `/api/inventario/recetas/${plato}`)).data;
  check(cerca(rec[0].cantidad, 0.45359, 0.0001), `receta de 1 lb se guarda como 0.45359 kg (${rec[0].cantidad})`);
  await call(admin, 'PUT', `/api/inventario/recetas/${plato}`, { items: [{ insumo_id: ins.data.id, cantidad: 1, unidad: 'galones' }] }, { expect: 400 });
  await call(admin, 'PUT', `/api/inventario/recetas/${plato}`, { items: [{ insumo_id: ins.data.id, cantidad: 1, unidad: 'lb' }] });
  // Compra en libras: 22 lb entran como kg
  const mv = await call(admin, 'POST', `/api/inventario/insumos/${ins.data.id}/movimiento`, { tipo: 'entrada', cantidad: 22, unidad: 'lb', nota: 'Compra en libras' });
  check(cerca(mv.data.stock, 10 + 9.97903, 0.001), `entrada de 22 lb suma 9.979 kg (stock ${mv.data.stock})`);
  await call(admin, 'POST', `/api/inventario/insumos/${ins.data.id}/movimiento`, { tipo: 'entrada', cantidad: 5, unidad: 'l' }, { expect: 400 });
  await call(mesero, 'POST', `/api/inventario/insumos/${ins.data.id}/convertir`, { unidad: 'lb' }, { expect: 403 });

  console.log('\n--- Cambio kg -> lb (botón rápido) ---');
  const [[antes]] = await db.query('SELECT stock, stock_minimo, costo_unitario FROM insumos WHERE id = ?', [ins.data.id]);
  const costoAntes = (await call(admin, 'GET', '/api/inventario/costeo')).data.find((p) => p.id === plato).costo;
  await call(admin, 'POST', `/api/inventario/insumos/${ins.data.id}/convertir`, { unidad: 'metros' }, { expect: 400 });
  await call(admin, 'POST', `/api/inventario/insumos/${ins.data.id}/convertir`, { unidad: 'l' }, { expect: 400 });
  const cv = await call(admin, 'POST', `/api/inventario/insumos/${ins.data.id}/convertir`, { unidad: 'lb' });
  check(cv.data.unidad === 'lb' && cv.data.convertido === true, 'responde que convirtió a lb');
  const [[d1]] = await db.query('SELECT unidad, stock, stock_minimo, costo_unitario FROM insumos WHERE id = ?', [ins.data.id]);
  check(d1.unidad === 'lb' && cerca(d1.stock, antes.stock * 2.20462, 0.003), `stock ${antes.stock} kg -> ${d1.stock} lb`);
  check(cerca(d1.stock_minimo, 4.409, 0.002), `mínimo 2 kg -> ${d1.stock_minimo} lb`);
  check(cerca(d1.costo_unitario, 300 * 0.45359237, 0.001), `costo 300/kg -> ${d1.costo_unitario}/lb`);
  rec = (await call(admin, 'GET', `/api/inventario/recetas/${plato}`)).data;
  check(cerca(rec[0].cantidad, 1, 0.0001), `la receta ahora dice 1 lb (${rec[0].cantidad})`);
  const costoDespues = (await call(admin, 'GET', '/api/inventario/costeo')).data.find((p) => p.id === plato).costo;
  check(cerca(costoAntes, costoDespues, 0.01), `el costo del plato no cambia al convertir (${costoAntes} -> ${costoDespues})`);
  const movs = (await call(admin, 'GET', `/api/inventario/movimientos?insumo_id=${ins.data.id}`)).data;
  check(movs.length >= 2 && movs.every((m) => m.unidad === 'lb') && cerca(movs[0].cantidad, 22, 0.01), `el historial también pasó a libras (última compra ${movs[0].cantidad} lb)`);
  const lista = (await call(admin, 'GET', '/api/inventario/insumos')).data.find((x) => x.id === ins.data.id);
  check(lista.unidad === 'lb', 'la lista de insumos muestra lb');

  console.log('\n--- Vender descuenta en la unidad del insumo ---');
  const cl = await call(admin, 'POST', '/api/clientes', { nombre: 'Cliente Unidades', telefono: '8095550999' }, { expect: 201 });
  const stockPrevio = d1.stock;
  await call(admin, 'POST', '/api/facturas', { cliente_id: cl.data.id, total: 1000, forma_pago: 'efectivo', productos: [{ producto_id: plato, cantidad: 2, precio: 500, unidad: 'UND', subtotal: 1000 }] }, { expect: 201 });
  const [[d2]] = await db.query('SELECT stock FROM insumos WHERE id = ?', [ins.data.id]);
  check(cerca(stockPrevio - d2.stock, 2, 0.001), `2 platos de 1 lb descuentan 2 lb (${stockPrevio} -> ${d2.stock})`);

  console.log('\n--- Cambio lb -> kg editando el insumo ---');
  const ed = await call(admin, 'PUT', `/api/inventario/insumos/${ins.data.id}`, { nombre: 'Pollo (prueba unidades)', unidad: 'kg', stock_minimo: 4.409, costo_unitario: d1.costo_unitario });
  check(ed.data.convertido === true, 'editar la unidad convierte automáticamente');
  const [[d3]] = await db.query('SELECT unidad, stock, stock_minimo, costo_unitario FROM insumos WHERE id = ?', [ins.data.id]);
  check(d3.unidad === 'kg' && cerca(d3.stock, d2.stock * 0.45359237, 0.002) && cerca(d3.stock_minimo, 2, 0.002) && cerca(d3.costo_unitario, 300, 0.01), `vuelve a kg sin perder precisión (stock ${d3.stock}, mínimo ${d3.stock_minimo}, costo ${d3.costo_unitario})`);
  rec = (await call(admin, 'GET', `/api/inventario/recetas/${plato}`)).data;
  check(cerca(rec[0].cantidad, 0.45359, 0.0001), `receta de vuelta en kg (${rec[0].cantidad})`);
  // Editar sin cambiar unidad no convierte nada
  const ed2 = await call(admin, 'PUT', `/api/inventario/insumos/${ins.data.id}`, { nombre: 'Pollo (prueba unidades)', unidad: 'kg', stock_minimo: 3, costo_unitario: 310 });
  const [[d4]] = await db.query('SELECT stock, stock_minimo, costo_unitario FROM insumos WHERE id = ?', [ins.data.id]);
  check(ed2.data.convertido === false && d4.stock === d3.stock && d4.stock_minimo === 3 && d4.costo_unitario === 310, 'editar sin cambiar la unidad no convierte');
  // Unidad que no es de peso/volumen: solo se renombra
  const und = await call(admin, 'POST', '/api/inventario/insumos', { nombre: 'Cajas de prueba', unidad: 'caja', stock: 5, stock_minimo: 1, costo_unitario: 100 }, { expect: 201 });
  await call(admin, 'POST', `/api/inventario/insumos/${und.data.id}/convertir`, { unidad: 'kg' }, { expect: 400 });
  const ren = await call(admin, 'PUT', `/api/inventario/insumos/${und.data.id}`, { nombre: 'Cajas de prueba', unidad: 'paquete', stock_minimo: 1, costo_unitario: 100 });
  const [[d5]] = await db.query('SELECT unidad, stock FROM insumos WHERE id = ?', [und.data.id]);
  check(ren.data.convertido === false && d5.unidad === 'paquete' && d5.stock === 5, 'una unidad sin equivalencia solo se renombra, sin tocar cantidades');

  await db.end();
  console.log(fallos ? `\n✖ ${fallos} comprobación(es) fallaron` : '\n✔ Suite de unidades: todo correcto');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
