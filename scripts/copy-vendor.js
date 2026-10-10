// Copia las librerías de interfaz (Bootstrap, jQuery, SweetAlert2, Select2, íconos) de node_modules a
// public/vendor para que la CDN de Vercel las sirva como archivos estáticos (más rápido que pasar por
// la función). Se ejecuta en el build de Vercel: npm run vercel-build
//
// IMPORTANTE: este script NO borra la carpeta de destino. Vercel puede ejecutar el build dos veces a la vez; si una
// copia borraba los archivos mientras la otra los subía, el despliegue fallaba con ENOENT (public/vendor/...).
// Tampoco se reescribe lo que ya existe, así que correr dos copias a la vez es seguro. (Si actualizas una librería
// en tu PC y quieres refrescar la copia, borra la carpeta public/vendor y vuelve a ejecutar el script.)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAPA = {
    bootstrap: 'bootstrap/dist',
    jquery: 'jquery/dist',
    sweetalert2: 'sweetalert2/dist',
    select2: 'select2/dist',
    'select2-bootstrap-5-theme': 'select2-bootstrap-5-theme/dist',
    'bootstrap-icons': 'bootstrap-icons/font'
};

let copiados = 0;
for (const [destino, origen] of Object.entries(MAPA)) {
    const desde = path.join(ROOT, 'node_modules', origen);
    const hasta = path.join(ROOT, 'public', 'vendor', destino);
    if (!fs.existsSync(desde)) {
        console.error(`Falta ${origen} en node_modules (¿se instalaron las dependencias?)`);
        process.exit(1);
    }
    // No se copian los idiomas de Select2, los mapas de depuración ni las versiones .esm.js (la app no las usa; aligera el paquete)
    fs.cpSync(desde, hasta, {
        recursive: true,
        force: false,        // lo que ya existe no se toca (ni se borra ni se reescribe): seguro aunque haya dos copias a la vez
        errorOnExist: false,
        filter: (archivo) => !/[\\/]i18n([\\/]|$)/.test(archivo) && !archivo.endsWith('.map') && !/\.esm(\.[a-z]+)*\.js$/.test(archivo)
    });
    copiados++;
}
console.log(`Librerías copiadas a public/vendor (${copiados})`);
