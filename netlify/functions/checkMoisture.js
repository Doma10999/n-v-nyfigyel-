const { admin, sendPushToUser } = require("./pushCommon");

exports.handler = async (event, context) => {
  try {
    const db = admin.database();
    const usersSnap = await db.ref("users").once("value");
    const users = usersSnap.val() || {};
    const THRESHOLD = 35;
    const promises = [];

    for (const [uid, userData] of Object.entries(users)) {
      if (!userData.devices) continue;

      let userNeedsNotification = false;
      let firstDryPlantName = "A növényed";

      for (const [deviceId, device] of Object.entries(userData.devices)) {
        const sensor = device.sensorValue;
        if (typeof sensor === "number" && sensor < THRESHOLD) {
          userNeedsNotification = true;
          firstDryPlantName = device.displayName || "A növényed";
          break;
        }
      }

      if (userNeedsNotification) {
        const payload = {
          title: "Növényfigyelő 🌱",
          body: `${firstDryPlantName} vízszintje 35% alá esett! Öntözd meg!`,
          icon: "/icon.png"
        };
        promises.push(sendPushToUser(uid, payload));
      }
    }

    await Promise.all(promises);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, sent: promises.length })
    };
  } catch (err) {
    console.error("checkMoisture hiba:", err);
    return { statusCode: 500, body: "Szerver hiba" };
  }
};
