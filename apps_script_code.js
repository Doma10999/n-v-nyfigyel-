function doPost(e) {
  const data = JSON.parse(e.postData.contents);

  // A frontend már a "kijelzett %" értéket küldi (displayPct), itt moisture néven érkezik.
  const email = data.email;
  const deviceId = data.deviceId;
  const moisture = Number(data.moisture);
  const category = data.category || "";
  const plantName = data.plantName || "";

  if (!email || !deviceId || !Number.isFinite(moisture)) {
    return ContentService.createTextOutput("Hiányzó adat");
  }

  // Csak biztonsági extra: ha valamiért nagyobb, ne küldjük
  if (moisture > 35) {
    return ContentService.createTextOutput("Nem kell riasztás");
  }

  const subject = "🌱 Növényfigyelő – Szomjas a növényed!";
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>💧 Szomjas a növényed – ideje locsolni!</h2>
      <p><b>Növény:</b> ${plantName ? plantName : "—"}</p>
      <p><b>Eszköz:</b> ${deviceId}</p>
      <p><b>Kijelzett érték:</b> <span style="font-size:18px"><b>${moisture}%</b></span></p>
      <p><b>Kategória:</b> ${category}</p>
      <hr/>
      <p style="opacity:.8;font-size:12px">Ezt az üzenetet a Növényfigyelő rendszer küldte.</p>
    </div>
  `;

  MailApp.sendEmail({ to: email, subject, htmlBody });
  return ContentService.createTextOutput("Email elküldve");
}
