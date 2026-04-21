const CACHE_NAME = 'misfinanzas-secure-v8';

// Agregamos la ruta principal './' y los iconos al caché crítico
const ASSETS = [
  './', 
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Instalación: Cacheo "A prueba de fallos"
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('✅ Intentando cachear archivos clave...');
      // Promise.allSettled asegura que el SW se instale aunque falte 1 archivo
      return Promise.allSettled(
        ASSETS.map(url => 
          cache.add(url).catch(err => console.warn(`⚠️ Omitiendo ${url}: no encontrado`))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpiar cachés viejas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => 
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Lógica robusta para Offline
self.addEventListener('fetch', event => {
  // Ignorar peticiones que no sean GET (como envíos de formularios)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // 1. Si está en caché, devuélvelo
      if (cachedResponse) return cachedResponse;

      // 2. Si no, búscalo en internet y guárdalo en caché
      return fetch(event.request).then(response => {
        if(response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // 3. Si no hay internet y falla, devuelve siempre el index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
