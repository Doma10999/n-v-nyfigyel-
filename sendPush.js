exports.config = {
  schedule: "0 */6 * * *" // 6 óránként (éjfél, 6, 12, 18 óra)
};

const webpush = require('web-push');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get } = require('firebase/database');

// VAPID kulcsokat IDE!
const vapidKeys = {
  publicKey: "BCYdagojWk6evEFFMhZbdE8FGpQQiNycuvchcaSCFlsHv4uLF_xvkB4UObcIcz2jmNwkq2tOHDhawETwboltZOiE",
  privateKey: "W8LR0MvwPf4fzFMAUx8pfI6y9Bn2rU4PE2zVpgDtPA_Q"
};
webpush.setVapidDetails('mailto:email@domain.hu', vapidKeys.publicKey, vapidKeys.privateKey);

// FIREBASE KONFIG helyesen:
const firebaseConfig = {
  apiKey: "AIzaSyCfo3UqEb77ihYOqSJZvIFVr2VRGf6dJ4w",
  authDomain: "plant-monitor-3976f.firebaseapp.com",
  databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "plant-monitor-3976f",
  storageBucket: "plant-monitor-3976f.appspot.com",
  messagingSenderId: "705425147510",
  appId: "1:705425147510:web:71f15bde879f3672df8157",
  measurementId: "G-890H6FDBYE"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// --- Százalékszámító, NE változtasd! --
function getPercent(raw, cat) {
  const ranges = {
    "🌵Szárazkedvelő": { min: 10, max: 40 },
    "🌾Mérsékelten száraz": { min: 20, max: 45 },
    "🌿Kiegyensúlyozott vízigényű": { min: 30, max: 60 },
    "🌱Nedvességkedvelő": { min: 50, max: 80 },
    "💧Vízigényes": { min: 70, max: 100 }
  };
  const r = ranges[cat] || {min:0, max:100};
  let p = Math.round(((raw - r.min) / (r.max - r.min)) * 100);
  if(p < 0) p = 0;
  if(p > 100) p = 100;
  return p;
}

exports.handler = async function(event, context) {
  // --- IDEIGLENES fejlesztéshez: egy valódi subscription objektum kell ide (console.log-ból másolva) ---
  let subscriptions = [
    /* 
    {
      subscription: { ...feliratkozott böngészőből objektum... },
      plantType: "🌿Kiegyensúlyozott vízigényű"
    }
    */
  ];

  // --- FIREBASE-ből kiolvassuk az összes user eszköz+értékét ---
  const snapshot = await get(ref(db, "users"));
  if (!snapshot.exists()) {
    return { statusCode: 200, body: "Nincs Firebase adat!" };
  }
  const users = snapshot.val();

  // --- Végignézi az összes növényt ---
  for (const uid in users) {
    const userData = users[uid];
    if (userData.devices) {
      for (const deviceId in userData.devices) {
        const device = userData.devices[deviceId];
        const rawValue = device.sensorValue || 0;
        const plantType = device.plantType || "";
        const percent = getPercent(rawValue, plantType);

        // --- Ha < 35%, küldünk push-t ---
        if (percent < 35) {
          for (const s of subscriptions) {
            if (s.plantType === plantType) {
              await webpush.sendNotification(
                s.subscription,
                JSON.stringify({
                  title: "Növényfigyelő",
                  body: `A(z) ${plantType} növény vízszintje csak ${percent}%!`,
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
    body: "Értékek lekérdezve, push küldve ahol kellett."
  };
};
