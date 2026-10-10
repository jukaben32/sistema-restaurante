// Inventario (administrador)
// Relacionado con: views/inventario.ejs, routes/inventario.js
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 2) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
  const money = (n) => `RD$\u00a0${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const modalInsumo = new bootstrap.Modal($('modalInsumo'));
  const modalReceta = new bootstrap.Modal($('modalReceta'));
  // Unidades convertibles (igual que services/unidades.js): factor respecto a g (peso) o ml (volumen)
  const UNI = { g: ['peso', 1], kg: ['peso', 1000], lb: ['peso', 453.59237], oz: ['peso', 28.349523125], ml: ['vol', 1], l: ['vol', 1000], gal: ['vol', 3785.411784] };
  const ALIAS = { kilo: 'kg', kilos: 'kg', libra: 'lb', libras: 'lb', lbs: 'lb', gramo: 'g', gramos: 'g', onza: 'oz', onzas: 'oz', litro: 'l', litros: 'l', galon: 'gal', 'galón': 'gal' };
  const normU = (u) => { const t = String(u || '').trim().toLowerCase(); return ALIAS[t] || t; };
  const compat = (u) => { const i = UNI[normU(u)]; return i ? Object.keys(UNI).filter((k) => UNI[k][0] === i[0]) : []; };
  const aUnidad = (cant, de, a) => { const o = UNI[normU(de)], d = UNI[normU(a)]; return o && d && o[0] === d[0] ? Number(cant) * o[1] / d[1] : Number(cant); };
  const opcionesUnidad = (u, sel) => { const l = compat(u); return (l.length ? l : [normU(u)]).map((k) => `<option value="${k}" ${k === normU(sel || u) ? 'selected' : ''}>${esc(k)}</option>`).join(''); };
  let insumos = [];
  let costeo = [];
  let recetaProducto = null;

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }

  function kpis() {
    const bajos = insumos.filter((i) => i.bajo).length;
    const valor = insumos.reduce((a, i) => a + Math.max(0, Number(i.stock)) * Number(i.costo_unitario), 0);
    const conReceta = costeo.filter((p) => Number(p.insumos) > 0).length;
    const margenes = costeo.filter((p) => p.margen !== null).map((p) => p.margen);
    const margenProm = margenes.length ? margenes.reduce((a, b) => a + b, 0) / margenes.length : null;
    const card = (lbl, val, extra = '') => `<div class="col-6 col-lg-3"><div class="rm-card rm-kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div>${extra}</div></div>`;
    $('kpis').innerHTML =
      card('Insumos', insumos.length) +
      card('Stock bajo', bajos, bajos ? '<div class="delta down">Reponer pronto</div>' : '<div class="delta up">Todo en orden</div>') +
      card('Valor del inventario', money(valor)) +
      card('Margen promedio', margenProm === null ? '—' : `${Math.round(margenProm * 100)}%`, `<div class="delta flat">${conReceta} plato(s) con receta</div>`);
  }

  function renderInsumos() {
    const q = $('buscarInsumo').value.trim().toLowerCase();
    const solo = $('soloBajos').checked;
    const lista = insumos.filter((i) => (!q || i.nombre.toLowerCase().includes(q)) && (!solo || i.bajo));
    if (!lista.length) {
      $('tbInsumos').innerHTML = `<tr><td colspan="7"><div class="rm-empty"><i class="bi bi-box"></i>${insumos.length ? 'Sin resultados' : 'Agrega tu primer insumo (carne, arroz, bebidas…)'}</div></td></tr>`;
      return;
    }
    $('tbInsumos').innerHTML = lista.map((i) => {
      const min = Number(i.stock_minimo);
      const pct = min > 0 ? Math.max(0, Math.min(100, (Number(i.stock) / (min * 2)) * 100)) : 100;
      return `<tr data-id="${i.id}">
        <td><strong>${esc(i.nombre)}</strong> ${i.bajo ? '<span class="rm-chip danger ms-1">Bajo</span>' : ''}
            ${Number(i.en_recetas) ? `<div class="small text-muted">En ${i.en_recetas} receta(s)</div>` : ''}</td>
        <td class="num">${num(i.stock, 3)} <span class="text-muted small">${esc(i.unidad)}</span></td>
        <td><div class="stockbar ${i.bajo ? 'bajo' : ''}"><span style="width:${pct}%"></span></div></td>
        <td class="num">${num(min, 3)} <span class="text-muted small">${esc(i.unidad)}</span></td>
        <td class="num">${money(i.costo_unitario)} <span class="text-muted small">/ ${esc(i.unidad)}</span></td>
        <td class="num">${num(i.consumo_7d, 3)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-success" data-mov="entrada" title="Entrada (compra)"><i class="bi bi-plus-lg"></i></button>
          <button class="btn btn-sm btn-outline-secondary" data-mov="salida" title="Salida (merma)"><i class="bi bi-dash-lg"></i></button>
          <button class="btn btn-sm btn-outline-secondary" data-mov="ajuste" title="Ajuste por conteo"><i class="bi bi-clipboard-check"></i></button>
          ${['kg', 'lb'].includes(normU(i.unidad)) ? `<button class="btn btn-sm btn-outline-dark" data-conv title="Cambiar la unidad a ${normU(i.unidad) === 'kg' ? 'libras' : 'kilos'}: convierte stock, costo y recetas"><i class="bi bi-arrow-left-right"></i> ${normU(i.unidad) === 'kg' ? 'a lb' : 'a kg'}</button>` : ''}
          <button class="btn btn-sm btn-outline-primary" data-edit title="Editar"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-del title="Eliminar"><i class="bi bi-trash"></i></button>
        </td></tr>`;
    }).join('');
  }

  function renderCosteo() {
    const q = $('buscarProd').value.trim().toLowerCase();
    const lista = costeo.filter((p) => !q || p.nombre.toLowerCase().includes(q) || String(p.codigo).toLowerCase().includes(q));
    if (!lista.length) { $('tbCosteo').innerHTML = '<tr><td colspan="5"><div class="rm-empty">Sin productos</div></td></tr>'; return; }
    $('tbCosteo').innerHTML = lista.map((p) => {
      const m = p.margen;
      const chip = m === null ? '<span class="text-muted small">Sin receta</span>'
        : `<span class="rm-chip ${m >= 0.6 ? 'ok' : m >= 0.4 ? 'warn' : 'danger'}">${Math.round(m * 100)}%</span>`;
      return `<tr data-pid="${p.id}"><td><strong>${esc(p.nombre)}</strong>${p.categoria ? ` <span class="text-muted small">· ${esc(p.categoria)}</span>` : ''}</td>
        <td class="num">${money(p.precio_unidad)}</td><td class="num">${Number(p.insumos) ? money(p.costo) : '—'}</td>
        <td class="num">${chip}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-receta><i class="bi bi-list-check"></i> Receta</button></td></tr>`;
    }).join('');
  }

  async function cargar() {
    try {
      [insumos, costeo] = await Promise.all([api('/api/inventario/insumos'), api('/api/inventario/costeo')]);
    } catch (e) { Swal.fire({ icon: 'error', title: e.message }); return; }
    kpis(); renderInsumos(); renderCosteo();
  }

  async function cargarMovs() {
    try {
      const rows = await api('/api/inventario/movimientos');
      const TIPO = { entrada: ['Entrada', 'ok'], salida: ['Salida', 'warn'], ajuste: ['Ajuste', ''], venta: ['Venta', 'accent'] };
      $('tbMovs').innerHTML = rows.length ? rows.map((m) => {
        const [t, c] = TIPO[m.tipo] || [m.tipo, ''];
        const cant = Number(m.cantidad);
        return `<tr><td class="small text-nowrap">${new Date(m.created_at).toLocaleString('en-US')}</td><td>${esc(m.insumo)}</td>
          <td><span class="rm-chip ${c}">${t}</span></td><td class="num ${cant < 0 ? 'text-danger' : 'text-success'}">${cant > 0 ? '+' : ''}${num(cant, 3)} ${esc(m.unidad)}</td>
          <td class="num">${num(m.stock_resultante, 3)}</td><td class="small">${esc(m.nota || '')}</td><td class="small text-muted">${esc(m.usuario || '')}</td></tr>`;
      }).join('') : '<tr><td colspan="7"><div class="rm-empty">Aún no hay movimientos</div></td></tr>';
    } catch (e) { Swal.fire({ icon: 'error', title: e.message }); }
  }

  // ---- Insumos: crear / editar / mover / eliminar ----
  function abrirInsumo(i) {
    $('tituloInsumo').textContent = i ? 'Editar insumo' : 'Nuevo insumo';
    $('iId').value = i ? i.id : '';
    $('iNombre').value = i ? i.nombre : '';
    $('iUnidad').value = i ? i.unidad : 'und';
    $('iStock').value = 0;
    $('wrapStock').classList.toggle('d-none', !!i);
    $('iMin').value = i ? Number(i.stock_minimo) : 0;
    $('iCosto').value = i ? Number(i.costo_unitario) : 0;
    modalInsumo.show();
  }
  $('btnNuevoInsumo').addEventListener('click', () => abrirInsumo(null));
  $('formInsumo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('iId').value;
    const ant = id ? insumos.find((x) => String(x.id) === id) : null;
    const nuevaU = normU($('iUnidad').value);
    if (ant && normU(ant.unidad) !== nuevaU && compat(ant.unidad).includes(nuevaU)) {
      const f = aUnidad(1, ant.unidad, nuevaU);
      const ok = await Swal.fire({ icon: 'question', title: `¿Cambiar de ${normU(ant.unidad)} a ${nuevaU}?`,
        html: `Todo se convertirá solo: 1 ${esc(normU(ant.unidad))} = ${num(f, 4)} ${esc(nuevaU)}.<br>El stock, el mínimo, el costo, las recetas y el historial pasarán a ${esc(nuevaU)}.`,
        showCancelButton: true, confirmButtonText: 'Sí, convertir', cancelButtonText: 'Cancelar' });
      if (!ok.isConfirmed) return;
    }
    try {
      await api(id ? `/api/inventario/insumos/${id}` : '/api/inventario/insumos', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify({ nombre: $('iNombre').value, unidad: $('iUnidad').value, stock: $('iStock').value, stock_minimo: $('iMin').value, costo_unitario: $('iCosto').value })
      });
      modalInsumo.hide();
      cargar();
    } catch (err) { Swal.fire({ icon: 'error', title: err.message }); }
  });

  $('tbInsumos').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const ins = insumos.find((x) => String(x.id) === tr.dataset.id);
    if (e.target.closest('[data-edit]')) return abrirInsumo(ins);
    if (e.target.closest('[data-conv]')) {
      const destino = normU(ins.unidad) === 'kg' ? 'lb' : 'kg';
      const f = aUnidad(1, ins.unidad, destino);
      const ok = await Swal.fire({ icon: 'question', title: `¿Pasar "${ins.nombre}" a ${destino === 'lb' ? 'libras' : 'kilos'}?`,
        html: `1 ${esc(normU(ins.unidad))} = ${num(f, 4)} ${destino}.<br>Se convierten solos el stock (${num(ins.stock, 3)} → ${num(aUnidad(ins.stock, ins.unidad, destino), 3)} ${destino}), el mínimo, el costo y las recetas.`,
        showCancelButton: true, confirmButtonText: 'Sí, convertir', cancelButtonText: 'Cancelar' });
      if (!ok.isConfirmed) return;
      try { await api(`/api/inventario/insumos/${ins.id}/convertir`, { method: 'POST', body: JSON.stringify({ unidad: destino }) }); cargar(); } catch (err) { Swal.fire({ icon: 'error', title: err.message }); }
      return;
    }
    if (e.target.closest('[data-del]')) {
      const ok = await Swal.fire({ icon: 'warning', title: `¿Eliminar "${ins.nombre}"?`, text: 'Se quitará de las recetas. El historial se conserva.', showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#b91c1c' });
      if (!ok.isConfirmed) return;
      try { await api(`/api/inventario/insumos/${ins.id}`, { method: 'DELETE' }); cargar(); } catch (err) { Swal.fire({ icon: 'error', title: err.message }); }
      return;
    }
    const b = e.target.closest('[data-mov]');
    if (!b) return;
    const tipo = b.dataset.mov;
    const titulos = { entrada: 'Registrar entrada', salida: 'Registrar salida / merma', ajuste: 'Ajustar por conteo físico' };
    const r = await Swal.fire({
      title: titulos[tipo],
      html: `<div class="text-start small mb-2">${esc(ins.nombre)} · stock actual <b>${num(ins.stock, 3)} ${esc(ins.unidad)}</b></div>
             <div class="input-group mb-2">
               <input id="swCant" type="number" step="0.001" min="0" class="form-control" placeholder="${tipo === 'ajuste' ? 'Stock contado' : 'Cantidad'}">
               <select id="swUni" class="form-select" style="max-width:90px" aria-label="Unidad">${opcionesUnidad(ins.unidad)}</select>
             </div>
             ${compat(ins.unidad).length > 1 ? `<div class="small text-muted mb-2 text-start">Puedes escribirla en ${compat(ins.unidad).filter((k) => ['kg', 'lb'].includes(k)).join(' o ') || 'otra unidad'}: se convierte a ${esc(ins.unidad)} automáticamente.</div>` : ''}
             <input id="swNota" class="form-control" maxlength="300" placeholder="${tipo === 'entrada' ? 'Proveedor / factura de compra' : 'Motivo'} (opcional)">`,
      showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', focusConfirm: false,
      didOpen: () => document.getElementById('swCant').focus(),
      preConfirm: () => {
        const cantidad = document.getElementById('swCant').value;
        if (cantidad === '' || Number(cantidad) < 0 || (tipo !== 'ajuste' && Number(cantidad) <= 0)) { Swal.showValidationMessage('Ingresa una cantidad válida'); return false; }
        return { cantidad, unidad: document.getElementById('swUni').value, nota: document.getElementById('swNota').value };
      }
    });
    if (!r.isConfirmed) return;
    try {
      await api(`/api/inventario/insumos/${ins.id}/movimiento`, { method: 'POST', body: JSON.stringify({ tipo, ...r.value }) });
      cargar();
    } catch (err) { Swal.fire({ icon: 'error', title: err.message }); }
  });

  // ---- Recetas ----
  function filaReceta(item = {}) {
    const opts = insumos.map((i) => `<option value="${i.id}" ${Number(item.insumo_id) === Number(i.id) ? 'selected' : ''}>${esc(i.nombre)} (${esc(i.unidad)})</option>`).join('');
    const div = document.createElement('div');
    div.className = 'd-flex gap-2 align-items-center r-fila';
    div.innerHTML = `<select class="form-select form-select-sm r-ins"><option value="">Insumo…</option>${opts}</select>
      <input type="number" step="0.00001" min="0" class="form-control form-control-sm r-cant" style="max-width:130px" placeholder="Cantidad" value="${item.cantidad != null ? Number(item.cantidad) : ''}">
      <select class="form-select form-select-sm r-uni" style="max-width:80px" aria-label="Unidad">${item.insumo_id ? opcionesUnidad((insumos.find((i) => Number(i.id) === Number(item.insumo_id)) || {}).unidad) : ''}</select>
      <button class="btn btn-sm btn-outline-danger r-del" type="button" aria-label="Quitar"><i class="bi bi-x-lg"></i></button>`;
    return div;
  }
  function recalcReceta() {
    let costo = 0;
    document.querySelectorAll('.r-fila').forEach((f) => {
      const ins = insumos.find((i) => String(i.id) === f.querySelector('.r-ins').value);
      if (ins) costo += aUnidad(f.querySelector('.r-cant').value || 0, f.querySelector('.r-uni').value || ins.unidad, ins.unidad) * Number(ins.costo_unitario);
    });
    const precio = Number(recetaProducto?.precio_unidad || 0);
    $('recetaCosto').textContent = money(costo);
    $('recetaPrecio').textContent = money(precio);
    $('recetaMargen').textContent = precio > 0 ? `${Math.round(((precio - costo) / precio) * 100)}%` : '—';
  }
  $('tbCosteo').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-receta]')) return;
    const pid = e.target.closest('tr').dataset.pid;
    recetaProducto = costeo.find((p) => String(p.id) === pid);
    if (!insumos.length) { Swal.fire({ icon: 'info', title: 'Primero crea insumos en la pestaña Insumos' }); return; }
    $('recetaNombre').textContent = recetaProducto.nombre;
    const cont = $('recetaFilas');
    cont.innerHTML = '';
    try {
      const items = await api(`/api/inventario/recetas/${pid}`);
      (items.length ? items : [{}]).forEach((it) => cont.appendChild(filaReceta(it)));
    } catch (err) { Swal.fire({ icon: 'error', title: err.message }); return; }
    recalcReceta();
    modalReceta.show();
  });
  $('recetaAgregar').addEventListener('click', () => { $('recetaFilas').appendChild(filaReceta()); });
  $('recetaFilas').addEventListener('click', (e) => { if (e.target.closest('.r-del')) { e.target.closest('.r-fila').remove(); recalcReceta(); } });
  $('recetaFilas').addEventListener('input', recalcReceta);
  // Al elegir otro insumo, el selector de unidad ofrece las unidades compatibles con él
  $('recetaFilas').addEventListener('change', (e) => {
    if (e.target.classList.contains('r-ins')) {
      const ins = insumos.find((i) => String(i.id) === e.target.value);
      e.target.closest('.r-fila').querySelector('.r-uni').innerHTML = ins ? opcionesUnidad(ins.unidad) : '';
    }
    recalcReceta();
  });
  $('recetaGuardar').addEventListener('click', async () => {
    const items = [...document.querySelectorAll('.r-fila')].map((f) => ({ insumo_id: f.querySelector('.r-ins').value, cantidad: f.querySelector('.r-cant').value, unidad: f.querySelector('.r-uni').value }))
      .filter((x) => x.insumo_id && Number(x.cantidad) > 0);
    try {
      await api(`/api/inventario/recetas/${recetaProducto.id}`, { method: 'PUT', body: JSON.stringify({ items }) });
      modalReceta.hide();
      cargar();
    } catch (err) { Swal.fire({ icon: 'error', title: err.message }); }
  });

  $('buscarInsumo').addEventListener('input', renderInsumos);
  $('soloBajos').addEventListener('change', renderInsumos);
  $('buscarProd').addEventListener('input', renderCosteo);
  $('btnTabMovs').addEventListener('shown.bs.tab', cargarMovs);

  cargar();
})();
