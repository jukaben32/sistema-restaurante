// Registro del service worker (app instalable en celulares y tablets de meseros)
// Relacionado con: public/sw.js, public/manifest.webmanifest
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sin PWA: la app sigue funcionando igual */ });
  });
}
