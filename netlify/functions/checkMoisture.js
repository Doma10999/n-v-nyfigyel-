// netlify/functions/checkMoisture.js
const admin = require("firebase-admin");
const webpush = require("web-push");
const serviceAccount = require("./serviceAccountKey.json");

// --- Firebase Admin ---
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  });
}
const realtime = admin.database();

// --- VAPID kulcsok ---
// IDE ÍRD BE AZOKAT, AMIKET MÁR MOST IS HASZNÁLSZ az index.html-ben / régi sendPush.js-ben!
// publicVapidKey = ugyanaz, mint ami a frontenden van
// privateVapidKey = a hozzá tartozó privát kulcs (EZT NE TEDD KI FRONTENDRE!)
const publicVapidKey = "BA9Fs-ZMeeisRVBM5A-NJoYGudUZHsaPzWCgI8tQ_Kj5zEr-xq8tMZkoq0pTP5NjVqmpivK5PBX2GAHHgGuhbj0";
const privateVapidKey = "KYg1qLt02ykW_Cfom9Cl4KoIFBW_aXCvITyX7G_OAOQ";

webpush.setVapidDetails(
  "mailto:valami@emailcimed.hu",
  publicVapidKey,
  privateVapidKey
);

const THRESHOLD = 35; // % alatti értéknél küldjünk értesítést

// --- Segédfüggvény: száraz növények keresése ---
async function findDryPlants() {
  const snap = await realtime.ref("users").once("value");
  if (!snap.exists()) return [];

  const users = snap.val();
  const dryPlants = [];

  for (const [uid, userData] of Object.entries(users)) {
    if (!userData.devices) continue;

    for (const [deviceId, dev] of Object.entries(userData.devices)) {
      const value = dev.sensorValue;
      if (typeof value === "number" && value < THRESHOLD) {
        dryPlants.push({
          uid,
          deviceId,
          value,
          name: dev.displayName || deviceId,
        });
      }
    }
  }

  return dryPlants;
}

// --- Maga a Netlify function ---
exports.handler = async () => {
  try {
    const dryPlants = await findDryPlants();

    if (dryPlants.length === 0) {
      console.log("Nincs 35% alatti növény, nincs push.");
      return { statusCode: 200, body: "Nincs száraz növény." };
    }

    // Üzenet összerakása
    let body;
    if (dryPlants.length === 1) {
      const p = dryPlants[0];
      body = `A(z) "${p.name}" növény talajnedvessége ${p.value}% – ideje meglocsolni 🌱`;
    } else {
      body = `Több növény talajnedvessége ${THRESHOLD}% alatt van – ideje meglocsolni őket 🌱`;
    }

    const payload = JSON.stringify({
      title: "Növényfigyelő 🌱",
      body,
    });

    // Feliratkozások beolvasása RTDB-ből
    const subsSnap = await realtime.ref("pushSubscriptions").once("value");
    if (!subsSnap.exists()) {
      console.log("Nincsenek feliratkozók.");
      return { statusCode: 200, body: "Nincsenek feliratkozók." };
    }

    const subs = subsSnap.val();
    const sendPromises = [];

    for (const [key, subObj] of Object.entries(subs)) {
      const subscription = subObj.subscription || subObj;
      sendPromises.push(
        webpush.sendNotification(subscription, payload).catch((err) => {
          console.error("Push küldési hiba (" + key + "):", err);
        })
      );
    }

    await Promise.all(sendPromises);

    console.log(`Push elküldve ${Object.keys(subs).length} feliratkozónak.`);
    return { statusCode: 200, body: "Push értesítések elküldve." };
  } catch (err) {
    console.error("checkMoisture hiba:", err);
    return { statusCode: 500, body: err.toString() };
  }
};
