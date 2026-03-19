/***********************
 * NÖVÉNYFIGYELŐ – EMAIL + STRIPE ELŐFIZETÉS
 *
 * Ez a kód két dolgot csinál:
 * 1) Növényes email értesítés, ha 35% alá esik az érték
 * 2) Stripe előfizetések szinkronja Firebase-be
 *
 * JAVASLAT:
 * - ehhez hozz létre egy KÜLÖN Google Táblázatot
 * - abban nyiss meg egy új Apps Script projektet
 * - ezt a teljes fájlt másold be a Code.gs-be
 ***********************/

/***********************
 * ALAP BEÁLLÍTÁSOK
 ***********************/
const FIREBASE_URL = "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app";
const EMAIL_COOLDOWN = 6 * 60 * 60 * 1000; // 6 óra
const SUBS_SHEET_NAME = 'subscriptions';
const SUB_REMINDER_DAYS = 5;

const STRIPE_SETTINGS = {
  SUPPORT_EMAIL: 'ide-ird-a-sajat-email-cimedet@example.com',
  MONTHLY_PRICE_HUF: 490,
  YEARLY_PRICE_HUF: 3999
};

const PLANT_CATEGORIES = {
  "🌵Szárazkedvelő": { min: 10, max: 40 },
  "🌾Mérsékelten száraz": { min: 20, max: 45 },
  "🌿Kiegyensúlyozott vízigényű": { min: 30, max: 60 },
  "🌱Nedvességkedvelő": { min: 50, max: 80 },
  "💧Vízigényes": { min: 70, max: 100 }
};

/***********************
 * NÖVÉNYES EMAIL ÉRTESÍTÉS
 ***********************/
function checkPlantsAndSendEmails() {
  const users = fetchFirebase_("/users");
  if (!users) return;

  for (const uid in users) {
    const user = users[uid];
    if (!user.devices) continue;

    for (const deviceId in user.devices) {
      const dev = user.devices[deviceId];

      if (!dev.emailNotifEnabled) continue;
      if (!dev.emailNotifEmail) continue;
      if (typeof dev.sensorValue !== "number") continue;

      const category = dev.plantType;
      if (!PLANT_CATEGORIES[category]) continue;

      const { min, max } = PLANT_CATEGORIES[category];
      let percent = Math.round(((dev.sensorValue - min) / (max - min)) * 100);
      percent = Math.max(0, Math.min(100, percent));

      if (percent > 35) continue;

      const last = dev.lastEmailSentAt || 0;
      if (Date.now() - last < EMAIL_COOLDOWN) continue;

      sendPlantEmail_(dev.emailNotifEmail, dev.displayName || "Növény", percent, category);
      updateFirebase_("/users/" + uid + "/devices/" + deviceId + "/lastEmailSentAt", Date.now());
    }
  }
}

function sendPlantEmail_(email, plant, percent, category) {
  const html = `
  <div style="font-family:Arial;background:#f4f6f5;padding:24px">
    <div style="max-width:520px;margin:auto;background:#ffffff;padding:22px;border-radius:14px">
      <h2 style="color:#2f855a;margin-top:0">🌱 ${plant}</h2>
      <p style="font-size:15px">⚠️ <b>A növény vízszintje alacsony!</b></p>
      <div style="background:#f1f5f4;padding:14px;border-radius:10px;margin:15px 0;">
        <p>💧 <b>Nedvesség:</b> ${percent}%</p>
        <p>🌿 <b>Kategória:</b> ${category}</p>
      </div>
      <p>👉 Kérlek öntözd meg a növényt, hogy egészséges maradjon 🌱</p>
      <hr style="margin:20px 0">
      <small style="color:#777">
        Növényfigyelő automatikus értesítés<br>
        Új értesítés 6 óra múlva érkezhet.
      </small>
    </div>
  </div>`;

  MailApp.sendEmail({
    to: email,
    subject: "🌱 Szomjas a növényed!",
    htmlBody: html
  });
}

