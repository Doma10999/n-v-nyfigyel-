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
    // 1) Feliratkozások lekérése Firestore-ból
    const subscriptionsSnapshot = await db.collection("push_subscriptions").get();

    if (subscriptionsSnapshot.empty) {
      return { statusCode: 200, body: "No subscriptions found." };
    }

    // 2) Összes user lekérése
    const allUsers = (await realtime.ref("/").get()).val();

    if (!allUsers) {
      return { statusCode: 200, body: "No users found." };
    }

    // 3) Végigmegyünk minden user -> device útvonalon
    for (const userId in allUsers) {
      const userData = allUsers[userId];

      if (!userData.devices) continue;

      const devices = userData.devices;

      for (const deviceId in devices) {
        const device = devices[deviceId];

        const sensorValue = device.sensorValue;
        const displayName = device.displayName;

        // 4) Ha az érték <= 35% → push értesítés
        if (sensorValue <= 35) {

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
    }

    return { statusCode: 200, body: "Moisture check completed." };

  } catch (error) {
    return {
      statusCode: 500,
      body: "Error: " + error.toString()
    };
  }
};
