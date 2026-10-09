// Datos de demostración para el mercado dominicano (menú, inventario, ventas de las últimas 2 semanas,
// reservas, delivery, horario, zonas y preguntas frecuentes). TODO lo que se crea queda anotado en la tabla
// datos_demo, así que se puede quitar completo sin tocar los datos reales del restaurante.
// Relacionado con: scripts/datos-demo.js (terminal), routes/demo.js (botón en Configuración), public/js/demo-aviso.js
const delivery = require('./delivery');

const TZ = process.env.DB_TIMEZONE || 'America/Santo_Domingo';

// ---------------------------------------------------------------------------------------------- datos
// [nombre, categoría, precio RD$, descripción]
const PRODUCTOS = [
    // Sándwiches y hamburguesas
    ['Sándwich Club', 'Sándwiches', 450, 'Pan tostado con pollo, tocino, jamón, queso, lechuga y tomate. Con papitas.'],
    ['Sándwich de Pollo a la Parrilla', 'Sándwiches', 420, 'Pechuga a la parrilla, queso, lechuga y mayonesa de ajo.'],
    ['Sándwich de Pernil', 'Sándwiches', 400, 'Pernil de cerdo desmenuzado en pan fresco, con cebolla encurtida.'],
    ['Sándwich Cubano', 'Sándwiches', 480, 'Pernil, jamón, queso suizo y pepinillos en pan prensado.'],
    ['Sándwich de Jamón y Queso', 'Sándwiches', 320, 'Clásico caliente con jamón y queso derretido.'],
    ['Pan con Chicharrón', 'Sándwiches', 300, 'Chicharrón de cerdo crujiente con cebolla y limón.'],
    ['Chimi Dominicano', 'Hamburguesas', 350, 'La hamburguesa callejera: carne, repollo, tomate, cebolla y salsa rosada.'],
    ['Hamburguesa Martin', 'Hamburguesas', 480, 'Carne de res, queso cheddar, tocino y salsa de la casa.'],
    ['Hamburguesa con Queso', 'Hamburguesas', 380, 'Carne de res, queso, lechuga, tomate y pepinillos.'],
    // Pizzas
    ['Pizza Margarita', 'Pizzas', 650, 'Salsa de tomate, mozzarella y albahaca. Mediana (8 pedazos).'],
    ['Pizza de Pepperoni', 'Pizzas', 750, 'Mozzarella y abundante pepperoni. Mediana (8 pedazos).'],
    ['Pizza Hawaiana', 'Pizzas', 750, 'Jamón y piña sobre mozzarella. Mediana (8 pedazos).'],
    ['Pizza Criolla', 'Pizzas', 850, 'Pollo, chorizo, maíz y pimientos. Mediana (8 pedazos).'],
    ['Pizza de Camarones', 'Pizzas', 950, 'Camarones al ajillo, mozzarella y cilantro. Mediana (8 pedazos).'],
    ['Pizza Cuatro Quesos', 'Pizzas', 850, 'Mozzarella, cheddar, parmesano y queso azul. Mediana (8 pedazos).'],
    // Comida criolla
    ['Pica Pollo con Tostones', 'Comida Criolla', 520, 'Pollo frito crujiente y sazonado, con tostones y ensalada.'],
    ['Pica Pollo con Papas Fritas', 'Comida Criolla', 520, 'Pollo frito crujiente con papas fritas y ensalada.'],
    ['Pollo al Carbón (1/4)', 'Comida Criolla', 480, 'Cuarto de pollo al carbón con papas o yuca.'],
    ['Asado de Cerdo con Moro', 'Comida Criolla', 650, 'Cerdo asado lento, moro de guandules y ensalada verde.'],
    ['Chivo Guisado', 'Comida Criolla', 700, 'Chivo guisado tierno con arroz blanco y habichuelas.'],
    ['Rabo Encendido', 'Comida Criolla', 750, 'Rabo de res en salsa picante, con arroz blanco.'],
    ['Costillas BBQ', 'Comida Criolla', 800, 'Costillas de cerdo en salsa BBQ casera con papas.'],
    ['Chuleta Frita', 'Comida Criolla', 520, 'Chuletas de cerdo fritas con tostones y ensalada.'],
    ['La Bandera Dominicana', 'Comida Criolla', 480, 'Arroz blanco, habichuelas rojas, carne guisada y ensalada.'],
    ['Sancocho de Siete Carnes', 'Comida Criolla', 550, 'El plato de las fiestas, con yuca, plátano y arroz blanco.'],
    ['Mofongo de Chicharrón', 'Comida Criolla', 520, 'Plátano verde majado con chicharrón y ajo.'],
    ['Mofongo con Camarones', 'Mariscos', 890, 'Mofongo relleno con camarones al ajillo.'],
    ['Pescado Frito del Día', 'Mariscos', 850, 'Pescado entero frito con tostones y ensalada. Según la pesca del día.'],
    ['Camarones al Ajillo', 'Mariscos', 950, 'Camarones salteados en ajo y mantequilla, con arroz blanco.'],
    ['Filete de Pescado al Coco', 'Mariscos', 900, 'Filete en salsa de coco, con arroz blanco y tostones.'],
    ['Churrasco', 'Carnes', 1100, 'Corte de res a la parrilla (10 oz) con papas y ensalada.'],
    ['Pasta Alfredo con Pollo', 'Pastas', 650, 'Fettuccine en salsa cremosa con pollo a la parrilla.'],
    // Desayunos
    ['Mangú con Tres Golpes', 'Desayunos', 380, 'Mangú de plátano con huevo frito, salami y queso frito.'],
    ['Huevos al Gusto', 'Desayunos', 300, 'Dos huevos como los prefieras, con pan y café.'],
    // Entradas y frituras
    ['Tostones', 'Frituras y Entradas', 180, 'Plátano verde frito, con salsa de ajo.'],
    ['Yuca Frita', 'Frituras y Entradas', 180, 'Yuca crujiente con salsa rosada.'],
    ['Maduros Fritos', 'Frituras y Entradas', 160, 'Plátano maduro frito.'],
    ['Quipe (unidad)', 'Frituras y Entradas', 80, 'El quipe dominicano, relleno de carne.'],
    ['Catibías (unidad)', 'Frituras y Entradas', 90, 'Pastelito de yuca relleno de pollo o carne.'],
    ['Empanadas de Queso (2)', 'Frituras y Entradas', 160, 'Dos empanadas crujientes de queso.'],
    ['Papas Fritas', 'Frituras y Entradas', 160, 'Porción grande de papas fritas.'],
    ['Chicharrones de Pollo', 'Frituras y Entradas', 350, 'Trocitos de pollo fritos, con salsa de ajo.'],
    ['Tostones Rellenos de Camarones', 'Frituras y Entradas', 450, 'Tostones rellenos con camarones al ajillo.'],
    // Ensaladas
    ['Ensalada César con Pollo', 'Ensaladas', 420, 'Lechuga romana, pollo, parmesano y crutones.'],
    ['Ensalada Verde', 'Ensaladas', 250, 'Lechuga, tomate, pepino y aguacate.'],
    // Postres
    ['Flan de Coco', 'Postres', 220, 'Flan casero cremoso de coco.'],
    ['Tres Leches', 'Postres', 250, 'Bizcocho empapado en tres leches, con merengue.'],
    ['Majarete', 'Postres', 180, 'Postre de maíz con canela, tradicional dominicano.'],
    ['Cheesecake de Chinola', 'Postres', 260, 'Cheesecake con salsa de chinola (fruta de la pasión).'],
    ['Helado de Coco', 'Postres', 180, 'Dos bolas de helado de coco.'],
    // Bebidas
    ['Agua Botella', 'Bebidas', 60, 'Agua purificada 500 ml.'],
    ['Refresco', 'Bebidas', 100, 'Lata de 355 ml (Coca-Cola, Sprite, Fanta, 7Up).'],
    ['Malta Morena', 'Bebidas', 120, 'Malta Morena dominicana.'],
    ['Jugo Natural de Chinola', 'Bebidas', 160, 'Jugo fresco de chinola.'],
    ['Jugo Natural de Naranja', 'Bebidas', 160, 'Naranja recién exprimida.'],
    ['Jugo de Tamarindo', 'Bebidas', 160, 'Refrescante jugo de tamarindo.'],
    ['Morir Soñando', 'Bebidas', 180, 'Naranja con leche, dulce y espumoso.'],
    ['Limonada', 'Bebidas', 150, 'Limonada natural.'],
    ['Café', 'Bebidas', 80, 'Café dominicano colado.'],
    ['Cerveza Presidente', 'Bebidas', 180, 'Presidente fría 12 oz.'],
    ['Presidente Light', 'Bebidas', 180, 'Presidente Light fría.'],
    ['Copa de Ron Brugal', 'Bebidas', 250, 'Brugal Extra Viejo, con hielo.'],
    ['Piña Colada', 'Bebidas', 400, 'Piña, coco y ron.'],
    ['Mojito', 'Bebidas', 380, 'Ron, menta, limón y azúcar.'],
    ['Mamajuana (shot)', 'Bebidas', 200, 'El trago tradicional de hierbas, ron y vino.']
];

