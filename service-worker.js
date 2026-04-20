const CACHE_NAME = "studio-calendar-shell-v18";

const APP_SHELL = [
  "./",
  "./index.html",
  "./calendar.html",
  "./booking.html",
  "./confirm.html",
  "./css/style.css",
  "./js/firebase-config.js",
  "./js/auth.js",
  "./js/calendar.js",
  "./js/booking.js",
  "./js/confirm.js",
  "./manifest.json",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

const SCOPE_URL = new URL(self.registration.scope);
const CACHEABLE_PATHS = new Set(
  APP_SHELL.map((asset) => new URL(asset, SCOPE_URL).pathname)
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Never cache cross-origin responses or query-parameter variants.
  if (requestUrl.origin !== self.location.origin || requestUrl.search) {
    return;
  }

  // Cache only known app shell assets.
  if (!CACHEABLE_PATHS.has(requestUrl.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse.ok) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      });
    })
  );
});