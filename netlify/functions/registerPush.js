const { db } = require("./pushCommon");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method not allowed"
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, subscription } = body;

    if (!uid || !subscription) {
      return {
        statusCode: 400,
        body: "uid és subscription kötelező"
      };
    }

    // Egyetlen subscription / user – ide mindig a legfrissebbet írjuk
    await db.ref(`/pushSubscriptions/${uid}`).set(subscription);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error("registerPush hiba:", err);
    return {
      statusCode: 500,
      body: "Szerver hiba a registerPush függvényben"
    };
  }
};
