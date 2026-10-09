// Datos de demostración (mercado dominicano): cargar, quitar o ver el estado.
//   npm run demo:cargar      llena la app con menú, inventario, ventas de 2 semanas, reservas y delivery de ejemplo
//   npm run demo:quitar      quita TODO lo que cargó el demo (y nada más)
//   npm run demo:estado
// Usa la base de DATABASE_URL (.env). Para cargar/quitar hace falta confirmar con --si.
require('dotenv').config();
const db = require('../db');
const demo = require('../services/datosDemo');

(async () => {
    const accion = process.argv[2];
    const confirmado = process.argv.includes('--si');
    try {
        if (accion === 'estado') {
            console.log(await demo.estado(db));
        } else if (accion === 'cargar' || accion === 'quitar') {
            if (!confirmado) {
                const host = (process.env.DATABASE_URL || '').replace(/^.*@/, '').replace(/\/.*$/, '');
                console.log(`Esto va a ${accion === 'cargar' ? 'CARGAR datos de demostración en' : 'QUITAR los datos de demostración de'} la base: ${host}`);
                console.log('Para continuar, vuelve a ejecutarlo agregando --si');
                process.exit(1);
            }
            const t0 = Date.now();
            const r = accion === 'cargar' ? await demo.cargar(db, console.log) : await demo.quitar(db, console.log);
            console.log(JSON.stringify(r, null, 2));
            console.log(`Listo en ${Math.round((Date.now() - t0) / 1000)} s`);
        } else {
            console.log('Uso: node scripts/datos-demo.js <cargar|quitar|estado> [--si]');
            process.exit(1);
        }
    } catch (e) {
        console.error('Error:', e.message);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
