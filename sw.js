self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.error("Nem tudtam JSON-ként olvasni a push adatot:", e);
    }
  }

  const title = data.title || "Növényfigyelő 🌱";
  const options = {
    body:
      data.body ||
      data.message ||
      "A növényedhez érkezett egy figyelmeztetés.",
    icon: "/icon.png",
    badge: "/icon.png",
    data: {
      url: "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
