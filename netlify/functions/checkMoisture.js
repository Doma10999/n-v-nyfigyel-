const { db, sendPushToUser } = require("./pushCommon.js");

// 35% alatti értéknél értesítést küldünk, de csak egyszer,
// amíg újra 40% fölé nem megy a talajnedvesség.
const LOW_THRESHOLD = 35;
const RESET_THRESHOLD = 40;

exports.handler = async (event, context) => {
  try {
    const usersSnap = await db.ref("users").once("value");
    if (!usersSnap.exists()) {
      return { statusCode: 200, body: JSON.stringify({ message: "Nincsenek felhasználók." }) };
    }

    const usersData = usersSnap.val();
    const notifFlagsRef = db.ref("notificationFlags");

    const tasks = [];

    for (const uid of Object.keys(usersData)) {
      const user = usersData[uid];
      if (!user.devices) continue;

      for (const deviceId of Object.keys(user.devices)) {
        const dev = user.devices[deviceId];
        const moisture = dev.sensorValue;
        if (typeof moisture !== "number") continue;

        const flagPath = `${uid}/${deviceId}/lowSent`;
        tasks.push(
          (async () => {
            const flagSnap = await notifFlagsRef.child(flagPath).once("value");
            const lowSent = flagSnap.val() === true;

            if (moisture <= LOW_THRESHOLD && !lowSent) {
              // Küldünk egy értesítést
              const displayName = dev.displayName || "A növényed";
              const payload = {
                title: "Növényfigyelő",
                body: `${displayName} vízszintje 35% alá esett! Öntözd meg!`
              };

              await sendPushToUser(uid, payload);
              await notifFlagsRef.child(flagPath).set(true);
            } else if (moisture >= RESET_THRESHOLD && lowSent) {
              // Visszaállítjuk, hogy legközelebb újra küldhessen
              await notifFlagsRef.child(flagPath).set(false);
            }
          })()
        );
      }
    }

    await Promise.all(tasks);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "checkMoisture lefutott." })
    };
  } catch (err) {
    console.error("checkMoisture hiba:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Hiba a checkMoisture futása közben." })
    };
  }
};
