// Run with the Auth and RTDB emulators. These tests only use loopback.
const assert = require("node:assert/strict");
const { createHash, randomBytes } = require("node:crypto");

const project = "demo-novenyfigyelo";
const authRoot = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const databaseRoot = "http://127.0.0.1:9000";
const now = Date.now();
const password = "Local-only-password-42";
const stamp = { ".sv": "timestamp" };
const category = "🌿Kiegyensúlyozott vízigényű";

async function call(url, method, body, headers = {}) {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000)
  });
  return { status: response.status, value: await response.json() };
}

async function database(path, method = "GET", body, token) {
  const url = new URL(`/${path}.json`, databaseRoot);
  url.searchParams.set("ns", project + "-default-rtdb");
  if (token && token !== "owner") url.searchParams.set("auth", token);
  return call(url, method, body, token === "owner" ? { Authorization: "Bearer owner" } : {});
}

async function authAction(action, body) {
  const { status, value } = await call(`${authRoot}/accounts:${action}?key=demo-api-key`, "POST", body);
  assert.equal(status, 200, JSON.stringify(value));
  return value;
}

async function createUser(prefix, claims) {
  const email = `${prefix}-${randomBytes(6).toString("hex")}@example.test`;
  const credential = await authAction("signUp", { email, password, returnSecureToken: true });
  if (!claims) return credential;
  const updated = await call(`${authRoot}/projects/${project}/accounts:update`, "POST", {
    localId: credential.localId,
    customAttributes: JSON.stringify(claims)
  }, { Authorization: "Bearer owner" });
  assert.equal(updated.status, 200, JSON.stringify(updated.value));
  return authAction("signInWithPassword", { email, password, returnSecureToken: true });
}

const digest = value => createHash("sha256").update(value).digest("hex");
const devicePath = (uid, id) => `v2/users/${uid}/devices/${id}`;

async function seed(variant, deviceUid, code) {
  const id = "nf_" + randomBytes(12).toString("hex");
  const hash = digest(code);
  const { status } = await database("v2", "PATCH", {
    [`registry/${id}`]: { variant, deviceUid, inviteHash: hash },
    [`invites/${hash}/meta`]: { id, variant }
  }, "owner");
  assert.equal(status, 200);
  return { id, hash, variant };
}

function claim(user, invite, extras = {}) {
  const uid = user.localId;
  const node = {
    variant: invite.variant,
    displayName: "Első növény",
    plantType: category,
    plantTypeChangedAt: stamp,
    attachedAt: stamp,
    hidden: false,
    emailAlerts: false,
    ...(invite.variant === "usb-led" ? { ledLevel: 0 } : {}),
    ...extras
  };
  return database("v2", "PATCH", {
    [`invites/${invite.hash}/ownerUid`]: uid,
    [`registry/${invite.id}/ownerUid`]: uid,
    [`users/${uid}/devices/${invite.id}`]: node
  }, user.idToken);
}

const denied = result => assert.ok([401, 403].includes(result.status), JSON.stringify(result));
const allowed = result => assert.equal(result.status, 200, JSON.stringify(result));