// [nombre, unidad, stock mínimo, costo por unidad (RD$), factor de stock final normal sobre el mínimo]
const INSUMOS = [
    ['Pollo', 'lb', 40, 62], ['Pernil de cerdo', 'lb', 30, 95], ['Costillas de cerdo', 'lb', 20, 120], ['Chivo', 'lb', 15, 230],
    ['Rabo de res', 'lb', 15, 210], ['Carne para churrasco', 'lb', 15, 280], ['Carne molida de res', 'lb', 25, 190],
    ['Camarones', 'lb', 10, 420], ['Pescado (dorado)', 'lb', 15, 260], ['Arroz', 'lb', 60, 28], ['Habichuelas rojas', 'lb', 25, 55],
    ['Plátano verde', 'und', 60, 18], ['Plátano maduro', 'und', 40, 15], ['Yuca', 'lb', 25, 22], ['Papa', 'lb', 40, 30],
    ['Queso mozzarella', 'kg', 9, 570], ['Harina de trigo', 'kg', 18, 55], ['Salsa de tomate', 'gal', 3, 480],
    ['Jamón', 'lb', 10, 180], ['Pepperoni', 'lb', 8, 300], ['Tocino', 'lb', 8, 280], ['Pan de sándwich', 'und', 60, 12],
    ['Pan de hamburguesa', 'und', 60, 14], ['Aceite vegetal', 'gal', 4, 550], ['Huevos', 'und', 90, 9], ['Aguacate', 'und', 15, 40],
    ['Lechuga', 'lb', 8, 50], ['Cebolla', 'lb', 15, 35], ['Ajo', 'lb', 5, 120], ['Coco', 'und', 12, 45], ['Café molido', 'lb', 6, 380],
    ['Leche', 'gal', 4, 320], ['Refrescos (lata)', 'und', 120, 38], ['Cerveza Presidente (botella)', 'und', 150, 75],
    ['Agua botella', 'und', 150, 12], ['Ron Brugal', 'l', 6, 700], ['Chinola', 'lb', 10, 60], ['Limón', 'lb', 10, 45], ['Azúcar', 'lb', 30, 22]
];

