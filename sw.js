/* Caches the app so it opens with no internet. Bump VERSION (and APP_VERSION in index.html) when the app files change. */
const VERSION = 'liftlog-v38';
const FILES = ['./', './index.html', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'];

/* cache: 'reload' skips the browser's own cache, so a new version never stores old files. */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/demo.js')) return;

  /* The app page: newest from the network when online (fresh updates), the saved copy when offline or very slow. */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const net = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok) cache.put('./index.html', res.clone());
        return res;
      });
      try {
        const res = await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
        if (res.ok) return res;
      } catch (err) { /* offline or slow: use the saved copy */ }
      return (await cache.match('./index.html')) || (await cache.match('./')) || net;
    })());
    return;
  }

  /* Icons and other files: saved copy first, refreshed in the background. */
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await fresh) || cache.match('./index.html');
    })
  );
});
