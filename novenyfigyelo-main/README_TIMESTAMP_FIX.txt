MIT JAVÍT EZ A CSOMAG
- A grafikon jobb felső ideje többé nem a belépés idejét veszi alapnak.
- Ha a Firebase-ben van valódi időmező (pl. lastMeasurementAt / updatedAt / lastUpdated / measuredAt), akkor azt mutatja.
- Ha nincs ilyen valódi időmező, akkor NEM talál ki kamu időt a belépés pillanatából.

MIT KELL CSERÉLNI
- Másold a firebase-app.js fájlt a GitHub repó gyökerébe a régi helyére.

FONTOS
- A tökéletes, minden mérésnél pontos időhöz az ESP-nek minden küldésnél írnia kell egy időmezőt is a Firebase-be.
- Ez a javítás azt oldja meg, hogy belépéskor ne a mostani idő jelenjen meg hamisan.
