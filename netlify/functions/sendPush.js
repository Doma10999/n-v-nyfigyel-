const { getDb, initWebPush, webpush } = require("./pushCommon");

// Ugyanaz a kategória-táblázat, mint a frontendben
const plantCategories = {
  "🌵Szárazkedvelő": { min: 10, max: 40 },
  "🌾Mérsékelten száraz": { min: 20, max: 45 },
  "🌿Kiegyensúlyozott vízigényű": { min: 30, max: 60 },
  "🌱Nedvességkedvelő": { min: 50, max: 80 },
  "💧Vízigényes": { min: 70, max: 100 },
};

function mapToCategoryPercent(sensorValue, plantType) {
  if (typeof sensorValue !== "number") return null;
  const cat = plantCategories[plantType];
  if (!cat) {
    return sensorValue; // ha nincs kategória, a nyers értéket nézzük
  }
  const { min, max } = cat;
  if (max === min) return sensorValue;
  const clamped = Math.max(min, Math.min(max, sensorValue));
  const ratio = (clamped - min) / (max - min);
  let pct = Math.round(ratio * 100);
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

exports.handler = async (event, context) => {
  try {
    const db = getDb();
    initWebPush();

    // Összes push subscription uid szerint
    const subsSnap = await db.ref("/pushSubscriptions").once("value");
    const subs = subsSnap.val() || {};

    if (!Object.keys(subs).length) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Nincs feliratkozó." }),
      };
    }

    // Felhasználók + eszközök
    const usersSnap = await db.ref("/users").once("value");
    const users = usersSnap.val() || {};

    const toNotify = [];

    Object.entries(users).forEach(([uid, userData]) => {
      const devices = (userData && userData.devices) || {};
      const sub = subs[uid];
      if (!sub) return;

      const hasDryPlant = Object.values(devices).some((dev) => {
        if (!dev) return false;
        const rawVal = typeof dev.sensorValue === "number" ? dev.sensorValue : null;
        if (rawVal === null) return false;
        const plantType = dev.plantType || null;
        const displayPct = mapToCategoryPercent(rawVal, plantType);
        return displayPct !== null && displayPct <= 35;
      });

      if (hasDryPlant) {
        toNotify.push({ uid, sub });
      }
    });

    if (!toNotify.length) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Nincs 35% alatti növény (kategória alapján)." }),
      };
    }

    const payload = JSON.stringify({
      title: "Növényfigyelő",
      body: "A növény vízszintje 35% alá esett!",
    });

    const results = await Promise.all(
      toNotify.map(({ uid, sub }) =>
        webpush.sendNotification(sub, payload).then(
          () => ({ uid, ok: true }),
          (err) => {
            console.error("Webpush hiba", uid, err && err.body ? err.body : err);
            return { uid, ok: false };
          }
        )
      )
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sent: results }),
    };
  } catch (err) {
    console.error("sendPush error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