// producto -> [[insumo, cantidad en la unidad del insumo]]
const RECETAS = {
    'Pica Pollo con Tostones': [['Pollo', 0.75], ['Plátano verde', 2], ['Aceite vegetal', 0.012], ['Ajo', 0.02], ['Limón', 0.05]],
    'Pica Pollo con Papas Fritas': [['Pollo', 0.75], ['Papa', 0.6], ['Aceite vegetal', 0.014]],
    'Pollo al Carbón (1/4)': [['Pollo', 1], ['Papa', 0.4], ['Ajo', 0.02]],
    'Asado de Cerdo con Moro': [['Pernil de cerdo', 0.7], ['Arroz', 0.35], ['Habichuelas rojas', 0.15], ['Cebolla', 0.1]],
    'Chivo Guisado': [['Chivo', 0.8], ['Arroz', 0.3], ['Cebolla', 0.1]],
    'Rabo Encendido': [['Rabo de res', 0.9], ['Arroz', 0.3]],
    'Costillas BBQ': [['Costillas de cerdo', 1], ['Papa', 0.4]],
    'Chuleta Frita': [['Pernil de cerdo', 0.6], ['Plátano verde', 2], ['Aceite vegetal', 0.01]],
    'La Bandera Dominicana': [['Arroz', 0.35], ['Habichuelas rojas', 0.25], ['Pollo', 0.5], ['Lechuga', 0.1]],
    'Sancocho de Siete Carnes': [['Pollo', 0.3], ['Pernil de cerdo', 0.2], ['Yuca', 0.2], ['Plátano verde', 1]],
    'Mofongo con Camarones': [['Plátano verde', 2], ['Camarones', 0.4], ['Ajo', 0.03], ['Aceite vegetal', 0.01]],
    'Mofongo de Chicharrón': [['Plátano verde', 2], ['Pernil de cerdo', 0.3], ['Ajo', 0.02]],
    'Pescado Frito del Día': [['Pescado (dorado)', 1], ['Plátano verde', 2], ['Aceite vegetal', 0.02]],
    'Camarones al Ajillo': [['Camarones', 0.6], ['Ajo', 0.05], ['Arroz', 0.3]],
    'Filete de Pescado al Coco': [['Pescado (dorado)', 0.7], ['Coco', 0.5], ['Arroz', 0.3]],
    'Churrasco': [['Carne para churrasco', 0.7], ['Papa', 0.4]],
    'Sándwich Club': [['Pan de sándwich', 3], ['Pollo', 0.25], ['Tocino', 0.08], ['Jamón', 0.06], ['Lechuga', 0.03]],
    'Sándwich de Pollo a la Parrilla': [['Pan de sándwich', 2], ['Pollo', 0.35], ['Lechuga', 0.03]],
    'Sándwich de Pernil': [['Pan de sándwich', 2], ['Pernil de cerdo', 0.35], ['Cebolla', 0.05]],
    'Sándwich Cubano': [['Pan de sándwich', 2], ['Pernil de cerdo', 0.25], ['Jamón', 0.1], ['Queso mozzarella', 0.05]],
    'Sándwich de Jamón y Queso': [['Pan de sándwich', 2], ['Jamón', 0.1], ['Queso mozzarella', 0.05]],
    'Chimi Dominicano': [['Pan de hamburguesa', 1], ['Carne molida de res', 0.33], ['Cebolla', 0.05]],
    'Hamburguesa Martin': [['Pan de hamburguesa', 1], ['Carne molida de res', 0.4], ['Tocino', 0.05], ['Queso mozzarella', 0.04]],
    'Hamburguesa con Queso': [['Pan de hamburguesa', 1], ['Carne molida de res', 0.33], ['Queso mozzarella', 0.04], ['Lechuga', 0.03]],
    'Pizza Margarita': [['Harina de trigo', 0.25], ['Queso mozzarella', 0.2], ['Salsa de tomate', 0.02]],
    'Pizza de Pepperoni': [['Harina de trigo', 0.25], ['Queso mozzarella', 0.2], ['Pepperoni', 0.15], ['Salsa de tomate', 0.02]],
    'Pizza Hawaiana': [['Harina de trigo', 0.25], ['Queso mozzarella', 0.2], ['Jamón', 0.15], ['Salsa de tomate', 0.02]],
    'Pizza Criolla': [['Harina de trigo', 0.25], ['Queso mozzarella', 0.2], ['Pollo', 0.2], ['Salsa de tomate', 0.02]],
    'Pizza de Camarones': [['Harina de trigo', 0.25], ['Queso mozzarella', 0.2], ['Camarones', 0.25], ['Salsa de tomate', 0.02]],
    'Tostones': [['Plátano verde', 2], ['Aceite vegetal', 0.006]],
    'Yuca Frita': [['Yuca', 0.6], ['Aceite vegetal', 0.008]],
    'Maduros Fritos': [['Plátano maduro', 2], ['Aceite vegetal', 0.005]],
    'Quipe (unidad)': [['Carne molida de res', 0.1], ['Aceite vegetal', 0.004]],
    'Papas Fritas': [['Papa', 0.5], ['Aceite vegetal', 0.008]],
    'Mangú con Tres Golpes': [['Plátano verde', 3], ['Huevos', 2], ['Cebolla', 0.05], ['Aceite vegetal', 0.01]],
    'Huevos al Gusto': [['Huevos', 2], ['Pan de sándwich', 2]],
    'Flan de Coco': [['Huevos', 3], ['Coco', 0.5], ['Leche', 0.05], ['Azúcar', 0.1]],
    'Tres Leches': [['Huevos', 3], ['Leche', 0.08], ['Harina de trigo', 0.1], ['Azúcar', 0.1]],
    'Jugo Natural de Chinola': [['Chinola', 0.5], ['Azúcar', 0.1]],
    'Café': [['Café molido', 0.03]],
    'Refresco': [['Refrescos (lata)', 1]],
    'Cerveza Presidente': [['Cerveza Presidente (botella)', 1]],
    'Presidente Light': [['Cerveza Presidente (botella)', 1]],
    'Agua Botella': [['Agua botella', 1]],
    'Copa de Ron Brugal': [['Ron Brugal', 0.06]],
    'Piña Colada': [['Ron Brugal', 0.05], ['Coco', 0.25]],
    'Ensalada Verde': [['Lechuga', 0.2], ['Aguacate', 0.5]]
};

const CLIENTES = [
    ['Carlos Peña', '809-555-0101', 'Calle Principal #12, Bávaro'],
    ['María Fernández', '829-555-0102', 'Residencial Los Corales, Verón'],
    ['José Luis Reyes', '849-555-0103', 'Punta Cana Village, Casa 8'],
    ['Yocasta Féliz', '809-555-0104', 'Cortecito, frente al colmado La Esperanza'],
    ['Wander Báez', '829-555-0105', 'Av. Barceló km 8, Bávaro'],
    ['Altagracia Jiménez', '849-555-0106', 'Villa Tropical, Manzana C, Verón'],
    ['Rafael Mejía', '809-555-0107', 'Cap Cana, Torre del Sol, Apto 4B'],
    ['Yanessa Cabrera', '829-555-0108', 'Los Corales, Calle 3 #25'],
    ['Hotel Bávaro Sol (Recepción)', '809-555-0109', 'Zona Hotelera, Playa Bávaro'],
    ['Juan Carlos Santana', '849-555-0110', 'Friusa, calle Duarte #40'],
    ['Luisa Méndez', '809-555-0111', 'Macao, Residencial Las Palmas'],
    ['Franklin De la Cruz', '829-555-0112', 'Verón, calle Mella #7'],
    ['John Miller (turista, EE. UU.)', '809-555-0113', 'Villa Turquesa, Cap Cana'],
    ['Pedro Martínez', '849-555-0114', 'Bávaro, Plaza Brisas local 5']
];

const MESAS = ['1', '2', '3', '4', '5', '6', '7', '8', 'Terraza 1', 'Terraza 2', 'Terraza 3', 'Barra'];

// [nombre, costo envío, minutos]
const ZONAS = [
    ['Bávaro (centro)', 150, 25], ['Zona Hotelera Bávaro', 200, 30], ['Cortecito / Los Corales', 175, 25], ['Punta Cana Village', 250, 30],
    ['Cap Cana', 350, 40], ['Verón', 250, 35], ['Macao', 350, 45], ['Uvero Alto', 500, 55]
];

