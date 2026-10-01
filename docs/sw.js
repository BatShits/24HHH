// Service worker: keeps the app, route data and saved map tiles available offline.
const VERSION = '2026-10-01-3f97b0f';
const APP_CACHE = 'hhh-app-' + VERSION;
const TILE_CACHE = 'hhh-tiles';
const SHELL = ['./', 'index.html', 'styles.css', 'sun.js', 'map.js', 'plan.js', 'app.js', 'version.js', 'manifest.webmanifest',
  'data/routes.json', 'data/areas.json', 'data/trails.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))  // skip the browser's HTTP cache so an update never caches stale files).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('hhh-app-') && k !== APP_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'basemap.nationalmap.gov') {
    e.respondWith(caches.open(TILE_CACHE).then(async c => {
      const hit = await c.match(e.request.url);
      if (hit) return hit;
      try { const r = await fetch(e.request.url, { mode: 'cors' }); if (r.ok) c.put(e.request.url, r.clone()); return r; }
      catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() => caches.match('index.html'))));
});
