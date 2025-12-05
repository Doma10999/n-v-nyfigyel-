// netlify/functions/registerPush.js
const { admin } = require("./pushCommon");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Csak POST engedélyezett" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, subscription } = body;

    if (!uid) {
      return { statusCode: 400, body: "Hiányzó uid a kérésben" };
    }
    if (!subscription || !subscription.endpoint) {
      return { statusCode: 400, body: "Hiányzó subscription" };
    }

    const db = admin.database();
    const subsRef = db.ref(`pushSubscriptions/${uid}`);

    // Ne legyen duplikált endpoint
    const snap = await subsRef.once("value");
    const subs = snap.val() || {};
    let existingId = null;

    for (const [subId, sub] of Object.entries(subs)) {
      if (sub && sub.endpoint === subscription.endpoint) {
        existingId = subId;
        break;
      }
    }

    const key = existingId || subsRef.push().key;
    await subsRef.child(key).set(subscription);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("registerPush hiba:", err);
    return { statusCode: 500, body: "Szerver hiba" };
  }
};
