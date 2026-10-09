// Cobro con cripto (Bitcoin / Lightning vía BTCPay) desde el POS: muestra un QR para que el cliente pague
// con su billetera y espera la confirmación consultando al servidor. Misma interfaz que StripeCobro.
// Uso: const r = await CriptoCobro.cobrar({ monto, pedidoId, descripcion });
//      r = { cripto_pago_id, monto } si se pagó, o null si se canceló.
// Relacionado con: routes/cripto.js (/api/cripto/*), services/cripto.js, public/js/mesas.js, public/js/factura.js
window.CriptoCobro = (function () {
  let estadoCache = null;

  async function estado() {
    if (estadoCache) return estadoCache;
    try {
      const r = await fetch('/api/cripto/estado', { headers: { Accept: 'application/json' } });
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
    const resp = await fetch('/api/cripto/cobros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ monto, pedido_id: pedidoId, descripcion })
    });
    const cobro = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(cobro.error || 'No se pudo crear el cobro con cripto');

    // Pestañas disponibles: Lightning (instantáneo), Bitcoin en cadena y, como respaldo, la página de pago de BTCPay
    const vias = [];
    if (cobro.lightning && cobro.qr_lightning) vias.push({ id: 'ln', titulo: '⚡ Lightning', qr: cobro.qr_lightning, enlace: cobro.lightning, nota: 'Instantáneo y sin comisión de red. Recomendado.' });
    if (cobro.onchain && cobro.qr_onchain) vias.push({ id: 'btc', titulo: '₿ Bitcoin', qr: cobro.qr_onchain, enlace: cobro.onchain, nota: 'Pago en la red Bitcoin (puede tardar unos minutos en confirmar).' });
    if (!vias.length) vias.push({ id: 'web', titulo: 'Pagar', qr: cobro.qr_checkout, enlace: cobro.url, nota: 'El cliente abre la página de pago y elige cómo pagar.' });

    let timer = null;
    let resultado = null;

    const consultar = async () => {
      try {
        const r = await fetch(`/api/cripto/cobros/${cobro.id}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const d = await r.json();
        const el = document.getElementById('ccEstado');
        if (d.estado === 'pagado') {
          resultado = { cripto_pago_id: cobro.id, monto: Number(d.monto) };
          Swal.close();
        } else if (d.estado === 'procesando' && el) {
          el.innerHTML = '<span class="text-success"><i class="bi bi-hourglass-split"></i> Pago detectado, confirmando…</span>';
        } else if ((d.estado === 'expirado' || d.estado === 'invalido') && el) {
          el.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> El cobro venció. Cierra y genera uno nuevo.</span>';
          clearInterval(timer);
        }
      } catch (_) { /* reintenta en el siguiente ciclo */ }
    };

    const tabs = vias.map((v, i) => `<button type="button" class="btn btn-sm ${i === 0 ? 'btn-dark' : 'btn-outline-dark'} cc-tab" data-via="${v.id}">${v.titulo}</button>`).join('');
    const paneles = vias.map((v, i) => `
      <div class="cc-panel" data-via="${v.id}" style="${i === 0 ? '' : 'display:none'}">
        <div class="rm-qr my-2"><img src="${v.qr}" alt="Código QR para pagar con ${v.titulo}"></div>
        <div class="small text-muted mb-2">${v.nota}</div>
        <button type="button" class="btn btn-outline-secondary btn-sm cc-copiar" data-enlace="${encodeURIComponent(v.enlace)}"><i class="bi bi-clipboard"></i> Copiar</button>
      </div>`).join('');

    await Swal.fire({
      title: 'Cobrar con cripto',
      html: `
        <div class="text-center">
          <div class="fs-3 fw-bold mb-1">${fmt(cobro.monto, cobro.moneda)}</div>
          ${cobro.monto_btc ? `<div class="small text-muted mb-2">≈ ${String(cobro.monto_btc).replace(/[<>&]/g, '')} BTC</div>` : ''}
          ${vias.length > 1 ? `<div class="d-flex justify-content-center gap-2 mb-1">${tabs}</div>` : ''}
          ${paneles}
          <div class="small text-muted mb-1">El cliente escanea el código con su billetera (Bitcoin o Lightning).</div>
          <a class="btn btn-link btn-sm" href="${cobro.url}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> Abrir página de pago</a>
          <div id="ccEstado" class="small mt-1"><span class="rm-pulse"></span>Esperando el pago…</div>
        </div>`,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cancelar cobro',
      allowOutsideClick: false,
      didOpen: () => {
        document.querySelectorAll('.cc-tab').forEach((b) => b.addEventListener('click', () => {
          document.querySelectorAll('.cc-tab').forEach((x) => { x.classList.toggle('btn-dark', x === b); x.classList.toggle('btn-outline-dark', x !== b); });
          document.querySelectorAll('.cc-panel').forEach((p) => { p.style.display = p.dataset.via === b.dataset.via ? '' : 'none'; });
        }));
        document.querySelectorAll('.cc-copiar').forEach((b) => b.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(decodeURIComponent(b.dataset.enlace)); b.innerHTML = '<i class="bi bi-check2"></i> Copiado'; } catch (_) {}
        }));
        timer = setInterval(consultar, 2500);
      },
      willClose: () => clearInterval(timer)
    });

    if (resultado) {
      await Swal.fire({ icon: 'success', title: 'Pago confirmado', text: fmt(resultado.monto, cobro.moneda), timer: 1400, showConfirmButton: false });
      return resultado;
    }

    // Cancelado por el usuario: se invalida el cobro, salvo que justo se haya pagado
    try {
      const r = await fetch(`/api/cripto/cobros/${cobro.id}/cancelar`, { method: 'POST', headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (d && d.estado === 'pagado') {
        await Swal.fire({ icon: 'success', title: 'El pago se confirmó justo ahora', timer: 1400, showConfirmButton: false });
        return { cripto_pago_id: cobro.id, monto: Number(d.monto) };
      }
    } catch (_) { /* noop */ }
    return null;
  }

  /**
   * Procesa los pagos devueltos por el modal de pago mixto: cada fila "cripto" se cobra con QR.
   * Devuelve los pagos listos para enviar al servidor, o null si se canceló algún cobro.
   */
  async function resolverPagos(pagos, { pedidoId = null, descripcion = null } = {}) {
    if (!pagos) return pagos;
    const out = [];
    for (const p of pagos) {
      if (p.metodo !== 'cripto') { out.push(p); continue; }
      const r = await cobrar({ monto: p.monto, pedidoId, descripcion });
      if (!r) return null;
      out.push({ metodo: 'cripto', monto: r.monto, cripto_pago_id: r.cripto_pago_id });
    }
    return out;
  }

  return { estado, cobrar, resolverPagos };
})();
