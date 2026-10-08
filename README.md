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

## Seguridad
- `.env` **no** se sube a Git (contiene la contraseña de la base de datos).
- Las tablas tienen RLS activado en Supabase: la API pública (anon key) no puede leerlas. Solo el servidor accede, con `DATABASE_URL`.
- No hay usuario por defecto: el administrador se crea en `/setup`.

## Estructura
- `routes/` rutas y API · `views/` plantillas EJS · `public/` JS/CSS · `db.js` conexión PostgreSQL (con capa de compatibilidad estilo mysql2) · `database.sql` esquema.
