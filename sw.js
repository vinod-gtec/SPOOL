const SHELL_CACHE = "spool-shell-v1";
const AUDIO_CACHE = "spool-audio-v1";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/app.js",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== AUDIO_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  const isAudioFile = /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)(\?.*)?$/i.test(url);

  if (isAudioFile) {
    // Cache-first for audio so a track you've already played can play again offline.
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch (err) {
          return cached || Promise.reject(err);
        }
      })
    );
    return;
  }

  if (event.request.method === "GET" && url.startsWith(self.location.origin)) {
    // Cache-first for the app shell, falling back to network.
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
