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

## Jobban olvasható, lekerekített telefonos megjelenés – 2026. október 26.
A felhasználó két mobilalkalmazás-referenciát adott a lekerekítésekhez és az olvashatósághoz. Megmarad az elfogadott zöld, középre rendezett felület és a teljes kör alakú mérés. A kör SVG-vastagsága 14-ről 23-ra, a nagy szám 44-ről 52 képpontra nőtt. A kör változatlan érték szerint töltődik, de mélyebb piros–borostyán–zöld színeket kapott. A kategória, világítás, státusz és mérési időpont nagyobb, sötétebb feliratokkal jelenik meg. A fontos kisebb feliratok ellenőrzött kontrasztja a saját hátterükön 6:1 fölötti.

A kártyák sugara 32 px; a belső vezérlők 18–22 px lekerekítést kaptak. A fejléc, névszerkesztés és eltávolítás gombjainak érintési felülete legalább 44 px. Az offline nézet és a felugró útmutatók betűmérete is nőtt. Új CSS/JS és service-worker verzió gondoskodik a korábban telepített példányok frissítéséről. Az eszközadatok, mérésértékelés, előfizetés, Firebase-séma és firmware nem változott.

A böngészős ellenőrzés kiegészült a látható körvastagság, betűméret, gombméret és lekerekítés vizsgálatával. A docs/readable-card-preview.png tesztadatokat mutat, nem valódi eszközmérést. Új előnézet a böngészős tesztben CAPTURE_PREVIEW=1 kapcsolóval készíthető.

## Kompakt alkalmazásstílus – 2026. október 26.
Az újabb visszajelzés alapján a nagy zöld névcímke, a díszítő háttérkörök és az egymás alatti állapotsávok helyére semleges, fehér alkalmazáskártya került. A növénynév balra rendezett címsor; a vastag, teljes körmérés smaragdzöld, figyelmeztetésnél borostyán színű. Azonos mérési és értékelési logika mellett a talajnedvesség és az állapot két egymás melletti mezőbe kerül. A típus és mérési időpont egyszerű részletsorként látható. A kategóriák adatbázisbeli neve és emoji előtagja nem változik, csak a kijelzésből marad el az emoji.

A menü és a vezérlők megtartják korábbi funkciójukat. A kártyák 25 px-es lekerekítésűek, a névszerkesztés és eltávolítás gombjai 44 px-esek. A docs/compact-card-preview.png tesztadatokat bemutató felületkép. A build és a korábbi böngészős ellenőrzések lefutnak, kiegészítve a kétoszlopos adatmezők és az emoji nélküli kategóriakijelzés vizsgálatával.


## 2026-10-26 – Garden native
Világos, meleg fehér mobilos felület sötétzöld tipográfiával, állandó alsó navigációval és címkézett másodlagos menüvel. Minden belépett fióknál látható darabszám, figyelmet kérő növények és régi mérések összegzése; keresés négy növénytől. Telefonon egy oszlop, nagyobb képernyőn két oszlop. A vastag kör megmarad, az állapot és a nyers talajnedvesség külön olvasható. A bejelentkezés, párbeszédablakok és a telepített PWA ugyanazt a stílust használják. A belépő, körmérő, számérték, menü és gomb animációk tiszteletben tartják a csökkentett mozgás beállítást. A párbeszédablakok billentyűzetes fókuszkezelést és Escape bezárást kapnak. Nincs Firebase séma-, előfizetés- vagy firmware-változás.


## 2026-10-26 – Studio 2026
Az alkalmazás teljes felületének egységesítése: hűvös világos háttér, fehér kártyák, mély türkiz kiemelés, egységes rendszerbetűk és térközök. Új növényfejlécek, vastag körmérők, állandó alsó navigáció és címkézett másodlagos menü. Az összegzés három gombja valós állapotszűrést végez (összes, figyelmet kér, régi mérés), kereséssel együtt. A bejelentkezés, grafikonok, csomagoldal, fizetés utáni oldal, offline nézet és PWA ugyanazt a vizuális rendszert használja.

