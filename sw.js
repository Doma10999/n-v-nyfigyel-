self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Aktiválva");
  return self.clients.claim();
});

self.addEventListener("push", (event) => {
  console.log("[SW] Push érkezett:", event.data && event.data.text());
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error("Nem sikerült a push payloadot JSON-ként olvasni:", e);
  }

  const title = data.title || "Növényfigyelő";
  const options = {
    body: data.body || "Érkezett egy új értesítés.",
    icon: "/icon.png",
    badge: "/icon.png",
    data: data.data || {},
    vibrate: [200, 100, 200]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
