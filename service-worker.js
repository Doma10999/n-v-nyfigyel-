const CACHE_NAME = "novenyfigyelo-cache-v20260820-compact-splash-v3";
const OFFLINE_URL = "offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "/",
        "/index.html",
        "/offline.html",
        "/manifest.json",
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
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // Csak GET kéréseknél használjuk az offline fallbackot
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => {
        return cached || caches.match(OFFLINE_URL);
      })
    )
  );
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
