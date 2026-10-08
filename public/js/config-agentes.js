// Configuración → Agentes
// Relacionado con: views/config_agentes.ejs, routes/agentes.js (GET/PUT /api/negocio)
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const ORDEN = [1, 2, 3, 4, 5, 6, 0]; // semana empezando en lunes

  function filaDia(h) {
    return `
      <div class="fila fila-dia" data-dia="${h.dia}">
        <strong>${DIAS[h.dia]}</strong>
        <input type="time" class="form-control form-control-sm d-abre" value="${esc(h.abre)}" aria-label="Abre ${DIAS[h.dia]}" ${h.cerrado ? 'disabled' : ''}>
        <input type="time" class="form-control form-control-sm d-cierra" value="${esc(h.cierra)}" aria-label="Cierra ${DIAS[h.dia]}" ${h.cerrado ? 'disabled' : ''}>
        <label class="form-check small mb-0 text-nowrap"><input type="checkbox" class="form-check-input d-cerrado" ${h.cerrado ? 'checked' : ''}> Cerrado</label>
        <label class="form-check small mb-0 text-nowrap"><input type="checkbox" class="form-check-input d-delivery" ${h.delivery ? 'checked' : ''}> Delivery</label>
      </div>`;
  }

  function filaZona(z = {}) {
    return `
      <div class="fila fila-zona" data-id="${z.id || ''}">
        <input class="form-control form-control-sm z-nombre" maxlength="100" placeholder="Nombre de la zona" value="${esc(z.nombre)}" aria-label="Nombre de la zona">
        <input type="number" min="0" step="0.01" class="form-control form-control-sm z-costo" value="${z.costo_envio ?? 0}" aria-label="Costo de envío">
        <input type="number" min="5" max="240" class="form-control form-control-sm z-min" value="${z.minutos_estimados ?? 40}" aria-label="Minutos">
        <label class="form-check mb-0"><input type="checkbox" class="form-check-input z-activa" ${z.activa === 0 ? '' : 'checked'}></label>
        <button type="button" class="btn btn-sm btn-outline-danger z-del" aria-label="Quitar zona"><i class="bi bi-trash"></i></button>
      </div>`;
  }

  function filaFaq(f = {}) {
    return `
      <div class="border rounded-3 p-2 f-fila">
        <div class="d-flex gap-2 mb-1"><input class="form-control form-control-sm f-preg" maxlength="200" placeholder="Pregunta (ej. ¿Tienen parqueo?)" value="${esc(f.pregunta)}">
          <button type="button" class="btn btn-sm btn-outline-danger f-del" aria-label="Quitar"><i class="bi bi-x-lg"></i></button></div>
        <textarea class="form-control form-control-sm f-resp" rows="2" maxlength="1000" placeholder="Respuesta">${esc(f.respuesta)}</textarea>
      </div>`;
  }

  function pintar(d) {
    $('deliveryActivo').checked = !!d.config.delivery_activo;
    $('minimo').value = d.config.pedido_minimo_delivery;
    $('prep').value = d.config.tiempo_preparacion_min;
    $('transf').value = d.config.datos_transferencia;
    $('humano').value = d.config.telefono_humano;
    $('infoNegocio').textContent = [d.config.nombre_negocio, d.config.direccion, d.config.telefono].filter(Boolean).join(' · ') || 'sin datos aún';
    $('dias').innerHTML = ORDEN.map((i) => filaDia(d.horarios.find((h) => h.dia === i))).join('');
    $('zonas').innerHTML = d.zonas.map(filaZona).join('');
    $('faq').innerHTML = d.faq.map(filaFaq).join('');
    $('cargando').classList.add('d-none');
    $('form').classList.remove('d-none');
  }

  async function cargar() {
    try {
      const r = await fetch('/api/negocio', { headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      pintar(d);
    } catch (e) {
      $('cargando').innerHTML = `<span class="text-danger">${esc(e.message)}</span>`;
    }
  }

  $('dias').addEventListener('change', (e) => {
    if (!e.target.classList.contains('d-cerrado')) return;
    const f = e.target.closest('.fila-dia');
    f.querySelector('.d-abre').disabled = e.target.checked;
    f.querySelector('.d-cierra').disabled = e.target.checked;
  });
  $('addZona').addEventListener('click', () => { $('zonas').insertAdjacentHTML('beforeend', filaZona()); $('zonas').lastElementChild.querySelector('.z-nombre').focus(); });
  $('zonas').addEventListener('click', (e) => { if (e.target.closest('.z-del')) e.target.closest('.fila-zona').remove(); });
  $('addFaq').addEventListener('click', () => { $('faq').insertAdjacentHTML('beforeend', filaFaq()); $('faq').lastElementChild.querySelector('.f-preg').focus(); });
  $('faq').addEventListener('click', (e) => { if (e.target.closest('.f-del')) e.target.closest('.f-fila').remove(); });

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btnGuardar');
    btn.disabled = true;
    const body = {
      config: {
        delivery_activo: $('deliveryActivo').checked ? 1 : 0, pedido_minimo_delivery: $('minimo').value, tiempo_preparacion_min: $('prep').value,
        datos_transferencia: $('transf').value, telefono_humano: $('humano').value
      },
      horarios: [...document.querySelectorAll('.fila-dia')].map((f) => ({
        dia: Number(f.dataset.dia), abre: f.querySelector('.d-abre').value, cierra: f.querySelector('.d-cierra').value,
        cerrado: f.querySelector('.d-cerrado').checked ? 1 : 0, delivery: f.querySelector('.d-delivery').checked ? 1 : 0
      })),
      zonas: [...document.querySelectorAll('.fila-zona[data-id]')].map((f) => ({
        id: f.dataset.id || null, nombre: f.querySelector('.z-nombre').value, costo_envio: f.querySelector('.z-costo').value,
        minutos_estimados: f.querySelector('.z-min').value, activa: f.querySelector('.z-activa').checked ? 1 : 0
      })),
      faq: [...document.querySelectorAll('.f-fila')].map((f) => ({ pregunta: f.querySelector('.f-preg').value, respuesta: f.querySelector('.f-resp').value }))
    };
    try {
      const r = await fetch('/api/negocio', { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      pintar(d);
      $('estado').textContent = `Guardado ${new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message });
    } finally { btn.disabled = false; }
  });

  cargar();
})();
