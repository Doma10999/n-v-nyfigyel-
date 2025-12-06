const { admin } = require("./pushCommon");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, subscription } = body;

    if (!uid || !subscription) {
      return { statusCode: 400, body: "uid és subscription kötelező" };
    }

    const db = admin.database();
    const subsRef = db.ref(`pushSubscriptions/${uid}`);
    const newRef = subsRef.push();
    await newRef.set(subscription);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error("registerPush hiba:", err);
    return { statusCode: 500, body: "Szerver hiba" };
  }
};
