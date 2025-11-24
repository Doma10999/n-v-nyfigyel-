exports.handler = async function(event, context) {
  const subscription = JSON.parse(event.body);
  // Ezt mentheted adatbázisba, vagy fájlba, vagy csak kipróbálsz egy push küldést
  console.log("Új subscription:", subscription);
  // Itt indulhatna a push küldése, ha az érték < 35
  return {
    statusCode: 200,
    body: "Feliratkozás sikeres"
  };
};
