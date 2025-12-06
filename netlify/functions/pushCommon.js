const admin = require("firebase-admin");
const webpush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

// Firebase Admin inicializálása (Realtime Database)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

const db = admin.database();

// Web Push VAPID kulcsok
webpush.setVapidDetails(
  "mailto:drobnidominik@gmail.com",
  "BJ5EmlT4WDwHo9vyVZbROc4O2tkZlv5hBZVs8nbfEwJlJMdgpgEHnM9i5PugKAXYq10hbPjnvyLOBM-O3hi_Rhg",
  "EChy7SISO5NioHEB0Jsk1hgtLUvNHneiHZpFYfLGuwc"
);

module.exports = {
  admin,
  db,
  webpush
};
