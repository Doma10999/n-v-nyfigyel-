// netlify/functions/registerPush.js
const { admin } = require("./pushCommon");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method not allowed",
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, subscription } = body;

    if (!uid || !subscription) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "uid vagy subscription hiányzik" }),
      };
    }

    const db = admin.database();
    const subRef = db.ref(`pushSubscriptions/${uid}`).push();
    await subRef.set(subscription);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("registerPush hiba:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Szerver hiba" }),
    };
  }
};
