// Panel de reservas (personal)
// Relacionado con: views/reservas.ejs, routes/reservas.js
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const modal = new bootstrap.Modal($('modalReserva'));
  let cache = [];

  const ESTADO = {
    pendiente: ['Por confirmar', 'warn'], confirmada: ['Confirmada', 'ok'], sentada: ['En mesa', 'accent'],
    completada: ['Completada', ''], cancelada: ['Cancelada', 'danger'], no_show: ['No llegó', 'danger']
  };
  const ACCIONES = {
    pendiente: [['confirmada', 'Confirmar', 'btn-success'], ['cancelada', 'Rechazar', 'btn-outline-danger']],
    confirmada: [['sentada', 'Sentar', 'btn-rm'], ['no_show', 'No llegó', 'btn-outline-secondary'], ['cancelada', 'Cancelar', 'btn-outline-danger']],
    sentada: [['completada', 'Completar', 'btn-outline-secondary']],
    completada: [], cancelada: [['pendiente', 'Reabrir', 'btn-outline-secondary']], no_show: [['pendiente', 'Reabrir', 'btn-outline-secondary']]
  };

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }

  async function cargarDias() {
    let resumen = [];
    try { resumen = await api('/api/reservas/resumen'); } catch (_) {}
    const porFecha = Object.fromEntries(resumen.map((r) => [r.fecha, r]));
    const hoy = new Date();
    const cont = $('dias');
    cont.innerHTML = '';
    for (let i = 0; i < 14; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
      const f = isoLocal(d);
      const r = porFecha[f];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `dia ${f === $('fecha').value ? 'active' : ''}`;
      el.dataset.fecha = f;
      el.innerHTML = `<div class="d">${d.toLocaleDateString('es', { weekday: 'short' })}</div><div class="n">${d.getDate()}</div><div class="c">${r ? `${r.reservas} · ${r.personas}p` : ''}</div>`;
      cont.appendChild(el);
    }
  }

  async function cargar() {
    const fecha = $('fecha').value;
    document.querySelectorAll('.dia').forEach((d) => d.classList.toggle('active', d.dataset.fecha === fecha));
    try {
      cache = await api(`/api/reservas?fecha=${encodeURIComponent(fecha)}`);
    } catch (e) {
      $('lista').innerHTML = `<div class="rm-empty text-danger">${esc(e.message)}</div>`;
      return;
    }
    const activas = cache.filter((r) => ['pendiente', 'confirmada', 'sentada'].includes(r.estado));
    $('resumenDia').textContent = `${activas.length} reserva(s) · ${activas.reduce((a, r) => a + Number(r.personas), 0)} personas`;
    if (cache.length === 0) {
      $('lista').innerHTML = '<div class="rm-empty"><i class="bi bi-calendar2-x"></i>Sin reservas para este día</div>';
      return;
    }
    $('lista').innerHTML = cache.map((r) => {
      const [txt, cls] = ESTADO[r.estado] || [r.estado, ''];
      const tel = String(r.telefono || '').replace(/[^\d+]/g, '');
      const wa = tel ? `https://wa.me/${tel.replace(/^\+/, '')}?text=${encodeURIComponent(`Hola ${r.nombre}, te escribimos de Restaurant Martin sobre tu reserva para ${r.personas} persona(s) el ${r.fecha_hora_local.replace('T', ' a las ')}.`)}` : '';
      return `
        <div class="res" data-id="${r.id}">
          <div class="hora">${esc(r.hora)}</div>
          <div class="flex-grow-1 min-w-0">
            <div class="d-flex flex-wrap align-items-center gap-2">
              <strong>${esc(r.nombre)}</strong>
              <span class="rm-chip ${cls}">${txt}</span>
              <span class="rm-chip"><i class="bi bi-people"></i>${Number(r.personas)}</span>
              ${r.mesa_numero ? `<span class="rm-chip"><i class="bi bi-grid"></i>Mesa ${esc(r.mesa_numero)}</span>` : ''}
              ${r.origen === 'web' ? '<span class="rm-chip accent"><i class="bi bi-globe"></i>Web</span>' : ''}
            </div>
            <div class="small text-muted mt-1">
              ${r.telefono ? `<i class="bi bi-telephone"></i> ${esc(r.telefono)} ` : ''}${r.email ? ` · <i class="bi bi-envelope"></i> ${esc(r.email)}` : ''}
              ${r.notas ? `<div class="mt-1"><i class="bi bi-chat-left-text"></i> ${esc(r.notas)}</div>` : ''}
            </div>
            <div class="acc">
              ${(ACCIONES[r.estado] || []).map(([e, l, c]) => `<button class="btn btn-sm ${c}" data-estado="${e}">${l}</button>`).join('')}
              <button class="btn btn-sm btn-outline-secondary" data-editar><i class="bi bi-pencil"></i></button>
              ${wa ? `<a class="btn btn-sm btn-outline-success" href="${wa}" target="_blank" rel="noopener" title="Escribir por WhatsApp"><i class="bi bi-whatsapp"></i></a>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  function abrirModal(r) {
    $('tituloModal').textContent = r ? 'Editar reserva' : 'Nueva reserva';
    $('rId').value = r ? r.id : '';
    $('rNombre').value = r ? r.nombre : '';
    $('rTelefono').value = r ? (r.telefono || '') : '';
    $('rEmail').value = r ? (r.email || '') : '';
    $('rPersonas').value = r ? r.personas : 2;
    $('rMesa').value = r && r.mesa_id ? r.mesa_id : '';
    $('rNotas').value = r ? (r.notas || '') : '';
    $('rFechaHora').value = r ? r.fecha_hora_local : `${$('fecha').value}T20:00`;
    modal.show();
  }

  $('lista').addEventListener('click', async (e) => {
    const row = e.target.closest('.res');
    if (!row) return;
    const r = cache.find((x) => String(x.id) === row.dataset.id);
    if (e.target.closest('[data-editar]')) return abrirModal(r);
    const b = e.target.closest('[data-estado]');
    if (!b) return;
    b.disabled = true;
    try {
      await api(`/api/reservas/${row.dataset.id}/estado`, { method: 'PUT', body: JSON.stringify({ estado: b.dataset.estado }) });
      await Promise.all([cargar(), cargarDias()]);
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
      b.disabled = false;
    }
  });

  $('formReserva').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('rId').value;
    const body = {
      nombre: $('rNombre').value, telefono: $('rTelefono').value, email: $('rEmail').value,
      personas: $('rPersonas').value, fecha_hora: $('rFechaHora').value, mesa_id: $('rMesa').value || null, notas: $('rNotas').value
    };
    try {
      await api(id ? `/api/reservas/${id}` : '/api/reservas', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      modal.hide();
      $('fecha').value = body.fecha_hora.slice(0, 10);
      await Promise.all([cargar(), cargarDias()]);
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    }
  });

  $('btnNueva').addEventListener('click', () => abrirModal(null));
  $('dias').addEventListener('click', (e) => {
    const d = e.target.closest('.dia');
    if (d) { $('fecha').value = d.dataset.fecha; cargar(); }
  });
  $('fecha').addEventListener('change', cargar);
  $('hoy').addEventListener('click', () => { $('fecha').value = isoLocal(new Date()); cargar(); });

  $('fecha').value = isoLocal(new Date());
  cargarDias().then(cargar);
  setInterval(() => { if (!document.hidden) { cargar(); } }, 30000);
})();
