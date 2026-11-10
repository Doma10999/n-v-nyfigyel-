# Növényfigyelő v2 · átállás és firmware

A vevő a csomagban kapott `NF-XXXX-XXXX-XXXX-XXXX` kódot adja meg, majd e-mail-címmel és jelszóval létrehozza a fiókját. A már belépett vevő a **Virágtartó hozzáadása** menüben írhatja be a következő kódot. A bejelentkezés a Firebase Authban marad, ezért meglévő fiókkal is be lehet lépni. Az **Elfelejtettem a jelszavam** gomb a Firebase jelszó-visszaállító e-mailjét használja.

Az előfizetéses felület szünetel. Az öt vízigény-kategória, a grafikon és az értesítési beállítások minden párosított fiókban elérhetők. A grafikon a virágtartó utolsó tíz nyers szenzormérését mutatja. A locsolási állapot továbbra is a kiválasztott növény vízigényéhez igazodik.

## 1. Mentés és próba a meglévő Firebase-projektben

1. A [Firebase Realtime Database konzolban](https://console.firebase.google.com/project/plant-monitor-3976f/database/plant-monitor-3976f-default-rtdb/data) exportáld az adatokat, és mentsd el a jelenlegi **Rules** JSON-t külön, privát fájlban. Az éles weboldalhoz tartozó kiinduló GitHub-commit `89d066f`. A Netlify éles címe [noveny-figyelo.netlify.app](https://noveny-figyelo.netlify.app/).
2. Ellenőrizd az **Authentication → Sign-in method** alatt az Email/Password szolgáltatót. A korábbi Firebase Auth-fiókok megmaradnak, az új eszközök a `v2` adatágba kerülnek.
3. Futtasd az alábbi parancsot a mentett szabályfájllal. Az eredményt ellenőrzés után a Realtime Database **Rules** fülén lehet közzétenni.

   ```sh
   npm ci
   npm run stage:rules -- meglevo-rules.json staging-rules.json
   ```

   Ha a parancs leáll, mert a régi szabályok a gyökéren adnak olvasási vagy írási jogot, először a régi jogosultságokat kell a megfelelő régi ágakra korlátozni. A gyökéren adott engedély a Firebase-ben a gyermekágakra is kiterjed. A `firebase/database.rules.json` az önálló v2 szabályfájl, a régi ágakra épülő oldalak lezárása után használható teljes szabálykészletként.

4. Az élesítés előtt egy saját virágtartón próbáld ki a következő fejezetet. A kódot váltsd be a tesztoldalon, majd indítsd el a tartót, és nézd meg, megjelenik-e a mérés. Új Wi-Fi esetén csatlakozz a **Novenyfigyelo** hálózathoz, majd a megnyíló felületen add meg az otthoni 2,4 GHz-es Wi-Fi adatait. Szükség esetén nyisd meg a `192.168.4.1` címet.

A korábbi mérések a régi adatágban maradnak. A v2-ben minden újrapárosított tartó új mérési sort kezd.

## 2. Arduino-feltöltés

A firmware és az aktiválókód eszközönként készül el. A készítő parancsot a saját gépeden futtasd Firebase Admin-joggal. Ha a [Firebase Admin SDK helyi beállításához](https://firebase.google.com/docs/admin/setup) kulcsfájlt használsz, tartsd a GitHub-mappán kívül. A webes API-kulcsot a Firebase projekt Web App beállításainál találod.

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

Az első öt parancs a `device-output/<azonosító>/` mappába ír. Az Arduino IDE-ben az ott található almappából nyisd meg az azonos nevű `.ino` fájlt. A mellette lévő fejlécek, köztük a `DeviceSecrets.h`, az adott tartóhoz tartoznak. A vevőnek az `Aktiválókód.txt` tartalmát add át.

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

1. Staging szabályok, egy teszteszköz, próbaaktiválás. Ellenőrizd a Wi-Fi-kiesés utáni újraküldést, a második eszközt és a valóban megérkező jelszó-visszaállító e-mailt.
2. Ellenőrizd a fizikai LED-vezérlést, az akkus változat ébresztését és a valóban megérkező e-mailes, illetve telefonos jelzést. Az Arduino-fordítás nem méri az üzemidőt.
3. Az ellenőrzött verzió kerüljön a fő Netlify-címre. A régi [novenyfigyelo.netlify.app](https://novenyfigyelo.netlify.app/) címet irányítsd át a fő címre, hogy az ügyfelek ugyanazt az oldalt nyissák meg.
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
