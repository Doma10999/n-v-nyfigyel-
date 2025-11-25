exports.handler = async function(event, context) {
  let subscriptions = [
    // ideiglenesen fejlesztésnél kézzel másolj ide egy subscription-objektumot!
  ];

  // Lekérjük az összes user-t (minden növény = minden device minden user alatt)
  const snapshot = await get(ref(db, "users"));
  if (!snapshot.exists()) {
    return { statusCode: 200, body: "Nincs adat a Firebase-ben!" };
  }

  const users = snapshot.val();

  // Végigmegyünk minden useren és minden eszközén
  for (const uid in users) {
    const userData = users[uid];
    if (userData.devices) {
      for (const deviceId in userData.devices) {
        const device = userData.devices[deviceId];
        const rawValue = device.sensorValue || 0;
        const plantType = device.plantType || "";
        const percent = getPercent(rawValue, plantType);

        if (percent < 35) {
          // Itt keresd meg a subscription-t, amelyikhez ez a növény tartozik!
          for (const s of subscriptions) {
            if (s.plantType === plantType) {
              await webpush.sendNotification(
                s.subscription,
                JSON.stringify({
                  title: "Növényfigyelő",
                  body: `A(z) ${plantType} növény vízszintje ${percent}%!`,
                  icon: "/icon.png"
                })
              );
            }
          }
        }
      }
    }
  }

  return {
    statusCode: 200,
    body: "Push/ellenőrzés végrehajtva!"
  };
};
