// Guía de uso integrada (/ayuda) y ajustes para móviles (menú, metaetiquetas, íconos).
// Se ejecuta DESPUÉS de las suites 01-04 (usa los usuarios admin, mesero1 y cocina1 que crea la 01).
const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
process.chdir(ROOT);
const B = 'http://localhost:3000';
let fallos = 0;
const check = (c, m) => { if (!c) fallos++; console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); };

async function sesion(usuario, password) {
  const r = await fetch(`${B}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ usuario, password }).toString(), redirect: 'manual' });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
const get = async (path, cookie) => {
  const r = await fetch(B + path, { headers: { Cookie: cookie || '', Accept: 'text/html' }, redirect: 'manual' });
  return { status: r.status, text: await r.text(), headers: r.headers, loc: r.headers.get('location') };
};

(async () => {
  const admin = await sesion('admin', 'Prueba#2026');
  const mesero = await sesion('mesero1', 'Mesero#2026');
  const cocinero = await sesion('cocina1', 'Cocina#2026');

  console.log('--- Guía de uso por rol ---');
  const sin = await get('/ayuda');
  check(sin.status === 302 && /login/.test(sin.loc || ''), 'sin sesión, /ayuda manda al login');
  const am = await get('/ayuda', mesero);
  check(am.status === 200 && /Guía del MESERO/.test(am.text) && !/Guía del ADMINISTRADOR/.test(am.text) && !/Guía del COCINERO/.test(am.text), 'el mesero ve su sección y no las de otros roles');
  const ac = await get('/ayuda', cocinero);
  check(ac.status === 200 && /Guía del COCINERO/.test(ac.text) && !/Guía del MESERO/.test(ac.text) && !/Guía del ADMINISTRADOR/.test(ac.text), 'el cocinero ve su sección');
  const aa = await get('/ayuda', admin);
  check(aa.status === 200 && /Guía del ADMINISTRADOR/.test(aa.text) && /Guía del MESERO/.test(aa.text) && /Guía del COCINERO/.test(aa.text), 'el administrador ve las tres guías');
  const todo = await get('/ayuda?todo=1', mesero);
  check(/Guía del ADMINISTRADOR/.test(todo.text) && /Guía del COCINERO/.test(todo.text), 'con "Ver toda la guía", el mesero ve todo');
  check(/<h3 id="[a-z0-9-]+">/.test(aa.text) && /<div class="table-responsive"><table/.test(aa.text) && /class="guia-nota"/.test(aa.text), 'se genera HTML con anclas, tablas con scroll y notas');
  check(!/\{roles=/.test(aa.text), 'las marcas internas {roles=…} no se muestran');
  check(/id="buscar"/.test(aa.text) && /Buscar en la guía/.test(aa.text), 'incluye el buscador');
  const dl = await fetch(`${B}/ayuda/guia.md`, { headers: { Cookie: mesero } });
  const md = await dl.text();
  check(dl.status === 200 && /attachment/.test(dl.headers.get('content-disposition') || '') && md.startsWith('# Guía de uso de Restaurant Martin'), 'la guía se puede descargar como archivo');
  check((await fetch(`${B}/ayuda/guia.md`, { redirect: 'manual' })).status === 302, 'la descarga exige sesión');

  console.log('\n--- Que la guía cubra todas las funciones ---');
  const claves = ['Mesas', 'Delivery', 'Cocina', 'Reservas', 'Inventario', 'Dashboard', 'Productos', 'Clientes', 'Usuarios', 'Ventas', 'Stripe', 'Vapi', 'WhatsApp', 'QR del menú', 'Venta rápida', 'Facturar', 'Consumidor final', 'Efectivo', 'Transferencia', 'Pago mixto', 'Instalar', 'Cerrar sesión', 'contraseña', 'Glosario'];
  const faltan = claves.filter((k) => !md.includes(k));
  check(faltan.length === 0, `la guía menciona todas las funciones clave${faltan.length ? ' — faltan: ' + faltan.join(', ') : ''}`);
  const rutas = ['/dashboard', '/mesas', '/delivery', '/conversaciones', '/cocina', '/reservas', '/productos', '/inventario', '/clientes', '/usuarios', '/ventas'];
  for (const p of rutas) { const r = await get(p, admin); if (r.status !== 200) check(false, `ruta ${p} responde ${r.status}`); }
  check(true, 'todas las pantallas del administrador existen (guía = programa)');

  console.log('\n--- Menú y ajustes para móviles ---');
  const m = await get('/mesas', mesero);
  check(/navbar-toggler/.test(m.text) && /data-bs-target="#navPrincipal"/.test(m.text), 'el menú tiene botón ☰ para teléfonos');
  check(/rm-nav-txt">Mesas</.test(m.text) && /rm-nav-txt">Ayuda</.test(m.text) && /aria-current="page"/.test(m.text), 'el menú muestra nombres, "Ayuda" y marca la pantalla actual');
  check(!/>Ventas</.test(m.text) && !/>Usuarios</.test(m.text), 'el mesero NO ve Ventas ni Usuarios en el menú');
  const k = await get('/cocina', cocinero);
  check(/rm-nav-txt">Cocina</.test(k.text) && !/>Mesas</.test(k.text), 'el cocinero solo ve Cocina y Ayuda');
  for (const [nombre, html] of [['login', (await get('/login')).text], ['mesas', m.text], ['cocina', k.text], ['ayuda', aa.text], ['venta rápida', (await get('/', admin)).text], ['menú QR de reservas', (await get('/reservar')).text]]) {
    const ok = /viewport-fit=cover/.test(html) && /apple-touch-icon/.test(html) && /apple-mobile-web-app-capable/.test(html) && /rel="manifest"/.test(html) && /movil\.css/.test(html);
    check(ok, `${nombre}: viewport con zonas seguras, ícono de iPhone, manifest y CSS móvil`);
  }
  const ic = await fetch(`${B}/icons/apple-touch-icon.png`);
  const buf = Buffer.from(await ic.arrayBuffer());
  check(ic.status === 200 && buf.readUInt32BE(16) === 180 && buf.readUInt32BE(20) === 180, 'ícono de iPhone 180×180 disponible');
  const man = await (await fetch(`${B}/manifest.webmanifest`)).json();
  check(man.display === 'standalone' && man.id === '/' && man.icons.some((i) => i.purpose === 'maskable'), 'manifest listo para instalar en Android');
  const css = await fetch(`${B}/css/movil.css`);
  const ct = await css.text();
  check(css.status === 200 && /safe-area-inset/.test(ct) && /font-size: 16px/.test(ct) && /pointer: coarse/.test(ct), 'CSS móvil: zonas seguras, sin zoom de iOS y tamaños táctiles');
  check((await fetch(`${B}/js/movil.js`)).status === 200, 'script móvil disponible');
  check(/CSS|text\/css/i.test(css.headers.get('content-type') || ''), 'el CSS móvil se sirve con el tipo correcto');

  console.log(`\n==== ${fallos === 0 ? 'TODO OK' : fallos + ' FALLO(S)'} ====`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