const FAQ = [
    ['¿Tienen parqueo?', 'Sí, parqueo gratuito para clientes frente al restaurante.'],
    ['¿Aceptan tarjetas?', 'Sí: efectivo, tarjetas de crédito y débito, transferencia bancaria y criptomonedas (Bitcoin y Lightning).'],
    ['¿Los precios incluyen impuestos y propina?', 'Los precios del menú no incluyen el ITBIS (18 %) ni la propina legal del 10 %; se agregan en la cuenta.'],
    ['¿Tienen menú infantil?', 'Sí, tenemos porciones infantiles de pica pollo, pizza y pasta. Pregunta a tu mesero.'],
    ['¿Aceptan mascotas?', 'Las mascotas son bienvenidas en la terraza.'],
    ['¿Tienen wifi?', 'Sí, wifi gratis para nuestros clientes. Pide la clave a tu mesero.'],
    ['¿Hacen delivery a los hoteles?', 'Sí, entregamos en Bávaro, Cortecito, Punta Cana Village, Cap Cana, Verón, Macao y Uvero Alto. Consulta el costo según la zona.'],
    ['¿Reciben grupos grandes?', 'Sí. Para grupos de 8 personas o más, reserva con anticipación por llamada o WhatsApp.'],
    ['¿Tienen opciones vegetarianas?', 'Sí: ensaladas, tostones, yuca frita, mangú, pizza margarita y pasta. Cuéntanos tus preferencias.']
];

// ---------------------------------------------------------------------------------------------- utilidades
function prng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hoyLocal() {
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return new Date(`${ymd}T00:00:00-04:00`); // República Dominicana no usa horario de verano (UTC-4 fijo)
}

const REDONDEO = (n) => Math.round(n * 100) / 100;

