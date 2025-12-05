// netlify/functions/pushCommon.js
const admin = require("firebase-admin");
const webPush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

// ---- Firebase Admin init (Realtime Database) ----
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL:
      "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  });
}

// ---- Web Push / VAPID ----
// Ezek a Te kulcsaid (csak példa projekthez, ezért most kódban hagyjuk)
const VAPID_PUBLIC_KEY =
  "BHiBxPp4Ch721j6OsVus_W9jb8xXi3n8GbDuR8dwxY5c3QQOqVH7uko_oC05nZmsdsk8xO7zrWk0STTWjyE5hHQ";
const VAPID_PRIVATE_KEY = "4KeCLA749xHKD5y8RDa2-hRe8e4t7Fza-LtCFYuBoF4";

webPush.setVapidDetails(
  "mailto:info@pelda.hu", // bármi lehet
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Közös függvény a push küldéshez
async function sendPushToUser(uid, payload) {
  const db = admin.database();
  const subsRef = db.ref(`pushSubscriptions/${uid}`);

  const subsSnap = await subsRef.once("value");
  const subs = subsSnap.val() || {};

  const promises = Object.entries(subs).map(async ([subId, sub]) => {
    try {
      await webPush.sendNotification(sub, JSON.stringify(payload));
    } catch (err) {
      console.error("Push hiba:", err.statusCode, err.body);

      // Ha lejárt / törölt subscription → takarítás
      if (err.statusCode === 404 || err.statusCode === 410) {
        await subsRef.child(subId).remove();
      }
    }
  });

  await Promise.all(promises);
}

module.exports = {
  admin,
  sendPushToUser,
};
