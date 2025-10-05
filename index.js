const functions = require('firebase-functions');
const axios = require('axios');

// OneSignal kulcsok
const ONE_SIGNAL_APP_ID = "9083ca92-fe8b-460c-8591-3430a5a17fb2"; // <-- OneSignal App ID (ez publikus, weboldalon is látod)
const ONE_SIGNAL_API_KEY = "os_v2_app_scb4vex6rndazbmrgqyklil7wlr5t4hl34weoievbhpltq344oe6nwvxfnpqm5mk7l3jzsltkfco4hjhxvjd5hph5yyhthtfo6azn6a";     // <-- OneSignal REST API Key (ez privát, csak a szerveren!!!)

// Talajnedvesség figyelés & push küldés
exports.sendLowMoistureAlert = functions.database.ref('/users/{uid}/devices/{deviceID}/sensorValue')
  .onWrite(async (change, context) => {
    const newValue = change.after.val();
    if (newValue !== null && newValue < 35) {
      try {
        await axios.post('https://onesignal.com/api/v1/notifications', {
          app_id: ONE_SIGNAL_APP_ID,
          included_segments: ['Subscribed Users'],
          headings: { en: 'Locsolási figyelmeztetés' },
          contents: { en: 'A növény szomjas! Locsold meg! 🌱💧' }
        }, {
          headers: {
            'Authorization': `Basic ${ONE_SIGNAL_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        console.log("Push értesítés elküldve.");
      } catch (error) {
        console.error("Push értesítés hiba:", error);
      }
    }
  });
