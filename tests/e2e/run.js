// Pruebas de punta a punta de Restaurant Martin (POS, delivery, voz y WhatsApp).
//   ALLOW_E2E_RESET=1 npm run test:e2e
//
// ⚠️ ESTAS PRUEBAS BORRAN TODOS LOS DATOS de la base configurada en DATABASE_URL (productos, pedidos,
// usuarios…). Úsalas solo con una base de PRUEBAS (por ejemplo, un proyecto de Supabase aparte),
// nunca con la base real del restaurante.
//
// Qué hacen: vacían la base, arrancan el servidor con un Evolution API y un OpenAI SIMULADOS,
// ejecutan las 4 suites en orden y apagan el servidor. No llaman a servicios externos reales.
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
process.chdir(ROOT);
require('dotenv').config();

if (process.env.ALLOW_E2E_RESET !== '1') {
    console.error('⚠️  Estas pruebas BORRAN todos los datos de la base configurada en DATABASE_URL.\n' +
        '   Si es una base de PRUEBAS, ejecútalas así:  ALLOW_E2E_RESET=1 npm run test:e2e');
    process.exit(1);
}
if (process.env.NODE_ENV === 'production') {
    console.error('Se niega a correr con NODE_ENV=production.');
    process.exit(1);
}

const SUITES = ['01-pos-mesas-stripe-reservas', '02-delivery', '03-voz-vapi', '04-whatsapp', '05-ayuda-y-movil'];
const ENTORNO_SIMULADO = {
    EVOLUTION_API_URL: 'http://localhost:4801', EVOLUTION_API_KEY: 'globalkey',
    OPENAI_API_KEY: 'test', OPENAI_BASE_URL: 'http://localhost:4802/v1',
    APP_URL: 'https://pos.example.com', WA_PAUSA_MIN_MS: '0', WA_PAUSA_MAX_MS: '0',
    PORT: '3000',
    DB_POOL_MAX: '4' // el Session pooler de Supabase admite pocas conexiones simultáneas (15 en el plan gratis)
};

async function vaciarBase() {
    const db = require(path.join(ROOT, 'db.js'));
    const [tablas] = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    if (tablas.length) {
        await db.pool.query(`TRUNCATE ${tablas.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
    }
    await db.ensureSchema(); // vuelve a sembrar la configuración de los agentes
    await db.end();
}

async function esperarServidor() {
    for (let i = 0; i < 40; i++) {
        try { const r = await fetch('http://localhost:3000/login', { redirect: 'manual' }); if (r.status) return true; } catch (_) { /* aún no */ }
        await new Promise((r) => setTimeout(r, 500));
    }
    return false;
}

(async () => {
    console.log('Vaciando la base de pruebas…');
    await vaciarBase();
    const servidor = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, ...ENTORNO_SIMULADO }, stdio: 'ignore' });
    let fallo = false;
    try {
        if (!(await esperarServidor())) throw new Error('El servidor no arrancó en 20 s');
        for (const s of SUITES) {
            console.log(`\n=== ${s} ===`);
            const r = spawnSync(process.execPath, [path.join(__dirname, `${s}.js`)], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...ENTORNO_SIMULADO } });
            if (r.status !== 0) { fallo = true; console.error(`✖ ${s} falló`); }
        }
    } catch (e) {
        fallo = true;
        console.error(e.message);
    } finally {
        servidor.kill();
    }
    console.log(fallo ? '\n✖ HAY PRUEBAS FALLIDAS' : '\n✔ TODAS LAS PRUEBAS PASARON');
    process.exit(fallo ? 1 : 0);
})();
