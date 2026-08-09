const CACHE_NAME = "novenyfigyelo-cache-v20260809-push-v1";
const OFFLINE_URL = "offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        "index.html",
        "offline.html"
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
      "/icon2.png",

    badge:
      data.badge ||
      "/icon2.png",

    tag:
      data.tag ||
      "novenyfigyelo",

    renotify: true,

    data: {
      url:
        data.url ||
        "/",

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

  const targetUrl = new URL(
    event.notification?.data?.url || "/",
    self.location.origin
  ).href;

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
