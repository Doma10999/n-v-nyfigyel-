const { admin, sendPushToUser } = require("./pushCommon");

// Netlify ütemezett function: 10 percenként fut
exports.handler = async () => {
  try {
    const db = admin.database();
    const usersSnap = await db.ref("users").once("value");
    const users = usersSnap.val() || {};

    let totalUsersNotified = 0;

    const userEntries = Object.entries(users);

    await Promise.all(
      userEntries.map(async ([uid, userData]) => {
        if (!userData.devices) return;

        const lowPlants = [];

        Object.entries(userData.devices).forEach(([deviceId, device]) => {
          if (!device) return;
          const sensorRaw = device.sensorValue;
          const sensorValue =
            typeof sensorRaw === "number" ? sensorRaw : parseFloat(sensorRaw);

          if (Number.isNaN(sensorValue)) return;

          // 35% ALATT riasztunk – ez független a kategóriától
          if (sensorValue <= 35) {
            const displayName = device.displayName || deviceId;
            const plantType = device.plantType || "Növény";
            lowPlants.push({ displayName, plantType, sensorValue });
          }
        });

        if (lowPlants.length === 0) return;

        const lines = lowPlants.map(
          (p) => `${p.displayName} (${p.plantType}) – ${p.sensorValue}%`
        );

        const title = "Növényfigyelő – locsolás szükséges 💧";
        const body =
          lowPlants.length === 1
            ? `${lines[0]}: a vízszint 35% alatt van. Ideje meglocsolni!`
            : `Több növényed vízszintje is 35% alatt van:\n` + lines.join("\n");

        const payload = {
          title,
          body,
          icon: "/icon.png",
          data: {
            url: "https://novenyfigyelo.netlify.app/",
          },
        };

        await sendPushToUser(uid, payload);
        totalUsersNotified++;
      })
    );

    return {
      statusCode: 200,
      body: `checkMoisture lefutott, érintett userek: ${totalUsersNotified}`,
    };
  } catch (err) {
    console.error("checkMoisture hiba:", err);
    return {
      statusCode: 500,
      body: "Hiba: " + err.toString(),
    };
  }
};
