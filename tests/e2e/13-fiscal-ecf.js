const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Facturación fiscal de punta a punta con el proveedor de e-CF SIMULADO: numeración, impuestos, estados, inmutabilidad,
// notas de crédito, contingencia (serie B), secuencias agotadas y reportes 607/608.
// Se ejecuta DESPUÉS de las suites 01 a 12 (usa los usuarios creados por la 01) y deja el sistema en modo "no fiscal".
process.chdir(ROOT);
const db = require(ROOT + 'db.js');
const calculo = require(ROOT + 'services/fiscal/calculo.js');
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
const cerca = (a, b, tol = 0.005) => Math.abs(Number(a) - Number(b)) <= tol;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarEstado(id, estados, ms = 15000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const [[f]] = await db.query('SELECT fiscal_estado FROM facturas WHERE id = ?', [id]);
    if (estados.includes(f.fiscal_estado)) return f.fiscal_estado;
    await dormir(300);
  }
  const [[f]] = await db.query('SELECT fiscal_estado FROM facturas WHERE id = ?', [id]);
  return f.fiscal_estado;
}
const rncValido = (base8) => { // calcula el dígito verificador de un RNC
  const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
  const r = pesos.reduce((a, p, i) => a + p * Number(base8[i]), 0) % 11;
  return base8 + (r === 0 ? 2 : r === 1 ? 1 : 11 - r);
};
const RNC_EMISOR = rncValido('13112345');
const RNC_CLIENTE = rncValido('10200300');

