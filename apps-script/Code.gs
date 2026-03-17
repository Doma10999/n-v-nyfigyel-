/**
 * Növényfigyelő – Stripe + Google Sheet + Apps Script szinkron
 *
 * FONTOS:
 * 1) A Stripe Payment Linkeken hozz létre egy KÖTELEZŐ custom fieldet "uid" kulccsal.
 * 2) Ebbe kell a vásárlónak beírnia a Firebase UID-ját.
 * 3) A script 15 percenként lekéri a Stripe fizetéseket, és ha talál új sikeres fizetést,
 *    aktiválja a Plus csomagot a Firebase-ben.
 * 4) Naponta egyszer ellenőrzi a lejáratot és kiküldi az 5 napos emlékeztetőt.
 *
 * A script Realtime Database REST írást használ.
 * Ha a szabályaid lezárják az anonim REST írást, külön jogosultsági megoldás kell hozzá.
 */

const SHEET_NAME = 'subscriptions';

const SETTINGS = {
  FIREBASE_DB_URL: 'https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app',
  SUPPORT_EMAIL: 'ide-ird-a-sajat-email-cimedet@example.com',

  // A Stripe dashboardból ide másold be a két payment link ID-t (nem az URL-t, hanem pl. plink_...)
  PAYMENT_LINKS: {
    'plink_HAVI_LINK_ID': { plan: 'plus', durationDays: 30, label: 'Plus havi' },
    'plink_EVES_LINK_ID': { plan: 'plus', durationDays: 365, label: 'Plus éves' }
  }
};

function createSetupSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  sh.clear();

  const headers = [
    'uid',
    'email',
    'plan',
    'status',
    'expiresAt',
    'expiresAtText',
    'lastReminderAt',
    'source',
    'lastSessionId',
    'lastPaymentLink',
    'lastPaymentAt',
    'updatedAt'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}

function createProjectTriggers() {
  deleteProjectTriggers();

  ScriptApp.newTrigger('syncStripePayments')
    .timeBased()
    .everyMinutes(15)
    .create();

  ScriptApp.newTrigger('dailyPlanMaintenance')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
}

function deleteProjectTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
}

function syncStripePayments() {
  const props = PropertiesService.getScriptProperties();
  const stripeSecret = props.getProperty('STRIPE_SECRET_KEY');
  if (!stripeSecret) throw new Error('Hiányzik a STRIPE_SECRET_KEY Script Property.');

  const lastChecked = Number(props.getProperty('LAST_STRIPE_CHECK_UNIX') || 0);
  const nowUnix = Math.floor(Date.now() / 1000);

  // Első futásnál nézzünk vissza 3 napot.
  const fromUnix = lastChecked > 0 ? lastChecked - 300 : nowUnix - (3 * 24 * 60 * 60);

  const sessions = stripeListCheckoutSessions_(stripeSecret, fromUnix);

  sessions.forEach(session => {
    if (String(session.payment_status || '').toLowerCase() !== 'paid') return;

    const linkConfig = SETTINGS.PAYMENT_LINKS[session.payment_link];
    if (!linkConfig) return;

    if (sessionAlreadyProcessed_(session.id)) return;

    const uid = extractUidFromSession_(session);
    if (!uid) {
      Logger.log('UID hiányzik a sessionből: ' + session.id);
      return;
    }

    const email =
      ((session.customer_details || {}).email) ||
      session.customer_email ||
      '';

    const paidAtMs = Number(session.created || nowUnix) * 1000;
    activatePlusPlan_(uid, email, linkConfig, session.id, session.payment_link, paidAtMs);
  });

  props.setProperty('LAST_STRIPE_CHECK_UNIX', String(nowUnix));
}

function dailyPlanMaintenance() {
  const sh = getSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const col = colMap_(headers);
  const now = Date.now();
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const uid = String(row[col.uid] || '').trim();
    if (!uid) continue;

    const email = String(row[col.email] || '').trim();
    const plan = String(row[col.plan] || 'free').trim() || 'free';
    const status = String(row[col.status] || '').trim();
    const expiresAt = Number(row[col.expiresAt] || 0);
    const lastReminderAt = Number(row[col.lastReminderAt] || 0);

    if (!expiresAt) continue;

    if (expiresAt <= now && plan === 'plus') {
      setFirebasePlan_(uid, {
        plan: 'free',
        status: 'expired',
        updatedAt: Date.now()
      });

      sh.getRange(i + 1, col.status + 1).setValue('expired');
      sh.getRange(i + 1, col.updatedAt + 1).setValue(new Date());
      continue;
    }

    const shouldRemind =
      plan === 'plus' &&
      expiresAt > now &&
      expiresAt - now <= fiveDaysMs &&
      (!lastReminderAt || (now - lastReminderAt > 24 * 60 * 60 * 1000));

    if (shouldRemind && email) {
      GmailApp.sendEmail(
        email,
        'Növényfigyelő Plus – 5 nap múlva lejár a csomagod',
        [
          'Szia!',
          '',
          'A Növényfigyelő Plus csomagod 5 napon belül lejár.',
          'Ha továbbra is szeretnéd használni a grafikonokat, az email értesítést és az összes kategóriát, fizess elő újra a csomagra.',
          '',
          'Üdv,',
          'Növényfigyelő'
        ].join('\n')
      );

      sh.getRange(i + 1, col.lastReminderAt + 1).setValue(now);
      sh.getRange(i + 1, col.updatedAt + 1).setValue(new Date());
    }
  }
}

