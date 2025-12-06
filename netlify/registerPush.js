const { saveSubscription } = require("./pushCommon.js");

exports.handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Csak POST kérés engedélyezett." })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, subscription } = body;

    if (!uid || !subscription) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Hiányzó uid vagy subscription." })
      };
    }

    await saveSubscription(uid, subscription);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error("registerPush hiba:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Szerver hiba a feliratkozás mentésekor." })
    };
  }
};
