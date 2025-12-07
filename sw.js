self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    // ha nem JSON, üresen hagyjuk
  }

  const title = data.title || "Növényfigyelő";
  const body = data.body || "Értesítés a növényedről.";
  const options = {
    body,
    icon: "/icon.png",
    badge: "/icon.png",
    data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes("novenyfigyelo")) {
          return client.focus();
        }
      }
      return clients.openWindow("/");
    })
  );
});
