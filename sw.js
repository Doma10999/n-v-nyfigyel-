// sw.js

self.addEventListener("push", function (event) {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.error("Push adatok parse hiba:", e);
    }
  }

  const title = data.title || "Növényfigyelő";
  const options = {
    body:
      data.body ||
      "A növényed vízszintje 35% alá esett! Öntözd meg!",
    icon: data.icon || "/icon.png",
    badge: data.badge || "/icon.png",
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow("https://novenyfigyelo.netlify.app")
  );
});
