const admin = require("firebase-admin");
const webpush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

const db = admin.firestore();
const realtime = admin.database();

exports.handler = async (event, context) => {

  try {
    // 1) Lekérjük az összes push feliratkozást
    const subscriptionsSnapshot = await db.collection("push_subscriptions").get();

    if (subscriptionsSnapshot.empty) {
      return { statusCode: 200, body: "No subscriptions found." };
    }

    // 2) Lekérjük az összes ESP-t a Firebase Realtime Database-ből
    const devices = (await realtime.ref("/devices").get()).val();

    if (!devices) {
      return { statusCode: 200, body: "No devices found." };
    }

    // 3) Végigmegyünk minden ESP-n
    for (const deviceId in devices) {
      const sensorValue = devices[deviceId].sensorValue;
      const displayName = devices[deviceId].displayName;

      // 4) Ha a szenzor érték <= 35%
      if (sensorValue <= 35) {

        // 5) Minden feliratkozónak küldünk push értesítést
        subscriptionsSnapshot.forEach(doc => {
          const subscription = doc.data().subscription;

          const payload = JSON.stringify({
            title: `${displayName} - Alacsony vízszint!`,
            body: `A vízszint ${sensorValue}% - ideje megöntözni.`,
            icon: "/icon.png"
          });

          webpush.sendNotification(subscription, payload).catch(err => {
            console.error("Push error:", err);
          });
        });
      }
    }

    return {
      statusCode: 200,
      body: "Moisture check completed."
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: "Error: " + error.toString()
    };
  }
};
