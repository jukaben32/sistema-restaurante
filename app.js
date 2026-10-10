// Aplicación Express de Restaurant Martin (sin arrancar el servidor).
// La cargan: server.js (VPS / PC, escucha en un puerto) y api/index.js (Vercel, función serverless).
require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const app = express();
const db = require('./db');
const { attachUserToLocals, requireAuth, requireRole } = require('./middleware/auth');

// Configuración
// El motor EJS se registra con require estático (en serverless, Vercel solo empaqueta lo que se importa)
app.engine('ejs', require('ejs').__express);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Detrás de un proxy (Vercel, Traefik): protocolo https y cookies seguras correctas
app.set('trust proxy', 1);
// Código de país para enlaces de WhatsApp con números locales de 10 dígitos (views/factura.ejs)
app.locals.codigoPaisWhatsapp = process.env.WHATSAPP_CODIGO_PAIS || '';

// Cron / mantenimiento (público, protegido con CRON_SECRET): routes/cron.js
app.use(require('./routes/cron'));

// Stripe (público): webhook con body crudo -> debe ir ANTES de express.json. Incluye /pago/estado.
// Nota: en Vercel el cuerpo ya llega leído, así que el webhook de Stripe no aplica; el estado de los
// cobros se consulta directamente a Stripe (no hace falta configurarlo).
// Relacionado con: routes/stripe.js
const stripeRoutes = require('./routes/stripe');
app.use(stripeRoutes.publico);

// En Vercel, el entorno puede haber leído ya el cuerpo JSON / de formularios (req.body).
// Si es así, se marca para que express.json / urlencoded no intenten leer el flujo otra vez.
// Los formularios con archivos (multipart) no se tocan: multer los lee del flujo.
if (process.env.VERCEL) {
    app.use((req, res, next) => {
        const ct = String(req.headers['content-type'] || '');
        if (/^(application\/json|application\/x-www-form-urlencoded)/i.test(ct) && req.body !== undefined && !Buffer.isBuffer(req.body)) {
            req._body = true;
        }
        next();
    });
}

// Aumentar el límite de tamaño del cuerpo de la petición
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Secreto de sesión: obligatorio (ver .env.example). Si falta, se genera uno temporal.
const SESSION_SECRET = process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
    console.warn('AVISO: falta SESSION_SECRET en .env; se usa uno temporal y las sesiones no serán válidas entre instancias.');
}

// Sesiones (login) guardadas en la base de datos (tabla user_sessions): funcionan con varias instancias
// (Vercel) y sobreviven a los reinicios. Las vencidas se limpian en routes/cron.js.
// Relacionado con: routes/auth.js (POST /login, POST /logout), middleware/auth.js (req.session.user)
const PgStore = connectPgSimple(session);
app.use(session({
    name: 'sr.sid',
    secret: SESSION_SECRET,
    store: new PgStore({ pool: db.pool, tableName: 'user_sessions', createTableIfMissing: false, pruneSessionInterval: false }),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto', // solo por https (detrás del proxy); en http local sigue funcionando
        maxAge: 1000 * 60 * 60 * 12 // 12 horas
    }
}));

// Hacer disponible el usuario en EJS como "user"
app.use(attachUserToLocals);
// Ruta actual para marcar la opción activa del menú (views/partials/navbar.ejs)
app.use((req, res, next) => { res.locals.rutaActual = req.path; next(); });
// Pie de página (agencia, WhatsApp y redes): services/pie.js
app.use(require('./services/pie').middleware);
// Tiempos de las alertas por demora (Cocina y Delivery): services/alertas.js
app.use(require('./services/alertas').middleware);

