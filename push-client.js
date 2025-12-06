const publicVapidKey = "BJ5EmlT4WDwHo9vyVZbROc4O2tkZlv5hBZVs8nbfEwJlJMdgpgEHnM9i5PugKAXYq10hbPjnvyLOBM-O3hi_Rhg";

// VAPID kulcs konvertálása Uint8Array-re
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Push értesítésre való feliratkozás
async function registerPush(uid) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.log("Push értesítés nem támogatott ezen az eszközön.");
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
    });

    // Feliratkozás elküldése a Netlify function-nek
    const response = await fetch("/.netlify/functions/registerPush", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid: uid,
        subscription: subscription,
      }),
    });

    const data = await response.json();
    console.log("Push feliratkozás mentve:", data);
  } catch (err) {
    console.error("Hiba a push feliratkozásnál:", err);
  }
}
