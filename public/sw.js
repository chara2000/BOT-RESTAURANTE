/**
 * ChefFlow PWA Service Worker v7
 * - Fully compatible with Next.js App Router & Server Components (RSC)
 * - NEVER intercepts RSC (_rsc query/headers), APIs, Supabase, or dynamic routes
 * - Guaranteed valid Response returns (no undefined promises)
 * - Cache invalidation and clean offline fallback
 */

const CACHE_NAME = 'chefflow-pwa-v7';
const PRECACHE_ASSETS = [
  '/',
  '/favicon.svg',
];

// Install: precache essential shell assets
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// Activate: delete all previous obsolete caches
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

// Fetch handler
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (!req || req.method !== 'GET') {
    return;
  }

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  // 1. Only handle standard HTTP/HTTPS protocols
  if (!url.protocol || !url.protocol.startsWith('http')) {
    return;
  }

  // 2. ALWAYS BYPASS:
  // - Dynamic APIs, Auth, Login, Next.js Server Actions, Supabase, external APIs
  // - Next.js RSC router requests (?_rsc=... or RSC headers)
  // - Web Manifest files (must always be freshly generated)
  var isRSC = url.searchParams.has('_rsc') || req.headers.get('RSC') === '1' || req.headers.has('Next-Router-State-Tree');
  if (
    isRSC ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/login') ||
    url.hostname.includes('supabase.co') ||
    url.hostname !== self.location.hostname
  ) {
    return; // Fall through to standard browser network fetch
  }

  // 3. Navigation requests (Full page HTML load) -> Network First with offline fallback
  var isNavigation = req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'));
  if (isNavigation) {
    event.respondWith(
      fetch(req)
        .then(function (networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var copy = networkResponse.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(req, copy).catch(function () {});
            });
          }
          return networkResponse;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            if (cached) return cached;
            return caches.match('/').then(function (root) {
              if (root) return root;
              return new Response(
                '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>ChefFlow Offline</title><style>body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#f8fafc;text-align:center;padding:20px}h2{font-size:22px;margin-bottom:8px}p{color:#94a3b8;font-size:14px}button{margin-top:16px;padding:10px 22px;background:#f97316;color:white;border:none;border-radius:12px;font-weight:bold;cursor:pointer;box-shadow:0 4px 14px rgba(249,115,22,0.4)}</style></head><body><div><h2>Conexión no disponible</h2><p>Verifica tu conexión a internet para continuar usando ChefFlow.</p><button onclick="window.location.reload()">Reintentar</button></div></body></html>',
                {
                  status: 200,
                  headers: { 'Content-Type': 'text/html; charset=utf-8' }
                }
              );
            });
          });
        })
    );
    return;
  }

  // 4. Static Assets (/_next/static/*, images, fonts, icons) -> Stale While Revalidate
  var isStaticAsset = url.pathname.startsWith('/_next/static/') || /\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff|woff2|ttf|css|js)$/i.test(url.pathname);
  if (isStaticAsset) {
    event.respondWith(
      caches.match(req).then(function (cachedResponse) {
        var fetchPromise = fetch(req)
          .then(function (networkResponse) {
            if (networkResponse && networkResponse.status === 200) {
              var responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(req, responseToCache).catch(function () {});
              });
            }
            return networkResponse;
          })
          .catch(function () {
            if (cachedResponse) return cachedResponse;
            return new Response('', { status: 408, statusText: 'Request timeout' });
          });

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 5. Default fallback: do not call event.respondWith to let standard network handle it
});
