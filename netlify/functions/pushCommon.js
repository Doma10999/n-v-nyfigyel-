// netlify/functions/pushCommon.js
const admin = require("firebase-admin");
const webPush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

// --- Firebase Admin init (Realtime Database) ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  });
}

// --- VAPID kulcsok (AMIKET TE ADTÁL) ---
const VAPID_PUBLIC_KEY  = "BHiBxPp4Ch721j6OsVus_W9jb8xXi3n8GbDuR8dwxY5c3QQOqVH7uko_oC05nZmsdsk8xO7zrWk0STTWjyE5hHQ";
const VAPID_PRIVATE_KEY = "4KeCLA749xHKD5y8RDa2-hRe8e4t7Fza-LtCFYuBoF4";

webPush.setVapidDetails(
  "mailto:info@pelda.hu",  // lehet saját email címed is
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// --- Közös push küldő függvény egy adott userre ---
async function sendPushToUser(uid, payload) {
  const db = admin.database();
  const subsRef = db.ref(`pushSubscriptions/${uid}`);

  const subsSnap = await subsRef.once("value");
  const subs = subsSnap.val() || {};

  const sendPromises = Object.entries(subs).map(async ([subId, sub]) => {
    try {
      await webPush.sendNotification(sub, JSON.stringify(payload));
    } catch (err) {
      console.error("Push hiba:", err.statusCode, err.body);

      // Ha lejárt / törölt subscription, takarítsuk ki
      if (err.statusCode === 404 || err.statusCode === 410) {
        await subsRef.child(subId).remove();
      }
    }
  });

  await Promise.all(sendPromises);
}

module.exports = {
  admin,
  sendPushToUser,
  VAPID_PUBLIC_KEY   // ha bárhol kell kliens oldalon, innen is látod
};
