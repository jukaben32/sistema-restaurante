// Aviso para el administrador cuando hay datos de demostración cargados, con el botón para quitarlos.
// Relacionado con: routes/demo.js, services/datosDemo.js
(function () {
  const CLAVE = 'rm-demo-estado';
  function leerCache() {
    try { const c = JSON.parse(sessionStorage.getItem(CLAVE) || 'null'); if (c && Date.now() - c.t < 5 * 60 * 1000) return c.v; } catch (_) { /* sin caché */ }
    return null;
  }
  function guardarCache(v) { try { sessionStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), v })); } catch (_) { /* sin caché */ } }

  async function quitar() {
    let ok = false;
    if (window.Swal) {
      const r = await Swal.fire({
        icon: 'warning', title: '¿Quitar los datos de demostración?',
        html: 'Se borran los <b>productos, clientes, ventas, reservas, pedidos e inventario de ejemplo</b>. Tus datos reales <b>no</b> se tocan.<br><br>Escribe <b>QUITAR</b> para confirmar:',
        input: 'text', inputPlaceholder: 'QUITAR', showCancelButton: true, confirmButtonText: 'Quitar todo lo de ejemplo', cancelButtonText: 'Cancelar', confirmButtonColor: '#b91c1c',
        preConfirm: (v) => { if (String(v || '').trim().toUpperCase() !== 'QUITAR') { Swal.showValidationMessage('Escribe QUITAR'); return false; } return true; }
      });
      ok = r.isConfirmed;
    } else {
      ok = (window.prompt('Escribe QUITAR para borrar los datos de demostración') || '').toUpperCase() === 'QUITAR';
    }
    if (!ok) return;
    try {
      if (window.Swal) Swal.fire({ title: 'Quitando datos de demostración…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const resp = await fetch('/api/demo/quitar', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ confirmar: 'QUITAR' }) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || 'No se pudo quitar');
      try { sessionStorage.removeItem(CLAVE); } catch (_) { /* noop */ }
      const extra = d.sinQuitar && d.sinQuitar.length ? '\n\nAlgunos datos no se quitaron porque ya se usan en ventas reales:\n- ' + d.sinQuitar.join('\n- ') : '';
      if (window.Swal) await Swal.fire({ icon: d.sinQuitar && d.sinQuitar.length ? 'info' : 'success', title: 'Listo', text: 'Los datos de demostración fueron quitados.' + extra });
      location.reload();
    } catch (e) {
      if (window.Swal) Swal.fire({ icon: 'error', title: e.message }); else alert(e.message);
    }
  }

  function mostrar(estado) {
    if (!estado || !estado.cargados) return;
    const barra = document.createElement('div');
    barra.setAttribute('role', 'status');
    barra.style.cssText = 'background:#fff3cd;color:#664d03;border-bottom:1px solid #ffecb5;padding:6px 12px;font-size:.85rem;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center';
    barra.innerHTML = '<span><strong>Datos de demostración:</strong> lo que ves (menú, ventas, clientes, inventario…) es de ejemplo.</span>';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-sm btn-outline-dark py-0'; b.textContent = 'Quitar datos de demostración';
    b.addEventListener('click', quitar);
    barra.appendChild(b);
    const nav = document.querySelector('nav.navbar');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(barra, nav.nextSibling); else document.body.prepend(barra);
  }

  const c = leerCache();
  if (c) { mostrar(c); return; }
  fetch('/api/demo/estado', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => { if (v) { guardarCache(v); mostrar(v); } })
    .catch(() => { /* sin aviso */ });
})();
