# Növényfigyelő – 2026. októberi fejlesztés

## Forrás és üzemeltetés
Az élő `noveny-figyelo.netlify.app` Netlify-projekt azonosítója `64c4290c-2b19-462f-9756-a122c0305590`. A lekért production deploy a `Doma10999/n-v-nyfigyel-` tároló `43dc6d19f8087518599ce316218fc091aa68dd23` commitjára mutatott. A fejlesztés e tároló újabb `f58ef5897303710ea0b5ab94dc67503e3dcdaa34` main állapotából indul, amely a későbbi push-javításokat is tartalmazza.

## Változások
- Botanikus, mobilon is használható felület, áttekintés, keresés, állandó alsó navigáció, sötét mód.
- A nagy kör a korábbi, növénytípus szerint átszámított vízellátottsági szintet mutatja. Alatta külön látható a sensorValue szerinti talajnedvesség. A százalék nem laboratóriumi víztartalom-mérés.
- A mérési időpont az eszköz mérési mezőiből származik, másodperc és milliszekundum formátummal is. Az updatedAt beállításmódosítás nem frissíti a mérés korát. Hat óra után régi adat figyelmeztetés jelenik meg (a szokásos háromórás mérés két ciklusa).
- A csúszka elengedéskor ment, hibát jelez; a kártya adatfigyelői eltávolításkor leállnak.
- Betöltés előtt megvárja a Firebase munkamenet helyreállását; belépési hiba esetén visszaadja a belépési felületet. Kijelentkezéskor a megjelenített kártyák és figyelők leállnak.
- A frontend nem törli automatikusan a mérési előzményeket előfizetésváltozáskor, és nem írja felül automatikusan a mentett növénykategóriát.
- Telepítési gomb Android prompttal és iPhone útmutatóval. A meglévő web push kliens és service worker push-kezelő megmaradt.
- A service worker csak saját statikus fájlokat gyorsítótáraz, HTML-vésztartalmat csak navigációnál ad. Firebase és bejelentkezési kéréseket nem gyorsítótáraz.
- A build csak engedélyezett böngészőfájlokat másol a dist mappába; Apps Script forrás, mentések és tesztek nem kerülnek a nyilvános webes tárhelyre.

## Ellenőrzés
`npm run build` és `npm test`. A böngészős teszthez Playwright és Chromium kell (`npm install --no-save playwright`, `npx playwright install chromium`, `npm run test:browser`). A teszt két mesterséges eszközt használ, a Firebase SDK-kat elfogja, és nem ír az élő adatbázisba. Vizsgálja a kártyákat, az összesítést, régi adat jelzését, keresést, témát, mobil túllógást, telepítési segítséget és kijelentkezést.

A valós ESP-adatküldés, valós felhasználói hozzáférési szabályok, előfizetés és háttérből küldött push csak tényleges eszközzel / érvényes bejelentkezéssel ellenőrizhető. A firmware és a Firebase adatbázis-szabályok nem módosultak. Több fiók megjelenítésének meglévő Firebase-jogosultsági korlátja megmarad: a tárolt UID önmagában nem helyettesíti az adott fiók hitelesített hozzáférését. Nem szabad emiatt nyilvánossá tenni az adatbázist.

## Tárhely és domain
A Netlify aktuális Free csomagja saját domaint HTTPS-sel támogat, de havi használati kerettel. A .hu domain külön éves regisztráció; itt nem történt vásárlás vagy DNS-változtatás.

Alternatíva: Cloudflare Pages Git-integráció a tárolóhoz. Build parancs: `node scripts/build.mjs`, kimenet: `dist`, Node 20 vagy újabb. Az ingyenes pages.dev címet a létrehozáskor kapja az alkalmazás; konkrét szabad név nincs lefoglalva. A `novenyfigyelo.for-you.hu` aldomain a meglévő domain alatt is beállítható, DNS-hozzáférés után.

Költözéskor a Firebase Authentication engedélyezett domainek közé fel kell venni az új címet; a push Worker CORS/origin-beállítását, a fizetési visszatérési címeket és a háttérértesítések linkjeit is ellenőrizni kell. A web push engedély és telepített PWA az eredeti domainhez tartozik, új domainen új engedély / telepítés szükséges. Az eszközök Firebase adatútvonala változatlan maradhat.

## Világos alkalmazásfelület – második változat
A felhasználó visszajelzése alapján az első botanikus megjelenést világos, mobilalkalmazás jellegű rendszer váltja: fehér kártyák, kék–menta részletek, erősebb kontraszt, nagyobb számok, színes állapotösszesítők, kisebb mobilos üdvözlőblokk. Mindig világos módban nyílik meg. A csillag gomb az animációkat kapcsolja, a beállítás helyben megmarad.

A vízellátottsági körben a mentett/küldött értékhez igazított vízszint és hullámmozgás jelenik meg. A dekoráció képernyőn kívül és háttérbe tett lapon szünetel; csökkentett mozgásnál leáll. A számérték rövid átmenettel változik, az állapotösszesítő nem épül újra az animáció minden képkockájában. A fényerő mellett külön százalékos visszajelzés látszik. A Firebase adatútvonalak, előfizetési feltételek és eszközfirmware nem változtak.

Böngészős ellenőrzés: 360, 390, 430, 768 és 1440 képpont szélesség, keresés, mentett offline adatok, akkumulátor-kompatibilitás, animációkapcsoló, csökkentett mozgás, telepítési segítség, kijelentkezés. A teszt mesterséges adatokat használ.

## Az eredeti felülethez igazított végleges irány
A pontos vizuális referencia a `https://novenyfigyelo.netlify.app/`, a módosítandó oldal pedig a `https://noveny-figyelo.netlify.app/`. A referencia Netlify production deployja a `Doma10999/novenyfigyelo` tároló `ddb5548d6487893ec4d2987eb590cb7658c792b1` commitját használja; ezt csak olvastuk, a referenciaoldal nem változott.

Megmarad az eredeti középre helyezett Növényfigyelő cím, a világos zöld háttér, az egy oszlopban elhelyezett fehér növénykártyák, a középső nagy körkijelző, a név címkéje, a zöld fényerőcsúszka és a jobb alsó kinyíló menü. A korábbi átalakítások nagy üdvözlőblokkja, színes összesítői és állandó alsó menüsora kikerült. Kereső csak négy vagy több növénynél jelenik meg. A százalék sötét, olvasható számokkal látszik, a kör színe továbbra is a korábbi értékelést követi.

A működési javítások, pontos mérési időpont, régi mérés figyelmeztetés, telepíthetőség, mentett offline adatok, százalékos fényerő-visszajelzés és kikapcsolható animációk megmaradnak. A menü helyi SVG ikonokat és billentyűzettel kezelhető nyitott/zárt állapotot használ. A Firebase adatbázis és az ESP firmware nem változik.
