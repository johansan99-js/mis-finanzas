const CACHE_NAME = 'misfinanzas-secure-v7';
const ASSETS = [
  './index.html',
  './manifest.json',
  './offline.html'
];

// Instalación: Cachear archivos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Archivos cacheados');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación: Limpiar cachés antiguas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => 
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('🗑️ Eliminando caché antigua:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Servir desde caché o red
self.addEventListener('fetch', event => {
  // Navegación principal
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  
  // Otros recursos
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(response => {
            // Clonar respuesta para cachear
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, clone));
            return response;
          })
          .catch(() => caches.match('./offline.html'));
      })
  );
});

// Notificaciones Push
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type: 'window'})
      .then(clientsList => {
        // Si ya hay una ventana abierta, enfócala
        if (clientsList.length > 0) {
          return clientsList[0].focus();
        }
        // Si no, abrir nueva ventana
        return clients.openWindow('./index.html');
      })
  );
});

// Manejo de errores de notificación
self.addEventListener('notificationerror', event => {
  console.log('❌ Error en notificación:', event);
});
