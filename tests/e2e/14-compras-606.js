const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Compras y gastos (proveedores con RNC válido) y el formato 606 de la DGII (TXT y Excel), más su efecto en el resumen mensual.
// Se ejecuta DESPUÉS de las suites 01 a 13 (usa los usuarios de la 01 y el RNC del restaurante guardado por la 13).
process.chdir(ROOT);
const db = require(ROOT + 'db.js');
const B = 'http://localhost:3000';
let fallos = 0;
const jar = () => ({ cookie: '' });
async function call(j, method, path, body, { expect } = {}) {
  const h = { Accept: 'application/json' };
  if (j && j.cookie) h.Cookie = j.cookie;
  let payload;
  if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
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
const rncValido = (b8) => { const p = [7, 9, 8, 6, 5, 4, 3, 2]; const r = p.reduce((a, x, i) => a + x * Number(b8[i]), 0) % 11; return b8 + (r === 0 ? 2 : r === 1 ? 1 : 11 - r); };

(async () => {
  const admin = jar(), mesero = jar();
  const lg = async (j, u, p) => { const r = await fetch(B + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ usuario: u, password: p }).toString(), redirect: 'manual' }); j.cookie = (r.headers.get('set-cookie') || '').split(';')[0]; return r.status; };
  check(await lg(admin, 'admin', 'Prueba#2026') === 302, 'entra el administrador');
  check(await lg(mesero, 'mesero1', 'Mesero#2026') === 302, 'entra el mesero');

  console.log('--- Proveedores ---');
  await call(mesero, 'GET', '/api/compras/proveedores', undefined, { expect: 403 });
  await call(mesero, 'GET', '/compras', undefined, { expect: 403 });
  await call(admin, 'GET', '/compras', undefined, { expect: 200 });
  await call(admin, 'POST', '/api/compras/proveedores', { documento: '123456789', nombre: 'Colmado La Esquina' }, { expect: 400 }); // RNC inválido
  await call(admin, 'POST', '/api/compras/proveedores', { documento: rncValido('13000111'), nombre: '' }, { expect: 400 });
  const RNC_P = rncValido('13000111');
  const prov = await call(admin, 'POST', '/api/compras/proveedores', { documento: RNC_P, nombre: 'Distribuidora del Este SRL', telefono: '809-555-1000' }, { expect: 201 });
  await call(admin, 'POST', '/api/compras/proveedores', { documento: RNC_P, nombre: 'Duplicado' }, { expect: 400 });
  const prov2 = await call(admin, 'POST', '/api/compras/proveedores', { tipo_documento: 'rnc', documento: rncValido('10200300'), nombre: 'Carnes Premium' }, { expect: 201 });
  const cat = (await call(admin, 'GET', '/api/compras/catalogos')).data;
  check(cat.proveedores.length === 2 && Object.keys(cat.tipos).length === 11 && Object.keys(cat.formas).length === 7, 'catálogos: proveedores, 11 tipos de gasto y 7 formas de pago');

  console.log('\n--- Facturas de compra ---');
  const hoy = new Date().toISOString().slice(0, 10);
  const mes = hoy.slice(0, 7);
  const base = { proveedor_id: prov.data.id, ncf: 'B0100000123', fecha_comprobante: hoy, tipo_bienes_servicios: '09', monto_bienes: 10000, monto_servicios: 0, itbis_facturado: 1800, forma_pago: '02' };
  await call(admin, 'POST', '/api/compras', { ...base, ncf: 'B01123' }, { expect: 400 });
  await call(admin, 'POST', '/api/compras', { ...base, fecha_comprobante: '2999-01-01' }, { expect: 400 });
  await call(admin, 'POST', '/api/compras', { ...base, monto_bienes: 0 }, { expect: 400 });
  await call(admin, 'POST', '/api/compras', { ...base, itbis_facturado: 9000 }, { expect: 400 }); // ITBIS imposible
  await call(admin, 'POST', '/api/compras', { ...base, tipo_bienes_servicios: '99' }, { expect: 400 });
  await call(admin, 'POST', '/api/compras', { ...base, ncf: 'B0400000007' }, { expect: 400 }); // nota de crédito sin NCF modificado
  await call(mesero, 'POST', '/api/compras', base, { expect: 403 });
  const c1 = await call(admin, 'POST', '/api/compras', base, { expect: 201 });
  await call(admin, 'POST', '/api/compras', base, { expect: 400 }); // misma factura del mismo proveedor
  await call(admin, 'POST', '/api/compras', { proveedor_id: prov2.data.id, ncf: 'E310000000045', fecha_comprobante: hoy, tipo_bienes_servicios: '02', monto_servicios: 2000, monto_bienes: 3000, itbis_facturado: 900, itbis_costo: 100, propina: 0, forma_pago: '01' }, { expect: 201 });
  await call(admin, 'POST', '/api/compras', { proveedor_id: prov2.data.id, ncf: 'B0400000007', ncf_modificado: 'B0100000123', fecha_comprobante: hoy, tipo_bienes_servicios: '09', monto_bienes: 1000, itbis_facturado: 180, forma_pago: '04' }, { expect: 201 });
  const lista = (await call(admin, 'GET', `/api/compras?mes=${mes}`)).data.compras;
  check(lista.length === 3, 'las 3 compras del mes aparecen en la lista');
  const [[a]] = await db.query('SELECT itbis_adelantar FROM compras WHERE ncf = ?', ['E310000000045']);
  check(Number(a.itbis_adelantar) === 800, `ITBIS por adelantar = facturado - llevado al costo (900 - 100 = ${a.itbis_adelantar})`);

  console.log('\n--- Formato 606 ---');
  await call(admin, 'GET', '/api/fiscal/reportes/606?mes=abc', undefined, { expect: 400 });
  const r = (await call(admin, 'GET', `/api/fiscal/reportes/606?mes=${mes}`)).data;
  check(r.total === 3 && r.columnas.length === 23 && r.filas.every((f) => f.length === 23), '606: 3 registros de 23 columnas');
  const txt = await fetch(B + `/api/fiscal/reportes/606?mes=${mes}&formato=txt`, { headers: { Cookie: admin.cookie } });
  const cuerpo = await txt.text();
  const lineas = cuerpo.trim().split(/\r?\n/);
  const [[cfg]] = await db.query('SELECT rnc_emisor FROM configuracion_impresion LIMIT 1');
  check(lineas[0] === `606|${cfg.rnc_emisor || ''}|${mes.replace('-', '')}|3` && /DGII_F_606_/.test(txt.headers.get('content-disposition') || ''), `cabecera del TXT: ${lineas[0]}`);
  const f1 = lineas.slice(1).map((l) => l.split('|')).find((c) => c[3] === 'B0100000123');
  check(f1 && f1.length === 23 && f1[0] === RNC_P && f1[1] === '1' && f1[2] === '09' && f1[5] === hoy.replace(/-/g, '') && f1[7] === '0.00' && f1[8] === '10000.00' && f1[9] === '10000.00' && f1[10] === '1800.00' && f1[14] === '1800.00' && f1[22] === '02', `línea 606 correcta: ${f1 && f1.join('|')}`);
  const nc = lineas.slice(1).map((l) => l.split('|')).find((c) => c[3] === 'B0400000007');
  check(nc && nc[4] === 'B0100000123', 'la nota de crédito del proveedor lleva su NCF modificado');
  const xl = await fetch(B + `/api/fiscal/reportes/606?mes=${mes}&formato=xlsx`, { headers: { Cookie: admin.cookie } });
  check(xl.status === 200 && /spreadsheetml/.test(xl.headers.get('content-type') || ''), '606 también en Excel');

  console.log('\n--- Resumen mensual con compras ---');
  const it1 = (await call(admin, 'GET', `/api/fiscal/reportes/it1?mes=${mes}`)).data;
  check(it1.compras.registros === 3 && Math.abs(it1.compras.itbis_facturado - 2880) < 0.01, `compras del mes: 3 registros, ITBIS facturado ${it1.compras.itbis_facturado}`);
  check(Math.abs(it1.itbis_a_pagar - (it1.ventas.itbis_cobrado - (it1.compras.itbis_facturado - it1.compras.itbis_al_costo))) < 0.01, `ITBIS a pagar = cobrado - adelantado (${it1.itbis_a_pagar})`);

  console.log('\n--- Entrada de inventario junto con la compra ---');
  const ins = await call(admin, 'POST', '/api/inventario/insumos', { nombre: 'Aceite (compra 606)', unidad: 'l', stock: 1, stock_minimo: 1, costo_unitario: 200 }, { expect: 201 });
  await call(admin, 'POST', '/api/compras', { ...base, ncf: 'B0100000124', entradas: [{ insumo_id: ins.data.id, cantidad: 20, unidad: 'l' }] }, { expect: 201 });
  const [[st]] = await db.query('SELECT stock FROM insumos WHERE id = ?', [ins.data.id]);
  check(Number(st.stock) === 21, `la compra registró la entrada: stock 1 + 20 = ${st.stock}`);

  console.log('\n--- Borrar una compra ---');
  await call(mesero, 'DELETE', `/api/compras/${c1.data.id}`, undefined, { expect: 403 });
  await call(admin, 'DELETE', `/api/compras/${c1.data.id}`);
  await call(admin, 'DELETE', `/api/compras/${c1.data.id}`, undefined, { expect: 400 });

  await db.end();
  console.log(fallos ? `\n✖ ${fallos} comprobación(es) fallaron` : '\n✔ Suite de compras y 606: todo correcto');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
