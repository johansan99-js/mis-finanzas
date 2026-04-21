const CACHE_NAME = 'misfinanzas-secure-v8';

// Rutas absolutas relativas al scope del SW (/mis-finanzas/)
const ASSETS = [
  '/mis-finanzas/',
  '/mis-finanzas/index.html',
  '/mis-finanzas/manifest.json',
  '/mis-finanzas/icon-192.png',
  '/mis-finanzas/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('✅ Cacheando assets críticos...');
      return Promise.allSettled(
        ASSETS.map(url => 
          cache.add(url).catch(err => console.warn(`⚠️ No se pudo cachear ${url}:`, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => 
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('🗑️ Eliminando caché antiguo:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then(response => {
        // Solo cachear respuestas exitosas
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone).catch(err => {
              console.warn('⚠️ No se pudo guardar en caché:', err);
            });
          });
        }
        return response;
      }).catch(() => {
        // Fallback robusto para navegación offline
        if (event.request.mode === 'navigate') {
          // Intentar con ruta absoluta primero, luego relativa
          return caches.match('/mis-finanzas/index.html')
            .then(res => res || caches.match('./index.html'))
            .then(res => res || caches.match('index.html'));
        }
        // Para otros recursos, retornar error de red
        return new Response('Offline - Recurso no disponible', { 
          status: 503, 
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      });
    })
  );
});
