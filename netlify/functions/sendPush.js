const { sendPushToUser } = require("./pushCommon.js");

// Ez egy kézi teszt function.
// Ha hívod: /.netlify/functions/sendPush?uid=VALAMI_UID
// akkor küld egy teszt értesítést annak a felhasználónak.
exports.handler = async (event, context) => {
  const uid = event.queryStringParameters && event.queryStringParameters.uid;
  if (!uid) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Hiányzó uid paraméter." })
    };
  }

  try {
    const payload = {
      title: "Teszt értesítés",
      body: "Ez egy teszt push a Növényfigyelőből."
    };

    await sendPushToUser(uid, payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error("sendPush hiba:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Hiba a push küldése közben." })
    };
  }
};
