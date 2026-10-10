// Configuración fiscal del restaurante (datos del emisor, modo, impuestos, credenciales del proveedor).
// Relacionado con: routes/fiscal.js, services/facturacion.js, services/fiscal/*
const db = require('../../db');
const { encrypt, decrypt } = require('../crypto');
const calculo = require('./calculo');

const MODOS = ['no_fiscal', 'ecf_pruebas', 'ecf_produccion', 'ncf_b'];
const COLS = `rnc_emisor, razon_social, nombre_negocio, direccion, direccion_fiscal, municipio, provincia, fiscal_modo, fiscal_proveedor,
    contingencia_activa, contingencia_desde, precios_incluyen_itbis, propina_activa, propina_tasa, propina_en_delivery, propina_en_llevar,
    propina_en_rapida, mseller_email, mseller_password_enc, mseller_api_key_enc, mseller_ambiente, telefono`;

function armar(c = {}, { secretos = false } = {}) {
    const modo = MODOS.includes(c.fiscal_modo) ? c.fiscal_modo : 'no_fiscal';
    const cfg = {
        modo,
        proveedor: c.fiscal_proveedor === 'simulado' ? 'simulado' : 'mseller',
        activo: modo !== 'no_fiscal', // calcula impuestos y numera comprobantes
        contingencia: Number(c.contingencia_activa || 0) === 1,
        contingenciaDesde: c.contingencia_desde || null,
        preciosIncluyenItbis: Number(c.precios_incluyen_itbis || 0) === 1,
        propinaActiva: Number(c.propina_activa ?? 1) === 1,
        propinaTasa: Number(c.propina_tasa ?? 10),
        propinaEnDelivery: Number(c.propina_en_delivery || 0) === 1,
        propinaEnLlevar: Number(c.propina_en_llevar || 0) === 1,
        propinaEnRapida: Number(c.propina_en_rapida || 0) === 1,
        emisor: {
            rnc: c.rnc_emisor || '',
            razonSocial: c.razon_social || c.nombre_negocio || '',
            nombreComercial: c.nombre_negocio || '',
            direccion: c.direccion_fiscal || c.direccion || '',
            municipio: c.municipio || '',
            provincia: c.provincia || '',
            telefono: c.telefono || ''
        },
        mseller: {
            email: c.mseller_email || '',
            ambiente: c.mseller_ambiente === 'CerteCF' ? 'CerteCF' : 'TesteCF',
            tienePassword: !!c.mseller_password_enc,
            tieneApiKey: !!c.mseller_api_key_enc
        }
    };
    // Serie B: modo manual o contingencia
    cfg.serieB = modo === 'ncf_b' || (cfg.activo && cfg.contingencia);
    if (secretos) {
        const des = (v) => { try { return decrypt(v); } catch (_) { return null; } };
        cfg.mseller.password = des(c.mseller_password_enc);
        cfg.mseller.apiKey = des(c.mseller_api_key_enc);
    }
    return cfg;
}

/** Lee la configuración fiscal (siempre fresca: se usa dentro de transacciones). */
async function obtener(conn = db, opciones = {}) {
    const [rows] = await conn.query(`SELECT ${COLS} FROM configuracion_impresion ORDER BY id LIMIT 1`);
    return armar(rows[0] || {}, opciones);
}

// Caché corta solo para pintar pantallas (aviso de "no fiscal", etc.); nunca para facturar
let cache = null;
let cacheHasta = 0;
const limpiarCache = () => { cache = null; cacheHasta = 0; };
async function obtenerCache() {
    if (cache && Date.now() < cacheHasta) return cache;
    try { cache = await obtener(); } catch (_) { cache = armar({}); }
    cacheHasta = Date.now() + 15000;
    return cache;
}

/** Datos para el motor de cálculo (services/fiscal/calculo.js). */
const paraCalculo = (cfg) => ({
    activo: cfg.activo, preciosIncluyenItbis: cfg.preciosIncluyenItbis, propinaActiva: cfg.propinaActiva, propinaTasa: cfg.propinaTasa,
    propinaEnDelivery: cfg.propinaEnDelivery, propinaEnLlevar: cfg.propinaEnLlevar, propinaEnRapida: cfg.propinaEnRapida
});

/** Qué falta para poder facturar de verdad (lista "¿Listo para facturar?"). */
async function diagnostico(conn = db) {
    const cfg = await obtener(conn, { secretos: true });
    const [seq] = await conn.query(
        `SELECT tipo, COUNT(*) AS n, SUM(CASE WHEN practica = 1 THEN 1 ELSE 0 END) AS practica,
                SUM(GREATEST(hasta - siguiente + 1, 0)) FILTER (WHERE activa = 1 AND (vence IS NULL OR vence >= CURRENT_DATE)) AS restantes
         FROM fiscal_secuencias GROUP BY tipo`
    );
    const porTipo = Object.fromEntries(seq.map((s) => [s.tipo, { n: Number(s.n), practica: Number(s.practica), restantes: Number(s.restantes || 0) }]));
    let demo = { n: 0 }; // la tabla de marcas de demostración solo existe si alguna vez se cargaron datos de ejemplo
    try { const [r] = await conn.query('SELECT COUNT(*) AS n FROM datos_demo'); demo = r[0]; } catch (_) { /* no existe: no hay demo */ }
    const prod = cfg.modo === 'ecf_produccion';
    const necesarias = cfg.modo === 'ncf_b' ? ['B02', 'B04'] : ['E32', 'E34'];
    const reales = (t) => (porTipo[t] ? porTipo[t].restantes : 0);
    const items = [
        { id: 'rnc', ok: calculo.validarRNC(cfg.emisor.rnc), txt: 'RNC del restaurante válido' },
        { id: 'razon', ok: !!cfg.emisor.razonSocial && !!cfg.emisor.direccion, txt: 'Razón social y dirección fiscal' },
        { id: 'secuencias', ok: necesarias.every((t) => reales(t) > 0), txt: `Secuencias vigentes de ${necesarias.join(' y ')}` },
        { id: 'proveedor', ok: cfg.modo === 'ncf_b' || cfg.proveedor === 'simulado' ? cfg.modo === 'ncf_b' : !!(cfg.mseller.email && cfg.mseller.password && cfg.mseller.apiKey), txt: 'Credenciales del proveedor de e-CF (MSeller)' },
        { id: 'demo', ok: Number(demo.n) === 0, txt: 'Sin datos de demostración cargados' },
        { id: 'real', ok: !prod || (cfg.proveedor === 'mseller' && !(porTipo.E32 && porTipo.E32.practica > 0 && porTipo.E32.restantes === porTipo.E32.practica)), txt: 'Proveedor real y secuencias reales (no de práctica)' }
    ];
    return { cfg, items, listo: items.every((i) => i.ok), secuencias: porTipo };
}

