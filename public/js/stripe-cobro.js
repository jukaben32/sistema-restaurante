// Cobro con Stripe desde el POS: muestra un QR para que el cliente pague en su celular
// y espera la confirmación consultando al servidor.
// Uso: const r = await StripeCobro.cobrar({ monto, pedidoId, descripcion });
//      r = { stripe_pago_id, monto } si se pagó, o null si se canceló.
// Relacionado con: routes/stripe.js (/api/stripe/*), public/js/mesas.js, public/js/factura.js
window.StripeCobro = (function () {
  let estadoCache = null;

  async function estado() {
    if (estadoCache) return estadoCache;
    try {
      const r = await fetch('/api/stripe/estado', { headers: { Accept: 'application/json' } });
      estadoCache = r.ok ? await r.json() : { habilitado: false };
    } catch (_) {
      estadoCache = { habilitado: false };
    }
    return estadoCache;
  }

  function fmt(n, moneda) {
    const v = Number(n || 0).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${String(moneda || '').toUpperCase()} ${v}`;
  }

  async function cobrar({ monto, pedidoId = null, descripcion = null }) {
    const resp = await fetch('/api/stripe/cobros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ monto, pedido_id: pedidoId, descripcion })
    });
    const cobro = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(cobro.error || 'No se pudo crear el cobro con Stripe');

    let timer = null;
    let resultado = null;

    const consultar = async () => {
      try {
        const r = await fetch(`/api/stripe/cobros/${cobro.id}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const d = await r.json();
        if (d.estado === 'pagado') {
          resultado = { stripe_pago_id: cobro.id, monto: Number(d.monto) };
          Swal.close();
        } else if (d.estado === 'expirado') {
          const el = document.getElementById('scEstado');
          if (el) el.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> El cobro expiró. Cierra y genera uno nuevo.</span>';
          clearInterval(timer);
        }
      } catch (_) { /* reintenta en el siguiente ciclo */ }
    };

    await Swal.fire({
      title: 'Cobrar con Stripe',
      html: `
        <div class="text-center">
          <div class="fs-3 fw-bold mb-1">${fmt(cobro.monto, cobro.moneda)}</div>
          ${cobro.modoPrueba ? '<div class="mb-2"><span class="rm-chip warn">Modo prueba · tarjeta 4242 4242 4242 4242</span></div>' : ''}
          <div class="rm-qr my-2"><img src="${cobro.qr}" alt="Código QR para pagar con Stripe"></div>
          <div class="small text-muted mb-2">El cliente escanea el código con la cámara y paga con tarjeta, Apple Pay o Google Pay.</div>
          <div class="d-flex justify-content-center gap-2 mb-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="scCopiar"><i class="bi bi-link-45deg"></i> Copiar enlace</button>
            <a class="btn btn-outline-secondary btn-sm" id="scAbrir" href="${cobro.url}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Abrir aquí</a>
          </div>
          <div id="scEstado" class="small"><span class="rm-pulse"></span>Esperando el pago…</div>
        </div>`,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cancelar cobro',
      allowOutsideClick: false,
      didOpen: () => {
        const btn = document.getElementById('scCopiar');
        if (btn) btn.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(cobro.url); btn.innerHTML = '<i class="bi bi-check2"></i> Copiado'; } catch (_) {}
        });
        timer = setInterval(consultar, 2500);
      },
      willClose: () => clearInterval(timer)
    });

    if (resultado) {
      await Swal.fire({ icon: 'success', title: 'Pago confirmado', text: fmt(resultado.monto, cobro.moneda), timer: 1400, showConfirmButton: false });
      return resultado;
    }

    // Cancelado por el usuario: expiramos la sesión, salvo que justo se haya pagado
    try {
      const r = await fetch(`/api/stripe/cobros/${cobro.id}/cancelar`, { method: 'POST', headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (d && d.estado === 'pagado') {
        await Swal.fire({ icon: 'success', title: 'El pago se confirmó justo ahora', timer: 1400, showConfirmButton: false });
        return { stripe_pago_id: cobro.id, monto: Number(d.monto) };
      }
    } catch (_) { /* noop */ }
    return null;
  }

  /**
   * Procesa los pagos devueltos por el modal de pago mixto: cada fila "stripe" se cobra con QR.
   * Devuelve los pagos listos para enviar al servidor, o null si se canceló algún cobro.
   */
  async function resolverPagos(pagos, { pedidoId = null, descripcion = null } = {}) {
    const out = [];
    for (const p of pagos || []) {
      if (p.metodo !== 'stripe') { out.push(p); continue; }
      const r = await cobrar({ monto: p.monto, pedidoId, descripcion });
      if (!r) return null;
      out.push({ metodo: 'stripe', monto: r.monto, stripe_pago_id: r.stripe_pago_id });
    }
    return out;
  }

  return { estado, cobrar, resolverPagos };
})();
