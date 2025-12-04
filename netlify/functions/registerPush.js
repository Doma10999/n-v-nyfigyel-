// netlify/functions/registerPush.js
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}

const db = admin.database();

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const subscription = body.subscription;

    if (!subscription) {
      return { statusCode: 400, body: "Missing subscription" };
    }

    // Itt tároljuk Realtime DB-be
    // /pushSubscriptions/<randomId>
    await db.ref("pushSubscriptions").push({
      subscription,
      plantType: body.plantType || null,
      createdAt: Date.now()
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error("registerPush error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" })
    };
  }
};