// Configuración de archivos estáticos
// (en Vercel, public/ lo sirve la CDN directamente; esto cubre servidor propio y desarrollo)
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// Vendor assets (para funcionar OFFLINE incluso empaquetado con pkg)
// Nota: en Vercel se copian a public/vendor durante el build (scripts/copy-vendor.js)
app.use('/vendor/bootstrap', express.static(path.join(__dirname, 'node_modules', 'bootstrap', 'dist')));
app.use('/vendor/jquery', express.static(path.join(__dirname, 'node_modules', 'jquery', 'dist')));
app.use('/vendor/sweetalert2', express.static(path.join(__dirname, 'node_modules', 'sweetalert2', 'dist')));
app.use('/vendor/select2', express.static(path.join(__dirname, 'node_modules', 'select2', 'dist')));
app.use('/vendor/select2-bootstrap-5-theme', express.static(path.join(__dirname, 'node_modules', 'select2-bootstrap-5-theme', 'dist')));
// bootstrap-icons usa fuentes (woff/woff2) -> servir carpeta font completa
app.use('/vendor/bootstrap-icons', express.static(path.join(__dirname, 'node_modules', 'bootstrap-icons', 'font')));

// Headers de seguridad (la app es same-origin: no se habilita CORS)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Rutas
const productosRoutes = require('./routes/productos');
const clientesRoutes = require('./routes/clientes');
const facturasRoutes = require('./routes/facturas');
const mesasRoutes = require('./routes/mesas');
const cocinaRoutes = require('./routes/cocina');
const configuracionRoutes = require('./routes/configuracion');
const ventasRoutes = require('./routes/ventas');
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');

// Comprobación de salud (Docker / Dokploy)
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Auth routes (públicas): /login /logout /setup
app.use(authRoutes);

// ===== Funciones modernas (Restaurant Martin) =====
const menuRoutes = require('./routes/menu');
const reservasRoutes = require('./routes/reservas');
const inventarioRoutes = require('./routes/inventario');
const dashboardRoutes = require('./routes/dashboard');
const personal = requireRole(['mesero', 'administrador']);

// Públicas: menú QR por mesa (/menu/:token) y formulario de reservas (/reservar)
app.use(menuRoutes.publico);
app.use(reservasRoutes.publico);

// App para clientes (instalable): /pedir y /api/pedir (público); configuración en /configuracion/app-clientes (admin)
const pedirRoutes = require('./routes/pedir');
app.use(pedirRoutes.publico);

// Agente de voz (Vapi): webhook público protegido por token (routes/vapi.js)
app.use(require('./routes/vapi'));

// WhatsApp (Evolution API): webhook público; el secreto va en la URL (routes/whatsapp.js)
app.use(require('./routes/whatsapp'));

// Personal: avisos del menú QR, hoja de QR, reservas
app.use(['/api/mesa-alertas', '/mesas-qr', '/api/mesas-qr'], personal);
app.use(menuRoutes.staff);
app.use(['/reservas', '/api/reservas'], personal);
app.use(reservasRoutes.staff);

// Administrador: dashboard e inventario
app.use(['/dashboard', '/api/dashboard', '/inventario', '/api/inventario'], requireRole('administrador'));
app.use(dashboardRoutes);
app.use(inventarioRoutes);

// Stripe: cobros (personal) y configuración (admin; antes de /configuracion)
app.use('/api/stripe', personal, stripeRoutes.staff);
app.use('/configuracion/stripe', requireRole('administrador'), stripeRoutes.admin);

// Datos de demostración: estado y botón Quitar (admin)
app.use('/api/demo', requireRole('administrador'));
app.use(require('./routes/demo'));

app.use('/configuracion/app-clientes', requireRole('administrador'), pedirRoutes.admin);
app.use('/configuracion/redes', requireRole('administrador'), require('./routes/pie'));
app.use('/configuracion/alertas', requireRole('administrador'), require('./routes/alertas'));

// Cripto (BTCPay Server): cobros (personal) y configuración (admin)
const criptoRoutes = require('./routes/cripto');
app.use('/api/cripto', personal, criptoRoutes.staff);
app.use('/configuracion/cripto', requireRole('administrador'), criptoRoutes.admin);

