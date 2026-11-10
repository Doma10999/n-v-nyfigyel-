import { reload, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { devicePath } from "./activation.js";

const button = document.getElementById("notifBellBtn");
const modal = document.getElementById("notifModal");
const list = document.getElementById("notifDeviceList");
const email = document.getElementById("notificationEmail");
const verify = document.getElementById("verifyAlertEmail");
const save = document.getElementById("notifSave");
const status = document.getElementById("notifStatus");
let settingsUid;

function showStatus(message = "", error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

function close() {
  modal.style.display = "none";
  settingsUid = null;
}

async function refreshVerification(user) {
  if (!user.emailVerified) {
    await reload(user);
    if (user.emailVerified) await user.getIdToken(true);
  }
  verify.hidden = user.emailVerified;
  email.textContent = user.emailVerified
    ? `E-mail-cím: ${user.email}`
    : `Az e-mailes jelzésekhez erősítsd meg ezt a címet: ${user.email}`;
}

function renderDevices(devices) {
  list.replaceChildren();
  for (const [id, device] of Object.entries(devices)) {
    if (device.hidden) continue;
    const label = document.createElement("label");
    label.className = "notif-device";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.device = id;
    checkbox.checked = device.emailAlerts === true;
    label.append(checkbox, document.createTextNode(device.displayName || "Növényem"));
    list.append(label);
  }
  if (!list.children.length) list.textContent = "A párosított virágtartóid itt jelennek meg.";
}

button.addEventListener("click", async () => {
  const user = window.__auth?.currentUser;
  if (!user) return;
  modal.style.display = "flex";
  document.body.classList.remove("menu-open");
  settingsUid = user.uid;
  save.disabled = true;
  verify.hidden = true;
  list.replaceChildren();
  email.textContent = "";
  showStatus("Beállítások betöltése…");
  window.dispatchEvent(new CustomEvent("notification-settings-open"));

  try {
    const snapshot = await window.__get(window.__ref(window.__db, devicePath(user.uid)));
    if (settingsUid !== user.uid) return;
    renderDevices(snapshot.val() || {});
    await refreshVerification(user);
    showStatus();
    save.disabled = false;
  } catch {
    showStatus("Az e-mailes beállítások most nem érhetők el.", true);
  }
});

verify.addEventListener("click", async () => {
  const user = window.__auth?.currentUser;
  if (!user || user.uid !== settingsUid) return;
  verify.disabled = true;
  try {
    await refreshVerification(user);
    if (user.emailVerified) {
      showStatus("Az e-mail-címed meg van erősítve.");
    } else {
      await sendEmailVerification(user);
      showStatus("Megküldtük a megerősítő linket. Kattints rá, majd nyisd meg újra ezt a panelt.");
    }
  } catch {
    showStatus("A megerősítő e-mail küldése most nem sikerült.", true);
  } finally {
    verify.disabled = false;
  }
});

save.addEventListener("click", async () => {
  const user = window.__auth?.currentUser;
  if (!user || user.uid !== settingsUid) return;
  const choices = [...list.querySelectorAll("input[data-device]")];
  save.disabled = true;
  try {
    if (choices.some(choice => choice.checked)) {
      await refreshVerification(user);
      if (!user.emailVerified) {
        showStatus("A jelzések bekapcsolásához előbb erősítsd meg az e-mail-címedet.", true);
        return;
      }
    }
    const patch = {};
    if (user.emailVerified) patch.notificationEmail = user.email;
    for (const choice of choices) {
      patch[`devices/${choice.dataset.device}/emailAlerts`] = choice.checked;
    }
    if (Object.keys(patch).length) await window.__update(window.__ref(window.__db, `v2/users/${user.uid}`), patch);
    window.showAppToast("Az értesítési beállításokat elmentettük.");
    close();
  } catch {
    showStatus("A mentés megszakadt. Ellenőrizd a kapcsolatot, majd próbáld újra.", true);
  } finally {
    save.disabled = false;
  }
});

document.getElementById("notifModalClose").onclick = close;
document.getElementById("notifCancel").onclick = close;
modal.addEventListener("click", event => { if (event.target === modal) close(); });
