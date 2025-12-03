exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "POST method only" })
    };
  }

  try {
    const body = JSON.parse(event.body);

    // Itt a subscription objektumot külön vesszük ki
    const subscription = body.subscription;
    const plantType = body.plantType || null;

    if (!subscription) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing subscription object" })
      };
    }

    console.log("Subscription saved:", subscription);

    // Tárolhatod később adatbázisba is…
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Subscription OK",
        plantType: plantType
      })
    };

  } catch (err) {
    console.error("Push registration error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error", details: err.message })
    };
  }
};
