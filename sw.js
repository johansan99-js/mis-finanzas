// ============================================================
//  Mi Pisto HN — Service Worker v3
//  Paleta Guacamaya Roja · Moneda 50¢ Lempira
//  Cuentas Efectivo + Ahorro · Conciliación por cuenta
// ============================================================

const CACHE_NAME     = 'mipistohn-v3';
const CACHE_STATIC   = 'mipistohn-static-v3';

const ASSETS_REQUIRED = [
  '/mis-finanzas/',
  '/mis-finanzas/index.html',
  '/mis-finanzas/offline.html',
  '/mis-finanzas/manifest.json',
  '/mis-finanzas/icon-192.png',
  '/mis-finanzas/icon-512.png'
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('✅ Mi Pisto HN v3 — cacheando assets...');
      return Promise.allSettled(
        ASSETS_REQUIRED.map(url =>
          cache.add(url).catch(err =>
            console.warn(`⚠️ No se pudo cachear ${url}:`, err)
          )
        )
      );
    }).then(() => {
      console.log('✅ Cache completado — saltando espera');
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: limpiar cachés viejos ──────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== CACHE_STATIC)
          .map(name => {
            console.log('🗑️ Eliminando caché antiguo:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('✅ Mi Pisto HN v3 activo');
      return self.clients.claim();
    })
  );
});

// ── FETCH: Network-first para navegación, Cache-first para assets ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignorar CDNs externos (Tesseract, Chart.js, SheetJS, etc.)
  const isExternal = url.origin !== self.location.origin;
  if (isExternal) {
    event.respondWith(
      fetch(event.request, { signal: AbortSignal.timeout(8000) })
        .catch(() => new Response('', {
          status: 503,
          statusText: 'Offline — recurso externo no disponible'
        }))
    );
    return;
  }

  // Para navegación (páginas HTML): network-first con fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached ||
              caches.match('/mis-finanzas/index.html').then(r => r ||
              caches.match('/mis-finanzas/offline.html'))
            )
        )
    );
    return;
  }

  // Para assets estáticos: cache-first con actualización en background
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone).catch(() => {}));
        }
        return response;
      }).catch(() => null);

      return cachedResponse || fetchPromise || new Response('', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    })
  );
});

// ── PUSH NOTIFICATIONS ────────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Mi Pisto HN', body: 'Tienes un recordatorio de pago.' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/mis-finanzas/icon-192.png',
      badge:   '/mis-finanzas/icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag:     'mipistohn-recordatorio',
      renotify: true,
      data:    { url: '/mis-finanzas/' }
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/mis-finanzas/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/mis-finanzas') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── MESSAGE: control desde la app ─────────────────────────────
self.addEventListener('message', event => {
  if (!event.data) return;

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'CACHE_URLS':
      if (Array.isArray(event.data.urls)) {
        caches.open(CACHE_NAME).then(cache => {
          cache.addAll(event.data.urls).catch(e => console.warn('Cache error:', e));
        });
      }
      break;

    case 'CLEAR_CACHE':
      caches.keys().then(keys => {
        Promise.all(keys.map(k => caches.delete(k)));
      });
      break;
  }
});
