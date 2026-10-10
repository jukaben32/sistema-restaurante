const express = require('express');
const router = express.Router();
const db = require('../db');
const calculo = require('../services/fiscal/calculo');

// Datos fiscales del cliente (para crédito fiscal E31 / B01). Devuelve { error } o { tipo, documento, razon, email }.
// Relacionado con: services/facturacion.js (comprador), services/fiscal/calculo.js
function datosFiscales(b) {
    let tipo = String(b.tipo_documento || 'ninguno').toLowerCase();
    if (!['ninguno', 'rnc', 'cedula', 'pasaporte'].includes(tipo)) return { error: 'Tipo de documento inválido' };
    let documento = null;
    if (tipo !== 'ninguno') {
        const crudo = String(b.documento || '').trim();
        if (!crudo) { tipo = 'ninguno'; } else {
            documento = calculo.normalizarDocumento(tipo, crudo);
            if (!calculo.validarDocumento(tipo, documento)) {
                return { error: tipo === 'rnc' ? 'El RNC no es válido (9 dígitos; revisa el dígito verificador).' : tipo === 'cedula' ? 'La cédula no es válida (11 dígitos; revisa el dígito verificador).' : 'El pasaporte no es válido.' };
            }
        }
    }
    const razon = String(b.razon_social || '').trim().slice(0, 150) || null;
    const email = String(b.email || '').trim().slice(0, 150) || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'El correo no es válido' };
    return { tipo, documento, razon, email };
}

// GET /clientes - Mostrar página de clientes
router.get('/', async (req, res) => {
    try {
        const [clientes] = await db.query('SELECT * FROM clientes ORDER BY nombre');
        res.render('clientes', { clientes: clientes || [] });
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).render('error', { 
            error: {
                message: 'Error al obtener clientes',
                stack: error.stack
            }
        });
    }
});

// GET /clientes/buscar - Buscar clientes
router.get('/buscar', async (req, res) => {
    try {
        const query = req.query.q || '';
        const sql = `
            SELECT * FROM clientes 
            WHERE nombre ILIKE ? OR telefono ILIKE ? OR documento LIKE ? OR razon_social ILIKE ?
            ORDER BY nombre
            LIMIT 10
        `;
        const searchTerm = `%${query}%`;
        const [clientes] = await db.query(sql, [searchTerm, searchTerm, searchTerm, searchTerm]);
        res.json(clientes);
    } catch (error) {
        console.error('Error al buscar clientes:', error);
        res.status(500).json({ error: 'Error al buscar clientes' });
    }
});

// GET /clientes/:id - Obtener un cliente específico
router.get('/:id', async (req, res) => {
    try {
        const [clientes] = await db.query('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
        const cliente = clientes[0];
        if (!cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }
        res.json(cliente);
    } catch (error) {
        console.error('Error al obtener cliente:', error);
        res.status(500).json({ error: 'Error al obtener cliente' });
    }
});

// POST /clientes - Crear nuevo cliente
router.post('/', async (req, res) => {
    try {
        console.log('Datos recibidos:', req.body);
        const { nombre, direccion, telefono } = req.body;
        
        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }
        const fis = datosFiscales(req.body);
        if (fis.error) return res.status(400).json({ error: fis.error });

        const [result] = await db.query(
            'INSERT INTO clientes (nombre, direccion, telefono, tipo_documento, documento, razon_social, email) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nombre, direccion || null, telefono || null, fis.tipo, fis.documento, fis.razon, fis.email]
        );

        console.log('Cliente creado:', result);

        res.status(201).json({ 
            id: result.insertId,
            message: 'Cliente creado exitosamente' 
        });
    } catch (error) {
        console.error('Error al crear cliente:', error);
        res.status(500).json({ error: 'Error al crear cliente' });
    }
});

// PUT /clientes/:id - Actualizar cliente
router.put('/:id', async (req, res) => {
    try {
        const { nombre, direccion, telefono } = req.body;
        
        if (!nombre) {
            return res.status(400).json({ error: 'El nombre es requerido' });
        }

        const fis = datosFiscales(req.body);
        if (fis.error) return res.status(400).json({ error: fis.error });

        const [result] = await db.query(
            'UPDATE clientes SET nombre = ?, direccion = ?, telefono = ?, tipo_documento = ?, documento = ?, razon_social = ?, email = ? WHERE id = ?',
            [nombre, direccion || null, telefono || null, fis.tipo, fis.documento, fis.razon, fis.email, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json({ message: 'Cliente actualizado exitosamente' });
    } catch (error) {
        console.error('Error al actualizar cliente:', error);
        res.status(500).json({ error: 'Error al actualizar cliente' });
    }
});

// DELETE /clientes/:id - Eliminar cliente
router.delete('/:id', async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM clientes WHERE id = ?', [req.params.id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        res.json({ message: 'Cliente eliminado exitosamente' });
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({ error: 'No se puede eliminar el cliente porque tiene facturas asociadas' });
        }
        res.status(500).json({ error: 'Error al eliminar cliente' });
    }
});

module.exports = router; 