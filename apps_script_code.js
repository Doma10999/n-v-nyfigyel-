/**
 * Növényfigyelő – Apps Script email küldés + 5 perces levegőellenőrzés
 *
 * Script Properties:
 * FIREBASE_DB_URL
 * FIREBASE_PROJECT_ID
 * FIREBASE_CLIENT_EMAIL
 * FIREBASE_PRIVATE_KEY
 */
const AIR_CHECK_INTERVAL_MIN = 5;
const AIR_DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function getCfg_() {
  const props = PropertiesService.getScriptProperties();
  return {
    dbUrl: String(props.getProperty('FIREBASE_DB_URL') || '').replace(/\/+$/, ''),
    projectId: String(props.getProperty('FIREBASE_PROJECT_ID') || ''),
    clientEmail: String(props.getProperty('FIREBASE_CLIENT_EMAIL') || ''),
    privateKey: String(props.getProperty('FIREBASE_PRIVATE_KEY') || '').replace(/\\n/g, '\n'),
  };
}

function getAccessToken_() {
  const cfg = getCfg_();
  if (!cfg.projectId || !cfg.clientEmail || !cfg.privateKey) {
    throw new Error('Hiányzó Firebase service account beállítás a Script Properties-ben.');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: cfg.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));
  const signatureBytes = Utilities.computeRsaSha256Signature(`${header}.${claim}`, cfg.privateKey);
  const signature = Utilities.base64EncodeWebSafe(signatureBytes);
  const jwt = `${header}.${claim}.${signature}`;
  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  const data = JSON.parse(resp.getContentText() || '{}');
  if (!data.access_token) throw new Error('Nem sikerült access tokent kérni: ' + resp.getContentText());
  return data.access_token;
}

function firebaseGet_(path) {
  const cfg = getCfg_();
  const token = getAccessToken_();
  const resp = UrlFetchApp.fetch(`${cfg.dbUrl}/${path}.json`, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) throw new Error(`Firebase GET hiba (${resp.getResponseCode()}): ${resp.getContentText()}`);
  return JSON.parse(resp.getContentText() || 'null');
}

function firebasePatch_(path, payload) {
  const cfg = getCfg_();
  const token = getAccessToken_();
  const resp = UrlFetchApp.fetch(`${cfg.dbUrl}/${path}.json`, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) throw new Error(`Firebase PATCH hiba (${resp.getResponseCode()}): ${resp.getContentText()}`);
}

function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('AirAlerts') || ss.insertSheet('AirAlerts');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Idő', 'UID', 'Eszköz', 'Növény', 'Email', 'Állapot', 'AQI', 'TVOC', 'eCO2', 'Küldve']);
  }
}

function getAirTone_(status, bad) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.indexOf('nagyon') !== -1) return 'Nagyon rossz';
  if (normalized.indexOf('rossz') !== -1 || bad) return 'Rossz';
  if (normalized.indexOf('kozepes') !== -1) return 'Közepes';
  if (normalized.indexOf('jo') !== -1) return 'Jó';
  if (normalized.indexOf('kivalo') !== -1) return 'Kiváló';
  return 'Nincs adat';
}

