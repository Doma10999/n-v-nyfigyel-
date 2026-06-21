import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
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

// Stripe Payment Linkek
const STRIPE_LINKS = {
  monthly: "https://buy.stripe.com/eVq14f2PP3R1bQq7Be0gw01",
  yearly: "https://buy.stripe.com/cNibITfCBafp7AacVy0gw00"
};

// Stripe Customer Portal – előfizetés kezelése / lemondása / bankkártya / számlák
const STRIPE_CUSTOMER_PORTAL_URL = "https://billing.stripe.com/p/login/cNibITfCBafp7AacVy0gw00";

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(ts, fallbackText = "—") {
  if (!ts) return fallbackText;
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return fallbackText;
  return d.toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function normalizePlan(v) {
  return String(v || "free").toLowerCase() === "plus" ? "plus" : "free";
}

function normalizeStatus(v) {
  return String(v || "inactive").toLowerCase();
}

function statusLabel(status) {
  const map = {
    active: "aktív",
    trialing: "próbaidőszak",
    past_due: "fizetésre vár",
    unpaid: "sikertelen fizetés",
    canceled: "lemondva",
    cancelled: "lemondva",
    expired: "lejárt",
    incomplete: "fizetés nem fejeződött be",
    incomplete_expired: "sikertelen fizetés",
    inactive: "nincs aktív előfizetés",
    free: "ingyenes csomag"
  };
  return map[status] || status;
}

function buildStripeUrl(baseUrl, uid, email = "") {
  const url = new URL(baseUrl);
  if (uid) url.searchParams.set("client_reference_id", uid);
  if (email) url.searchParams.set("prefilled_email", email);
  return url.toString();
}

async function loadPlan(uid) {
  const snap = await get(ref(db, `users/${uid}/subscription`));
  if (!snap.exists()) {
    return {
      plan: "free",
      expiresAt: 0,
      expiresAtText: "",
      status: "inactive",
      cancelAtPeriodEnd: false,
      stripeCustomerId: "",
      stripeSubscriptionId: ""
    };
  }

  const data = snap.val() || {};
  return {
    plan: normalizePlan(data.plan),
    expiresAt: Number(data.expiresAt || 0),
    expiresAtText: String(data.expiresAtText || ""),
    status: normalizeStatus(data.status),
    cancelAtPeriodEnd: !!data.cancelAtPeriodEnd,
    stripeCustomerId: String(data.stripeCustomerId || ""),
    stripeSubscriptionId: String(data.stripeSubscriptionId || "")
  };
}

function getRenewalText(sub) {
  const date = formatDate(sub.expiresAt, sub.expiresAtText || "—");

  if (sub.plan !== "plus") {
    return "Jelenleg Free csomagban vagy. Plusra váltás után elérhető lesz az email értesítés és a grafikon.";
  }

  if (sub.cancelAtPeriodEnd) {
    return `Az előfizetés le van mondva, de a Plus hozzáférés eddig megmarad: ${date}.`;
  }

  return `Az előfizetés aktív. A következő számlázási forduló: ${date}.`;
}

function createAccountCard(acc, sub, isCurrentUser = false) {
  const wrapper = document.createElement("div");
  const isPlus = sub.plan === "plus";
  wrapper.className = `billing-account-card billing-account-card-pro ${isPlus ? "is-plus" : "is-free"}`;

  const safeEmail = escapeHtml(acc.email || "Fiók");
  const safeUid = escapeHtml(acc.uid || "");
  const monthlyUrl = buildStripeUrl(STRIPE_LINKS.monthly, acc.uid, acc.email || "");
  const yearlyUrl = buildStripeUrl(STRIPE_LINKS.yearly, acc.uid, acc.email || "");
  const renewalText = getRenewalText(sub);
  const showManageButton = isPlus || !!sub.stripeCustomerId || !!sub.stripeSubscriptionId;
  const currentDate = formatDate(sub.expiresAt, sub.expiresAtText || "—");

  wrapper.innerHTML = `
    <div class="billing-account-head billing-account-head-pro">
      <div>
        <div class="billing-account-label">Fiók</div>
        <div class="billing-account-email">${safeEmail}${isCurrentUser ? ' <span class="billing-current-tag">aktuális</span>' : ''}</div>
        <div class="billing-account-subline">Ezhez a fiókhoz tartozik a csomag és az előfizetés.</div>
      </div>
      <span class="billing-plan-pill ${isPlus ? "plus" : "free"}">${isPlus ? "PLUS" : "FREE"}</span>
    </div>

    <div class="billing-summary-grid billing-summary-grid-pro">
      <div class="billing-summary-item">
        <span>Aktuális csomag</span>
        <b>${isPlus ? "Plus" : "Free"}</b>
      </div>
      <div class="billing-summary-item">
        <span>Állapot</span>
        <b>${escapeHtml(statusLabel(sub.status))}</b>
      </div>
      <div class="billing-summary-item wide">
        <span>${sub.cancelAtPeriodEnd ? "Hozzáférés vége" : "Következő forduló"}</span>
        <b>${isPlus ? currentDate : "—"}</b>
      </div>
    </div>

    <div class="billing-renewal-message ${sub.cancelAtPeriodEnd ? "warning" : ""}">
      <i class="fa-solid ${sub.cancelAtPeriodEnd ? "fa-circle-exclamation" : (isPlus ? "fa-rotate" : "fa-circle-info")}"></i>
      <span>${escapeHtml(renewalText)}</span>
    </div>

    ${showManageButton ? `
      <div class="billing-cancel-panel">
        <div>
          <b>Előfizetés lemondása vagy módosítása</b>
          <p>A Stripe ügyfélportálon tudod lemondani az előfizetést, bankkártyát cserélni és számlákat megnézni.</p>
        </div>
        <a class="cancel-subscription-btn" href="${STRIPE_CUSTOMER_PORTAL_URL}" target="_blank" rel="noopener noreferrer">
          <i class="fa-solid fa-ban"></i>
          Előfizetés kezelése / lemondás
        </a>
      </div>
    ` : ""}

    <details class="billing-uid-details">
      <summary>Fiókazonosító megjelenítése fizetéshez</summary>
      <div class="billing-account-uid">UID: <code>${safeUid}</code></div>
      <div class="billing-copy-row">
        <button class="copy-uid-btn" type="button"><i class="fa-solid fa-copy"></i> UID másolása</button>
        <span class="copy-hint">Fizetésnél erre az azonosítóra kerül a Plus csomag. Ne módosítsd, ha a Stripe oldalon automatikusan megjelenik.</span>
      </div>
    </details>

    <div class="billing-actions billing-actions-pro">
      <a class="pay-link-btn monthly" href="${monthlyUrl}" target="_blank" rel="noopener noreferrer">
        <span class="btn-icon"><i class="fa-solid fa-calendar-days"></i></span>
        <span><b>Plus havi</b><small>490 Ft / hó</small></span>
      </a>
      <a class="pay-link-btn yearly" href="${yearlyUrl}" target="_blank" rel="noopener noreferrer">
        <span class="btn-icon"><i class="fa-solid fa-crown"></i></span>
        <span><b>Plus éves</b><small>3999 Ft / év</small></span>
      </a>
      ${showManageButton ? `
        <a class="manage-subscription-btn" href="${STRIPE_CUSTOMER_PORTAL_URL}" target="_blank" rel="noopener noreferrer">
          <span class="btn-icon"><i class="fa-solid fa-user-gear"></i></span>
          <span><b>Előfizetés kezelése</b><small>Lemondás, bankkártya, számlák</small></span>
        </a>
      ` : ""}
    </div>

    <div class="billing-help-box">
      <b>Röviden:</b> a Plus automatikusan megújul. Ha lemondod, a már kifizetett időszak végéig még megmarad a Plus hozzáférésed, utána a rendszer Free csomagra áll vissza.
    </div>
  `;

  const copyBtn = wrapper.querySelector(".copy-uid-btn");
  if (copyBtn) {
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
  }

  return wrapper;
}

async function init(user = null) {
  const statusEl = document.getElementById("billingStatus");
  const accountsEl = document.getElementById("billingAccounts");
  const stored = getStoredAccounts();

  accountsEl.innerHTML = "";

  if (stored.length === 0) {
    statusEl.innerHTML = `
      <div class="billing-empty-state">
        <i class="fa-solid fa-user-lock"></i>
        <b>Nincs betöltött fiók.</b>
        <span>Előbb jelentkezz be az alkalmazás főoldalán, utána itt megjelenik a csomagod és a fizetési lehetőség.</span>
      </div>
    `;
    return;
  }

  statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fiókadatok betöltése...';

  for (const acc of stored) {
    try {
      const sub = await loadPlan(acc.uid);
      accountsEl.appendChild(createAccountCard(acc, sub, !!user && user.uid === acc.uid));
    } catch (error) {
      const errorCard = document.createElement("div");
      errorCard.className = "billing-account-card error";
      errorCard.innerHTML = `
        <b>Nem sikerült betölteni ezt a fiókot.</b><br>
        <span>${escapeHtml(acc.email || acc.uid || "Ismeretlen fiók")}</span>
      `;
      accountsEl.appendChild(errorCard);
      console.error(error);
    }
  }

  statusEl.innerHTML = user
    ? '<i class="fa-solid fa-circle-check"></i> A fiókod betöltve. Itt tudsz előfizetni vagy kezelni a már meglévő előfizetésedet.'
    : '<i class="fa-solid fa-circle-info"></i> Itt láthatod a mentett fiókok csomagját. Fizetéshez válaszd ki a megfelelő Plus csomagot.';
}

onAuthStateChanged(auth, (user) => {
  init(user);
});
