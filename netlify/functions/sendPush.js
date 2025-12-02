exports.config = {
  schedule: "0 */6 * * *" // 6 óránként (éjfél, 6, 12, 18 óra)
};

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const webpush = require("web-push");
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, get } = require("firebase/database");

// VAPID kulcsok!
const vapidKeys = {
  publicKey: "BCYdagojWk6evEFFMhZbdE8FGpQQiNycuvchcaSCFlsHv4uLF_xvkB4UObcIcz2jmNwkq2tOHDhawETwboltZOiE",
  privateKey: "W8LR0MvwPf4fzFMAUx8pfI6y9Bn2rU4PE2zVpgDtPA_Q"
};
webpush.setVapidDetails('mailto:email@domain.hu', vapidKeys.publicKey, vapidKeys.privateKey);

// Firebase inicializálás admin SDK-val:
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}
const dbFS = admin.firestore();

// Firebase client SDK realtime database:
const firebaseConfig = {
  apiKey: "AIzaSyCfo3UqEb77ihYOqSJZvIFVr2VRGf6dJ4w",
  authDomain: "plant-monitor-3976f.firebaseapp.com",
  databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "plant-monitor-3976f",
  storageBucket: "plant-monitor-3976f.appspot.com",
  messagingSenderId: "705425147510",
  appId: "1:705425147510:web:71f15bde879f3672df8157",
  measurementId: "G-890H6FDBYE"
};
const app = initializeApp(firebaseConfig);
const dbRT = getDatabase(app);

// Segédfüggvény: százalékszámítás
function getPercent(raw, cat) {
  const ranges = {
    "🌵Szárazkedvelő": { min: 10, max: 40 },
    "🌾Mérsékelten száraz": { min: 20, max: 45 },
    "🌿Kiegyensúlyozott vízigényű": { min: 30, max: 60 },
    "🌱Nedvességkedvelő": { min: 50, max: 80 },
    "💧Vízigényes": { min: 70, max: 100 }
  };
  const r = ranges[cat] || { min: 0, max: 100 };
  let p = Math.round(((raw - r.min) / (r.max - r.min)) * 100);
  if (p < 0) p = 0;
  if (p > 100) p = 100;
  return p;
}

exports.handler = async function (event, context) {
  try {
    // 1. Subscriptionok olvasása Firestore-ból
    const subsSnap = await dbFS.collection("push_subscriptions").get();
    let subscriptions = [];
    subsSnap.forEach(doc => subscriptions.push(doc.data()));

    // 2. Növények kiolvasása Realtime DB-ből
    const snapshot = await get(ref(dbRT, "users"));
    if (!snapshot.exists()) {
      return { statusCode: 200, body: "Nincs Firebase adat!" };
    }
    const users = snapshot.val();

    let pushCount = 0;
    for (const uid in users) {
      const userData = users[uid];
      if (userData.devices) {
        for (const deviceId in userData.devices) {
          const device = userData.devices[deviceId];
          const rawValue = device.sensorValue || 0;
          const plantType = device.plantType || "";
          const percent = getPercent(rawValue, plantType);

          if (percent < 35) {
            for (const s of subscriptions) {
              if (s.plantType === plantType) {
                await webpush.sendNotification(
                  s.subscription,
                  JSON.stringify({
                    title: "Növényfigyelő",
                    body: `A(z) ${plantType} növény vízszintje csak ${percent}%!`,
                    icon: "/icon.png"
                  })
                );
                pushCount++;
              }
            }
          }
        }
      }
    }

    return {
      statusCode: 200,
      body: `Push elküldve ${pushCount} feliratkozásra, ahol kellett.`
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: "Hiba történt: " + error.toString()
    }
  }
};
