const { getDb, initWebPush, webpush } = require("./pushCommon");

exports.handler = async (event, context) => {
  try {
    const db = getDb();
    initWebPush();

    // Összes feliratkozás
    const subsSnap = await db.ref("/pushSubscriptions").once("value");
    const subs = subsSnap.val() || {};

    if (!Object.keys(subs).length) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "No subscribers" }),
      };
    }

    // Összes felhasználó + eszköz adat
    const usersSnap = await db.ref("/users").once("value");
    const users = usersSnap.val() || {};

    const toNotify = [];

    Object.entries(users).forEach(([uid, userData]) => {
      const devices = (userData && userData.devices) || {};
      const hasDry = Object.values(devices).some((dev) => {
        const val = dev && typeof dev.sensorValue === "number" ? dev.sensorValue : null;
        return val !== null && val < 35;
      });
      if (hasDry && subs[uid]) {
        toNotify.push({ uid, sub: subs[uid] });
      }
    });

    if (!toNotify.length) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "No dry plants under 35%" }),
      };
    }

    const payload = JSON.stringify({
      title: "Növényfigyelő",
      body: "A növényed vízszintje 35% alá esett! Öntözd meg!",
    });

    const results = await Promise.all(
      toNotify.map(({ uid, sub }) =>
        webpush.sendNotification(sub, payload).then(
          () => ({ uid, ok: true }),
          (err) => {
            console.error("Webpush error for", uid, err && err.body ? err.body : err);
            return { uid, ok: false };
          }
        )
      )
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sent: results }),
    };
  } catch (err) {
    console.error("sendPush error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};