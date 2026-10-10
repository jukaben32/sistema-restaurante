const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Pie de página editable: agencia, WhatsApp y redes (Configuración → Redes y pie de página). Se ejecuta DESPUÉS de las suites 01 a 09.
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
const MOSTRAR = { mostrar_facebook: '1', mostrar_instagram: '1', mostrar_x: '1', mostrar_tiktok: '1', mostrar_youtube: '1', mostrar_linkedin: '1', mostrar_pinterest: '1' };
const DEF = { facebook: 'https://web.facebook.com/', instagram: 'https://www.instagram.com/', x: 'https://x.com/', tiktok: 'https://www.tiktok.com/', youtube: 'https://www.youtube.com/', linkedin: 'https://www.linkedin.com/', pinterest: 'https://www.pinterest.com/' };
const check = (c, m) => { if (!c) fallos++; console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); };

(async () => {
  const admin = jar(), mesero = jar();
  await call(admin, 'POST', '/login', { usuario: 'admin', password: 'Prueba#2026' }, { form: true, expect: 302 });
  await call(mesero, 'POST', '/login', { usuario: 'mesero1', password: 'Mesero#2026' }, { form: true, expect: 302 });

  console.log('--- El pie por defecto ---');
  await call(admin, 'POST', '/configuracion/redes', { ...MOSTRAR, ...DEF, agencia: 'Betha IA', whatsapp: '18499192565' }); // valores iniciales
  const mesas = await call(mesero, 'GET', '/mesas', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(mesas.text.includes('Betha IA') && mesas.text.includes('https://wa.me/18499192565') && mesas.text.includes('https://web.facebook.com/'), 'el pie muestra la agencia, el botón de WhatsApp y Facebook');
  check(!mesas.text.includes('Ciscode') && !mesas.text.includes('paypal.com'), 'ya no aparecen los enlaces del proyecto original');
  const abren = ['https://www.instagram.com/', 'https://x.com/', 'https://www.tiktok.com/', 'https://www.youtube.com/', 'https://www.linkedin.com/', 'https://www.pinterest.com/'].every((u) => mesas.text.includes(`href="${u}"`));
  check(abren && !mesas.text.includes('próximamente'), 'al tocar cada ícono se abre su red (página principal hasta poner tu cuenta real)');
  check(/target="_blank" rel="noopener noreferrer"/.test(mesas.text), 'los enlaces abren en una pestaña nueva');
  const api = await call(mesero, 'GET', '/api/mesas/listar');
  check(typeof api.text === 'string' ? !api.text.includes('wa.me') : true, 'la API no lleva el pie');

  console.log('\n--- Editar desde Ajustes ---');
  await call(mesero, 'GET', '/configuracion/redes', undefined, { expect: 403 });
  await call(mesero, 'POST', '/configuracion/redes', {}, { expect: 403 });
  await call(admin, 'GET', '/configuracion/redes', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  const mal = await call(admin, 'POST', '/configuracion/redes', { ...MOSTRAR, instagram: 'javascript:alert(1)' }, { expect: 400 });
  check(/Instagram/.test(mal.data.error), 'un enlace que no es https:// se rechaza (evita enlaces peligrosos)');
  await call(admin, 'POST', '/configuracion/redes', { ...MOSTRAR, whatsapp: '123' }, { expect: 400 });
  await call(admin, 'POST', '/configuracion/redes', {
    ...MOSTRAR, agencia: 'Betha IA', whatsapp: '+1 (849) 919-2565', facebook: 'https://web.facebook.com/bethaia', instagram: 'https://instagram.com/bethaia',
    x: 'https://x.com/bethaia', tiktok: 'https://tiktok.com/@bethaia', youtube: 'https://youtube.com/@bethaia', linkedin: 'https://linkedin.com/company/bethaia', pinterest: 'https://pinterest.com/bethaia'
  });
  const [[fila]] = await db.query('SELECT pie_whatsapp, pie_instagram FROM configuracion_impresion ORDER BY id LIMIT 1');
  check(fila.pie_whatsapp === '18499192565' && fila.pie_instagram === 'https://instagram.com/bethaia', 'el WhatsApp se guarda solo con dígitos y las redes se guardan');
  const conRedes = await call(mesero, 'GET', '/mesas', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(conRedes.text.includes('https://instagram.com/bethaia') && conRedes.text.includes('https://tiktok.com/@bethaia') && !conRedes.text.includes('próximamente'), 'con todas las redes conectadas, todos los íconos son enlaces');
  // Vaciar el WhatsApp oculta el botón
  await call(admin, 'POST', '/configuracion/redes', { ...MOSTRAR, agencia: '', whatsapp: '' });
  const sinWa = await call(mesero, 'GET', '/mesas', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(!sinWa.text.includes('wa.me') && !sinWa.text.includes('Desarrollado por'), 'sin WhatsApp ni agencia, esas partes desaparecen');
  // Una red encendida pero sin enlace sale apagada ("próximamente") y no se puede tocar
  await call(admin, 'POST', '/configuracion/redes', { ...MOSTRAR, ...DEF, instagram: '', agencia: 'Betha IA', whatsapp: '18499192565' });
  const sinIg = await call(mesero, 'GET', '/mesas', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(sinIg.text.includes('Instagram · próximamente') && !sinIg.text.includes('href="https://www.instagram.com/"'), 'una red sin enlace queda apagada hasta que se escriba su dirección');
  // Apagar una red desde Ajustes: desaparece del pie (aunque tenga enlace)
  await call(admin, 'POST', '/configuracion/redes', { ...MOSTRAR, ...DEF, mostrar_x: '0', mostrar_pinterest: '0', whatsapp: '18499192565', x: 'https://x.com/bethaia' });
  const sinX = await call(mesero, 'GET', '/mesas', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(!sinX.text.includes('https://x.com/bethaia') && !sinX.text.includes('Pinterest') && sinX.text.includes('https://web.facebook.com/'), 'una red apagada desde Ajustes no aparece en el pie y las demás sí');
  const [[of]] = await db.query('SELECT pie_ocultas FROM configuracion_impresion ORDER BY id LIMIT 1');
  check(of.pie_ocultas === 'x,pinterest', `se guardan las redes apagadas (${of.pie_ocultas})`);
  const pgAjustes = await call(admin, 'GET', '/configuracion/redes', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check((pgAjustes.text.match(/data-mostrar=/g) || []).length === 7 && (pgAjustes.text.match(/data-mostrar="[a-z]+" checked/g) || []).length === 5, 'en Ajustes cada red tiene su interruptor "Mostrar" (5 de 7 encendidos)');
  // Dejar los valores iniciales de Betha IA
  await call(admin, 'POST', '/configuracion/redes', { ...MOSTRAR, ...DEF, agencia: 'Betha IA', whatsapp: '18499192565' });

  await db.end();
  console.log(fallos ? `\n✖ ${fallos} comprobación(es) fallaron` : '\n✔ Suite del pie de página: todo correcto');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