/** Guarda la configuración. Valida y cifra los secretos (vacío = conservar). */
async function guardar(b, usuario = null) {
    const err = (m) => Object.assign(new Error(m), { publico: true });
    const modo = String(b.modo || 'no_fiscal');
    if (!MODOS.includes(modo)) throw err('Modo fiscal inválido');
    const rnc = calculo.normalizarDocumento('rnc', b.rnc);
    if (rnc && !calculo.validarRNC(rnc)) throw err('El RNC del restaurante no es válido (9 dígitos, revisa el dígito verificador).');
    const tasa = Number(b.propinaTasa == null || b.propinaTasa === '' ? 10 : b.propinaTasa);
    if (!Number.isFinite(tasa) || tasa < 0 || tasa > 30) throw err('La tasa de propina debe estar entre 0 y 30.');
    const proveedor = b.proveedor === 'simulado' ? 'simulado' : 'mseller';
    const ambiente = b.ambiente === 'CerteCF' ? 'CerteCF' : 'TesteCF';
    const actual = await obtener(db, { secretos: true });
    if (modo === 'ecf_produccion') {
        const d = await diagnostico();
        const faltan = d.items.filter((i) => !i.ok).map((i) => i.txt);
        if (faltan.length) throw err(`Todavía no se puede activar la producción. Falta: ${faltan.join('; ')}.`);
        if (proveedor === 'simulado') throw err('En producción hay que usar el proveedor real (MSeller).');
    }
    const [rows] = await db.query('SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1');
    if (!rows[0]) await db.query(`INSERT INTO configuracion_impresion (nombre_negocio) VALUES ('Restaurant Martin')`);
    const sets = ['rnc_emisor = ?', 'razon_social = ?', 'direccion_fiscal = ?', 'municipio = ?', 'provincia = ?', 'fiscal_modo = ?', 'fiscal_proveedor = ?',
        'precios_incluyen_itbis = ?', 'propina_activa = ?', 'propina_tasa = ?', 'propina_en_delivery = ?', 'propina_en_llevar = ?', 'propina_en_rapida = ?',
        'mseller_email = ?', 'mseller_ambiente = ?'];
    const uno = (v) => (v === true || String(v) === '1' ? 1 : 0);
    const vals = [rnc || null, String(b.razonSocial || '').trim().slice(0, 150) || null, String(b.direccion || '').trim().slice(0, 250) || null,
        String(b.municipio || '').trim().slice(0, 80) || null, String(b.provincia || '').trim().slice(0, 80) || null, modo, proveedor,
        uno(b.preciosIncluyenItbis), uno(b.propinaActiva), tasa, uno(b.propinaEnDelivery), uno(b.propinaEnLlevar), uno(b.propinaEnRapida),
        String(b.msellerEmail || '').trim().slice(0, 150) || null, ambiente];
    if (b.msellerPassword) { sets.push('mseller_password_enc = ?'); vals.push(encrypt(String(b.msellerPassword))); }
    if (b.msellerApiKey) { sets.push('mseller_api_key_enc = ?'); vals.push(encrypt(String(b.msellerApiKey).trim())); }
    await db.query(`UPDATE configuracion_impresion SET ${sets.join(', ')} WHERE id = (SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1)`, vals);
    if (actual.modo !== modo) {
        await db.query(`INSERT INTO fiscal_eventos (evento, detalle, usuario) VALUES ('cambio_modo', ?, ?)`, [`${actual.modo} → ${modo}`, usuario]);
    }
    limpiarCache();
    return { ok: true };
}

/** Activa o desactiva la contingencia (se usa serie B hasta regularizar). */
async function contingencia(activa, usuario = null) {
    await db.query(
        `UPDATE configuracion_impresion SET contingencia_activa = ?, contingencia_desde = CASE WHEN ? = 1 THEN NOW() ELSE contingencia_desde END
         WHERE id = (SELECT id FROM configuracion_impresion ORDER BY id LIMIT 1)`, [activa ? 1 : 0, activa ? 1 : 0]
    );
    await db.query(`INSERT INTO fiscal_eventos (evento, detalle, usuario) VALUES (?, ?, ?)`, [activa ? 'contingencia_on' : 'contingencia_off', null, usuario]);
    limpiarCache();
}

module.exports = { MODOS, obtener, obtenerCache, limpiarCache, paraCalculo, diagnostico, guardar, contingencia };
