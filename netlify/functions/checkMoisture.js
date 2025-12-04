// netlify/functions/checkMoisture.js
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

// A SAJÁT VAPID kulcsaid, amiket már használtál:
const publicVapidKey  = "BA9Fs-ZMeeisRVBM5A-NJoYGudUZHsaPzWCgI8tQ_Kj5zEr-xq8tMZkoq0pTP5NjVqmpivK5PBX2GAHHgGuhbj0";
const privateVapidKey = "KYg1qLt02ykW_Cfom9Cl4KoIFBW_aXCvITyX7G_OAOQ"; // a mostani sendPush.js-ből

webpush.setVapidDetails(
  "mailto:teszt@example.com",   // ide bármilyen emailt írhatsz
  publicVapidKey,
  privateVapidKey
);

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    // 1) ÖSSZES növény lekérése: users/{uid}/devices/{deviceId}/sensorValue
    const usersSnap = await db.ref("users").once("value");

    let kellErtesites = false;

    if (usersSnap.exists()) {
      usersSnap.forEach(userSnap => {
        const devicesSnap = userSnap.child("devices");
        devicesSnap.forEach(deviceSnap => {
          const sensorValue = deviceSnap.child("sensorValue").val();
          if (typeof sensorValue === "number" && sensorValue <= 35) {
            kellErtesites = true;
          }
        });
      });
    }

    if (!kellErtesites) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Minden növény 35% felett van, nincs értesítés." })
      };
    }

    // 2) Feliratkozások lekérése: /pushSubscriptions
    const subsSnap = await db.ref("pushSubscriptions").once("value");
    if (!subsSnap.exists()) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Nincsenek feliratkozók." })
      };
    }

    const subs = subsSnap.val();
    const sendPromises = [];

    for (const key of Object.keys(subs)) {
      const subData = subs[key];
      const subscription = subData.subscription;
      if (!subscription) continue;

      const payload = JSON.stringify({
        title: "Növényfigyelő 🌱",
        body: "Az egyik növényed vízszintje 35% alá esett. Nézd meg az alkalmazásban!",
        icon: "/icon.png"
      });

      sendPromises.push(
        webpush
          .sendNotification(subscription, payload)
          .catch(err => {
            console.error("Push küldési hiba:", err);
          })
      );
    }

    await Promise.all(sendPromises);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Értesítések elküldve: ${sendPromises.length} feliratkozónak.` })
    };
  } catch (err) {
    console.error("checkMoisture error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" })
    };
  }
};
