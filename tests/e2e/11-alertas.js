const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Alertas por demora (Cocina y Delivery): configuración de los tiempos y su entrega a las pantallas.
// Se ejecuta DESPUÉS de las suites 01 a 10.
process.chdir(ROOT);
const db = require(ROOT + 'db.js');
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
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${method.padEnd(6)} ${path.padEnd(32)} ${r.status} ${show}`);
  return { status: r.status, data, text: txt };
}
const check = (c, m) => { if (!c) fallos++; console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); };

(async () => {
  const admin = jar(), mesero = jar(), cocinero = jar();
  await call(admin, 'POST', '/login', { usuario: 'admin', password: 'Prueba#2026' }, { form: true, expect: 302 });
  await call(mesero, 'POST', '/login', { usuario: 'mesero1', password: 'Mesero#2026' }, { form: true, expect: 302 });
  await call(cocinero, 'POST', '/login', { usuario: 'cocina1', password: 'Cocina#2026' }, { form: true, expect: 302 });

  console.log('--- Valores por defecto en las pantallas ---');
  const coc = await call(cocinero, 'GET', '/cocina', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(/window\.RM_ALERTAS = \{"amarilla":10,"roja":20,"confirmar":5,"sonido":true\}/.test(coc.text), 'la cocina recibe los tiempos por defecto: amarillo 10, rojo 20, confirmar 5, con sonido');
  check(coc.text.includes('/js/alertas-tiempo.js'), 'la cocina carga el script de alertas');
  const del = await call(mesero, 'GET', '/delivery', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(del.text.includes('/js/alertas-tiempo.js') && del.text.includes('window.RM_ALERTAS'), 'Delivery también');

  console.log('\n--- Configuración (solo administrador) ---');
  await call(mesero, 'GET', '/configuracion/alertas', undefined, { expect: 403 });
  await call(cocinero, 'POST', '/configuracion/alertas', { amarilla: 5, roja: 10, confirmar: 3, sonido: '1' }, { expect: 403 });
  await call(admin, 'GET', '/configuracion/alertas', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  const malo1 = await call(admin, 'POST', '/configuracion/alertas', { amarilla: 20, roja: 10, confirmar: 5, sonido: '1' }, { expect: 400 });
  check(/menor/.test(malo1.data.error), 'el amarillo debe ser menor que el rojo');
  await call(admin, 'POST', '/configuracion/alertas', { amarilla: 0, roja: 10, confirmar: 5, sonido: '1' }, { expect: 400 });
  await call(admin, 'POST', '/configuracion/alertas', { amarilla: 5, roja: 'abc', confirmar: 5, sonido: '1' }, { expect: 400 });
  await call(admin, 'POST', '/configuracion/alertas', { amarilla: 5, roja: 10, confirmar: 500, sonido: '1' }, { expect: 400 });
  await call(admin, 'POST', '/configuracion/alertas', { amarilla: 7, roja: 15, confirmar: 4, sonido: '0' });
  const [[f]] = await db.query('SELECT alerta_amarilla_min, alerta_roja_min, alerta_confirmar_min, alerta_sonido FROM configuracion_impresion ORDER BY id LIMIT 1');
  check(f.alerta_amarilla_min === 7 && f.alerta_roja_min === 15 && f.alerta_confirmar_min === 4 && f.alerta_sonido === 0, 'los tiempos nuevos se guardan');
  const coc2 = await call(cocinero, 'GET', '/cocina', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(/"amarilla":7,"roja":15,"confirmar":4,"sonido":false/.test(coc2.text), 'la cocina recibe los tiempos nuevos (y sin sonido)');
  const pg = await call(admin, 'GET', '/configuracion/alertas', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(pg.text.includes('value="7"') && pg.text.includes('value="15"'), 'la pantalla de ajustes muestra los valores guardados');

  // Dejar los valores por defecto
  await call(admin, 'POST', '/configuracion/alertas', { amarilla: 10, roja: 20, confirmar: 5, sonido: '1' });

  await db.end();
  console.log(fallos ? `\n✖ ${fallos} comprobación(es) fallaron` : '\n✔ Suite de alertas de tiempo: todo correcto');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
