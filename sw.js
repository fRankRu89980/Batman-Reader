const CACHE_NAME = "comic-reader-shell-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.css?v=6",
  "./app.js?v=6",
  "./manifest.json?v=6",
  "./icons/icon-192.png?v=6",
  "./icons/icon-512.png?v=6"
];

function isAppShellAsset(pathname) {
  return pathname.endsWith("/") ||
    pathname.endsWith("/index.html") ||
    pathname.endsWith("/app.css") ||
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

  if(event.request.mode === "navigate" || isAppShellAsset(requestUrl.pathname)) {
    event.respondWith(
      fetch(event.request).then(response => {
        if(response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => {
        if(event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
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
