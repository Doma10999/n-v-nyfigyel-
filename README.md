# Növényfigyelő 2.0

Magyar nyelvű, reszponzív növényfigyelő alkalmazás a meglévő ESP32 + Firebase rendszerhez. Függőségmentes felület, Firebase Authentication és Realtime Database, telepíthető PWA.

## Azonosított éles projekt

- Éles cím: https://noveny-figyelo.netlify.app/
- Ehhez tartozó tár: **Doma10999/n-v-nyfigyel-**.
- Netlify site ID: `64c4290c-2b19-462f-9756-a122c0305590`.
- A vizsgálatkor közzétett Netlify-commit: `43dc6d19f8087518599ce316218fc091aa68dd23` (2026-08-20).
- A fejlesztés alapja a tár újabb `f58ef5897303710ea0b5ab94dc67503e3dcdaa34` állapota.
- A másik tár (`Doma10999/novenyfigyelo`) korábbi, külön változat. Nem módosult.
- Firebase: `plant-monitor-3976f`, az eredeti európai RTDB-végponttal.

## Használat és ellenőrzés

Node.js 20.12+ (ajánlott: 22). Nincs telepítendő runtime-csomag.

```sh
npm run check
npm test
npm run build
```

A `dist/` tartalma a publikálható webalkalmazás. Az eredeti jegyzeteket, Apps Script-forrásokat, régi másolatokat és teszteket a build nem teszi közzé. A Netlify a `netlify.toml` szerint ellenőrzés, tesztelés és build után a `dist/` könyvtárat publikálja.

A `/?demo=1` bemutató mód nem importálja a Firebase-klienst, nem olvas és nem ír élő eszközadatot, nem küld értesítést és nem indít valódi fizetést. A mintaadatok átmenetiek, újratöltéskor visszaállnak.

## Mit változtat a továbbfejlesztés?

- Áttekintő számlálók, növénykeresés és állapotszűrők, egyszerű mobilos navigáció.
- Eredeti, kis méretű vektoros növényillusztrációk, rövid kártya- és ablakátmenetek, animált nedvességgyűrű. Nincs folyamatos animációs ciklus vagy animációs csomag; csökkentett mozgás beállításnál az animációk kikapcsolnak.
- A mért talajnedvesség és a kategóriához igazított érték külön látható. A korábbi öt kategóriakulcs és a százalékszámítás megmaradt. Az értesítési határ `<=35%` igazított érték.
- A hiányzó/hibás mérés nem 0%. A felső tartomány feletti nedvesség és a régi mérés külön állapot.
- A mérési idő nem frissül attól, hogy az eszköz életjelet küldött vagy valaki beállítást mentett. 12 óra felett a mérés régi. Ismeretlen időpontnál nem állítja, hogy friss az adat.
- Fiókonként három leállítható adatfigyelő az előző eszközönkénti sok figyelő helyett. A felület meglévő kártyákat frissít, kereséskor nem építi újra a teljes listát.
- Az alkalmazás megvárja a Firebase bejelentkezés visszaállítását. A további fiókok külön hitelesített Firebase-appot használnak; egy eltárolt UID nem jelent jogosultságot.
- Nincs bejelentkezéskori előfizetés-átírás, automatikus kategóriacsere vagy Free csomagra váltás miatti előzménytörlés.
- A LED-csúszka elengedéskor ment, hibánál visszajelez és visszaállítja a kijelzést. Offline mentést a felület nem indít.
- Emailbeállítások mentése növényenként, érvényes cím és Plus-hozzáférés ellenőrzésével. Nincs második, böngészőből futó emailküldő időzítő.
- A meglévő Cloudflare push kliens, Worker-cím és végpontok megmaradtak. A kliens csak az értesítési ablak megnyitásakor töltődik be; a rendszeres auth-polling helyett eseményeket figyel.
- Stripe-hivatkozások és az eredeti kódban szereplő árak: havi 490 Ft, éves **3999 Ft**. A fizetési eredményoldal nem ad magának Plus-jogosultságot.

## Adatkompatibilitás

A meglévő útvonalak maradnak:

```text
users/{uid}/subscription
users/{uid}/devices/{deviceId}/
  sensorValue
  displayName / plantName
  plantType
  ledLevel
  batteryPercent
  lastMeasurementAt / measuredAt / sensorUpdatedAt / lastSensorUpdate / timestamp / lastUpdated
  lastSeen
  airQuality/{aqi,tvoc,eco2,bad,status,updatedAt}
  history/{measurementTimestamp}: categoryAdjustedPercent
  emailNotifEnabled
  emailNotifEmail
  emailNotifCooldownMs
```

