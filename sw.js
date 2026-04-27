const CACHE_NAME = "comic-reader-shell-v7";
const APP_SHELL = [
  "./app.css?v=7",
  "./app.js?v=7",
  "./manifest.json?v=7",
  "./icons/icon-192.png?v=7",
  "./icons/icon-512.png?v=7"
];

function isStaticShellAsset(pathname) {
  return pathname.endsWith("/app.css") ||
    pathname.endsWith("/app.js") ||
    pathname.endsWith("/manifest.json") ||
    pathname.endsWith("/icon-192.png") ||
    pathname.endsWith("/icon-512.png");
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if(event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if(requestUrl.origin !== self.location.origin) return;

  if(event.request.headers.has("range")) {
    event.respondWith(fetch(event.request));
    return;
  }
  if(requestUrl.pathname.endsWith(".mp4")) {
    event.respondWith(fetch(event.request));
    return;
  }

  if(event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
    return;
  }

  if(isStaticShellAsset(requestUrl.pathname)) {
    event.respondWith(
      fetch(event.request).then(response => {
        if(response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if(cached) return cached;
      return fetch(event.request).then(response => {
        if(response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
