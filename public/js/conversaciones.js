// Bandeja de conversaciones de los asistentes
// Relacionado con: views/conversaciones.ejs, routes/conversaciones.js
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let lista = [];
  let abierta = null; // conversación abierta (objeto de la API)
  let ultimoId = 0;

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }
  const fail = (e) => Swal.fire({ icon: 'error', title: e.message });

  function hace(ts) {
    const min = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
    return min < 1 ? 'ahora' : min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} d`;
  }

  function pintarLista() {
    $('lista').innerHTML = lista.length ? lista.map((c) => `
      <button class="it ${abierta && abierta.id === c.id ? 'sel' : ''}" data-id="${c.id}">
        <div class="n"><span class="text-truncate"><i class="bi ${c.canal === 'voz' ? 'bi-telephone' : 'bi-whatsapp'} me-1"></i>${esc(c.nombre || c.telefono)}</span><small class="text-muted text-nowrap">${hace(c.ultimo_mensaje_at)}</small></div>
        <div class="u">${esc(c.ultimo || c.resumen || '')}</div>
        <div class="mt-1 d-flex flex-wrap gap-1">
          ${Number(c.necesita_humano) ? '<span class="rm-chip danger"><i class="bi bi-headset"></i>Necesita una persona</span>' : ''}
          ${Number(c.bot_pausado) ? '<span class="rm-chip warn">Bot pausado</span>' : ''}
          ${c.pedido_codigo ? `<span class="rm-chip accent">${esc(c.pedido_codigo)}</span>` : ''}
          ${c.canal === 'voz' && c.estado === 'activa' ? '<span class="rm-chip ok">En llamada</span>' : ''}
        </div>
      </button>`).join('') : '<div class="rm-empty"><i class="bi bi-inbox"></i>Sin conversaciones</div>';
  }

  async function cargarLista() {
    try { lista = await api(`/api/conversaciones?filtro=${encodeURIComponent($('filtro').value)}`); pintarLista(); }
    catch (e) { $('lista').innerHTML = `<div class="rm-empty text-danger">${esc(e.message)}</div>`; }
  }

  function pintarChat(d, mantenerScroll) {
    const c = d.conversacion;
    abierta = { ...c, id: c.id };
    $('vacio').classList.add('d-none');
    $('chat').classList.remove('d-none');
    $('cNombre').textContent = c.nombre_mostrar || c.telefono;
    $('cMeta').textContent = `${c.canal === 'voz' ? 'Llamada' : 'WhatsApp'} · ${c.telefono}${c.duracion_seg ? ` · ${Math.round(c.duracion_seg / 60)} min` : ''}`;
    $('btnPausa').innerHTML = Number(c.bot_pausado) ? '<i class="bi bi-robot"></i> Devolver al asistente' : '<i class="bi bi-person-raised-hand"></i> Tomar conversación';
    $('btnResuelto').classList.toggle('d-none', !Number(c.necesita_humano));
    $('formEnviar').classList.toggle('d-none', c.canal !== 'whatsapp');
    $('resumen').classList.toggle('d-none', !c.resumen);
    if (c.resumen) $('resumen').innerHTML = `<b>Resumen:</b> ${esc(c.resumen)}${c.grabacion_url ? ` · <a href="${esc(c.grabacion_url)}" target="_blank" rel="noopener">Escuchar grabación</a>` : ''}`;

    const cont = $('msgs');
    const abajo = cont.scrollHeight - cont.scrollTop - cont.clientHeight < 80;
    cont.innerHTML = d.mensajes.map((m) => {
      if (m.rol === 'herramienta') return `<div class="ev"><i class="bi bi-gear"></i> ${esc(m.contenido)}</div>`;
      const quien = m.rol === 'personal' ? 'Personal' : m.rol === 'agente' ? 'Asistente' : 'Cliente';
      return `<div class="b ${m.rol}">${esc(m.contenido)}<small>${quien} · ${new Date(m.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</small></div>`;
    }).join('') || '<div class="ev">Sin mensajes</div>';
    const nuevo = d.mensajes.length ? d.mensajes[d.mensajes.length - 1].id : 0;
    if (!mantenerScroll || abajo || nuevo !== ultimoId) cont.scrollTop = cont.scrollHeight;
    ultimoId = nuevo;
    pintarLista();
  }

  async function abrir(id, silencioso) {
    try {
      const d = await api(`/api/conversaciones/${id}`);
      if (!silencioso) { ultimoId = 0; $('bandeja').classList.add('abierta'); }
      pintarChat(d, silencioso);
    } catch (e) { if (!silencioso) fail(e); }
  }

  $('lista').addEventListener('click', (e) => { const b = e.target.closest('.it'); if (b) abrir(Number(b.dataset.id)); });
  $('filtro').addEventListener('change', cargarLista);
  $('btnVolver').addEventListener('click', () => { $('bandeja').classList.remove('abierta'); });

  $('btnPausa').addEventListener('click', async () => {
    try {
      await api(`/api/conversaciones/${abierta.id}/pausa`, { method: 'POST', body: JSON.stringify({ pausado: !Number(abierta.bot_pausado) }) });
      await abrir(abierta.id, true); cargarLista();
    } catch (e) { fail(e); }
  });
  $('btnResuelto').addEventListener('click', async () => {
    try { await api(`/api/conversaciones/${abierta.id}/resuelto`, { method: 'POST', body: '{}' }); await abrir(abierta.id, true); cargarLista(); } catch (e) { fail(e); }
  });

  $('formEnviar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = $('txt').value.trim();
    if (!t || !abierta) return;
    $('btnEnviar').disabled = true;
    try {
      await api(`/api/conversaciones/${abierta.id}/responder`, { method: 'POST', body: JSON.stringify({ texto: t }) });
      $('txt').value = '';
      await abrir(abierta.id, true); cargarLista();
    } catch (err) { fail(err); } finally { $('btnEnviar').disabled = false; }
  });

  cargarLista();
  setInterval(() => { if (!document.hidden) { cargarLista(); if (abierta) abrir(abierta.id, true); } }, 5000);
})();
