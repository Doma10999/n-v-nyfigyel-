// netlify/functions/registerPush.js

const admin = require("firebase-admin");
const webpush = require("web-push");

const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

// VAPID kulcsok (ugyanaz mint a frontenden)
webpush.setVapidDetails(
  "mailto:test@example.com",
  "BCYdagojWk6evEFFMhZbdE8FGpQQiNycuvchcaSCFlsHv4uLF_xvkB4UObcIcz2jmNwkq2tOHDhawETwboltZOiE",
  "UstB4cd9cxJhLwJ6hxhN8cmqUJZTGi99qO3rtOjl6Xc"
);

exports.handler = async function (event, context) {
  try {
    const body = JSON.parse(event.body);
    const subscription = body.subscription;
    const plantType = body.plantType || "";

    if (!subscription) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No subscription provided" })
      };
    }

    const message = {
      title: "Sikeres feliratkozás 🌱",
      body: `Push értesítés engedélyezve (${plantType})`,
      icon: "/icon.png"
    };

    await webpush.sendNotification(subscription, JSON.stringify(message));

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    console.error("registerPush ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
