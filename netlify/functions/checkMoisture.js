const { db, webpush } = require("./pushCommon");

const THRESHOLD = 35;         // 35% alatt jelezzen
const COOLDOWN_MINUTES = 10;  // minimum 10 perc két értesítés között

exports.handler = async () => {
  try {
    const now = Date.now();

    // 1) Összes felhasználó + eszköz Realtime DB-ből
    const usersSnap = await db.ref("/users").get();
    const users = usersSnap.val() || {};

    // 2) Subscriptionök
    const subsSnap = await db.ref("/pushSubscriptions").get();
    const subs = subsSnap.val() || {};

    const notifications = [];

    for (const [uid, userData] of Object.entries(users)) {
      const devices = userData.devices || {};
      const sub = subs[uid];
      if (!sub) continue; // nincs feliratkozás, nincs értesítés

      for (const [deviceId, dev] of Object.entries(devices)) {
        const sensorValue = typeof dev.sensorValue === "number" ? dev.sensorValue : Number(dev.sensorValue || 0);
        if (isNaN(sensorValue)) continue;

        if (sensorValue < THRESHOLD) {
          const lastPushAt = dev.lastPushAt || 0;
          const diff = now - lastPushAt;

          if (diff >= COOLDOWN_MINUTES * 60 * 1000) {
            notifications.push({ uid, deviceId, sensorValue, subscription: sub });
          }
        }
      }
    }

    let sent = 0;

    for (const item of notifications) {
      const payload = JSON.stringify({
        title: "Növényfigyelő 🌱",
        body: `A(z) ${item.deviceId} nedvesség szintje ${item.sensorValue}% – ideje megöntözni!`,
        data: {
          uid: item.uid,
          deviceId: item.deviceId
        }
      });

      try {
        await webpush.sendNotification(item.subscription, payload);
        sent++;

        // lastPushAt mentése
        await db
          .ref(`/users/${item.uid}/devices/${item.deviceId}/lastPushAt`)
          .set(now);
      } catch (err) {
        console.error("Push küldési hiba:", item.uid, item.deviceId, err.statusCode, err.body);
      }
    }

    console.log(`checkMoisture lefutott, elküldött értesítések: ${sent}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ sent })
    };
  } catch (err) {
    console.error("checkMoisture hiba:", err);
    return {
      statusCode: 500,
      body: "Szerver hiba a checkMoisture függvényben"
    };
  }
};