Működés: a kategória csak sikeres mentés után változik meg, a mentési hiba látható visszajelzést kap. A fényerőcsúszka hiba vagy offline állapot esetén visszaáll az utolsó ismert beállításra; a mentés idején letiltott. Az értesítések mentése email-ellenőrzést, dupla mentés elleni védelmet és hibaüzenetet kapott. A grafikon Free csomagnál értelmes tájékoztatást mutat böngészőriasztás helyett. Az alacsony akkumulátorszint külön kiemelést kap. A mozgáscsökkentés a menüre és a körmérőre is érvényes. Az előfizetések, árak, adatbázisséma és firmware változatlan.

Ellenőrzés: build, service worker tesztek, kibővített Chromium teszt 360–1440 px szélességen. A teszt a szűrést, név- és kategóriamentést, LED mentést/visszaállítást, offline vezérlésvédelmet, Plus grafikonokat, értesítésmentést és hibakezelést, a csomagoldal linkjeit/elrendezését, modális fókuszkezelést, telepítési súgót és kijelentkezést ellenőrzi. A Firebase válaszok és írások szimuláltak; valódi eszköz, levélkézbesítés és Stripe tranzakció nem része a tesztnek.


## 2026-10-26 – Látványosabb mérés és egyértelműbb vezérlés
Színátmenetes körmérő finom külső osztásokkal, belső felülettel és végpontjelölővel. A nagy érték felirata „Számított vízellátottság”, a nyers érték „Mért talajnedvesség”. A „Miért két külön százalék?” lenyitható magyarázat az adott növény aktuális szenzorértékével és kategóriatartományával magyarázza a számítást. A 100% a számított skála vége; nem jelent automatikusan ideális állapotot. A számítás, az állapotküszöbök és a régi mérés jelzése változatlan.

A LED vezérlése külön kapcsolót és nagyobb színátmenetes fényerőcsúszkát kapott. Kikapcsolás után a kapcsoló visszaállítja az utolsó ismert nem nulla fényerőt (ha még nincs ilyen, 50%-ot). Mindkét vezérlő ugyanazt a ledLevel mezőt menti, mentés közben letiltott, hiba/offline esetén visszaáll. A kiválasztott vízigény kiemelt mezőben látható, külön „Módosítás” felirattal, és a kategóriaablak jelöli az aktuális választást. Az előfizetési korlátozások változatlanok.

Ellenőrzés: build és service worker tesztek, teljes Chromium teszt, LED ki/be kapcsolás, utolsó fényerő visszaállítása és elutasított mentés, kategóriakijelölés, valamint konkrét 81% szenzorérték → 100% számított érték próba a 30–60%-os kategóriánál. Firebase írások szimuláltak.


## 2026-10-26 – Finom botanikus arculat
Természetes zsálya- és mentazöld felületek, zöld–türkiz körmérő és csúszka, virágot és leveleket ábrázoló kis fejlécillusztráció. A növénykártyák vektoros ikonja a kiválasztott vízigénycsoporthoz igazodik (kaktusz, fűszernövény, levél, trópusi hajtás, vízinövény); ezek díszítő jelképek, nem fajfelismerés. Az illusztrációk inline SVG elemek, nincs új képletöltés vagy végtelen animáció. A mérési logika, feliratok, LED-vezérlés és kategóriakorlátozások változatlanok.


## 2026-10-26 – Növénykoszorús körmérő
A körmérő körül jól látható, inline SVG levélágak és virágok jelennek meg. A sötét erdőzöld középfelület fehér számmal és élénk smaragd színátmenetes mérőívvel erősebb kontrasztot ad. Figyelmet kérő állapotban a mérő meleg borostyán ívet és sötétbarna közepet használ; a botanikus díszítés nem helyettesíti az állapotjelzést. Az olvasható számterület és a vezérlők változatlanok. A díszítés nem fogad érintést és nincs folyamatos animációja.


