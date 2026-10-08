// Service worker de Restaurant Martin POS (app instalable).
// - Archivos estáticos (vendor, css, js, íconos): caché con actualización en segundo plano.
// - Páginas: siempre desde la red; si no hay conexión, muestra /offline.html.
// - API, pagos y webhooks: nunca se cachean.
const VERSION = 'rm-v1';
const STATIC = [
  '/offline.html',
  '/css/martin.css',
  '/icons/icon-192.png',
  '/icons/icon.svg',
  '/vendor/bootstrap/css/bootstrap.min.css',
  '/vendor/bootstrap/js/bootstrap.bundle.min.js',
  '/vendor/bootstrap-icons/bootstrap-icons.css',
  '/vendor/sweetalert2/sweetalert2.all.min.js',
  '/vendor/jquery/jquery.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function esEstatico(url) {
  return /^\/(vendor|css|js|icons)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/stripe/') || url.pathname.startsWith('/pago/')) return;

  if (esEstatico(url)) {
    // stale-while-revalidate
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(req);
        const red = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
        return cached || red;
      })
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
  }
});
