const admin = require("firebase-admin");
const webPush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

// ---- Firebase Admin init (Realtime Database) ----
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  });
}

// ---- Web Push / VAPID ----
// FIGYELEM: ezek publikus GitHub-ban lesznek, csak teszt célra használd így.
const VAPID_PUBLIC_KEY =
  "BHiBxPp4Ch721j6OsVus_W9jb8xXi3n8GbDuR8dwxY5c3QQOqVH7uko_oC05nZmsdsk8xO7zrWk0STTWjyE5hHQ";
const VAPID_PRIVATE_KEY =
  "4KeCLA749xHKD5y8RDa2-hRe8e4t7Fza-LtCFYuBoF4";

webPush.setVapidDetails(
  "mailto:info@novenyfigyelo.hu",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Közös push-küldő: egy user összes subscription-jére küld
async function sendPushToUser(uid, payload) {
  const db = admin.database();
  const subsRef = db.ref(`pushSubscriptions/${uid}`);

  const subsSnap = await subsRef.once("value");
  const subs = subsSnap.val() || {};

  const entries = Object.entries(subs);
  if (entries.length === 0) {
    console.log(`Nincs subscription ehhez az UID-hez: ${uid}`);
    return;
  }

  const sendPromises = entries.map(async ([subId, sub]) => {
    try {
      await webPush.sendNotification(sub, JSON.stringify(payload));
      console.log(`Push OK -> uid=${uid}, subId=${subId}`);
    } catch (err) {
      console.error("Push hiba:", err.statusCode, err.body || err.toString());
      // Ha lejárt / törölt subscription, töröljük
      if (err.statusCode === 404 || err.statusCode === 410) {
        await subsRef.child(subId).remove();
        console.log(`Törölve lejárt subscription: uid=${uid}, subId=${subId}`);
      }
    }
  });

  await Promise.all(sendPromises);
}

module.exports = {
  admin,
  webPush,
  VAPID_PUBLIC_KEY,
  sendPushToUser,
};
