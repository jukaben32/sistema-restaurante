// Catálogo de herramientas de los agentes. UNA definición sirve para Vapi (voz) y para
// OpenAI Chat Completions (WhatsApp): mismas herramientas, misma lógica (ejecutor.js).
// Reglas de oro (como en CRM.Agentevoz): NUNCA se le pide al modelo el teléfono del cliente ni
// precios; el teléfono viene del canal y los precios salen siempre de la base de datos.
// Relacionado con: services/agente/ejecutor.js, services/agente/texto.js, scripts/vapi-sync.js
const crypto = require('crypto');

const ITEM_PEDIDO = {
    type: 'object',
    properties: {
        producto_id: { type: 'integer', description: 'ID del plato tal como lo devolvió consultarMenu' },
        cantidad: { type: 'integer', description: 'Cantidad de unidades (1 o más)' },
        nota: { type: 'string', description: 'Indicación para cocina (ej. sin cebolla, término medio). Opcional' }
    },
    required: ['producto_id', 'cantidad']
};

// Mensaje hablado si falla una herramienta en una llamada (bilingüe: el idioma del cliente es desconocido)
const FALLA = 'Un momento por favor, tuve un problema con el sistema. One moment please, I had a system issue.';

const HERRAMIENTAS = [
    {
        name: 'identificarCliente',
        description:
            'Busca al cliente por el teléfono desde el que llama o escribe. Devuelve su nombre, dirección habitual, pedido reciente y próxima reserva si existen. ' +
            'Llámala al inicio de la conversación. Nunca pidas el teléfono al cliente.',
        parameters: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'consultarMenu',
        description:
            'Consulta el menú real del restaurante: platos disponibles con su id, precio y descripción. Úsala SIEMPRE antes de ofrecer, recomendar o confirmar un plato o precio. ' +
            'Puedes filtrar por categoría o por una palabra de búsqueda.',
        parameters: {
            type: 'object',
            properties: {
                categoria: { type: 'string', description: 'Categoría a consultar (ej. Entradas, Platos fuertes, Bebidas). Opcional' },
                busqueda: { type: 'string', description: 'Palabra a buscar en el nombre o descripción (ej. pollo, vegetariano). Opcional' }
            },
            required: []
        }
    },
    {
        name: 'infoRestaurante',
        description:
            'Información oficial del restaurante: dirección, teléfono, si está abierto ahora, horario por día, zonas de delivery con su costo y tiempo, pedido mínimo, ' +
            'formas de pago disponibles y preguntas frecuentes. Úsala antes de responder cualquier duda que no esté en tu prompt.',
        parameters: {
            type: 'object',
            properties: { tema: { type: 'string', description: 'Tema opcional: horario, delivery, pagos, direccion, faq' } },
            required: []
        }
    },
    {
        name: 'cotizarPedido',
        description:
            'Calcula el subtotal, el costo de envío y el total de un pedido con los precios reales, y dice si cumple el pedido mínimo. ' +
            'Úsala para decirle el total al cliente ANTES de crear el pedido.',
        parameters: {
            type: 'object',
            properties: {
                tipo: { type: 'string', enum: ['delivery', 'para_llevar'], description: 'delivery (a domicilio) o para_llevar (el cliente lo recoge)' },
                items: { type: 'array', items: ITEM_PEDIDO, description: 'Platos del pedido' },
                zona: { type: 'string', description: 'Nombre de la zona de entrega (solo delivery), tal como la devuelve infoRestaurante' }
            },
            required: ['tipo', 'items']
        }
    },
    {
        name: 'crearPedido',
        description:
            'Registra el pedido del cliente. Llámala SOLO cuando el cliente haya confirmado explícitamente los platos, el total, la dirección y la forma de pago. ' +
            'El pedido queda pendiente: el restaurante lo confirma enseguida. Si el pago es con tarjeta (stripe) devuelve un enlace seguro de pago para enviarle al cliente.',
        parameters: {
            type: 'object',
            properties: {
                tipo: { type: 'string', enum: ['delivery', 'para_llevar'] },
                items: { type: 'array', items: ITEM_PEDIDO },
                nombre: { type: 'string', description: 'Nombre del cliente' },
                direccion: { type: 'string', description: 'Dirección de entrega completa: hotel o villa, calle, sector (solo delivery)' },
                referencia: { type: 'string', description: 'Punto de referencia para llegar (opcional)' },
                zona: { type: 'string', description: 'Zona de entrega, tal como la devuelve infoRestaurante (solo delivery)' },
                metodoPago: { type: 'string', enum: ['efectivo', 'transferencia', 'stripe'], description: 'efectivo al recibir, transferencia bancaria, o stripe (tarjeta con enlace de pago)' },
                notas: { type: 'string', description: 'Notas generales del pedido (opcional)' },
                telefonoContacto: { type: 'string', description: 'SOLO si el sistema no reconoce el teléfono del cliente: número de contacto que él te dicte' }
            },
            required: ['tipo', 'items', 'nombre', 'metodoPago']
        },
        messages: [{ type: 'request-failed', content: FALLA }]
    },
    {
        name: 'estadoPedido',
        description: 'Consulta el estado del último pedido de delivery o para llevar de este cliente (por confirmar, en cocina, listo, en camino, entregado).',
        parameters: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'consultarDisponibilidadReserva',
        description: 'Comprueba si hay lugar para reservar una mesa en una fecha, hora y número de personas. Úsala antes de crear la reserva.',
        parameters: {
            type: 'object',
            properties: {
                fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
                hora: { type: 'string', description: 'Hora en formato 24 h HH:MM (ej. 20:30)' },
                personas: { type: 'integer', description: 'Número de personas' }
            },
            required: ['fecha', 'hora', 'personas']
        }
    },
    {
        name: 'crearReserva',
        description:
            'Registra una reserva de mesa. Llámala solo cuando el cliente confirmó fecha, hora, personas y nombre, y ya comprobaste la disponibilidad. ' +
            'Queda pendiente de confirmación por el equipo.',
        parameters: {
            type: 'object',
            properties: {
                nombre: { type: 'string', description: 'Nombre para la reserva' },
                fecha: { type: 'string', description: 'YYYY-MM-DD' },
                hora: { type: 'string', description: 'HH:MM en 24 h' },
                personas: { type: 'integer' },
                notas: { type: 'string', description: 'Ocasión especial, alergias, silla de bebé… (opcional)' },
                telefonoContacto: { type: 'string', description: 'SOLO si el sistema no reconoce el teléfono del cliente: número de contacto que él te dicte' }
            },
            required: ['nombre', 'fecha', 'hora', 'personas']
        },
        messages: [{ type: 'request-failed', content: FALLA }]
    },
    {
        name: 'cancelarReserva',
        description: 'Cancela la próxima reserva activa de este cliente (identificada por su teléfono).',
        parameters: { type: 'object', properties: { motivo: { type: 'string', description: 'Motivo (opcional)' } }, required: [] }
    },
    {
        name: 'pasarAPersona',
        description:
            'Avisa al personal que el cliente necesita atención humana (queja, urgencia, tema fuera de tu alcance o lo pide). ' +
            'Úsala antes de despedirte o de transferir la llamada, y explica el motivo con detalle.',
        parameters: {
            type: 'object',
            properties: { motivo: { type: 'string', description: 'Motivo detallado' } },
            required: ['motivo']
        }
    }
];

/** Formato de OpenAI Chat Completions (WhatsApp). */
function paraOpenAI() {
    return HERRAMIENTAS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

/** Checksum para sincronizar con Vapi solo lo que cambió. */
function checksum(t) {
    return crypto.createHash('sha256')
        .update(JSON.stringify({ name: t.name, description: t.description, parameters: t.parameters, messages: t.messages || [] }))
        .digest('hex').slice(0, 16);
}

/** Payload de una herramienta de tipo función para la API de Vapi (POST/PATCH /tool). */
function paraVapi(t, server) {
    return {
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
        server,
        messages: t.messages || []
    };
}

module.exports = { HERRAMIENTAS, paraOpenAI, paraVapi, checksum };
