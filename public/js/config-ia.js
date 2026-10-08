// Configuración → Asistentes IA
// Relacionado con: views/config_ia.ejs, routes/ia.js
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const modalPrompt = new bootstrap.Modal($('modalPrompt'));
  let sondeo = null;

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  }
  const fail = (e) => Swal.fire({ icon: 'error', title: e.message });

  const fila = (ok, texto, pista) => `<div class="chk"><i class="bi ${ok ? 'bi-check-circle-fill ok' : 'bi-x-circle-fill no'}"></i><span>${texto}${!ok && pista ? ` <code>${pista}</code>` : ''}</span></div>`;

  function pintar(d) {
    const v = d.voz, w = d.whatsapp, c = d.config;
    $('chkVoz').innerHTML =
      fila(v.vapi_api_key, 'Llave de Vapi en el servidor', 'VAPI_API_KEY') +
      fila(v.webhook_token, 'Token de seguridad del webhook', 'VAPI_WEBHOOK_TOKEN') +
      fila(v.app_url_https, `Dirección pública https de la app${v.app_url ? ` (${esc(v.app_url)})` : ''}`, 'APP_URL=https://…') +
      fila(v.publicado, v.publicado ? `Asistente publicado${v.publicado_at ? ` · ${new Date(v.publicado_at).toLocaleString('es')}` : ''}` : 'Asistente aún sin publicar') +
      fila(!!v.phone_number_id, v.phone_number_id ? 'Número de Vapi vinculado' : 'Falta el ID del número de Vapi (para recibir llamadas)');
    const listoVoz = v.vapi_api_key && v.webhook_token && v.app_url_https && v.publicado && v.phone_number_id;
    $('chipVoz').className = `rm-chip ms-auto ${listoVoz ? 'ok' : 'warn'}`;
    $('chipVoz').textContent = listoVoz ? 'Listo' : 'Por configurar';
    $('vozMsg').value = c.voz_primer_mensaje;
    $('vozExtra').value = c.voz_instrucciones;
    $('vozPn').value = c.vapi_phone_number_id;
    $('vozNumero').value = c.vapi_numero;
    if (v.assistant_id) { $('linkVapi').href = `https://dashboard.vapi.ai/assistants/${encodeURIComponent(v.assistant_id)}`; $('linkVapi').classList.remove('d-none'); }

    $('chkWa').innerHTML =
      fila(w.evolution_configurado, 'Servidor de Evolution API', 'EVOLUTION_API_URL y EVOLUTION_API_KEY') +
      fila(w.openai_api_key, 'Llave de OpenAI (cerebro del asistente de texto)', 'OPENAI_API_KEY') +
      fila(w.app_url, 'Dirección pública de la app', 'APP_URL');
    const conectado = w.estado === 'open';
    $('chipWa').className = `rm-chip ms-auto ${conectado ? 'ok' : w.creada ? 'warn' : ''}`;
    $('chipWa').textContent = conectado ? 'Conectado' : w.creada ? 'Esperando conexión' : 'Sin conectar';
    $('waSin').classList.toggle('d-none', !!w.creada);
    $('waCon').classList.toggle('d-none', !conectado);
    $('waQr').classList.toggle('d-none', !(w.creada && !conectado));
    if (w.qr) $('imgQr').src = w.qr.startsWith('data:') ? w.qr : `data:image/png;base64,${w.qr}`;
    if (w.error && w.creada) $('chkWa').insertAdjacentHTML('beforeend', `<div class="small text-danger">${esc(w.error)}</div>`);
    $('waActivo').checked = !!c.wa_activo;
    $('waAvisos').checked = !!c.wa_avisos;
    $('waExtra').value = c.wa_instrucciones;

    clearInterval(sondeo);
    if (w.creada && !conectado) sondeo = setInterval(() => cargar(true), 4000); // refresca el QR hasta conectar
    $('cargando').classList.add('d-none');
    $('contenido').classList.remove('d-none');
  }

  async function cargar(conQr = false) {
    try { pintar(await api(`/api/ia/estado${conQr ? '?qr=1' : ''}`)); }
    catch (e) { $('cargando').innerHTML = `<span class="text-danger">${esc(e.message)}</span>`; }
  }

  function cuerpoConfig() {
    return {
      voz_primer_mensaje: $('vozMsg').value, voz_instrucciones: $('vozExtra').value, vapi_phone_number_id: $('vozPn').value, vapi_numero: $('vozNumero').value,
      wa_instrucciones: $('waExtra').value, wa_activo: $('waActivo').checked ? 1 : 0, wa_avisos: $('waAvisos').checked ? 1 : 0
    };
  }
  const guardar = () => api('/api/ia/config', { method: 'PUT', body: JSON.stringify(cuerpoConfig()) });

  $('btnPublicar').addEventListener('click', async () => {
    const b = $('btnPublicar');
    b.disabled = true;
    try {
      await guardar();
      const r = await api('/api/ia/vapi/publicar', { method: 'POST', body: '{}' });
      await Swal.fire({
        icon: 'success', title: r.creado ? 'Asistente creado en Vapi' : 'Asistente actualizado',
        html: `Herramientas: ${r.herramientas.creadas.length} nuevas, ${r.herramientas.actualizadas.length} actualizadas.<br>${r.numeroVinculado ? 'El número de Vapi ya atiende con este asistente.' : 'Falta vincular el número de Vapi para recibir llamadas.'}`
      });
      cargar();
    } catch (e) { fail(e); } finally { b.disabled = false; }
  });

  $('btnCrearWa').addEventListener('click', async () => {
    const b = $('btnCrearWa');
    b.disabled = true;
    try { await api('/api/ia/whatsapp/crear', { method: 'POST', body: '{}' }); await cargar(true); } catch (e) { fail(e); } finally { b.disabled = false; }
  });

  $('btnGuardarWa').addEventListener('click', async () => {
    try { await guardar(); Swal.fire({ icon: 'success', title: 'Guardado', timer: 1200, showConfirmButton: false }); } catch (e) { fail(e); }
  });

  $('btnPrueba').addEventListener('click', async () => {
    try {
      await api('/api/ia/whatsapp/probar', { method: 'POST', body: JSON.stringify({ telefono: $('waPrueba').value }) });
      Swal.fire({ icon: 'success', title: 'Mensaje de prueba enviado' });
    } catch (e) { fail(e); }
  });

  $('btnDesconectar').addEventListener('click', async () => {
    const ok = await Swal.fire({ icon: 'warning', title: '¿Desconectar WhatsApp?', text: 'El asistente dejará de responder hasta que vuelvas a conectar.', showCancelButton: true, confirmButtonText: 'Desconectar', cancelButtonText: 'Cancelar', confirmButtonColor: '#b91c1c' });
    if (!ok.isConfirmed) return;
    try { await api('/api/ia/whatsapp/desconectar', { method: 'POST', body: '{}' }); cargar(); } catch (e) { fail(e); }
  });

  document.querySelectorAll('[data-prompt]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await guardar();
      const d = await api(`/api/ia/prompt?canal=${b.dataset.prompt}`);
      $('promptTitulo').textContent = d.canal === 'voz' ? 'Instrucciones del asistente de voz' : 'Instrucciones del asistente de WhatsApp';
      $('promptTexto').textContent = d.prompt;
      modalPrompt.show();
    } catch (e) { fail(e); }
  }));

  cargar();
})();