async function asegurarTabla(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS datos_demo (
        id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        tabla VARCHAR(40) NOT NULL,
        fila_id VARCHAR(60),
        extra TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
    await db.query('ALTER TABLE datos_demo ENABLE ROW LEVEL SECURITY');
}

async function estado(db) {
    try {
        const [rows] = await db.query('SELECT tabla, COUNT(*) AS n FROM datos_demo GROUP BY tabla');
        const t = Object.fromEntries(rows.map((r) => [r.tabla, Number(r.n)]));
        return { cargados: rows.length > 0, productos: t.productos || 0, facturas: t.facturas || 0, clientes: t.clientes || 0, insumos: t.insumos || 0 };
    } catch (e) {
        if (e.code === 'ER_NO_SUCH_TABLE') return { cargados: false, productos: 0, facturas: 0, clientes: 0, insumos: 0 };
        throw e;
    }
}

// ---------------------------------------------------------------------------------------------- cargar
async function cargar(db, log = () => {}) {
    await asegurarTabla(db);
    if ((await estado(db)).cargados) throw Object.assign(new Error('Ya hay datos de demostración cargados. Quítalos primero.'), { publico: true });

    const rnd = prng(20261108);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const c = await db.getConnection();
    const reg = async (tabla, ids, extra = null) => {
        const lista = (Array.isArray(ids) ? ids : [ids]).filter((x) => x != null);
        if (!lista.length) return;
        await c.query('INSERT INTO datos_demo (tabla, fila_id, extra) VALUES ?', [lista.map((id) => [tabla, String(id), extra])]);
    };
    const idsDe = (hdr) => (hdr.rows || []).map((r) => Number(r.id));
    const resumen = {};

    try {
        await c.beginTransaction();

        // ---- Productos
        const [maxCli] = await c.query('SELECT COALESCE(MAX(id), 0) AS m FROM clientes');
        const maxClienteAntes = Number(maxCli[0].m);
        const filasProd = PRODUCTOS.map((p, i) => [`DEMO-${String(i + 1).padStart(3, '0')}`, p[0], 0, p[2], 0, p[1], p[3], p[0] === 'Filete de Pescado al Coco' ? 0 : 1, 1, ['Asado de Cerdo con Moro', 'Pica Pollo con Tostones'].includes(p[0]) ? 1 : 0]);
        // (un producto queda "agotado" para que se vea cómo luce en el menú)
        const [hp] = await c.query('INSERT INTO productos (codigo, nombre, precio_kg, precio_unidad, precio_libra, categoria, descripcion, disponible, en_menu, plato_del_dia) VALUES ?', [filasProd]);
        const prodIds = idsDe(hp);
        await reg('productos', prodIds);
        const prodPorNombre = new Map(PRODUCTOS.map((p, i) => [p[0], { id: prodIds[i], precio: p[2], categoria: p[1] }]));
        resumen.productos = prodIds.length;

        // ---- Insumos, stock inicial y recetas
        const [hi] = await c.query('INSERT INTO insumos (nombre, unidad, stock, stock_minimo, costo_unitario) VALUES ?',
            [INSUMOS.map((i) => [i[0], i[1], 0, i[2], i[3]])]);
        const insIds = idsDe(hi);
        await reg('insumos', insIds);
        const insPorNombre = new Map(INSUMOS.map((i, k) => [i[0], { id: insIds[k], min: i[2], costo: i[3], unidad: i[1] }]));
        const filasRec = [];
        for (const [prod, lista] of Object.entries(RECETAS)) {
            const p = prodPorNombre.get(prod);
            if (!p) throw new Error(`Receta de un producto que no existe: ${prod}`);
            for (const [ins, cant] of lista) {
                const i = insPorNombre.get(ins);
                if (!i) throw new Error(`Receta con un insumo que no existe: ${ins}`);
                filasRec.push([p.id, i.id, cant]);
            }
        }
        await c.query('INSERT INTO recetas (producto_id, insumo_id, cantidad) VALUES ?', [filasRec]);
        resumen.insumos = insIds.length; resumen.recetas = Object.keys(RECETAS).length;

        // ---- Clientes (y "Consumidor final", que el sistema necesita para ventas sin cliente)
        const [cf] = await c.query(`SELECT id FROM clientes WHERE nombre ILIKE 'consumidor final' ORDER BY id LIMIT 1`);
        let consumidorId = cf[0] ? Number(cf[0].id) : null;
        if (!consumidorId) {
            const [h] = await c.query(`INSERT INTO clientes (nombre, direccion, telefono) VALUES ('Consumidor final', 'República Dominicana', '')`);
            consumidorId = h.insertId; await reg('clientes', consumidorId);
        }
        const [hc] = await c.query('INSERT INTO clientes (nombre, telefono, direccion) VALUES ?', [CLIENTES.map((x) => [x[0], x[1], x[2]])]);
        const cliIds = idsDe(hc);
        await reg('clientes', cliIds);
        resumen.clientes = cliIds.length;

        // ---- Mesas
        const [exist] = await c.query('SELECT numero FROM mesas');
        const yaHay = new Set(exist.map((m) => String(m.numero)));
        const nuevas = MESAS.filter((m) => !yaHay.has(m));
        const mesaPorNumero = new Map();
        if (nuevas.length) {
            const [hm] = await c.query('INSERT INTO mesas (numero, descripcion) VALUES ?', [nuevas.map((m) => [m, /^\d+$/.test(m) ? `Mesa ${m}` : m])]);
            idsDe(hm).forEach((id, k) => mesaPorNumero.set(nuevas[k], id));
            await reg('mesas', idsDe(hm));
        }
        const [todasMesas] = await c.query('SELECT id, numero FROM mesas');
        todasMesas.forEach((m) => mesaPorNumero.set(String(m.numero), Number(m.id)));
        resumen.mesas = nuevas.length;

        // ---- Horario, zonas, preguntas frecuentes y datos de delivery
        const [hor] = await c.query('SELECT COUNT(*) AS n FROM horarios');
        if (Number(hor[0].n) === 0) {
            const dias = [0, 1, 2, 3, 4, 5, 6].map((d) => [d, '11:00', d === 5 || d === 6 ? '01:00' : '23:00', 0, 1]);
            await c.query('INSERT INTO horarios (dia, abre, cierra, cerrado, delivery) VALUES ?', [dias]);
            await reg('horarios', 'todos');
        }
        const [zon] = await c.query('SELECT COUNT(*) AS n FROM delivery_zonas');
        let zonaIds = [];
        if (Number(zon[0].n) === 0) {
            const [hz] = await c.query('INSERT INTO delivery_zonas (nombre, costo_envio, minutos_estimados, activa, orden) VALUES ?', [ZONAS.map((z, i) => [z[0], z[1], z[2], 1, i])]);
            zonaIds = idsDe(hz);
            await reg('delivery_zonas', zonaIds);
        } else {
            const [z] = await c.query('SELECT id FROM delivery_zonas WHERE activa = 1 ORDER BY orden, id');
            zonaIds = z.map((r) => Number(r.id));
        }
        const [fq] = await c.query('SELECT COUNT(*) AS n FROM negocio_faq');
        if (Number(fq[0].n) === 0) {
            const [hf] = await c.query('INSERT INTO negocio_faq (pregunta, respuesta, orden) VALUES ?', [FAQ.map((f, i) => [f[0], f[1], i])]);
            await reg('negocio_faq', idsDe(hf));
        }
        // Datos del negocio que están vacíos: se rellenan y se guarda el valor anterior para restaurarlo
        const [cfgRows] = await c.query('SELECT id, pedido_minimo_delivery, tiempo_preparacion_min, datos_transferencia, telefono_humano FROM configuracion_impresion ORDER BY id LIMIT 1');
        if (cfgRows[0]) {
            const cfg = cfgRows[0];
            const antes = {};
            const sets = []; const vals = [];
            if (!Number(cfg.pedido_minimo_delivery)) { antes.pedido_minimo_delivery = cfg.pedido_minimo_delivery; sets.push('pedido_minimo_delivery = ?'); vals.push(500); }
            if (!cfg.datos_transferencia) { antes.datos_transferencia = null; sets.push('datos_transferencia = ?'); vals.push('EJEMPLO — Banco Popular Dominicano, cuenta corriente 000-000000-0, a nombre de Restaurant Martin SRL, RNC 0-00-00000-0'); }
            if (!cfg.telefono_humano) { antes.telefono_humano = null; sets.push('telefono_humano = ?'); vals.push('809-555-0100'); }
            if (sets.length) {
                await c.query(`UPDATE configuracion_impresion SET ${sets.join(', ')} WHERE id = ?`, [...vals, cfg.id]);
                await reg('config', cfg.id, JSON.stringify(antes));
            }
        }

        // ---- Historial de ventas: 14 días, con consumo de inventario
        const hoy0 = hoyLocal();
        const ahora = Date.now();
        const mains = PRODUCTOS.filter((p) => !['Bebidas', 'Postres', 'Frituras y Entradas', 'Ensaladas'].includes(p[1])).map((p) => prodPorNombre.get(p[0]));
        const entradas = PRODUCTOS.filter((p) => ['Frituras y Entradas', 'Ensaladas'].includes(p[1])).map((p) => prodPorNombre.get(p[0]));
        const postres = PRODUCTOS.filter((p) => p[1] === 'Postres').map((p) => prodPorNombre.get(p[0]));
        const bebidas = PRODUCTOS.filter((p) => p[1] === 'Bebidas' && p[0] !== 'Mamajuana (shot)').map((p) => prodPorNombre.get(p[0]));
        const favoritos = ['Pica Pollo con Tostones', 'Pica Pollo con Papas Fritas', 'Asado de Cerdo con Moro', 'La Bandera Dominicana', 'Pizza de Pepperoni', 'Hamburguesa Martin', 'Pollo al Carbón (1/4)'].map((n) => prodPorNombre.get(n));
        const bebidasFav = ['Cerveza Presidente', 'Refresco', 'Cerveza Presidente', 'Agua Botella', 'Jugo Natural de Chinola', 'Malta Morena'].map((n) => prodPorNombre.get(n));
        const nombreDe = new Map([...prodPorNombre.entries()].map(([n, p]) => [p.id, n]));
        const consumoInsumo = new Map(); // insumo_id -> total
        const movimientos = []; // {insumoId, cantidad, factura, fecha}
        const facturasCreadas = [];
        const usuarios = ['Carlos (Mesero)', 'Rosa (Mesera)', 'Pedro (Mesero)'];

        for (let d = 14; d >= 0; d--) {
            const dia = new Date(hoy0.getTime() - d * 86400000);
            const dow = new Date(dia.getTime() + 12 * 3600000).getUTCDay(); // día local de la semana (mediodía local)
            const finde = dow === 5 || dow === 6 || dow === 0;
            let n = Math.round((finde ? 30 : 15) * (0.8 + rnd() * 0.5));
            for (let k = 0; k < n; k++) {
                // Horas pico: almuerzo (12-15) y cena (18-22)
                const pico = rnd() < 0.5 ? 12 + rnd() * 3 : 18 + rnd() * 4;
                const fecha = new Date(dia.getTime() + pico * 3600000);
                if (fecha.getTime() > ahora - 15 * 60000) continue;
                const lineas = new Map();
                const sumar = (p, q = 1) => { const cur = lineas.get(p.id) || { p, q: 0 }; cur.q += q; lineas.set(p.id, cur); };
                const comensales = 1 + Math.floor(rnd() * 4);
                for (let g = 0; g < comensales; g++) {
                    sumar(rnd() < 0.55 ? pick(favoritos) : pick(mains));
                    if (rnd() < 0.45) sumar(pick(entradas));
                    sumar(rnd() < 0.7 ? pick(bebidasFav) : pick(bebidas));
                    if (rnd() < 0.2) sumar(pick(postres));
                }
                const detalle = [...lineas.values()];
                const total = REDONDEO(detalle.reduce((a, l) => a + l.p.precio * l.q, 0));
                const r = rnd();
                let forma = r < 0.42 ? 'efectivo' : r < 0.72 ? 'tarjeta' : r < 0.88 ? 'transferencia' : r < 0.96 ? 'mixto' : 'cripto';
                let pagos;
                if (forma === 'mixto') {
                    const mitad = REDONDEO(total / 2);
                    pagos = [['efectivo', mitad, null], ['tarjeta', REDONDEO(total - mitad), 'Visa ****' + String(1000 + Math.floor(rnd() * 8999))]];
                } else if (forma === 'transferencia') pagos = [[forma, total, 'Ref. ' + (100000 + Math.floor(rnd() * 899999))]];
                else if (forma === 'tarjeta') pagos = [[forma, total, 'Aprob. ' + (100000 + Math.floor(rnd() * 899999))]];
                else if (forma === 'cripto') pagos = [[forma, total, 'BTCPay DEMO']];
                else pagos = [[forma, total, null]];
                const cliente = rnd() < 0.3 ? pick(cliIds) : consumidorId;
                const [hf] = await c.query('INSERT INTO facturas (cliente_id, fecha, total, forma_pago) VALUES (?, ?, ?, ?)', [cliente, fecha.toISOString(), total, forma]);
                const fid = hf.insertId;
                facturasCreadas.push(fid);
                await c.query('INSERT INTO detalle_factura (factura_id, producto_id, cantidad, precio_unitario, unidad_medida, subtotal) VALUES ?',
                    [detalle.map((l) => [fid, l.p.id, l.q, l.p.precio, 'UND', REDONDEO(l.p.precio * l.q)])]);
                await c.query('INSERT INTO factura_pagos (factura_id, metodo, monto, referencia) VALUES ?', [pagos.map((p) => [fid, p[0], p[1], p[2]])]);
                const porInsumo = new Map();
                for (const l of detalle) {
                    for (const [ins, cant] of RECETAS[nombreDe.get(l.p.id)] || []) {
                        const i = insPorNombre.get(ins);
                        porInsumo.set(i.id, (porInsumo.get(i.id) || 0) + cant * l.q);
                    }
                }
                for (const [insumoId, q] of porInsumo) {
                    consumoInsumo.set(insumoId, (consumoInsumo.get(insumoId) || 0) + q);
                    movimientos.push({ insumoId, q, factura: fid, fecha });
                }
            }
        }
        await reg('facturas', facturasCreadas);
        resumen.facturas = facturasCreadas.length;
        resumen.ventas = null;

        // Inventario: entrada inicial 15 días atrás, un movimiento de venta por factura e insumo, y stock final realista
        const finales = new Map();
        const bajos = new Set(['Camarones', 'Queso mozzarella', 'Aguacate']); // para que se vean alertas de stock bajo
        for (const [nombre, i] of insPorNombre) {
            const factor = bajos.has(nombre) ? 0.4 : 2 + rnd() * 3.5;
            finales.set(i.id, Math.round(i.min * factor * 1000) / 1000);
        }
        const inicio = new Date(hoy0.getTime() - 15 * 86400000 + 9 * 3600000);
        const movs = [];
        const corrido = new Map();
        for (const [nombre, i] of insPorNombre) {
            const inicial = Math.round((finales.get(i.id) + (consumoInsumo.get(i.id) || 0)) * 1000) / 1000;
            corrido.set(i.id, inicial);
            movs.push([i.id, 'entrada', inicial, inicial, null, 'Stock inicial (demo)', 'demo', inicio.toISOString()]);
        }
        movimientos.sort((a, b) => a.fecha - b.fecha);
        for (const m of movimientos) {
            const nuevo = Math.round((corrido.get(m.insumoId) - m.q) * 1000) / 1000;
            corrido.set(m.insumoId, nuevo);
            movs.push([m.insumoId, 'venta', -Math.round(m.q * 1000) / 1000, nuevo, m.factura, `Factura #${m.factura}`, 'demo', m.fecha.toISOString()]);
        }
        for (let k = 0; k < movs.length; k += 400) {
            await c.query('INSERT INTO inventario_movimientos (insumo_id, tipo, cantidad, stock_resultante, factura_id, nota, usuario, created_at) VALUES ?', [movs.slice(k, k + 400)]);
        }
        for (const [nombre, i] of insPorNombre) await c.query('UPDATE insumos SET stock = ? WHERE id = ?', [finales.get(i.id), i.id]);
        resumen.movimientos = movs.length;

        // ---- Mesas con pedidos abiertos ahora mismo (para ver Mesas y Cocina "en vivo")
        const pedidosMesa = [];
        const abrir = async (numero, estados, mesero) => {
            const mesaId = mesaPorNumero.get(numero);
            if (!mesaId) return;
            const items = estados.map(([nombre, cant, est, nota]) => ({ p: prodPorNombre.get(nombre), cant, est, nota }));
            const total = REDONDEO(items.reduce((a, l) => a + l.p.precio * l.cant, 0));
            const [hp2] = await c.query(`INSERT INTO pedidos (mesa_id, mesero_nombre, estado, total, tipo, origen) VALUES (?, ?, 'en_cocina', ?, 'mesa', 'pos')`, [mesaId, mesero, total]);
            for (const l of items) {
                await c.query(
                    `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, unidad_medida, precio_unitario, subtotal, estado, nota, enviado_at, preparado_at, listo_at)
                     VALUES (?, ?, ?, 'UND', ?, ?, ?, ?, NOW() - interval '9 minutes', ${l.est === 'enviado' ? 'NULL' : "NOW() - interval '6 minutes'"}, ${l.est === 'listo' ? "NOW() - interval '1 minute'" : 'NULL'})`,
                    [hp2.insertId, l.p.id, l.cant, l.p.precio, REDONDEO(l.p.precio * l.cant), l.est, l.nota || null]
                );
            }
            await c.query(`UPDATE mesas SET estado = 'ocupada' WHERE id = ?`, [mesaId]);
            pedidosMesa.push(hp2.insertId);
        };
        await abrir('2', [['Pica Pollo con Tostones', 2, 'preparando', 'sin picante'], ['Cerveza Presidente', 2, 'listo'], ['Tostones', 1, 'enviado']], 'Carlos (Mesero)');
        await abrir('5', [['Pizza de Pepperoni', 1, 'preparando'], ['Refresco', 3, 'listo'], ['Ensalada Verde', 1, 'enviado', 'aderezo aparte']], 'Rosa (Mesera)');
        await abrir('Terraza 1', [['Asado de Cerdo con Moro', 2, 'listo'], ['Jugo Natural de Chinola', 2, 'listo'], ['Flan de Coco', 2, 'enviado']], 'Pedro (Mesero)');
        await reg('pedidos', pedidosMesa);
        resumen.pedidosMesa = pedidosMesa.length;

        await c.commit();
        log('Datos base cargados');

        // ---- Pedidos de delivery / para llevar (usa el mismo servicio que la app) ----
        const delivPedidos = [];
        const zonaPorNombre = new Map();
        if (zonaIds.length) {
            const [zz] = await db.query('SELECT id, nombre FROM delivery_zonas');
            zz.forEach((z) => zonaPorNombre.set(z.nombre, Number(z.id)));
        }
        const c2 = await db.getConnection();
        try {
            await c2.beginTransaction();
            const crear = async (datos, estadoFinal) => {
                const r = await delivery.crearPedido(c2, datos);
                delivPedidos.push(r.pedido_id);
                if (estadoFinal === 'en_cocina' || estadoFinal === 'en_camino') await delivery.confirmar(c2, r.pedido_id, 'demo');
                if (estadoFinal === 'en_camino') {
                    await c2.query(`UPDATE pedido_items SET estado = 'listo', listo_at = NOW() WHERE pedido_id = ? AND estado = 'enviado'`, [r.pedido_id]);
                    await c2.query(`UPDATE pedidos SET estado_delivery = 'en_camino', repartidor = 'Manuel (moto)' WHERE id = ?`, [r.pedido_id]);
                }
                return r;
            };
            const zid = (n) => zonaPorNombre.get(n) || zonaIds[0] || null;
            const it = (nombre, cantidad, nota) => ({ producto_id: prodPorNombre.get(nombre).id, cantidad, nota });
            await crear({ tipo: 'delivery', origen: 'whatsapp', nombre: 'María Fernández', telefono: '829-555-0102', direccion: 'Residencial Los Corales, calle 4 #18, Verón', referencia: 'Casa blanca, portón negro', zonaId: zid('Verón'), metodoPago: 'efectivo', items: [it('Pica Pollo con Tostones', 2), it('Refresco', 2), it('Flan de Coco', 1)], notas: 'Por favor, sin picante', usuario: 'Agente WhatsApp' }, 'por_confirmar');
            await crear({ tipo: 'delivery', origen: 'voz', nombre: 'John Miller', telefono: '809-555-0113', direccion: 'Villa Turquesa 12, Cap Cana', referencia: 'Preguntar por Mr. Miller en la entrada', zonaId: zid('Cap Cana'), metodoPago: 'transferencia', items: [it('Pizza de Camarones', 1), it('Pizza de Pepperoni', 1), it('Cerveza Presidente', 4)], usuario: 'Agente de voz' }, 'por_confirmar');
            await crear({ tipo: 'delivery', origen: 'pos', nombre: 'Hotel Bávaro Sol (Recepción)', telefono: '809-555-0109', direccion: 'Zona Hotelera, Playa Bávaro, recepción principal', zonaId: zid('Zona Hotelera Bávaro'), metodoPago: 'efectivo', items: [it('Sándwich Club', 3), it('Papas Fritas', 2), it('Jugo Natural de Naranja', 3)], usuario: 'Carlos (Mesero)' }, 'en_cocina');
            await crear({ tipo: 'delivery', origen: 'whatsapp', nombre: 'Rafael Mejía', telefono: '809-555-0107', direccion: 'Cap Cana, Torre del Sol, Apto 4B', zonaId: zid('Cap Cana'), metodoPago: 'cripto', items: [it('Churrasco', 2), it('Ensalada Verde', 1), it('Copa de Ron Brugal', 2)], usuario: 'Agente WhatsApp' }, 'en_camino');
            await crear({ tipo: 'para_llevar', origen: 'pos', nombre: 'Luisa Méndez', telefono: '809-555-0111', metodoPago: 'efectivo', items: [it('Hamburguesa Martin', 2), it('Papas Fritas', 1)], usuario: 'Rosa (Mesera)' }, 'en_cocina');
            // Clientes que el servicio haya creado por su cuenta (con un formato de teléfono distinto)
            const [nuevosCli] = await c2.query('SELECT id FROM clientes WHERE id > ?', [maxClienteAntes]);
            const [ya] = await c2.query(`SELECT fila_id FROM datos_demo WHERE tabla = 'clientes'`);
            const yaSet = new Set(ya.map((r) => String(r.fila_id)));
            const extra = nuevosCli.map((r) => Number(r.id)).filter((id) => !yaSet.has(String(id)));
            if (extra.length) await c2.query('INSERT INTO datos_demo (tabla, fila_id) VALUES ?', [extra.map((id) => ['clientes', String(id)])]);
            await c2.query('INSERT INTO datos_demo (tabla, fila_id) VALUES ?', [delivPedidos.map((id) => ['pedidos', String(id)])]);

            // ---- Reservas (próximos 6 días)
            const hoyBase = hoyLocal().getTime();
            const resv = [
                [0, 19.5, 'Familia Santana', '849-555-0110', 4, 'confirmada', 'interno', 'Cumpleaños de la abuela, piden pastel'],
                [0, 20.5, 'Mr. & Mrs. Miller', '809-555-0113', 2, 'confirmada', 'web', 'Aniversario, mesa en la terraza'],
                [1, 13, 'Empresa Caribe Tours', '809-555-0115', 10, 'pendiente', 'voz', 'Almuerzo de negocios, grupo de 10'],
                [1, 20, 'Yocasta Féliz', '809-555-0104', 3, 'confirmada', 'whatsapp', null],
                [2, 19, 'Wander Báez', '829-555-0105', 6, 'pendiente', 'web', 'Alergia a mariscos en el grupo'],
                [3, 21, 'Pareja de recién casados', '809-555-0116', 2, 'confirmada', 'web', 'Luna de miel, mesa tranquila'],
                [4, 20, 'Altagracia Jiménez', '849-555-0106', 8, 'pendiente', 'whatsapp', 'Reunión de familia'],
                [5, 19.5, 'Grupo de turistas (Canadá)', '809-555-0117', 12, 'confirmada', 'voz', 'Hablan inglés y francés']
            ];
            const mesasRes = ['4', 'Terraza 2', null, '6', null, 'Terraza 1', null, '8'];
            const filasRes = resv.map((r, i) => [r[2], r[3], null, r[4], new Date(hoyBase + r[0] * 86400000 + r[1] * 3600000).toISOString(), mesaPorNumero.get(mesasRes[i]) || null, r[5], r[6], r[7]]);
            const [hr] = await c2.query('INSERT INTO reservas (nombre, telefono, email, personas, fecha_hora, mesa_id, estado, origen, notas) VALUES ?', [filasRes]);
            await c2.query('INSERT INTO datos_demo (tabla, fila_id) VALUES ?', [idsDe(hr).map((id) => ['reservas', String(id)])]);
            resumen.reservas = filasRes.length;
            resumen.delivery = delivPedidos.length;
            await c2.commit();
        } catch (e) {
            await c2.rollback().catch(() => {});
            // El resto de los datos ya quedó guardado: se quita para no dejar una carga a medias
            await quitar(db).catch(() => {});
            throw e;
        } finally { c2.release(); }
    } catch (e) {
        await c.rollback().catch(() => {});
        throw e;
    } finally { c.release(); }

    const [[tot]] = await db.query('SELECT COALESCE(SUM(total), 0) AS t FROM facturas WHERE id IN (SELECT fila_id::int FROM datos_demo WHERE tabla = \'facturas\')');
    resumen.ventas = Number(tot.t);
    return resumen;
}

// ---------------------------------------------------------------------------------------------- quitar
async function quitar(db, log = () => {}) {
    await asegurarTabla(db);
    const [filas] = await db.query('SELECT tabla, fila_id, extra FROM datos_demo');
    if (!filas.length) return { quitado: false, mensaje: 'No hay datos de demostración cargados.' };
    const ids = (t) => filas.filter((f) => f.tabla === t && /^\d+$/.test(f.fila_id)).map((f) => Number(f.fila_id));
    const sinQuitar = [];
    const borrar = async (nombre, sql, params) => {
        try { const [r] = await db.query(sql, params); return r.affectedRows || 0; }
        catch (e) { sinQuitar.push(`${nombre}: ${e.code === 'ER_ROW_IS_REFERENCED_2' ? 'ya se usa en ventas o pedidos reales' : e.message}`); return 0; }
    };
    const facturas = ids('facturas');
    const pedidos = ids('pedidos');
    const productos = ids('productos');
    const insumos = ids('insumos');

    // Orden: lo que depende de otras cosas, primero
    if (facturas.length) {
        await borrar('inventario_movimientos', 'DELETE FROM inventario_movimientos WHERE factura_id IN (?)', [facturas]);
        await borrar('detalle_factura', 'DELETE FROM detalle_factura WHERE factura_id IN (?)', [facturas]);
        await borrar('factura_pagos', 'DELETE FROM factura_pagos WHERE factura_id IN (?)', [facturas]);
    }
    if (pedidos.length) {
        // Pedidos que ya se facturaron de verdad después: su factura real se conserva, así que no se tocan
        await borrar('pedido_items', 'DELETE FROM pedido_items WHERE pedido_id IN (?) AND pedido_id IN (SELECT id FROM pedidos WHERE factura_id IS NULL)', [pedidos]);
        await borrar('mesa_alertas', 'DELETE FROM mesa_alertas WHERE pedido_id IN (?)', [pedidos]);
        await borrar('stripe_pagos', 'DELETE FROM stripe_pagos WHERE pedido_id IN (?)', [pedidos]);
        await borrar('pedidos', 'DELETE FROM pedidos WHERE id IN (?) AND factura_id IS NULL', [pedidos]);
    }
    if (facturas.length) await borrar('facturas', 'DELETE FROM facturas WHERE id IN (?)', [facturas]);
    if (ids('reservas').length) await borrar('reservas', 'DELETE FROM reservas WHERE id IN (?)', [ids('reservas')]);
    if (insumos.length) await borrar('insumos', 'DELETE FROM insumos WHERE id IN (?)', [insumos]); // recetas y movimientos se van con ellos
    for (const id of productos) await borrar(`producto ${id}`, 'DELETE FROM productos WHERE id = ?', [id]);
    for (const id of ids('clientes')) await borrar(`cliente ${id}`, 'DELETE FROM clientes WHERE id = ?', [id]);
    // Mesas: primero se liberan las que el demo ocupó, luego se borran las creadas por el demo
    for (const id of ids('mesas')) await borrar(`mesa ${id}`, 'DELETE FROM mesas WHERE id = ?', [id]);
    await db.query(`UPDATE mesas SET estado = 'libre' WHERE estado = 'ocupada' AND NOT EXISTS (
        SELECT 1 FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id
        WHERE p.mesa_id = mesas.id AND p.estado NOT IN ('cerrado','cancelado','rechazado') AND i.estado NOT IN ('cancelado','rechazado'))`);
    if (ids('delivery_zonas').length) await borrar('delivery_zonas', 'DELETE FROM delivery_zonas WHERE id IN (?)', [ids('delivery_zonas')]);
    if (ids('negocio_faq').length) await borrar('negocio_faq', 'DELETE FROM negocio_faq WHERE id IN (?)', [ids('negocio_faq')]);
    if (filas.some((f) => f.tabla === 'horarios')) await borrar('horarios', 'DELETE FROM horarios');
    for (const f of filas.filter((x) => x.tabla === 'config')) {
        // Restaura lo que estaba antes (vacío) solo si el administrador no lo cambió después
        let antes = {}; try { antes = JSON.parse(f.extra || '{}'); } catch (_) { /* noop */ }
        if ('pedido_minimo_delivery' in antes) await db.query('UPDATE configuracion_impresion SET pedido_minimo_delivery = ? WHERE id = ? AND pedido_minimo_delivery = 500', [Number(antes.pedido_minimo_delivery) || 0, f.fila_id]);
        if ('datos_transferencia' in antes) await db.query(`UPDATE configuracion_impresion SET datos_transferencia = NULL WHERE id = ? AND datos_transferencia LIKE 'EJEMPLO%'`, [f.fila_id]);
        if ('telefono_humano' in antes) await db.query(`UPDATE configuracion_impresion SET telefono_humano = NULL WHERE id = ? AND telefono_humano = '809-555-0100'`, [f.fila_id]);
    }
    // El producto técnico de envío y la fila de "Consumidor final" propios del sistema se quedan.
    await db.query('DELETE FROM datos_demo');

    // Si no quedó nada real, los números de factura, pedido, etc. vuelven a empezar en 1
    for (const t of ['facturas', 'pedidos', 'pedido_items', 'detalle_factura', 'factura_pagos', 'inventario_movimientos', 'reservas', 'mesa_alertas', 'clientes', 'productos', 'insumos', 'delivery_zonas', 'negocio_faq']) {
        try {
            const [[n]] = await db.query(`SELECT COUNT(*) AS n FROM ${t}`);
            if (Number(n.n) === 0) await db.query(`ALTER TABLE ${t} ALTER COLUMN id RESTART WITH 1`);
        } catch (_) { /* tabla sin id o sin permisos: no es importante */ }
    }
    return { quitado: true, facturas: facturas.length, productos: productos.length, sinQuitar };
}

module.exports = { cargar, quitar, estado, PRODUCTOS, INSUMOS, RECETAS };
