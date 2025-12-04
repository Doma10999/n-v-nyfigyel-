// netlify/functions/sendPush.js
const admin = require("firebase-admin");
const webpush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

const db = admin.database();

const publicVapidKey  = "BA9Fs-ZMeeisRVBM5A-NJoYGudUZHsaPzWCgI8tQ_Kj5zEr-xq8tMZkoq0pTP5NjVqmpivK5PBX2GAHHgGuhbj0";
const privateVapidKey = "KYg1qLt02ykW_Cfom9Cl4KoIFBW_aXCvITyX7G_OAOQ";

webpush.setVapidDetails(
  "mailto:teszt@example.com",
  publicVapidKey,
  privateVapidKey
);

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const subsSnap = await db.ref("pushSubscriptions").once("value");
    if (!subsSnap.exists()) {
      return { statusCode: 200, body: "Nincsenek feliratkozók." };
    }

    const subs = subsSnap.val();
    const sendPromises = [];

    for (const key of Object.keys(subs)) {
      const subData = subs[key];
      const subscription = subData.subscription;
      if (!subscription) continue;

      const payload = JSON.stringify({
        title: "Növényfigyelő teszt 🌱",
        body: "Ez egy teszt push értesítés.",
        icon: "/icon.png"
      });

      sendPromises.push(
        webpush.sendNotification(subscription, payload).catch(err => {
          console.error("Push hiba:", err);
        })
      );
    }

    await Promise.all(sendPromises);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Teszt értesítés elküldve: ${sendPromises.length} feliratkozónak.` })
    };
  } catch (err) {
    console.error("sendPush error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
