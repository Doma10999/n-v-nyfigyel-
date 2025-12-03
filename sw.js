// Service Worker – Push kezelés

self.addEventListener("push", function (event) {
  const data = event.data ? event.data.json() : {};

  self.registration.showNotification(data.title || "Növényfigyelő", {
    body: data.body || "A növény vízszintje kritikusan alacsony!",
    icon: data.icon || "/icon.png",
    badge: "/icon.png",
  });
});
