const CACHE_NAME = "comic-reader-shell-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./storie.html",
  "./personaggi.html",
  "./roulette.html",
  "./crediti.html",
  "./app.css?v=7",
  "./app.js?v=7",
  "./site-menu.js?v=7",
  "./manifest.json?v=7",
  "./icons/icon-192.png?v=7",
  "./icons/icon-512.png?v=7"
];

function isAppShellAsset(pathname) {
  return pathname.endsWith("/") ||
    pathname.endsWith("/index.html") ||
    pathname.endsWith("/storie.html") ||
    pathname.endsWith("/personaggi.html") ||
    pathname.endsWith("/roulette.html") ||
    pathname.endsWith("/crediti.html") ||
    pathname.endsWith("/app.css") ||
    pathname.endsWith("/app.js") ||
    pathname.endsWith("/site-menu.js") ||
    pathname.endsWith("/manifest.json") ||
    pathname.endsWith("/icon-192.png") ||
    pathname.endsWith("/icon-512.png");
}

function isCacheableStaticAsset(pathname) {
  return /\.(?:css|js|json|png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname);
}

function isMediaAsset(pathname) {
  return /\.(?:mp4|mp3|wav|ogg|m4a|webm)$/i.test(pathname);
}

async function cacheNetworkResponse(request, response) {
  if(!response || response.status !== 200) {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function handleAppShellRequest(request) {
  try {
    const networkResponse = await fetch(request);
    return cacheNetworkResponse(request, networkResponse);
  } catch {
    const cachedResponse = await caches.match(request);
    if(cachedResponse) {
      return cachedResponse;
    }

    if(request.mode === "navigate") {
      return caches.match("./index.html");
    }

    throw new Error("Risorsa shell non disponibile");
  }
}

async function handleStaticAssetRequest(request) {
  const cachedResponse = await caches.match(request);
  if(cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  return cacheNetworkResponse(request, networkResponse);
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
  if(isMediaAsset(requestUrl.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if(event.request.mode === "navigate" || isAppShellAsset(requestUrl.pathname)) {
    event.respondWith(handleAppShellRequest(event.request));
    return;
  }

  if(isCacheableStaticAsset(requestUrl.pathname)) {
    event.respondWith(handleStaticAssetRequest(event.request));
  }
});


