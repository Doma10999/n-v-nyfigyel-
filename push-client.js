import { sha256 } from "./activation.js";

const toggle = document.getElementById("pushToggle");
const status = document.getElementById("pushStatus");
const topics = document.getElementById("pushTopics");
const topicInputs = [...topics.querySelectorAll("input")];
let publicKey;
let registration;
let subscriptionPath;

function setControls(enabled) {
  toggle.textContent = enabled
    ? "Értesítések kikapcsolása ezen az eszközön"
    : "Értesítések bekapcsolása ezen az eszközön";
  topics.hidden = !enabled;
  status.textContent = enabled
    ? "A jelzések ezen az eszközön bekapcsolva."
    : "A locsolási, akku- és levegőminőségi jelzések az app bezárása után is megérkezhetnek.";
}

function keyBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

function matchesKey(subscription) {
  const current = new Uint8Array(subscription?.options?.applicationServerKey || []);
  const expected = keyBytes(publicKey);
  return current.length === expected.length && current.every((byte, index) => byte === expected[index]);
}

async function loadSettings() {
  toggle.hidden = true;
  topics.hidden = true;
  subscriptionPath = null;
  const user = window.__auth?.currentUser;
  if (!user) return;
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    status.textContent = "iPhone-on a főképernyőre telepített appból kapcsolhatod be a jelzéseket. Más eszközön nyisd meg támogatott böngészőben.";
    return;
  }
  if (Notification.permission === "denied") {
    status.textContent = "A böngészőben engedélyezd az értesítéseket ehhez az oldalhoz.";
    return;
  }

  status.textContent = "Telefonos jelzések betöltése…";
  try {
    const response = await fetch("/.netlify/functions/push-key", { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("push unavailable");
    publicKey = (await response.json()).key;
    if (typeof publicKey !== "string" || keyBytes(publicKey).length !== 65) throw new Error("invalid push key");
    registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register("/service-worker.js");
    const existing = await registration.pushManager.getSubscription();
    const base = `v2/users/${user.uid}`;
    const current = matchesKey(existing) ? `${base}/pushSubscriptions/${await sha256(existing.endpoint)}` : null;
    const [saved, preferences] = await Promise.all([
      current && window.__get(window.__ref(window.__db, current)),
      window.__get(window.__ref(window.__db, `${base}/pushTopics`))
    ]);
    if (window.__auth.currentUser?.uid !== user.uid) return;
    subscriptionPath = saved?.exists() ? current : null;
    for (const input of topicInputs) input.checked = preferences.val()?.[input.dataset.topic] !== false;
    setControls(Boolean(subscriptionPath));
    toggle.hidden = false;
  } catch {
    status.textContent = "A telefonos értesítések most nem érhetők el.";
  }
}

toggle.addEventListener("click", async () => {
  const user = window.__auth?.currentUser;
  if (!user) return;
  toggle.disabled = true;
  try {
    if (subscriptionPath) {
      await window.__detachPushForSession();
      setControls(false);
      return;
    }

    if (await Notification.requestPermission() !== "granted") {
      status.textContent = "A böngésző értesítési engedélyére szükség van.";
      return;
    }

    const worker = await navigator.serviceWorker.ready;
    let subscription = await worker.pushManager.getSubscription();
    if (subscription && !matchesKey(subscription)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ||= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
    const { endpoint, keys, expirationTime } = subscription.toJSON();
    const path = `v2/users/${user.uid}/pushSubscriptions/${await sha256(endpoint)}`;
    await window.__set(window.__ref(window.__db, path), { endpoint, keys, expiresAt: expirationTime || 0 });
    subscriptionPath = path;
    setControls(true);
  } catch {
    status.textContent = "A módosítás megszakadt. Ellenőrizd a kapcsolatot, majd próbáld újra.";
  } finally {
    toggle.disabled = false;
  }
});

for (const input of topicInputs) {
  input.addEventListener("change", async () => {
    const user = window.__auth?.currentUser;
    if (!user) return;
    const prefs = Object.fromEntries(topicInputs.map(box => [box.dataset.topic, box.checked]));
    for (const box of topicInputs) box.disabled = true;
    try {
      await window.__set(window.__ref(window.__db, `v2/users/${user.uid}/pushTopics`), prefs);
    } catch {
      input.checked = !input.checked;
      status.textContent = "A jelzéstípus mentése megszakadt.";
    } finally {
      for (const box of topicInputs) box.disabled = false;
    }
  });
}

window.__detachPushForSession = async () => {
  if (!("serviceWorker" in navigator)) return;
  const user = window.__auth?.currentUser;
  const worker = registration || await navigator.serviceWorker.getRegistration();
  const subscription = await worker?.pushManager?.getSubscription();
  if (!subscription || !user) return;
  const path = `v2/users/${user.uid}/pushSubscriptions/${await sha256(subscription.endpoint)}`;
  const deletion = window.__set(window.__ref(window.__db, path), null).catch(() => {});
  await subscription.unsubscribe();
  subscriptionPath = null;
  await Promise.race([deletion, new Promise(resolve => setTimeout(resolve, 1500))]);
};

window.addEventListener("notification-settings-open", loadSettings);
