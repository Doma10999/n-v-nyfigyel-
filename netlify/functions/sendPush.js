// netlify/functions/sendPush.js
const { sendPushToUser } = require("./pushCommon");

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    let { uid, msg } = params;

    if (!uid && event.body) {
      const body = JSON.parse(event.body || "{}");
      uid = body.uid || uid;
      msg = body.msg || msg;
    }

    if (!uid) {
      return { statusCode: 400, body: "Hiányzó uid" };
    }

    const payload = {
      title: "Teszt értesítés",
      body: msg || "Ez egy teszt Push a Növényfigyelőből 🌱",
    };

    await sendPushToUser(uid, payload);

    return { statusCode: 200, body: "OK – teszt értesítés elküldve" };
  } catch (err) {
    console.error("sendPush hiba:", err);
    return { statusCode: 500, body: "Szerver hiba" };
  }
};