A firmware-t és a Firebase-szabályokat ez a fejlesztés nem módosítja. A publikus Firebase webkonfiguráció nem adminisztrátori kulcs. Az adatbiztonságot az éles Firebase Authentication és RTDB Security Rules biztosítja; a kliensoldali Plus-ellenőrzés nem helyettesít szerveres jogosultságvizsgálatot.

Korábbi többfiókos használatnál a legutolsó érvényes Firebase-munkamenet visszaáll. A korábban csak UID-ként eltárolt további fiókokat egyszer újra be kell jelentkeztetni. Jelszót az alkalmazás nem tárol saját tárhelyen.

## Előzmények és háttérértesítések

A Plus-fiókok nyitott alkalmazása valódi, friss mérésenként egy, időbélyeggel azonosított előzménypontot ír. Egy meglévő pontot nem ír át; beállításmódosításból nem készít új mérési időpontot. A grafikon legfeljebb 120 meglévő pontot jelenít meg, az adatbázisból a többit nem törli. Kategóriaváltás után a régi, már igazított történeti értékek a korabeli kategóriára vonatkoznak.

Zárt alkalmazás mellett a folyamatos előzménygyűjtés továbbra is eszköz- vagy szerveroldali rögzítést igényel. A PWA és a service worker önmagában nem időzített szerver. A meglévő Apps Script / Cloudflare háttérküldés működését éles jogosultsággal külön kell ellenőrizni. A régi `notifications.js` és egyéb archív fájlok nincsenek az új alkalmazásba betöltve vagy a buildbe másolva.

## PWA és offline használat

HTTPS szükséges. Androidon támogatott böngészőből telepíthető, iPhone-on a Megosztás → Főképernyőhöz adás útvonalra mutat az útmutató. Saját normál és maskable ikonok, megfelelő manifest és önálló ablak.

Az app-shell verziózott, a frissítésekhez elfogadható „Frissítés” gomb jelenik meg. Nem cserélődik le az alkalmazás szerkesztés közben. Csak a saját statikus fájlok és a verzióhoz rögzített Firebase SDK kerül a service worker cache-ébe. Adatbázis-, auth-, Stripe- és értesítési API-válaszokat nem cache-el; JavaScript-kéréshez nem ad vissza offline HTML-t.

A korábban bejelentkezett felhasználó saját legutóbbi mérései offline is olvashatók. Az offline/késleltetett állapot látható. Kijelentkezéskor a helyi adatsnapshot és a korábbi, ehhez a UID-hez tartozó helyi mérési cache törlődik. Az első offline megnyitás előzetes online betöltés nélkül nem támogatott.

## Közzététel és domain

Az eredeti Netlify-projekt és cím megtartandó. A Netlify eszközei a vizsgálatkor nem tették elérhetővé a build-kapcsolat módosítását; az automatikus telepítés állapotát a kezelőfelületen is ellenőrizni kell. Önálló domain beállításához nem szükséges önmagában fizetős Netlify-csomag, de a regisztrált `.hu` domainnek saját regisztrációs és megújítási díja van. A már meglévő `for-you.hu` aldomainje (például `noveny.for-you.hu`) is használható DNS-beállítás után.

Új domain esetén a push Worker CORS/origin-engedélyezését, a Firebase engedélyezett domainjeit és az előfizetés/értesítés visszahivatkozásait is ellenőrizni kell. Az eredeti címeket nem kell törölni vagy felszabadítani. A mostani változat nem vásárolt domaint és nem módosított DNS-t.

## Ellenőrzés határai

A számítások, auth-visszaállítás, többfiókos elszigetelés, figyelők leállítása, offline írások tiltása és service worker viselkedés automatizált tesztekkel ellenőrzöttek. A bemutató felületen böngészős vizsgálat is történt.

A Firebase konzol a rendelkezésre álló böngészőfiókkal nem volt elérhető. Emiatt az éles saját fiókadatok, az eszközről történő vezérlés, a Firebase-szabályok, az Apps Script időzítők és a telefonon ténylegesen beérkező push-értesítés végponttól végpontig tartó tesztje külön hitelesítést igényel. Ezeket a kódellenőrzés önmagában nem igazolja.
