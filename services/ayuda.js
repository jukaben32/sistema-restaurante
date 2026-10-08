// Guía de uso integrada: lee ayuda/GUIA-DE-USO.md y la divide en secciones para la pantalla /ayuda.
// Para cambiar el contenido basta con editar ese archivo (Markdown, sin tocar código).
// Cada sección empieza con un título "## ..." y puede llevar al final {roles=mesero,administrador};
// sin esa marca, o con {roles=}, la sección es para todos.
// Relacionado con: routes/ayuda.js, views/ayuda.ejs, ayuda/GUIA-DE-USO.md
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const ARCHIVO = path.join(__dirname, '..', 'ayuda', 'GUIA-DE-USO.md');
const ROLES = ['administrador', 'mesero', 'cocinero'];

let cache = { mtime: 0, datos: null };

const quitarAcentos = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const slug = (s) => quitarAcentos(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'seccion';

/** Convierte Markdown en HTML y lo adapta al estilo de la app (ids en títulos, tablas con scroll). */
function aHtml(md) {
    let html = marked.parse(md, { gfm: true, breaks: false });
    const usados = new Set();
    html = html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (m, n, inner) => {
        let id = slug(inner);
        while (usados.has(id)) id += '-2';
        usados.add(id);
        return `<h${n} id="${id}">${inner}</h${n}>`;
    });
    html = html.replace(/<table>/g, '<div class="table-responsive"><table class="table table-sm table-bordered align-middle">').replace(/<\/table>/g, '</table></div>');
    html = html.replace(/<blockquote>/g, '<blockquote class="guia-nota">');
    return html;
}

function cargar() {
    const stat = fs.statSync(ARCHIVO);
    if (cache.datos && cache.mtime === stat.mtimeMs) return cache.datos;

    const md = fs.readFileSync(ARCHIVO, 'utf8').replace(/\r\n/g, '\n');
    const partes = md.split(/^## /m);
    const intro = partes.shift(); // título y "cómo usar esta guía"
    const tituloGuia = (intro.match(/^# (.+)$/m) || [null, 'Guía de uso'])[1];

    const secciones = partes.map((bloque, i) => {
        const salto = bloque.indexOf('\n');
        let titulo = (salto === -1 ? bloque : bloque.slice(0, salto)).trim();
        const cuerpo = salto === -1 ? '' : bloque.slice(salto + 1).replace(/\n---\s*$/m, '').trim();
        let roles = [];
        const m = titulo.match(/\s*\{roles=([^}]*)\}\s*$/);
        if (m) {
            roles = m[1].split(',').map((r) => r.trim().toLowerCase()).filter((r) => ROLES.includes(r));
            titulo = titulo.replace(m[0], '').trim();
        }
        const sub = [];
        const reSub = /^### (.+)$/gm;
        let s;
        while ((s = reSub.exec(cuerpo))) sub.push(s[1].trim());
        const html = aHtml(cuerpo);
        // Texto plano para el buscador (sin etiquetas)
        const texto = quitarAcentos(`${titulo} ${cuerpo}`.replace(/[`*_>|#-]/g, ' ')).toLowerCase();
        return { id: `s${i + 1}-${slug(titulo)}`, titulo, roles, subsecciones: sub.map((t) => ({ titulo: t, id: slug(aHtmlTitulo(t)) })), html, texto };
    });

    const datos = { titulo: tituloGuia, introHtml: aHtml(intro.replace(/^# .+\n/, '')), secciones };
    cache = { mtime: stat.mtimeMs, datos };
    return datos;
}

function aHtmlTitulo(t) {
    // El id de un ### se calcula igual que en aHtml (marked convierte **negritas** a <strong>, etc.)
    return marked.parseInline(t);
}

/** ¿La sección aplica a este rol? Las generales (sin roles) aplican a todos. */
function aplica(seccion, rol) {
    return seccion.roles.length === 0 || seccion.roles.includes(String(rol || '').toLowerCase());
}

function contenido() {
    return cargar();
}

function rutaArchivo() {
    return ARCHIVO;
}

module.exports = { contenido, aplica, rutaArchivo, ROLES };
