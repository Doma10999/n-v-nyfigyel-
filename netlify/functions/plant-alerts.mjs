import webPush from "web-push";
import { alertsForDevice, validPushEndpoint } from "../alert-policy.mjs";

export const config = { schedule: "*/10 * * * *" };
let token;
let tokenExpiresAt = 0;

async function authToken(env) {
  if (token && Date.now() < tokenExpiresAt) return token;
  const url = new URL("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword");
  url.searchParams.set("key", env.NF_FIREBASE_API_KEY);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.NF_ALERT_USER, password: env.NF_ALERT_PASSWORD, returnSecureToken: true }),
    signal: AbortSignal.timeout(5500)
  });
  if (!response.ok) throw new Error(`Firebase Auth HTTP ${response.status}`);
  const payload = await response.json();
  token = payload.idToken;
  tokenExpiresAt = Date.now() + (Number(payload.expiresIn) - 300) * 1000;
  return token;
}

async function database(env, path, method = "GET", value, headers = {}) {
  const url = new URL(`/v2/${path}.json`, env.NF_FIREBASE_DATABASE_URL);
  url.searchParams.set("auth", await authToken(env));
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: value === undefined ? undefined : JSON.stringify(value),
    signal: AbortSignal.timeout(4500)
  });
  if (response.status === 401) token = null;
  return response;
}

async function acquireLease(env, now) {
  const current = await database(env, "alertState/lease", "GET", undefined, { "X-Firebase-ETag": "true" });
  if (!current.ok) throw new Error(`Értesítési zár HTTP ${current.status}`);
  const tag = current.headers.get("etag");
  if (!tag || Number(await current.json()) > now) return false;
  const result = await database(env, "alertState/lease", "PUT", now + 45000, { "if-match": tag });
  if (result.status === 412) return false;
  if (!result.ok) throw new Error(`Értesítési zár HTTP ${result.status}`);
  return true;
}

async function readJson(response) {
  if (!response.ok) throw new Error(`Értesítési adatok HTTP ${response.status}`);
  return await response.json() || {};
}

async function sendMail(env, email, alert) {
  const url = new URL(env.NF_MAIL_RELAY_URL);
  if (url.protocol !== "https:" || url.hostname !== "script.google.com" || !/^\/macros\/s\/[a-z0-9_-]+\/exec$/i.test(url.pathname)) {
    throw new Error("A levelező végpont címe hibás.");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.NF_MAIL_RELAY_SECRET, email, type: alert.type, body: alert.body }),
    signal: AbortSignal.timeout(7500)
  });
  if (!response.ok || !(await response.json()).ok) throw new Error("Az e-mail-küldő visszautasította az üzenetet.");
}

async function sendPush(env, uid, subscriptions, deviceId, alert, now) {
  const results = await Promise.allSettled(subscriptions.map(async ([id, subscription]) => {
    if (!validPushEndpoint(subscription.endpoint) || (subscription.expiresAt && subscription.expiresAt < now)) {
      await database(env, `users/${uid}/pushSubscriptions/${id}`, "DELETE");
      return false;
    }
    try {
      await webPush.sendNotification(subscription, JSON.stringify({
        title: alert.title, body: alert.body, type: alert.type,
        tag: `${alert.type}-${deviceId}`, url: "/", timestamp: now
      }), {
        TTL: 1800,
        timeout: 5500,
        vapidDetails: {
          subject: env.NF_VAPID_SUBJECT,
          publicKey: env.NF_VAPID_PUBLIC_KEY,
          privateKey: env.NF_VAPID_PRIVATE_KEY
        }
      });
      return true;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await database(env, `users/${uid}/pushSubscriptions/${id}`, "DELETE");
        return false;
      }
      console.warn("Push kézbesítési hiba", error.statusCode || "network");
      return false;
    }
  }));
  return results.some(result => result.status === "fulfilled" && result.value);
}

export default async () => {
  const names = [
    "NF_ALERTS_ENABLED", "NF_FIREBASE_DATABASE_URL", "NF_FIREBASE_API_KEY", "NF_ALERT_USER",
    "NF_ALERT_PASSWORD", "NF_VAPID_SUBJECT", "NF_VAPID_PUBLIC_KEY", "NF_VAPID_PRIVATE_KEY",
    "NF_MAIL_RELAY_URL", "NF_MAIL_RELAY_SECRET"
  ];
  const env = Object.fromEntries(names.map(name => [name, Netlify.env.get(name)]));
  if (env.NF_ALERTS_ENABLED !== "true") return new Response(null, { status: 204 });
  const now = Date.now();
  try {
    if (!await acquireLease(env, now)) return new Response(null, { status: 204 });
    const [users, lastSent] = await Promise.all([
      database(env, "users").then(readJson),
      database(env, "alertState/sent").then(readJson)
    ]);
    const work = [];
    const pushReady = env.NF_VAPID_PUBLIC_KEY && env.NF_VAPID_PRIVATE_KEY && env.NF_VAPID_SUBJECT;
    const mailReady = env.NF_MAIL_RELAY_URL && env.NF_MAIL_RELAY_SECRET;
    for (const [uid, user] of Object.entries(users)) {
      const subscriptions = Object.entries(user.pushSubscriptions || {}).slice(0, 8);
      for (const [id, device] of Object.entries(user.devices || {})) {
        for (const alert of alertsForDevice(device, now)) {
          const last = lastSent[uid]?.[id]?.[alert.type] || {};
          const key = `${uid}/${id}/${alert.type}`;
          if (mailReady && alert.email && device.emailAlerts && user.notificationEmail && now - (last.email || 0) >= alert.cooldown) {
            work.push({ key: `${key}/email`, deliver: async () => { await sendMail(env, user.notificationEmail, alert); return true; } });
          }
          if (pushReady && subscriptions.length && user.pushTopics?.[alert.topic] !== false && now - (last.push || 0) >= alert.cooldown) {
            work.push({ key: `${key}/push`, deliver: () => sendPush(env, uid, subscriptions, id, alert, now) });
          }
        }
      }
    }
    // Checkpoint each batch so a slow service does not repeat already sent notifications.
    for (let i = 0; i < work.length && Date.now() - now < 15500; i += 6) {
      const updates = {};
      const deliveries = await Promise.allSettled(work.slice(i, i + 6).map(async job => {
        if (await job.deliver()) updates[job.key] = Date.now();
      }));
      const failures = deliveries.filter(result => result.status === "rejected").length;
      if (failures) console.warn("Értesítési kézbesítési hibák", failures);
      if (Object.keys(updates).length) {
        const saved = await database(env, "alertState/sent", "PATCH", updates);
        if (!saved.ok) throw new Error(`Értesítési időbélyeg HTTP ${saved.status}`);
      }
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Növényfigyelő értesítési futás megszakadt", String(error.message).split("\n")[0].slice(0, 120));
    return new Response(null, { status: 502 });
  }
};
