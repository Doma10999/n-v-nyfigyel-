// netlify/functions/registerPush.js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

// Firebase Admin inicializálás (csak egyszer)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  });
}

const realtime = admin.database();

// endpoint → kulcs (RTDB-ben nem lehet simán URL-t kulcsként használni)
function endpointToKey(endpoint) {
  return Buffer.from(endpoint)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Csak POST engedélyezett." };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { subscription, plantType } = body;

    if (!subscription || !subscription.endpoint) {
      return { statusCode: 400, body: "Hiányzik a subscription objektum." };
    }

    const key = endpointToKey(subscription.endpoint);

    const saveObj = {
      subscription,
      plantType: plantType || null,
      createdAt: Date.now(),
    };

    // RTDB: /pushSubscriptions/<kulcs>
    await realtime.ref("pushSubscriptions").child(key).set(saveObj);

    console.log("Feliratkozás elmentve:", key);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("registerPush hiba:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
