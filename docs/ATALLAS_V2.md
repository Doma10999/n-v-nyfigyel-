# Növényfigyelő v2 · átállás és firmware

A vevő a **Regisztráció** fülön beírja a kapott hatkarakteres kódot, majd e-mail-címmel és jelszóval létrehozza a fiókját. A korábbi `NF-XXXX-XXXX-XXXX-XXXX` formátum is működik. Egy tartó egy fiókhoz rendelhető. A már belépett vevő a **Virágtartó hozzáadása** menüben írhatja be a következő kódot. Meglévő Firebase-fiókkal az e-mail-címeddel és jelszavaddal léphetsz be. Az **Elfelejtettem a jelszavam** gomb a Firebase jelszó-visszaállító e-mailjét használja.

Az előfizetéses felület szünetel. Az öt vízigény-kategória, a grafikon és az értesítési beállítások minden párosított fiókban elérhetők. A grafikon a virágtartó utolsó tíz nyers szenzormérését mutatja. A locsolási állapot továbbra is a kiválasztott növény vízigényéhez igazodik.

## 1. Mentés és próba a meglévő Firebase-projektben

1. A [Firebase Realtime Database konzolban](https://console.firebase.google.com/project/plant-monitor-3976f/database/plant-monitor-3976f-default-rtdb/data) exportáld az adatokat, és mentsd el a jelenlegi **Rules** JSON-t külön, privát fájlban. Az éles weboldalhoz tartozó kiinduló GitHub-commit `89d066f`. A Netlify éles címe [noveny-figyelo.netlify.app](https://noveny-figyelo.netlify.app/).
2. Ellenőrizd az **Authentication → Sign-in method** alatt az Email/Password szolgáltatót. A korábbi Firebase Auth-fiókok megmaradnak, az új eszközök a `v2` adatágba kerülnek.
3. Futtasd az alábbi parancsot a mentett szabályfájllal. Az eredményt ellenőrzés után a Realtime Database **Rules** fülén lehet közzétenni.

   ```sh
   npm ci
   npm run stage:rules -- meglevo-rules.json staging-rules.json
   ```

   A projekt eredeti, nyilvánosan írható szabályaiból a parancs a meglévő `users/{uid}` ágat a fiók tulajdonosára korlátozza, és lezárja a régi `emailWatcher` ágat. Az adatok megmaradnak. Ha a régi szabályok a gyökéren adnak jogot vagy az érintett ágakhoz egyedi szabályok tartoznak, ezeket külön ellenőrizd. A projekt eredeti, egyszerű szabályaihoz a `firebase/database.rules.json` közvetlenül is közzétehető.

4. Az első vevő előtt próbáld ki a folyamatot egy saját virágtartón. A kódot váltsd be a weboldalon, majd indítsd el a tartót, és nézd meg, megjelenik-e a mérés. Új Wi-Fi esetén csatlakozz a **Novenyfigyelo** hálózathoz, majd a megnyíló felületen add meg az otthoni 2,4 GHz-es Wi-Fi adatait. Szükség esetén nyisd meg a `192.168.4.1` címet.

A korábbi növények és mérések ugyanazzal a fiókkal megjelennek az új felületen. A v2-re átprogramozott tartó új mérési sort kezd. Azokhoz a régi eszközökhöz, amelyek a nyilvános írási jogot használták, a mérések folytatásához a v2 firmware kell.

## 2. Arduino-feltöltés

A firmware és az aktiválókód eszközönként készül el. A készítő parancshoz Node.js 22 vagy újabb szükséges. A parancsot a saját gépeden futtasd Firebase Admin-joggal. Ha a [Firebase Admin SDK helyi beállításához](https://firebase.google.com/docs/admin/setup) kulcsfájlt használsz, tartsd a GitHub-mappán kívül. A webes API-kulcsot a Firebase projekt Web App beállításainál találod.

Windows PowerShellben az alábbiakat add meg ugyanabban az ablakban, ahol a készítő parancsot futtatod.

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\sajat-privat-mappa\firebase-admin.json'
$env:FIREBASE_PROJECT_ID = 'plant-monitor-3976f'
$env:FIREBASE_DATABASE_URL = 'https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app'
$env:FIREBASE_WEB_API_KEY = 'IDE_A_WEBES_API_KULCS'
```

| Változat | Elkészítés | Vezérlés |
| --- | --- | --- |
| USB, talajszenzor | `npm run provision -- usb` | Háromóránkénti mérés |
| USB, LED | `npm run provision -- usb-led` | Webes fényerőcsúszka |
| Akkumulátoros | `npm run provision -- battery` | Mélyalvás, talaj- és akkumérés |
| Akkus, érintős LED | `npm run provision -- battery-touch` | Helyi érintés |
| Akkus, LED és ENS160 | `npm run provision -- battery-air` | Helyi érintés és levegőmérés |
| Offline OLED | `firmware/06_Offline_OLED/06_Offline_OLED.ino` | Helyi kijelző, nincs párosítás |

Hatkarakteres kódhoz add hozzá a `--code K7M4Q2` kapcsolót. A `K7M4Q2` példa, minden tartóhoz válassz külön, lehetőleg véletlenszerű kódot ékezet nélküli betűkből és számokból. A rövid kódot az éles Netlify-függvény ellenőrzi és menti, ezért ehhez a webes kiadásnak és a Firebase-szabályoknak már futniuk kell. Kapcsoló nélkül a parancs hosszú NF-kódot készít.

Az első öt parancs a `device-output/<azonosító>/` mappába ír. Az Arduino IDE-ben az ott található almappából nyisd meg az azonos nevű `.ino` fájlt. A készítőprogram az ESP saját azonosítóját és hozzáférését a `DeviceSecrets.h` fájlba írja. A vevőnek a külön `Aktiválókód.txt` tartalmát add át. Ha foglalt a választott kód, a készítőprogram kiírja a folytatás parancsát, amelyben az `UJ_KOD` helyére írhatod a másik kódot.

- **Board** · WEMOS LOLIN32 Lite (`esp32:esp32:lolin32-lite`)
- **ESP32 board package** · Espressif 3.3.8
- **Online modellek** · WiFiManager 2.0.17
- **Offline OLED** · Adafruit GFX Library 1.13.0 és Adafruit SSD1306 2.5.17

A Serial Monitor sebessége 115200 baud. A sikeres mérésnél a `QUEUE FELTOLTVE` sor jelenik meg. Ha a tartó már futott a párosítás előtt, az első küldés a következő próbálkozáskor indul. Saját tesztpéldánynál a párosítás után indítsd újra a tartót. A közös régi eszközbelépést az átállás és a tesztek után vond vissza. Ha a régi jelszó személyes fiókhoz is tartozott, cseréld le és használj külön hozzáférést.

## 3. Háttérértesítések

1. A fenti Firebase Admin-környezetben futtasd az `npm run provision -- alerts` parancsot. Ez külön, korlátozott értesítő fiókot és Web Push kulcspárt hoz létre. A generált `netlify-alerts.env` privát. A `NF_VAPID_SUBJECT` mező legyen `mailto:` előtaggal megadott kapcsolattartási cím.
2. Az e-mailhez hozz létre egy Apps Script webalkalmazást a `firebase/alerts-mail-relay.gs` kóddal. A **Script Properties** alatt állítsd be a generált `NF_MAIL_RELAY_SECRET` értéket. Telepítsd saját fiókkal futó webappként, majd az `/exec` címét add meg a `NF_MAIL_RELAY_URL` mezőben.
3. Az értékeket a fő Netlify projekt **Functions** környezeti változói közé tedd, és a saját teszteszközzel végzett próbához állítsd a `NF_ALERTS_ENABLED` értékét `true`-ra. A másodlagos Netlify-címen egy átirányítás elég. Az ütemezett funkció tízpercenként ellenőrzi a friss adatokat az éles Netlify-kiadásban.

A locsolási és levegőminőségi e-mail a vevő által megerősített fiókcímre érkezik. A telefonos értesítéseket az adott böngészőben kell bekapcsolni. A locsolási jelzés vízigényhez igazított küszöbe 35% alatt van, az ismétlés 6 órás, kategóriaváltás után 10 perc várakozással. Az akkus és USB-s modellek rendes mérése 3 óránként történik. A locsolási jelzés a mérés beérkezése után a következő háttérellenőrzéskor indulhat.

A háttérküldéshez nem kell fizetős Firebase Cloud Functions. A [Firebase Spark RTDB-kerete](https://firebase.google.com/pricing) 100 egyidejű kapcsolat, 1 GB tárolás és 10 GB letöltés havonta. Az USB-s LED folyamatos adatkapcsolata is egyidejű kapcsolatnak számít. Az első pilotnál az éles felhasználást a Firebase Usage nézetben ellenőrizd.

## 4. Élesítés sorrendje

1. Tedd közzé az adatbázis-szabályokat, és ellenőrizd a fő Netlify-kiadást. A régi [novenyfigyelo.netlify.app](https://novenyfigyelo.netlify.app/) cím átirányítható a fő címre.
2. Készíts egy saját teszteszközt, váltsd be a kódját, és ellenőrizd az első mérést, a Wi-Fi-kiesés utáni újraküldést, a második eszköz hozzáadását és a jelszó-visszaállító e-mailt.
3. A LED-es és akkus modelleken ellenőrizd a fizikai LED-vezérlést és az ébresztést. Ha beállítod a háttérértesítéseket, ellenőrizd az e-mail és a telefonos jelzés kézbesítését.
4. Állítsd le a régi Plus-szinkront és a régi értesítési időzítéseket, amikor a régi firmware-ek leálltak. A Stripe fizetési linkeket a Stripe kezelőfelületén lehet külön szüneteltetni, ha már megosztottad őket.
5. A régi hozzáférések lezárása előtt őrizd meg a mentést. Visszaállításhoz a korábbi Netlify deploy és az elmentett adatbázis-szabályok szükségesek.

## Helyi ellenőrzés

```sh
npm ci
npm run build
npm test
npx firebase-tools emulators:exec --only auth,database --project demo-novenyfigyelo "npm run test:firebase"
```

Az emulátorhoz Java 21 kell. A böngészőteszthez Playwright és Chromium is kell. A böngészőteszt a helyi Auth- és RTDB-emulátorral fut.

```sh
npm install --no-save playwright
npx playwright install chromium
npx firebase-tools emulators:exec --only auth,database --project demo-novenyfigyelo "npm run test:browser"
```

Az éles Firebase-konzol, a fizikai ESP32 és az élő kézbesítési szolgáltatások külön ellenőrzési lépések.
