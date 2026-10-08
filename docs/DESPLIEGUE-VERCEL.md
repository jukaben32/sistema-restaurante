# Despliegue en Vercel

La app se puede publicar en Vercel, pero conviene saber **qué cambia** respecto a un servidor normal y **qué no se pudo probar**.

> ⚠️ **No se pudo probar en Vercel real** (requiere tu cuenta). Se probó localmente simulando el modo serverless (pocas conexiones, `waitUntil`, sesiones en la base de datos). El primer despliegue puede pedir ajustes: revisa *Deployments → Logs* y *Functions*.

## Qué se adaptó
| Problema en serverless | Solución |
|---|---|
| Los inicios de sesión vivían en la memoria del servidor | Sesiones en la tabla `user_sessions` (Postgres) |
| WhatsApp: el asistente procesa el mensaje *después* de responder al webhook; Vercel congela la función al responder | `waitUntil` de `@vercel/functions` mantiene la función viva hasta terminar |
| Mensajes ya vistos, "enviado por el sistema", tope anti-abuso y orden por cliente estaban en memoria | Tablas `wa_ids`, `candados` y consultas a la base de datos |
| Los recordatorios de reservas usaban un temporizador | Ruta `/api/cron/mantenimiento` (Vercel Cron o un pinger) |
| Archivos estáticos de Bootstrap, etc. salían de `node_modules` | Se copian a `public/vendor` en el build y los sirve la CDN |
| Muchas conexiones a la base de datos | Pool pequeño (4) por instancia; **usa el Session pooler de Supabase** |

## Limitaciones que debes conocer
- **Evolution API (WhatsApp) NO puede correr en Vercel.** Necesita un servidor encendido 24 h: usa tu VPS con `docker-compose.evolution.yml` (más abajo).
- **Tiempo máximo por petición**: la configuración pide 60 s. En el plan Hobby puede ser menor; una respuesta de WhatsApp con varias herramientas suele tardar 5–15 s. Si ves cortes, pasa a Pro.
- **Recordatorios de reservas**: Vercel Hobby solo permite cron **una vez al día**. Para recordatorios 2 h antes necesitas cron cada ~10 min: plan Pro, o un pinger gratuito (ver paso 6).
- **Arranque en frío**: la primera petición tras un rato inactivo tarda 1–3 s más. En una llamada, la primera herramienta puede notarse más lenta.
- **Webhook de Stripe: no lo configures.** En Vercel el cuerpo de la petición llega ya leído y no se puede verificar la firma. No hace falta: la app consulta a Stripe directamente el estado de cada cobro.
- **Impresión "en servidor" (PowerShell)** no existe en Vercel: usa la impresión desde el navegador.
- **Tamaño de archivos**: Vercel limita cada petición a ~4.5 MB (fotos de productos, logo, Excel de importación).
- Los límites anti-spam de los formularios públicos (reservas, menú QR) son por instancia, por lo que son más débiles que en un servidor único.

Si estos límites te molestan, un servidor propio (`docs/DESPLIEGUE.md`) los evita todos.

## Paso a paso
### 1. Evolution API en tu VPS (WhatsApp)
1. En Dokploy crea un proyecto **Compose** con `docker-compose.evolution.yml` y las variables `EVOLUTION_DOMAIN`, `EVOLUTION_API_KEY`, `EVOLUTION_DB_PASSWORD`.
2. Apunta el DNS de `evolution.tudominio.com` a la IP del VPS. Comprueba que `https://evolution.tudominio.com` responde.

### 2. Importar el proyecto en Vercel
1. En [vercel.com/new](https://vercel.com/new) importa el repositorio `jukaben32/sistema-restaurante` (rama **main**).
2. **Framework Preset: Other.** Deja el resto: `vercel.json` ya define el build y la salida.

### 3. Variables de entorno (Settings → Environment Variables)
| Variable | Valor |
|---|---|
| `DATABASE_URL` | Cadena **Session pooler** de Supabase (Connect → Session pooler, puerto **5432**) |
| `SESSION_SECRET`, `APP_ENCRYPTION_KEY` | aleatorios largos (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). No cambies `APP_ENCRYPTION_KEY` después |
| `APP_URL` | `https://TU-PROYECTO.vercel.app` (o tu dominio) |
| `DB_TIMEZONE` / `WHATSAPP_CODIGO_PAIS` | `America/Santo_Domingo` / `1` |
| `VAPI_API_KEY` / `VAPI_WEBHOOK_TOKEN` | clave privada de Vapi / token aleatorio |
| `OPENAI_API_KEY` | tu llave |
| `EVOLUTION_API_URL` | `https://evolution.tudominio.com` |
| `EVOLUTION_API_KEY` | la misma del paso 1 |
| `CRON_SECRET` | aleatorio largo (protege el mantenimiento programado) |

### 4. Desplegar
Pulsa **Deploy**. El build copia los estilos y crea las tablas (`npm run vercel-build`). Si falla con *"No se pudo preparar la base de datos"*, revisa `DATABASE_URL`.

### 5. Primer uso
Abre la URL, entra con el administrador y cambia la contraseña. Luego sigue las secciones 4–6 de `docs/DESPLIEGUE.md` (datos del restaurante, publicar el agente de voz, conectar WhatsApp). Como `APP_URL` ya es https público, los webhooks de Vapi y WhatsApp quedan bien configurados.

### 6. Recordatorios de reservas
- **Plan Pro**: en `vercel.json` cambia el cron a `*/10 * * * *` y vuelve a desplegar.
- **Plan gratuito**: crea una tarea en [cron-job.org](https://cron-job.org) (gratis) que cada 10 minutos llame a  
  `https://TU-APP/api/cron/mantenimiento?secret=TU_CRON_SECRET`.

## Si algo falla
- *Te saca de la sesión o el login no avanza*: confirma que `SESSION_SECRET` está definido y que la tabla `user_sessions` existe (se crea en el build).
- *Error de "too many connections"*: usa el **Session pooler** (no la conexión directa) y baja `DB_POOL_MAX` a 2–3.
- *WhatsApp no responde*: *Deployments → Functions → Logs*, filtra `/api/whatsapp/webhook`. Revisa que `APP_URL` sea el dominio correcto y que Evolution alcance esa URL.
- *Las horas salen corridas*: `DB_TIMEZONE` debe estar definida en Vercel y la base debe usar el Session pooler.
