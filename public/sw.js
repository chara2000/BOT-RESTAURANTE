/**
 * ChefFlow PWA Service Worker v4
 * - NEVER caches /manifest.webmanifest (served by Next.js, must always be fresh)
 * - NEVER caches Auth, API, or Supabase endpoints
 * - Filters unsupported request schemes
 */

const CACHE_NAME = 'chefflow-static-v5';
const PRECACHE_ASSETS = [
  '/',
  '/favicon.svg',
];

// Install
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// Activate — clean old caches
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Fetch
self.addEventListener('fetch', function (event) {
  var url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return;
  }

  // 1. Only handle http/https
  if (!url.protocol || !url.protocol.startsWith('http')) {
    return;
  }

  // 2. ALWAYS bypass: manifest (must be served fresh by Next.js), API, Auth, Supabase
  if (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/login') ||
    url.hostname.includes('supabase.co') ||
    event.request.method !== 'GET'
  ) {
    return; // fall through to browser default (network)
  }

  // 3. Network first for navigation (HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match(event.request).then(function (res) {
          if (res) return res;
          return caches.match('/').then(function (fallback) {
            return fallback || new Response('<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Offline</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;background:#f8fafc;color:#0f172a"><h2>Conexión no disponible</h2><p>Por favor verifica tu conexión a internet e intenta de nuevo.</p></body></html>', {
              status: 503,
              headers: { 'Content-Type': 'text/html' }
            });
          });
        });
      })
    );
    return;
  }

  // 4. Stale-while-revalidate for static assets only
  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      var fetchPromise = fetch(event.request).then(function (networkResponse) {
        if (networkResponse && networkResponse.status === 200 && url.protocol.startsWith('http')) {
          var responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, responseToCache).catch(function () {});
          });
        }
        return networkResponse;
      }).catch(function () {
        return cachedResponse;
      });
      return cachedResponse || fetchPromise;
    })
  );
});
