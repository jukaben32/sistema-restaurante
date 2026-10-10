const ROOT = require('path').resolve(__dirname, '..', '..') + require('path').sep;
// Cálculo fiscal (ITBIS, propina legal), validadores de RNC / cédula y elección del comprobante. Es un módulo puro: no usa el servidor.
process.chdir(ROOT);
const c = require(ROOT + 'services/fiscal/calculo.js');
let fallos = 0;
const check = (ok, m) => { if (!ok) fallos++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${m}`); };
const igual = (a, b, m) => check(JSON.stringify(a) === JSON.stringify(b), `${m} (${JSON.stringify(a)}${JSON.stringify(a) === JSON.stringify(b) ? '' : ' ≠ ' + JSON.stringify(b)})`);

const cfg = { activo: true, preciosIncluyenItbis: false, propinaActiva: true, propinaTasa: 10, propinaEnDelivery: false, propinaEnLlevar: false, propinaEnRapida: false };
const L = (precio, cant = 1, tasa = '18', envio = false) => ({ precio_unitario: precio, cantidad: cant, itbis_tasa: tasa, es_envio: envio });

console.log('--- Precios SIN ITBIS incluido (se suma aparte) ---');
let f = c.calcularFactura([L(1000)], { cfg, tipoPedido: 'mesa' });
check(f.base_total === 1000 && f.itbis_total === 180 && f.propina === 100 && f.total === 1280, `consumo de 1.000: ITBIS 180 + propina 100 = 1.280 (${f.itbis_total}, ${f.propina}, ${f.total})`);
check(f.subtotal_gravado_18 === 1000 && f.subtotal_exento === 0, 'el subtotal gravado al 18 % es 1.000');
f = c.calcularFactura([L(450, 2), L(60, 1)], { cfg, tipoPedido: 'mesa' });
check(f.base_total === 960 && f.itbis_total === 172.8 && f.propina === 96 && f.total === 1228.8, `960 → ITBIS 172,80 + propina 96 = 1.228,80 (${f.total})`);
check(f.propina === c.round2(f.base_total * 0.1) && f.propina !== c.round2((f.base_total + f.itbis_total) * 0.1), 'la propina se calcula SOBRE LA BASE, no sobre el total con ITBIS');

console.log('\n--- Precios CON ITBIS incluido ---');
const cfgInc = { ...cfg, preciosIncluyenItbis: true };
f = c.calcularFactura([L(1180)], { cfg: cfgInc, tipoPedido: 'mesa' });
check(f.base_total === 1000 && f.itbis_total === 180 && f.propina === 100 && f.total === 1280, `precio 1.180 con ITBIS → base 1.000 + ITBIS 180 + propina 100 = 1.280 (${f.base_total}, ${f.itbis_total}, ${f.total})`);
f = c.calcularFactura([L(100, 3)], { cfg: cfgInc, tipoPedido: 'delivery' });
check(f.base_total + f.itbis_total === 300 && f.total === 300, `3 × 100 con ITBIS incluido suman exactamente 300 (${f.base_total} + ${f.itbis_total})`);
for (const precio of [33.33, 99.99, 1, 7.77, 249.5, 1234.56]) {
  for (const cant of [1, 2, 3, 7]) {
    const r = c.calcularFactura([L(precio, cant)], { cfg: { ...cfgInc, propinaActiva: false }, tipoPedido: 'mesa' });
    if (Math.abs(r.base_total + r.itbis_total - c.round2(precio * cant)) > 0.001) { check(false, `redondeo roto con ${precio} × ${cant}`); }
  }
}
check(true, 'base + ITBIS = precio con ITBIS en 24 combinaciones de redondeo');

console.log('\n--- Tasas: exento, 16 %, 0 % ---');
f = c.calcularFactura([L(500, 1, '18'), L(200, 1, 'E'), L(100, 1, '16'), L(50, 1, '0')], { cfg, tipoPedido: 'mesa' });
check(f.subtotal_gravado_18 === 500 && f.subtotal_exento === 200 && f.subtotal_gravado_16 === 100 && f.subtotal_gravado_0 === 50, 'subtotales separados por tasa');
check(f.itbis_total === 106, `ITBIS = 90 (18 % de 500) + 16 (16 % de 100) = 106 (${f.itbis_total})`);
check(f.propina === 85 && f.total === 1041, `propina 10 % de 850 = 85; total 1.041 (${f.propina}, ${f.total})`);
check(c.indicadorFacturacion('18') === 1 && c.indicadorFacturacion('16') === 2 && c.indicadorFacturacion('0') === 3 && c.indicadorFacturacion('E') === 4, 'indicadores de facturación 1, 2, 3 y 4');

console.log('\n--- Propina según el tipo de pedido ---');
check(c.calcularFactura([L(1000)], { cfg, tipoPedido: 'mesa' }).propina === 100, 'mesa: sí lleva propina');
check(c.calcularFactura([L(1000)], { cfg, tipoPedido: 'delivery' }).propina === 0, 'delivery: no (por defecto)');
check(c.calcularFactura([L(1000)], { cfg, tipoPedido: 'para_llevar' }).propina === 0, 'para llevar: no (por defecto)');
check(c.calcularFactura([L(1000)], { cfg: { ...cfg, propinaEnDelivery: true }, tipoPedido: 'delivery' }).propina === 100, 'delivery: sí si el administrador lo activa');
check(c.calcularFactura([L(1000)], { cfg: { ...cfg, propinaActiva: false }, tipoPedido: 'mesa' }).propina === 0, 'propina apagada: no se cobra');
f = c.calcularFactura([L(1000), L(150, 1, '18', true)], { cfg: { ...cfg, propinaEnDelivery: true }, tipoPedido: 'delivery' });
check(f.propina === 100 && f.itbis_total === 207 && f.total === 1457, `el envío paga ITBIS pero NO propina: 1.000 + 150 → ITBIS 207, propina 100, total 1.457 (${f.itbis_total}, ${f.propina}, ${f.total})`);

console.log('\n--- Modo no fiscal (práctica) ---');
f = c.calcularFactura([L(1000, 2)], { cfg: { ...cfg, activo: false }, tipoPedido: 'mesa' });
check(f.itbis_total === 0 && f.propina === 0 && f.total === 2000 && f.subtotal_sin_impuestos === 2000, 'sin modo fiscal el total es la suma simple y no hay impuestos');

console.log('\n--- RNC y cédula ---');
// RNC 131-00000-?: se calcula el dígito para probar el algoritmo
const dvRNC = (b8) => { const p = [7, 9, 8, 6, 5, 4, 3, 2]; const s = p.reduce((a, x, i) => a + x * Number(b8[i]), 0); const r = s % 11; return r === 0 ? 2 : r === 1 ? 1 : 11 - r; };
const rncOk = '13100000' + dvRNC('13100000');
const rncOk2 = '10100030' + dvRNC('10100030');
check(c.validarRNC(rncOk) && c.validarRNC(rncOk2) && c.validarRNC(rncOk.slice(0, 3) + '-' + rncOk.slice(3, 8) + '-' + rncOk.slice(8)), 'RNC válido con y sin guiones');
check(!c.validarRNC(rncOk.slice(0, 8) + ((Number(rncOk[8]) + 1) % 10)) && !c.validarRNC('12345678') && !c.validarRNC('') && !c.validarRNC('abcdefghi'), 'RNC con dígito verificador malo, corto o vacío: inválido');
const luhn = (b10) => { let s = 0; for (let i = 0; i < 10; i++) { let v = Number(b10[i]) * (i % 2 === 0 ? 1 : 2); if (v > 9) v -= 9; s += v; } return (10 - (s % 10)) % 10; };
const cedOk = '0010000001' + luhn('0010000001');
check(c.validarCedula(cedOk) && c.validarCedula(cedOk.slice(0, 3) + '-' + cedOk.slice(3, 10) + '-' + cedOk.slice(10)), 'cédula válida con y sin guiones');
check(!c.validarCedula(cedOk.slice(0, 10) + ((Number(cedOk[10]) + 1) % 10)) && !c.validarCedula('123'), 'cédula con dígito malo o corta: inválida');
check(c.validarDocumento('pasaporte', 'AB123456') && !c.validarDocumento('pasaporte', 'a b') && !c.validarDocumento('ninguno', '123'), 'pasaporte alfanumérico de 5 a 20; "ninguno" nunca es válido');
check(c.tipoDocumentoPorLongitud(rncOk) === 'rnc' && c.tipoDocumentoPorLongitud(cedOk) === 'cedula' && c.tipoDocumentoPorLongitud('123') === null, 'detecta si es RNC (9) o cédula (11)');

console.log('\n--- Elección del comprobante ---');
const cliRNC = { tipo_documento: 'rnc', documento: rncOk, razon_social: 'Hotel Bávaro SRL' };
igual(c.elegirTipo({ total: 500 }), { tipo: 'E32', serie: 'E' }, 'sin cliente identificado: E32 (consumo)');
igual(c.elegirTipo({ comprador: cliRNC, quiereCreditoFiscal: true, total: 500 }), { tipo: 'E31', serie: 'E' }, 'cliente con RNC que pide crédito fiscal: E31');
igual(c.elegirTipo({ comprador: cliRNC, quiereCreditoFiscal: false, total: 500 }), { tipo: 'E32', serie: 'E' }, 'cliente con RNC que no lo pide: E32');
igual(c.elegirTipo({ esNota: true }), { tipo: 'E34', serie: 'E' }, 'nota de crédito: E34');
igual(c.elegirTipo({ serieB: true, total: 500 }), { tipo: 'B02', serie: 'B' }, 'serie B (contingencia): B02 consumo');
igual(c.elegirTipo({ serieB: true, comprador: cliRNC, quiereCreditoFiscal: true }), { tipo: 'B01', serie: 'B' }, 'serie B con crédito fiscal: B01');
igual(c.elegirTipo({ serieB: true, esNota: true }), { tipo: 'B04', serie: 'B' }, 'serie B nota de crédito: B04');
let msg = ''; try { c.elegirTipo({ quiereCreditoFiscal: true, total: 100 }); } catch (e) { msg = e.message; }
check(/RNC o una cédula válidos/.test(msg), 'crédito fiscal sin RNC válido: se rechaza con un mensaje claro');
msg = ''; try { c.elegirTipo({ comprador: { tipo_documento: 'rnc', documento: '123456789' }, quiereCreditoFiscal: true }); } catch (e) { msg = e.message; }
check(/RNC o una cédula válidos/.test(msg), 'crédito fiscal con RNC inválido: se rechaza');
msg = ''; try { c.elegirTipo({ total: 250000 }); } catch (e) { msg = e.message; }
check(/250/.test(msg), 'consumo de RD$250.000 o más sin identificar al cliente: se rechaza');
check(c.elegirTipo({ total: 249999.99 }).tipo === 'E32', 'consumo de 249.999,99: no exige identificación');
check(c.elegirTipo({ total: 300000, comprador: { tipo_documento: 'pasaporte', documento: 'AB123456' } }).tipo === 'E32', 'consumo grande con pasaporte (turista): válido');

console.log('\n--- Formato de comprobantes ---');
check(c.formatearNCF('E32', 1) === 'E320000000001' && c.formatearNCF('E31', 12345) === 'E310000012345', 'e-NCF de 13 posiciones (E + tipo + 10 dígitos)');
check(c.formatearNCF('B02', 7) === 'B0200000007' && c.formatearNCF('B01', 1234) === 'B0100001234', 'NCF serie B de 11 posiciones (B + tipo + 8 dígitos)');
check(c.validarNCF('E320000000001') && c.validarNCF('B0200000007') && !c.validarNCF('E32000001') && !c.validarNCF('X320000000001'), 'validación del formato de NCF y e-NCF');
check(c.formaPagoDGII('efectivo') === 1 && c.formaPagoDGII('transferencia') === 2 && c.formaPagoDGII('tarjeta') === 3 && c.formaPagoDGII('cripto') === 8 && c.formaPagoDGII('qr') === 8, 'formas de pago de la DGII (Stripe→tarjeta 3, cripto→otras 8)');

console.log(fallos ? `\n✖ ${fallos} comprobación(es) fallaron` : '\n✔ Suite de cálculo fiscal: todo correcto');
process.exit(fallos ? 1 : 0);
