const CACHE_NAME = "novenyfigyelo-cache-v20261025-bright1";
const OFFLINE_URL = "offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "/",
        "/index.html",
        "/offline.html",
        "/manifest.json",
        "/dashboard.css?v=20261025bright1",
        "/dashboard.js?v=20261025bright1",
        "/pwa-icon-192.png",
        "/pwa-icon-512.png"
      ])
    )
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("novenyfigyelo-cache-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Firebase/auth requests never enter the app cache. HTML fallback is navigation only.
  const appFiles = /\.(?:html|css|js|png|svg|json|woff2)$/i.test(url.pathname) || url.pathname === '/';
  if (!appFiles) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      if (request.mode === 'navigate') return (await cache.match('/offline.html')) || (await cache.match(request)) || Response.error();
      const cached = await cache.match(request);
      if (cached) return cached;
      return Response.error();
    }
  })());
});

/* =========================================================
   NÖVÉNYFIGYELŐ WEB PUSH
   ========================================================= */

function getSafeAppUrl(rawUrl) {
  try {
    const candidate = new URL(rawUrl || "/", self.location.origin);
    if (candidate.origin === self.location.origin) {
      return candidate.href;
    }
  } catch (error) {
    // Hibás vagy másik domainre mutató URL esetén az app főoldala nyílik meg.
  }

  return new URL("/", self.location.origin).href;
}

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data
      ? event.data.json()
      : {};
  } catch (error) {
    data = {
      title: "Növényfigyelő",
      body: event.data
        ? event.data.text()
        : "Új értesítés érkezett."
    };
  }

  const title =
    data.title ||
    "Növényfigyelő";

  const options = {
    body:
      data.body ||
      "Új értesítés érkezett.",

    icon:
      data.icon ||
      "/pwa-icon-192.png",

    badge:
      data.badge ||
      "/pwa-icon-192.png",

    tag:
      data.tag ||
      "novenyfigyelo",

    renotify: true,

    silent: false,

    vibrate: [120, 70, 120],

    timestamp:
      Number(data.timestamp) ||
      Date.now(),

    requireInteraction:
      data.type === "battery_critical",

    data: {
      url:
        getSafeAppUrl(data.url),

      type:
        data.type ||
        "general",

      timestamp:
        data.timestamp ||
        Date.now()
    }
  };

  event.waitUntil(
    self.registration.showNotification(
      title,
      options
    )
  );
});


/* =========================================================
   ÉRTESÍTÉSRE KATTINTÁS
   ========================================================= */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = getSafeAppUrl(
    event.notification?.data?.url
  );

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true
      })
      .then((clientList) => {

        for (const client of clientList) {
          try {
            const clientUrl =
              new URL(client.url);

            const target =
              new URL(targetUrl);

            if (
              clientUrl.origin === target.origin &&
              "focus" in client
            ) {

              if (
                "navigate" in client &&
                client.url !== targetUrl
              ) {
                return client
                  .navigate(targetUrl)
                  .then(() => client.focus());
              }

              return client.focus();
            }

          } catch (error) {
            // Ha egy URL nem feldolgozható,
            // egyszerűen továbbmegyünk.
          }
        }

        if (self.clients.openWindow) {
          return self.clients.openWindow(
            targetUrl
          );
        }

        return undefined;
      })
  );
});
