
// Netlify Scheduled Function: checkMoisture
// 10 percenként lefut, végigmegy az összes felhasználó / eszköz alatt a Firebase Realtime DB-ben,
// kiszámolja a kategóriás ("növény szerint normalizált") nedvesség %-ot,
// és ha 35% alá esik, küld egy OneSignal push értesítést a "Subscribed Users" szegmensnek.

const admin = require("firebase-admin");
const https = require("https");
const path = require("path");

// ---- Firebase init ----
let app;
if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, "..", "..", "serviceAccountKey.json");
  const serviceAccount = require(serviceAccountPath);

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  });
} else {
  app = admin.app();
}
const db = admin.database();

// ---- OneSignal config ----
// Ezeket Netlify környezeti változóként add meg a Dashboardon:
//  - ONESIGNAL_APP_ID
//  - ONESIGNAL_REST_API_KEY
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

const THRESHOLD = 35;               // 35% alatt jelez
const MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 perc

// Kategória tartományok – ugyanaz, mint a HTML-ben
const PLANT_CATEGORIES = {
  "🌵Szárazkedvelő":          { min: 10, max: 40 },
  "🌾Mérsékelten száraz":     { min: 20, max: 45 },
  "🌿Kiegyensúlyozott vízigényű": { min: 30, max: 60 },
  "🌱Nedvességkedvelő":       { min: 50, max: 80 },
  "💧Vízigényes":             { min: 70, max: 100 },
};

// Nyers szenzorértéket (sensorValue) normalizálunk kategóriára
function computeDisplayPercent(sensorValue, plantType) {
  const cat = PLANT_CATEGORIES[plantType];
  if (!cat || typeof sensorValue !== "number") {
    return sensorValue; // ha nincs kategória, marad a nyers érték
  }
  const { min, max } = cat;
  let display = Math.round(((sensorValue - min) / (max - min)) * 100);
  if (display < 0) display = 0;
  if (display > 100) display = 100;
  return display;
}

// OneSignal értesítés küldése minden feliratkozott felhasználónak
function sendOneSignalNotification(displayPercent) {
  return new Promise((resolve, reject) => {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
      console.error("❌ Nincs beállítva az ONESIGNAL_APP_ID vagy ONESIGNAL_REST_API_KEY");
      return resolve({ skipped: true });
    }

    const payload = JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      included_segments: ["Subscribed Users"],
      headings: {
        hu: "🌱 A növényed szomjas!",
      },
      contents: {
        hu: "A növény talajnedvessége 35% alá csökkent. Ideje megöntözni!",
      },
      data: {
        moisture: displayPercent,
      },
    });

    const options = {
      host: "api.onesignal.com",
      port: 443,
      path: "/api/v1/notifications",
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        console.log("✅ OneSignal response:", res.statusCode, data);
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on("error", (err) => {
      console.error("❌ OneSignal hiba:", err);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

exports.handler = async function(event, context) {
  console.log("⏰ checkMoisture fut...");

  try {
    const usersSnap = await db.ref("users").once("value");
    if (!usersSnap.exists()) {
      console.log("Nincs 'users' ág a Realtime DB-ben.");
      return { statusCode: 200, body: "No users" };
    }

    const users = usersSnap.val();
    const now = Date.now();
    let needAlert = false;
    let lowestDisplay = 100;
    const updates = {};

    for (const uid of Object.keys(users)) {
      const userData = users[uid];
      if (!userData.devices) continue;

      for (const deviceId of Object.keys(userData.devices)) {
        const dev = userData.devices[deviceId] || {};
        const sensorValue = dev.sensorValue;
        const plantType = dev.plantType || "🌿Kiegyensúlyozott vízigényű";
        const lastAlertTs = dev.lastAlertTs || 0;

        const display = computeDisplayPercent(sensorValue, plantType);
        console.log(`Felhasználó: ${uid}, eszköz: ${deviceId}, plantType=${plantType}, sensorValue=${sensorValue}, display=${display}`);

        if (typeof display === "number" && display < lowestDisplay) {
          lowestDisplay = display;
        }

        if (typeof display === "number" && display < THRESHOLD) {
          if (now - lastAlertTs > MIN_INTERVAL_MS) {
            needAlert = true;
            updates[`users/${uid}/devices/${deviceId}/lastAlertTs`] = now;
          } else {
            console.log(`Eszköz ${deviceId}: már volt riasztás az elmúlt 10 percben, kihagyjuk.`);
          }
        }
      }
    }

    if (!needAlert) {
      console.log("Nincs olyan növény, ami 35% alatt lenne, vagy a 10 perc még nem telt le.");
      return { statusCode: 200, body: "No alert needed" };
    }

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
      console.log("⌚ lastAlertTs frissítve az érintett eszközökre.");
    }

    await sendOneSignalNotification(lowestDisplay);

    return { statusCode: 200, body: "Alert sent" };
  } catch (err) {
    console.error("checkMoisture hiba:", err);
    return { statusCode: 500, body: "Error: " + err.message };
  }
};
