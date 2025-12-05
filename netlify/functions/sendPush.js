// netlify/functions/sendPush.js
const admin = require("firebase-admin");
const webpush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  });
}
const realtime = admin.database();

const publicVapidKey = "IDE_A_PUBLIC_VAPID_KEY_TÖL";
const privateVapidKey = "IDE_A_PRIVATE_VAPID_KEY_TÖL";

webpush.setVapidDetails(
  "mailto:valami@emailcimed.hu",
  publicVapidKey,
  privateVapidKey
);

exports.handler = async (event) => {
  try {
    const bodyObj = JSON.parse(event.body || "{}");
    const title = bodyObj.title || "Növényfigyelő 🌱";
    const body =
      bodyObj.body || "Ez egy teszt értesítés a Növényfigyelőtől.";

    const payload = JSON.stringify({ title, body });

    const subsSnap = await realtime.ref("pushSubscriptions").once("value");
    if (!subsSnap.exists()) {
      return { statusCode: 200, body: "Nincsenek feliratkozók." };
    }

    const subs = subsSnap.val();
    const sendPromises = Object.values(subs).map((subObj) => {
      const subscription = subObj.subscription || subObj;
      return webpush
        .sendNotification(subscription, payload)
        .catch((err) => console.error("Push hiba:", err));
    });

    await Promise.all(sendPromises);

    return { statusCode: 200, body: "Teszt push elküldve." };
  } catch (err) {
    console.error("sendPush hiba:", err);
    return { statusCode: 500, body: err.toString() };
  }
};
