# Növényfigyelő – Email értesítés (INGYEN) Google Apps Script-tel

## Mit tud?
- Az ESP továbbra is **Firebase RTDB-be** ír.
- A Netlify-n futó **index.html** figyeli a Firebase adatokat.
- Ha a **kijelzett érték ≤ 35%**, és a harangnál engedélyezted, akkor **emailt küld**.

## 1) Google Apps Script (1x beállítás)
1. Google Drive → Új → Google Táblázat (bármilyen név)
2. Bővítmények → Apps Script
3. Másold be az `apps_script_code.js` tartalmát.
4. Deploy → New deployment → Type: Web app
   - Execute as: Me
   - Who has access: Anyone
5. Deploy → kimásolod az /exec URL-t.

## 2) index.html-ben URL beillesztése
Az `index.html` elején keresd ezt:
`const GOOGLE_APPS_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE";`
és cseréld ki a saját /exec URL-re.

## 3) GitHub / Netlify
- A ZIP tartalmát feltöltöd GitHubra.
- Netlify összekötöd a repóval (Publish directory: .)

## Használat
- Jelentkezz be (ahogy eddig).
- Kattints egy növény kártyára (kijelölés).
- Nyomd meg a harang ikont.
- Írd be az email címet → Igen.
