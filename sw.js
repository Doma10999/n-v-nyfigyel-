self.addEventListener("push", (event) => {
  let data = {};

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error("Push adat parse hiba:", e);
  }

  const title = data.title || "Növényfigyelő";
  const options = {
    body: data.body || "Új értesítés érkezett.",
    icon: data.icon || "/icon.png",
    data: data.data || { url: "https://novenyfigyelo.netlify.app/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ||
    "https://novenyfigyelo.netlify.app/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
