// Dashboard en vivo (administrador)
// Relacionado con: views/dashboard.ejs, routes/dashboard.js (/api/dashboard)
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
  const compact = (n) => {
    const v = Number(n || 0);
    if (v >= 1e6) return `$${(v / 1e6).toLocaleString('es', { maximumFractionDigits: 1 })}M`;
    if (v >= 1e4) return `$${(v / 1e3).toLocaleString('es', { maximumFractionDigits: 0 })}K`;
    return money(v);
  };
  const diaCorto = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es', { weekday: 'short' }).replace('.', '');
  const diaLargo = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' });

  // Delta firmado frente a un periodo nombrado (subir es bueno en ventas)
  function delta(el, actual, previo, etiqueta) {
    if (!previo) { el.className = 'delta flat'; el.textContent = `Sin datos ${etiqueta}`; return; }
    const pct = ((actual - previo) / previo) * 100;
    const r = Math.round(pct);
    el.className = `delta ${r > 0 ? 'up' : r < 0 ? 'down' : 'flat'}`;
    el.innerHTML = `<i class="bi ${r > 0 ? 'bi-arrow-up-right' : r < 0 ? 'bi-arrow-down-right' : 'bi-dash'}"></i> ${r > 0 ? '+' : ''}${r}% ${etiqueta}`;
  }

  function chartSemana(semana) {
    const cont = $('chartSemana');
    const max = Math.max(1, ...semana.map((d) => d.total));
    const hoy = semana[semana.length - 1]?.fecha;
    const pico = semana.reduce((a, d) => (d.total > a.total ? d : a), semana[0] || { total: 0 });
    cont.innerHTML = '';
    const tip = document.createElement('div');
    tip.className = 'rm-tip';
    tip.setAttribute('role', 'tooltip');
    cont.appendChild(tip);
    semana.forEach((d) => {
      const bar = document.createElement('div');
      bar.className = `rm-bar ${d.fecha === hoy ? 'today' : ''}`;
      bar.tabIndex = 0;
      bar.setAttribute('aria-label', `${diaLargo(d.fecha)}: ${money(d.total)}, ${d.facturas} facturas`);
      // Etiqueta directa solo en hoy y en el día pico (no en todas las barras)
      const v = document.createElement('div');
      v.className = 'v';
      v.textContent = (d.fecha === hoy || (d === pico && d.total > 0)) ? compact(d.total) : '';
      const b = document.createElement('div');
      b.className = 'b';
      b.style.height = `${Math.max(1, (d.total / max) * 100)}%`;
      bar.append(v, b);
      const mostrar = () => {
        tip.textContent = '';
        const strong = document.createElement('b');
        strong.textContent = money(d.total);
        const sub = document.createElement('span');
        sub.textContent = `${diaLargo(d.fecha)} · ${d.facturas} factura(s)`;
        tip.append(strong, sub);
        const r = bar.getBoundingClientRect();
        const c = cont.getBoundingClientRect();
        tip.style.left = `${r.left - c.left + r.width / 2}px`;
        tip.style.top = `${b.getBoundingClientRect().top - c.top - 6}px`;
        tip.style.opacity = '1';
      };
      const ocultar = () => { tip.style.opacity = '0'; };
      bar.addEventListener('pointerenter', mostrar);
      bar.addEventListener('pointerleave', ocultar);
      bar.addEventListener('focus', mostrar);
      bar.addEventListener('blur', ocultar);
      cont.appendChild(bar);
    });
    $('ejeSemana').innerHTML = semana.map((d) => `<span>${d.fecha === hoy ? 'Hoy' : diaCorto(d.fecha)}</span>`).join('');
    $('tablaSemana').querySelector('tbody').innerHTML = semana.map((d) =>
      `<tr><td>${esc(diaLargo(d.fecha))}</td><td class="num">${d.facturas}</td><td class="num">${money(d.total)}</td></tr>`).join('');
  }

  function render(d) {
    $('kVentas').textContent = money(d.hoy.ventas);
    delta($('kVentasDelta'), d.hoy.ventas, d.ayer.ventas_a_esta_hora, 'vs. ayer a esta hora');
    $('kFacturas').textContent = d.hoy.facturas.toLocaleString('es');
    delta($('kFacturasDelta'), d.hoy.facturas, d.ayer.facturas, 'vs. ayer');
    $('kTicket').textContent = money(d.hoy.ticket);
    delta($('kTicketDelta'), d.hoy.ticket, d.ayer.ticket, 'vs. ayer');
    $('kStripe').textContent = money(d.stripe_hoy.total);
    $('kStripeN').textContent = `${d.stripe_hoy.cobros} cobro(s) en línea`;

    chartSemana(d.semana);

    const maxTop = Math.max(1, ...d.top.map((t) => t.ingresos));
    $('top').innerHTML = d.top.length ? d.top.map((t) => `
      <li><div class="d-flex justify-content-between gap-2"><span class="text-truncate">${esc(t.nombre)}</span>
        <span class="num small"><b>${money(t.ingresos)}</b> <span class="text-muted">· ${Number(t.cantidad).toLocaleString('es')} und</span></span></div>
        <div class="track"><div class="fill" style="width:${(t.ingresos / maxTop) * 100}%"></div></div></li>`).join('')
      : '<li class="rm-empty border-0">Aún no hay ventas esta semana</li>';

    const m = d.mesas;
    const totalMesas = Object.values(m).reduce((a, b) => a + b, 0);
    $('mesas').innerHTML = totalMesas ? `
      <div class="mini"><span><span class="rm-chip danger"><i class="bi bi-people-fill"></i>Ocupadas</span></span><b class="num">${m.ocupada || 0}</b></div>
      <div class="mini"><span><span class="rm-chip ok"><i class="bi bi-check-circle"></i>Libres</span></span><b class="num">${m.libre || 0}</b></div>
      <div class="mini"><span><span class="rm-chip warn"><i class="bi bi-bookmark"></i>Reservadas</span></span><b class="num">${m.reservada || 0}</b></div>
      <div class="small text-muted mt-2">Ocupación: <b>${Math.round(((m.ocupada || 0) / totalMesas) * 100)}%</b> de ${totalMesas} mesas</div>`
      : '<div class="rm-empty">Sin mesas creadas</div>';
    const chip = $('chipAlertas');
    chip.classList.toggle('d-none', !d.alertas_pendientes);
    chip.innerHTML = `<i class="bi bi-bell-fill"></i>${d.alertas_pendientes} aviso(s)`;

    const c = d.cocina;
    $('cocina').innerHTML = `
      <div class="mini"><span>Por confirmar (mesero)</span><b class="num">${c.pendiente || 0}</b></div>
      <div class="mini"><span>En cola</span><b class="num">${c.enviado || 0}</b></div>
      <div class="mini"><span>Preparando</span><b class="num">${c.preparando || 0}</b></div>
      <div class="mini"><span>Listos para servir</span><b class="num">${c.listo || 0}</b></div>`;

    $('reservas').innerHTML = d.reservas.length ? d.reservas.map((r) => `
      <div class="mini"><span><b class="num">${esc(r.hora)}</b> ${esc(r.nombre)} <span class="text-muted">· ${Number(r.personas)}p${r.mesa_numero ? ` · M${esc(r.mesa_numero)}` : ''}</span></span>
      <span class="rm-chip ${r.estado === 'pendiente' ? 'warn' : r.estado === 'sentada' ? 'accent' : 'ok'}">${r.estado === 'pendiente' ? 'Por confirmar' : r.estado === 'sentada' ? 'En mesa' : 'Confirmada'}</span></div>`).join('')
      : '<div class="rm-empty py-3"><i class="bi bi-calendar2"></i>Sin reservas para hoy</div>';

    $('stock').innerHTML = d.stock_bajo.length ? d.stock_bajo.map((s) => `
      <div class="mini"><span class="text-truncate">${esc(s.nombre)}</span>
      <span class="rm-chip danger"><i class="bi bi-exclamation-triangle"></i>${Number(s.stock).toLocaleString('es', { maximumFractionDigits: 2 })} ${esc(s.unidad)}</span></div>`).join('')
      : '<div class="rm-empty py-3"><i class="bi bi-check2-circle"></i>Todo el inventario en orden</div>';

    const NOMBRE = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta (incluye Stripe)', qr: 'QR' };
    $('metodos').innerHTML = d.metodos.length ? `<div class="row g-3">${d.metodos.map((x) => `
      <div class="col-6 col-md-3"><div class="small text-muted">${NOMBRE[x.metodo] || esc(x.metodo)}</div><div class="fs-5 fw-semibold num text-start">${money(x.total)}</div></div>`).join('')}</div>`
      : '<div class="text-muted small">Aún no hay cobros hoy.</div>';

    $('subtitulo').textContent = `Actualizado ${new Date(d.generado).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} · se refresca cada 30 s`;
  }

  async function cargar() {
    $('refresco').classList.add('cargando');
    try {
      const r = await fetch('/api/dashboard', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      render(d);
    } catch (e) {
      $('subtitulo').textContent = `No se pudo actualizar: ${e.message}`;
    } finally {
      $('refresco').classList.remove('cargando');
    }
  }

  $('toggleTabla').addEventListener('click', () => {
    const t = $('tablaSemana');
    const ver = t.classList.toggle('d-none');
    $('toggleTabla').textContent = ver ? 'Ver tabla' : 'Ocultar tabla';
    $('toggleTabla').setAttribute('aria-expanded', String(!ver));
  });

  cargar();
  setInterval(() => { if (!document.hidden) cargar(); }, 30000);
})();
