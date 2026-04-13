const CACHE_NAME = 'misfinanzas-v5.2';
const ASSETS = [
  './index.html',
  './offline.html',
  './manifest.json'
];

// Instalación: precachear recursos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Cache abierta:', CACHE_NAME);
        return cache.addAll(ASSETS).catch(err => {
          console.warn('⚠️ Algunos recursos no se pudieron cachear:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activación: limpiar cachés viejas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('🗑️ Eliminando caché vieja:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: estrategia Cache-First con fallback offline
self.addEventListener('fetch', event => {
  // IGNORAR solicitudes de chrome-extension y otros esquemas no soportados
  if (!event.request.url.startsWith('http') && 
      !event.request.url.startsWith('chrome-extension')) {
    return;
  }

  // Ignorar requests de extensiones de Chrome
  if (event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // console.log('📦 Sirviendo desde caché:', event.request.url);
          return cachedResponse;
        }

        // Si no está en caché, hacer fetch de la red
        return fetch(event.request)
          .then(networkResponse => {
            // Verificar que la respuesta sea válida
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clonar la respuesta para guardar en caché
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache).catch(err => {
                  console.warn('⚠️ No se pudo cachear:', event.request.url, err);
                });
              });

            return networkResponse;
          })
          .catch(error => {
            console.log('🌐 Error de red, sirviendo offline.html:', error);
            // Si falla la red (offline), servir offline.html para navegaciones
            if (event.request.mode === 'navigate') {
              return caches.match('./offline.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

console.log('✅ Service Worker cargado correctamente');
