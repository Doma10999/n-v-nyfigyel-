import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfo3UqEb77ihYOqSJZvIFVr2VRGf6dJ4w",
  authDomain: "plant-monitor-3976f.firebaseapp.com",
  databaseURL: "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "plant-monitor-3976f",
  storageBucket: "plant-monitor-3976f.appspot.com",
  messagingSenderId: "705425147510",
  appId: "1:705425147510:web:71f15bde879f3672df8157",
  measurementId: "G-890H6FDBYE"
};

const STRIPE_LINKS = {
  monthly: "https://buy.stripe.com/IDE_IRD_LINKET_CSERELD",
  yearly: "https://buy.stripe.com/EVES_IRD_LINKET_CSERELD"
};

const STORAGE_KEY = "storedAccounts_v2";

initializeApp(firebaseConfig);
const auth = getAuth();
const db = getDatabase();

function getStoredAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("hu-HU");
}

function normalizePlan(v) {
  return String(v || "free").toLowerCase() === "plus" ? "plus" : "free";
}

async function loadPlan(uid) {
  const snap = await get(ref(db, `users/${uid}/subscription`));
  if (!snap.exists()) {
    return { plan: "free", expiresAt: 0, status: "inactive" };
  }
  const data = snap.val() || {};
  return {
    plan: normalizePlan(data.plan),
    expiresAt: Number(data.expiresAt || 0),
    status: String(data.status || "inactive")
  };
}

function createAccountCard(acc, sub) {
  const wrapper = document.createElement("div");
  wrapper.className = "billing-account-card";

  const isPlus = sub.plan === "plus";

  wrapper.innerHTML = `
    <div class="billing-account-head">
      <div>
        <div class="billing-account-email">${acc.email || "Fiók"}</div>
        <div class="billing-account-uid">UID: <code>${acc.uid}</code></div>
      </div>
      <span class="billing-plan-pill ${isPlus ? "plus" : "free"}">${isPlus ? "PLUS" : "FREE"}</span>
    </div>

    <div class="billing-meta">
      <div><b>Aktuális csomag:</b> ${isPlus ? "Plus" : "Free"}</div>
      <div><b>Lejárat:</b> ${formatDate(sub.expiresAt)}</div>
    </div>

    <div class="billing-copy-row">
      <button class="copy-uid-btn" type="button"><i class="fa-solid fa-copy"></i> UID másolása</button>
      <span class="copy-hint">Ezt add meg a Stripe oldalon a <b>uid</b> mezőbe.</span>
    </div>

    <div class="billing-actions">
      <a class="pay-link-btn monthly" href="${STRIPE_LINKS.monthly}" target="_blank" rel="noopener noreferrer">
        <i class="fa-solid fa-calendar-days"></i> Plus havi – 390 Ft
      </a>
      <a class="pay-link-btn yearly" href="${STRIPE_LINKS.yearly}" target="_blank" rel="noopener noreferrer">
        <i class="fa-solid fa-crown"></i> Plus éves – 3000 Ft
      </a>
    </div>
  `;

  const copyBtn = wrapper.querySelector(".copy-uid-btn");
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(acc.uid);
      copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> UID kimásolva';
      setTimeout(() => {
        copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> UID másolása';
      }, 2000);
    } catch {
      alert("Nem sikerült a másolás. Másold ki kézzel a UID-t.");
    }
  });

  return wrapper;
}

async function init() {
  const statusEl = document.getElementById("billingStatus");
  const accountsEl = document.getElementById("billingAccounts");

  const stored = getStoredAccounts();
  if (stored.length === 0) {
    statusEl.textContent = "Nincs mentett fiók. Előbb jelentkezz be az alkalmazásban.";
    return;
  }

  statusEl.textContent = "Fiókok betöltése...";

  accountsEl.innerHTML = "";
  for (const acc of stored) {
    const sub = await loadPlan(acc.uid);
    accountsEl.appendChild(createAccountCard(acc, sub));
  }

  statusEl.textContent = auth.currentUser
    ? "Fiókok betöltve. A Stripe oldalon a megfelelő UID-t add meg."
    : "Fiókok betöltve. Ha több fiókod van, figyelj rá, hogy a megfelelő UID-t add meg a Stripe oldalon.";
}

window.addEventListener("load", init);
