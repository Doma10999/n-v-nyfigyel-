const admin = require("firebase-admin");
const webpush = require("web-push");
const serviceAccount = require("../../serviceAccountKey.json");

let app;
let dbInstance = null;
let webPushInitialized = false;

function getDb() {
  if (!dbInstance) {
    if (!app) {
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app"
      });
    }
    dbInstance = admin.database();
  }
  return dbInstance;
}

function initWebPush() {
  if (!webPushInitialized) {
    webpush.setVapidDetails(
      "mailto:drobnidominik@gmail.com",
      "BJ5EmlT4WDwHo9vyVZbROc4O2tkZlv5hBZVs8nbfEwJlJMdgpgEHnM9i5PugKAXYq10hbPjnvyLOBM-O3hi_Rhg",
      "EChy7SISO5NioHEB0Jsk1hgtLUvNHneiHZpFYfLGuwc"
    );
    webPushInitialized = true;
  }
}

module.exports = {
  admin,
  webpush,
  getDb,
  initWebPush,
};