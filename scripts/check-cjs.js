// Comprueba que la app carga SIN require() de módulos ESM, como en el entorno de Vercel.
// (Node 22.12+/24 permiten require(esm) y ocultan el problema: Vercel no.)
// Uso: npm run check:cjs     (también se ejecuta al inicio de npm run test:e2e)
const { spawnSync } = require('child_process');
const path = require('path');

const r = spawnSync(process.execPath, ['--no-experimental-require-module', '-e', "require('./app'); process.exit(0)"], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: { ...process.env, SESSION_SECRET: process.env.SESSION_SECRET || 'comprobacion' }
});
if (r.status !== 0) {
    console.error('✖ La app no carga sin require(esm) (fallaría en Vercel):\n' + (r.stderr || r.stdout).split('\n').slice(0, 8).join('\n'));
    console.error('Solución: usa una versión de la librería que tenga build CommonJS, o cárgala con import() dinámico.');
    process.exit(1);
}
console.log('✔ La app carga sin require(esm) (compatible con Vercel)');
