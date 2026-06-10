const CACHE = 'hcc-v23';

const STATIC_ASSETS = [
  '/manifest.json',
  '/css/style.css',
  '/js/consent.js',
  '/js/components.js',
  '/js/main.js',
  '/js/rwgps.js',
  '/js/analytics.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept API calls or non-GET requests
  if (url.pathname.startsWith('/api/') || e.request.method !== 'GET') return;

  // HTML pages — network-first, fall back to cache if offline
  if (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
