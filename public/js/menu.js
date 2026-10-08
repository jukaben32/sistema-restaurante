// Menú digital por QR (lado del cliente)
// Relacionado con: views/menu.ejs, routes/menu.js (/api/menu/:token/*)
(function () {
  const { token, moneda } = window.MENU;
  const KEY = `rm-carrito-${token}`;
  const carrito = new Map(); // id -> { id, nombre, precio, cantidad, nota }

  const fmt = (n) => {
    try {
      return new Intl.NumberFormat('es', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(Number(n || 0));
    } catch (_) {
      return `${moneda} ${Number(n || 0).toFixed(2)}`;
    }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  document.querySelectorAll('[data-money]').forEach((el) => { el.textContent = fmt(el.dataset.money); });

  // ---- Persistencia ligera (si el cliente recarga la página no pierde su carrito) ----
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    saved.forEach((it) => { if (document.querySelector(`.m-item[data-id="${it.id}"] .m-ctl`)) carrito.set(String(it.id), it); });
  } catch (_) { /* almacenamiento no disponible */ }
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify([...carrito.values()])); } catch (_) {} };

  // ---- Controles +/- en cada producto ----
  function renderControl(id) {
    const art = document.querySelector(`.m-item[data-id="${id}"]`);
    const ctl = art && art.querySelector('.m-ctl');
    if (!ctl) return;
    const it = carrito.get(String(id));
    if (!it) {
      ctl.innerHTML = `<button class="m-add" type="button" aria-label="Agregar ${esc(art.dataset.nombre)}"><i class="bi bi-plus-lg"></i></button>`;
    } else {
      ctl.innerHTML = `<div class="m-qty"><button type="button" data-d="-1" aria-label="Quitar uno">−</button><span>${it.cantidad}</span><button type="button" data-d="1" aria-label="Agregar uno">+</button></div>`;
    }
  }

  function cambiar(id, delta) {
    const art = document.querySelector(`.m-item[data-id="${id}"]`);
    if (!art) return;
    const k = String(id);
    const it = carrito.get(k) || { id: Number(id), nombre: art.dataset.nombre, precio: Number(art.dataset.precio), cantidad: 0, nota: '' };
    it.cantidad = Math.min(20, it.cantidad + delta);
    if (it.cantidad <= 0) carrito.delete(k); else carrito.set(k, it);
    renderControl(id);
    actualizarBarra();
    guardar();
  }

  document.querySelector('main').addEventListener('click', (e) => {
    const art = e.target.closest('.m-item');
    if (!art || art.classList.contains('agotado')) return;
    if (e.target.closest('.m-add')) return cambiar(art.dataset.id, 1);
    const b = e.target.closest('[data-d]');
    if (b) cambiar(art.dataset.id, Number(b.dataset.d));
  });

  function totales() {
    let cant = 0, total = 0;
    carrito.forEach((it) => { cant += it.cantidad; total += it.cantidad * it.precio; });
    return { cant, total };
  }

  function actualizarBarra() {
    const { cant, total } = totales();
    document.getElementById('barCarrito').classList.toggle('d-none', cant === 0);
    document.getElementById('barCant').textContent = cant;
    document.getElementById('barTotal').textContent = fmt(total);
  }

  // ---- Carrito (offcanvas) ----
  const lista = document.getElementById('carritoLista');
  function renderCarrito() {
    const { total } = totales();
    document.getElementById('carritoTotal').textContent = fmt(total);
    if (carrito.size === 0) {
      lista.innerHTML = '<div class="rm-empty py-3"><i class="bi bi-bag"></i>Tu pedido está vacío</div>';
      return;
    }
    lista.innerHTML = [...carrito.values()].map((it) => `
      <div class="border rounded-3 p-2" data-id="${it.id}">
        <div class="d-flex justify-content-between align-items-center gap-2">
          <div class="fw-semibold">${esc(it.nombre)}</div>
          <div class="m-qty flex-none"><button type="button" data-d="-1" aria-label="Quitar uno">−</button><span>${it.cantidad}</span><button type="button" data-d="1" aria-label="Agregar uno">+</button></div>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-1 gap-2">
          <input class="form-control form-control-sm c-nota" maxlength="200" placeholder="Nota (sin cebolla, término medio…)" value="${esc(it.nota)}">
          <span class="num small text-muted text-nowrap">${fmt(it.cantidad * it.precio)}</span>
        </div>
      </div>`).join('');
  }
  lista.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    const b = e.target.closest('[data-d]');
    if (row && b) { cambiar(row.dataset.id, Number(b.dataset.d)); renderCarrito(); }
  });
  lista.addEventListener('input', (e) => {
    if (!e.target.classList.contains('c-nota')) return;
    const row = e.target.closest('[data-id]');
    const it = carrito.get(String(row.dataset.id));
    if (it) { it.nota = e.target.value; guardar(); }
  });
  document.getElementById('carrito').addEventListener('show.bs.offcanvas', renderCarrito);

  document.getElementById('btnEnviar').addEventListener('click', async () => {
    if (carrito.size === 0) return;
    const btn = document.getElementById('btnEnviar');
    btn.disabled = true;
    try {
      const resp = await fetch(`/api/menu/${token}/pedido`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          nombre: document.getElementById('nombreCliente').value,
          items: [...carrito.values()].map((it) => ({ producto_id: it.id, cantidad: it.cantidad, nota: it.nota }))
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'No se pudo enviar el pedido');
      carrito.clear();
      guardar();
      document.querySelectorAll('.m-item').forEach((a) => renderControl(a.dataset.id));
      actualizarBarra();
      bootstrap.Offcanvas.getInstance(document.getElementById('carrito'))?.hide();
      await Swal.fire({ icon: 'success', title: '¡Pedido enviado!', text: 'Un mesero lo confirmará en un momento.', confirmButtonColor: '#c2410c' });
      cargarEstado();
    } catch (err) {
      Swal.fire({ icon: 'error', title: err.message, confirmButtonColor: '#c2410c' });
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Llamar mesero / pedir la cuenta ----
  async function avisar(tipo, extra = {}) {
    const resp = await fetch(`/api/menu/${token}/alerta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ tipo, ...extra })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'No se pudo avisar');
  }
  document.getElementById('btnLlamar').addEventListener('click', async () => {
    try {
      await avisar('llamar_mesero');
      Swal.fire({ icon: 'success', title: 'Avisamos a tu mesero', text: 'En breve se acerca a tu mesa.', confirmButtonColor: '#c2410c' });
    } catch (err) { Swal.fire({ icon: 'info', title: err.message, confirmButtonColor: '#c2410c' }); }
  });
  document.getElementById('btnCuenta').addEventListener('click', async () => {
    const r = await Swal.fire({
      title: '¿Cómo deseas pagar?',
      input: 'radio',
      inputOptions: { efectivo: 'Efectivo', tarjeta: 'Tarjeta', 'tarjeta en línea (QR)': 'Pago en línea con mi celular' },
      inputValue: 'tarjeta',
      showCancelButton: true,
      confirmButtonText: 'Pedir la cuenta',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#c2410c'
    });
    if (!r.isConfirmed) return;
    try {
      await avisar('pedir_cuenta', { metodo: r.value });
      Swal.fire({ icon: 'success', title: 'Cuenta solicitada', text: 'Te la llevamos enseguida.', confirmButtonColor: '#c2410c' });
    } catch (err) { Swal.fire({ icon: 'info', title: err.message, confirmButtonColor: '#c2410c' }); }
  });

  // ---- Estado del pedido de la mesa (en vivo) ----
  const ESTADOS = {
    pendiente: ['Por confirmar', 'warn'], enviado: ['En cocina', 'accent'], preparando: ['Preparando', 'accent'],
    listo: ['¡Listo!', 'ok'], servido: ['Servido', '']
  };
  async function cargarEstado() {
    try {
      const resp = await fetch(`/api/menu/${token}/pedido`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json();
      const sec = document.getElementById('miPedido');
      sec.classList.toggle('d-none', !data.items || data.items.length === 0);
      document.getElementById('miPedidoTotal').textContent = fmt(data.total);
      document.getElementById('miPedidoLista').innerHTML = (data.items || []).map((it) => {
        const [txt, cls] = ESTADOS[it.estado] || [it.estado, ''];
        return `<li><span>${Number(it.cantidad)}× ${esc(it.nombre)}</span><span class="rm-chip ${cls}">${esc(txt)}</span></li>`;
      }).join('');
    } catch (_) { /* sin conexión: reintenta luego */ }
  }
  cargarEstado();
  setInterval(() => { if (!document.hidden) cargarEstado(); }, 10000);

  // ---- Pestañas de categoría: resaltar la visible ----
  const tabs = [...document.querySelectorAll('.m-tab')];
  if (tabs.length && 'IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const i = en.target.dataset.catIndex;
        tabs.forEach((t) => t.classList.toggle('active', t.getAttribute('href') === `#cat-${i}`));
        const act = tabs.find((t) => t.classList.contains('active'));
        if (act) act.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('[data-cat-index]').forEach((s) => obs.observe(s));
  }

  document.querySelectorAll('.m-item').forEach((a) => { if (carrito.has(String(a.dataset.id))) renderControl(a.dataset.id); });
  actualizarBarra();
})();
