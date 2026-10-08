// Crea o actualiza las tablas de la base de datos (database.sql, idempotente).
// Se ejecuta en el build de Vercel y a mano con: npm run db:init
// Falla (código 1) si no puede conectar o el SQL tiene errores, para que un despliegue sin tablas no pase inadvertido.
const db = require('../db');

(async () => {
    if (!process.env.DATABASE_URL) {
        console.error('Falta DATABASE_URL: agrégala en las variables de entorno antes de desplegar.');
        process.exit(1);
    }
    const ok = await db.ensureSchema();
    await db.end().catch(() => {});
    if (!ok) {
        console.error('No se pudo preparar la base de datos. Revisa DATABASE_URL (usa el Session pooler de Supabase, puerto 5432).');
        process.exit(1);
    }
    console.log('Base de datos lista.');
})();
