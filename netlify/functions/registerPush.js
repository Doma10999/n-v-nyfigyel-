const {{ getDb, initWebPush }} = require("./pushCommon");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const data = JSON.parse(event.body || "{}");
    const uid = data.uid;
    const subscription = data.subscription;

    if (!uid || !subscription) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing uid or subscription" }),
      };
    }

    const db = getDb();
    initWebPush();

    // Mentsük el a subscriptiont az adott felhasználóhoz
    await db.ref(`/pushSubscriptions/${uid}`).set(subscription);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("registerPush error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};