/***********************
 * STRIPE ELŐFIZETÉS SZINKRON
 ***********************/
function createSubscriptionsSheet() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SUBS_SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SUBS_SHEET_NAME);
  sh.clear();

  const headers = [
    'uid',
    'email',
    'plan',
    'status',
    'expiresAt',
    'expiresAtText',
    'cancelAtPeriodEnd',
    'lastReminderAt',
    'stripeCustomerId',
    'stripeSubscriptionId',
    'lastCheckoutSessionId',
    'lastInvoiceId',
    'source',
    'updatedAt'
  ];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.setFrozenRows(1);
}

function setupAllTriggers() {
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
  const stripeSecret = getStripeSecret_();
  const props = PropertiesService.getScriptProperties();
  const lastChecked = Number(props.getProperty('LAST_STRIPE_CHECK_UNIX') || 0);
  const nowUnix = Math.floor(Date.now() / 1000);
  const fromUnix = lastChecked > 0 ? Math.max(0, lastChecked - 300) : nowUnix - (7 * 24 * 60 * 60);

  const sessions = stripeListCheckoutSessions_(stripeSecret, fromUnix);

  sessions.forEach(session => {
    if (String(session.status || '').toLowerCase() !== 'complete') return;
    if (String(session.payment_status || '').toLowerCase() !== 'paid') return;
    if (sessionAlreadyProcessed_(session.id)) return;

    const uid = extractUidFromSession_(session);
    if (!uid) {
      Logger.log('UID hiányzik a Stripe sessionből: ' + session.id);
      return;
    }

    const email =
      ((session.customer_details || {}).email) ||
      session.customer_email ||
      '';

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription && session.subscription.id) || '';

    if (!subscriptionId) {
      // fallback: ha valamiért nem subscription checkout volt
      activateManualDuration_(uid, email, session);
      return;
    }

    const sub = stripeGetSubscription_(stripeSecret, subscriptionId);
    activateOrRefreshFromSubscription_(uid, email, session, sub);
  });

  props.setProperty('LAST_STRIPE_CHECK_UNIX', String(nowUnix));
}

function dailyPlanMaintenance() {
  const stripeSecret = getStripeSecret_();
  const sh = getSubscriptionsSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0];
  const col = colMap_(headers);
  const now = Date.now();
  const reminderWindowMs = SUB_REMINDER_DAYS * 24 * 60 * 60 * 1000;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const uid = String(row[col.uid] || '').trim();
    if (!uid) continue;

    let email = String(row[col.email] || '').trim();
    let plan = String(row[col.plan] || 'free').trim() || 'free';
    let status = String(row[col.status] || '').trim();
    let expiresAt = Number(row[col.expiresAt] || 0);
    let lastReminderAt = Number(row[col.lastReminderAt] || 0);
    const subscriptionId = String(row[col.stripeSubscriptionId] || '').trim();

    if (subscriptionId) {
      try {
        const sub = stripeGetSubscription_(stripeSecret, subscriptionId);
        const refreshed = refreshSubscriptionRowFromStripe_(uid, row, col, sub);
        email = refreshed.email;
        plan = refreshed.plan;
        status = refreshed.status;
        expiresAt = refreshed.expiresAt;
      } catch (err) {
        Logger.log('Stripe refresh hiba (' + uid + '): ' + err.message);
      }
    }

    if (plan === 'plus' && expiresAt && expiresAt <= now) {
      setFirebaseSubscription_(uid, {
        plan: 'free',
        status: 'expired',
        expiresAt: 0,
        updatedAt: Date.now()
      });

      sh.getRange(i + 1, col.plan + 1).setValue('free');
      sh.getRange(i + 1, col.status + 1).setValue('expired');
      sh.getRange(i + 1, col.expiresAt + 1).setValue(0);
      sh.getRange(i + 1, col.expiresAtText + 1).setValue('');
      sh.getRange(i + 1, col.updatedAt + 1).setValue(new Date());
      continue;
    }

    const shouldRemind =
      plan === 'plus' &&
      expiresAt > now &&
      expiresAt - now <= reminderWindowMs &&
      (!lastReminderAt || (now - lastReminderAt > 24 * 60 * 60 * 1000));

    if (shouldRemind && email) {
      sendRenewalReminderEmail_(email, expiresAt);
      sh.getRange(i + 1, col.lastReminderAt + 1).setValue(now);
      sh.getRange(i + 1, col.updatedAt + 1).setValue(new Date());
    }
  }
}

