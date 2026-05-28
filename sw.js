const CACHE_NAME = 'qoan-cache-v3';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.allSettled(urlsToCache.map(url => cache.add(url)));
      })
  );
});

self.addEventListener('fetch', event => {
  // Ignorar peticiones que no sean GET (como POST/PUT a Supabase o GitHub)
  if (event.request.method !== 'GET') {
      return;
  }

  // Estrategia: Network First, fallback to Cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Si la red responde bien, guardamos en caché (solo recursos locales/basic para evitar corromper APIs)
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red (offline), buscamos en la caché
        return caches.match(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
