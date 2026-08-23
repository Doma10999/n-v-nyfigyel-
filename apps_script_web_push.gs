/**
 * Növényfigyelő – valódi Web Push riasztások
 *
 * A „Növényfigyelő Push” Google Apps Script projektben fut.
 * A már meglévő Script Properties értékeket használja:
 *   - FIREBASE_DB_URL
 *   - SERVICE_ACCOUNT
 *   - NTFY_TEST_UID (vagy opcionálisan PUSH_TEST_UID)
 *
 * Nem használ publikus vagy megosztott push titkot. A Cloudflare Workernek
 * rövid életű, a Firebase service accounttal aláírt JWT-t küld.
 */

const WEB_PUSH_WORKER_URL =
  "https://novenyfigyelo-push.drobnidominik.workers.dev";
const WEB_PUSH_CHECK_INTERVAL_MIN = 5;
const WEB_PUSH_SOIL_THRESHOLD = 35;
const WEB_PUSH_BATTERY_LOW = 25;
const WEB_PUSH_BATTERY_CRITICAL = 10;
const WEB_PUSH_BATTERY_REARM = 40;
const WEB_PUSH_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const WEB_PUSH_FRESH_MS = 12 * 60 * 60 * 1000;

function webPushConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const rawServiceAccount = String(
    properties.getProperty("SERVICE_ACCOUNT") || ""
  ).trim();

  let serviceAccount = {};
  try {
    serviceAccount = JSON.parse(rawServiceAccount);
  } catch (error) {
    throw new Error("A SERVICE_ACCOUNT Script Property nem érvényes JSON.");
  }

  return {
    dbUrl: String(properties.getProperty("FIREBASE_DB_URL") || "")
      .trim()
      .replace(/\/+$/, ""),
    projectId: String(serviceAccount.project_id || "").trim(),
    clientEmail: String(serviceAccount.client_email || "").trim(),
    privateKeyId: String(serviceAccount.private_key_id || "").trim(),
    privateKey: String(serviceAccount.private_key || "").replace(/\\n/g, "\n"),
    workerUrl: String(
      properties.getProperty("PUSH_WORKER_URL") || WEB_PUSH_WORKER_URL
    )
      .trim()
      .replace(/\/+$/, ""),
    testUid: String(
      properties.getProperty("PUSH_TEST_UID") ||
        properties.getProperty("NTFY_TEST_UID") ||
        ""
    ).trim()
  };
}

function webPushAssertConfig_(cfg) {
  const missing = [];
  if (!cfg.dbUrl) missing.push("FIREBASE_DB_URL");
  if (!cfg.projectId) missing.push("SERVICE_ACCOUNT.project_id");
  if (!cfg.clientEmail) missing.push("SERVICE_ACCOUNT.client_email");
  if (!cfg.privateKey) missing.push("SERVICE_ACCOUNT.private_key");
  if (!cfg.workerUrl) missing.push("PUSH_WORKER_URL");

  if (missing.length) {
    throw new Error("Hiányzó push beállítás: " + missing.join(", "));
  }
}

function webPushBase64Url_(value) {
  return Utilities.base64EncodeWebSafe(value, Utilities.Charset.UTF_8)
    .replace(/=+$/, "");
}

function webPushSignJwt_(header, claims, privateKey) {
  const unsigned =
    webPushBase64Url_(JSON.stringify(header)) +
    "." +
    webPushBase64Url_(JSON.stringify(claims));
  const signature = Utilities.computeRsaSha256Signature(unsigned, privateKey);
  return unsigned + "." + Utilities.base64EncodeWebSafe(signature).replace(/=+$/, "");
}

function webPushAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("webPushFirebaseAccessToken");
  if (cached) return cached;

  const cfg = webPushConfig_();
  webPushAssertConfig_(cfg);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  if (cfg.privateKeyId) header.kid = cfg.privateKeyId;

  const assertion = webPushSignJwt_(
    header,
    {
      iss: cfg.clientEmail,
      scope:
        "https://www.googleapis.com/auth/firebase.database " +
        "https://www.googleapis.com/auth/userinfo.email",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    },
    cfg.privateKey
  );

  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion
    },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const data = JSON.parse(response.getContentText() || "{}");
  if (code >= 300 || !data.access_token) {
    throw new Error("Firebase token hiba (" + code + ").");
  }

  cache.put("webPushFirebaseAccessToken", data.access_token, 3300);
  return data.access_token;
}