// Delivery / para llevar (personal) y datos del negocio para delivery y agentes (admin)
const deliveryRoutes = require('./routes/delivery');
const agentesRoutes = require('./routes/agentes');
app.use(['/delivery', '/api/delivery'], personal);
app.use(deliveryRoutes);
app.use(['/configuracion/agentes', '/api/negocio'], requireRole('administrador'));
app.use(agentesRoutes);

// Asistentes IA: configuración (admin) y bandeja de conversaciones (personal)
app.use(['/configuracion/ia', '/api/ia'], requireRole('administrador'));
app.use(require('./routes/ia'));
app.use(['/conversaciones', '/api/conversaciones'], personal);
app.use(require('./routes/conversaciones'));

// Guía de uso integrada (cualquier rol con sesión): routes/ayuda.js
app.use(['/ayuda'], requireAuth);
app.use(require('./routes/ayuda'));

// Ruta principal (requiere login)
app.get('/', requireAuth, (req, res) => {
    const rol = String(req.session?.user?.rol || '').toLowerCase();
    if (rol === 'cocinero') return res.redirect('/cocina');
    if (rol === 'mesero') return res.redirect('/mesas');
    // admin
    res.render('index');
});

// Usar las rutas
// Panel de usuarios (solo admin)
app.use('/usuarios', requireRole('administrador'), usuariosRoutes);
app.use('/api/usuarios', requireRole('administrador'), usuariosRoutes);

// Productos
app.use('/productos', requireRole('administrador'), productosRoutes); // panel admin
app.use('/api/productos', requireRole(['mesero', 'administrador']), productosRoutes); // búsqueda/armado pedido

// Clientes
app.use('/clientes', requireRole('administrador'), clientesRoutes);
app.use('/api/clientes', requireRole(['mesero', 'administrador']), clientesRoutes);

// Facturas (impresión/creación). Mesero necesita imprimir desde Mesas.
app.use('/facturas', requireRole('administrador'), facturasRoutes);
app.use('/api/facturas', requireRole(['mesero', 'administrador']), facturasRoutes);

// Mesas (mesero/admin)
app.use('/mesas', requireRole(['mesero', 'administrador']), mesasRoutes);
app.use('/api/mesas', requireRole(['mesero', 'administrador']), mesasRoutes);

// Cocina
// - Cocinero/Admin: puede preparar/marcar listo
// - Mesero: solo visualiza y marca "Entregado" en la pestaña de listos (la acción se hace vía /api/mesas/items/:id/estado con validación)
// Relacionado con: routes/cocina.js (middlewares por ruta) y routes/mesas.js (restricción servido)
app.use('/cocina', requireRole(['cocinero', 'mesero', 'administrador']), cocinaRoutes);
app.use('/api/cocina', requireRole(['cocinero', 'mesero', 'administrador']), cocinaRoutes);

// Configuración y ventas (admin)
app.use('/configuracion', requireRole('administrador'), configuracionRoutes);
app.use('/ventas', requireRole('administrador'), ventasRoutes);

// Ruta para la página de productos
app.get('/productos', async (req, res) => {
    try {
        const [productos] = await db.query('SELECT * FROM productos ORDER BY nombre');
        res.render('productos', { productos: productos || [] });
    } catch (error) {
        console.error('Error al obtener productos:', error);
        res.status(500).render('error', {
            error: {
                message: 'Error al obtener productos',
                stack: process.env.NODE_ENV === 'development' ? error.stack : ''
            }
        });
    }
});

// Manejo de errores 404
app.use((req, res, next) => {
    console.log('404 - Ruta no encontrada:', req.url);
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        res.status(404).json({ error: 'Ruta no encontrada' });
    } else {
        res.status(404).render('404');
    }
});

// Manejo de errores generales
app.use((err, req, res, next) => {
    console.error('Error en la aplicación:', err);

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        res.status(500).json({
            error: 'Error interno del servidor',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
        });
    } else {
        res.status(500).render('error', {
            error: {
                message: 'Error interno del servidor',
                stack: process.env.NODE_ENV === 'development' ? err.stack : ''
            }
        });
    }
});

module.exports = app;
