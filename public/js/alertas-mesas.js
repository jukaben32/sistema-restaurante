// Avisos en vivo del menú QR (llamar mesero, pedir cuenta, pedido nuevo) para el personal.
// Relacionado con: routes/menu.js (/api/mesa-alertas), views/mesas.ejs, views/dashboard.ejs
(function () {
  const cont = document.createElement('div');
  cont.className = 'rm-alerts';
  cont.setAttribute('aria-live', 'polite');
  document.body.appendChild(cont);

  const vistos = new Set();
  let primeraCarga = true;
  const TIPOS = {
    llamar_mesero: { icon: 'bi-bell-fill', txt: 'llama al mesero' },
    pedir_cuenta: { icon: 'bi-receipt', txt: 'pide la cuenta' },
    nuevo_pedido: { icon: 'bi-bag-check-fill', txt: 'hizo un pedido desde el menú' }
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
        <div class="tx"><b>Mesa ${esc(a.mesa_numero)}</b> ${t.txt}
          ${a.mensaje ? `<small>${esc(a.mensaje)}</small>` : ''}<small>${hace(a.created_at)}</small></div>
        <button class="btn btn-sm btn-light" data-atender="${a.id}">Atender</button>`;
    });
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
    // Refresca el panel de mesas si existe (pedido nuevo desde el menú)
    if (typeof window.refreshMesas === 'function') window.refreshMesas();
  });

  cargar();
  setInterval(() => { if (!document.hidden) cargar(); }, 5000);
})();
