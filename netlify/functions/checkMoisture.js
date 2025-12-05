// netlify/functions/checkMoisture.js
const { admin, sendPushToUser } = require("./pushCommon");

exports.handler = async () => {
  try {
    const db = admin.database();
    const usersSnap = await db.ref("users").once("value");

    if (!usersSnap.exists()) {
      return { statusCode: 200, body: "Nincsenek users csomópontok" };
    }

    const users = usersSnap.val();
    const tasks = [];

    for (const [uid, userData] of Object.entries(users)) {
      if (!userData || !userData.devices) continue;

      for (const [deviceId, dev] of Object.entries(userData.devices)) {
        if (!dev) continue;

        const sensor = dev.sensorValue;
        if (typeof sensor !== "number") continue;

        if (sensor < 35) {
          const name =
            dev.displayName ||
            dev.deviceName ||
            dev.name ||
            `Növény (${deviceId})`;

          const payload = {
            title: "Növényfigyelő – Alacsony vízszint",
            body: `${name}: ${sensor}% • Ideje megöntözni 🌱`,
            data: {
              uid,
              deviceId,
              sensorValue: sensor,
              plantType: dev.plantType || null,
            },
          };

          tasks.push(sendPushToUser(uid, payload));
        }
      }
    }

    await Promise.all(tasks);

    return {
      statusCode: 200,
      body: `OK, elküldött értesítések: ${tasks.length}`,
    };
  } catch (err) {
    console.error("checkMoisture hiba:", err);
    return { statusCode: 500, body: "Szerver hiba" };
  }
};
