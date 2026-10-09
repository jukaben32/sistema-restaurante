# Restaurant Martin

Sistema de gestión para restaurante: mesas, pedidos, cocina, facturación (con pago mixto), ventas con reportes y exportación a Excel, y usuarios con roles (administrador, mesero, cocinero).

Basado en [Cristiancano1236/sistema-restaurante](https://github.com/Cristiancano1236/sistema-restaurante), migrado de MySQL a **PostgreSQL (Supabase)**.

## Tecnologías
Node.js 18+ · Express · EJS · PostgreSQL (Supabase) · ExcelJS · Bootstrap 5

## Instalación

1. Instala dependencias:
   ```powershell
   npm install
   ```
2. Copia `.env.example` a `.env` y completa:
   - `DATABASE_URL`: en Supabase, **Connect → Session pooler** (funciona con IPv4). Formato:
     `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
   - `SESSION_SECRET`: cadena aleatoria larga.
3. Inicia la app (crea las tablas automáticamente la primera vez, desde `database.sql`):
   ```powershell
   npm start
   ```
4. Abre http://localhost:3000. La primera vez te pedirá crear el usuario **administrador** (`/setup`).

Para usarla desde otros equipos de la red local, abre el puerto 3000 en el firewall y entra por la IP del servidor.

## Funciones modernas

| Función | Dónde | Quién |
|---|---|---|
| **Cobro con Stripe**: QR en pantalla, el cliente paga con tarjeta / Apple Pay / Google Pay desde su celular; el pago se verifica en el servidor y no puede aplicarse dos veces | Mesas y Venta rápida → medio de pago "Stripe" · Configuración → Pagos con Stripe | Mesero / Admin |
| **Menú digital por QR** por mesa: carta con fotos y categorías, pedido desde el celular (el mesero lo confirma), llamar al mesero, pedir la cuenta, estado del pedido en vivo | `/mesas-qr` (imprimir QR) · el cliente abre `/menu/<token>` | Público / Mesero |
| **Avisos en vivo** con sonido cuando una mesa pide, llama o solicita la cuenta | Mesas y Dashboard | Mesero / Admin |
| **Reservas**: agenda por día, asignación de mesa, detección de choques, WhatsApp al cliente y formulario público | `/reservas` · público `/reservar` | Mesero / Admin |
| **Inventario**: insumos, recetas por plato con costo y margen, descuento automático al facturar, alertas de stock bajo | `/inventario` | Admin |
| **Dashboard en vivo**: ventas de hoy vs. ayer, 7 días, más vendidos, mesas, cocina, reservas, stock | `/dashboard` (inicio del admin) | Admin |
| **Cobro con criptomonedas** (Bitcoin y Lightning vía tu propio BTCPay Server): QR en pantalla, el cliente paga con su billetera; el pago se verifica en el servidor y no puede aplicarse dos veces. También en Delivery y en los asistentes IA | Mesas, Venta rápida y Delivery → "Cripto" · Configuración → Pagos con cripto | Mesero / Admin |
| **Factura por WhatsApp** | Botón en la factura | Todos |
| **Guía de uso integrada** para quien nunca usó el sistema (por rol, con buscador, imprimible y descargable). El texto está en [ayuda/GUIA-DE-USO.md](ayuda/GUIA-DE-USO.md): se edita con cualquier editor y se actualiza sola en la app | Menú → **Ayuda** (`/ayuda`) | Todos |
| **Optimizada para Android e iPhone**: menú con botón ☰, zonas seguras del notch, sin zoom molesto en campos, botones táctiles | Todas las pantallas | Todos |
| **App instalable (PWA)** para celulares y tablets | Menú del navegador → "Instalar" (requiere HTTPS o localhost) | Todos |

### Delivery y asistentes de IA (voz y WhatsApp)
| Función | Dónde | Quién |
|---|---|---|
| **Delivery y para llevar**: tablero (por confirmar → cocina → listo → en camino → entregado), zonas con costo de envío, cobro en efectivo, transferencia validada o enlace de Stripe, factura al entregar | `/delivery` | Mesero / Admin |
| **Agente de voz (Vapi)**: atiende llamadas, toma pedidos y reservas en el idioma del cliente, pasa con una persona | Configuración → Asistentes IA | Admin |
| **Asistente de WhatsApp (Evolution API)**: lo mismo por chat; avisos automáticos de pedido y reserva | Configuración → Asistentes IA | Admin |
| **Conversaciones**: llamadas y chats, tomar el control, responder por WhatsApp | `/conversaciones` | Mesero / Admin |
| **Datos para los asistentes**: horario, zonas, FAQ, transferencia | Configuración → Delivery y agentes | Admin |

Los pedidos y reservas que toman los asistentes entran **por confirmar**: el personal los revisa antes de pasar a cocina. Vapi y WhatsApp necesitan que la app esté en internet con HTTPS. Dos formas de publicarla: en un servidor propio con Docker/Dokploy ([docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)) o en Vercel ([docs/DESPLIEGUE-VERCEL.md](docs/DESPLIEGUE-VERCEL.md), con algunas limitaciones; Evolution API siempre va en un servidor aparte).

### Configurar Stripe
1. En [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API keys, copia la llave secreta (`sk_test_…` para pruebas).
2. En la app: Configuración → **Pagos con Stripe**, pega la llave, elige la moneda, activa el interruptor y pulsa **Probar conexión**.
3. Para que los clientes vuelvan a una página de confirmación, abre la app con la IP de la PC en la red (ej. `http://192.168.1.20:3000`) o define la URL pública.
4. Webhook (opcional, si publicas la app en internet): endpoint `https://TU_DOMINIO/stripe/webhook` con los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded` y `checkout.session.expired`.

### Configurar pagos con cripto (BTCPay Server)
1. Ten un [BTCPay Server](https://btcpayserver.org) (gratis, de código abierto): un hosting de BTCPay o instalado en tu servidor. Crea una tienda, conecta tu billetera y activa Lightning.
2. En BTCPay crea una API key limitada a tu tienda con los permisos `btcpay.store.canviewinvoices`, `btcpay.store.cancreateinvoice`, `btcpay.store.canmodifyinvoices` y `btcpay.store.canviewstoresettings`.
3. En la app: Configuración → **Pagos con cripto**: URL de BTCPay, Store ID y API key; activa el interruptor y pulsa **Probar conexión**. La API key se guarda cifrada.
4. No hace falta webhook: la app consulta a BTCPay directamente (también en Vercel). Los reembolsos se hacen a mano desde BTCPay.
5. En República Dominicana las criptomonedas no son moneda de curso legal (el Banco Central no obliga a aceptarlas); su uso por un comercio privado es voluntario y las ganancias se declaran a la DGII. Consulta con tu contador.

## Seguridad
- `.env` **no** se sube a Git (contiene la contraseña de la base de datos).
- Las tablas tienen RLS activado en Supabase: la API pública (anon key) no puede leerlas. Solo el servidor accede, con `DATABASE_URL`.
- No hay usuario por defecto: el administrador se crea en `/setup`.

## Estructura
- `routes/` rutas y API · `views/` plantillas EJS · `public/` JS/CSS · `db.js` conexión PostgreSQL (con capa de compatibilidad estilo mysql2) · `database.sql` esquema.
