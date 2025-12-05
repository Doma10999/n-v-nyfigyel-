const { admin } = require("./pushCommon");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, subscription } = body;

    if (!uid || !subscription || !subscription.endpoint) {
      return {
        statusCode: 400,
        body: "Hiányzó uid vagy subscription",
      };
    }

    const db = admin.database();
    const subsRef = db.ref(`pushSubscriptions/${uid}`);

    // Egyedi azonosító az endpoint-ból
    const rawId = subscription.endpoint;
    const subId = Buffer.from(rawId).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

    await subsRef.child(subId).set(subscription);

    return {
      statusCode: 200,
      body: "Subscription mentve",
    };
  } catch (err) {
    console.error("registerPush hiba:", err);
    return {
      statusCode: 500,
      body: "Szerver hiba: " + err.toString(),
    };
  }
};
