// Sincroniza las herramientas y publica el asistente de voz en Vapi desde la terminal.
// Uso: npm run vapi:sync     (necesita VAPI_API_KEY, VAPI_WEBHOOK_TOKEN y APP_URL https en .env)
// También se puede hacer desde la app: Configuración → Asistentes IA → Publicar.
// Relacionado con: services/vapi.js
const vapi = require('../services/vapi');
const db = require('../db');

(async () => {
    await db.ensureSchema();
    const r = await vapi.publicar();
    console.log(r.creado ? 'Asistente creado' : 'Asistente actualizado', `(${r.assistantId})`);
    console.log('Herramientas creadas:', r.herramientas.creadas.join(', ') || '—');
    console.log('Herramientas actualizadas:', r.herramientas.actualizadas.join(', ') || '—');
    console.log('Sin cambios:', r.herramientas.sinCambios.length);
    console.log(r.numeroVinculado ? 'Número de Vapi vinculado al asistente' : 'Aún no hay número de Vapi vinculado (ver Configuración → Asistentes IA)');
    await db.end();
})().catch(async (e) => {
    console.error('Error:', e.message);
    await db.end().catch(() => {});
    process.exit(1);
});
