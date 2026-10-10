const express = require('express');
const router = express.Router();
const db = require('../db');
let ExcelJS; // import perezoso para template/import

// Las escrituras (crear, editar, borrar, importar, fotos) son solo del administrador.
// Este router también se monta en /api/productos para meseros (solo lectura / búsqueda).
router.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (String(req.session?.user?.rol || '') === 'administrador') return next();
    return res.status(403).json({ error: 'Solo el administrador puede modificar productos' });
});

// Normaliza los campos de la carta digital (menú QR) que vengan en el body
function camposCarta(body) {
    const out = {};
    if (Object.prototype.hasOwnProperty.call(body, 'categoria')) out.categoria = String(body.categoria || '').trim().slice(0, 60) || null;
    if (Object.prototype.hasOwnProperty.call(body, 'descripcion')) out.descripcion = String(body.descripcion || '').trim().slice(0, 400) || null;
    if (Object.prototype.hasOwnProperty.call(body, 'en_menu')) out.en_menu = Number(body.en_menu) ? 1 : 0;
    if (Object.prototype.hasOwnProperty.call(body, 'disponible')) out.disponible = Number(body.disponible) ? 1 : 0;
    if (Object.prototype.hasOwnProperty.call(body, 'plato_del_dia')) out.plato_del_dia = Number(body.plato_del_dia) ? 1 : 0;
    // Tasa de ITBIS del producto: 18 (general), 16 (reducida), 0 (gravado 0 %) o E (exento). Ver services/fiscal/calculo.js
    if (Object.prototype.hasOwnProperty.call(body, 'itbis_tasa')) out.itbis_tasa = ['18', '16', '0', 'E'].includes(String(body.itbis_tasa).toUpperCase()) ? String(body.itbis_tasa).toUpperCase() : '18';
    return out;
}

// GET /productos - Mostrar página de productos
router.get('/', async (req, res) => {
    try {
        const [productos] = await db.query('SELECT * FROM productos ORDER BY nombre');
        res.render('productos', { productos: productos || [] });
    } catch (error) {
        console.error('Error al obtener productos:', error);
        res.status(500).render('error', { 
            error: {
                message: 'Error al obtener productos',
                stack: error.stack
            }
        });
    }
});

// GET /productos/buscar - Buscar productos
router.get('/buscar', async (req, res) => {
    try {
        const query = req.query.q || '';
        const sql = `
            SELECT * FROM productos 
            WHERE nombre ILIKE ? OR codigo ILIKE ?
            ORDER BY nombre
            LIMIT 10
        `;
        const searchTerm = `%${query}%`;
        const [productos] = await db.query(sql, [searchTerm, searchTerm]);
        res.json(productos);
    } catch (error) {
        console.error('Error al buscar productos:', error);
        res.status(500).json({ error: 'Error al buscar productos' });
    }
});

// ============================
// Productos Hijos (Padre -> Hijos)
// Ejemplo: "CORRIENTE - Goulash de cerdo / Crema / Obs. Poco arroz"
// Relacionado con:
// - database.sql -> tabla producto_hijos
// - views/productos.ejs + public/js/productos.js (administración)
// - public/js/mesas.js (al montar pedido: selecciona hijos y los guarda en pedido_items.nota)
// ============================

// GET /productos/:padreId/hijos - Listar hijos de un producto padre
router.get('/:padreId(\\d+)/hijos', async (req, res) => {
    const padreId = Number(req.params.padreId);
    try {
        const [rows] = await db.query(`
            SELECT pr.id, pr.codigo, pr.nombre
            FROM producto_hijos ph
            JOIN productos pr ON pr.id = ph.producto_hijo_id
            WHERE ph.producto_padre_id = ?
            ORDER BY pr.nombre ASC
        `, [padreId]);
        res.json(rows || []);
    } catch (error) {
        console.error('Error al listar hijos del producto:', error);
        // Si la BD no está migrada aún, damos un error claro
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ error: 'Falta migración: cree la tabla producto_hijos (ver database.sql)' });
        }
        res.status(500).json({ error: 'Error al listar hijos del producto' });
    }
});

