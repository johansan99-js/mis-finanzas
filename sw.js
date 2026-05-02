// ============================================================
//  Mi Pisto HN — Service Worker v13-multimoneda-tx
//  ─────────────────────────────────────────────────────────
//  Cambios en esta versión:
//   ✅ MULTIMONEDA EN TRANSACCIONES (Caso A):
//        - Modal de Gasto e Ingreso: selector de moneda
//          (HNL/USD/EUR/GTQ/MXN/NIO/CRC)
//        - Conversión en vivo mientras tecleás: muestra
//          el equivalente en HNL con la tasa correcta
//          y de qué lado (compra/venta)
//        - Gasto en USD → tasa ASK (venta) automática
//          (necesitás dólares = banco te los vende)
//        - Ingreso en USD → tasa BID (compra) automática
//          (recibís dólares = banco te los compra)
//        - Las transacciones guardan originalAmount,
//          originalCurrency, conversionRate y conversionSide
//        - El historial muestra: "+\$100.00 USD ≈ +L.2,659.65
//          @ L.26.5965 (compra)" para trazabilidad total
//
//  Cambios heredados de v12-bid-ask-rates:
//   ✅ Tasas con compra/venta (bid/ask)
//   ✅ tasas.json con formato v2 + retrocompat
// ============================================================

const VERSION = 'v13-multimoneda-tx';
const CACHE_NAME = `mipistohn-${VERSION}`;

// FIX: Detectar el scope automáticamente del registro del SW
// Esto resuelve URLs como /mi-pisto-hn/, /mis-finanzas/, /, etc.
const SCOPE = self.registration ? self.registration.scope : self.location.href.replace(/sw\.js.*$/, '');
const BASE_PATH = new URL(SCOPE).pathname;  // ej: "/mi-pisto-hn/"

console.log(`📍 [SW ${VERSION}] Base path detectado: ${BASE_PATH}`);

// Timeouts consistentes
const TIMEOUTS = {
  RATES:        3000,
  NAVIGATION:   4500,
  EXTERNAL:     7000
};

// FIX: Construir URLs dinámicamente con el path real
const ASSETS_REQUIRED = [
  BASE_PATH,
  BASE_PATH + 'index.html',
  BASE_PATH + 'offline.html',
  BASE_PATH + 'manifest.json',
  BASE_PATH + 'tasas.json'
];

// Assets opcionales (no fallan si no existen)
const ASSETS_OPTIONAL = [
  BASE_PATH + 'icon-192.png',
  BASE_PATH + 'icon-512.png'
];

// ── HELPER: Fetch con timeout compatible ──
function timeoutFetch(request, ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return fetch(request, { signal: AbortSignal.timeout(ms) });
  }
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  
  return fetch(request, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      console.log(`✅ Mi Pisto HN ${VERSION} — cacheando assets...`);
      
      // FIX: Cachear obligatorios y opcionales por separado
      // Los obligatorios usan addAll para fallar rápido si hay problemas
      // Los opcionales usan add individual con catch (no bloquea install)
      
      // Required assets (con manejo individual de errores)
      await Promise.allSettled(
        ASSETS_REQUIRED.map(url =>
          cache.add(url).catch(err => {
            console.warn(`⚠️ No se pudo cachear ${url}:`, err.message);
          })
        )
      );
      
      // Optional assets (silenciosos)
      await Promise.allSettled(
        ASSETS_OPTIONAL.map(url =>
          cache.add(url).catch(() => {
            // Silencioso - los iconos pueden no existir
          })
        )
      );
      
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
      console.log(`✅ Mi Pisto HN ${VERSION} activo`);
      return self.clients.claim();
    })
  );
});

// ── FETCH ────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // ── tasas.json: NETWORK-FIRST con fallback completo ──
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
      
      const cached = await caches.match(event.request);
      if (cached) return cached;
      
      // Fallback con tasas por defecto
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

  // ── Navegación: caché-rápido + revalidación en background ──
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      // FIX: Usar BASE_PATH dinámico para fallback
      const cached = await caches.match(event.request) ||
                     await caches.match(BASE_PATH + 'index.html');
      
      const updateCacheInBackground = (async () => {
        try {
          const fresh = await timeoutFetch(event.request, TIMEOUTS.NAVIGATION);
          if (fresh && fresh.status === 200) {
            const clone = fresh.clone();
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, clone);
          }
        } catch (e) {
          // Silencioso
        }
      })();
      
      event.waitUntil(updateCacheInBackground);
      
      if (cached) return cached;
      
      try {
        const fresh = await timeoutFetch(event.request, TIMEOUTS.NAVIGATION);
        return fresh;
      } catch (e) {
        return caches.match(BASE_PATH + 'offline.html') ||
               new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Assets estáticos: cache-first con actualización en background
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
      icon:    BASE_PATH + 'icon-192.png',
      badge:   BASE_PATH + 'icon-192.png',
      vibrate: [200, 100, 200, 100, 200],
      tag:     'mipistohn-recordatorio',
      renotify: true,
      data:    { url: BASE_PATH }
    })
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : BASE_PATH;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(BASE_PATH) && 'focus' in client) {
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
