// Minimal app-shell cache for installability. Deliberately does NOT cache API
// responses or manga content — those need to stay live/fresh.
const CACHE_NAME = 'hakufu-app-shell-v1';
const SHELL_FILES = ['/app/', '/app/index.html', '/app/styles.css', '/app/app.js', '/app/api.js', '/app/backup.js', '/app/reader.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Solo el shell estático — nunca /api ni googleapis (deben ir siempre a la red).
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
