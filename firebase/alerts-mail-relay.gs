// Google Apps Script web app. Set NF_MAIL_RELAY_SECRET in Script Properties.
function doPost(event) {
  const result = { ok: false };
  try {
    const text = event.postData.contents;
    if (text.length > 1400) return relayResult_(result);
    const body = JSON.parse(text);
    const expected = PropertiesService.getScriptProperties().getProperty("NF_MAIL_RELAY_SECRET");
    if (!expected || expected.length !== 64 || typeof body.secret !== "string" ||
        body.secret.length !== expected.length || !sameSecret_(body.secret, expected)) return relayResult_(result);
    if (typeof body.email !== "string" || body.email.length > 254 ||
        !/^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(body.email) ||
        typeof body.body !== "string" || body.body.length > 480) return relayResult_(result);
    const subjects = { soil_low: "Szomjas a növényed!", air_bad: "Szellőztetés javasolt" };
    if (!Object.prototype.hasOwnProperty.call(subjects, body.type) || MailApp.getRemainingDailyQuota() < 1) return relayResult_(result);

    MailApp.sendEmail({
      to: body.email,
      subject: subjects[body.type],
      body: body.body + "\n\nNövényfigyelő\nhttps://noveny-figyelo.netlify.app/",
      name: "Növényfigyelő"
    });
    result.ok = true;
  } catch (error) {
    console.warn("Növényfigyelő levélküldés sikertelen.");
  }
  return relayResult_(result);
}

function sameSecret_(left, right) {
  let mismatch = 0;
  for (let i = 0; i < right.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function relayResult_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
