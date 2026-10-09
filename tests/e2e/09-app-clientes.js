const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// App para clientes (/pedir): menú público, pedidos sin cuenta, pago en línea (cripto con BTCPay simulado),
// seguimiento con token, cancelación, antiabuso y botón de apagado. Se ejecuta DESPUÉS de las suites 01 a 08.
process.chdir(ROOT);
const http = require('http');
const db = require(ROOT + 'db.js');
const appClientes = require(ROOT + 'services/appClientes.js');
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
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${method.padEnd(6)} ${path.padEnd(46)} ${r.status} ${show}`);
  return { status: r.status, data, text: txt };
}
const check = (c, m) => { if (!c) fallos++; console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); };

// ---------- BTCPay falso (mínimo) ----------
const btc = { facturas: {}, n: 0 };
const servidor = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const json = (o, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== `token ${API_KEY}`) return json({ message: 'unauthorized' }, 401);
    const b = body ? JSON.parse(body) : {};
    const base = `/api/v1/stores/${STORE}`;
    const m = req.url.match(new RegExp(`^${base}/invoices/([^/]+)(/payment-methods|/status)?$`));
    if (req.method === 'GET' && req.url === base) return json({ id: STORE, name: 'Tienda de Prueba' });
    if (req.method === 'POST' && req.url === `${base}/invoices`) {
      const id = `APP${++btc.n}`;
      btc.facturas[id] = { id, status: 'New', checkout: b.checkout };
      return json({ id, status: 'New', checkoutLink: `${BTC}/i/${id}` });
    }
    if (m && req.method === 'GET' && !m[2]) { const f = btc.facturas[m[1]]; return f ? json(f) : json({ message: 'no existe' }, 404); }
    if (m && req.method === 'GET' && m[2] === '/payment-methods') return json([{ paymentMethodId: 'BTC-LN', paymentLink: 'lightning:lnbc1test', amount: '0.0005' }]);
    if (m && req.method === 'POST' && m[2] === '/status') { const f = btc.facturas[m[1]]; if (!f || f.status !== 'New') return json({ message: 'no se puede' }, 422); f.status = b.status; return json(f); }
    json({ message: 'not found' }, 404);
  });
});

(async () => {
  await new Promise((r) => servidor.listen(4803, r));
  const admin = jar(), mesero = jar(), anon = jar();
  await call(admin, 'POST', '/login', { usuario: 'admin', password: 'Prueba#2026' }, { form: true, expect: 302 });
  await call(mesero, 'POST', '/login', { usuario: 'mesero1', password: 'Mesero#2026' }, { form: true, expect: 302 });

  // Las suites anteriores pudieron dejar Stripe o cripto activos: esta parte parte de cero
  await db.query('UPDATE configuracion_impresion SET stripe_habilitado = 0, cripto_habilitado = 0');

  console.log('--- Preparación: horario abierto todo el día, zona, datos bancarios y productos ---');
  const horarios = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia: d, abre: '00:00', cierra: '23:59', cerrado: 0, delivery: 1 }));
  const cfg = { delivery_activo: 1, pedido_minimo_delivery: 500, tiempo_preparacion_min: 20, datos_transferencia: 'Banco Popular 123456 Restaurant Martin SRL', telefono_humano: '809-555-9999' };
  const guardarNegocio = (h) => call(admin, 'PUT', '/api/negocio', { config: cfg, horarios: h, zonas: [{ nombre: 'Bávaro', costo_envio: 150, minutos_estimados: 30, activa: 1 }], faq: [] });
  const sv = await guardarNegocio(horarios);
  const zona = sv.data.zonas[0];
  const mk = async (codigo, nombre, precio, extra = {}) => (await call(admin, 'POST', '/productos', { codigo, nombre, precio_unidad: precio, categoria: 'App test', en_menu: 1, disponible: 1, ...extra }, { expect: 201 })).data.id;
  const pollo = await mk('APP1', 'Pica pollo (app)', 600, { plato_del_dia: 1, descripcion: 'Con tostones' });
  const refresco = await mk('APP2', 'Refresco (app)', 100);
  const agotado = await mk('APP3', 'Plato agotado (app)', 700, { disponible: 0 });
  const oculto = await mk('APP4', 'Plato oculto (app)', 800, { en_menu: 0 });

  console.log('\n--- App pública: páginas y catálogo ---');
  const pag = await call(anon, 'GET', '/pedir', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(pag.text.includes('/pedir/manifest.webmanifest') && pag.text.includes('/js/pedir.js'), 'la página /pedir enlaza su manifiesto propio y su script');
  const man = await call(anon, 'GET', '/pedir/manifest.webmanifest', undefined, { expect: 200 });
  check(man.data.scope === '/pedir' && man.data.start_url.startsWith('/pedir') && man.data.display === 'standalone' && man.data.icons.length >= 2, 'manifiesto instalable: abre en /pedir, modo app, con íconos');
  const cat = (await call(anon, 'GET', '/api/pedir/catalogo')).data;
  check(cat.abierto === true && cat.activa === true, 'catálogo: abierto y activo');
  const idsCat = cat.productos.map((p) => p.id);
  check(idsCat.includes(pollo) && idsCat.includes(agotado) && !idsCat.includes(oculto), 'solo salen los productos del menú (los ocultos no)');
  check(cat.productos.find((p) => p.id === pollo).platoDelDia === true && cat.productos.find((p) => p.id === agotado).disponible === false, 'plato del día marcado y agotado señalado');
  check(cat.delivery.zonas.length === 1 && cat.delivery.pedidoMinimo === 500, 'zonas de entrega y pedido mínimo');
  const ids = cat.formasPago.map((f) => f.id);
  check(ids.includes('efectivo') && ids.includes('transferencia') && !ids.includes('tarjeta') && !ids.includes('cripto'), `formas de pago disponibles hoy: ${ids.join(', ')}`);
  check(!JSON.stringify(cat).includes('Banco Popular'), 'los datos bancarios no se exponen en el catálogo');

  console.log('\n--- Validaciones del pedido ---');
  const base = { tipo: 'para_llevar', nombre: 'Marta', telefono: '809-555-0201', metodoPago: 'efectivo', items: [{ producto_id: pollo, cantidad: 2 }] };
  await call(anon, 'POST', '/api/pedir/pedido', { ...base, items: [] }, { expect: 400 });
  await call(anon, 'POST', '/api/pedir/pedido', { ...base, nombre: '' }, { expect: 400 });
  await call(anon, 'POST', '/api/pedir/pedido', { ...base, telefono: '123' }, { expect: 400 });
  await call(anon, 'POST', '/api/pedir/pedido', { ...base, metodoPago: 'tarjeta' }, { expect: 400 });
  await call(anon, 'POST', '/api/pedir/pedido', { ...base, items: [{ producto_id: agotado, cantidad: 1 }] }, { expect: 400 });
  await call(anon, 'POST', '/api/pedir/pedido', { ...base, items: [{ producto_id: oculto, cantidad: 1 }] }, { expect: 400 });
  await call(anon, 'POST', '/api/pedir/pedido', { ...base, tipo: 'delivery', direccion: '', zonaId: zona.id }, { expect: 400 });
  await call(anon, 'POST', '/api/pedir/pedido', { ...base, tipo: 'delivery', direccion: 'Calle 1 #2, Bávaro', zonaId: null }, { expect: 400 });
  const corto = await call(anon, 'POST', '/api/pedir/pedido', { ...base, tipo: 'delivery', direccion: 'Calle 1 #2, Bávaro', zonaId: zona.id, items: [{ producto_id: refresco, cantidad: 1 }] }, { expect: 400 });
  check(/mínimo/i.test(corto.data.error), 'el pedido mínimo de delivery se respeta');

  console.log('\n--- Pedido para recoger, efectivo ---');
  const p1 = await call(anon, 'POST', '/api/pedir/pedido', { ...base, items: [{ producto_id: pollo, cantidad: 2, precio: 1 }] }, { expect: 201 });
  check(/^[a-f0-9]{36}$/.test(p1.data.token) && p1.data.total === 1200 && /^LLEVAR-\d+$/.test(p1.data.codigo), `total 1.200 con precio de la base (no del cliente) y token secreto (${p1.data.total}, ${p1.data.codigo})`);
  let s = (await call(anon, 'GET', `/api/pedir/pedido/${p1.data.token}`)).data;
  check(s.fase === 'recibido' && s.items.length === 1 && s.items[0].cantidad === 2 && s.pago.metodo === 'efectivo' && s.puedeCancelar === true, 'seguimiento: recibido, con sus platos y opción de cancelar');
  check(!('id' in s) && !JSON.stringify(s).includes('cliente_id'), 'el seguimiento no expone ids internos');
  await call(anon, 'GET', `/api/pedir/pedido/${'0'.repeat(36)}`, undefined, { expect: 404 });
  await call(anon, 'GET', '/api/pedir/pedido/no-es-un-token', undefined, { expect: 404 });
  const vista = await call(anon, 'GET', `/pedir/pedido/${p1.data.token}`, undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(vista.text.includes(p1.data.token), 'la página de seguimiento se abre con el token');

  const lista = (await call(mesero, 'GET', '/api/delivery')).data;
  const t1 = lista.find((x) => x.codigo === p1.data.codigo);
  check(t1 && t1.origen === 'app' && t1.columna === 'por_confirmar' && t1.cliente_nombre === 'Marta', 'el personal lo ve en el tablero de Delivery con origen "app", por confirmar');
  const [[alerta]] = await db.query(`SELECT COUNT(*) AS n FROM mesa_alertas WHERE pedido_id = ? AND tipo = 'pedido_delivery'`, [t1.id]);
  check(alerta.n === 1, 'el personal recibe el aviso de pedido nuevo');
  await call(mesero, 'POST', `/api/delivery/${t1.id}/confirmar`, {});
  s = (await call(anon, 'GET', `/api/pedir/pedido/${p1.data.token}`)).data;
  check(s.fase === 'preparando' && s.puedeCancelar === false, 'al confirmar el personal, el cliente ve "preparando" y ya no puede cancelar');
  await call(anon, 'POST', `/api/pedir/pedido/${p1.data.token}/cancelar`, {}, { expect: 400 });

  console.log('\n--- Delivery con transferencia y cancelación del cliente ---');
  const d1 = await call(anon, 'POST', '/api/pedir/pedido', { tipo: 'delivery', nombre: 'Luis', telefono: '829-555-0202', direccion: 'Hotel Riu, Bávaro', zonaId: zona.id, metodoPago: 'transferencia', items: [{ producto_id: pollo, cantidad: 1 }, { producto_id: refresco, cantidad: 1 }] }, { expect: 201 });
  check(d1.data.total === 850 && /^DEL-\d+$/.test(d1.data.codigo), `delivery: 700 + 150 de envío = 850 (${d1.data.total})`);
  s = (await call(anon, 'GET', `/api/pedir/pedido/${d1.data.token}`)).data;
  check(s.pago.datosTransferencia && s.pago.datosTransferencia.includes('Banco Popular') && s.direccion === 'Hotel Riu, Bávaro', 'tras pedir, el cliente ve los datos de la transferencia');
  await call(anon, 'POST', `/api/pedir/pedido/${d1.data.token}/cancelar`, {});
  s = (await call(anon, 'GET', `/api/pedir/pedido/${d1.data.token}`)).data;
  check(s.fase === 'cancelado', 'el cliente puede cancelar mientras está por confirmar');

  console.log('\n--- Antiabuso ---');
  const spam = { ...base, telefono: '849-555-0203' };
  await call(anon, 'POST', '/api/pedir/pedido', spam, { expect: 201 });
  await call(anon, 'POST', '/api/pedir/pedido', spam, { expect: 201 });
  await call(anon, 'POST', '/api/pedir/pedido', spam, { expect: 201 });
  const bloq = await call(anon, 'POST', '/api/pedir/pedido', spam, { expect: 429 });
  check(/espera/i.test(bloq.data.error), 'más de 3 pedidos seguidos del mismo teléfono se frenan');

  console.log('\n--- Pago en línea con cripto (BTCPay simulado) ---');
  await call(admin, 'POST', '/configuracion/cripto', { habilitado: '1', url: BTC, storeId: STORE, apiKey: API_KEY, monedaCripto: (await call(mesero, 'GET', '/api/cripto/estado')).data.moneda });
  const cat2 = (await call(anon, 'GET', '/api/pedir/catalogo')).data;
  check(cat2.formasPago.some((f) => f.id === 'cripto'), 'la app ofrece cripto cuando está activo');
  const c1 = await call(anon, 'POST', '/api/pedir/pedido', { ...base, telefono: '809-555-0204', metodoPago: 'cripto' }, { expect: 201 });
  check(c1.data.pago && /\/i\/APP\d+$/.test(c1.data.pago.url) && c1.data.minutosParaPagar === 60, 'el pedido devuelve el enlace de pago de BTCPay');
  const inv = Object.values(btc.facturas).pop();
  check(inv.checkout.redirectURL && inv.checkout.redirectURL.includes(`/pedir/pedido/${c1.data.token}`), 'BTCPay devuelve al cliente a la página de su pedido');
  s = (await call(anon, 'GET', `/api/pedir/pedido/${c1.data.token}`)).data;
  check(s.fase === 'esperando_pago' && s.pago.url && !s.pago.pagado, 'seguimiento: esperando pago, con botón de pagar');
  const tc = (await call(mesero, 'GET', '/api/delivery')).data.find((x) => x.codigo === c1.data.codigo);
  check(tc && tc.cripto_estado === 'pendiente', 'el tablero muestra el cobro cripto pendiente');
  const noPago = await call(mesero, 'POST', `/api/delivery/${tc.id}/confirmar`, {}, { expect: 400 });
  check(/aún no ha pagado/.test(noPago.data.error), 'el personal no puede confirmar un pedido de la app sin pagar');
  btc.facturas[inv.id].status = 'Settled';
  await new Promise((r) => setTimeout(r, 4500)); // el seguimiento consulta a BTCPay como máximo cada 4 s
  s = (await call(anon, 'GET', `/api/pedir/pedido/${c1.data.token}`)).data;
  check(s.pago.pagado === true && s.fase === 'recibido' && s.pago.url === null, 'al pagar, el cliente ve "pago recibido" y desaparece el botón de pagar');
  await call(mesero, 'POST', `/api/delivery/${tc.id}/confirmar`, {});
  s = (await call(anon, 'GET', `/api/pedir/pedido/${c1.data.token}`)).data;
  check(s.fase === 'preparando' && s.puedeCancelar === false, 'ya pagado y confirmado: preparando, sin cancelar desde la app');

  // Pedido que no se paga: se cancela solo y se invalida el cobro
  const c2 = await call(anon, 'POST', '/api/pedir/pedido', { ...base, telefono: '809-555-0205', metodoPago: 'cripto' }, { expect: 201 });
  const inv2 = Object.values(btc.facturas).pop();
  const n = await appClientes.limpiarSinPago(0);
  s = (await call(anon, 'GET', `/api/pedir/pedido/${c2.data.token}`)).data;
  check(n >= 1 && s.fase === 'cancelado' && btc.facturas[inv2.id].status === 'Invalid', 'un pedido sin pagar se cancela solo y su cobro se invalida');

  console.log('\n--- Apagar la app y horario ---');
  await call(mesero, 'POST', '/configuracion/app-clientes', { activa: '0' }, { expect: 403 });
  await call(mesero, 'GET', '/configuracion/app-clientes', undefined, { expect: 403 });
  const pg = await call(admin, 'GET', '/configuracion/app-clientes', undefined, { expect: 200, headers: { Accept: 'text/html' } });
  check(pg.text.includes('/pedir') && pg.text.includes('data:image/png'), 'el administrador ve el enlace y el QR de la app');
  await call(admin, 'POST', '/configuracion/app-clientes', { activa: '0' });
  const off = await call(anon, 'POST', '/api/pedir/pedido', { ...base, telefono: '809-555-0206' }, { expect: 400 });
  check(/no estamos recibiendo/i.test(off.data.error) && (await call(anon, 'GET', '/api/pedir/catalogo')).data.activa === false, 'con la app apagada no se aceptan pedidos');
  await call(admin, 'POST', '/configuracion/app-clientes', { activa: '1' });
  await guardarNegocio(horarios.map((h) => ({ ...h, cerrado: 1, abre: '', cierra: '' })));
  const cerr = await call(anon, 'POST', '/api/pedir/pedido', { ...base, telefono: '809-555-0207' }, { expect: 400 });
  check(/cerrados/i.test(cerr.data.error) && (await call(anon, 'GET', '/api/pedir/catalogo')).data.abierto === false, 'fuera de horario no se aceptan pedidos');
  await guardarNegocio(horarios);

  servidor.close();
  await db.end();
  console.log(fallos ? `\n✖ ${fallos} comprobación(es) fallaron` : '\n✔ Suite de la app de clientes: todo correcto');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
