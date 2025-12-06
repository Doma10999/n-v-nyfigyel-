self.addEventListener("install", (event) => {
  console.log("[SW] Telepítve");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Aktiválva");
  return self.clients.claim();
});

self.addEventListener("push", (event) => {
  console.log("[SW] Push érkezett");
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.warn("Nem JSON push payload:", e);
      data = { title: "Növényfigyelő", body: "Új értesítés érkezett." };
    }
  }

  const title = data.title || "Növényfigyelő";
  const options = {
    body: data.body || "Új értesítés érkezett.",
    icon: "/icon.png",
    badge: "/icon.png"
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});
