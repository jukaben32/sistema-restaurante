/**
 * Conexión a PostgreSQL (Supabase) con una interfaz compatible con mysql2/promise.
 *
 * Las rutas (routes/*.js) fueron escritas para mysql2, así que este módulo emula:
 * - db.query(sql, params) -> [rows, fields] en SELECT, o [{ insertId, affectedRows }] en INSERT/UPDATE/DELETE
 * - placeholders "?" (se traducen a $1..$n)
 * - "IN (?)" con un array (se expande a $1,$2,...)
 * - "VALUES ?" con un array de arrays (bulk insert)
 * - db.getConnection() con beginTransaction/commit/rollback/release
 * - códigos de error ER_* usados por las rutas (ER_DUP_ENTRY, ER_NO_SUCH_TABLE, ...)
 *
 * Configuración (.env):
 * - DATABASE_URL: cadena de conexión de Supabase (Connection pooler, modo Session)
 * - DB_TIMEZONE: zona horaria para NOW()/DATE() (por defecto America/Bogota)
 * - DB_SSL: "false" para desactivar SSL (por ejemplo, Postgres local)
 */
require('dotenv').config();
const { Pool, types } = require('pg');

// mysql2 devolvía COUNT(*) y DECIMAL como valores numéricos utilizables con Number();
// en pg llegan como string. Los convertimos a number para no romper cálculos en JS/EJS.
types.setTypeParser(20, (v) => (v === null ? null : Number(v)));     // int8 (COUNT, SUM de enteros)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric/decimal

const TIMEZONE = process.env.DB_TIMEZONE || 'America/Bogota';

if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL en el archivo .env (ver .env.example).');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.DB_SSL || '').toLowerCase() === 'false' ? false : { rejectUnauthorized: false },
    max: 10
});

pool.on('connect', (client) => {
    client.query(`SET TIME ZONE '${TIMEZONE.replace(/'/g, '')}'`).catch((err) => {
        console.error('No se pudo fijar la zona horaria de la sesión:', err.message);
    });
});

pool.on('error', (err) => {
    console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

// Tablas sin columna "id" (no se les agrega RETURNING id en INSERT)
const TABLES_WITHOUT_ID = new Set(['producto_hijos']);

/**
 * Traduce una sentencia con placeholders "?" (estilo mysql2) a "$n" de PostgreSQL.
 * Ignora "?" dentro de literales '...', "..." y comentarios "--".
 */
function translate(sql, params = []) {
    const values = [];
    let out = '';
    let p = 0;

    const pushValue = (v) => {
        if (typeof v === 'boolean') v = v ? 1 : 0;
        if (v === undefined) v = null;
        values.push(v);
        return `$${values.length}`;
    };

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];

        if (ch === "'" || ch === '"') {
            const end = sql.indexOf(ch, i + 1);
            const j = end === -1 ? sql.length - 1 : end;
            out += sql.slice(i, j + 1);
            i = j;
            continue;
        }
        if (ch === '-' && sql[i + 1] === '-') {
            const end = sql.indexOf('\n', i);
            const j = end === -1 ? sql.length - 1 : end;
            out += sql.slice(i, j + 1);
            i = j;
            continue;
        }
        if (ch !== '?') {
            out += ch;
            continue;
        }

        const v = params[p++];
        if (Array.isArray(v)) {
            if (v.length > 0 && Array.isArray(v[0])) {
                // VALUES ? -> (..),(..)
                out += v.map((row) => `(${row.map(pushValue).join(', ')})`).join(', ');
            } else if (v.length === 0) {
                // IN (?) con lista vacía: MySQL fallaría; aquí no coincide con nada
                out += 'NULL';
            } else {
                out += v.map(pushValue).join(', ');
            }
        } else {
            out += pushValue(v);
        }
    }

    return { text: out, values };
}

function addReturningId(text) {
    const m = /^\s*INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(text);
    if (!m || /\bRETURNING\b/i.test(text) || TABLES_WITHOUT_ID.has(m[1].toLowerCase())) return text;
    return text.replace(/;?\s*$/, '') + ' RETURNING id';
}

/** Mapea códigos de error de PostgreSQL a los códigos mysql2 que esperan las rutas. */
function mapError(err) {
    if (!err || !err.code || err.pgCode) return err;
    const map = {
        '42P01': 'ER_NO_SUCH_TABLE',
        '42703': 'ER_BAD_FIELD_ERROR',
        '23505': 'ER_DUP_ENTRY'
    };
    let code = map[err.code];
    if (err.code === '23503') {
        code = /still referenced/i.test(err.detail || err.message || '')
            ? 'ER_ROW_IS_REFERENCED_2'
            : 'ER_NO_REFERENCED_ROW_2';
    }
    err.pgCode = err.code;
    if (code) err.code = code;
    return err;
}

async function runQuery(client, sql, params) {
    const { text, values } = translate(String(sql), params || []);
    const finalText = addReturningId(text);
    let res;
    try {
        res = await client.query(finalText, values);
    } catch (err) {
        throw mapError(err);
    }

    if (res.command === 'SELECT') {
        return [res.rows, res.fields];
    }

    const header = {
        affectedRows: res.rowCount || 0,
        insertId: res.command === 'INSERT' && res.rows && res.rows[0] && res.rows[0].id != null ? Number(res.rows[0].id) : 0,
        rows: res.rows
    };
    return [header, undefined];
}

function wrapClient(client) {
    return {
        query: (sql, params) => runQuery(client, sql, params),
        execute: (sql, params) => runQuery(client, sql, params),
        beginTransaction: () => client.query('BEGIN'),
        commit: () => client.query('COMMIT'),
        rollback: () => client.query('ROLLBACK'),
        release: () => client.release()
    };
}

const db = {
    query: (sql, params) => runQuery(pool, sql, params),
    execute: (sql, params) => runQuery(pool, sql, params),
    getConnection: async () => wrapClient(await pool.connect()),
    end: () => pool.end(),
    pool
};

/**
 * Crea/actualiza el esquema ejecutando database.sql (idempotente).
 * Así una base de Supabase vacía queda lista al primer arranque.
 */
async function ensureSchema() {
    try {
        const fs = require('fs');
        const path = require('path');
        const sql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
        await pool.query(sql);
        console.log('Esquema de base de datos verificado');
    } catch (err) {
        // No bloqueamos el arranque si falla el "auto-migrate", pero lo dejamos en consola.
        console.error('ensureSchema() falló:', err.message);
    }
}

db.ensureSchema = ensureSchema;
db.translate = translate;

// server.js verifica la conexión y llama a ensureSchema() antes de escuchar peticiones.
module.exports = db;
