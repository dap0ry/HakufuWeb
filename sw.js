// App-shell cache, network-first. A previous cache-first version could get
// stuck serving a stale build even after fixes were deployed — network-first
// means online visitors always get the latest; only actually-offline visits
// fall back to whatever was last cached. Never touches /api or googleapis.com
// (those need to stay live, or are handled by offline-store.js's IndexedDB
// cache instead).
const CACHE_NAME = 'hakufu-shell-v7';
const SHELL_FILES = ['/', '/index.html', '/webapp.js', '/api.js', '/account.js', '/friends.js', '/settings.js', '/reader.js', '/offline-store.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
