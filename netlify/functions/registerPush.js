const webpush = require("web-push");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "POST only" }),
    };
  }

  try {
    const body = JSON.parse(event.body);

    // Subscription ellenőrzés
    if (!body.subscription) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing subscription" }),
      };
    }

    const subscription = body.subscription;

    // VAPID kulcsok (EZT A SAJÁT GENERÁLTADRA CSERÉLD!)
    webpush.setVapidDetails(
      "mailto:test@example.com",
      "BA9Fs-ZMeeisRVBM5A-NJoYGudUZHsaPzWCgI8tQ_Kj5zEr-xq8tMZkoq0pTP5NjVqmpivK5PBX2GAHHgGuhbj0",  // public
      "iJBhNNKGzBXdIzpobGOzkkVQdCc4RVHcfMBwr02vIjo" // ← ez a PRIVATE KEY!
    );

    // Teszt push küldése azonnal, hogy működik-e
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: "Feliratkozás OK!",
        body: "Sikeresen engedélyezted a push értesítéseket! 🌱",
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Subscription saved & test push sent" }),
    };
  } catch (err) {
    console.error("RegisterPush error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
