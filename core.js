// Pure domain logic. Database paths and category keys remain compatible with the ESP32 firmware.
export const CATEGORIES = [
  { key: '🌵Szárazkedvelő', name: 'Szárazkedvelő', icon: '🌵', min: 10, max: 40, description: 'Kaktuszok, pozsgások' },
  { key: '🌾Mérsékelten száraz', name: 'Mérsékelten száraz', icon: '🌾', min: 20, max: 45, description: 'Ritkább öntözést kedvelő növények' },
  { key: '🌿Kiegyensúlyozott vízigényű', name: 'Kiegyensúlyozott', icon: '🌿', min: 30, max: 60, description: 'Átlagos vízigényű szobanövények' },
  { key: '🌱Nedvességkedvelő', name: 'Nedvességkedvelő', icon: '🌱', min: 50, max: 80, description: 'Egyenletesen nedves talaj' },
  { key: '💧Vízigényes', name: 'Vízigényes', icon: '💧', min: 70, max: 100, description: 'Magasabb talajnedvesség' }
];
export const DEFAULT_CATEGORY = CATEGORIES[2];
export const STALE_AFTER = 12 * 60 * 60 * 1000;
export const HISTORY_LIMIT = 120;
export const COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
export function numberOrNull(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function timestamp(value) {
  let n = numberOrNull(value);
  if (n === null && typeof value === 'string') n = Date.parse(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e11 ? n * 1000 : n;
}
export function measurementTime(data = {}) {
  // Heartbeats (lastSeen) and configuration saves (updatedAt) are NOT measurements.
  // Explicit measurement timestamps take precedence over legacy fields.
  for (const key of ['lastMeasurementAt', 'measuredAt', 'sensorUpdatedAt', 'lastSensorUpdate', 'timestamp', 'lastUpdated']) {
    const t = timestamp(data[key]);
    if (t) return t;
  }
  return 0;
}
export function categoryFor(value) {
  return CATEGORIES.find(c => c.key === value) || DEFAULT_CATEGORY;
}
export function displayPercent(raw, category) {
  const value = numberOrNull(raw);
  if (value === null || value < 0 || value > 100) return null;
  const c = categoryFor(category);
  return Math.round(clamp((value - c.min) / (c.max - c.min) * 100));
}
export function activePlus(subscription = {}, now = Date.now()) {
  if (String(subscription.plan).toLowerCase() !== 'plus') return false;
  const status = String(subscription.status || '').toLowerCase().trim();
  const expiry = timestamp(subscription.expiresAt);
  if (expiry && expiry <= now) return false;
  if (['canceled', 'cancelled'].includes(status)) return subscription.cancelAtPeriodEnd === true && expiry > now;
  return ['active', 'trialing', 'past_due'].includes(status);
}
export function normalHistory(history, limit = HISTORY_LIMIT) {
  if (!history || typeof history !== 'object') return [];
  const entries = Array.isArray(history) ? history.map(p => [p?.t, p?.v]) : Object.entries(history).map(([key, v]) => typeof v === 'object' && v !== null ? [v.t || key, v.v ?? v.value] : [key, v]);
  const byTime = new Map();
  for (const [time, value] of entries) {
    const t = timestamp(time), v = numberOrNull(value);
    if (t > 0 && v !== null && v >= 0 && v <= 100) byTime.set(t, { t, v });
  }
  // Repeated values at different measurement times are valid data, not duplicates.
  return [...byTime.values()].sort((a,b) => a.t - b.t).slice(-limit);
}
export function airState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const aqiRaw=numberOrNull(raw.aqi), tvocRaw=numberOrNull(raw.tvoc), eco2Raw=numberOrNull(raw.eco2);
  const aqi=aqiRaw!==null&&aqiRaw>=1&&aqiRaw<=5?aqiRaw:null, tvoc=tvocRaw!==null&&tvocRaw>=0?tvocRaw:null, eco2=eco2Raw!==null&&eco2Raw>=0?eco2Raw:null;
  if (aqi === null && tvoc === null && eco2 === null) return null;
  const status = String(raw.status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const bad = raw.bad === true || (aqi !== null && aqi >= 4) || status.includes('rossz');
  const label = bad ? (aqi === 5 || status.includes('nagyon') ? 'Nagyon rossz' : 'Szellőztess') : aqi === 3 || status.includes('kozepes') ? 'Közepes' : aqi!==null||status.includes('jo')||status.includes('kivalo') ? 'Jó' : 'Nincs minősítés';
  return { aqi, tvoc, eco2, bad, label, time: timestamp(raw.updatedAt || raw.measuredAt) };
}
export function deviceModel(uid, email, id, data = {}, subscription = {}, now = Date.now()) {
  const raw = numberOrNull(data.sensorValue);
  const sensor = raw !== null && raw >= 0 && raw <= 100 ? raw : null;
  const category = categoryFor(data.plantType);
  const percent = displayPercent(sensor, category.key), time = measurementTime(data);
  const stale = time > 0 && now - time > STALE_AFTER;
  const future = time > now + 5 * 60 * 1000;
  const battery = numberOrNull(data.batteryPercent);
  const air = airState(data.airQuality);
  const needsWater = percent !== null && percent <= 35;
  const wet = sensor !== null && sensor > category.max;
  let tone = 'good', label = 'Jól érzi magát', hint = 'A nedvesség a választott tartományban van.';
  if (sensor === null) { tone = 'unknown'; label = 'Mérésre vár'; hint = 'Az eszköz még nem küldött érvényes talajnedvességet.'; }
  else if (future) { tone = 'unknown'; label = 'Ellenőrizd az eszköz óráját'; hint = 'A mérés időpontja a jövőben van.'; }
  else if (stale) { tone = 'stale'; label = 'Régi mérés'; hint = 'Több mint 12 órája nincs új mérés. Ellenőrizd az eszközt.'; }
  else if (!time) { tone = 'unknown'; label = 'Ismeretlen mérési idő'; hint = 'A nedvesség látható, de a mérés frissessége nem ellenőrizhető.'; }
  else if (needsWater) { tone = 'dry'; label = 'Nézd meg a földjét'; hint = 'Alacsony a kategóriához igazított érték. Ellenőrizd, szükséges-e öntözni.'; }
  else if (wet) { tone = 'wet'; label = 'Most ne öntözd'; hint = 'A talaj nedvesebb a választott kategória felső határánál.'; }
  const led = numberOrNull(data.ledLevel);
  return { key: `${uid}|${id}`, uid, email, id, name: String(data.displayName || data.plantName || id).slice(0,80), category, percent, sensor, time, lastSeen: timestamp(data.lastSeen), stale, future, needsWater, wet, tone, label, hint, air, battery: battery === null || battery<0 || battery>100 ? null : Math.round(battery), led: led === null ? null : clamp(led), plus: activePlus(subscription, now), history: normalHistory(data.history), data };
}
export function historyForDevice(model) {
  const points = model.plus ? [...model.history] : [];
  if (model.time > 0 && !model.future && model.percent !== null && !points.some(p => p.t === model.time)) points.push({ t: model.time, v: model.percent });
  return normalHistory(points);
}
export function relativeTime(t, now = Date.now()) {
  if (!t) return 'Nincs mérési idő';
  const minutes = Math.floor((now - t) / 60000);
  if (minutes < -5) return 'Jövőbeli időpont';
  if (minutes < 1) return 'Épp most';
  if (minutes < 60) return `${minutes} perce`;
  if (minutes < 1440) return `${Math.floor(minutes/60)} órája`;
  return `${Math.floor(minutes/1440)} napja`;
}
export function formatTime(t) {
  return t ? new Intl.DateTimeFormat('hu-HU', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }).format(t) : 'Nincs mérési idő';
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}
export function validPathKey(value) { return typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[.#$\[\]/\u0000-\u001f\u007f]/.test(value); }
export function filterDevices(models, filter, search = '') {
  const term = search.toLocaleLowerCase('hu').trim();
  return models.filter(m => (!term || `${m.name} ${m.id} ${m.category.name}`.toLocaleLowerCase('hu').includes(term)) && (filter === 'all' || (filter === 'attention' && (m.tone !== 'good' || m.air?.bad || (m.battery !== null && m.battery <= 25))) || (filter === 'good' && m.tone === 'good' && !m.air?.bad && !(m.battery !== null && m.battery <= 25))));
}