function webPushAdminJwt_() {
  const cfg = webPushConfig_();
  webPushAssertConfig_(cfg);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  if (cfg.privateKeyId) header.kid = cfg.privateKeyId;

  return webPushSignJwt_(
    header,
    {
      iss: cfg.clientEmail,
      sub: cfg.clientEmail,
      aud: cfg.workerUrl + "/send",
      iat: now,
      exp: now + 300
    },
    cfg.privateKey
  );
}

function webPushFirebaseGet_(path, accessToken) {
  const cfg = webPushConfig_();
  const response = UrlFetchApp.fetch(cfg.dbUrl + "/" + path + ".json", {
    method: "get",
    headers: { Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    throw new Error(
      "Firebase GET hiba (" + response.getResponseCode() + ")."
    );
  }

  return JSON.parse(response.getContentText() || "null");
}

function webPushFirebasePatch_(path, payload, accessToken) {
  const cfg = webPushConfig_();
  const response = UrlFetchApp.fetch(cfg.dbUrl + "/" + path + ".json", {
    method: "patch",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: { Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    throw new Error(
      "Firebase PATCH hiba (" + response.getResponseCode() + ")."
    );
  }
}

function webPushHasActivePlus_(subscription) {
  const data = subscription || {};
  const plan = String(data.plan || "free").trim().toLowerCase();
  const status = String(data.status || "inactive").trim().toLowerCase();
  let expiresAt = Number(data.expiresAt || 0);

  if (expiresAt > 0 && expiresAt < 100000000000) expiresAt *= 1000;

  const inactiveStatuses = [
    "free",
    "inactive",
    "canceled",
    "cancelled",
    "expired",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused"
  ];

  return (
    plan === "plus" &&
    inactiveStatuses.indexOf(status) === -1 &&
    !(expiresAt > 0 && expiresAt <= Date.now())
  );
}

function webPushSend_(uid, title, body, type, tag) {
  const cfg = webPushConfig_();
  const response = UrlFetchApp.fetch(cfg.workerUrl + "/send", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + webPushAdminJwt_() },
    payload: JSON.stringify({
      uid: String(uid),
      title: String(title || "Növényfigyelő"),
      body: String(body || ""),
      type: String(type || "general"),
      tag: String(tag || "novenyfigyelo"),
      url: "https://noveny-figyelo.netlify.app/"
    }),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText() || "{}";
  if (code >= 300) {
    throw new Error("Push Worker hiba (" + code + "): " + text);
  }

  return JSON.parse(text);
}

function webPushPlantName_(device, deviceId) {
  return (
    String(device.displayName || device.plantName || deviceId || "Növény").trim() ||
    "Növény"
  );
}

function webPushAirIsBad_(air) {
  const data = air || {};
  if (data.bad === true) return true;
  const status = String(data.status || "").trim().toLowerCase();
  return status.indexOf("rossz") !== -1 || status.indexOf("nagyon") !== -1;
}

function checkWebPushAlerts() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return;

  try {
    const accessToken = webPushAccessToken_();
    const users = webPushFirebaseGet_("users", accessToken) || {};
    const now = Date.now();

    Object.keys(users).forEach(function (uid) {
      const user = users[uid] || {};
      if (!webPushHasActivePlus_(user.subscription)) return;

      const devices = user.devices || {};
      Object.keys(devices).forEach(function (deviceId) {
        try {
          const device = devices[deviceId] || {};

          // Ugyanaz a kijelölés szabályozza az e-mailt és a push riasztást.
          if (!device.emailNotifEnabled) return;

          const patch = {};
          const plantName = webPushPlantName_(device, deviceId);
          const lastMeasurementAt = Number(
            device.lastMeasurementAt || device.lastSeen || 0
          );
          const fresh =
            lastMeasurementAt > 0 && now - lastMeasurementAt <= WEB_PUSH_FRESH_MS;

          const soil = Number(
            typeof device.sensorValue !== "undefined"
              ? device.sensorValue
              : device.soil
          );
          const lastSoilPushAt = Number(device.lastSoilPushAt || 0);

          if (
            fresh &&
            Number.isFinite(soil) &&
            soil <= WEB_PUSH_SOIL_THRESHOLD &&
            now - lastSoilPushAt >= WEB_PUSH_COOLDOWN_MS
          ) {
            const result = webPushSend_(
              uid,
              "💧 Ideje meglocsolni!",
              plantName + " nedvessége " + Math.round(soil) + "%-ra csökkent.",
              "soil_low",
              "soil_" + deviceId
            );

            if (Number(result.sent || 0) > 0) patch.lastSoilPushAt = now;
          }

          const battery = Number(
            typeof device.batteryPercent !== "undefined"
              ? device.batteryPercent
              : device.battery
          );

          if (Number.isFinite(battery)) {
            const previousBatteryState = String(
              device.pushBatteryState ||
                (device.pushBatteryArmed === false ? "low" : "ok")
            );

            if (battery >= WEB_PUSH_BATTERY_REARM) {
              if (previousBatteryState !== "ok") patch.pushBatteryState = "ok";
              patch.pushBatteryArmed = true;
            } else if (fresh && battery <= WEB_PUSH_BATTERY_CRITICAL) {
              if (previousBatteryState !== "critical") {
                const result = webPushSend_(
                  uid,
                  "🪫 Kritikus akkumulátor",
                  plantName +
                    " eszközének töltöttsége " +
                    Math.max(0, Math.round(battery)) +
                    "%.",
                  "battery_critical",
                  "battery_" + deviceId
                );

                if (Number(result.sent || 0) > 0) {
                  patch.lastBatteryPushAt = now;
                  patch.pushBatteryState = "critical";
                  patch.pushBatteryArmed = false;
                }
              }
            } else if (fresh && battery <= WEB_PUSH_BATTERY_LOW) {
              if (previousBatteryState === "ok") {
                const result = webPushSend_(
                  uid,
                  "🔋 Alacsony akkumulátor",
                  plantName +
                    " eszközének töltöttsége " +
                    Math.max(0, Math.round(battery)) +
                    "%.",
                  "battery_low",
                  "battery_" + deviceId
                );

                if (Number(result.sent || 0) > 0) {
                  patch.lastBatteryPushAt = now;
                  patch.pushBatteryState = "low";
                  patch.pushBatteryArmed = false;
                }
              }
            }
          }

          const air = device.airQuality || {};
          const lastAirPushAt = Number(device.lastAirPushAt || 0);
          if (
            fresh &&
            webPushAirIsBad_(air) &&
            now - lastAirPushAt >= WEB_PUSH_COOLDOWN_MS
          ) {
            const result = webPushSend_(
              uid,
              "🌬️ Szellőztetés javasolt",
              plantName + " környezetében romlott a levegő minősége.",
              "air_bad",
              "air_" + deviceId
            );

            if (Number(result.sent || 0) > 0) patch.lastAirPushAt = now;
          }

          if (Object.keys(patch).length) {
            webPushFirebasePatch_(
              "users/" + uid + "/devices/" + deviceId,
              patch,
              accessToken
            );
          }
        } catch (error) {
          console.error(
            "Push ellenőrzési hiba [" + uid + "/" + deviceId + "]: " + error
          );
        }
      });
    });
  } finally {
    lock.releaseLock();
  }
}

function setupWebPushSystem() {
  const cfg = webPushConfig_();
  webPushAssertConfig_(cfg);

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "checkWebPushAlerts") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("checkWebPushAlerts")
    .timeBased()
    .everyMinutes(WEB_PUSH_CHECK_INTERVAL_MIN)
    .create();

  Logger.log("A Web Push rendszer aktív: ellenőrzés 5 percenként.");
}

function sendTestWebPush() {
  const cfg = webPushConfig_();
  webPushAssertConfig_(cfg);
  if (!cfg.testUid) {
    throw new Error("Hiányzik a PUSH_TEST_UID vagy NTFY_TEST_UID beállítás.");
  }

  const result = webPushSend_(
    cfg.testUid,
    "🌱 Növényfigyelő teszt",
    "A push értesítés megfelelően működik ezen az eszközön.",
    "test",
    "novenyfigyelo_test"
  );

  Logger.log(JSON.stringify(result));
  return result;
}

