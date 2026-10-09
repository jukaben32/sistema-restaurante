// Unidades de medida de los insumos y conversión entre ellas (kg ⇄ lb, g, oz, l, ml, gal).
// Relacionado con: services/inventario.js, routes/inventario.js, public/js/inventario.js
// Cada unidad tiene una familia (peso o volumen) y un factor respecto a la unidad base de su familia
// (peso: gramo, volumen: mililitro). Solo se convierte dentro de la misma familia.

const UNIDADES = {
    g:   { familia: 'peso', factor: 1, nombre: 'gramos' },
    kg:  { familia: 'peso', factor: 1000, nombre: 'kilos' },
    lb:  { familia: 'peso', factor: 453.59237, nombre: 'libras' },
    oz:  { familia: 'peso', factor: 28.349523125, nombre: 'onzas' },
    ml:  { familia: 'volumen', factor: 1, nombre: 'mililitros' },
    l:   { familia: 'volumen', factor: 1000, nombre: 'litros' },
    gal: { familia: 'volumen', factor: 3785.411784, nombre: 'galones' }
};

const ALIAS = {
    kilo: 'kg', kilos: 'kg', kgs: 'kg', kilogramo: 'kg', kilogramos: 'kg',
    libra: 'lb', libras: 'lb', lbs: 'lb',
    gramo: 'g', gramos: 'g', gr: 'g', grs: 'g',
    onza: 'oz', onzas: 'oz',
    litro: 'l', litros: 'l', lt: 'l', lts: 'l',
    mililitro: 'ml', mililitros: 'ml',
    galon: 'gal', 'galón': 'gal', galones: 'gal'
};

/** "Libras" -> "lb". Si no es una unidad conocida (und, porción…), devuelve el texto tal cual (minúsculas). */
function normalizar(u) {
    const t = String(u == null ? '' : u).trim().toLowerCase();
    return ALIAS[t] || t;
}

function info(u) {
    return UNIDADES[normalizar(u)] || null;
}

/** Unidades a las que se puede convertir `u` (incluida ella misma); [] si no es convertible. */
function compatibles(u) {
    const i = info(u);
    if (!i) return [];
    return Object.keys(UNIDADES).filter((k) => UNIDADES[k].familia === i.familia);
}

/** Cuántas unidades `a` equivalen a 1 unidad `de`. null si no son convertibles entre sí. */
function multiplicador(de, a) {
    const o = info(de);
    const d = info(a);
    if (!o || !d || o.familia !== d.familia) return null;
    return o.factor / d.factor;
}

function convertir(cantidad, de, a) {
    const m = multiplicador(de, a);
    return m === null ? null : Number(cantidad) * m;
}

module.exports = { UNIDADES, normalizar, info, compatibles, multiplicador, convertir };
