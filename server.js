// Arranque del servidor (VPS, PC del restaurante o desarrollo): npm start
// La aplicación Express vive en app.js; en Vercel la carga api/index.js sin pasar por aquí.
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const app = require('./app');
const db = require('./db');

// Crear directorios necesarios
const createRequiredDirectories = () => {
    const directories = [
        path.join(__dirname, 'public'),
        path.join(__dirname, 'public', 'uploads'),
        path.join(__dirname, 'public', 'css'),
        path.join(__dirname, 'public', 'js')
    ];

    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Directorio creado: ${dir}`);
        }
    });
};

// Crear directorios al iniciar
createRequiredDirectories();

// Puerto preferido:
// - APP_PORT: variable específica de este sistema (recomendada para evitar conflictos con otros proyectos)
// - PORT: compatibilidad con entornos existentes
// - 3002: fallback por defecto
const PORT = Number(process.env.APP_PORT || process.env.PORT || 3002);

// Verificar la conexión a la base de datos antes de iniciar el servidor
async function startServer() {
    try {
        console.log('Intentando conectar a la base de datos...');
        const connection = await db.getConnection();
        connection.release();
        console.log('Conexión exitosa a la base de datos');
        await db.ensureSchema();
        // Recordatorios de reservas por WhatsApp (solo actúan si WhatsApp está conectado)
        require('./services/agente/avisos').iniciarRecordatorios();

        // Iniciar el servidor solo si la conexión a la base de datos es exitosa.
        // Si el puerto está ocupado, probamos automáticamente el siguiente disponible.
        // Relacionado con: escenarios donde hay otros Node corriendo en la misma máquina.
        const host = '0.0.0.0';
        const maxIntentosPuerto = 10;

        function listenConFallback(puertoInicial, intentosRestantes) {
            return new Promise((resolve, reject) => {
                const puerto = Number(puertoInicial);
                const server = app.listen(puerto, host, () => {
                    console.log(`Servidor corriendo en http://localhost:${puerto} (LAN habilitada)`);
                    console.log('Rutas disponibles:');
                    console.log('- GET  /', '(Página principal)');
                    console.log('- POST /api/facturas', '(Generar factura)');
                    console.log('- GET  /api/facturas/:id/imprimir', '(Imprimir factura)');
                    resolve(server);
                });

                server.on('error', (error) => {
                    if (error && error.code === 'EADDRINUSE') {
                        if (intentosRestantes > 0) {
                            const siguiente = puerto + 1;
                            console.warn(`Puerto ${puerto} en uso. Probando ${siguiente}...`);
                            try { server.close(); } catch (_) {}
                            return resolve(listenConFallback(siguiente, intentosRestantes - 1));
                        }
                        return reject(new Error(`No hay puertos disponibles desde ${puerto} hasta ${puerto + maxIntentosPuerto}`));
                    }
                    reject(error);
                });
            });
        }

        await listenConFallback(PORT, maxIntentosPuerto);

    } catch (err) {
        console.error('Error al conectar a la base de datos:', err);
        process.exit(1);
    }
}

// Manejar señales de terminación
process.on('SIGTERM', () => {
    console.log('Recibida señal SIGTERM. Cerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Recibida señal SIGINT. Cerrando servidor...');
    process.exit(0);
});

startServer();
