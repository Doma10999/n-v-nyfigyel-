Növényfigyelő – levegőminőség frissítés

A csomag tartalma:
- index.html
- styles.css
- firebase-app.js
- notifications.js
- apps_script_code.js
- payment.html
- payment.js
- payment-success.html
- offline-status.js
- plant-type-modal.js
- service-worker-register.js
- netlify.toml
- README.txt

Újdonságok:
- Levegőminőség kijelzés a növénykártyán, ha az adott eszköz küld airState adatot.
- Állapotok: Jó / Közepes / Rossz.
- Rossz levegő esetén email értesítés logika bekerült (Plus csomag + email értesítés bekapcsolva).
- A grafikon ideje továbbra is az utolsó adatváltozás idejét mutatja.

Fontos:
- A meglévő manifest.json, service-worker.js, ikonok és egyéb asset fájlok maradjanak meg a saját projektedből.
- Az apps_script_code.js fájlt a Google Apps Script projektedbe kell bemásolni és újra deployolni.
- A frontend email figyelés a webalkalmazás megnyitott állapotában tud futni. Ha később teljesen háttérben futó email riasztás kell, ahhoz szerveroldali vagy időzített Apps Script polling kell.
