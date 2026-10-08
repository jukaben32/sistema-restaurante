// Copia las librerías de interfaz (Bootstrap, jQuery, SweetAlert2, Select2, íconos) de node_modules a
// public/vendor para que la CDN de Vercel las sirva como archivos estáticos (más rápido que pasar por
// la función). Se ejecuta en el build de Vercel: npm run vercel-build
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
    fs.rmSync(hasta, { recursive: true, force: true });
    // No se copian los idiomas de Select2 ni los mapas de depuración (la app no los usa; aligera el paquete)
    fs.cpSync(desde, hasta, {
        recursive: true,
        filter: (origen) => !/[\\/]i18n([\\/]|$)/.test(origen) && !origen.endsWith('.map')
    });
    copiados++;
}
console.log(`Librerías copiadas a public/vendor (${copiados})`);
