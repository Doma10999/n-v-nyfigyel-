// netlify/functions/checkMoisture.js
const { admin, sendPushToUser } = require("./pushCommon");

exports.handler = async function () {
  try {
    const db = admin.database();
    const usersSnap = await db.ref("users").once("value");
    const users = usersSnap.val() || {};

    const THRESHOLD = 35; // 35% alatt jelezzen

    const allTasks = [];

    for (const [uid, userData] of Object.entries(users)) {
      const devices = (userData && userData.devices) || {};

      for (const [deviceId, device] of Object.entries(devices)) {
        const sensorValue = device.sensorValue;
        if (typeof sensorValue !== "number") continue;

        if (sensorValue < THRESHOLD) {
          const displayName = device.displayName || deviceId;

          const payload = {
            title: "Növényfigyelő",
            body: `A(z) "${displayName}" növényed vízszintje ${sensorValue}%. Öntözd meg!`,
            icon: "/icon.png",
          };

          allTasks.push(sendPushToUser(uid, payload));
        }
      }
    }

    await Promise.all(allTasks);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        notificationsSent: allTasks.length,
      }),
    };
  } catch (err) {
    console.error("checkMoisture hiba:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Szerver hiba" }),
    };
  }
};
