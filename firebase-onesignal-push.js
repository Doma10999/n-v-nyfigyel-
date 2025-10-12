const { initializeApp } = require('firebase/app');
const { getDatabase, ref, onValue } = require('firebase/database');
const axios = require('axios');

// --- Firebase config ---
const firebaseConfig = {
  apiKey: "AIzaSyCfo3UqEb77ihYOqSJZvIFVr2VRGf6dJ4w",
  authDomain: "plant-monitor-3976f.firebaseapp.com",
  databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "plant-monitor-3976f",
  storageBucket: "plant-monitor-3976f.appspot.com",
  messagingSenderId: "705425147510",
  appId: "1:705425147510:web:71f15bde879f3672df8157"
};

const ONESIGNAL_APP_ID = "9083ca92-fe8b-460c-8591-3430a5a17fb2";
const ONESIGNAL_API_KEY = "r5t4hl34weoievbhpltq344oe";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// FELHASZNÁLÓK, ESZKÖZÖK TÖMBJE (bővíthető új ID-kkal!)
const sensorsToWatch = [
  { uid: "N3DiBVf13tTfTG7PhkZBPTD6q1", device: "esp32_001" },
  { uid: "U3cEuECqBPOXYS6XQzQfPZtHwS2", device: "esp32_002" },
  { uid: "vt6FC8pB7VDt74vTaBBhLafoSn2", device: "esp32_003" },
];

console.log(JSON.stringify(firebaseConfig, null, 2));
console.log("DatabaseURL:", firebaseConfig.databaseURL);
console.log("Paths:", sensorsToWatch.map(s => `users/${s.uid}/devices/${s.device}/sensorValue`));


const lastValues = {};

for (const sensor of sensorsToWatch) {
  const path = `users/${sensor.uid}/devices/${sensor.device}/sensorValue`;
  const sensorRef = ref(db, path);

  lastValues[path] = null;

  onValue(sensorRef, async (snapshot) => {
    const value = snapshot.val();
    console.log(`[${sensor.device}] Érkezett adat:`, value);

    if (value !== null && value < 35 && value !== lastValues[path]) {
      console.log(`[${sensor.device}] ALACSONY szint, push küldése...`);
      try {
        await axios.post("https://onesignal.com/api/v1/notifications", {
          app_id: ONESIGNAL_APP_ID,
          included_segments: ['Subscribed Users'],
          headings: { en: `Locsolási figyelmeztetés (${sensor.device})` },
          contents: { en: `A(z) ${sensor.device} szomjas! Locsold meg! 🌱💧` }
        }, {
          headers: {
            'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        console.log(`[${sensor.device}] Push értesítés elküldve.`);
      } catch (error) {
        console.error(`[${sensor.device}] Push értesítés hiba:`, error);
      }
    }
    lastValues[path] = value;
  });
}
