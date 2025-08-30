const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

exports.sendSoilMoistureAlert = functions.database
  .ref('/users/{userId}/devices/esp32_001/sensorValue')
  .onUpdate(async (change, context) => {
    const before = change.before.val();
    const after = change.after.val();

    // Csak akkor küld értesítést, ha az érték 35 vagy alá esett és változott
    if (after <= 35 && after !== before) {
      const userId = context.params.userId;

      // Lekérjük az adott felhasználóhoz tartozó FCM tokeneket
      const tokensSnapshot = await admin.database().ref(`/fcmTokens/${userId}`).once('value');
      const tokens = tokensSnapshot.val() ? Object.keys(tokensSnapshot.val()) : [];

      if (tokens.length === 0) {
        console.log('Nincs regisztrált eszköz token az értesítéshez');
        return null;
      }

      // Értesítés tartalma
      const payload = {
        notification: {
          title: 'Figyelem!',
          body: 'A talajnedvesség 35% alá csökkent, locsolni kell!',
          sound: 'default',
        }
      };

      // Értesítés küldése az eszközökre
      return admin.messaging().sendToDevice(tokens, payload);
    } else {
      return null;
    }
  });
