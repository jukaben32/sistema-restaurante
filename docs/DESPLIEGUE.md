# Despliegue en un VPS con Dokploy

Esta guía deja Restaurant Martin funcionando en internet con HTTPS, que es lo que necesitan **Vapi** (llamadas) y **WhatsApp** para avisarle a la app de cada llamada y mensaje.

> Docker y Dokploy no se pudieron probar en el equipo de desarrollo. El primer despliegue puede pedir pequeños ajustes: revisa los *logs* de cada servicio en Dokploy.

## 1. Qué necesitas
| Pieza | Para qué | Costo aprox. |
|---|---|---|
| VPS (2 GB RAM, Ubuntu) con [Dokploy](https://dokploy.com) instalado | Correr la app y Evolution API | US$6–12/mes |
| Un dominio o subdominio (ej. `pos.tudominio.com`) apuntando a la IP del VPS | HTTPS | ~US$12/año |
| Proyecto de Supabase (ya lo tienes) | Base de datos del POS | gratis / plan Pro |
| Cuenta de [Vapi](https://vapi.ai) + número de teléfono | Agente de voz | ~US$0.10–0.15/min |
| Llave de [OpenAI](https://platform.openai.com) | "Cerebro" del asistente de WhatsApp | centavos por conversación |
| Un número con WhatsApp (de preferencia WhatsApp Business) | WhatsApp del restaurante | — |

## 2. Variables de entorno (Dokploy → tu proyecto → Environment)
Genera valores aleatorios largos con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

| Variable | Valor |
|---|---|
| `APP_DOMAIN` | `pos.tudominio.com` |
| `APP_URL` | `https://pos.tudominio.com` |
| `DATABASE_URL` | Cadena **Session pooler** de Supabase (Connect → Session pooler) |
| `SESSION_SECRET` | aleatorio largo |
| `APP_ENCRYPTION_KEY` | aleatorio largo (**no lo cambies** después de guardar llaves de Stripe o WhatsApp) |
| `VAPI_WEBHOOK_TOKEN` | aleatorio largo |
| `VAPI_API_KEY` | Vapi → Organization → API Keys → clave **privada** |
| `OPENAI_API_KEY` | tu llave de OpenAI |
| `EVOLUTION_API_KEY` | aleatorio largo (llave global de Evolution) |
| `EVOLUTION_DB_PASSWORD` | aleatorio |
| `DB_TIMEZONE` / `WHATSAPP_CODIGO_PAIS` | `America/Santo_Domingo` / `1` |

## 3. Publicar
1. En Dokploy crea un proyecto → **Compose** → origen *Git* con tu fork (`jukaben32/sistema-restaurante`, rama `main`) y el archivo `docker-compose.dokploy.yml`.
2. Pega las variables de la sección 2 y despliega. Las tablas de la base se crean solas al arrancar.
3. Abre `https://pos.tudominio.com`, entra con tu usuario administrador y **cambia la contraseña** en *Usuarios*.

## 4. Configurar el restaurante
1. **Configuración → Delivery y agentes**: horario, zonas de entrega con su costo, pedido mínimo, datos de transferencia, teléfono para pasar con una persona y preguntas frecuentes.
2. **Productos**: marca "Mostrar en el menú", categoría y descripción de cada plato (los asistentes solo ofrecen platos publicados y disponibles).
3. **Configuración → Pagos con Stripe**: pega tus llaves y activa el interruptor.

## 5. Agente de voz (Vapi)
1. En Vapi, compra o importa un número y copia su **Phone Number ID**.
2. **Configuración → Asistentes IA → Agente de voz**: pega el *Phone Number ID* y pulsa **Guardar y publicar en Vapi**. Los cuatro indicadores de arriba deben quedar en verde.
3. Prueba llamando al número de Vapi, o desde el dashboard de Vapi con *Talk to assistant*, hablando en español y en inglés.
4. Para usar el número de siempre del restaurante, pide a tu operadora (Claro/Altice) el **desvío de llamadas** (por ocupado / sin respuesta, o total en horas pico) hacia el número de Vapi. Algunos operadores no reenvían el número de quien llama: en ese caso el asistente le pedirá un teléfono de contacto.
5. La voz se elige al crear el asistente (idioma automático). Puedes cambiarla en el dashboard de Vapi; **Publicar** no la pisa.

## 6. WhatsApp (Evolution API)
1. **Configuración → Asistentes IA → WhatsApp** → **Conectar WhatsApp** → escanea el QR con el teléfono del restaurante (*WhatsApp → Dispositivos vinculados*).
2. Activa **"El asistente responde los mensajes"** y envía un mensaje de prueba.
3. **Recomendaciones para no perder el número** (Evolution API no es la API oficial de WhatsApp):
   - Usa un número con historial normal de uso, de preferencia WhatsApp Business.
   - El asistente solo responde a quien escribe y manda avisos del propio pedido o reserva. **No hagas envíos masivos.**
   - Si escribes tú desde ese teléfono, el asistente se pausa en esa conversación (puedes devolverle el control en *Conversaciones*).
   - Plan B: migrar a la API oficial *WhatsApp Cloud API*; solo habría que reemplazar `services/evolution.js`.

## 7. Operación diaria
- **Delivery**: los pedidos de los asistentes llegan a *Delivery → Por confirmar* con aviso sonoro. Revísalos y confirma: pasan a cocina y el cliente recibe el aviso por WhatsApp.
- **Conversaciones**: lee llamadas y chats, toma una conversación o devuélvela al asistente.
- Durante la primera semana revisa las transcripciones y ajusta *Instrucciones adicionales* en *Asistentes IA*.

## 8. Pruebas automáticas
Con una base de **pruebas** (nunca la real, porque se vacía):
```
ALLOW_E2E_RESET=1 npm run test:e2e
```
Simulan Evolution y OpenAI; no gastan llamadas reales.
