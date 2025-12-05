// netlify/functions/sw.js NEM, hanem a gyökérben: /sw.js
self.addEventListener("push", function (event) {
  const data = event.data ? event.data.json() : {};

  const title = data.title || "Növényfigyelő";
  const options = {
    body: data.body || "Új értesítés érkezett.",
    icon: "/icon.png",
    badge: "/icon.png",
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow("/") // vagy a dashboard URL-ed
  );
});