function activateManualDuration_(uid, email, session) {
  const amount = Number(session.amount_total || 0);
  let expiresAt = 0;

  if (amount === STRIPE_SETTINGS.MONTHLY_PRICE_HUF) {
    expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
  } else if (amount === STRIPE_SETTINGS.YEARLY_PRICE_HUF) {
    expiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000);
  } else {
    Logger.log('Nem ismert összegű fizetés, kihagyva: ' + amount);
    return;
  }

  const payload = {
    uid: uid,
    email: email,
    plan: 'plus',
    status: 'active',
    expiresAt: expiresAt,
    cancelAtPeriodEnd: false,
    stripeCustomerId: session.customer || '',
    stripeSubscriptionId: '',
    lastCheckoutSessionId: session.id || '',
    lastInvoiceId: session.invoice || '',
    source: 'stripe_manual_fallback',
    updatedAt: new Date()
  };

  setFirebaseSubscription_(uid, {
    plan: payload.plan,
    status: payload.status,
    expiresAt: payload.expiresAt,
    email: payload.email,
    source: payload.source,
    lastCheckoutSessionId: payload.lastCheckoutSessionId,
    updatedAt: Date.now()
  });

  upsertSubscriptionRow_(payload);
}

function activateOrRefreshFromSubscription_(uid, email, session, sub) {
  const expiresAt = Number(sub.current_period_end || 0) * 1000;
  const status = String(sub.status || 'inactive');
  const plan = ['active', 'trialing', 'past_due', 'unpaid'].includes(status) ? 'plus' : 'free';

  const payload = {
    uid: uid,
    email: email || ((sub.customer_email || '')),
    plan: plan,
    status: status,
    expiresAt: expiresAt,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : ((sub.customer || {}).id || ''),
    stripeSubscriptionId: sub.id || '',
    lastCheckoutSessionId: session.id || '',
    lastInvoiceId: (sub.latest_invoice && sub.latest_invoice.id) || session.invoice || '',
    source: 'stripe_subscription',
    updatedAt: new Date()
  };

  setFirebaseSubscription_(uid, {
    plan: payload.plan,
    status: payload.status,
    expiresAt: payload.expiresAt,
    email: payload.email,
    source: payload.source,
    stripeCustomerId: payload.stripeCustomerId,
    stripeSubscriptionId: payload.stripeSubscriptionId,
    cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
    lastCheckoutSessionId: payload.lastCheckoutSessionId,
    lastInvoiceId: payload.lastInvoiceId,
    updatedAt: Date.now()
  });

  upsertSubscriptionRow_(payload);
}

