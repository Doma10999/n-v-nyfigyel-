const admin = require("firebase-admin");
const webpush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

const realtime = admin.database();

exports.handler = async () => {
  try {
    // Feliratkozások lekérése Realtime DB-ből
    const subsSnap = await realtime.ref("push_subscriptions").get();
    if (!subsSnap.exists()) return { statusCode: 200, body: "No subs" };

    const subscriptions = subsSnap.val();

    // Összes user eszköz lekérése
    const allUsers = (await realtime.ref("users").get()).val();
    if (!allUsers) return { statusCode: 200, body: "No users" };

    for (const userId in allUsers) {
      const devices = allUsers[userId].devices;
      if (!devices) continue;

      for (const devId in devices) {
        const dev = devices[devId];

        if (dev.sensorValue <= 35) {
          const payload = JSON.stringify({
            title: `${dev.displayName} - Alacsony vízszint!`,
            body: `Csak ${dev.sensorValue}% maradt.`,
            icon: "/icon.png"
          });

          // Minden feliratkozásnak elküldjük
          for (const key in subscriptions) {
            const sub = subscriptions[key].subscription;
            webpush.sendNotification(sub, payload).catch(err => {
              console.log("Push error:", err);
            });
          }
        }
      }
    }

    return { statusCode: 200, body: "Push sent OK" };

  } catch (err) {
    return { statusCode: 500, body: "Error: " + err.toString() };
  }
};
