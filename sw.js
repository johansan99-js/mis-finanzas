const CACHE_NAME = 'finanzas-hn-v3';
const ASSETS = [
  './index.html',
  './manifest.json',
  './offline.html',
  'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => 
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => e.request.mode === 'navigate' ? caches.match('./offline.html') : new Response('Offline', {status: 503})))
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() || { title: 'Mis Finanzas HN', body: 'Tienes una alerta pendiente' };
  e.waitUntil(self.registration.showNotification(data.title, { 
    body: data.body, tag: data.tag || 'alerta-finanzas', 
    icon: 'https://cdn-icons-png.flaticon.com/512/2489/2489756.png' 
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => list.length ? list[0].focus() : clients.openWindow('./index.html')));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