function refreshSubscriptionRowFromStripe_(uid, row, col, sub) {
  const sh = getSubscriptionsSheet_();
  const rowIndex = findRowByUid_(sh, uid);
  const expiresAt = Number(sub.current_period_end || 0) * 1000;
  const status = String(sub.status || 'inactive');
  const plan = ['active', 'trialing', 'past_due', 'unpaid'].includes(status) ? 'plus' : 'free';

  const email = String(row[col.email] || '').trim();
  const payload = {
    plan: plan,
    status: status,
    expiresAt: expiresAt,
    expiresAtText: expiresAt ? Utilities.formatDate(new Date(expiresAt), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '',
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    updatedAt: new Date(),
    lastInvoiceId: (sub.latest_invoice && sub.latest_invoice.id) || String(row[col.lastInvoiceId] || '')
  };

  if (rowIndex > 0) {
    sh.getRange(rowIndex, col.plan + 1).setValue(payload.plan);
    sh.getRange(rowIndex, col.status + 1).setValue(payload.status);
    sh.getRange(rowIndex, col.expiresAt + 1).setValue(payload.expiresAt);
    sh.getRange(rowIndex, col.expiresAtText + 1).setValue(payload.expiresAtText);
    sh.getRange(rowIndex, col.cancelAtPeriodEnd + 1).setValue(payload.cancelAtPeriodEnd);
    sh.getRange(rowIndex, col.lastInvoiceId + 1).setValue(payload.lastInvoiceId);
    sh.getRange(rowIndex, col.updatedAt + 1).setValue(payload.updatedAt);
  }

  setFirebaseSubscription_(uid, {
    plan: payload.plan,
    status: payload.status,
    expiresAt: payload.expiresAt,
    cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
    lastInvoiceId: payload.lastInvoiceId,
    updatedAt: Date.now()
  });

  return {
    email: email,
    plan: payload.plan,
    status: payload.status,
    expiresAt: payload.expiresAt
  };
}

function sendRenewalReminderEmail_(email, expiresAt) {
  const expiryText = Utilities.formatDate(new Date(expiresAt), Session.getScriptTimeZone(), 'yyyy.MM.dd.');
  const html = `
  <div style="font-family:Arial;background:#f4f6f5;padding:24px">
    <div style="max-width:520px;margin:auto;background:#ffffff;padding:22px;border-radius:14px">
      <h2 style="color:#2f855a;margin-top:0">💳 Növényfigyelő Plus</h2>
      <p style="font-size:15px">
        A Plus csomagod <b>${SUB_REMINDER_DAYS} napon belül</b> lejár.
      </p>
      <div style="background:#f1f5f4;padding:14px;border-radius:10px;margin:15px 0;">
        <p>📅 <b>Következő forduló / lejárat:</b> ${expiryText}</p>
        <p>🌿 <b>Elérhető funkciók:</b> grafikon, email értesítés, összes kategória</p>
      </div>
      <p>👉 Ha tovább szeretnéd használni a Plus funkciókat, újítsd meg a csomagot a weboldalon.</p>
      <hr style="margin:20px 0">
      <small style="color:#777">
        Növényfigyelő automatikus értesítés
      </small>
    </div>
  </div>`;

  MailApp.sendEmail({
    to: email,
    subject: '💳 Növényfigyelő Plus – hamarosan lejár a csomagod',
    htmlBody: html
  });
}

/***********************
 * STRIPE SEGÉDFÜGGVÉNYEK
 ***********************/
function stripeListCheckoutSessions_(stripeSecret, fromUnix) {
  let url = 'https://api.stripe.com/v1/checkout/sessions?limit=100&status=complete&created[gte]=' + fromUnix + '&expand[]=data.subscription&expand[]=data.customer';
  let all = [];

  while (url) {
    const data = stripeFetchJson_(stripeSecret, url);
    all = all.concat(data.data || []);

    if (data.has_more && data.data && data.data.length) {
      const lastId = data.data[data.data.length - 1].id;
      url = 'https://api.stripe.com/v1/checkout/sessions?limit=100&status=complete&created[gte]=' + fromUnix + '&starting_after=' + encodeURIComponent(lastId) + '&expand[]=data.subscription&expand[]=data.customer';
    } else {
      url = '';
    }
  }

  return all;
}

function stripeGetSubscription_(stripeSecret, subscriptionId) {
  const url = 'https://api.stripe.com/v1/subscriptions/' + encodeURIComponent(subscriptionId) + '?expand[]=latest_invoice&expand[]=customer';
  return stripeFetchJson_(stripeSecret, url);
}

function stripeFetchJson_(stripeSecret, url) {
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

  return JSON.parse(res.getContentText());
}

function extractUidFromSession_(session) {
  if (session.client_reference_id) return String(session.client_reference_id).trim();

  const fields = session.custom_fields || [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] || {};
    const key = String(field.key || field.label || '').toLowerCase().trim();
    if (!['uid', 'firebase uid', 'firebase_uid'].includes(key)) continue;

    if (field.text && field.text.value) return String(field.text.value).trim();
    if (field.numeric && field.numeric.value) return String(field.numeric.value).trim();
    if (field.dropdown && field.dropdown.value) return String(field.dropdown.value).trim();
  }
  return '';
}

