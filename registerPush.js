const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app"
  });
}
const db = admin.firestore();

exports.handler = async function (event, context) {
  const data = JSON.parse(event.body);
  // Például: {subscription: {...}, plantType: "..."}
  try {
    await db.collection("push_subscriptions").add(data);
    console.log("Új feliratkozás:", data);
    return {
      statusCode: 200,
      body: "Feliratkozás sikeres"
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: "Hiba történt:" + error.toString()
    }
  }
};