// POST /productos/:padreId/hijos - Agregar un hijo a un padre
router.post('/:padreId(\\d+)/hijos', async (req, res) => {
    const padreId = Number(req.params.padreId);
    const hijoId = Number(req.body?.producto_hijo_id);

    if (!Number.isFinite(padreId) || padreId <= 0) return res.status(400).json({ error: 'padreId inválido' });
    if (!Number.isFinite(hijoId) || hijoId <= 0) return res.status(400).json({ error: 'producto_hijo_id requerido' });
    if (padreId === hijoId) return res.status(400).json({ error: 'Un producto no puede ser hijo de sí mismo' });

    try {
        // Validar existencia de ambos productos (evita FK errors y mejora UX)
        const [[padre]] = await db.query('SELECT id FROM productos WHERE id = ? LIMIT 1', [padreId]);
        if (!padre) return res.status(404).json({ error: 'Producto padre no encontrado' });
        const [[hijo]] = await db.query('SELECT id FROM productos WHERE id = ? LIMIT 1', [hijoId]);
        if (!hijo) return res.status(404).json({ error: 'Producto hijo no encontrado' });

        // Insert idempotente (si ya existe, no rompe)
        await db.query(
            'INSERT INTO producto_hijos (producto_padre_id, producto_hijo_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
            [padreId, hijoId]
        );

        res.status(201).json({ message: 'Hijo agregado' });
    } catch (error) {
        console.error('Error al agregar hijo al producto:', error);
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ error: 'Falta migración: cree la tabla producto_hijos (ver database.sql)' });
        }
        res.status(500).json({ error: 'Error al agregar hijo al producto' });
    }
});

// DELETE /productos/:padreId/hijos/:hijoId - Quitar un hijo de un padre
router.delete('/:padreId(\\d+)/hijos/:hijoId(\\d+)', async (req, res) => {
    const padreId = Number(req.params.padreId);
    const hijoId = Number(req.params.hijoId);
    try {
        const [result] = await db.query(
            'DELETE FROM producto_hijos WHERE producto_padre_id = ? AND producto_hijo_id = ?',
            [padreId, hijoId]
        );
        if ((result?.affectedRows || 0) === 0) {
            return res.status(404).json({ error: 'Relación no encontrada' });
        }
        res.json({ message: 'Hijo removido' });
    } catch (error) {
        console.error('Error al eliminar hijo del producto:', error);
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ error: 'Falta migración: cree la tabla producto_hijos (ver database.sql)' });
        }
        res.status(500).json({ error: 'Error al eliminar hijo del producto' });
    }
});

// ============================
// Hijos como "items" de texto (NO son productos)
// Ejemplo: Producto padre "CORRIENTE" -> items: "Goulash de cerdo", "Crema"
// Relacionado con:
// - database.sql -> tabla producto_hijos_items
// - views/productos.ejs + public/js/productos.js (administración de items)
// - public/js/mesas.js (montar pedido: selección múltiple y nota)
// ============================

// GET /productos/:padreId/hijos-items - Listar items hijos del producto padre
router.get('/:padreId(\\d+)/hijos-items', async (req, res) => {
    const padreId = Number(req.params.padreId);
    try {
        const [rows] = await db.query(`
            SELECT id, producto_padre_id, nombre, orden
            FROM producto_hijos_items
            WHERE producto_padre_id = ?
            ORDER BY orden ASC, nombre ASC, id ASC
        `, [padreId]);
        res.json(rows || []);
    } catch (error) {
        console.error('Error al listar hijos-items del producto:', error);
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ error: 'Falta migración: cree la tabla producto_hijos_items (ver database.sql)' });
        }
        res.status(500).json({ error: 'Error al listar hijos-items del producto' });
    }
});

