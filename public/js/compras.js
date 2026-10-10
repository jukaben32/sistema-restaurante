// Compras y gastos (administrador): proveedores y facturas de compra para el formato 606
// Relacionado con: views/compras.ejs, routes/compras.js, services/fiscal/compras.js
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rd = (n) => `RD$\u00a0${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const modalProv = new bootstrap.Modal($('modalProv'));
  const modalCompra = new bootstrap.Modal($('modalCompra'));
  let cat = { tipos: {}, formas: {}, proveedores: [], insumos: [] };

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }
  const falla = (e) => Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: e.message || String(e), confirmButtonText: 'Entendido' });

  // ---------------------------------------------------------------- compras
  async function cargarCompras() {
    const mes = $('mes').value;
    $('dl606txt').href = `/api/fiscal/reportes/606?mes=${mes}&formato=txt`;
    $('dl606xls').href = `/api/fiscal/reportes/606?mes=${mes}&formato=xlsx`;
    const { compras } = await api(`/api/compras?mes=${mes}`);
    if (!compras.length) {
      $('tbCompras').innerHTML = '<tr><td colspan="7"><div class="rm-empty"><i class="bi bi-cart"></i>No hay compras registradas en este mes</div></td></tr>';
      $('tfCompras').innerHTML = '';
      return;
    }
    let total = 0, itbis = 0;
    $('tbCompras').innerHTML = compras.map((c) => {
      const monto = Number(c.monto_servicios) + Number(c.monto_bienes);
      total += monto; itbis += Number(c.itbis_facturado);
      return `<tr><td>${esc(String(c.fecha_comprobante).slice(0, 10))}</td><td>${esc(c.proveedor)}<div class="small text-muted">${esc(c.documento)}</div></td>
        <td><code>${esc(c.ncf)}</code>${c.ncf_modificado ? `<div class="small text-muted">modifica ${esc(c.ncf_modificado)}</div>` : ''}</td>
        <td class="small">${esc(cat.tipos[c.tipo_bienes_servicios] || c.tipo_bienes_servicios)}</td>
        <td class="num text-end">${rd(monto)}</td><td class="num text-end">${rd(c.itbis_facturado)}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-danger" data-borrar="${c.id}" title="Borrar"><i class="bi bi-trash"></i></button></td></tr>`;
    }).join('');
    $('tfCompras').innerHTML = `<tr class="fw-bold"><td colspan="4" class="text-end">Total del mes</td><td class="num text-end">${rd(total)}</td><td class="num text-end">${rd(itbis)}</td><td></td></tr>`;
  }

  $('tbCompras').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-borrar]');
    if (!b) return;
    const ok = await Swal.fire({ icon: 'warning', title: '¿Borrar esta compra?', text: 'Dejará de aparecer en el formato 606.', showCancelButton: true, confirmButtonText: 'Sí, borrar', cancelButtonText: 'Cancelar' });
    if (!ok.isConfirmed) return;
    try { await api(`/api/compras/${b.dataset.borrar}`, { method: 'DELETE' }); cargarCompras(); } catch (err) { falla(err); }
  });

  // ---------------------------------------------------------------- proveedores
  function pintarProv() {
    $('cProv').innerHTML = '<option value="">Elige un proveedor…</option>' + cat.proveedores.map((p) => `<option value="${p.id}">${esc(p.nombre)} · ${esc(p.documento)}</option>`).join('');
    $('tbProv').innerHTML = cat.proveedores.length
      ? cat.proveedores.map((p) => `<tr><td><strong>${esc(p.nombre)}</strong></td><td>${esc(p.documento)}</td><td>${esc(p.telefono || '')}</td>
          <td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-edit="${p.id}"><i class="bi bi-pencil"></i></button></td></tr>`).join('')
      : '<tr><td colspan="4"><div class="rm-empty"><i class="bi bi-shop"></i>Agrega tus proveedores (suplidores de carne, bebidas, etc.)</div></td></tr>';
  }
  async function recargarCatalogos() { cat = await api('/api/compras/catalogos'); pintarProv(); }

  function abrirProv(p) {
    $('tituloProv').textContent = p ? 'Editar proveedor' : 'Nuevo proveedor';
    $('pId').value = p ? p.id : '';
    $('pNombre').value = p ? p.nombre : '';
    $('pDoc').value = p ? p.documento : '';
    $('pTel').value = p ? (p.telefono || '') : '';
    modalProv.show();
  }
  $('btnNuevoProv').addEventListener('click', () => abrirProv(null));
  $('tbProv').addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) abrirProv(cat.proveedores.find((p) => String(p.id) === b.dataset.edit)); });
  $('formProv').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('pId').value;
    const body = JSON.stringify({ nombre: $('pNombre').value, documento: $('pDoc').value, telefono: $('pTel').value });
    try {
      const r = await api(id ? `/api/compras/proveedores/${id}` : '/api/compras/proveedores', { method: id ? 'PUT' : 'POST', body });
      modalProv.hide();
      await recargarCatalogos();
      if (!id) $('cProv').value = r.id;
    } catch (err) { falla(err); }
  });

  // ---------------------------------------------------------------- nueva compra
  function filaEntrada() {
    const d = document.createElement('div');
    d.className = 'row g-2 entrada-fila';
    d.innerHTML = `<div class="col-7"><select class="form-select form-select-sm e-insumo"><option value="">Insumo…</option>${cat.insumos.map((i) => `<option value="${i.id}" data-u="${esc(i.unidad)}">${esc(i.nombre)} (${esc(i.unidad)})</option>`).join('')}</select></div>
      <div class="col-3"><input type="number" step="0.001" min="0" class="form-control form-control-sm e-cant" placeholder="Cantidad"></div>
      <div class="col-2 text-end"><button type="button" class="btn btn-sm btn-outline-secondary e-quitar" title="Quitar"><i class="bi bi-x-lg"></i></button></div>`;
    d.querySelector('.e-quitar').addEventListener('click', () => d.remove());
    return d;
  }
  $('btnEntrada').addEventListener('click', () => $('entradas').appendChild(filaEntrada()));

  $('btnNuevaCompra').addEventListener('click', async () => {
    await recargarCatalogos();
    if (!cat.proveedores.length) {
      await Swal.fire({ icon: 'info', title: 'Primero agrega un proveedor', text: 'Necesitas su nombre y su RNC o cédula.' });
      abrirProv(null);
      return;
    }
    $('formCompra').reset();
    $('entradas').innerHTML = '';
    $('cFecha').value = new Date().toISOString().slice(0, 10);
    $('cTipo').innerHTML = Object.entries(cat.tipos).sort().map(([k, v]) => `<option value="${k}" ${k === '09' ? 'selected' : ''}>${k} · ${esc(v)}</option>`).join('');
    $('cForma').innerHTML = Object.entries(cat.formas).sort().map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    modalCompra.show();
  });

  $('formCompra').addEventListener('submit', async (e) => {
    e.preventDefault();
    const entradas = [...document.querySelectorAll('.entrada-fila')].map((f) => ({ insumo_id: f.querySelector('.e-insumo').value, cantidad: f.querySelector('.e-cant').value, unidad: (f.querySelector('.e-insumo').selectedOptions[0] || {}).dataset?.u }))
      .filter((x) => x.insumo_id && Number(x.cantidad) > 0);
    const body = {
      proveedor_id: $('cProv').value, ncf: $('cNcf').value.trim().toUpperCase(), ncf_modificado: $('cMod').value.trim().toUpperCase(),
      fecha_comprobante: $('cFecha').value, fecha_pago: $('cFechaPago').value || null, forma_pago: $('cForma').value, tipo_bienes_servicios: $('cTipo').value,
      monto_bienes: $('cBienes').value, monto_servicios: $('cServ').value, itbis_facturado: $('cItbis').value, itbis_costo: $('cItbisCosto').value,
      propina: $('cPropina').value, itbis_retenido: $('cItbisRet').value, monto_retencion_renta: $('cRetRenta').value, tipo_retencion_isr: $('cTipoRet').value || null,
      nota: $('cNota').value, entradas
    };
    try {
      await api('/api/compras', { method: 'POST', body: JSON.stringify(body) });
      modalCompra.hide();
      cargarCompras();
    } catch (err) { falla(err); }
  });

  $('mes').addEventListener('change', cargarCompras);
  $('mes').value = new Date().toISOString().slice(0, 7);
  recargarCatalogos().then(cargarCompras).catch((e) => falla(e));
})();
