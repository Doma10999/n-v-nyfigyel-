const admin = require("firebase-admin");
const webpush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

let app;
let dbInstance = null;
let webPushInitialized = false;

function getDb() {
  if (!dbInstance) {
    if (!app) {
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
      });
    }
    dbInstance = admin.database();
  }
  return dbInstance;
}

function initWebPush() {
  if (webPushInitialized) return;

  // Itt a VAPID kulcsok (ezek NEM látszanak a böngészőben, csak a szerveren)
  const publicKey = "BJ5EmlT4WDwHo9vyVZbROc4O2tkZlv5hBZVs8nbfEwJlJMdgpgEHnM9i5PugKAXYq10hbPjnvyLOBM-O3hi_Rhg";
  const privateKey = "EChy7SISO5NioHEB0Jsk1hgtHkZKGu4bTq9e7rlNZ_UlLW2VtZ2gxoxf2Vm-sqG2iZyJthEdA70BovMiSpT6Oc";

  webpush.setVapidDetails(
    "mailto:drobni.dominik@gmail.com",
    publicKey,
    privateKey
  );
  webPushInitialized = true;
}

module.exports = {
  getDb,
  initWebPush,
  webpush,
};