## 2026-10-26 – Egységes botanikus mellékképernyők
Az útmutató, a grafikonok és az értesítési ablak rögzített, sötét erdőzöld, virágos fejlécet és külön görgethető tartalmat kapott. A bezárás mindig elérhető, az értesítések Mentés/Mégse gombjai fix alsó műveletsávba kerültek. Az értesítési lista hozzáférhető nevű kapcsolókat és egyértelmű email-törlő ikont használ. A grafikonok zöld színátmenetes oszlopokat, segédvonalakat és nagyobb számfeliratokat kapnak, a korábbi színezési küszöbök változatlanok. A csomagoldal sötét virágos fejlécet, egységes kártyákat és botanikus kiemeléseket kapott. Árak, előfizetési korlátozások, mérések és értesítési feltételek nem változtak.


## 2026-10-26 – Egyértelműbb mérés és tisztább hierarchia
A főképernyő nagy körében kizárólag a szenzor talajnedvesség-értéke jelenik meg. Kikerült a második százalék és a két érték eltérését magyarázó blokk. A kiválasztott vízigény csak a szöveges állapotértékelést befolyásolja; az értékelési küszöbök változatlanok. A mérés ideje közvetlenül a kör alatt látható, ezt követi az állapot, vízigény és világítás. Hiányzó mérésnél a jelzés „Mérésre vár”, nem 0%. Az offline képernyő is a mentett szenzorértéket használja.

Az előzményeket és értesítési integrációkat nem írjuk át: a korábbi vízigényhez igazított pontszám továbbra is ugyanazon a skálán kerül az előzménybe, és a grafikon ezt egyértelműen megnevezi. Nem alakítjuk vissza a régi adatokat, mert azokhoz nincs biztosan mentett történeti kategória. A főnézetre nincs kitalált szenzorérték. Az útmutató ehhez igazítva. Finom levéljel a kategóriánál, kis növénysor a láblécben; a meglévő virágkoszorú megmarad.


## 2026-10-31 – Olvasható asztali elrendezés
A grafikonablak legfeljebb 1120 px széles, 900 px felett két növény grafikonja kerül egymás mellé. Az értesítések legfeljebb 720 px-es, az útmutató 760 px-es középre rendezett ablakban jelenik meg; a Mentés/Mégse sáv és a bezárógomb elérhető marad. A háttér görgetése nyitott ablaknál leáll, a tartalom külön görgethető. Telefonon továbbra is egy oszlop és a képernyőhöz illő szélesség marad. Asztali gépen nagyobb mérési idő, vízigény-, állapot-, akku- és LED-feliratok; 1180 px széles tartalom, olvashatóbb fejléc és navigáció.

Az új history-chart.js a látható méret és a kijelző pixelsűrűsége szerint rajzol, rögzített 184/208 px grafikonmagassággal. Átméretezéskor újrarajzol, bezárásnál leállítja az animációt és leválasztja a megfigyelőket. A korábbi, vízigényhez igazított előzményértékek, színezési küszöbök és jogosultságok változatlanok.

Ellenőrzés: sikeres statikus build, 9 Node-teszt (rajzolás 240–700 CSS-pixel szélességen és 1–3× pixelsűrűségen, rejtett/átméretezett grafikon, érvénytelen adatok, animációleállítás és service worker). A CSS szelektor- és médiakaszkád ellenőrzése 360–2560 px szélességen sikeres. A korábbi böngészőteszt asztali regressziós esetekkel bővült, de ebben a munkamenetben böngészőautomatizálás nem állt rendelkezésre, ezért új böngészős vizuális és interakciós ellenőrzés nem történt. Valódi Firebase-írás, eszközvezérlés, email/push-küldés vagy Stripe-tranzakció nem történt.
