# Google Apps Script (Email + Naplózás Google Táblázatba)

A weboldal **POST** kérést küld a Web App URL-re. Ez a script:
1) beír egy sort a Google Táblázatba (naplózás)
2) opcionálisan emailt is küld (ha a kapott érték <= 35)

## 1) Táblázat
A táblázat első sorába (fejléc) javaslat:
`timestamp | uid | deviceId | moisture | category | plantName | email`

## 2) Apps Script kód (Kód.gs)
Másold be ezt **teljesen**, majd állítsd be a SHEET_ID-t.

```js
const SHEET_ID = "IDE_JON_A_TABLAZAT_ID"; // a táblázat URL-jéből
const SHEET_NAME = "Munkalap1"; // ha más a lap neve, írd át
const ALERT_THRESHOLD = 35;

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");

    const uid = String(data.uid || "");
    const email = String(data.email || "");
    const deviceId = String(data.deviceId || "");
    const moisture = Number(data.moisture);
    const category = String(data.category || "");
    const plantName = String(data.plantName || "");

    if (!deviceId || !Number.isFinite(moisture)) {
      return ContentService.createTextOutput("Hiányzó adat");
    }

    // 1) NAPLÓZÁS a táblázatba
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    sh.appendRow([new Date(), uid, deviceId, moisture, category, plantName, email]);

    // 2) EMAIL (ha kell)
    if (email && moisture <= ALERT_THRESHOLD) {
      const subject = "🌱 Növényfigyelő – Szomjas a növényed!";
      const htmlBody =
        `<div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>💧 Szomjas a növényed – ideje locsolni!</h2>
          <p><b>Növény:</b> ${plantName || "-"}</p>
          <p><b>Eszköz:</b> ${deviceId}</p>
          <p><b>Kijelzett érték:</b> <span style="font-size:18px"><b>${moisture}%</b></span></p>
          <p><b>Kategória:</b> ${category || "-"}</p>
          <hr>
          <p style="opacity:.8;font-size:12px">Ezt az üzenetet a Növényfigyelő rendszer küldte.</p>
        </div>`;

      MailApp.sendEmail({ to: email, subject, htmlBody });
    }

    return ContentService.createTextOutput("OK");
  } catch (err) {
    return ContentService.createTextOutput("Hiba: " + err);
  }
}
```

## 3) Deploy (Web App)
Apps Scriptben:
- **Telepítés / Deploy** → **New deployment**
- Type: **Web app**
- Execute as: **Me**
- Who has access: **Anyone**
- Deploy → másold ki az `/exec` URL-t

## 4) index.html-ben
A Web App URL-t ide kell beírni:
`const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/.../exec";`

