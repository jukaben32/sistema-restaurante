// Lee la foto de una factura de compra con un modelo de visión (OpenRouter) y devuelve los campos del 606 para que una persona los confirme.
// Relacionado con: routes/compras.js, services/fiscal/compras.js, services/fiscal/calculo.js, public/js/compras.js
const calculo = require('./calculo');
const db = require('../../db');

const err = (m) => Object.assign(new Error(m), { publico: true });
const MAX_DATAURL = 6 * 1024 * 1024;

const PROMPT = `Eres un asistente contable de República Dominicana. Lee la factura (comprobante fiscal) de la imagen y responde SOLO con un objeto JSON, sin texto extra:
{"rnc_proveedor": "solo dígitos o null", "nombre_proveedor": "texto o null", "ncf": "NCF (B01...) o e-NCF (E31...), sin espacios, o null",
 "fecha": "YYYY-MM-DD o null", "monto_bienes": número sin ITBIS, "monto_servicios": número sin ITBIS, "itbis": número, "propina": número,
 "total": número total de la factura, "forma_pago": "efectivo" | "transferencia" | "tarjeta" | "credito" | null, "confianza": número 0 a 1}
Reglas: copia el NCF carácter por carácter sin omitir ceros ni dígitos (NCF = letra B + 10 dígitos = 11 caracteres; e-NCF = letra E + 12 dígitos = 13 caracteres); el RNC tiene 9 dígitos (o 11 si es cédula); las fechas en República Dominicana se escriben DD/MM/AAAA (día primero); no inventes datos; si no se lee, usa null (o 0 en montos). Montos como números con punto decimal. "monto_bienes" y "monto_servicios" son el subtotal antes de ITBIS: si no puedes distinguirlos, pon todo en bienes. La propina legal (10%) no es parte del subtotal.`;

const FORMAS = { efectivo: '01', transferencia: '02', tarjeta: '03', credito: '04' };
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? calculo.round2(n) : 0; };

function extraerJSON(txt) {
    const m = String(txt || '').match(/\{[\s\S]*\}/);
    const falla = () => err('No se pudo interpretar la respuesta de la lectura. Intenta con otra foto.');
    if (!m) throw falla();
    try { return JSON.parse(m[0]); } catch { throw falla(); }
}

// dataUrl: "data:image/jpeg;base64,...". Devuelve campos listos para el formulario + avisos de validación.
async function leerFacturaInterna(dataUrl, proveedores, traza) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw err('La lectura por foto no está configurada (falta OPENROUTER_API_KEY en el servidor).');
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(String(dataUrl || ''))) throw err('La imagen debe ser JPG, PNG o WEBP.');
    if (dataUrl.length > MAX_DATAURL) throw err('La imagen es muy grande. Acércate más o toma la foto de nuevo.');

    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Restaurant Martin' },
        body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5', temperature: 0, max_tokens: 600,
            messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: dataUrl } }] }]
        }),
        signal: AbortSignal.timeout(45000)
    }).catch((e) => { console.error('OpenRouter', e.message); throw err('No se pudo contactar el servicio de lectura. Intenta de nuevo.'); });
    if (!r.ok) { console.error('OpenRouter', r.status, (await r.text()).slice(0, 300)); throw err('El servicio de lectura rechazó la solicitud. Intenta de nuevo o llena los datos a mano.'); }
    const d = await r.json();
    traza.respuesta = JSON.stringify(d).slice(0, 4000);
    const j = extraerJSON(d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content);

    console.log('lector factura: imagen', Math.round(dataUrl.length / 1024), 'KB, respuesta', JSON.stringify(j).slice(0, 400));
    const avisos = [];
    if (!j.ncf && !j.fecha && !(num(j.total) > 0)) throw err('No se pudo leer ningún dato de la foto. Mira la vista previa: si sale oscura, borrosa o cortada, toma otra con buena luz y la hoja completa dentro del cuadro.');
    const rnc = String(j.rnc_proveedor || '').replace(/\D/g, '');
    const ncf = String(j.ncf || '').replace(/\s|-/g, '').toUpperCase() || null;
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(j.fecha || '')) ? j.fecha : null;
    const bienes = num(j.monto_bienes), servicios = num(j.monto_servicios), itbis = num(j.itbis), propina = num(j.propina), total = num(j.total);

    const prov = proveedores.find((p) => rnc && p.documento === rnc) || null;
    if (!rnc) avisos.push('No se leyó el RNC del proveedor.');
    else if (!calculo.validarDocumento(rnc.length === 11 ? 'cedula' : 'rnc', rnc)) avisos.push('El RNC leído no es válido: revísalo en la factura.');
    else if (!prov) avisos.push(`El proveedor ${j.nombre_proveedor || rnc} no está registrado: agrégalo con el RNC ${rnc}.`);
    if (!ncf) avisos.push('No se leyó el NCF.');
    else if (!calculo.validarNCF(ncf)) avisos.push('El NCF leído no tiene un formato válido: revísalo.');
    if (!fecha) avisos.push('No se leyó la fecha.');
    else if (fecha > new Date().toISOString().slice(0, 10)) avisos.push('La fecha leída es futura: revísala.');
    if (total && Math.abs(bienes + servicios + itbis + propina - total) > 0.05) avisos.push('Los montos leídos no suman el total de la factura: revisa subtotal, ITBIS y propina.');
    if (Number(j.confianza) < 0.7) avisos.push('La foto no se leyó con buena confianza: revisa todos los campos.');

    return {
        proveedor_id: prov ? prov.id : null, rnc_proveedor: rnc || null, nombre_proveedor: j.nombre_proveedor || null, ncf, fecha_comprobante: fecha,
        monto_bienes: bienes, monto_servicios: servicios, itbis_facturado: itbis, propina, total,
        forma_pago: FORMAS[j.forma_pago] || '01', confianza: Number(j.confianza) || null, avisos, crudo: j
    };
}

// Guarda los últimos intentos (foto + respuesta del modelo) para poder diagnosticar lecturas fallidas; conserva solo los 10 más recientes.
async function guardarTraza(dataUrl, traza, error) {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS lector_trazas (id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, creado TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            kb INT, imagen TEXT, respuesta TEXT, error TEXT)`);
        await db.query('INSERT INTO lector_trazas (kb, imagen, respuesta, error) VALUES (?, ?, ?, ?)', [Math.round(String(dataUrl || '').length / 1024), String(dataUrl || '').slice(0, 3 * 1024 * 1024), traza.respuesta || null, error || null]);
        await db.query('DELETE FROM lector_trazas WHERE id NOT IN (SELECT id FROM lector_trazas ORDER BY id DESC LIMIT 10)');
    } catch (e) { console.error('lector_trazas', e.message); }
}

async function leerFactura(dataUrl, { proveedores = [] } = {}) {
    const traza = {};
    try {
        const r = await leerFacturaInterna(dataUrl, proveedores, traza);
        await guardarTraza(dataUrl, traza, null);
        return r;
    } catch (e) {
        await guardarTraza(dataUrl, traza, e.message);
        throw e;
    }
}

module.exports = { leerFactura };