(async () => {
  const admin = jar(), mesero = jar();
  await call(admin, 'POST', '/login', { usuario: 'admin', password: 'Prueba#2026' }, { form: true, expect: 302 });
  await call(mesero, 'POST', '/login', { usuario: 'mesero1', password: 'Mesero#2026' }, { form: true, expect: 302 });

  console.log('--- Configuración fiscal ---');
  const base = { modo: 'ecf_pruebas', proveedor: 'simulado', rnc: RNC_EMISOR, razonSocial: 'Restaurant Martin SRL', direccion: 'Calle Principal 1, Punta Cana', municipio: 'Higüey', provincia: 'La Altagracia',
    preciosIncluyenItbis: false, propinaActiva: true, propinaTasa: 10, propinaEnDelivery: false, propinaEnLlevar: false, propinaEnRapida: false };
  await call(mesero, 'GET', '/api/fiscal/config', undefined, { expect: 403 });
  await call(mesero, 'GET', '/fiscal', undefined, { expect: 403, headers: { Accept: 'text/html' } });
  await call(admin, 'POST', '/api/fiscal/config', { ...base, rnc: '123456789' }, { expect: 400 }); // dígito verificador malo
  await call(admin, 'POST', '/api/fiscal/config', { ...base, modo: 'ecf_produccion' }, { expect: 400 }); // sin secuencias reales ni proveedor real
  await call(admin, 'POST', '/api/fiscal/config', { ...base, propinaTasa: 55 }, { expect: 400 });
  await call(admin, 'POST', '/api/fiscal/config', base);
  const cfg = (await call(admin, 'GET', '/api/fiscal/config')).data;
  check(cfg.modo === 'ecf_pruebas' && cfg.emisor.rnc === RNC_EMISOR && cfg.proveedor === 'simulado', 'la configuración queda guardada');
  check(Array.isArray(cfg.checklist) && cfg.checklist.some((i) => !i.ok) && cfg.listo === false, 'la lista "¿Listo para facturar?" marca lo que falta');
  const st = (await call(mesero, 'GET', '/api/fiscal/estado')).data;
  check(st.modo === 'ecf_pruebas' && st.activo === true, 'el mesero puede ver el modo fiscal');

  console.log('\n--- Sin secuencias no se puede facturar ---');
  const plato = (await call(admin, 'POST', '/productos', { codigo: 'FIS1', nombre: 'Plato fiscal', precio_unidad: 1000, en_menu: 1, disponible: 1 }, { expect: 201 })).data.id;
  const exento = (await call(admin, 'POST', '/productos', { codigo: 'FIS2', nombre: 'Agua (exenta)', precio_unidad: 100, en_menu: 1, disponible: 1, itbis_tasa: 'E' }, { expect: 201 })).data.id;
  const [[pr]] = await db.query('SELECT itbis_tasa FROM productos WHERE id = ?', [exento]);
  check(pr.itbis_tasa === 'E', `el producto guarda su tasa de ITBIS (${pr.itbis_tasa})`);
  const cliente = (await call(admin, 'POST', '/api/clientes', { nombre: 'Cliente Fiscal', telefono: '8095559000' }, { expect: 201 })).data.id;
  let nMesa = 0;
  async function pedidoMesa(items) {
    const [mi] = await db.query(`INSERT INTO mesas (numero, descripcion) VALUES (?, 'Mesa fiscal')`, [`FIS-${++nMesa}-${Date.now() % 100000}`]);
    const ped = (await call(mesero, 'POST', '/api/mesas/abrir', { mesa_id: mi.insertId })).data.pedido;
    for (const it of items) await call(mesero, 'POST', `/api/mesas/pedidos/${ped.id}/items`, { producto_id: it.id, cantidad: it.cantidad || 1, precio: 1 }, { expect: 201 });
    return { id: ped.id, mesa: mi.insertId };
  }
  const p0 = await pedidoMesa([{ id: plato }]);
  await call(mesero, 'POST', `/api/mesas/pedidos/${p0.id}/facturar`, { cliente_id: cliente, pagos: [{ metodo: 'efectivo', monto: 1280 }] }, { expect: 400 });
  const [[abierto]] = await db.query('SELECT estado FROM pedidos WHERE id = ?', [p0.id]);
  check(abierto.estado !== 'cerrado', 'el pedido sigue abierto: no se perdió la venta');

  console.log('\n--- Secuencias ---');
  await call(admin, 'POST', '/api/fiscal/secuencias', { tipo: 'E32', desde: 0, hasta: 10, vence: '2030-01-01' }, { expect: 400 });
  await call(admin, 'POST', '/api/fiscal/secuencias', { tipo: 'E32', desde: 1, hasta: 10 }, { expect: 400 }); // falta vencimiento
  await call(mesero, 'POST', '/api/fiscal/secuencias/practica', {}, { expect: 403 });
  const pr_ = await call(admin, 'POST', '/api/fiscal/secuencias/practica', {});
  check(pr_.data.creadas === 6, 'se cargan 6 secuencias de práctica');
  await call(admin, 'POST', '/api/fiscal/secuencias', { tipo: 'E32', desde: 5, hasta: 50, vence: '2030-01-01', practica: true }, { expect: 400 }); // se cruza
  const sec = (await call(admin, 'GET', '/api/fiscal/secuencias')).data.secuencias;
  check(sec.length === 6 && sec.every((s) => s.estado === 'vigente'), 'las secuencias aparecen vigentes');

  console.log('\n--- Vista previa y factura de mesa (consumo E32) ---');
  const cot = await call(mesero, 'POST', '/api/fiscal/cotizar', { pedido_id: p0.id });
  check(cot.data.subtotal === 1000 && cot.data.itbis === 180 && cot.data.propina === 100 && cot.data.total === 1280 && cot.data.tipo_comprobante === 'E32', `cotización 1.000 + ITBIS 180 + propina 100 = 1.280 (${JSON.stringify(cot.data).slice(0, 110)})`);
  const f0 = await call(mesero, 'POST', `/api/mesas/pedidos/${p0.id}/facturar`, { cliente_id: cliente, pagos: [{ metodo: 'efectivo', monto: 1200 }] }, { expect: 400 }); // no cubre el total con impuestos
  check(/no cubre/.test(f0.data.error || ''), 'pagar solo 1.200 no alcanza: el total fiscal es 1.280');
  const f1 = await call(mesero, 'POST', `/api/mesas/pedidos/${p0.id}/facturar`, { cliente_id: cliente, pagos: [{ metodo: 'efectivo', monto: 1280 }] }, { expect: 201 });
  const [[fa]] = await db.query('SELECT * FROM facturas WHERE id = ?', [f1.data.factura_id]);
  check(fa.ncf === 'E320000000001' && fa.tipo_comprobante === 'E32', `primer e-NCF E320000000001 (${fa.ncf})`);
  check(Number(fa.total) === 1280 && Number(fa.itbis_total) === 180 && Number(fa.propina) === 100 && Number(fa.subtotal_gravado_18) === 1000, 'la factura guarda base, ITBIS, propina y total');
  const est = await esperarEstado(fa.id, ['aceptado', 'rechazado']);
  check(est === 'aceptado', `el proveedor simulado la acepta (${est})`);
  const [[fb]] = await db.query('SELECT * FROM facturas WHERE id = ?', [fa.id]);
  check(/^[0-9A-F]{6}$/.test(fb.codigo_seguridad || '') && /ConsultaTimbre/.test(fb.qr_url || '') && fb.fecha_firma && fb.track_id, 'guarda código de seguridad, QR, fecha de firma y track id');
  const [[det]] = await db.query('SELECT itbis_tasa, base, itbis FROM detalle_factura WHERE factura_id = ?', [fa.id]);
  check(det.itbis_tasa === '18' && Number(det.base) === 1000 && Number(det.itbis) === 180, 'la línea guarda su tasa, base e ITBIS');
  const [[ev]] = await db.query(`SELECT COUNT(*) AS n FROM fiscal_eventos WHERE factura_id = ? AND evento IN ('emitida','envio')`, [fa.id]);
  check(Number(ev.n) === 2, 'la bitácora fiscal registra la emisión y el envío');

  console.log('\n--- Inmutabilidad (trigger) ---');
  const intenta = async (sql, params, m) => { let msg = null; try { await db.query(sql, params); } catch (e) { msg = e.message; } check(msg && /no se puede|no puede/.test(msg), m + (msg ? '' : ' (¡se permitió!)')); };
  await intenta('UPDATE facturas SET total = 1 WHERE id = ?', [fa.id], 'no se puede cambiar el total de una factura fiscal');
  await intenta('UPDATE facturas SET ncf = ? WHERE id = ?', ['E320000099999', fa.id], 'no se puede cambiar el NCF');
  await intenta('DELETE FROM facturas WHERE id = ?', [fa.id], 'no se puede borrar');
  await intenta('UPDATE detalle_factura SET cantidad = 9 WHERE factura_id = ?', [fa.id], 'no se pueden cambiar las líneas');
  await intenta('DELETE FROM factura_pagos WHERE factura_id = ?', [fa.id], 'no se pueden borrar los pagos');
  await intenta(`UPDATE facturas SET fiscal_estado = 'no_fiscal' WHERE id = ?`, [fa.id], 'no se puede volver a "no fiscal"');

  console.log('\n--- Numeración sin repetidos aunque se facture en paralelo ---');
  const pedidos = [];
  for (let i = 0; i < 6; i++) pedidos.push(await pedidoMesa([{ id: plato }]));
  const resp = await Promise.all(pedidos.map((p) => call(mesero, 'POST', `/api/mesas/pedidos/${p.id}/facturar`, { cliente_id: cliente, pagos: [{ metodo: 'efectivo', monto: 1280 }] }, { expect: 201 })));
  const ncfs = (await db.query('SELECT ncf FROM facturas WHERE id IN (?) ORDER BY ncf', [resp.map((r) => r.data.factura_id)]))[0].map((r) => r.ncf);
  check(new Set(ncfs).size === 6, `6 facturas en paralelo, 6 e-NCF distintos (${ncfs.join(', ')})`);
  const nums = ncfs.map((n) => Number(n.slice(3))).sort((a, b) => a - b);
  check(nums.every((n, i) => n === i + 2), `consecutivos, sin huecos (${nums.join(',')})`);
  const [[sq]] = await db.query(`SELECT siguiente FROM fiscal_secuencias WHERE tipo = 'E32'`);
  check(Number(sq.siguiente) === 8, `la secuencia avanza a 8 (${sq.siguiente})`);

  console.log('\n--- Crédito fiscal (E31) ---');
  const pCF = await pedidoMesa([{ id: plato }, { id: exento }]);
  const cotSin = await call(mesero, 'POST', '/api/fiscal/cotizar', { pedido_id: pCF.id });
  check(cotSin.data.subtotal === 1100 && cotSin.data.itbis === 180 && cotSin.data.propina === 110 && cotSin.data.total === 1390, `producto exento: ITBIS solo del plato, propina 10 % de 1.100 (${cotSin.data.total})`);
  await call(mesero, 'POST', `/api/mesas/pedidos/${pCF.id}/facturar`, { cliente_id: cliente, credito_fiscal: true, pagos: [{ metodo: 'efectivo', monto: 1390 }] }, { expect: 400 }); // cliente sin RNC
  await call(admin, 'PUT', `/api/clientes/${cliente}`, { nombre: 'Cliente Fiscal', telefono: '8095559000', tipo_documento: 'rnc', documento: '123456789', razon_social: 'Empresa X SRL' }, { expect: 400 }); // RNC inválido
  await call(admin, 'PUT', `/api/clientes/${cliente}`, { nombre: 'Cliente Fiscal', telefono: '8095559000', tipo_documento: 'rnc', documento: RNC_CLIENTE, razon_social: 'Empresa X SRL' });
  const cf = await call(mesero, 'POST', `/api/mesas/pedidos/${pCF.id}/facturar`, { cliente_id: cliente, credito_fiscal: true, pagos: [{ metodo: 'efectivo', monto: 1390 }] }, { expect: 201 });
  const [[fcf]] = await db.query('SELECT * FROM facturas WHERE id = ?', [cf.data.factura_id]);
  check(fcf.ncf === 'E310000000001' && fcf.comprador_documento === RNC_CLIENTE && fcf.comprador_nombre === 'Empresa X SRL', `E31 con el RNC y la razón social del comprador (${fcf.ncf})`);
  check(Number(fcf.subtotal_exento) === 100 && Number(fcf.subtotal_gravado_18) === 1000, 'separa lo gravado y lo exento');
  check(await esperarEstado(fcf.id, ['aceptado', 'rechazado']) === 'aceptado', 'el E31 es aceptado');

  console.log('\n--- Venta rápida: el servidor usa los precios de la base ---');
  const vr = await call(mesero, 'POST', '/api/facturas', { cliente_id: cliente, total: 1, forma_pago: 'efectivo', productos: [{ producto_id: plato, cantidad: 1, precio: 1, unidad: 'UND', subtotal: 1 }] }, { expect: 201 });
  const [[fvr]] = await db.query('SELECT * FROM facturas WHERE id = ?', [vr.data.id]);
  check(Number(fvr.total) === 1180 && Number(fvr.itbis_total) === 180 && Number(fvr.propina) === 0, `el mesero no puede bajar el precio: cobra 1.000 + ITBIS = 1.180 sin propina (${fvr.total})`);
  const vr2 = await call(admin, 'POST', '/api/facturas', { cliente_id: cliente, forma_pago: 'efectivo', productos: [{ producto_id: plato, cantidad: 1, precio: 500, unidad: 'UND' }] }, { expect: 201 });
  const [[fvr2]] = await db.query('SELECT total FROM facturas WHERE id = ?', [vr2.data.id]);
  check(Number(fvr2.total) === 590, `el administrador sí puede cambiar el precio (500 + 90 = 590, quedó ${fvr2.total})`);

  console.log('\n--- Delivery: ITBIS en el pedido y en la factura (sin propina) ---');
  const hor = (await call(admin, 'GET', '/api/negocio')).data;
  const zona = (hor.zonas || [])[0];
  check(!!zona, 'hay una zona de entrega (creada por la suite 02)');
  const pd = await call(mesero, 'POST', '/api/delivery', { tipo: 'delivery', telefono: '809-555-7001', nombre: 'Luis Fiscal', direccion: 'Hotel Riu, Bávaro', zona_id: zona.id, metodo_pago: 'efectivo', items: [{ producto_id: plato, cantidad: 2 }] }, { expect: 201 });
  const envio = Number(zona.costo_envio);
  const esperado = calculo.round2((2000 + envio) * 1.18);
  check(cerca(pd.data.total, esperado) && pd.data.propina === 0 && cerca(pd.data.itbis, (2000 + envio) * 0.18), `pedido delivery: (2.000 + envío ${envio}) × 1,18 = ${esperado} (${pd.data.total})`);
  const [[pc]] = await db.query('SELECT estado_delivery FROM pedidos WHERE id = ?', [pd.data.pedido_id]);
  const [items_] = await db.query(`SELECT id FROM pedido_items WHERE pedido_id = ? AND estado NOT IN ('servido')`, [pd.data.pedido_id]);
  for (const it of items_) await db.query(`UPDATE pedido_items SET estado = 'listo' WHERE id = ?`, [it.id]);
  const ent = await call(mesero, 'POST', `/api/delivery/${pd.data.pedido_id}/entregar`, {}, { expect: [200, 400] });
  if (ent.status === 200) {
    const [[fd]] = await db.query('SELECT f.* FROM facturas f JOIN pedidos p ON p.factura_id = f.id WHERE p.id = ?', [pd.data.pedido_id]);
    check(cerca(fd.total, esperado) && Number(fd.propina) === 0 && /^E32/.test(fd.ncf), `la factura del delivery cobra lo mismo que el pedido (${fd.total}, ${fd.ncf})`);
    check(Number(fd.subtotal_gravado_18) === 2000 + envio, 'el envío es una línea gravada con ITBIS');
  } else { check(false, `no se pudo entregar el delivery: ${JSON.stringify(ent.data)}`); }

  console.log('\n--- App de clientes: el total con impuestos viene del servidor ---');
  const cq = await call(null, 'POST', '/api/pedir/cotizar', { tipo: 'delivery', zona_id: zona.id, items: [{ producto_id: plato, cantidad: 2 }] });
  check(cq.data.fiscal === true && cerca(cq.data.total, esperado) && cq.data.propina === 0 && cerca(cq.data.itbis, (2000 + envio) * 0.18), `la app muestra el mismo total que se factura (${cq.data.total})`);
  await call(null, 'POST', '/api/pedir/cotizar', { tipo: 'delivery', zona_id: zona.id, items: [] }, { expect: 400 });

  console.log('\n--- Rechazo y caída del proveedor ---');
  const cRech = (await call(admin, 'POST', '/api/clientes', { nombre: 'RECHAZAR esta venta', telefono: '8095559001' }, { expect: 201 })).data.id;
  const pR = await pedidoMesa([{ id: plato }]);
  const fr = await call(mesero, 'POST', `/api/mesas/pedidos/${pR.id}/facturar`, { cliente_id: cRech, pagos: [{ metodo: 'efectivo', monto: 1280 }] }, { expect: 201 });
  check(await esperarEstado(fr.data.factura_id, ['rechazado', 'aceptado']) === 'rechazado', 'una factura rechazada queda "rechazado"');
  const [[frr]] = await db.query('SELECT fiscal_error FROM facturas WHERE id = ?', [fr.data.factura_id]);
  check(/rechaz/i.test(frr.fiscal_error || ''), `guarda el motivo del rechazo (${frr.fiscal_error})`);
  await call(admin, 'POST', '/api/fiscal/notas-credito', { factura_id: fr.data.factura_id, motivo: 'intento sobre una rechazada' }, { expect: 400 });
  const cCaida = (await call(admin, 'POST', '/api/clientes', { nombre: 'CAIDA de red', telefono: '8095559002' }, { expect: 201 })).data.id;
  const pC = await pedidoMesa([{ id: plato }]);
  const fc = await call(mesero, 'POST', `/api/mesas/pedidos/${pC.id}/facturar`, { cliente_id: cCaida, pagos: [{ metodo: 'efectivo', monto: 1280 }] }, { expect: 201 });
  await dormir(1500);
  const [[fcc]] = await db.query('SELECT fiscal_estado, fiscal_error, fiscal_intentos FROM facturas WHERE id = ?', [fc.data.factura_id]);
  check(fcc.fiscal_estado === 'pendiente' && /conexi/i.test(fcc.fiscal_error || ''), `si el proveedor no responde, la venta se guarda y queda "pendiente" (${fcc.fiscal_estado})`);
  const lista = (await call(admin, 'GET', '/api/fiscal/comprobantes?estado=problemas')).data;
  check(lista.comprobantes.some((c) => c.id === fc.data.factura_id) && lista.resumen.rechazados >= 1 && lista.resumen.pendientes >= 1, 'la pantalla Fiscal lista pendientes y rechazados');
  const rt = await call(admin, 'POST', `/api/fiscal/comprobantes/${fc.data.factura_id}/reintentar`, {});
  check(rt.data.estado === 'pendiente', 'reintentar con la caída vigente sigue pendiente');
  await call(mesero, 'POST', `/api/fiscal/comprobantes/${fc.data.factura_id}/reintentar`, {}, { expect: 403 });

  console.log('\n--- Notas de crédito ---');
  const pN = await pedidoMesa([{ id: plato, cantidad: 2 }, { id: exento, cantidad: 3 }]);
  const fn = await call(mesero, 'POST', `/api/mesas/pedidos/${pN.id}/facturar`, { cliente_id: cliente, pagos: [{ metodo: 'tarjeta', monto: 2890 }] }, { expect: 201 });
  const idN = fn.data.factura_id;
  check(await esperarEstado(idN, ['aceptado', 'rechazado']) === 'aceptado', 'factura de 2 platos + 3 aguas aceptada (2.890)');
  await call(mesero, 'POST', '/api/fiscal/notas-credito', { factura_id: idN, motivo: 'prueba' }, { expect: 403 });
  await call(admin, 'POST', '/api/fiscal/notas-credito', { factura_id: idN, motivo: '' }, { expect: 400 });
  const det2 = (await call(admin, 'GET', `/api/fiscal/comprobantes/${idN}`)).data;
  const lPlato = det2.lineas.find((l) => l.nombre === 'Plato fiscal');
  const lAgua = det2.lineas.find((l) => l.nombre.startsWith('Agua'));
  await call(admin, 'POST', '/api/fiscal/notas-credito', { factura_id: idN, motivo: 'devolución parcial', items: [{ detalle_id: lPlato.id, cantidad: 5 }] }, { expect: 400 }); // más de lo vendido
  const n1 = await call(admin, 'POST', '/api/fiscal/notas-credito', { factura_id: idN, motivo: 'Un plato llegó frío', items: [{ detalle_id: lPlato.id, cantidad: 1 }] }, { expect: 201 });
  const [[nota1]] = await db.query('SELECT * FROM facturas WHERE id = ?', [n1.data.notaId]);
  check(/^E34/.test(nota1.ncf) && nota1.ncf_modificado === (await db.query('SELECT ncf FROM facturas WHERE id = ?', [idN]))[0][0].ncf && Number(nota1.codigo_modificacion) === 3, `nota E34 que modifica la factura (${nota1.ncf}, código ${nota1.codigo_modificacion})`);
  check(Number(nota1.total) === -1280 && Number(nota1.itbis_total) === -180 && Number(nota1.propina) === -100, `devolver 1 plato: base 1.000 + ITBIS 180 + propina 100 = 1.280 (guardado en negativo: ${nota1.total})`);
  check(await esperarEstado(nota1.id, ['aceptado', 'rechazado']) === 'aceptado', 'la nota de crédito también se envía y es aceptada');
  const n2 = await call(admin, 'POST', '/api/fiscal/notas-credito', { factura_id: idN, motivo: 'Anulo el resto de la cuenta' }, { expect: 201 });
  const [[nota2]] = await db.query('SELECT * FROM facturas WHERE id = ?', [n2.data.notaId]);
  check(Number(nota2.total) + Number(nota1.total) === -2890 && Number(nota2.codigo_modificacion) === 1, `anular el resto: entre las dos notas suman exactamente la factura (${nota1.total} + ${nota2.total}), código 1 (anulación)`);
  await call(admin, 'POST', '/api/fiscal/notas-credito', { factura_id: idN, motivo: 'otra vez' }, { expect: 400 });
  await call(admin, 'POST', '/api/fiscal/notas-credito', { factura_id: n1.data.notaId, motivo: 'anular una nota' }, { expect: 400 });
  const [[neto]] = await db.query('SELECT COALESCE(SUM(total),0) AS t, COALESCE(SUM(propina),0) AS p FROM facturas WHERE id = ? OR factura_origen_id = ?', [idN, idN]);
  check(Number(neto.t) === 0 && Number(neto.p) === 0, 'la venta neta de la factura anulada es 0 (los reportes restan solos)');
  const [[pg]] = await db.query('SELECT COALESCE(SUM(monto),0) AS t FROM factura_pagos WHERE factura_id = ? OR factura_id IN (SELECT id FROM facturas WHERE factura_origen_id = ?)', [idN, idN]);
  check(Number(pg.t) === 0, 'los pagos netos de la factura anulada son 0');
  await intenta('DELETE FROM facturas WHERE id = ?', [n1.data.notaId], 'la nota de crédito tampoco se puede borrar');

  console.log('\n--- Contingencia: serie B ---');
  await call(admin, 'POST', '/api/fiscal/contingencia', { activa: true });
  const pB = await pedidoMesa([{ id: plato }]);
  const fB = await call(mesero, 'POST', `/api/mesas/pedidos/${pB.id}/facturar`, { cliente_id: cliente, pagos: [{ metodo: 'efectivo', monto: 1280 }] }, { expect: 201 });
  const [[fbb]] = await db.query('SELECT ncf, fiscal_estado, tipo_comprobante FROM facturas WHERE id = ?', [fB.data.factura_id]);
  check(fbb.ncf === 'B0200000001' && fbb.fiscal_estado === 'contingencia' && fbb.tipo_comprobante === 'B02', `en contingencia emite NCF serie B (${fbb.ncf}, ${fbb.fiscal_estado})`);
  await dormir(800);
  const [[fbb2]] = await db.query('SELECT fiscal_estado FROM facturas WHERE id = ?', [fB.data.factura_id]);
  check(fbb2.fiscal_estado === 'contingencia', 'una factura de serie B no se envía al proveedor de e-CF');
  await call(admin, 'POST', '/api/fiscal/contingencia', { activa: false });
  const pE = await pedidoMesa([{ id: plato }]);
  const fE = await call(mesero, 'POST', `/api/mesas/pedidos/${pE.id}/facturar`, { cliente_id: cliente, pagos: [{ metodo: 'efectivo', monto: 1280 }] }, { expect: 201 });
  check(/^E32/.test((await db.query('SELECT ncf FROM facturas WHERE id = ?', [fE.data.factura_id]))[0][0].ncf), 'al terminar la contingencia vuelve a emitir e-CF');

  console.log('\n--- Secuencias agotadas o vencidas ---');
  await db.query(`UPDATE fiscal_secuencias SET activa = 0 WHERE tipo = 'E32'`);
  await call(admin, 'POST', '/api/fiscal/secuencias', { tipo: 'E32', desde: 1000, hasta: 1001, vence: '2030-01-01' }); // real, solo 2 números
  const usar = async () => { const p = await pedidoMesa([{ id: plato }]); return call(mesero, 'POST', `/api/mesas/pedidos/${p.id}/facturar`, { cliente_id: cliente, pagos: [{ metodo: 'efectivo', monto: 1280 }] }, { expect: [201, 400] }); };
  const u1 = await usar(), u2 = await usar(), u3 = await usar();
  check(u1.status === 201 && u2.status === 201 && u3.status === 400 && /No hay secuencias/.test(u3.data.error || ''), 'al acabarse el rango (2 números), la tercera venta se rechaza con un mensaje claro');
  const lis = (await call(admin, 'GET', '/api/fiscal/secuencias')).data.secuencias.find((s) => s.desde === 1000);
  check(lis.estado === 'agotada', `la secuencia aparece agotada (${lis.estado})`);
  await call(admin, 'POST', '/api/fiscal/secuencias', { tipo: 'E32', desde: 2000, hasta: 2005, vence: '2020-01-01' });
  const u4 = await usar();
  check(u4.status === 400, 'una secuencia vencida no se usa');
  const vencida = (await call(admin, 'GET', '/api/fiscal/secuencias')).data.secuencias.find((s) => s.desde === 2000);
  check(vencida.estado === 'vencida', 'aparece como vencida');
  await db.query(`UPDATE fiscal_secuencias SET activa = 1 WHERE tipo = 'E32' AND practica = 1`);

  console.log('\n--- Reportes 607 / 608 ---');
  const mes = new Date().toISOString().slice(0, 7);
  const r607 = await call(admin, 'GET', `/api/fiscal/reportes/607?mes=${mes}`);
  check(r607.data.total >= 10 && r607.data.columnas.length === 23, `607 con ${r607.data.total} comprobantes y 23 columnas`);
  const txt = await call(admin, 'GET', `/api/fiscal/reportes/607?mes=${mes}&formato=txt`);
  const lineas = String(txt.text).trim().split(/\r?\n/);
  check(lineas[0] === `607|${RNC_EMISOR}|${mes.replace('-', '')}|${r607.data.total}` && lineas.length === r607.data.total + 1, `cabecera del TXT: ${lineas[0]}`);
  const sumaOk = lineas.slice(1).every((l) => { const c = l.split('|'); const total = Number(c[7]) + Number(c[8]) + Number(c[15]); const medios = [16, 17, 18, 19, 20, 21, 22].reduce((a, i) => a + Number(c[i]), 0); return cerca(total, medios, 0.011) && c.length === 23; });
  check(sumaOk, 'en cada línea, los medios de pago suman monto + ITBIS + propina');
  const xl = await fetch(B + `/api/fiscal/reportes/607?mes=${mes}&formato=xlsx`, { headers: { Cookie: admin.cookie } });
  check(xl.status === 200 && /spreadsheetml/.test(xl.headers.get('content-type') || ''), '607 también en Excel');
  await call(admin, 'GET', '/api/fiscal/reportes/607?mes=2026-13', undefined, { expect: 400 });
  await call(admin, 'POST', '/api/fiscal/anular-ncf', { ncf: 'B0200000001', motivo: '04' }, { expect: 400 }); // ya usado
  await call(admin, 'POST', '/api/fiscal/anular-ncf', { ncf: 'B0200000090', motivo: '08', nota: 'salto de secuencia' });
  const r608 = await call(admin, 'GET', `/api/fiscal/reportes/608?mes=${mes}`);
  check(r608.data.total === 1 && r608.data.filas[0][0] === 'B0200000090', '608 con el NCF anulado');
  const it1 = (await call(admin, 'GET', `/api/fiscal/reportes/it1?mes=${mes}`)).data;
  check(it1.ventas.itbis_cobrado > 0 && it1.ventas.notas_credito === 2, `resumen mensual: ITBIS cobrado ${it1.ventas.itbis_cobrado}, ${it1.ventas.notas_credito} notas`);
  const prop = (await call(admin, 'GET', '/api/fiscal/reportes/propina')).data;
  check(prop.total > 0, `propina legal del periodo: ${prop.total}`);

  console.log('\n--- Comprobante por enlace público ---');
  const [[tk]] = await db.query('SELECT token_publico, ncf FROM facturas WHERE id = ?', [fa.id]);
  const pub = await call(null, 'GET', `/f/${tk.token_publico}`, undefined, { expect: 200 });
  check(String(pub.text).includes(tk.ncf) && String(pub.text).includes('Código de seguridad'), 'el enlace /f/:token muestra el e-NCF y el código de seguridad');
  await call(null, 'GET', '/f/' + '0'.repeat(32), undefined, { expect: 404 });

  console.log('\n--- Producción bloqueada y vuelta al modo práctica ---');
  await call(admin, 'POST', '/api/fiscal/config', { ...base, modo: 'ecf_produccion', proveedor: 'mseller' }, { expect: 400 });
  await call(admin, 'POST', '/api/fiscal/config', { ...base, modo: 'no_fiscal' });
  const pF = await pedidoMesa([{ id: plato }]);
  const fF = await call(mesero, 'POST', `/api/mesas/pedidos/${pF.id}/facturar`, { cliente_id: cliente, pagos: [{ metodo: 'efectivo', monto: 1000 }] }, { expect: 201 });
  const [[fnf]] = await db.query('SELECT * FROM facturas WHERE id = ?', [fF.data.factura_id]);
  check(fnf.fiscal_estado === 'no_fiscal' && fnf.ncf === null && Number(fnf.total) === 1000 && Number(fnf.itbis_total) === 0, 'en modo no fiscal: sin NCF, sin impuestos (total 1.000)');
  const dnf = await call(admin, 'POST', '/api/fiscal/notas-credito', { factura_id: fnf.id, motivo: 'Anulación en modo práctica' }, { expect: 201 });
  const [[nnf]] = await db.query('SELECT total, ncf, fiscal_estado FROM facturas WHERE id = ?', [dnf.data.notaId]);
  check(Number(nnf.total) === -1000 && nnf.ncf === null && nnf.fiscal_estado === 'no_fiscal', 'anular una venta no fiscal crea un contra-asiento sin NCF');

  await db.end();
  console.log(fallos ? `\n✖ ${fallos} comprobación(es) fallaron` : '\n✔ Suite fiscal e-CF: todo correcto');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
