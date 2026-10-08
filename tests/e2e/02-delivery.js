const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Delivery, configuración de agentes y regresión de cocina (se ejecuta DESPUÉS de smoke2.js)
process.chdir(ROOT);
const db = require(ROOT + 'db.js');
const delivery = require(ROOT + 'services/delivery.js');
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

(async () => {
  const admin = jar(), mesero = jar(), cocinero = jar();
  await call(admin, 'POST', '/login', { usuario: 'admin', password: 'Prueba#2026' }, { form: true, expect: 302 });
  await call(mesero, 'POST', '/login', { usuario: 'mesero1', password: 'Mesero#2026' }, { form: true, expect: 302 });
  await call(cocinero, 'POST', '/login', { usuario: 'cocina1', password: 'Cocina#2026' }, { form: true, expect: 302 });

  console.log('\n--- Configuración de agentes (horario, zonas, FAQ) ---');
  const horarios = [0, 1, 2, 3, 4, 5, 6].map((d) => d === 1 ? { dia: 1, cerrado: 1, delivery: 0 } : { dia: d, abre: '11:00', cierra: d >= 5 ? '01:00' : '23:00', cerrado: 0, delivery: 1 });
  const cfg = { delivery_activo: 1, pedido_minimo_delivery: 500, tiempo_preparacion_min: 20, datos_transferencia: 'Banco Popular 123456 Restaurant Martin SRL', telefono_humano: '809-555-9999' };
  await call(admin, 'PUT', '/api/negocio', { config: cfg, horarios: horarios.map((h) => ({ ...h, abre: h.abre || '', cierra: h.cierra || '' })).map((h) => h.dia === 3 ? { ...h, abre: '', cerrado: 0 } : h) }, { expect: 400 });
  await call(admin, 'PUT', '/api/negocio', { config: cfg, horarios, zonas: [{ nombre: 'Bávaro', costo_envio: 150, minutos_estimados: 30, activa: 1 }, { nombre: 'bávaro', costo_envio: 1, minutos_estimados: 30, activa: 1 }] }, { expect: 400 });
  const sv = await call(admin, 'PUT', '/api/negocio', {
    config: cfg, horarios,
    zonas: [{ nombre: 'Bávaro', costo_envio: 150, minutos_estimados: 30, activa: 1 }, { nombre: 'Cap Cana', costo_envio: 250, minutos_estimados: 45, activa: 1 }],
    faq: [{ pregunta: '¿Tienen parqueo?', respuesta: 'Sí, gratuito.' }, { pregunta: '', respuesta: 'se ignora' }]
  });
  check(sv.data.zonas.length === 2 && sv.data.faq.length === 1 && sv.data.horarios[1].cerrado === 1 && sv.data.horarios[5].cierra === '01:00', 'zonas, FAQ y horario guardados y devueltos');
  const zBav = sv.data.zonas.find((z) => z.nombre === 'Bávaro');
  const zCap = sv.data.zonas.find((z) => z.nombre === 'Cap Cana');
  await call(mesero, 'PUT', '/api/negocio', {}, { expect: 403 });
  await call(admin, 'GET', '/configuracion/agentes', undefined, { expect: 200 });

  console.log('\n--- Delivery: pedido del personal de punta a punta (efectivo) ---');
  const mk = async (codigo, nombre, precio) => (await call(admin, 'POST', '/productos', { codigo, nombre, precio_unidad: precio, categoria: 'Delivery test', en_menu: 1, disponible: 1 }, { expect: 201 })).data.id;
  const pollo = await mk('POL1', 'Pollo asado', 600);
  const refresco = await mk('REF1', 'Refresco', 100);
  const privado = (await call(admin, 'POST', '/productos', { codigo: 'PRV1', nombre: 'Plato fuera de carta', precio_unidad: 900, en_menu: 0, disponible: 1 }, { expect: 201 })).data.id;
  const none = await call(mesero, 'GET', '/api/delivery/cliente?telefono=8095550001');
  check(none.data === null, 'teléfono nuevo: sin cliente previo');

  const base = { tipo: 'delivery', telefono: '809-555-0001', nombre: 'Luis', direccion: 'Hotel Riu, Bávaro', zona_id: zBav.id, metodo_pago: 'efectivo' };
  await call(mesero, 'POST', '/api/delivery', { ...base, items: [] }, { expect: 400 });
  await call(mesero, 'POST', '/api/delivery', { ...base, zona_id: null, items: [{ producto_id: pollo, cantidad: 1 }] }, { expect: 400 });
  await call(mesero, 'POST', '/api/delivery', { ...base, direccion: '', items: [{ producto_id: pollo, cantidad: 1 }] }, { expect: 400 });
  await call(mesero, 'POST', '/api/delivery', { ...base, telefono: '', items: [{ producto_id: pollo, cantidad: 1 }] }, { expect: 400 });
  const p1 = await call(mesero, 'POST', '/api/delivery', { ...base, items: [{ producto_id: pollo, cantidad: 2, nota: 'sin picante' }, { producto_id: refresco, cantidad: 1 }] }, { expect: 201 });
  check(p1.data.total === 1450 && p1.data.costo_envio === 150 && /^DEL-\d+$/.test(p1.data.codigo), `total 1.450 = 1.300 + 150 de envío (${p1.data.total}, ${p1.data.codigo})`);
  check(p1.data.minutos_estimados === 50, `tiempo estimado 20 prep + 30 zona = 50 (${p1.data.minutos_estimados})`);

  let lista = (await call(mesero, 'GET', '/api/delivery')).data;
  let t1 = lista.find((x) => x.id === p1.data.pedido_id);
  check(t1 && t1.columna === 'en_cocina' && t1.items.length === 2 && t1.items.every((i) => i.nombre !== 'Costo de envío'), 'tablero: en cocina, sin la línea técnica de envío');

  const cola = (await call(cocinero, 'GET', '/api/cocina/cola')).data;
  const itemsCocina = cola.filter((i) => i.pedido_id === p1.data.pedido_id);
  check(itemsCocina.length === 2 && itemsCocina[0].mesa_numero === p1.data.codigo && itemsCocina[0].tipo === 'delivery' && itemsCocina[0].mesa_id === null, 'cocina ve el pedido como DEL-n (sin mesa) y sin cobro de envío');
  await call(cocinero, 'PUT', `/api/cocina/pedido/${p1.data.pedido_id}/preparar`, {});
  await call(mesero, 'POST', `/api/delivery/${p1.data.pedido_id}/en-camino`, {}, { expect: 400 });
  for (const it of itemsCocina) await call(cocinero, 'PUT', `/api/cocina/item/${it.id}/estado`, { estado: 'listo' });
  lista = (await call(mesero, 'GET', '/api/delivery')).data;
  check(lista.find((x) => x.id === p1.data.pedido_id).columna === 'listo', 'tablero: columna "listo" derivada de cocina');
  await call(mesero, 'POST', `/api/delivery/${p1.data.pedido_id}/repartidor`, { repartidor: 'Pedro' });
  await call(mesero, 'POST', `/api/delivery/${p1.data.pedido_id}/en-camino`, {});
  const ent = await call(mesero, 'POST', `/api/delivery/${p1.data.pedido_id}/entregar`, {});
  const [[fac]] = await db.query('SELECT total, forma_pago FROM facturas WHERE id = ?', [ent.data.factura_id]);
  const [det] = await db.query('SELECT p.nombre, d.subtotal FROM detalle_factura d JOIN productos p ON p.id = d.producto_id WHERE d.factura_id = ? ORDER BY 1', [ent.data.factura_id]);
  check(fac.total === 1450 && fac.forma_pago === 'efectivo' && det.length === 3 && det.some((d) => d.nombre === 'Costo de envío'), 'factura de 1.450 con envío incluido, pagada en efectivo');
  await call(mesero, 'POST', `/api/delivery/${p1.data.pedido_id}/entregar`, {}, { expect: 400 });
  const cli = await call(mesero, 'GET', '/api/delivery/cliente?telefono=%2B1%20(809)%20555-0001');
  check(cli.data && cli.data.nombre === 'Luis' && /Riu/.test(cli.data.direccion), 'cliente reconocido por teléfono (cualquier formato) con su dirección habitual');

  console.log('\n--- Avisos, Stripe y transferencia ---');
  const p2 = await call(mesero, 'POST', '/api/delivery', { ...base, telefono: '8095550002', nombre: 'Ana', zona_id: zCap.id, metodo_pago: 'stripe', confirmar: false, items: [{ producto_id: pollo, cantidad: 1 }] }, { expect: 201 });
  const al = (await call(mesero, 'GET', '/api/mesa-alertas')).data;
  check(al.some((a) => a.tipo === 'pedido_delivery' && a.es_pedido && a.mesa_numero === p2.data.codigo), 'aviso de "pedido por confirmar" para el personal');
  lista = (await call(mesero, 'GET', '/api/delivery')).data;
  check(lista.find((x) => x.id === p2.data.pedido_id).columna === 'por_confirmar', 'pedido sin confirmar queda en "Por confirmar"');
  await call(mesero, 'POST', `/api/delivery/${p2.data.pedido_id}/cobro-stripe`, {}, { expect: 400 });
  await call(mesero, 'POST', `/api/delivery/${p2.data.pedido_id}/entregar`, {}, { expect: 400 });
  await call(mesero, 'POST', `/api/delivery/${p2.data.pedido_id}/confirmar`, {});
  await call(mesero, 'POST', `/api/delivery/${p2.data.pedido_id}/confirmar`, {}, { expect: 400 });
  check((await call(mesero, 'GET', '/api/mesa-alertas')).data.every((a) => a.mesa_numero !== p2.data.codigo), 'al confirmar, el aviso se cierra');
  // cobro Stripe simulado ya pagado
  const [spIns] = await db.query(`INSERT INTO stripe_pagos (session_id, pedido_id, monto, moneda, estado, payment_intent) VALUES ('cs_test_deliv1', ?, ?, 'dop', 'pagado', 'pi_deliv1')`, [p2.data.pedido_id, p2.data.total]);
  await db.query('UPDATE pedidos SET stripe_pago_id = ? WHERE id = ?', [spIns.insertId, p2.data.pedido_id]);
  const cola2 = (await call(cocinero, 'GET', '/api/cocina/cola')).data.filter((i) => i.pedido_id === p2.data.pedido_id);
  for (const it of cola2) await call(cocinero, 'PUT', `/api/cocina/item/${it.id}/estado`, { estado: 'preparando' });
  for (const it of cola2) await call(cocinero, 'PUT', `/api/cocina/item/${it.id}/estado`, { estado: 'listo' });
  const e2 = await call(mesero, 'POST', `/api/delivery/${p2.data.pedido_id}/entregar`, {}, { expect: 200 });
  const [fp2] = await db.query('SELECT metodo, monto, referencia FROM factura_pagos WHERE factura_id = ?', [e2.data.factura_id]);
  check(fp2[0].metodo === 'tarjeta' && fp2[0].referencia === 'Stripe pi_deliv1' && fp2[0].monto === 850, `pedido pagado con Stripe se factura como tarjeta (${JSON.stringify(fp2[0])})`);

  const p3 = await call(mesero, 'POST', '/api/delivery', { ...base, telefono: '8095550003', nombre: 'Marta', metodo_pago: 'transferencia', items: [{ producto_id: refresco, cantidad: 3 }] }, { expect: 201 });
  const cola3 = (await call(cocinero, 'GET', '/api/cocina/cola')).data.filter((i) => i.pedido_id === p3.data.pedido_id);
  for (const it of cola3) { await call(cocinero, 'PUT', `/api/cocina/item/${it.id}/estado`, { estado: 'preparando' }); await call(cocinero, 'PUT', `/api/cocina/item/${it.id}/estado`, { estado: 'listo' }); }
  await call(mesero, 'POST', `/api/delivery/${p3.data.pedido_id}/entregar`, {}, { expect: 400 });
  await call(mesero, 'POST', `/api/delivery/${p3.data.pedido_id}/validar-pago`, {});
  await call(mesero, 'POST', `/api/delivery/${p3.data.pedido_id}/entregar`, {}, { expect: 200 });

  console.log('\n--- Cancelación y para llevar ---');
  const p4 = await call(mesero, 'POST', '/api/delivery', { ...base, telefono: '8095550004', confirmar: false, items: [{ producto_id: pollo, cantidad: 1 }] }, { expect: 201 });
  await call(mesero, 'POST', `/api/delivery/${p4.data.pedido_id}/cancelar`, { motivo: 'Cliente no contesta' });
  const [[c4]] = await db.query('SELECT estado, estado_delivery FROM pedidos WHERE id = ?', [p4.data.pedido_id]);
  check(c4.estado === 'cancelado' && c4.estado_delivery === 'cancelado', 'pedido cancelado');
  await call(mesero, 'POST', `/api/delivery/${p4.data.pedido_id}/cancelar`, {}, { expect: 400 });
  await call(mesero, 'POST', `/api/delivery/${p1.data.pedido_id}/cancelar`, {}, { expect: 400 });
  const p5 = await call(mesero, 'POST', '/api/delivery', { tipo: 'para_llevar', nombre: 'Sin teléfono', items: [{ producto_id: refresco, cantidad: 1 }] }, { expect: 201 });
  check(/^LLEVAR-\d+$/.test(p5.data.codigo) && p5.data.costo_envio === 0, 'para llevar sin teléfono ni envío');

  console.log('\n--- Reglas para agentes (servicio) ---');
  const c = await db.getConnection();
  try {
    const intenta = async (datos, texto) => {
      try { await c.beginTransaction(); await delivery.crearPedido(c, datos); await c.rollback(); check(false, `debía rechazar: ${texto}`); }
      catch (e) { await c.rollback().catch(() => {}); check(e.publico === true, `rechaza (${texto}): ${e.message}`); }
    };
    const baseAg = { tipo: 'delivery', origen: 'whatsapp', telefono: '8095550009', nombre: 'Bot', direccion: 'Calle 1, Bávaro', zonaId: zBav.id, metodoPago: 'efectivo', soloMenu: true };
    await intenta({ ...baseAg, items: [{ producto_id: refresco, cantidad: 1 }] }, 'por debajo del mínimo de 500');
    await intenta({ ...baseAg, items: [{ producto_id: privado, cantidad: 1 }] }, 'plato fuera de la carta');
    await db.query('UPDATE configuracion_impresion SET delivery_activo = 0');
    await intenta({ ...baseAg, items: [{ producto_id: pollo, cantidad: 2 }] }, 'delivery pausado');
    await db.query('UPDATE configuracion_impresion SET delivery_activo = 1');
    await c.beginTransaction();
    const ok = await delivery.crearPedido(c, { ...baseAg, items: [{ producto_id: pollo, cantidad: 2 }] });
    await c.commit();
    check(ok.total === 1350 && ok.metodo_pago === 'efectivo', `agente de WhatsApp crea pedido válido (${ok.codigo}, ${ok.total})`);
    const st = await delivery.estadoPorTelefono(db, '+1 809 555 0009');
    check(st && st.estado === 'por_confirmar', 'consulta de estado por teléfono');
  } finally { c.release(); }

  console.log('\n--- Dashboard y cocina (regresión) ---');
  const dsh = await call(admin, 'GET', '/api/dashboard');
  check(dsh.data.delivery && Number(dsh.data.delivery.entregado) >= 3, `dashboard con delivery: ${JSON.stringify(dsh.data.delivery)}`);
  check(!dsh.data.top.some((t) => t.nombre === 'Costo de envío'), 'el envío no aparece como producto más vendido');
  await call(admin, 'GET', '/delivery', undefined, { expect: 200 });
  await call(mesero, 'GET', '/delivery', undefined, { expect: 200 });
  await call(cocinero, 'GET', '/delivery', undefined, { expect: 403 });
  await call(cocinero, 'GET', '/api/cocina/entregados');
  await call(cocinero, 'GET', '/api/cocina/rechazados');
  await call(admin, 'GET', '/ventas?desde=2020-01-01&hasta=2099-12-31', undefined, { expect: 200 });

  console.log(`\n==== ${fallos === 0 ? 'TODO OK' : fallos + ' FALLO(S)'} ====`);
  await db.end();
  process.exit(fallos === 0 ? 0 : 1);
})().catch(async (e) => { console.error('ERROR', e); await db.end(); process.exit(1); });
