// Alertas por demora: colorea la hora de los pedidos según el tiempo que llevan sin atenderse y avisa con sonido.
// Los tiempos vienen de Configuración → Alertas de tiempo (window.RM_ALERTAS, lo escribe views/partials/navbar.ejs).
// Uso: RMTiempo.nivel(fecha, 'cocina'|'confirmar') -> 0 (normal), 1 (amarillo), 2 (rojo)
// Relacionado con: public/js/cocina.js, public/js/delivery.js, public/css/martin.css, services/alertas.js
window.RMTiempo = (function () {
  const cfg = Object.assign({ amarilla: 10, roja: 20, confirmar: 5, sonido: true }, window.RM_ALERTAS || {});

  // Hoja de estilos propia: así funciona en cualquier pantalla
  if (!document.querySelector('link[data-rm-alertas]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/css/alertas.css'; l.setAttribute('data-rm-alertas', '1'); document.head.appendChild(l);
  }

  function minutos(fecha) {
    const t = fecha instanceof Date ? fecha.getTime() : new Date(fecha).getTime();
    return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 60000) : 0;
  }

  /** tipo 'cocina': amarillo/rojo según los minutos configurados. 'confirmar': rojo a N min, amarillo a la mitad. */
  function nivel(fecha, tipo) {
    if (!fecha) return 0;
    const m = minutos(fecha);
    const rojo = tipo === 'confirmar' ? cfg.confirmar : cfg.roja;
    const amarillo = tipo === 'confirmar' ? Math.max(1, cfg.confirmar / 2) : cfg.amarilla;
    return m >= rojo ? 2 : m >= amarillo ? 1 : 0;
  }
  const claseTiempo = (n) => (n === 2 ? 't-tarde' : n === 1 ? 't-lento' : '');
  const claseTarjeta = (n) => (n === 2 ? 'demora-2' : n === 1 ? 'demora-1' : '');
  const icono = (n) => (n === 2 ? '<i class="bi bi-exclamation-octagon-fill ms-1"></i>' : n === 1 ? '<i class="bi bi-exclamation-triangle-fill ms-1"></i>' : '');

  // ---- sonido (WebAudio; solo suena si el navegador ya permitió audio tras un toque del usuario)
  let ctx = null;
  const desbloquear = () => {
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (_) { /* sin audio */ }
  };
  ['click', 'touchstart', 'keydown'].forEach((e) => document.addEventListener(e, desbloquear, { once: false, passive: true }));
  function pitar() {
    if (!cfg.sonido || !ctx || ctx.state !== 'running') return;
    try {
      [0, 0.25].forEach((delay, i) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'square'; o.frequency.value = i ? 660 : 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.2);
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.22);
      });
    } catch (_) { /* sin audio */ }
  }

  // ---- resumen flotante: "N con demora" y sonido cuando aparece uno nuevo en rojo
  let conocidos = new Set();
  let primera = true;
  function resumen(rojos, amarillos) {
    let el = document.getElementById('rmDemoras');
    if (!rojos.size && !amarillos) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'rmDemoras';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.className = rojos.size ? 'rm-demoras rojo' : 'rm-demoras amarillo';
    el.innerHTML = rojos.size
      ? `<i class="bi bi-alarm-fill me-1"></i>${rojos.size} pedido${rojos.size > 1 ? 's' : ''} con demora${amarillos ? ` · ${amarillos} por demorarse` : ''}`
      : `<i class="bi bi-alarm me-1"></i>${amarillos} pedido${amarillos > 1 ? 's' : ''} por demorarse`;
  }
  /** Se llama en cada refresco con las claves de los pedidos en rojo (Set) y la cantidad en amarillo. */
  function notificar(rojos, amarillos) {
    resumen(rojos, amarillos || 0);
    let nuevo = false;
    rojos.forEach((k) => { if (!conocidos.has(k)) nuevo = true; });
    conocidos = new Set(rojos);
    if (nuevo && !primera) pitar();
    primera = false;
  }

  /** Aviso alegre (dos notas subiendo) para "plato listo"; distinto del pitido de demora. */
  function campana() {
    if (!ctx || ctx.state !== 'running') return;
    try {
      [[0, 660], [0.18, 990]].forEach(([delay, f]) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + delay + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.35);
        o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.4);
      });
    } catch (_) { /* sin audio */ }
  }

  return { cfg, nivel, claseTiempo, claseTarjeta, icono, notificar, campana };
})();
