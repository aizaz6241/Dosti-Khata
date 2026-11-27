// Dosti Khata service worker
// 1) App offline khule (sab files pehle se save)  2) Push notifications
const VERSION = '__VERSION__';
const CACHE = 'khata-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('khata-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) return;
  if (req.mode === 'navigate') {
    // Page: pehle net, na ho to save shuda
    const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); } return r; });
    const slow = new Promise((res) => setTimeout(res, 3500)).then(() => caches.match('/'));
    e.respondWith(Promise.race([net.catch(() => caches.match('/')), slow.then((hit) => hit || net)]).then((r) => r || net));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return r;
  })));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Dosti Khata', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    vibrate: [70, 50, 70, 50, 180], // Dosti Khata ka apna pattern (Android)
    silent: false,
    timestamp: Date.now(),
    data: { url: d.url || '/' },
  }).then(() => self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'refresh', chime: true })))));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.postMessage({ type: 'refresh' }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