// POST /productos/:padreId/hijos-items - Agregar item hijo (texto) al padre
router.post('/:padreId(\\d+)/hijos-items', async (req, res) => {
    const padreId = Number(req.params.padreId);
    const nombre = String(req.body?.nombre || '').trim();
    const orden = Number(req.body?.orden || 0);

    if (!Number.isFinite(padreId) || padreId <= 0) return res.status(400).json({ error: 'padreId inválido' });
    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });
    if (nombre.length > 120) return res.status(400).json({ error: 'nombre demasiado largo (máx 120)' });

    try {
        const [[padre]] = await db.query('SELECT id FROM productos WHERE id = ? LIMIT 1', [padreId]);
        if (!padre) return res.status(404).json({ error: 'Producto padre no encontrado' });

        const [result] = await db.query(
            'INSERT INTO producto_hijos_items (producto_padre_id, nombre, orden) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
            [padreId, nombre, Number.isFinite(orden) ? orden : 0]
        );

        // Nota: ON CONFLICT DO NOTHING no informa duplicado; devolvemos 201 igual (idempotente)
        res.status(201).json({ id: result?.insertId || null, message: 'Item hijo agregado' });
    } catch (error) {
        console.error('Error al agregar hijo-item al producto:', error);
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ error: 'Falta migración: cree la tabla producto_hijos_items (ver database.sql)' });
        }
        res.status(500).json({ error: 'Error al agregar hijo-item al producto' });
    }
});

// DELETE /productos/:padreId/hijos-items/:itemId - Eliminar item hijo del padre
router.delete('/:padreId(\\d+)/hijos-items/:itemId(\\d+)', async (req, res) => {
    const padreId = Number(req.params.padreId);
    const itemId = Number(req.params.itemId);
    try {
        const [result] = await db.query(
            'DELETE FROM producto_hijos_items WHERE id = ? AND producto_padre_id = ?',
            [itemId, padreId]
        );
        if ((result?.affectedRows || 0) === 0) return res.status(404).json({ error: 'Item hijo no encontrado' });
        res.json({ message: 'Item hijo eliminado' });
    } catch (error) {
        console.error('Error al eliminar hijo-item del producto:', error);
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ error: 'Falta migración: cree la tabla producto_hijos_items (ver database.sql)' });
        }
        res.status(500).json({ error: 'Error al eliminar hijo-item del producto' });
    }
});

// GET /productos/:id - Obtener un producto específico
router.get('/:id(\\d+)', async (req, res) => {
    try {
        const [productos] = await db.query(
            `SELECT p.*, EXISTS (SELECT 1 FROM producto_imagenes pi WHERE pi.producto_id = p.id) AS tiene_imagen
             FROM productos p WHERE p.id = ?`,
            [req.params.id]
        );
        const producto = productos[0];
        if (!producto) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }
        res.json(producto);
    } catch (error) {
        console.error('Error al obtener producto:', error);
        res.status(500).json({ error: 'Error al obtener producto' });
    }
});

