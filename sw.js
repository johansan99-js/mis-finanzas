// sw.js - Service Worker para Mis Finanzas HN v2
const CACHE_NAME = 'misfinanzas-v2.1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './offline.html',
  'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js'
];

// 🔧 Instalación: precachear recursos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('✅ Cache abierto:', CACHE_NAME);
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting()) // Activar nuevo SW inmediatamente
  );
});

// 🔧 Activación: limpiar caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 🔧 Fetch: estrategia Cache First con fallback a red
self.addEventListener('fetch', (event) => {
  // Ignorar solicitudes no-GET o de otros orígenes
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((networkResponse) => {
        // Guardar en cache si la respuesta es válida
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback a offline.html para navegación
        if (event.request.mode === 'navigate') {
          return caches.match('./offline.html');
        }
      });
    })
  );
});

// 🔔 Push Notifications (para alertas de tarjetas, vencimientos, etc.)
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {
    title: 'Mis Finanzas HN',
    body: 'Tienes una alerta pendiente',
    icon: '/icon-192.png'
  };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || 'https://cdn-icons-png.flaticon.com/512/2489/2489756.png',
      badge: data.icon || 'https://cdn-icons-png.flaticon.com/512/2489/2489756.png',
      tag: data.tag || 'finanzas-alerta',
      requireInteraction: true,
      actions: [
        { action: 'abrir', title: 'Ver App' },
        { action: 'cerrar', title: 'Cerrar' }
      ],
      data: { url: './index.html' }
    })
  );
});

// 🔔 Click en notificación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'abrir' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Enfocar ventana existente o abrir nueva
          if (clientList.length > 0) {
            return clientList[0].focus();
          }
          return clients.openWindow(event.notification.data?.url || './index.html');
        })
    );
  }
});

// 🔔 Manejar mensajes desde la app principal
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Programar notificación local desde la app
  if (event.data && event.data.type === 'NOTIFY') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: event.data.icon,
      tag: event.data.tag,
      requireInteraction: event.data.requireInteraction || false
    });
  }
});
