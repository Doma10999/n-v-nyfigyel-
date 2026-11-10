import { get, ref, serverTimestamp, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const DEFAULT_PLANT_TYPE = "🌿Kiegyensúlyozott vízigényű";
const ONLINE_MODELS = new Set(["usb", "usb-led", "battery", "battery-touch", "battery-air"]);

export function devicePath(uid, id) {
  const base = `v2/users/${uid}/devices`;
  return id ? `${base}/${id}` : base;
}

export async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

function activationError(code) {
  return Object.assign(new Error(code), { code });
}

function isPermissionError(error) {
  return /permission.?denied/i.test(`${error.code} ${error.message}`);
}

export async function inspectActivation(db, input) {
  let code = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (code.length === 18 && code.startsWith("NF")) code = code.slice(2);
  code = code.replace(/O/g, "0").replace(/[IL]/g, "1");
  if (!/^[0-9A-HJKMNP-TV-Z]{16}$/.test(code)) throw activationError("activation/invalid");

  const digest = await sha256(code);
  let meta;
  try {
    meta = (await get(ref(db, `v2/invites/${digest}/meta`))).val();
  } catch (error) {
    if (isPermissionError(error)) throw activationError("activation/unavailable");
    throw error;
  }

  if (!/^nf_[a-f0-9]{24}$/.test(meta?.id ?? "") || !ONLINE_MODELS.has(meta.variant)) {
    throw activationError("activation/unavailable");
  }
  return { digest, id: meta.id, variant: meta.variant };
}

export async function claimActivation(db, uid, invite) {
  const existing = ref(db, devicePath(uid, invite.id));
  async function alreadyPaired() {
    const snapshot = await get(existing);
    if (!snapshot.exists()) return false;
    if (snapshot.val().hidden) await set(ref(db, `${devicePath(uid, invite.id)}/hidden`), false);
    return true;
  }

  if (await alreadyPaired()) return;
  const stamp = serverTimestamp();
  const device = {
    variant: invite.variant,
    displayName: "Növényem",
    plantType: DEFAULT_PLANT_TYPE,
    plantTypeChangedAt: stamp,
    attachedAt: stamp,
    hidden: false,
    emailAlerts: false
  };
  if (invite.variant === "usb-led") device.ledLevel = 0;

  try {
    await update(ref(db, "v2"), {
      [`invites/${invite.digest}/ownerUid`]: uid,
      [`registry/${invite.id}/ownerUid`]: uid,
      [`users/${uid}/devices/${invite.id}`]: device
    });
  } catch (error) {
    if (!isPermissionError(error)) throw error;
    if (!await alreadyPaired()) throw activationError("activation/unavailable");
  }
}

export function activationMessage(error) {
  if (error.code === "activation/invalid") return "Ellenőrizd a kódot. A kártyán NF-fel kezdődik, utána 16 karakter következik.";
  if (error.code === "activation/unavailable") return "Ez a kód nem érhető el. Ellenőrizd a karaktereket, vagy lépj be abba a fiókba, amelyhez már hozzáadtad a tartót.";
  return "A kód ellenőrzése vagy mentése megszakadt. Ellenőrizd a kapcsolatot, majd próbáld újra.";
}