// POST /productos - Crear nuevo producto
router.post('/', async (req, res) => {
    try {
        const { codigo, nombre, precio_kg, precio_unidad, precio_libra } = req.body;
        
        // Validar datos
        if (!codigo || !nombre) {
            return res.status(400).json({ error: 'El código y nombre son requeridos' });
        }

        const carta = camposCarta(req.body || {});
        const [result] = await db.query(
            `INSERT INTO productos (codigo, nombre, precio_kg, precio_unidad, precio_libra, categoria, descripcion, en_menu, disponible, plato_del_dia, itbis_tasa)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [codigo, nombre, precio_kg || 0, precio_unidad || 0, precio_libra || 0,
             carta.categoria ?? null, carta.descripcion ?? null, carta.en_menu ?? 1, carta.disponible ?? 1, carta.plato_del_dia ?? 0, carta.itbis_tasa ?? '18']
        );

        res.status(201).json({ 
            id: result.insertId,
            message: 'Producto creado exitosamente' 
        });
    } catch (error) {
        console.error('Error al crear producto:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Ya existe un producto con ese código' });
        }
        res.status(500).json({ error: 'Error al crear producto' });
    }
});

// PUT /productos/:id - Actualizar producto
router.put('/:id', async (req, res) => {
    try {
        const { codigo, nombre, precio_kg, precio_unidad, precio_libra } = req.body;
        
        // Validar datos
        if (!codigo || !nombre) {
            return res.status(400).json({ error: 'El código y nombre son requeridos' });
        }

        const carta = camposCarta(req.body || {});
        const sets = ['codigo = ?', 'nombre = ?', 'precio_kg = ?', 'precio_unidad = ?', 'precio_libra = ?'];
        const vals = [codigo, nombre, precio_kg || 0, precio_unidad || 0, precio_libra || 0];
        for (const [k, v] of Object.entries(carta)) { sets.push(`${k} = ?`); vals.push(v); }
        vals.push(req.params.id);
        const [result] = await db.query(`UPDATE productos SET ${sets.join(', ')} WHERE id = ?`, vals);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.json({ message: 'Producto actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar producto:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Ya existe un producto con ese código' });
        }
        res.status(500).json({ error: 'Error al actualizar producto' });
    }
});

// DELETE /productos/:id - Eliminar producto
router.delete('/:id', async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM productos WHERE id = ?', [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        res.json({ message: 'Producto eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ error: 'No se puede eliminar: el producto tiene ventas o pedidos. Desmárcalo como "Mostrar en el menú" o "Disponible".' });
        }
        res.status(500).json({ error: 'Error al eliminar producto' });
    }
});

// Foto del producto (carta digital). Se guarda en producto_imagenes.
// Relacionado con: routes/menu.js (GET /menu/img/:id), public/js/productos.js
const multerImg = require('multer')({
    storage: require('multer').memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
});

router.post('/:id(\\d+)/imagen', (req, res) => {
    multerImg.single('imagen')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'La foto supera 3 MB' : 'No se pudo leer la foto' });
        if (!req.file) return res.status(400).json({ error: 'Sube una imagen JPG, PNG o WebP' });
        try {
            await db.query(
                `INSERT INTO producto_imagenes (producto_id, data, tipo) VALUES (?, ?, ?)
                 ON CONFLICT (producto_id) DO UPDATE SET data = EXCLUDED.data, tipo = EXCLUDED.tipo, updated_at = NOW()`,
                [req.params.id, req.file.buffer, req.file.mimetype]
            );
            res.status(201).json({ ok: true, url: `/menu/img/${req.params.id}` });
        } catch (e) {
            if (e.code === 'ER_NO_REFERENCED_ROW_2') return res.status(404).json({ error: 'Producto no encontrado' });
            console.error('Error al guardar foto del producto:', e);
            res.status(500).json({ error: 'Error al guardar la foto' });
        }
    });
});

router.delete('/:id(\\d+)/imagen', async (req, res) => {
    try {
        await db.query('DELETE FROM producto_imagenes WHERE producto_id = ?', [req.params.id]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Error al quitar foto del producto:', e);
        res.status(500).json({ error: 'Error al quitar la foto' });
    }
});

module.exports = router; 

// Rutas adicionales para import/export masivo - se montan en el mismo archivo
router.get('/plantilla', async (req, res) => {
    try {
        try { ExcelJS = ExcelJS || require('exceljs'); } catch (e) { return res.status(500).send('Instale exceljs para generar la plantilla'); }

        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Instrucciones');
        ws.addRow(['PLANTILLA DE PRODUCTOS']).font = { bold: true, size: 16 };
        ws.addRow(['1) No cambie los encabezados de la hoja "Productos".']).font = { color: { argb: 'FF495057' } };
        ws.addRow(['2) Columnas obligatorias: codigo, nombre. Los precios pueden ser 0.']).font = { color: { argb: 'FF495057' } };
        ws.addRow(['3) Use punto como decimal (ej: 1234.56).']).font = { color: { argb: 'FF495057' } };
        ws.addRow(['4) El código debe ser único. Si ya existe, se actualizarán precios/nombre.']).font = { color: { argb: 'FF495057' } };
        ws.getColumn(1).width = 80;
        ws.addRow([]);

        const table = wb.addWorksheet('Productos');
        table.columns = [
            { header: 'codigo', key: 'codigo', width: 18 },
            { header: 'nombre', key: 'nombre', width: 32 },
            { header: 'precio_kg', key: 'precio_kg', width: 14 },
            { header: 'precio_unidad', key: 'precio_unidad', width: 14 },
            { header: 'precio_libra', key: 'precio_libra', width: 14 }
        ];
        const headerRow = table.getRow(1);
        headerRow.font = { bold: true };
        headerRow.alignment = { horizontal: 'center' };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
        table.views = [{ state: 'frozen', ySplit: 1 }];

        // Ejemplos
        table.addRow({ codigo: 'P001', nombre: 'Manzana Roja', precio_kg: 8500, precio_unidad: 1500, precio_libra: 4200 });
        table.addRow({ codigo: 'P002', nombre: 'CocaCola 400ml', precio_kg: 0, precio_unidad: 2500, precio_libra: 0 });
        table.addRow({ codigo: 'P003', nombre: 'Queso Campesino', precio_kg: 18000, precio_unidad: 0, precio_libra: 9000 });

        // Validaciones (toda la columna a partir de fila 2)
        table.dataValidations.add('A2:A1048576', { type: 'textLength', operator: 'greaterThan', formulae: [0], allowBlank: false, showErrorMessage: true, errorTitle: 'Código requerido', error: 'Ingrese un código' });
        table.dataValidations.add('B2:B1048576', { type: 'textLength', operator: 'greaterThan', formulae: [0], allowBlank: false, showErrorMessage: true, errorTitle: 'Nombre requerido', error: 'Ingrese el nombre' });
        ['C','D','E'].forEach(col => {
            table.dataValidations.add(`${col}2:${col}1048576`, { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0], allowBlank: true, showErrorMessage: true, errorTitle: 'Precio inválido', error: 'Debe ser número ≥ 0 (use punto decimal)' });
        });

        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition','attachment; filename="plantilla_productos.xlsx"');
        await wb.xlsx.write(res); res.end();
    } catch (e) { console.error(e); res.status(500).send('No se pudo generar la plantilla'); }
});

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024 } });

router.post('/importar', upload.single('archivo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });
        try { ExcelJS = ExcelJS || require('exceljs'); } catch (e) { return res.status(500).json({ error: 'Instale exceljs para importar' }); }

        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(req.file.buffer);
        const ws = wb.getWorksheet('Productos') || wb.worksheets[0];
        if (!ws) return res.status(400).json({ error: 'Hoja Productos no encontrada' });

        const header = ['codigo','nombre','precio_kg','precio_unidad','precio_libra'];
        const colIdx = header.map((h,i)=> i+1);
        const rows = [];
        ws.eachRow((row, idx) => {
            if (idx === 1) return; // encabezado
            const r = header.reduce((acc, key, i) => { acc[key] = row.getCell(i+1).value || ''; return acc; }, {});
            if (!r.codigo || !r.nombre) return;
            rows.push({
                codigo: String(r.codigo).trim(),
                nombre: String(r.nombre).trim(),
                precio_kg: Number(r.precio_kg||0),
                precio_unidad: Number(r.precio_unidad||0),
                precio_libra: Number(r.precio_libra||0)
            });
        });

        if (rows.length === 0) return res.status(400).json({ error: 'No hay registros válidos' });

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            for (const p of rows) {
                await connection.query(
                    'INSERT INTO productos (codigo, nombre, precio_kg, precio_unidad, precio_libra) VALUES (?,?,?,?,?) ON CONFLICT (codigo) DO UPDATE SET nombre=EXCLUDED.nombre, precio_kg=EXCLUDED.precio_kg, precio_unidad=EXCLUDED.precio_unidad, precio_libra=EXCLUDED.precio_libra',
                    [p.codigo, p.nombre, p.precio_kg, p.precio_unidad, p.precio_libra]
                );
            }
            await connection.commit();
        } catch (e) { await connection.rollback(); throw e; }
        finally { connection.release(); }

        res.json({ inserted: rows.length });
    } catch (e) {
        console.error('Error al importar:', e);
        res.status(500).json({ error: 'Error al importar productos' });
    }
});