function getStripeSecret_() {
  const stripeSecret = PropertiesService.getScriptProperties().getProperty('STRIPE_SECRET_KEY');
  if (!stripeSecret) {
    throw new Error('Hiányzik a STRIPE_SECRET_KEY Script Property. Állítsd be az Apps Scriptben.');
  }
  return stripeSecret;
}

/***********************
 * FIREBASE SEGÉDFÜGGVÉNYEK
 ***********************/
function fetchFirebase_(path) {
  const res = UrlFetchApp.fetch(FIREBASE_URL + path + '.json');
  return JSON.parse(res.getContentText());
}

function updateFirebase_(path, value) {
  UrlFetchApp.fetch(FIREBASE_URL + path + '.json', {
    method: 'PUT',
    contentType: 'application/json',
    payload: JSON.stringify(value)
  });
}

function setFirebaseSubscription_(uid, payload) {
  const url = FIREBASE_URL + '/users/' + encodeURIComponent(uid) + '/subscription.json';
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

/***********************
 * TÁBLÁZAT SEGÉDFÜGGVÉNYEK
 ***********************/
function getSubscriptionsSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SUBS_SHEET_NAME);
  if (!sh) {
    createSubscriptionsSheet();
    sh = ss.getSheetByName(SUBS_SHEET_NAME);
  }
  return sh;
}

function colMap_(headers) {
  const map = {};
  headers.forEach((h, i) => map[String(h)] = i);
  return map;
}

function findRowByUid_(sheet, uid) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return -1;
  const col = colMap_(values[0]);

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col.uid] || '').trim() === uid) return i + 1;
  }
  return -1;
}

function sessionAlreadyProcessed_(sessionId) {
  const sh = getSubscriptionsSheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return false;
  const col = colMap_(values[0]);

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col.lastCheckoutSessionId] || '').trim() === sessionId) return true;
  }
  return false;
}

function upsertSubscriptionRow_(record) {
  const sh = getSubscriptionsSheet_();
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const col = colMap_(headers);
  const rowIndex = findRowByUid_(sh, record.uid);

  const rowValues = new Array(headers.length).fill('');
  rowValues[col.uid] = record.uid || '';
  rowValues[col.email] = record.email || '';
  rowValues[col.plan] = record.plan || 'free';
  rowValues[col.status] = record.status || '';
  rowValues[col.expiresAt] = record.expiresAt || 0;
  rowValues[col.expiresAtText] = record.expiresAt ? Utilities.formatDate(new Date(record.expiresAt), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
  rowValues[col.cancelAtPeriodEnd] = !!record.cancelAtPeriodEnd;
  rowValues[col.lastReminderAt] = '';
  rowValues[col.stripeCustomerId] = record.stripeCustomerId || '';
  rowValues[col.stripeSubscriptionId] = record.stripeSubscriptionId || '';
  rowValues[col.lastCheckoutSessionId] = record.lastCheckoutSessionId || '';
  rowValues[col.lastInvoiceId] = record.lastInvoiceId || '';
  rowValues[col.source] = record.source || '';
  rowValues[col.updatedAt] = record.updatedAt || new Date();

  if (rowIndex === -1) {
    sh.appendRow(rowValues);
  } else {
    const currentReminder = sh.getRange(rowIndex, col.lastReminderAt + 1).getValue();
    rowValues[col.lastReminderAt] = currentReminder;
    sh.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
  }
}
