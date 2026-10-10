// Pantalla Fiscal (administrador): comprobantes e-CF, configuración, secuencias, notas de crédito y reportes DGII
// Relacionado con: views/fiscal.ejs, routes/fiscal.js, services/fiscal/*
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rd = (n) => `RD$\u00a0${Math.abs(Number(n || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fechaHora = (d) => new Date(d).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', dateStyle: 'short', timeStyle: 'short' });
  const modalComp = new bootstrap.Modal($('modalComp'));

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }
  const falla = (e, titulo = 'No se pudo completar') => Swal.fire({ icon: 'error', title: titulo, text: e.message || String(e), confirmButtonText: 'Entendido' });
  const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body || {}) });

  const ESTADOS = {
    pendiente: ['Pendiente de envío', 'warning'], enviado: ['En proceso', 'info'], aceptado: ['Aceptado', 'success'], aceptado_condicional: ['Aceptado condicional', 'success'],
    rechazado: ['Rechazado', 'danger'], contingencia: ['Contingencia (serie B)', 'secondary'], no_fiscal: ['No fiscal', 'light']
  };
  const chip = (e) => { const [t, c] = ESTADOS[e] || [e, 'secondary']; return `<span class="badge text-bg-${c} estado">${t}</span>`; };
  const MODOS_AYUDA = {
    no_fiscal: 'Para aprender y practicar. Las ventas NO llevan impuestos ni número fiscal y el ticket dice "DOCUMENTO NO FISCAL". No lo uses para vender de verdad.',
    ecf_pruebas: 'Cada venta recibe su e-NCF y se envía al ambiente de pruebas (o al proveedor simulado). No tiene validez fiscal, pero es exactamente el flujo real.',
    ecf_produccion: 'Facturación electrónica REAL: cada venta se envía a la DGII a través de MSeller. Solo se activa con todo el checklist en verde.',
    ncf_b: 'Para cuando aún no eres emisor electrónico o tu e-CF no funciona: comprobantes con NCF de la serie B autorizada por la DGII (necesitas cargar esas secuencias).'
  };
  let cfg = null;

  // ---------------------------------------------------------------- aviso de modo
  function pintarAviso() {
    const m = cfg.modo;
    $('avisoModo').innerHTML = m === 'no_fiscal'
      ? '<div class="alert alert-warning d-flex gap-2 align-items-start"><i class="bi bi-exclamation-triangle-fill"></i><div><b>El sistema está en modo práctica (no fiscal).</b> Las ventas no llevan ITBIS ni NCF. Antes de abrir al público configura tus datos, carga las secuencias y cambia el modo.</div></div>'
      : m === 'ecf_pruebas' ? '<div class="alert alert-info d-flex gap-2"><i class="bi bi-info-circle-fill"></i><div><b>Modo de pruebas e-CF.</b> Los comprobantes no tienen validez fiscal todavía.</div></div>'
      : cfg.contingencia ? '<div class="alert alert-danger d-flex gap-2"><i class="bi bi-lightning-charge-fill"></i><div><b>Contingencia activa:</b> las ventas salen con NCF serie B. Recuerda notificarlo en la Oficina Virtual y regularizar.</div></div>' : '';
  }

  // ---------------------------------------------------------------- configuración
  function pintarConfig() {
    $('cModo').value = cfg.modo; $('ayudaModo').textContent = MODOS_AYUDA[cfg.modo];
    $('cRnc').value = cfg.emisor.rnc; $('cRazon').value = cfg.emisor.razonSocial; $('cDir').value = cfg.emisor.direccion;
    $('cMuni').value = cfg.emisor.municipio; $('cProvincia').value = cfg.emisor.provincia;
    $('cIncluye').checked = cfg.preciosIncluyenItbis; $('cPropina').checked = cfg.propinaActiva; $('cTasaProp').value = cfg.propinaTasa;
    $('cPropDel').checked = cfg.propinaEnDelivery; $('cPropLlevar').checked = cfg.propinaEnLlevar; $('cPropRapida').checked = cfg.propinaEnRapida;
    $('cProv').value = cfg.proveedor; $('cAmb').value = cfg.mseller.ambiente; $('cMsEmail').value = cfg.mseller.email;
    $('tienePass').textContent = cfg.mseller.tienePassword ? '(guardada)' : ''; $('tieneKey').textContent = cfg.mseller.tieneApiKey ? '(guardada)' : '';
    $('checklist').innerHTML = cfg.checklist.map((i) => `<div class="chk"><i class="bi ${i.ok ? 'bi-check-circle-fill ok' : 'bi-x-circle-fill no'}"></i><span>${esc(i.txt)}</span></div>`).join('')
      + `<div class="mt-2 fw-semibold ${cfg.listo ? 'text-success' : 'text-danger'}">${cfg.listo ? 'Todo listo para producción' : 'Aún falta para producción'}</div>`;
    $('estadoCont').innerHTML = cfg.contingencia ? `<span class="badge text-bg-danger">Activa${cfg.contingenciaDesde ? ' desde ' + fechaHora(cfg.contingenciaDesde) : ''}</span>` : '<span class="badge text-bg-success">No activa</span>';
    $('btnCont').textContent = cfg.contingencia ? 'Terminar la contingencia' : 'Activar contingencia';
    $('btnCont').disabled = cfg.modo === 'no_fiscal';
  }
  async function cargarConfig() { cfg = await api('/api/fiscal/config'); pintarAviso(); pintarConfig(); }
  $('cModo').addEventListener('change', () => { $('ayudaModo').textContent = MODOS_AYUDA[$('cModo').value]; });

  $('formConfig').addEventListener('submit', async (e) => {
    e.preventDefault();
    const modo = $('cModo').value;
    if (modo === 'ecf_produccion' && cfg.modo !== 'ecf_produccion') {
      const r = await Swal.fire({ icon: 'warning', title: '¿Pasar a PRODUCCIÓN?', html: 'Desde ahora cada venta será una <b>factura electrónica real</b> enviada a la DGII. Escribe <b>PRODUCCION</b> para confirmar.', input: 'text', showCancelButton: true, confirmButtonText: 'Activar', cancelButtonText: 'Cancelar' });
      if (!r.isConfirmed) return;
      if (String(r.value).trim().toUpperCase() !== 'PRODUCCION') return falla(new Error('No escribiste PRODUCCION: no se cambió nada.'));
    }
    try {
      await post('/api/fiscal/config', {
        modo, proveedor: $('cProv').value, ambiente: $('cAmb').value, rnc: $('cRnc').value, razonSocial: $('cRazon').value, direccion: $('cDir').value,
        municipio: $('cMuni').value, provincia: $('cProvincia').value, preciosIncluyenItbis: $('cIncluye').checked, propinaActiva: $('cPropina').checked,
        propinaTasa: $('cTasaProp').value, propinaEnDelivery: $('cPropDel').checked, propinaEnLlevar: $('cPropLlevar').checked, propinaEnRapida: $('cPropRapida').checked,
        msellerEmail: $('cMsEmail').value, msellerPassword: $('cMsPass').value, msellerApiKey: $('cMsKey').value
      });
      $('cMsPass').value = ''; $('cMsKey').value = '';
      await cargarConfig();
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1400, showConfirmButton: false });
    } catch (err) { falla(err, 'No se pudo guardar'); }
  });

  $('btnProbar').addEventListener('click', async () => {
    $('resProbar').innerHTML = '<span class="text-muted">Probando…</span>';
    try { const r = await post('/api/fiscal/probar'); $('resProbar').innerHTML = `<span class="text-success"><i class="bi bi-check-circle-fill"></i> ${esc(r.detalle || 'Conexión correcta')}</span>`; }
    catch (err) { $('resProbar').innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill"></i> ${esc(err.message)}</span>`; }
  });
  $('btnValidar').addEventListener('click', async () => {
    $('resProbar').innerHTML = '<span class="text-muted">Validando un comprobante de ejemplo en TesteCF…</span>';
    try {
      const r = await post('/api/fiscal/validar-prueba');
      $('resProbar').innerHTML = r.estado === 'rechazado'
        ? `<span class="text-danger"><i class="bi bi-x-circle-fill"></i> MSeller indicó un problema: ${esc(r.error || 'revisa los datos')}</span><pre class="json mt-2">${esc(JSON.stringify(r.respuesta, null, 2))}</pre>`
        : `<span class="text-success"><i class="bi bi-check-circle-fill"></i> El formato del comprobante es válido (no se gastó ningún número).</span>`;
    } catch (err) { $('resProbar').innerHTML = `<span class="text-danger"><i class="bi bi-x-circle-fill"></i> ${esc(err.message)}</span>`; }
  });
  $('btnCont').addEventListener('click', async () => {
    const activar = !cfg.contingencia;
    const r = await Swal.fire({ icon: 'warning', title: activar ? '¿Activar la contingencia?' : '¿Terminar la contingencia?',
      html: activar ? 'Las próximas ventas saldrán con <b>NCF serie B</b>. Necesitas tener cargadas las secuencias B01/B02/B04. Debes notificarlo en la Oficina Virtual de la DGII.'
        : 'Las ventas volverán a emitirse como e-CF. Regulariza los comprobantes de serie B emitidos con tu contador.', showCancelButton: true, confirmButtonText: 'Sí', cancelButtonText: 'Cancelar' });
    if (!r.isConfirmed) return;
    try { await post('/api/fiscal/contingencia', { activa: activar }); await cargarConfig(); } catch (err) { falla(err); }
  });

  // ---------------------------------------------------------------- comprobantes
  async function cargarComprobantes() {
    const q = new URLSearchParams({ estado: $('fEstado').value, q: $('fBuscar').value.trim() });
    const { comprobantes, resumen } = await api('/api/fiscal/comprobantes?' + q);
    const kpi = (l, v, c = '') => `<div class="col-6 col-lg"><div class="rm-card rm-kpi"><div class="lbl">${l}</div><div class="val ${c}">${v}</div></div></div>`;
    $('kpisFiscal').innerHTML = kpi('Aceptados', resumen.aceptados) + kpi('Pendientes de envío', resumen.pendientes, resumen.pendientes ? 'text-warning' : '') + kpi('En proceso', resumen.enviados)
      + kpi('Rechazados', resumen.rechazados, resumen.rechazados ? 'text-danger' : '') + kpi('Contingencia', resumen.contingencia);
    $('tbComp').innerHTML = comprobantes.length ? comprobantes.map((c) => `<tr>
        <td>${fechaHora(c.fecha)}</td><td><code>${esc(c.ncf)}</code><div class="small text-muted">${esc(c.tipo_comprobante)}${c.factura_origen_id ? ' · nota de crédito' : ''}</div></td>
        <td>${esc(c.cliente || '')}</td><td class="num text-end ${c.factura_origen_id ? 'text-danger' : ''}">${c.factura_origen_id ? '-' : ''}${rd(c.total)}</td>
        <td>${chip(c.fiscal_estado)}${c.fiscal_error ? `<div class="small text-danger">${esc(c.fiscal_error).slice(0, 90)}</div>` : ''}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-secondary" data-abrir="${c.id}">Abrir</button></td></tr>`).join('')
      : '<tr><td colspan="6"><div class="rm-empty"><i class="bi bi-receipt"></i>Todavía no hay comprobantes con número fiscal</div></td></tr>';
  }
  $('fEstado').addEventListener('change', cargarComprobantes);
  $('fRefrescar').addEventListener('click', cargarComprobantes);
  let tBuscar; $('fBuscar').addEventListener('input', () => { clearTimeout(tBuscar); tBuscar = setTimeout(cargarComprobantes, 350); });
  $('tbComp').addEventListener('click', (e) => { const b = e.target.closest('[data-abrir]'); if (b) abrirComprobante(Number(b.dataset.abrir)); });

  async function abrirComprobante(id) {
    const d = await api(`/api/fiscal/comprobantes/${id}`);
    const f = d.factura;
    const esNota = !!f.factura_origen_id;
    $('tituloComp').innerHTML = `${esc(f.ncf || 'Factura #' + f.id)} ${chip(f.fiscal_estado)}`;
    const puedeNota = !esNota && ['aceptado', 'aceptado_condicional', 'contingencia', 'no_fiscal'].includes(f.fiscal_estado);
    const restan = d.lineas.some((l) => l.restan > 0);
    $('cuerpoComp').innerHTML = `
      <div class="row g-2 small mb-2"><div class="col-sm-6"><b>Cliente:</b> ${esc(f.comprador_nombre || f.cliente || '')} ${f.comprador_documento ? '· ' + esc(f.comprador_documento) : ''}</div>
        <div class="col-sm-6"><b>Fecha:</b> ${fechaHora(f.fecha)} · <b>Total:</b> ${rd(f.total)}</div>
        ${f.ncf_modificado ? `<div class="col-12"><b>Modifica:</b> ${esc(f.ncf_modificado)} — ${esc(f.motivo_nota || '')}</div>` : ''}
        ${f.fiscal_error ? `<div class="col-12 text-danger"><b>Error:</b> ${esc(f.fiscal_error)}</div>` : ''}
        ${f.ncf && f.token_publico ? `<div class="col-12"><a href="/f/${esc(f.token_publico)}" target="_blank" rel="noopener">Ver el comprobante (enlace para el cliente)</a></div>` : ''}</div>
      <table class="table table-sm"><thead><tr><th>Producto</th><th class="text-end">Cant.</th><th class="text-end">Importe</th>${puedeNota && restan ? '<th style="width:110px">Devolver</th>' : ''}</tr></thead><tbody>
      ${d.lineas.map((l) => `<tr><td>${esc(l.nombre)}</td><td class="text-end">${Math.abs(l.cantidad)}${l.devuelta ? `<div class="small text-muted">devuelto ${l.devuelta}</div>` : ''}</td><td class="text-end">${rd(l.subtotal)}</td>
        ${puedeNota && restan ? `<td>${l.restan > 0 ? `<input type="number" class="form-control form-control-sm dev" data-id="${l.id}" min="0" max="${l.restan}" step="any" value="0">` : '<span class="small text-muted">—</span>'}</td>` : ''}</tr>`).join('')}</tbody></table>
      ${puedeNota && restan ? `<div class="mb-2"><label class="form-label small fw-semibold" for="motivoNota">Motivo de la nota de crédito (obligatorio)</label><input id="motivoNota" class="form-control" maxlength="300" placeholder="Ej: El cliente devolvió un plato frío"></div>
        <div class="form-check"><input class="form-check-input" type="checkbox" id="devInv"><label class="form-check-label small" for="devInv">Devolver los insumos al inventario (si el plato no se llegó a preparar)</label></div>` : ''}
      <h6 class="mt-3">Historial fiscal</h6><ul class="small mb-0">${d.eventos.map((v) => `<li>${fechaHora(v.created_at)} — <b>${esc(v.evento)}</b> ${esc(v.detalle || '')}</li>`).join('') || '<li>Sin eventos</li>'}</ul>
      <div id="jsonEnvio"></div>`;
    const pie = [];
    if (['pendiente', 'enviado'].includes(f.fiscal_estado)) pie.push('<button class="btn btn-outline-secondary" id="btnReint"><i class="bi bi-arrow-repeat"></i> Reintentar envío</button>');
    if (f.ncf) pie.push('<button class="btn btn-outline-secondary" id="btnVerJson">Ver lo enviado</button>');
    pie.push(`<a class="btn btn-outline-secondary" target="_blank" href="/facturas/${f.id}/imprimir?embed=1"><i class="bi bi-printer"></i> Imprimir</a>`);
    if (puedeNota && restan) {
      pie.push('<button class="btn btn-outline-danger" id="btnParcial">Devolver lo marcado</button>');
      pie.push('<button class="btn btn-danger" id="btnAnularTodo">Anular toda la factura</button>');
    }
    $('pieComp').innerHTML = pie.join('');
    const emitirNota = async (items) => {
      const motivo = ($('motivoNota') || {}).value || '';
      if (motivo.trim().length < 5) return falla(new Error('Escribe el motivo de la nota de crédito.'), 'Falta el motivo');
      const ok = await Swal.fire({ icon: 'warning', title: items ? '¿Emitir la nota de crédito por lo marcado?' : '¿Anular toda la factura?', text: 'Se emite una nota de crédito (e-CF E34). Esto no se puede deshacer.', showCancelButton: true, confirmButtonText: 'Sí, emitir', cancelButtonText: 'Cancelar' });
      if (!ok.isConfirmed) return;
      try {
        const r = await post('/api/fiscal/notas-credito', { factura_id: f.id, items, motivo, devolver_inventario: ($('devInv') || {}).checked });
        modalComp.hide();
        await Swal.fire({ icon: 'success', title: 'Nota de crédito emitida', text: `${r.ncf || 'Sin número fiscal'} por ${rd(r.total)}.` });
        cargarComprobantes();
      } catch (err) { falla(err, 'No se pudo emitir la nota'); }
    };
    if ($('btnAnularTodo')) $('btnAnularTodo').addEventListener('click', () => emitirNota(null));
    if ($('btnParcial')) $('btnParcial').addEventListener('click', () => {
      const items = [...document.querySelectorAll('.dev')].map((i) => ({ detalle_id: Number(i.dataset.id), cantidad: Number(i.value) })).filter((x) => x.cantidad > 0);
      if (!items.length) return falla(new Error('Escribe cuántas unidades devuelves en al menos una línea.'), 'Nada que devolver');
      emitirNota(items);
    });
    if ($('btnReint')) $('btnReint').addEventListener('click', async () => {
      try { const r = await post(`/api/fiscal/comprobantes/${f.id}/reintentar`); await Swal.fire({ icon: 'info', title: 'Estado: ' + ((ESTADOS[r.estado] || [r.estado])[0]), text: r.error || '' }); modalComp.hide(); cargarComprobantes(); } catch (err) { falla(err); }
    });
    if ($('btnVerJson')) $('btnVerJson').addEventListener('click', async () => {
      const j = await api(`/api/fiscal/comprobantes/${f.id}/envio`);
      $('jsonEnvio').innerHTML = j.solicitud ? `<h6 class="mt-3">Enviado</h6><pre class="json">${esc(JSON.stringify(JSON.parse(j.solicitud), null, 2))}</pre><h6>Respuesta</h6><pre class="json">${esc(j.respuesta ? JSON.stringify(JSON.parse(j.respuesta), null, 2) : '')}</pre>` : '<p class="small text-muted mt-3">Aún no se ha enviado.</p>';
    });
    modalComp.show();
  }

  // ---------------------------------------------------------------- secuencias
  const TIPOS_SEC = { E31: 'e-CF crédito fiscal', E32: 'e-CF consumo', E34: 'e-CF nota de crédito', B01: 'NCF crédito fiscal', B02: 'NCF consumo', B04: 'NCF nota de crédito' };
  $('sTipo').innerHTML = Object.entries(TIPOS_SEC).map(([k, v]) => `<option value="${k}">${k} · ${v}</option>`).join('');
  async function cargarSecuencias() {
    const { secuencias } = await api('/api/fiscal/secuencias');
    $('tbSec').innerHTML = secuencias.length ? secuencias.map((s) => `<tr><td><b>${esc(s.tipo)}</b><div class="small text-muted">${esc(s.nombre || '')}</div></td>
      <td>${s.desde.toLocaleString('es-DO')} – ${s.hasta.toLocaleString('es-DO')}${s.practica ? ' <span class="badge text-bg-light border">práctica</span>' : ''}</td>
      <td class="num text-end">${s.restantes.toLocaleString('es-DO')}</td><td>${s.vence ? esc(String(s.vence).slice(0, 10)) : '—'}</td>
      <td><span class="badge text-bg-${s.estado === 'vigente' ? 'success' : s.estado === 'inactiva' ? 'secondary' : 'danger'}">${s.estado}</span>${s.alertas.map((a) => `<div class="small text-warning">${esc(a)}</div>`).join('')}</td>
      <td class="text-end">${s.activa ? `<button class="btn btn-sm btn-outline-secondary" data-desact="${s.id}">Desactivar</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="6"><div class="rm-empty"><i class="bi bi-123"></i>Sin secuencias. Agrega las que te autorizó la DGII, o carga las de práctica.</div></td></tr>';
  }
  $('tbSec').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-desact]'); if (!b) return;
    const ok = await Swal.fire({ icon: 'warning', title: '¿Desactivar este rango?', text: 'Dejará de usarse para nuevas ventas. No se borra.', showCancelButton: true, confirmButtonText: 'Desactivar', cancelButtonText: 'Cancelar' });
    if (ok.isConfirmed) try { await post(`/api/fiscal/secuencias/${b.dataset.desact}/desactivar`); cargarSecuencias(); } catch (err) { falla(err); }
  });
  $('btnPractica').addEventListener('click', async () => { try { const r = await post('/api/fiscal/secuencias/practica'); await cargarSecuencias(); Swal.fire({ icon: 'success', title: r.creadas ? `${r.creadas} secuencias de práctica cargadas` : 'Ya estaban cargadas', timer: 1600, showConfirmButton: false }); } catch (err) { falla(err); } });
  $('formSec').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/api/fiscal/secuencias', { tipo: $('sTipo').value, desde: $('sDesde').value, hasta: $('sHasta').value, vence: $('sVence').value }); e.target.reset(); cargarSecuencias(); await cargarConfig(); }
    catch (err) { falla(err, 'No se pudo agregar'); }
  });

  // ---------------------------------------------------------------- reportes
  $('rMes').value = new Date().toISOString().slice(0, 7);
  const hoy = new Date().toISOString().slice(0, 10);
  $('pDesde').value = hoy.slice(0, 8) + '01'; $('pHasta').value = hoy;
  document.querySelectorAll('[data-rep]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); location.href = `/api/fiscal/reportes/${a.dataset.rep}?mes=${$('rMes').value}&formato=${a.dataset.fmt}${a.dataset.extra || ''}`; }));
  $('btnResumen').addEventListener('click', async () => {
    try {
      const r = await api('/api/fiscal/reportes/it1?mes=' + $('rMes').value);
      const v = r.ventas, c = r.compras;
      $('resumen').innerHTML = `<div class="row g-2 small">
        <div class="col-md-6"><b>Ventas (netas de notas de crédito)</b><br>Gravado 18 %: ${rd(v.gravado_18)}<br>Gravado 16 %: ${rd(v.gravado_16)}<br>Gravado 0 %: ${rd(v.gravado_0)}<br>Exento: ${rd(v.exento)}<br><b>ITBIS cobrado: ${rd(v.itbis_cobrado)}</b><br>Propina legal: ${rd(v.propina_legal)}<br>${v.comprobantes} comprobantes · ${v.notas_credito} notas de crédito</div>
        <div class="col-md-6"><b>Compras</b><br>Total: ${rd(c.total)}<br>ITBIS facturado: ${rd(c.itbis_facturado)}<br>ITBIS al costo: ${rd(c.itbis_al_costo)}<br>ITBIS retenido: ${rd(c.itbis_retenido)}<br>${c.registros} registros<hr class="my-2"><b>ITBIS estimado a pagar: ${rd(r.itbis_a_pagar)}</b></div>
        <div class="col-12 text-muted">${esc(r.nota)}</div></div>`;
    } catch (err) { falla(err); }
  });
  $('btnPropina').addEventListener('click', async () => {
    try {
      const r = await api(`/api/fiscal/reportes/propina?desde=${$('pDesde').value}&hasta=${$('pHasta').value}`);
      $('resPropina').innerHTML = `<b>Total recaudado: ${rd(r.total)}</b>` + (r.dias.length ? '<table class="table table-sm mt-2 mb-0"><tbody>' + r.dias.map((d) => `<tr><td>${esc(d.dia)}</td><td class="text-end">${d.facturas} fact.</td><td class="text-end">${rd(d.propina)}</td></tr>`).join('') + '</tbody></table>' : '');
    } catch (err) { falla(err); }
  });
  api('/api/fiscal/motivos-608').then((m) => { $('aMotivo').innerHTML = Object.entries(m).map(([k, v]) => `<option value="${k}">${k} · ${esc(v)}</option>`).join(''); });
  $('formAnular').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post('/api/fiscal/anular-ncf', { ncf: $('aNcf').value.trim().toUpperCase(), motivo: $('aMotivo').value }); $('aNcf').value = ''; Swal.fire({ icon: 'success', title: 'Registrado en el 608', timer: 1500, showConfirmButton: false }); }
    catch (err) { falla(err); }
  });

  cargarConfig().then(() => Promise.all([cargarComprobantes(), cargarSecuencias()])).catch((e) => falla(e, 'No se pudo cargar'));
})();
