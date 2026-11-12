const HOUR = 60 * 60 * 1000;
const CATEGORIES = {
  "🌵Szárazkedvelő": [10, 40],
  "🌾Mérsékelten száraz": [20, 45],
  "🌿Kiegyensúlyozott vízigényű": [30, 60],
  "🌱Nedvességkedvelő": [50, 80],
  "💧Vízigényes": [70, 100]
};

function fresh(stamp, now) {
  return Number.isFinite(stamp) && stamp > 0 && stamp <= now + 5 * 60 * 1000 && now - stamp <= 6 * HOUR;
}

export function alertsForDevice(device, now) {
  if (!device || device.hidden) return [];
  const alerts = [];
  const name = device.displayName || "A növényed";
  const reading = device.reading || {};
  if (fresh(reading.lastMeasurementAt, now)) {
    const [min, max] = CATEGORIES[device.plantType] || [30, 60];
    const score = Math.max(0, Math.min(100, Math.round((reading.sensorValue - min) * 100 / (max - min))));
    if (Number.isFinite(reading.sensorValue) && score < 35 && now - (device.plantTypeChangedAt || 0) >= 600000) {
      alerts.push({
        type: "soil_low", topic: "soil", email: true, cooldown: 6 * HOUR,
        title: "Ideje ellenőrizni a földet",
        body: `${name} talajnedvessége alacsony a beállított vízigényhez képest. Szenzormérés: ${Math.round(reading.sensorValue)}%.`
      });
    }

    if (Number.isFinite(reading.batteryPercent) && reading.batteryPercent <= 25) {
      const critical = reading.batteryPercent <= 10;
      alerts.push({
        type: critical ? "battery_critical" : "battery_low", topic: "battery", email: false,
        cooldown: (critical ? 3 : 12) * HOUR,
        title: critical ? "Kritikus akkumulátorszint" : "Alacsony akkumulátorszint",
        body: `${name} virágtartójának töltöttsége ${Math.round(reading.batteryPercent)}%.`
      });
    }
  }

  const air = device.airQuality;
  if (air?.bad === true && air.valid !== false && air.stable !== false && fresh(air.lastAirMeasurementAt, now)) {
    alerts.push({
      type: "air_bad", topic: "air", email: true, cooldown: 6 * HOUR,
      title: "Szellőztetés javasolt",
      body: `${name} környezetében rossz levegőminőséget jelzett az érzékelő.`
    });
  }
  return alerts;
}

export function validPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash &&
      (["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname) ||
        url.hostname.endsWith(".push.apple.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch {
    return false;
  }
}