function activatePlusPlan_(uid, email, linkConfig, sessionId, paymentLinkId, paidAtMs) {
  const sub = getFirebaseSubscription_(uid);
  const currentExpiry = Number((sub || {}).expiresAt || 0);
  const now = Date.now();
  const base = currentExpiry > now ? currentExpiry : paidAtMs;
  const newExpiry = base + (linkConfig.durationDays * 24 * 60 * 60 * 1000);

  setFirebasePlan_(uid, {
    plan: linkConfig.plan,
    status: 'active',
    expiresAt: newExpiry,
    email: email || (sub || {}).email || '',
    source: 'stripe',
    lastSessionId: sessionId,
    lastPaymentLink: paymentLinkId,
    lastPaymentAt: paidAtMs,
    updatedAt: Date.now()
  });

  upsertSheetRow_({
    uid,
    email,
    plan: linkConfig.plan,
    status: 'active',
    expiresAt: newExpiry,
    source: 'stripe',
    lastSessionId: sessionId,
    lastPaymentLink: paymentLinkId,
    lastPaymentAt: paidAtMs,
    updatedAt: new Date()
  });
}

function stripeListCheckoutSessions_(stripeSecret, fromUnix) {
  let url = 'https://api.stripe.com/v1/checkout/sessions?limit=100&created[gte]=' + fromUnix;
  let all = [];

  while (url) {
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + stripeSecret
      },
      muteHttpExceptions: true
    });

    if (res.getResponseCode() >= 300) {
      throw new Error('Stripe hiba: ' + res.getContentText());
    }

    const data = JSON.parse(res.getContentText());
    all = all.concat(data.data || []);

    if (data.has_more && data.data && data.data.length) {
      const lastId = data.data[data.data.length - 1].id;
      url = 'https://api.stripe.com/v1/checkout/sessions?limit=100&created[gte]=' + fromUnix + '&starting_after=' + encodeURIComponent(lastId);
    } else {
      url = '';
    }
  }

  return all;
}

function extractUidFromSession_(session) {
  const fields = session.custom_fields || [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (String(field.key || '').toLowerCase() !== 'uid') continue;

    if (field.text && field.text.value) return String(field.text.value).trim();
    if (field.numeric && field.numeric.value) return String(field.numeric.value).trim();
    if (field.dropdown && field.dropdown.value) return String(field.dropdown.value).trim();
  }
  return '';
}

function sessionAlreadyProcessed_(sessionId) {
  const sh = getSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return false;
  const headers = values[0];
  const col = colMap_(headers);

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col.lastSessionId] || '').trim() === sessionId) return true;
  }
  return false;
}

function upsertSheetRow_(record) {
  const sh = getSheet_();
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const col = colMap_(headers);
  const expiresText = record.expiresAt ? Utilities.formatDate(new Date(record.expiresAt), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';

  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col.uid] || '').trim() === record.uid) {
      rowIndex = i + 1;
      break;
    }
  }

  const rowValues = new Array(headers.length).fill('');
  rowValues[col.uid] = record.uid || '';
  rowValues[col.email] = record.email || '';
  rowValues[col.plan] = record.plan || 'free';
  rowValues[col.status] = record.status || '';
  rowValues[col.expiresAt] = record.expiresAt || 0;
  rowValues[col.expiresAtText] = expiresText;
  rowValues[col.lastReminderAt] = '';
  rowValues[col.source] = record.source || '';
  rowValues[col.lastSessionId] = record.lastSessionId || '';
  rowValues[col.lastPaymentLink] = record.lastPaymentLink || '';
  rowValues[col.lastPaymentAt] = record.lastPaymentAt ? new Date(record.lastPaymentAt) : '';
  rowValues[col.updatedAt] = record.updatedAt || new Date();

  if (rowIndex === -1) {
    sh.appendRow(rowValues);
  } else {
    const currentReminder = sh.getRange(rowIndex, col.lastReminderAt + 1).getValue();
    rowValues[col.lastReminderAt] = currentReminder;
    sh.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  }
}

function getFirebaseSubscription_(uid) {
  const url = SETTINGS.FIREBASE_DB_URL + '/users/' + encodeURIComponent(uid) + '/subscription.json';
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 300) return {};
  return JSON.parse(res.getContentText() || '{}') || {};
}

function setFirebasePlan_(uid, payload) {
  const url = SETTINGS.FIREBASE_DB_URL + '/users/' + encodeURIComponent(uid) + '/subscription.json';
  const res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() >= 300) {
    throw new Error('Firebase patch hiba: ' + res.getContentText());
  }
}

function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    createSetupSheet();
    sh = ss.getSheetByName(SHEET_NAME);
  }
  return sh;
}

function colMap_(headers) {
  const map = {};
  headers.forEach((h, i) => map[String(h)] = i);
  return map;
}
