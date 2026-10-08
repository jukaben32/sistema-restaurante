// Ayudas para móviles (se carga desde el menú superior en las pantallas del personal)
// - Envuelve las tablas anchas para que se desplacen de lado sin deformar la página
// - Sugiere instalar la app: en Android (Chrome) con un botón; en iPhone (Safari) con la indicación
//   "Compartir → Añadir a pantalla de inicio" (iOS no permite instalar con un botón)
// Relacionado con: public/css/movil.css, public/manifest.webmanifest, views/partials/navbar.ejs
(function () {
  'use strict';

  // 1) Tablas sin contenedor responsive
  document.querySelectorAll('table').forEach(function (t) {
    if (t.closest('.table-responsive') || t.closest('.rm-scroll-x') || t.closest('.dataTables_wrapper')) return;
    var w = document.createElement('div');
    w.className = 'table-responsive rm-scroll-x';
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  });

  // 2) Banner de instalación
  var KEY = 'rm-install-oculto';
  function oculto() { try { return localStorage.getItem(KEY) === '1'; } catch (_) { return false; } }
  function ocultar() { try { localStorage.setItem(KEY, '1'); } catch (_) {} }
  var instalada = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  if (instalada || oculto()) return;

  function banner(texto, textoBoton, alAceptar) {
    if (document.querySelector('.rm-install')) return;
    var d = document.createElement('div');
    d.className = 'rm-install';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Instalar la app');
    var img = document.createElement('img');
    img.src = '/icons/icon-192.png';
    img.alt = '';
    var txt = document.createElement('div');
    txt.className = 'txt';
    txt.textContent = texto;
    d.appendChild(img);
    d.appendChild(txt);
    if (textoBoton) {
      var ok = document.createElement('button');
      ok.className = 'ok';
      ok.type = 'button';
      ok.textContent = textoBoton;
      ok.addEventListener('click', function () { alAceptar(); d.remove(); });
      d.appendChild(ok);
    }
    var no = document.createElement('button');
    no.className = 'no';
    no.type = 'button';
    no.setAttribute('aria-label', 'Cerrar');
    no.textContent = '✕';
    no.addEventListener('click', function () { ocultar(); d.remove(); });
    d.appendChild(no);
    document.body.appendChild(d);
  }

  // Android / Chrome: el navegador avisa cuándo se puede instalar
  var evento = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    evento = e;
    banner('Instala Restaurant Martin en tu teléfono para abrirla como una app.', 'Instalar', function () {
      evento.prompt();
      evento.userChoice.finally(function () { ocultar(); });
    });
  });

  // iPhone / iPad (Safari): no hay botón de instalar; se explica el gesto
  var ua = window.navigator.userAgent || '';
  var esIos = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  var esSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
  if (esIos && esSafari) {
    setTimeout(function () {
      banner('Para instalarla en tu iPhone: toca el botón Compartir y elige «Añadir a pantalla de inicio».', null, null);
    }, 2500);
  }
})();
