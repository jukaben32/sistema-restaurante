// Avisos en vivo del menú QR (llamar mesero, pedir cuenta, pedido nuevo) para el personal.
// Relacionado con: routes/menu.js (/api/mesa-alertas), views/mesas.ejs, views/dashboard.ejs
(function () {
  const cont = document.createElement('div');
  cont.className = 'rm-alerts';
  cont.setAttribute('aria-live', 'polite');
  document.body.appendChild(cont);

  // Los avisos se apilan compactos: se ven los más recientes y el resto queda tras "+N avisos más"
  let expandido = false;
  const mas = document.createElement('button');
  mas.type = 'button';
  mas.className = 'rm-alerts-mas d-none';
  mas.addEventListener('click', () => { expandido = !expandido; ordenar(); });
  function ordenar() {
    const lista = [...cont.querySelectorAll('[data-alerta]')];
    const visibles = window.matchMedia('(max-width: 576px)').matches ? 1 : 2;
    lista.forEach((el, i) => el.classList.toggle('d-none', !expandido && i >= visibles));
    const ocultos = lista.length - visibles;
    mas.classList.toggle('d-none', ocultos <= 0);
    mas.textContent = expandido ? 'Ver menos' : `+${ocultos} aviso${ocultos > 1 ? 's' : ''} más`;
    cont.appendChild(mas);
  }

  const vistos = new Set();
  let primeraCarga = true;
  const TIPOS = {
    llamar_mesero: { icon: 'bi-bell-fill', txt: 'llama al mesero' },
    pedir_cuenta: { icon: 'bi-receipt', txt: 'pide la cuenta' },
    nuevo_pedido: { icon: 'bi-bag-check-fill', txt: 'hizo un pedido desde el menú' },
    pedido_delivery: { icon: 'bi-bicycle', txt: 'nuevo pedido por confirmar' },
    pago_recibido: { icon: 'bi-credit-card-2-front', txt: 'pago confirmado' },
    comprobante: { icon: 'bi-bank', txt: 'envió un comprobante de transferencia' },
    handoff: { icon: 'bi-headset', txt: 'pide hablar con una persona' },
    reserva_nueva: { icon: 'bi-calendar-heart', txt: 'nueva reserva por confirmar' }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    } catch (_) { /* el navegador puede bloquear audio hasta que el usuario interactúe */ }
    try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (_) {}
  }

  function hace(ts) {
    const min = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
    return min < 1 ? 'ahora' : `hace ${min} min`;
  }

  function render(alertas) {
    const ids = new Set(alertas.map((a) => a.id));
    cont.querySelectorAll('[data-alerta]').forEach((el) => { if (!ids.has(Number(el.dataset.alerta))) el.remove(); });
    let nuevos = 0;
    alertas.forEach((a) => {
      let el = cont.querySelector(`[data-alerta="${a.id}"]`);
      const t = TIPOS[a.tipo] || { icon: 'bi-info-circle', txt: a.tipo };
      if (!el) {
        el = document.createElement('div');
        el.className = 'rm-alert';
        el.dataset.alerta = a.id;
        cont.appendChild(el);
        if (!vistos.has(a.id)) { vistos.add(a.id); nuevos++; }
      }
      el.innerHTML = `
        <div class="ic"><i class="bi ${t.icon}"></i></div>
        <div class="tx"><b>${a.es_pedido ? esc(a.mesa_numero) : (a.mesa_numero ? `Mesa ${esc(a.mesa_numero)}` : 'Aviso')}</b> ${t.txt}
          ${a.mensaje ? `<small>${esc(a.mensaje)}</small>` : ''}<small>${hace(a.created_at)}</small></div>
        ${a.es_pedido && !/\/delivery$/.test(location.pathname) ? '<a class="btn btn-sm btn-outline-light" href="/delivery">Ver</a>' : ''}
        <button class="btn btn-sm btn-light" data-atender="${a.id}">Atender</button>`;
    });
    ordenar();
    if (nuevos > 0 && !primeraCarga) beep();
    primeraCarga = false;
  }

  async function cargar() {
    try {
      const r = await fetch('/api/mesa-alertas', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (r.ok) render(await r.json());
    } catch (_) { /* reintenta */ }
  }

  cont.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-atender]');
    if (!b) return;
    b.disabled = true;
    await fetch(`/api/mesa-alertas/${b.dataset.atender}/atender`, { method: 'POST', headers: { Accept: 'application/json' } }).catch(() => {});
    b.closest('[data-alerta]')?.remove();
    ordenar();
    // Refresca el panel de mesas si existe (pedido nuevo desde el menú)
    if (typeof window.refreshMesas === 'function') window.refreshMesas();
  });

  cargar();
  setInterval(() => { if (!document.hidden) cargar(); }, 5000);
})();
