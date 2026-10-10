// App para clientes: menú, carrito, pedido (delivery o para recoger), pago en línea y seguimiento.
// Relacionado con: views/pedir.ejs, routes/pedir.js, services/appClientes.js
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = { cliente: 'rm-cliente', pedido: 'rm-pedido-activo' };
  const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* sin almacenamiento */ } };

  let cat = null;
  const carrito = new Map(); // producto_id -> cantidad
  let formaPago = null;
  let carritoOffcanvas = null;

  const money = (n) => {
    const m = cat ? cat.negocio.moneda : 'DOP';
    const simbolo = m === 'DOP' ? 'RD$' : m === 'USD' ? 'US$' : m;
    return `${simbolo} ${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };
  async function api(url, opts) {
    const r = await fetch(url, opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || 'Ocurrió un error. Inténtalo de nuevo.'), { status: r.status });
    return d;
  }
  const alerta = (icon, title, text) => Swal.fire({ icon, title, text, confirmButtonColor: '#c2410c', confirmButtonText: 'Entendido' });

  // ------------------------------------------------------------------ instalación (app instalable)
  let eventoInstalar = null;
  const esStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); eventoInstalar = e; mostrarInstalar(); });
  window.addEventListener('appinstalled', () => { eventoInstalar = null; $('btnInstalar').classList.add('d-none'); });
  function mostrarInstalar() { if (!esStandalone()) $('btnInstalar').classList.remove('d-none'); }
  $('btnInstalar').addEventListener('click', async () => {
    if (eventoInstalar) { eventoInstalar.prompt(); await eventoInstalar.userChoice.catch(() => {}); eventoInstalar = null; $('btnInstalar').classList.add('d-none'); return; }
    Swal.fire({
      title: 'Instala la app', confirmButtonColor: '#c2410c', confirmButtonText: 'Listo',
      html: esIOS()
        ? '<div class="text-start">1. Toca el botón <b>Compartir</b> <i class="bi bi-box-arrow-up"></i> de Safari.<br>2. Elige <b>"Añadir a pantalla de inicio"</b>.<br>3. Toca <b>Añadir</b>.</div>'
        : '<div class="text-start">Abre el menú del navegador (⋮) y elige <b>"Instalar app"</b> o <b>"Añadir a pantalla de inicio"</b>.</div>'
    });
  });
  if (esIOS() && !esStandalone()) mostrarInstalar();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  // ------------------------------------------------------------------ menú
  function totalCarrito() {
    let sub = 0;
    carrito.forEach((c, id) => { const p = cat.productos.find((x) => x.id === id); if (p) sub += p.precio * c; });
    return sub;
  }
  const cantidadCarrito = () => { let n = 0; carrito.forEach((c) => { n += c; }); return n; };

  function tarjetaProducto(p, dia) {
    const c = carrito.get(p.id) || 0;
    const ph = p.imagen ? `<img class="ph" src="/menu/img/${p.id}" alt="${esc(p.nombre)}" loading="lazy">` : '<div class="ph" aria-hidden="true"><i class="bi bi-egg-fried"></i></div>';
    const ctl = !p.disponible ? '<span class="rm-chip">Agotado</span>'
      : c > 0 ? `<div class="c-qty"><button type="button" data-menos="${p.id}" aria-label="Quitar uno">−</button><span>${c}</span><button type="button" data-mas="${p.id}" aria-label="Agregar uno">+</button></div>`
        : `<button class="c-add" type="button" data-mas="${p.id}" aria-label="Agregar ${esc(p.nombre)}"><i class="bi bi-plus-lg"></i></button>`;
    return `<article class="${dia ? 'c-dia-card' : 'c-item'} ${p.disponible ? '' : 'agotado'}" data-prod="${p.id}">${ph}
      <div class="info">${dia ? '<div class="etq">⭐ Plato del día</div>' : ''}<div class="nm">${esc(p.nombre)}</div>
      ${p.descripcion ? `<div class="ds">${esc(p.descripcion)}</div>` : ''}
      <div class="ft"><span class="pr">${money(p.precio)}</span><div data-ctl="${p.id}">${ctl}</div></div></div></article>`;
  }

  function renderMenu() {
    const dias = cat.productos.filter((p) => p.platoDelDia && p.disponible);
    const cats = [];
    const por = {};
    cat.productos.forEach((p) => { if (!por[p.categoria]) { por[p.categoria] = []; cats.push(p.categoria); } por[p.categoria].push(p); });
    // Primero la comida; las bebidas y los postres al final
    const peso = (c) => (/bebida/i.test(c) ? 2 : /postre/i.test(c) ? 1 : 0);
    cats.sort((x, y) => peso(x) - peso(y));
    $('vistaMenu').innerHTML =
      (dias.length ? `<section class="c-dia"><h2>Hoy en ${esc(cat.negocio.nombre)}</h2>${dias.map((p) => tarjetaProducto(p, true)).join('')}</section>` : '') +
      (cats.length > 1 ? `<nav class="c-tabs" aria-label="Categorías"><div class="scroller">${cats.map((c, i) => `<a class="c-tab ${i === 0 ? 'active' : ''}" href="#cat-${i}">${esc(c)}</a>`).join('')}</div></nav>` : '') +
      (cats.length === 0 ? '<div class="rm-empty"><i class="bi bi-journal-x"></i>El menú aún no está disponible.</div>' : '') +
      cats.map((c, i) => `<section class="c-sec" id="cat-${i}"><h2>${esc(c)}</h2>${por[c].map((p) => tarjetaProducto(p, false)).join('')}</section>`).join('');
    actualizarBarra();
  }

  function refrescarControles(id) {
    const p = cat.productos.find((x) => x.id === id);
    document.querySelectorAll(`[data-ctl="${id}"]`).forEach((el) => {
      const c = carrito.get(id) || 0;
      el.innerHTML = c > 0
        ? `<div class="c-qty"><button type="button" data-menos="${id}" aria-label="Quitar uno">−</button><span>${c}</span><button type="button" data-mas="${id}" aria-label="Agregar uno">+</button></div>`
        : `<button class="c-add" type="button" data-mas="${id}" aria-label="Agregar ${esc(p.nombre)}"><i class="bi bi-plus-lg"></i></button>`;
    });
  }
  function cambiar(id, delta) {
    const p = cat.productos.find((x) => x.id === id);
    if (!p || !p.disponible) return;
    const nueva = Math.max(0, Math.min(20, (carrito.get(id) || 0) + delta));
    if (nueva === 0) carrito.delete(id); else carrito.set(id, nueva);
    refrescarControles(id);
    actualizarBarra();
    if ($('carrito').classList.contains('show')) renderCarrito();
  }
  function actualizarBarra() {
    const n = cantidadCarrito();
    $('barCarrito').classList.toggle('d-none', n === 0 || !!window.APP_PEDIR.token);
    $('barCant').textContent = n;
    $('barTotal').textContent = n ? money(totalCarrito()) : '';
  }
  document.addEventListener('click', (e) => {
    const mas = e.target.closest('[data-mas]');
    const menos = e.target.closest('[data-menos]');
    if (mas) cambiar(Number(mas.dataset.mas), 1);
    else if (menos) cambiar(Number(menos.dataset.menos), -1);
    const tab = e.target.closest('.c-tab');
    if (tab) {
      document.querySelectorAll('.c-tab').forEach((t) => t.classList.toggle('active', t === tab));
    }
  });

  // ------------------------------------------------------------------ carrito y envío del pedido
  const tipoActual = () => document.querySelector('input[name="tipo"]:checked').value;
  const zonaActual = () => cat.delivery.zonas.find((z) => String(z.id) === $('cZona').value) || null;

  function costoEnvio() { return tipoActual() === 'delivery' && zonaActual() ? zonaActual().costo_envio : 0; }

  function renderCarrito() {
    const lineas = [...carrito.entries()].map(([id, c]) => ({ p: cat.productos.find((x) => x.id === id), c })).filter((l) => l.p);
    $('carritoLista').innerHTML = lineas.length ? lineas.map(({ p, c }) => `
      <div class="c-linea d-flex align-items-center gap-2">
        <div class="flex-grow-1 min-w-0"><div class="fw-semibold text-truncate">${esc(p.nombre)}</div><div class="small text-muted">${money(p.precio)} c/u</div></div>
        <div class="c-qty"><button type="button" data-menos="${p.id}" aria-label="Quitar uno">−</button><span>${c}</span><button type="button" data-mas="${p.id}" aria-label="Agregar uno">+</button></div>
        <strong class="num" style="min-width:5.5rem;text-align:right">${money(p.precio * c)}</strong>
      </div>`).join('') : '<div class="rm-empty">Tu pedido está vacío</div>';
    if (!lineas.length) { carritoOffcanvas.hide(); return; }
    const esDelivery = tipoActual() === 'delivery';
    $('datosDelivery').classList.toggle('d-none', !esDelivery);
    const sub = totalCarrito();
    const envio = costoEnvio();
    const falta = esDelivery && cat.delivery.pedidoMinimo > 0 && sub < cat.delivery.pedidoMinimo;
    $('resumen').innerHTML = `<div><span>Subtotal</span><span class="num">${money(sub)}</span></div>
      ${esDelivery ? `<div><span>Envío${zonaActual() ? ` · ${esc(zonaActual().nombre)}` : ''}</span><span class="num">${zonaActual() ? money(envio) : '—'}</span></div>` : ''}
      <div class="total"><span>Total</span><span class="num">${money(sub + envio)}</span></div>
      ${falta ? `<div class="text-danger small mt-1" style="display:block">El pedido mínimo para delivery es ${money(cat.delivery.pedidoMinimo)} (sin contar el envío). Agrega ${money(cat.delivery.pedidoMinimo - sub)} más o elige "Para recoger".</div>` : ''}`;
    $('btnEnviar').disabled = !!falta;
    pedirCotizacion(sub, envio, esDelivery, falta);
    const online = formaPago === 'tarjeta' || formaPago === 'cripto';
    $('btnEnviarTxt').textContent = online ? 'Enviar y pagar ahora' : 'Enviar pedido';
    $('notaEnvio').textContent = online
      ? 'Te llevamos a la página de pago segura. Tu pedido se confirma cuando se acredite el pago.'
      : 'Tu pedido llega al restaurante y lo confirmamos enseguida.';
  }

  // El total con ITBIS y propina lo calcula el servidor (con los mismos precios de la base de datos)
  let cotizacionN = 0;
  async function pedirCotizacion(sub, envio, esDelivery, falta) {
    const n = ++cotizacionN;
    if (esDelivery && !zonaActual()) return;
    try {
      const r = await fetch('/api/pedir/cotizar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: tipoActual(), zona_id: zonaActual() ? zonaActual().id : null, items: [...carrito.entries()].map(([id, c]) => ({ producto_id: id, cantidad: c })) }) });
      const q = await r.json();
      if (n !== cotizacionN || !r.ok || !q.fiscal) return; // si la facturación fiscal no está activa, el total del carrito ya es el final
      $('resumen').innerHTML = `<div><span>Subtotal</span><span class="num">${money(q.subtotal)}</span></div>
        ${esDelivery ? `<div><span>Envío${zonaActual() ? ` · ${esc(zonaActual().nombre)}` : ''}</span><span class="num">${money(q.envio)}</span></div>` : ''}
        <div><span>ITBIS</span><span class="num">${money(q.itbis)}</span></div>
        ${q.propina > 0 ? `<div><span>Propina legal ${q.propina_tasa}%</span><span class="num">${money(q.propina)}</span></div>` : ''}
        <div class="total"><span>Total</span><span class="num">${money(q.total)}</span></div>
        ${falta ? `<div class="text-danger small mt-1" style="display:block">El pedido mínimo para delivery es ${money(cat.delivery.pedidoMinimo)} (sin contar el envío). Agrega ${money(cat.delivery.pedidoMinimo - sub)} más o elige "Para recoger".</div>` : ''}`;
      $('barTotal').textContent = money(q.total);
    } catch (_) { /* se queda el total sin impuestos */ }
  }

  function renderFormas() {
    const ant = formaPago;
    if (!cat.formasPago.some((f) => f.id === ant)) formaPago = cat.formasPago[0] ? cat.formasPago[0].id : null;
    $('formasPago').innerHTML = cat.formasPago.map((f) => `<label class="c-pago ${f.id === formaPago ? 'sel' : ''}"><input type="radio" name="pago" value="${f.id}" ${f.id === formaPago ? 'checked' : ''}>
      <span><span class="t d-block">${esc(f.nombre)}</span><span class="d">${esc(f.detalle)}</span></span></label>`).join('');
  }
  $('formasPago').addEventListener('change', (e) => {
    if (e.target.name !== 'pago') return;
    formaPago = e.target.value;
    document.querySelectorAll('.c-pago').forEach((l) => l.classList.toggle('sel', l.querySelector('input').checked));
    renderCarrito();
  });
  $('tipoPedido').addEventListener('change', renderCarrito);
  $('cZona').addEventListener('change', renderCarrito);

  function abrirCarrito() {
    const g = leer(LS.cliente) || {};
    if (!$('cNombre').value) $('cNombre').value = g.nombre || '';
    if (!$('cTelefono').value) $('cTelefono').value = g.telefono || '';
    if (!$('cDireccion').value) $('cDireccion').value = g.direccion || '';
    if (!$('cReferencia').value) $('cReferencia').value = g.referencia || '';
    if (g.zona && cat.delivery.zonas.some((z) => String(z.id) === String(g.zona))) $('cZona').value = String(g.zona);
    renderCarrito();
    carritoOffcanvas.show();
  }
  $('btnVerCarrito').addEventListener('click', abrirCarrito);

  $('btnEnviar').addEventListener('click', async () => {
    const delivery = tipoActual() === 'delivery';
    const cuerpo = {
      tipo: tipoActual(), nombre: $('cNombre').value.trim(), telefono: $('cTelefono').value.trim(),
      direccion: $('cDireccion').value.trim(), referencia: $('cReferencia').value.trim(), zonaId: delivery ? $('cZona').value : null,
      notas: $('cNotas').value.trim(), metodoPago: formaPago,
      items: [...carrito.entries()].map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
    };
    if (cuerpo.nombre.length < 2) return alerta('info', 'Falta tu nombre');
    if (cuerpo.telefono.replace(/\D/g, '').length < 10) return alerta('info', 'Revisa tu teléfono', 'Escríbelo con código de área, por ejemplo 809 555 0100.');
    if (delivery && !cuerpo.zonaId) return alerta('info', 'Elige la zona de entrega');
    if (delivery && cuerpo.direccion.length < 5) return alerta('info', 'Falta la dirección de entrega');
    if (!formaPago) return alerta('info', 'Elige cómo vas a pagar');

    $('btnEnviar').disabled = true;
    try {
      const r = await api('/api/pedir/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(cuerpo) });
      guardar(LS.cliente, { nombre: cuerpo.nombre, telefono: cuerpo.telefono, direccion: cuerpo.direccion, referencia: cuerpo.referencia, zona: cuerpo.zonaId });
      guardar(LS.pedido, { token: r.token, t: Date.now() });
      carrito.clear();
      if (r.pago && r.pago.url) { location.href = r.pago.url; return; } // Stripe o BTCPay: página de pago segura
      location.href = `/pedir/pedido/${r.token}`;
    } catch (e) {
      $('btnEnviar').disabled = false;
      alerta('warning', 'No se pudo enviar el pedido', e.message);
    }
  });

  // ------------------------------------------------------------------ seguimiento del pedido
  const PASOS_DELIVERY = [['recibido', 'Pedido recibido'], ['preparando', 'Preparando tu pedido'], ['listo', 'Listo'], ['en_camino', 'En camino'], ['entregado', 'Entregado']];
  const PASOS_LLEVAR = [['recibido', 'Pedido recibido'], ['preparando', 'Preparando tu pedido'], ['listo', 'Listo para recoger'], ['entregado', 'Entregado']];
  let timer = null;

  function pintarSeguimiento(s) {
    const pasos = s.tipo === 'delivery' ? PASOS_DELIVERY : PASOS_LLEVAR;
    const fase = s.fase === 'esperando_pago' ? 'recibido' : s.fase;
    const idx = pasos.findIndex((p) => p[0] === fase);
    const titulos = {
      esperando_pago: 'Esperando tu pago', recibido: 'Recibimos tu pedido', preparando: 'Estamos preparando tu pedido', listo: s.tipo === 'delivery' ? 'Tu pedido está listo' : 'Tu pedido está listo para recoger',
      en_camino: 'Tu pedido va en camino', entregado: '¡Buen provecho!', cancelado: 'Pedido cancelado'
    };
    const params = new URLSearchParams(location.search);
    const verificando = params.get('pago') === 'ok' && s.fase === 'esperando_pago' && !s.pago.pagado;
    let pagoHtml = '';
    if (s.fase !== 'cancelado' && s.fase !== 'entregado') {
      if (s.pago.pagado) pagoHtml = '<div class="c-aviso info mx-0"><i class="bi bi-check-circle-fill me-1"></i>Pago recibido. ¡Gracias!</div>';
      else if (verificando || s.pago.procesando) pagoHtml = '<div class="c-aviso info mx-0"><span class="spinner-border spinner-border-sm me-2"></span>Estamos verificando tu pago…</div>';
      else if (s.pago.url) pagoHtml = `<div class="c-aviso warn mx-0">Tu pedido empieza a prepararse cuando recibamos el pago. Tienes aproximadamente 1 hora.</div><a class="btn btn-rm w-100 py-3 fw-bold mb-2" href="${esc(s.pago.url)}"><i class="bi bi-lock-fill me-1"></i>Pagar ahora</a>`;
      else if (s.pago.vencido) pagoHtml = '<div class="c-aviso warn mx-0">El enlace de pago venció. Haz un nuevo pedido o llámanos.</div>';
      else if (s.pago.metodo === 'transferencia' && s.pago.datosTransferencia) pagoHtml = `<div class="c-aviso info mx-0"><strong>Datos para tu transferencia (${money(s.total)}):</strong><div style="white-space:pre-line" class="mt-1">${esc(s.pago.datosTransferencia)}</div><div class="mt-1">Envía la foto del comprobante por WhatsApp${s.negocio.telefono ? ` al ${esc(s.negocio.telefono)}` : ''} con tu código <strong>${esc(s.codigo)}</strong>.</div></div>`;
      else if (s.pago.metodo === 'efectivo') pagoHtml = `<div class="c-aviso info mx-0"><i class="bi bi-cash-coin me-1"></i>Pagas en efectivo ${s.tipo === 'delivery' ? 'al recibir' : 'al recoger'}: ${money(s.total)}.</div>`;
    }
    $('vistaPedido').innerHTML = `<div class="p-3">
      <div class="text-muted small">Pedido ${esc(s.codigo)}</div>
      <div class="c-grande">${esc(titulos[s.fase] || '')}</div>
      ${s.fase === 'cancelado' ? '<p class="text-muted mt-2">Si tienes dudas, escríbenos o llámanos.</p>' : `<ul class="c-pasos">${pasos.map((p, i) => `<li class="${i < idx || fase === 'entregado' ? 'hecho' : i === idx ? 'actual' : ''}"><span class="pt">${i < idx || fase === 'entregado' ? '<i class="bi bi-check-lg"></i>' : i + 1}</span>${esc(p[1])}</li>`).join('')}</ul>`}
      ${pagoHtml}
      <div class="rm-card p-3 mt-3">
        ${s.items.map((i) => `<div class="d-flex justify-content-between small py-1"><span>${i.cantidad}× ${esc(i.nombre)}</span><span class="num">${money(i.subtotal)}</span></div>`).join('')}
        ${s.envio > 0 ? `<div class="d-flex justify-content-between small py-1"><span>Envío</span><span class="num">${money(s.envio)}</span></div>` : ''}
        <div class="d-flex justify-content-between fw-bold border-top pt-2 mt-1"><span>Total</span><span class="num">${money(s.total)}</span></div>
        ${s.direccion ? `<div class="small text-muted mt-2"><i class="bi bi-geo-alt me-1"></i>${esc(s.direccion)}</div>` : ''}
      </div>
      <div class="d-grid gap-2 mt-3">
        ${s.negocio.telefono ? `<a class="btn btn-outline-secondary" href="tel:${esc(s.negocio.telefono)}"><i class="bi bi-telephone me-1"></i>Llamar al restaurante</a>` : ''}
        ${s.puedeCancelar ? '<button class="btn btn-outline-danger" id="btnCancelarPedido" type="button">Cancelar pedido</button>' : ''}
        <a class="btn btn-rm" href="/pedir">${['entregado', 'cancelado'].includes(s.fase) ? 'Hacer otro pedido' : 'Volver al menú'}</a>
      </div></div>`;
    const bc = $('btnCancelarPedido');
    if (bc) bc.addEventListener('click', async () => {
      const ok = await Swal.fire({ icon: 'question', title: '¿Cancelar tu pedido?', showCancelButton: true, confirmButtonText: 'Sí, cancelar', cancelButtonText: 'No', confirmButtonColor: '#b91c1c' });
      if (!ok.isConfirmed) return;
      try { await api(`/api/pedir/pedido/${window.APP_PEDIR.token}/cancelar`, { method: 'POST' }); cargarSeguimiento(); } catch (e) { alerta('warning', 'No se pudo cancelar', e.message); }
    });
    if (['entregado', 'cancelado'].includes(s.fase)) { clearInterval(timer); try { localStorage.removeItem(LS.pedido); } catch (_) { /* noop */ } }
  }

  async function cargarSeguimiento() {
    try {
      const s = await api(`/api/pedir/pedido/${window.APP_PEDIR.token}`, { cache: 'no-store' });
      pintarSeguimiento(s);
    } catch (e) {
      $('vistaPedido').innerHTML = `<div class="p-4 text-center"><div class="rm-empty"><i class="bi bi-search"></i>No encontramos ese pedido.</div><a class="btn btn-rm" href="/pedir">Ir al menú</a></div>`;
      clearInterval(timer);
    }
  }

  // ------------------------------------------------------------------ arranque
  function avisos() {
    let html = '';
    if (!cat.activa) html += '<div class="c-aviso warn">Por ahora no estamos recibiendo pedidos por la app. Llámanos o escríbenos por WhatsApp.</div>';
    else if (cat.abierto === false) html += `<div class="c-aviso warn">Ahora mismo estamos cerrados${cat.horarioHoy ? ` (horario de hoy: ${esc(cat.horarioHoy)})` : ''}. Puedes ver el menú; los pedidos se reciben cuando abrimos.</div>`;
    const prev = leer(LS.pedido);
    if (prev && prev.token && Date.now() - prev.t < 12 * 3600 * 1000 && !window.APP_PEDIR.token) {
      html += `<div class="c-aviso info"><i class="bi bi-receipt me-1"></i>Tienes un pedido en curso. <a href="/pedir/pedido/${esc(prev.token)}">Ver mi pedido</a></div>`;
    }
    $('avisos').innerHTML = html;
  }

  async function iniciar() {
    carritoOffcanvas = new bootstrap.Offcanvas($('carrito'));
    try {
      cat = await api('/api/pedir/catalogo');
    } catch (e) {
      $('vistaMenu').innerHTML = '<div class="rm-empty"><i class="bi bi-wifi-off"></i>No pudimos cargar el menú. Revisa tu conexión e inténtalo de nuevo.</div>';
      $('estadoTxt').textContent = 'Sin conexión';
      return;
    }
    const abierto = cat.activa && cat.abierto !== false;
    $('estadoAbierto').className = `c-estado ${abierto ? 'abierto' : 'cerrado'}`;
    $('estadoTxt').textContent = !cat.activa ? 'Pedidos pausados' : cat.abierto === false ? 'Cerrado ahora' : cat.abierto === true ? `Abierto${cat.horarioHoy ? ` · ${cat.horarioHoy}` : ''}` : 'Pide aquí';
    avisos();
    $('cZona').innerHTML = cat.delivery.zonas.length
      ? '<option value="">Elige tu zona…</option>' + cat.delivery.zonas.map((z) => `<option value="${z.id}">${esc(z.nombre)} — envío ${money(z.costo_envio)} (~${z.minutos_estimados} min)</option>`).join('')
      : '<option value="">Sin zonas configuradas</option>';
    if (!cat.delivery.activo) { $('tipoDelivery').disabled = true; $('tipoLlevar').checked = true; }
    renderFormas();
    if (window.APP_PEDIR.token) {
      $('vistaMenu').classList.add('d-none');
      $('vistaPedido').classList.remove('d-none');
      $('barCarrito').classList.add('d-none');
      await cargarSeguimiento();
      timer = setInterval(cargarSeguimiento, 5000);
    } else {
      renderMenu();
    }
  }
  iniciar();
})();
