const { test } = require("node:test");
const assert = require("node:assert/strict");
const policy = import("../netlify/alert-policy.mjs");
const now = 1_800_000_000_000;
const hour = 3600000;

test("dry, battery and air alerts use fresh measurements and separate cooldowns", async () => {
  const { alertsForDevice } = await policy;
  const device = {
    displayName: "Monstera",
    plantType: "🌿Kiegyensúlyozott vízigényű",
    plantTypeChangedAt: now - hour,
    reading: { sensorValue: 36, lastMeasurementAt: now - hour, batteryPercent: 9 },
    airQuality: { bad: true, stable: true, valid: true, lastAirMeasurementAt: now - hour }
  };
  const alerts = alertsForDevice(device, now);
  assert.deepEqual(alerts.map(alert => [alert.type, alert.email, alert.cooldown / hour]), [
    ["soil_low", true, 6], ["battery_critical", false, 3], ["air_bad", true, 6]
  ]);
  assert.match(alerts[0].body, /36%/);
  assert.deepEqual(alertsForDevice({ ...device, hidden: true }, now), []);
  assert.deepEqual(alertsForDevice({ ...device, plantTypeChangedAt: now, airQuality: { bad: true } }, now).map(x => x.type), ["battery_critical"]);
  assert.deepEqual(alertsForDevice(device, now + 8 * hour), []);
  assert.deepEqual(alertsForDevice({ reading: { sensorValue: 0 } }, now), []);
});

test("only supported browser delivery endpoints are accepted", async () => {
  const { validPushEndpoint } = await policy;
  assert.equal(validPushEndpoint("https://fcm.googleapis.com/fcm/send/demo"), true);
  assert.equal(validPushEndpoint("https://web.push.apple.com/demo"), true);
  assert.equal(validPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/demo"), true);
  assert.equal(validPushEndpoint("https://fcm.googleapis.com.invalid/demo"), false);
  assert.equal(validPushEndpoint("http://fcm.googleapis.com/fcm/send/demo"), false);
  assert.equal(validPushEndpoint("https://fcm.googleapis.com:444/fcm/send/demo"), false);
  assert.equal(validPushEndpoint("https://user@fcm.googleapis.com/fcm/send/demo"), false);
});
