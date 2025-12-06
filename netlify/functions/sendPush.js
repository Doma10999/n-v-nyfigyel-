// Opcionális segédfüggvény, amivel kézzel is lehet push-t küldeni teszteléshez.
// Nem használja a nedvesség logikát, csak elküldi a megadott üzenetet az adott usernek.

const { db, webpush } = require("./pushCommon");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method not allowed"
    };
  }

  try:
    body = JSON.parse(event.body || "{}");
    const { uid, title, body: msg } = body;

    if (!uid) {
      return { statusCode: 400, body: "uid kötelező" };
    }

    const subSnap = await db.ref(`/pushSubscriptions/${uid}`).get();
    const subscription = subSnap.val();

    if (!subscription) {
      return { statusCode: 404, body: "Nincs subscription ehhez a userhez" };
    }

    const payload = JSON.stringify({
      title: title || "Teszt értesítés",
      body: msg || "Ez egy teszt üzenet a Növényfigyelőtől."
    });

    await webpush.sendNotification(subscription, payload);

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("sendPush hiba:", err);
    return { statusCode: 500, body: "Szerver hiba a sendPush függvényben" };
  }
};
