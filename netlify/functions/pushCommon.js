const admin = require("firebase-admin");
const webpush = require("web-push");
const path = require("path");

// Firebase Admin inicializálás (serviceAccountKey.json a projekt gyökerében / netlify/functions mappában)
if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

const db = admin.database();

// VAPID kulcsok (újak, amiket küldtél)
const publicVapidKey  = "BJ5EmlT4WDwHo9vyVZbROc4O2tkZlv5hBZVs8nbfEwJlJMdgpgEHnM9i5PugKAXYq10hbPjnvyLOBM-O3hi_Rhg";
const privateVapidKey = "EChy7SISO5NioHEB0Jsk1hgtLUvNHneiHZpFYfLGuwc";

webpush.setVapidDetails(
  "mailto:drobnidominik@gmail.com",
  publicVapidKey,
  privateVapidKey
);

async function saveSubscription(uid, subscription) {
  const ref = db.ref("pushSubscriptions").child(uid).push();
  await ref.set(subscription);
}

async function getUserSubscriptions(uid) {
  const snap = await db.ref("pushSubscriptions").child(uid).once("value");
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.values(data);
}

async function sendPushToUser(uid, payload) {
  const subs = await getUserSubscriptions(uid);
  const results = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      results.push({ ok: true });
    } catch (err) {
      console.error("Push küldési hiba:", err);
      results.push({ ok: false, error: err.message });
    }
  }
  return results;
}

module.exports = {
  admin,
  db,
  saveSubscription,
  getUserSubscriptions,
  sendPushToUser
};