async function main() {
  const [alice, bob, hardware, secondHardware, alerts] = await Promise.all([
    createUser("alice"), createUser("bob"),
    createUser("hardware", { novenyDevice: true }),
    createUser("hardware2", { novenyDevice: true }),
    createUser("alerts", { novenyAlerts: true })
  ]);
  const first = await seed("usb-led", hardware.localId, "FTRNNS5G9WDQY01B");
  const second = await seed("battery-air", secondHardware.localId, "PQPRB8HC51QHP2CR");
  const firstInvite = `v2/invites/${first.hash}`;

  denied(await database("v2/invites"));
  allowed(await database(`${firstInvite}/meta`));
  denied(await database(`${firstInvite}/ownerUid`, "PUT", alice.localId, alice.idToken));
  denied(await claim(hardware, first));
  denied(await claim(alice, first, { reading: { sensorValue: 0 } }));
  const tries = await Promise.all([claim(alice, first), claim(bob, first)]);
  assert.equal(tries.filter(result => result.status === 200).length, 1, JSON.stringify(tries));
  const [owner, other] = tries[0].status === 200 ? [alice, bob] : [bob, alice];
  const device = devicePath(owner.localId, first.id);
  allowed(await database(`${firstInvite}/meta`, "GET", undefined, owner.idToken));
  denied(await database(`${firstInvite}/meta`, "GET", undefined, other.idToken));
  allowed(await claim(owner, second));
  const owned = await database(`v2/users/${owner.localId}/devices`, "GET", undefined, owner.idToken);
  assert.equal(Object.keys(owned.value).length, 2);

  const ownerLookup = await database(`v2/registry/${first.id}/ownerUid`, "GET", undefined, hardware.idToken);
  assert.equal(ownerLookup.value, owner.localId);
  denied(await database(`v2/registry/${first.id}/ownerUid`, "GET", undefined, secondHardware.idToken));
  denied(await database(device, "GET", undefined, other.idToken));
  denied(await database(device, "GET", undefined, hardware.idToken));
  denied(await database(`${device}/displayName`, "PUT", "másik név", hardware.idToken));
  denied(await database(`${device}/displayName`, "PUT", "másik név", other.idToken));
  denied(await database(`${device}/ledLevel`, "PUT", 60, hardware.idToken));
  allowed(await database(`${device}/ledLevel`, "PUT", 60, owner.idToken));
  const led = await database(`${device}/ledLevel`, "GET", undefined, hardware.idToken);
  assert.equal(led.value, 60);
  allowed(await database(`${device}/hidden`, "PUT", true, owner.idToken));
  allowed(await database(`${device}/hidden`, "PUT", false, owner.idToken));
  denied(await database(`${device}/emailAlerts`, "PUT", true, owner.idToken));

  const reading = { sensorValue: 37, lastMeasurementAt: now, lastSeen: stamp, firmwareVersion: "test-v2", measurementSequence: 1 };
  denied(await database(`${device}/reading`, "PUT", reading, owner.idToken));
  denied(await database(`${device}/reading`, "PUT", reading, secondHardware.idToken));
  allowed(await database(device, "PATCH", { reading, "history/s1": { t: now, v: 37 } }, hardware.idToken));
  for (let i = 2; i < 13; i++) {
    const t = now + i;
    allowed(await database(device, "PATCH", {
      reading: { ...reading, lastMeasurementAt: t, measurementSequence: i },
      [`history/s${i % 10}`]: { t, v: 37 }
    }, hardware.idToken));
  }
  const history = await database(`${device}/history`, "GET", undefined, owner.idToken);
  assert.equal(Object.keys(history.value).length, 10);
  assert.equal(Math.max(...Object.values(history.value).map(point => point.t)), now + 12);
  denied(await database(`${device}/history/s10`, "PUT", { t: now, v: 37 }, hardware.idToken));
  denied(await database(`${device}/reading/batteryPercent`, "PUT", 80, hardware.idToken));

  const airDevice = devicePath(owner.localId, second.id);
  allowed(await database(airDevice, "PATCH", {
    reading: { ...reading, batteryPercent: 60 },
    airQuality: { aqi: 3, tvoc: 100, eco2: 800, status: "kozepes", bad: false, lastAirMeasurementAt: now }
  }, secondHardware.idToken));

  denied(await database("v2/users", "GET", undefined, owner.idToken));
  allowed(await database("v2/users", "GET", undefined, alerts.idToken));
  denied(await database(`${device}/displayName`, "PUT", "másik név", alerts.idToken));
  allowed(await database("v2/alertState/lease", "PUT", now, alerts.idToken));
  denied(await database("v2/alertState/lease", "PUT", now, owner.idToken));

  await authAction("sendOobCode", { requestType: "PASSWORD_RESET", email: owner.email });
  const codes = await call(`http://127.0.0.1:9099/emulator/v1/projects/${project}/oobCodes`, "GET");
  const reset = codes.value.oobCodes.find(item => item.email === owner.email && item.requestType === "PASSWORD_RESET");
  assert.ok(reset?.oobCode);
  const newPassword = "Local-only-new-password-51";
  await authAction("resetPassword", { oobCode: reset.oobCode, newPassword });
  const signedBackIn = await authAction("signInWithPassword", {
    email: owner.email, password: newPassword, returnSecureToken: true
  });
  assert.equal(signedBackIn.localId, owner.localId);
  const retained = await database(`v2/users/${owner.localId}/devices`, "GET", undefined, signedBackIn.idToken);
  assert.equal(Object.keys(retained.value).length, 2);
  console.log("Firebase: paired atomically, isolated buyer and device roles, capped history, reset password.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
