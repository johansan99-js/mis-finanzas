// ============================================================
//  Mi Pisto HN — Service Worker v7-FIXED
//  ─────────────────────────────────────────────────────────
//  Fixes en esta versión:
//   ✅ AbortSignal.timeout() con fallback para navegadores antiguos
//   ✅ Race condition en caché de navegación
//   ✅ tasas.json con fallback completo (no rates vacío)
//   ✅ Timeouts consistentes definidos en constantes
// ============================================================

const VERSION = 'v7-fixed';
const CACHE_NAME = `mipistohn-${VERSION}`;

// Timeouts consistentes
const TIMEOUTS = {
  RATES:        3000,  // tasas.json debe ser fresco
  NAVIGATION:   4500,  // navegación puede tardar un poco
  EXTERNAL:     7000   // recursos externos más lentos
};

const ASSETS_REQUIRED = [
  '/mis-finanzas/',
  '/mis-finanzas/index.html',
  '/mis-finanzas/offline.html',
  '/mis-finanzas/manifest.json',
  '/mis-finanzas/icon-192.png',
  '/mis-finanzas/icon-512.png',
  '/mis-finanzas/tasas.json'
];

// ── HELPER: Fetch con timeout compatible (soluciona bug #2) ──
function timeoutFetch(request, ms) {
  if (AbortSignal.timeout) {
    // Navegadores modernos (2024+)
    return fetch(request, { signal: AbortSignal.timeout(ms) });
  }
  
  // Fallback para navegadores antiguos (Safari <15.3, Android <13)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  
  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('✅ Mi Pisto HN ' + VERSION + ' — cacheando assets...');
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
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('🗑️ Eliminando caché antiguo:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('✅ Mi Pisto HN ' + VERSION + ' activo');
      return self.clients.claim();
    })
  );
});

// ── FETCH: Network-first para navegación, Cache-first para assets ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── tasas.json: NETWORK-FIRST con fallback completo (FIX #4) ──
  if (url.pathname.endsWith('/tasas.json')) {
    event.respondWith((async () => {
      try {
        const networkResp = await timeoutFetch(event.request, TIMEOUTS.RATES);
        if (networkResp && networkResp.status === 200) {
          const clone = networkResp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone).catch(() => {}));
          return networkResp;
        }
      } catch (e) { /* offline o timeout */ }
      
      // Fallback #1: Usar caché
      const cached = await caches.match(event.request);
      if (cached) return cached;
      
      // Fallback #2: Devolver tasas por defecto en vez de rates vacío (FIX #4)
      return new Response(JSON.stringify({
        error: 'tasas.json no disponible (offline/timeout)',
        base: 'HNL',
        updated_at: new Date().toISOString(),
        rates: {
          USD: 26.7295,
          EUR: 31.0000,
          GTQ: 3.4813,
          NIO: 0.7218,
          MXN: 1.5176,
          CRC: 0.0530,
          PAB: 26.7295
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    })());
    return;
  }

  // Ignorar CDNs externos (Tesseract, Chart.js, SheetJS, etc.)
  const isExternal = url.origin !== self.location.origin;
  if (isExternal) {
    event.respondWith(
      timeoutFetch(event.request, TIMEOUTS.EXTERNAL)
        .catch(() => new Response('', {
          status: 503,
          statusText: 'Offline — recurso externo no disponible'
        }))
    );
    return;
  }

  // ── Navegación: caché-rápido + revalidación en background (FIX #3) ──
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match(event.request) ||
                     await caches.match('/mis-finanzas/index.html');
      
      // ✅ FIX #3: Actualización en background SIN race condition
      const updateCacheInBackground = (async () => {
        try {
          const fresh = await timeoutFetch(event.request, TIMEOUTS.NAVIGATION);
          if (fresh && fresh.status === 200) {
            const clone = fresh.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, clone);
            console.log('✅ Cache actualizado para:', event.request.url);
          }
        } catch (e) {
          console.warn('⚠️ Error actualizando caché:', e.message);
        }
      })();
      
      // ✅ event.waitUntil espera realmente al update
      event.waitUntil(updateCacheInBackground);
      
      // Devolver caché inmediatamente (faster)
      if (cached) return cached;
      
      // Si no hay caché, esperar al fetch con timeout
      try {
        const timeoutPromise = new Promise((res, rej) => {
          setTimeout(() => rej(new Error('timeout')), TIMEOUTS.NAVIGATION);
        });
        const fresh = await Promise.race([
          timeoutFetch(event.request, TIMEOUTS.NAVIGATION),
          timeoutPromise
        ]);
        return fresh;
      } catch (e) {
        // Si falla, devolver offline.html
        return caches.match('/mis-finanzas/offline.html') ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // ── Assets estáticos: cache-first con actualización en background ──
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = timeoutFetch(event.request, TIMEOUTS.EXTERNAL)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => 
              c.put(event.request, clone).catch(() => {})
            );
          }
          return response;
        })
        .catch(() => null);

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
