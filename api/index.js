// Entrada serverless para Vercel: toda petición que no sea un archivo estático llega aquí (ver vercel.json).
// La aplicación completa vive en app.js; server.js (que abre un puerto) no se usa en Vercel.
module.exports = require('../app');
