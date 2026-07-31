const VERSION = 'hamyar-kf-v1.0.1-github-pages';
const CORE = [
  './','./index.html','./offline.html','./styles.css','./manifest.webmanifest',
  './js/app.js','./js/db.js','./js/data.js','./js/rubrics.js',
  './assets/icon-96.png','./assets/icon-192.png','./assets/icon-512.png','./assets/apple-touch-icon.png','./assets/icon-maskable-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return response;
    }).catch(() => caches.match('./index.html').then(r => r || caches.match('./offline.html'))));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response && response.ok && ['script','style','image','manifest'].includes(event.request.destination)) {
      const copy=response.clone(); caches.open(VERSION).then(c=>c.put(event.request,copy));
    }
    return response;
  }).catch(() => caches.match('./offline.html'))));
});
self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting(); });
