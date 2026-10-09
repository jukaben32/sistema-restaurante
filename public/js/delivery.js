// Tablero de delivery y para llevar
// Relacionado con: views/delivery.ejs, routes/delivery.js, services/delivery.js
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONEDA = String(window.DELIVERY.moneda || 'dop').toUpperCase();
  const money = (n) => `${MONEDA === 'DOP' ? 'RD$' : MONEDA + ' '}${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const modal = new bootstrap.Modal($('modalPedido'));
  let pedidos = [];
  let lineas = []; // líneas del pedido nuevo

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }
  const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body || {}) });
  const falla = (e) => Swal.fire({ icon: 'error', title: e.message });

  function hace(ts) {
    const min = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
    return min < 1 ? 'ahora' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`;
  }

  const ORIGEN = { pos: ['POS', ''], voz: ['Llamada', 'accent'], whatsapp: ['WhatsApp', 'ok'] };

  function chipPago(p) {
    if (p.metodo_pago_previsto === 'stripe') {
      if (['pagado', 'usado'].includes(p.stripe_estado)) return '<span class="rm-chip ok"><i class="bi bi-check-circle-fill"></i>Pagado (Stripe)</span>';
      if (p.stripe_estado === 'pendiente') return '<span class="rm-chip warn"><i class="bi bi-hourglass-split"></i>Esperando pago Stripe</span>';
      return '<span class="rm-chip warn"><i class="bi bi-credit-card"></i>Stripe: sin enlace</span>';
    }
    if (p.metodo_pago_previsto === 'cripto') {
      if (['pagado', 'usado'].includes(p.cripto_estado)) return '<span class="rm-chip ok"><i class="bi bi-check-circle-fill"></i>Pagado (cripto)</span>';
      if (p.cripto_estado === 'procesando') return '<span class="rm-chip warn"><i class="bi bi-hourglass-split"></i>Pago cripto detectado</span>';
      if (p.cripto_estado === 'pendiente') return '<span class="rm-chip warn"><i class="bi bi-hourglass-split"></i>Esperando pago cripto</span>';
      return '<span class="rm-chip warn"><i class="bi bi-currency-bitcoin"></i>Cripto: sin cobro</span>';
    }
    if (p.metodo_pago_previsto === 'transferencia') {
      return Number(p.pago_validado) ? '<span class="rm-chip ok"><i class="bi bi-check-circle-fill"></i>Transferencia validada</span>'
        : '<span class="rm-chip warn"><i class="bi bi-bank"></i>Transferencia por validar</span>';
    }
    if (p.metodo_pago_previsto === 'efectivo') return '<span class="rm-chip"><i class="bi bi-cash"></i>Efectivo al recibir</span>';
    return '<span class="rm-chip"><i class="bi bi-question-circle"></i>Pago por definir</span>';
  }

  function tarjeta(p) {
    const [oTxt, oCls] = ORIGEN[p.origen] || [p.origen, ''];
    const tel = String(p.cliente_telefono || '');
    const wa = tel ? `https://wa.me/${tel.replace(/\D/g, '')}` : '';
    const items = p.items.map((i) => `<div class="it"><span>${i.cantidad}× ${esc(i.nombre)}${i.nota ? `<small>${esc(i.nota)}</small>` : ''}</span></div>`).join('');
    const col = p.columna;
    const stripePend = p.metodo_pago_previsto === 'stripe' && !['pagado', 'usado'].includes(p.stripe_estado);
    const criptoPend = p.metodo_pago_previsto === 'cripto' && !['pagado', 'usado'].includes(p.cripto_estado);
    const btns = [];
    if (col === 'por_confirmar') {
      btns.push('<button class="btn btn-sm btn-success" data-a="confirmar"><i class="bi bi-check2"></i> Confirmar</button>');
      btns.push('<button class="btn btn-sm btn-outline-danger" data-a="cancelar">Rechazar</button>');
    }
    if (['por_confirmar', 'en_cocina', 'listo', 'en_camino'].includes(col)) {
      if (stripePend) btns.push('<button class="btn btn-sm btn-outline-primary" data-a="stripe"><i class="bi bi-qr-code"></i> Link de pago</button>');
      if (criptoPend) btns.push('<button class="btn btn-sm btn-outline-primary" data-a="cripto"><i class="bi bi-currency-bitcoin"></i> Cobro cripto</button>');
      if (p.metodo_pago_previsto === 'transferencia' && !Number(p.pago_validado)) btns.push('<button class="btn btn-sm btn-outline-primary" data-a="validar"><i class="bi bi-bank"></i> Validar pago</button>');
    }
    if (col === 'en_cocina') btns.push('<button class="btn btn-sm btn-outline-danger" data-a="cancelar">Cancelar</button>');
    if (col === 'listo') {
      if (p.tipo === 'delivery') btns.push('<button class="btn btn-sm btn-rm" data-a="en-camino"><i class="bi bi-bicycle"></i> Salió a entrega</button>');
      btns.push(`<button class="btn btn-sm btn-success" data-a="entregar"><i class="bi bi-cash-coin"></i> ${p.tipo === 'delivery' ? 'Entregado y cobrar' : 'Entregar y cobrar'}</button>`);
    }
    if (col === 'en_camino') btns.push('<button class="btn btn-sm btn-success" data-a="entregar"><i class="bi bi-cash-coin"></i> Entregado y cobrar</button>');
    if (col === 'entregado' && p.factura_id) btns.push(`<a class="btn btn-sm btn-outline-secondary" target="_blank" rel="noopener" href="/api/facturas/${p.factura_id}/imprimir?embed=1"><i class="bi bi-receipt"></i> Factura</a>`);

    const repartidor = p.tipo === 'delivery' && ['listo', 'en_camino', 'en_cocina'].includes(col)
      ? `<div class="small mt-1"><i class="bi bi-person-badge"></i> ${p.repartidor ? esc(p.repartidor) : '<span class="text-muted">Sin repartidor</span>'} <a href="#" data-a="repartidor" class="ms-1">${p.repartidor ? 'cambiar' : 'asignar'}</a></div>` : '';
    const progreso = col === 'en_cocina' ? `<div class="small text-muted mt-1"><i class="bi bi-egg-fried"></i> ${p.listas} de ${p.lineas} platos listos</div>` : '';

    return `
      <article class="pcard" data-id="${p.id}">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div><span class="cod">${esc(p.codigo)}</span> <span class="rm-chip ${oCls}">${oTxt}</span></div>
          <small class="text-muted text-nowrap">${hace(p.created_at)}</small>
        </div>
        <div class="mt-1"><b>${esc(p.cliente_nombre || 'Cliente')}</b>
          ${tel ? `<span class="small ms-1"><a href="tel:+${esc(tel)}">${esc(tel)}</a> · <a href="${wa}" target="_blank" rel="noopener" title="Abrir WhatsApp"><i class="bi bi-whatsapp"></i></a></span>` : ''}
        </div>
        ${p.tipo === 'delivery' ? `<div class="small"><i class="bi bi-geo-alt"></i> ${esc(p.direccion_entrega)}${p.zona ? ` <span class="text-muted">· ${esc(p.zona)}</span>` : ''}${p.referencia_entrega ? `<div class="text-muted">${esc(p.referencia_entrega)}</div>` : ''}</div>` : '<div class="small text-muted"><i class="bi bi-bag"></i> Para llevar</div>'}
        <div class="my-2">${items}</div>
        ${p.notas ? `<div class="small text-muted mb-1"><i class="bi bi-chat-left-text"></i> ${esc(p.notas)}</div>` : ''}
        <div class="d-flex justify-content-between align-items-center">${chipPago(p)}<span class="tot">${money(p.total)}</span></div>
        ${progreso}${repartidor}
        <div class="acc">${btns.join('')}</div>
      </article>`;
  }

  function render() {
    const cols = { por_confirmar: [], en_cocina: [], listo: [], en_camino: [], entregado: [] };
    pedidos.forEach((p) => { if (cols[p.columna]) cols[p.columna].push(p); });
    document.querySelectorAll('.col-d').forEach((sec) => {
      const lista = cols[sec.dataset.col] || [];
      sec.querySelector('.n').textContent = lista.length;
      sec.querySelector('.lista').innerHTML = lista.length ? lista.map(tarjeta).join('') : '<div class="vacio">Sin pedidos</div>';
    });
    const activos = pedidos.filter((p) => ['por_confirmar', 'en_cocina', 'listo', 'en_camino'].includes(p.columna)).length;
    const hoy = cols.entregado.reduce((a, p) => a + p.total, 0);
    $('resumen').textContent = `${activos} pedido(s) activo(s) · ${cols.entregado.length} entregado(s) hoy (${money(hoy)})`;
  }

  async function cargar() {
    try { pedidos = await api('/api/delivery'); render(); } catch (e) { $('resumen').textContent = `No se pudo actualizar: ${e.message}`; }
  }

  // ----- Acciones de las tarjetas -----
  $('tablero').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    e.preventDefault();
    const card = b.closest('.pcard');
    const p = pedidos.find((x) => String(x.id) === card.dataset.id);
    const a = b.dataset.a;
    try {
      if (a === 'confirmar') { await post(`/api/delivery/${p.id}/confirmar`); }
      else if (a === 'en-camino') { await post(`/api/delivery/${p.id}/en-camino`); }
      else if (a === 'validar') {
        const ok = await Swal.fire({ icon: 'question', title: '¿Ya recibiste la transferencia?', text: `${p.codigo} · ${money(p.total)}`, showCancelButton: true, confirmButtonText: 'Sí, validar', cancelButtonText: 'Aún no' });
        if (!ok.isConfirmed) return;
        await post(`/api/delivery/${p.id}/validar-pago`);
      }
      else if (a === 'cancelar') {
        const r = await Swal.fire({ icon: 'warning', title: `¿Cancelar ${p.codigo}?`, input: 'text', inputPlaceholder: 'Motivo (opcional)', showCancelButton: true, confirmButtonText: 'Cancelar pedido', cancelButtonText: 'Volver', confirmButtonColor: '#b91c1c' });
        if (!r.isConfirmed) return;
        const res = await post(`/api/delivery/${p.id}/cancelar`, { motivo: r.value });
        if (res.reembolso_pendiente) await Swal.fire({ icon: 'info', title: 'Hay un pago de Stripe por reembolsar', text: 'Haz el reembolso desde tu dashboard de Stripe (Pagos).' });
      }
      else if (a === 'repartidor') {
        const r = await Swal.fire({ title: 'Repartidor', input: 'text', inputValue: p.repartidor || '', inputPlaceholder: 'Nombre del repartidor', showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar' });
        if (!r.isConfirmed) return;
        await post(`/api/delivery/${p.id}/repartidor`, { repartidor: r.value });
      }
      else if (a === 'stripe') { await mostrarLinkStripe(p); return; }
      else if (a === 'cripto') { await mostrarCobroCripto(p); return; }
      else if (a === 'entregar') { await entregar(p); }
      cargar();
    } catch (err) { falla(err); }
  });

  async function mostrarLinkStripe(p) {
    const r = await post(`/api/delivery/${p.id}/cobro-stripe`);
    if (r.estado === 'pagado') { Swal.fire({ icon: 'success', title: 'Ya está pagado' }); cargar(); return; }
    const msg = `Hola ${p.cliente_nombre || ''}, aquí puedes pagar tu pedido ${p.codigo} (${money(p.total)}): ${r.url}`;
    const wa = p.cliente_telefono ? `https://wa.me/${String(p.cliente_telefono).replace(/\D/g, '')}?text=${encodeURIComponent(msg)}` : '';
    await Swal.fire({
      title: `Pago de ${p.codigo}`,
      html: `<div class="fs-4 fw-bold">${money(p.total)}</div><div class="rm-qr my-2"><img src="${r.qr}" alt="QR de pago"></div>
             <div class="small text-muted mb-2">El cliente puede escanear el QR o abrir el enlace.</div>
             <div class="d-flex justify-content-center gap-2 flex-wrap">
               <button type="button" class="btn btn-outline-secondary btn-sm" id="swCopiar"><i class="bi bi-link-45deg"></i> Copiar enlace</button>
               ${wa ? `<a class="btn btn-success btn-sm" target="_blank" rel="noopener" href="${wa}"><i class="bi bi-whatsapp"></i> Enviar por WhatsApp</a>` : ''}
             </div>`,
      confirmButtonText: 'Listo',
      didOpen: () => { document.getElementById('swCopiar').addEventListener('click', async (ev) => { try { await navigator.clipboard.writeText(r.url); ev.currentTarget.innerHTML = '<i class="bi bi-check2"></i> Copiado'; } catch (_) {} }); }
    });
    cargar();
  }

  async function mostrarCobroCripto(p) {
    const r = await post(`/api/delivery/${p.id}/cobro-cripto`);
    if (r.estado === 'pagado') { Swal.fire({ icon: 'success', title: 'Ya está pagado' }); cargar(); return; }
    const msg = `Hola ${p.cliente_nombre || ''}, aquí puedes pagar tu pedido ${p.codigo} (${money(p.total)}) con Bitcoin o Lightning: ${r.url}`;
    const wa = p.cliente_telefono ? `https://wa.me/${String(p.cliente_telefono).replace(/\D/g, '')}?text=${encodeURIComponent(msg)}` : '';
    await Swal.fire({
      title: `Pago cripto de ${p.codigo}`,
      html: `<div class="fs-4 fw-bold">${money(p.total)}</div>${r.monto_btc ? `<div class="small text-muted">≈ ${String(r.monto_btc).replace(/[<>&]/g, '')} BTC</div>` : ''}
             <div class="rm-qr my-2"><img src="${r.qr}" alt="QR de pago"></div>
             <div class="small text-muted mb-2">El cliente escanea el QR o abre el enlace y paga con su billetera (Bitcoin o Lightning).</div>
             <div class="d-flex justify-content-center gap-2 flex-wrap">
               <button type="button" class="btn btn-outline-secondary btn-sm" id="swCopiar"><i class="bi bi-link-45deg"></i> Copiar enlace</button>
               ${wa ? `<a class="btn btn-success btn-sm" target="_blank" rel="noopener" href="${wa}"><i class="bi bi-whatsapp"></i> Enviar por WhatsApp</a>` : ''}
             </div>`,
      confirmButtonText: 'Listo',
      didOpen: () => { document.getElementById('swCopiar').addEventListener('click', async (ev) => { try { await navigator.clipboard.writeText(r.url); ev.currentTarget.innerHTML = '<i class="bi bi-check2"></i> Copiado'; } catch (_) {} }); }
    });
    cargar();
  }

  async function entregar(p) {
    let pagos;
    if (!p.metodo_pago_previsto) {
      const r = await Swal.fire({
        title: `Cobrar ${money(p.total)}`, input: 'radio',
        inputOptions: { efectivo: 'Efectivo', tarjeta: 'Tarjeta (datáfono)', transferencia: 'Transferencia' }, inputValue: 'efectivo',
        showCancelButton: true, confirmButtonText: 'Cobrar y entregar', cancelButtonText: 'Cancelar'
      });
      if (!r.isConfirmed) return;
      pagos = [{ metodo: r.value, monto: p.total }];
    } else if (p.metodo_pago_previsto === 'efectivo') {
      const ok = await Swal.fire({ icon: 'question', title: `¿Recibiste ${money(p.total)} en efectivo?`, showCancelButton: true, confirmButtonText: 'Sí, entregar y facturar', cancelButtonText: 'Cancelar' });
      if (!ok.isConfirmed) return;
    }
    const res = await post(`/api/delivery/${p.id}/entregar`, { pagos });
    await Swal.fire({ icon: 'success', title: 'Entregado y facturado', text: `Factura #${res.factura_id}`, timer: 1500, showConfirmButton: false });
  }

  // ----- Nuevo pedido -----
  function tipoActual() { return document.querySelector('input[name="tipo"]:checked').value; }
  function costoEnvio() {
    if (tipoActual() !== 'delivery') return 0;
    const o = $('pZona').selectedOptions[0];
    return o && o.dataset.costo ? Number(o.dataset.costo) : 0;
  }
  function renderLineas() {
    const sub = lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
    const envio = costoEnvio();
    $('pSub').textContent = money(sub);
    $('pEnvio').textContent = money(envio);
    $('pTotal').textContent = money(sub + envio);
    $('pLineas').innerHTML = lineas.length ? lineas.map((l, i) => `
      <div class="border rounded-3 p-2" data-i="${i}">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <b>${esc(l.nombre)}</b>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-q="-1">−</button><span class="num" style="min-width:2ch;text-align:center">${l.cantidad}</span><button type="button" class="btn btn-sm btn-outline-secondary" data-q="1">+</button>
            <span class="num small text-muted" style="min-width:90px">${money(l.precio * l.cantidad)}</span>
            <button type="button" class="btn btn-sm btn-outline-danger" data-q="x" aria-label="Quitar"><i class="bi bi-x-lg"></i></button>
          </div>
        </div>
        <input class="form-control form-control-sm mt-1 l-nota" maxlength="200" placeholder="Nota (sin cebolla…)" value="${esc(l.nota)}">
      </div>`).join('') : '<div class="vacio">Busca y agrega los platos del pedido</div>';
  }
  $('pLineas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const i = Number(b.closest('[data-i]').dataset.i);
    if (b.dataset.q === 'x') lineas.splice(i, 1);
    else { lineas[i].cantidad = Math.max(1, Math.min(50, lineas[i].cantidad + Number(b.dataset.q))); }
    renderLineas();
  });
  $('pLineas').addEventListener('input', (e) => {
    if (!e.target.classList.contains('l-nota')) return;
    lineas[Number(e.target.closest('[data-i]').dataset.i)].nota = e.target.value;
  });

  let tBusq = null;
  $('pBuscar').addEventListener('input', () => {
    clearTimeout(tBusq);
    const q = $('pBuscar').value.trim();
    if (q.length < 2) { $('pRes').classList.add('d-none'); return; }
    tBusq = setTimeout(async () => {
      try {
        const lista = (await api(`/api/productos/buscar?q=${encodeURIComponent(q)}`)).filter((p) => Number(p.precio_unidad) > 0 && p.codigo !== 'ENVIO');
        $('pRes').innerHTML = lista.length ? lista.map((p) => `<button type="button" data-id="${p.id}" data-n="${esc(p.nombre)}" data-p="${Number(p.precio_unidad)}"><span>${esc(p.nombre)}</span><span class="num">${money(p.precio_unidad)}</span></button>`).join('')
          : '<div class="p-2 small text-muted">Sin resultados</div>';
        $('pRes').classList.remove('d-none');
      } catch (_) {}
    }, 200);
  });
  $('pRes').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const id = Number(b.dataset.id);
    const ya = lineas.find((l) => l.producto_id === id);
    if (ya) ya.cantidad = Math.min(50, ya.cantidad + 1);
    else lineas.push({ producto_id: id, nombre: b.dataset.n, precio: Number(b.dataset.p), cantidad: 1, nota: '' });
    $('pBuscar').value = '';
    $('pRes').classList.add('d-none');
    renderLineas();
  });

  function alternarTipo() {
    const d = tipoActual() === 'delivery';
    document.querySelectorAll('.box-delivery').forEach((el) => el.classList.toggle('d-none', !d));
    renderLineas();
  }
  document.querySelectorAll('input[name="tipo"]').forEach((r) => r.addEventListener('change', alternarTipo));
  $('pZona').addEventListener('change', renderLineas);

  $('pTel').addEventListener('blur', async () => {
    const t = $('pTel').value.trim();
    if (t.replace(/\D/g, '').length < 7) return;
    try {
      const c = await api(`/api/delivery/cliente?telefono=${encodeURIComponent(t)}`);
      if (c) {
        if (!$('pNombre').value) $('pNombre').value = c.nombre || '';
        if (!$('pDir').value && c.direccion) $('pDir').value = c.direccion;
      }
    } catch (_) {}
  });

  $('btnNuevo').addEventListener('click', () => {
    $('formPedido').reset();
    $('tDel').checked = true;
    lineas = [];
    alternarTipo();
    modal.show();
  });

  $('formPedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!lineas.length) { Swal.fire({ icon: 'warning', title: 'Agrega al menos un plato' }); return; }
    const btn = $('btnCrear');
    btn.disabled = true;
    try {
      const r = await post('/api/delivery', {
        tipo: tipoActual(), telefono: $('pTel').value, nombre: $('pNombre').value, direccion: $('pDir').value,
        referencia: $('pRef').value, zona_id: $('pZona').value || null, metodo_pago: $('pPago').value, notas: $('pNotas').value,
        confirmar: $('pConfirmar').checked,
        items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, nota: l.nota }))
      });
      modal.hide();
      await Swal.fire({ icon: 'success', title: `Pedido ${r.codigo} creado`, text: `Total ${money(r.total)} · ${r.minutos_estimados} min aprox.`, timer: 1800, showConfirmButton: false });
      cargar();
    } catch (err) { falla(err); }
    finally { btn.disabled = false; }
  });

  alternarTipo();
  cargar();
  setInterval(() => { if (!document.hidden) cargar(); }, 6000);
})();
