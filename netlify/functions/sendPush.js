const { sendPushToUser } = require("./pushCommon");

// Ezt manuálisan hívhatod: POST body: { "uid": "firebaseUid", "title": "...", "body": "..." }
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { uid, title, body: msgBody } = body;

    if (!uid) {
      return { statusCode: 400, body: "Hiányzó uid" };
    }

    const payload = {
      title: title || "Teszt értesítés",
      body: msgBody || "Ez egy manuális teszt értesítés a Növényfigyelőtől.",
      icon: "/icon.png",
      data: { url: "https://novenyfigyelo.netlify.app/" },
    };

    await sendPushToUser(uid, payload);

    return { statusCode: 200, body: "Push elküldve (teszt)." };
  } catch (err) {
    console.error("sendPush hiba:", err);
    return { statusCode: 500, body: "Hiba: " + err.toString() };
  }
};
