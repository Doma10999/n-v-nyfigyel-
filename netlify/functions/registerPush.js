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

exports.handler = async (event, context) => {
  try {
    const body = JSON.parse(event.body);

    if (!body.subscription) {
      return { statusCode: 400, body: "Missing subscription" };
    }

    // Subscription mentése Realtime DB-be
    await realtime.ref("push_subscriptions").push({
      subscription: body.subscription,
      createdAt: Date.now()
    });

    return {
      statusCode: 200,
      body: "Subscription stored"
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: "Error: " + err.toString()
    };
  }
};
