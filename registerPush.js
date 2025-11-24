// Ideiglenes tároló (újraindítás után elveszik, éles rendszerhez adatbázis kellene!)
let subscriptions = [];

exports.handler = async function(event, context) {
  const data = JSON.parse(event.body);
  // Például: {subscription: {...}, plantType: "🌿Kiegyensúlyozott vízigényű"}
  // Eltároljuk tömbben (vagy menthető fájlba/adatbázisba is)
  subscriptions.push(data);

  console.log("Új feliratkozás:", data);

  return {
    statusCode: 200,
    body: "Feliratkozás sikeres"
  };
};