function buildAirEmailHtml_(payload) {
  const state = getAirTone_(payload.airState, payload.bad);
  const badgeBg = payload.bad ? '#fee2e2' : '#dcfce7';
  const badgeColor = payload.bad ? '#b91c1c' : '#166534';
  return `
  <div style="margin:0;padding:0;background:#eef6f0;font-family:Arial,sans-serif;color:#163524;">
    <div style="max-width:620px;margin:0 auto;padding:24px 14px;">
      <div style="background:linear-gradient(135deg,#ffffff 0%,#f5fbf6 100%);border-radius:26px;box-shadow:0 18px 40px rgba(0,0,0,0.08);overflow:hidden;">
        <div style="padding:26px 26px 14px;">
          <div style="font-size:30px;font-weight:800;color:#0d3b23;margin-bottom:8px;">Növényfigyelő 🌱</div>
          <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:${badgeBg};color:${badgeColor};font-weight:800;font-size:13px;">🌬️ Szellőztetés javasolt</div>
          <h2 style="margin:18px 0 10px;font-size:24px;line-height:1.3;color:#0f2f21;">Rossz lett a levegő minősége</h2>
          <p style="margin:0 0 18px;color:#456556;font-size:15px;line-height:1.6;">Érdemes ablakot nyitni vagy átszellőztetni a helyiséget, mert a szenzor szerint a levegő már nem ideális.</p>
          <div style="background:#f1f7f3;border-radius:20px;padding:16px 16px 8px;margin-bottom:18px;">
            <div style="font-weight:800;color:#0d3b23;margin-bottom:10px;">Eszköz adatai</div>
            <div style="font-size:14px;line-height:1.9;color:#234734;">
              <div><b>Növény:</b> ${payload.plantName || '—'}</div>
              <div><b>Eszköz:</b> ${payload.deviceId || '—'}</div>
              <div><b>Kategória:</b> ${payload.category || '—'}</div>
              <div><b>Állapot:</b> ${state}</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
            <div style="flex:1;min-width:120px;background:#ffffff;border-radius:18px;padding:14px 12px;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.05);"><div style="font-size:12px;color:#6a8675;font-weight:700;margin-bottom:6px;">AQI</div><div style="font-size:24px;font-weight:800;color:#0d3b23;">${payload.aqi ?? '—'}</div></div>
            <div style="flex:1;min-width:120px;background:#ffffff;border-radius:18px;padding:14px 12px;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.05);"><div style="font-size:12px;color:#6a8675;font-weight:700;margin-bottom:6px;">TVOC</div><div style="font-size:24px;font-weight:800;color:#0d3b23;">${payload.tvoc ?? '—'} <span style="font-size:12px;font-weight:700;">ppb</span></div></div>
            <div style="flex:1;min-width:120px;background:#ffffff;border-radius:18px;padding:14px 12px;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.05);"><div style="font-size:12px;color:#6a8675;font-weight:700;margin-bottom:6px;">eCO2</div><div style="font-size:24px;font-weight:800;color:#0d3b23;">${payload.eco2 ?? '—'} <span style="font-size:12px;font-weight:700;">ppm</span></div></div>
          </div>
          <div style="font-size:12px;color:#6b7280;line-height:1.7;">Ezt az üzenetet a Növényfigyelő rendszer küldte automatikusan.</div>
        </div>
      </div>
    </div>
  </div>`;
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const type = String(data.type || 'soil').toLowerCase();
    const email = String(data.email || '').trim();
    const deviceId = String(data.deviceId || '').trim();
    const plantName = String(data.plantName || '').trim();
    const category = String(data.category || '').trim();
    if (!email || !deviceId) return ContentService.createTextOutput('Hiányzó adat');
    if (type === 'air') {
      const payload = { email, deviceId, plantName, category, aqi: Number(data.aqi), tvoc: Number(data.tvoc), eco2: Number(data.eco2), airState: String(data.airState || 'rossz'), bad: !!data.bad };
      MailApp.sendEmail({ to: email, subject: '🌬️ Növényfigyelő – Szellőztetés javasolt', htmlBody: buildAirEmailHtml_(payload) });
      return ContentService.createTextOutput('Levegő email elküldve');
    }
    const moisture = Number(data.moisture);
    if (!Number.isFinite(moisture)) return ContentService.createTextOutput('Hiányzó talaj adat');
    if (moisture > 35) return ContentService.createTextOutput('Nem kell riasztás');
    MailApp.sendEmail({
      to: email,
      subject: '💧 Növényfigyelő – Szomjas a növényed!',
      htmlBody: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;"><h2 style="color:#166534;">💧 Szomjas a növényed – ideje locsolni!</h2><p><b>Növény:</b> ${plantName || '—'}</p><p><b>Eszköz:</b> ${deviceId}</p><p><b>Kijelzett érték:</b> ${moisture}%</p><p><b>Kategória:</b> ${category || '—'}</p><hr><p style="font-size:12px;color:#6b7280;">Ezt az üzenetet a Növényfigyelő rendszer küldte.</p></div>`
    });
    return ContentService.createTextOutput('Talaj email elküldve');
  } catch (err) {
    return ContentService.createTextOutput('Hiba: ' + err);
  }
}

function runAirQualityChecks() {
  const users = firebaseGet_('users') || {};
  const now = Date.now();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('AirAlerts') || ss.insertSheet('AirAlerts');
  if (sheet.getLastRow() === 0) setupSheets();
  Object.keys(users).forEach((uid) => {
    const devices = (users[uid] && users[uid].devices) || {};
    Object.keys(devices).forEach((deviceId) => {
      const device = devices[deviceId] || {};
      const emailEnabled = !!device.emailNotifEnabled;
      const email = String(device.emailNotifEmail || '').trim();
      const cooldownMs = Number(device.airEmailCooldownMs || device.emailNotifCooldownMs || AIR_DEFAULT_COOLDOWN_MS);
      const lastSentAt = Number(device.lastAirEmailSentAt || 0);
      const air = device.airQuality || {};
      const bad = !!air.bad;
      if (!emailEnabled || !email || !bad) return;
      if (now - lastSentAt < cooldownMs) return;
      const payload = { email, deviceId, plantName: String(device.displayName || deviceId), category: String(device.plantType || ''), aqi: Number(air.aqi), tvoc: Number(air.tvoc), eco2: Number(air.eco2), airState: String(air.status || 'rossz'), bad: true };
      MailApp.sendEmail({ to: email, subject: '🌬️ Növényfigyelő – Szellőztetés javasolt', htmlBody: buildAirEmailHtml_(payload) });
      firebasePatch_(`users/${uid}/devices/${deviceId}`, { lastAirEmailSentAt: now });
      sheet.appendRow([new Date(now), uid, deviceId, payload.plantName, email, getAirTone_(payload.airState, true), payload.aqi, payload.tvoc, payload.eco2, 'igen']);
    });
  });
}

function createAirQualityTrigger() {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'runAirQualityChecks') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('runAirQualityChecks').timeBased().everyMinutes(AIR_CHECK_INTERVAL_MIN).create();
}
