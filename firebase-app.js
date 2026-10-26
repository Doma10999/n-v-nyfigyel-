import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
    import { getDatabase, ref, onValue, set, get, update, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

    const app = initializeApp(firebaseConfig);
    const db = getDatabase(app);
    const auth = getAuth();
    window.__auth = auth;

    // expose Firebase helpers for non-module scripts
    window.__db = db;
    window.__ref = ref;
    window.__get = get;
    window.__set = set;
    window.__update = update;
    window.__onValue = onValue;


    // ====== UI elemek ======
    const loginForm = document.getElementById("loginForm");
    const emailInput = document.getElementById("email");
    const passInput  = document.getElementById("password");
    const statusDiv  = document.getElementById("status");
    const logoutBtn  = document.getElementById("logout");
    const plantDataCard = document.getElementById("plantData");

    const addAccountBtn = document.getElementById("addAccountBtn");
    const modal = document.getElementById("modal");
    const modalCloseBtn = document.getElementById("modalClose");
    const addNewAccountForm = document.getElementById("addNewAccountForm");
    const newAccountEmail = document.getElementById("newAccountEmail");
    const newAccountPass = document.getElementById("newAccountPass");
    const addAccountStatus = document.getElementById("addAccountStatus");
    const accountsContainer = document.getElementById("accountsContainer");

    const chartsBtn = document.getElementById("chartsBtn");
    const paymentBtn = document.getElementById("paymentBtn");
    const infoBtn = document.getElementById("infoBtn");
    const menuBtn = document.getElementById("menuBtn");
    const chartsModal = document.getElementById("chartsModal");
    const chartsModalClose = document.getElementById("chartsModalClose");
    const infoModal = document.getElementById("infoModal");
    const infoModalClose = document.getElementById("infoModalClose");

    const chartsWrap = document.getElementById("chartsWrap");

    const FLOATING_BUTTONS = [menuBtn, infoBtn, paymentBtn, chartsBtn, document.getElementById("notifBellBtn"), addAccountBtn];

    function setFloatingMenuVisibility(visible) {
      FLOATING_BUTTONS.forEach(btn => {
        if (!btn) return;
        btn.style.display = visible ? "flex" : "none";
      });
      if (!visible) {
        document.body.classList.remove("menu-open");
        if (menuBtn) menuBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
      }
    }

    // ====== Tárolás (fiókok) ======
    const STORAGE_KEY = "storedAccounts_v2";
    function getStoredAccounts() {
      try { const d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : []; } catch { return []; }
    }
    function setStoredAccounts(accs) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(accs));
    }
    function addStoredAccount(email, uid) {
      const accs = getStoredAccounts();
      if (!accs.some(a => a.uid === uid)) { accs.push({ email, uid }); setStoredAccounts(accs); }
    }
    function removeStoredAccount(uid) {
      const accs = getStoredAccounts().filter(a => a.uid !== uid);
      setStoredAccounts(accs);
    }

    // ====== Kategóriák ======
    const plantCategories = {
      "🌵Szárazkedvelő": { min: 10, max: 40 },
      "🌾Mérsékelten száraz": { min: 20, max: 45 },
      "🌿Kiegyensúlyozott vízigényű": { min: 30, max: 60 },
      "🌱Nedvességkedvelő": { min: 50, max: 80 },
      "💧Vízigényes": { min: 70, max: 100 }
    };

    const FREE_PLAN_CATEGORIES = [
      "🌿Kiegyensúlyozott vízigényű"
    ];

    const PLUS_PLAN_CATEGORIES = [
      "🌵Szárazkedvelő",
      "🌾Mérsékelten száraz",
      "🌿Kiegyensúlyozott vízigényű",
      "🌱Nedvességkedvelő",
      "💧Vízigényes"
    ];

    const userPlanCache = new Map();
    window.__userPlanCache = userPlanCache;
    const subscriptionListenerUids = new Set();
    const subscriptionUnsubscribers = new Map();

    const HISTORY_LIMIT = 10;
    const HISTORY_INACTIVE_STATUSES = new Set([
      "free",
      "inactive",
      "canceled",
      "cancelled",
      "expired",
      "incomplete",
      "incomplete_expired",
      "unpaid",
      "paused"
    ]);

    function normalizePlan(value) {
      return String(value || "free").toLowerCase() === "plus" ? "plus" : "free";
    }

    function getAllowedCategoriesForPlan(plan) {
      return normalizePlan(plan) === "plus"
        ? [...PLUS_PLAN_CATEGORIES]
        : [...FREE_PLAN_CATEGORIES];
    }

    function normalizeExpiryTimestamp(value) {
      const raw = Number(value || 0);
      if (!Number.isFinite(raw) || raw <= 0) return 0;
      return raw < 1e12 ? raw * 1000 : raw;
    }

    function normalizeSubscriptionData(data = {}, emailValue = "") {
      return {
        plan: normalizePlan(data.plan),
        expiresAt: Number(data.expiresAt || 0),
        status: String(data.status || "inactive"),
        cancelAtPeriodEnd: !!data.cancelAtPeriodEnd,
        email: data.email || emailValue || "",
        updatedAt: Number(data.updatedAt || 0)
      };
    }

    function isActivePlusSubscription(entry = {}) {
      if (normalizePlan(entry.plan) !== "plus") return false;

      const status = String(entry.status || "").trim().toLowerCase();
      const expiresAt = normalizeExpiryTimestamp(entry.expiresAt);
      if (expiresAt > 0 && expiresAt <= Date.now()) return false;

      const keepsAccessUntilPeriodEnd =
        entry.cancelAtPeriodEnd === true &&
        (status === "canceled" || status === "cancelled") &&
        (expiresAt <= 0 || expiresAt > Date.now());

      return !HISTORY_INACTIVE_STATUSES.has(status) || keepsAccessUntilPeriodEnd;
    }

    function isActivePlusForUid(uid) {
      return isActivePlusSubscription(userPlanCache.get(uid) || {});
    }

    window.__getAllowedCategoriesForUid = function(uid) {
      return getAllowedCategoriesForPlan(isActivePlusForUid(uid) ? "plus" : "free");
    };

    window.__isPlusForUid = isActivePlusForUid;

    function isHistoryEnabledForUid(uid) {
      return isActivePlusForUid(uid);
    }

    window.__isHistoryEnabledForUid = isHistoryEnabledForUid;

    function getPlanBadgeText(uid) {
      return window.__isPlusForUid(uid) ? "PLUS" : "FREE";
    }

    function getPlanBadgeClass(uid) {
      return window.__isPlusForUid(uid) ? "plus" : "free";
    }

    function emitPlanRefresh() {
      window.dispatchEvent(new CustomEvent("subscription-plan-updated"));
    }

    function cacheUserSubscription(uid, data, emailValue = "") {
      const normalized = normalizeSubscriptionData(data, emailValue);
      userPlanCache.set(uid, normalized);
      emitPlanRefresh();
      return normalized;
    }

    async function ensureUserSubscriptionDefaults(uid, emailValue = "") {
      const subRef = ref(db, `users/${uid}/subscription`);
      const snap = await get(subRef);

      if (!snap.exists()) {
        await set(subRef, {
          plan: "free",
          status: "inactive",
          expiresAt: 0,
          email: emailValue || "",
          updatedAt: Date.now()
        });
        return;
      }

      const data = snap.val() || {};
      const patch = {};

      if (!data.plan) patch.plan = "free";
      if (typeof data.expiresAt === "undefined") patch.expiresAt = 0;
      if (!data.status) patch.status = "inactive";
      if (emailValue && !data.email) patch.email = emailValue;
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = Date.now();
        await update(subRef, patch);
      }
    }

    async function loadUserSubscription(uid, emailValue = "") {
      const snap = await get(ref(db, `users/${uid}/subscription`));
      const data = snap.exists() ? (snap.val() || {}) : {};
      return cacheUserSubscription(uid, data, emailValue);
    }

    function listenToUserSubscription(uid, emailValue = "") {
      if (subscriptionListenerUids.has(uid)) return;
      subscriptionListenerUids.add(uid);

      const subRef = ref(db, `users/${uid}/subscription`);
      subscriptionUnsubscribers.set(uid, onValue(subRef, (snap) => {
        const data = snap.exists() ? (snap.val() || {}) : {};
        cacheUserSubscription(uid, data, emailValue);
      }));
    }

    function getGradientColor(value) {
      // Deeper versions of the original red → amber → green palette stay legible on white.
      const low = [196, 82, 46], middle = [181, 122, 22], high = [57, 127, 72];
      const safe = Math.max(0, Math.min(100, Number(value) || 0));
      const from = safe <= 50 ? low : middle;
      const to = safe <= 50 ? middle : high;
      const ratio = safe <= 50 ? safe / 50 : (safe - 50) / 50;
      return `rgb(${from.map((part, index) => Math.round(part + (to[index] - part) * ratio)).join(',')})`;
    }

    // ====== Eszköz-kártyák (minden eszköz külön) ======
    // deviceCards: key = uid|deviceId -> { card, name, history[], canvas, lastUpdated }
    const deviceCards = new Map();
    // expose for other scripts
    window.__deviceCardsMap = deviceCards;

    // kiválasztott eszköz push-hoz
    window.jelenlegiEszkozID = null;

    function setSelectedDevice(deviceId) {
      window.jelenlegiEszkozID = deviceId;
      // kijelölés vizuálisan
      for (const v of deviceCards.values()) v.card.classList.remove("selected");
      for (const [key, v] of deviceCards.entries()) {
        if (key.endsWith("|" + deviceId)) v.card.classList.add("selected");
      }
    }

    function showLoginScreen() {
      document.body.classList.remove("is-authenticated");
      loginForm.style.display = "block";
      statusDiv.style.display = "block";
      logoutBtn.style.display = "none";
      plantDataCard.style.display = "block";
      accountsContainer.style.display = "none";
      addAccountBtn.style.display = "none";
      chartsBtn.style.display = "none";
      setFloatingMenuVisibility(false);
      statusDiv.style.color = "#1b3a2a";
      statusDiv.textContent = "Nincs bejelentkezve";
    }

    function hideLoginScreen() {
      document.body.classList.add("is-authenticated");
      loginForm.style.display = "none";
      statusDiv.style.display = "none";
      logoutBtn.style.display = "none";
      plantDataCard.style.display = "none";
      accountsContainer.style.display = "block";
      addAccountBtn.style.display = "flex";
      chartsBtn.style.display = "flex";
      setFloatingMenuVisibility(true);
    }

    function pad2(value) {
      return String(value).padStart(2, "0");
    }

    function formatChartTimestamp(ts) {
      const n = Number(ts);
      if (!Number.isFinite(n) || n <= 0) return "";
      const d = new Date(n);
      return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}-${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }

    function formatLastMeasurementText(ts) {
      const formatted = formatChartTimestamp(ts);
      return formatted ? `${formatted}` : "nincs adat";
    }

    function updateLastMeasurementBadge(el, ts) {
      if (!el) return;
      const n = normalizeExpiryTimestamp(ts);
      el.dataset.timestamp = String(n);
      const stale = !n || Date.now() - n > 6 * 60 * 60 * 1000;
      el.closest('.card')?.classList.toggle('measurement-stale', stale);
      el.textContent = n ? `Mérés: ${formatLastMeasurementText(n)}${stale ? ' · régi adat' : ''}` : 'Még nincs mérési időpont';
      el.classList.toggle("has-data", Number.isFinite(n) && n > 0);
    }

    function getChartDisplayTimestamp(item) {
      return Number(item?.lastMeasurementAt || item?.lastUpdated || 0);
    }

    function getAirQualityVisual(status = "", bad = false) {
      const normalized = String(status || "").toLowerCase();
      if (normalized.includes("nagyon")) return { label: "Nagyon rossz", tone: "very-bad", icon: "fa-smog" };
      if (normalized.includes("rossz") || bad) return { label: "Rossz", tone: "bad", icon: "fa-wind" };
      if (normalized.includes("kozepes")) return { label: "Közepes", tone: "mid", icon: "fa-cloud" };
      if (normalized.includes("jo")) return { label: "Jó", tone: "good", icon: "fa-leaf" };
      if (normalized.includes("kivalo")) return { label: "Kiváló", tone: "excellent", icon: "fa-seedling" };
      return { label: "Nincs adat", tone: "unknown", icon: "fa-circle-question" };
    }

    function normalizeHistoryEntries(entries) {
      if (!Array.isArray(entries)) return [];
      const sorted = entries
        .map(item => ({ t: Number(item?.t), v: Number(item?.v) }))
        .filter(item => Number.isFinite(item.t) && Number.isFinite(item.v))
        .sort((a, b) => a.t - b.t);

      const normalized = [];
      for (const entry of sorted) {
        const last = normalized[normalized.length - 1];
        if (last && last.v === entry.v) continue;
        normalized.push(entry);
      }
      return normalized.slice(-HISTORY_LIMIT);
    }

    function entriesToHistoryObject(entries) {
      const output = {};
      for (const entry of normalizeHistoryEntries(entries)) {
        output[entry.t] = entry.v;
      }
      return output;
    }

    function historyValueToEntries(value) {
      if (!value || typeof value !== "object") return [];
      return Object.entries(value)
        .map(([t, v]) => ({ t: Number(t), v: Number(v) }))
        .filter(item => Number.isFinite(item.t) && Number.isFinite(item.v));
    }

    async function enforceHistoryPolicyForUser(uid) {
      const devicesRef = ref(db, `users/${uid}/devices`);
      const devicesSnap = await get(devicesRef);
      if (!devicesSnap.exists()) return;

      const devices = devicesSnap.val() || {};
      const deviceIds = Object.keys(devices);

      if (!isHistoryEnabledForUid(uid)) {
        await Promise.all(deviceIds.map((deviceId) => {
          const history = devices[deviceId]?.history;
          if (!history || typeof history !== "object") return Promise.resolve();
          return remove(ref(db, `users/${uid}/devices/${deviceId}/history`));
        }));
        return;
      }

      await Promise.all(deviceIds.map((deviceId) => {
        const history = devices[deviceId]?.history;
        if (!history || typeof history !== "object") return Promise.resolve();

        const historyRef = ref(db, `users/${uid}/devices/${deviceId}/history`);
        return runTransaction(historyRef, (currentValue) => {
          if (!currentValue || typeof currentValue !== "object") return currentValue;
          return entriesToHistoryObject(historyValueToEntries(currentValue));
        });
      }));
    }

    function updateDeviceHistoryState(key, entries) {
      const obj = deviceCards.get(key);
      if (!obj) return;
      const normalized = normalizeHistoryEntries(entries);
      obj.history = normalized;
      obj.lastUpdated = normalized.at(-1)?.t || 0;
    }

    function extractDeviceChangeTimestamp(deviceData) {
      if (!deviceData || typeof deviceData !== "object") return 0;
      const candidates = [
        deviceData.lastMeasurementAt || deviceData.measuredAt || deviceData.sensorUpdatedAt || deviceData.lastSensorUpdate || deviceData.lastUpdated || deviceData.timestamp,
        deviceData.sensorUpdatedAt,
        deviceData.lastSensorUpdate,
      ]
        .map(normalizeExpiryTimestamp)
        .filter(value => Number.isFinite(value) && value > 0);

      return candidates.length ? Math.max(...candidates) : 0;
    }

    async function appendHistoryIfChanged(uid, deviceId, displayPct, changeTimestamp = 0) {
      if (!isHistoryEnabledForUid(uid)) return;

      const key = `${uid}|${deviceId}`;
      const obj = deviceCards.get(key);
      if (!obj) return;

      const safeTimestamp = Number(changeTimestamp) > 0 ? Number(changeTimestamp) : 0;
      if (!(safeTimestamp > 0)) {
        return;
      }

      const historyRef = ref(db, `users/${uid}/devices/${deviceId}/history`);
      const transaction = await runTransaction(historyRef, (currentValue) => {
        const currentEntries = normalizeHistoryEntries(historyValueToEntries(currentValue));
        const lastEntry = currentEntries[currentEntries.length - 1];

        if (lastEntry && Number(lastEntry.v) === Number(displayPct)) {
          return entriesToHistoryObject(currentEntries);
        }

        return entriesToHistoryObject([
          ...currentEntries,
          { t: safeTimestamp, v: Number(displayPct) }
        ]);
      });

      if (transaction.committed) {
        updateDeviceHistoryState(key, historyValueToEntries(transaction.snapshot.val()));
      }
    }

    // ====== Grafikon rajzolás (client-side history) ======
    function pushHistory(key, value) {
      const obj = deviceCards.get(key);
      if (!obj) return;

      const now = new Date();
      const hour = now.getHours();

      // 🔹 csak napi 2 mérés: délelőtt és délután
      const isMorning = hour >= 6 && hour <= 11;
      const isAfternoon = hour >= 15 && hour <= 20;

      if (!isMorning && !isAfternoon) return;

      // 🔹 ne mentsünk duplán ugyanarra a napszakra
      const last = obj.history[obj.history.length - 1];
      if (last) {
        const lastDate = new Date(last.t);

        const sameDay =
          lastDate.getFullYear() === now.getFullYear() &&
          lastDate.getMonth() === now.getMonth() &&
          lastDate.getDate() === now.getDate();

        const lastHour = lastDate.getHours();
        const samePeriod =
          (lastHour >= 6 && lastHour <= 11 && isMorning) ||
          (lastHour >= 15 && lastHour <= 20 && isAfternoon);

        if (sameDay && samePeriod) return;
      }

      // 🔹 mentés
      obj.history.push({
        t: now.getTime(),
        v: value
      });

      // 🔹 a helyi előzmény sem nőhet 10 elem fölé
      obj.history = normalizeHistoryEntries(obj.history);

      obj.lastUpdated = now.getTime();
    }

    function drawSimpleLineChart(canvas, history) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!history || history.length === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.font = "14px Roboto";
      ctx.fillText("Nincs adat", 12, 24);
      return;
    }

    const data = normalizeHistoryEntries(history).slice(-7);
    const MAX_BARS = 7;
    const paddingTop = 22;
    const paddingBottom = 28;
    const paddingX = 18;
    const gap = 16;

    const usableHeight = h - paddingTop - paddingBottom;
    const barWidth = (w - paddingX * 2 - gap * (MAX_BARS - 1)) / MAX_BARS;
    let animProgress = 0;

    function animate() {
      ctx.clearRect(0, 0, w, h);
      animProgress = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off' ? 1 : animProgress + 0.015;
      if (animProgress > 1) animProgress = 1;

      data.forEach((p, i) => {
        const value = Math.max(0, Math.min(100, p.v));
        const targetHeight = (value / 100) * usableHeight;
        const barHeight = targetHeight * animProgress;

        const startIndex = MAX_BARS - data.length;
        const x = paddingX + (i + startIndex) * (barWidth + gap);
        const y = paddingTop + (usableHeight - barHeight);

        let color = "#66bb6a";
        if (value < 30) color = "#ef5350";
        else if (value < 50) color = "#ffa726";

        ctx.fillStyle = color;
        const r = 6;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + barWidth - r, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
        ctx.lineTo(x + barWidth, y + barHeight);
        ctx.lineTo(x, y + barHeight);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.font = "900 16px Roboto";
        ctx.textAlign = "center";
        // FONTOS: itt szándékosan CSAK a százalék jelenik meg az oszlop alatt.
        // Dátum/idő NEM rajzolódhat a canvasra, az csak jobb felül látszódjon.
        ctx.fillText(`${value}%`, x + barWidth / 2, h - 10);
      });

      if (animProgress < 1) {
        requestAnimationFrame(animate);
      }
    }

    animate();
  }





    function rebuildChartsModal() {
      chartsWrap.innerHTML = "";
      const items = Array.from(deviceCards.entries())
        .filter(([key]) => {
          const uid = key.split("|")[0];
          return isHistoryEnabledForUid(uid);
        })
        .map(([key, obj]) => ({ key, ...obj }));
      items.sort((a,b)=> getChartDisplayTimestamp(b) - getChartDisplayTimestamp(a));

      for (const item of items) {
        const chartCard = document.createElement("div");
        chartCard.className = "chart-card";

        const title = document.createElement("div");
        title.className = "chart-title";

        const left = document.createElement("div");
        left.textContent = item.name || "Növény";

        const right = document.createElement("small");
        right.textContent = formatChartTimestamp(getChartDisplayTimestamp(item));

        title.appendChild(left);
        title.appendChild(right);

        const canvas = document.createElement("canvas");
        // fix méret a jó rajzoláshoz, CSS majd skálázza
        canvas.width = 640;
        canvas.height = 200;

        chartCard.appendChild(title);
        chartCard.appendChild(canvas);

        chartsWrap.appendChild(chartCard);

        // rajzolás
        drawSimpleLineChart(canvas, item.history || []);
      }
    }

    function openChartsModal() {
      const eligibleItems = Array.from(deviceCards.entries()).filter(([key]) => {
        const uid = key.split("|")[0];
        return isHistoryEnabledForUid(uid);
      });

      if (eligibleItems.length === 0) {
        chartsWrap.innerHTML = '<div class="chart-empty"><span class="eyebrow">NÖVÉNYFIGYELŐ PLUS</span><h3>A változás is számít.</h3><p>A mérési előzményekből követheted, hogyan változik a növényed vízellátottsága. A grafikonok Plus csomagban érhetők el.</p><a class="back-link" href="payment.html">Csomagok megtekintése →</a></div>';
        chartsModal.style.display = 'flex';
        return;
      }

      rebuildChartsModal();
      chartsModal.style.display = "flex";
    }

    function closeChartsModal() {
      chartsModal.style.display = "none";
    }

    chartsBtn.addEventListener("click", openChartsModal);
    chartsModalClose.addEventListener("click", closeChartsModal);
    window.addEventListener("click", (e)=>{ if (e.target === chartsModal) closeChartsModal(); });

    // ====== Kártya létrehozása egy konkrét eszközhöz ======
    let gaugeSequence = 0;
    function createDeviceCardForUser(uid, email, deviceId) {
      const gaugeId = `water-ring-${++gaugeSequence}`;
      const key = uid + "|" + deviceId;

      // már létezik → ne duplázzuk
      if (deviceCards.has(key)) return;

      const plantTypes = window.__getAllowedCategoriesForUid(uid);

      const selectId = `plantTypeSelect-${uid}-${deviceId}`;

      const card = document.createElement("div");
      card.className = "card device-card";
      const cleanups = [];
      const subscribe = (reference, callback) => {
        if (!deviceCards.has(key)) return;
        const stop = onValue(reference, snapshot => { if (deviceCards.has(key)) callback(snapshot); }, error => {
          card.classList.add('measurement-stale');
          card.querySelector('[data-last-update]').textContent = 'Az adat nem érhető el. Ellenőrizd a kapcsolatot / belépést.';
          console.warn('Adatfigyelés:', error.code);
        });
        cleanups.push(stop);
      };
      // 🔹 belépő animáció késleltetés (stagger)
      const index = accountsContainer.children.length;
      card.style.animationDelay = `${Math.min(index, 5) * 0.06}s`;


      card.innerHTML = `
        <button class="deleteBtn" type="button" aria-label="Fiók eltávolítása erről a készülékről"><span class="close-x-icon" aria-hidden="true"></span></button>
        <div class="plan-badge-wrap">
          <div class="plan-badge ${getPlanBadgeClass(uid)}" data-plan-badge>${getPlanBadgeText(uid)}</div>
          <div class="battery-box">
            <img class="battery-icon" src="batteryPercent/battery_100.png" alt="akku"><span class="battery-number"></span>
          </div>
        </div>

        <div class="last-update-pill" data-last-update>nincs adat</div>

        <div class="title-row">
          <span class="plant-avatar" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M15 27V13M15 19C6 20 4 13 5 8c8 0 12 4 10 11ZM16 14c-1-8 4-12 12-11 1 8-4 12-12 11Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <div class="plant-title-pill">
            <span class="plant-title">Rosso</span>
            <button class="edit-pill" aria-label="Név szerkesztése">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 4 5 5M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z"/></svg>
            </button>
          </div>
        </div>


        <div class="name-edit-wrap">
          <input type="text" class="name-input" maxlength="50" placeholder="Növény neve...">
          <button class="icon-btn ok-btn" type="button" aria-label="Mentés"><i class="fa-solid fa-check"></i></button>
          <button class="icon-btn cancel-btn" type="button" aria-label="Mégse"><i class="fa-solid fa-xmark"></i></button>
        </div>


        <div class="gauge-container">
          <svg class="gauge-svg" width="200" height="200" viewBox="0 0 200 200" aria-hidden="true" style="--ring-gradient:url(#${gaugeId});--ring-warning:url(#${gaugeId}-warm)">
            <defs><linearGradient id="${gaugeId}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#19bbad"/><stop offset="1" stop-color="#2778c4"/></linearGradient><linearGradient id="${gaugeId}-warm" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3c77b"/><stop offset="1" stop-color="#c97939"/></linearGradient></defs>
            <circle class="gauge-ticks" cx="100" cy="100" r="95"/>
            <circle class="gauge-inner" cx="100" cy="100" r="62"/>
            <circle class="gauge-bg" cx="100" cy="100" r="80"></circle>
            <circle class="gauge-fill" cx="100" cy="100" r="80"></circle>
            <g class="gauge-marker"><circle cx="180" cy="100" r="5"/></g>
          </svg>
          <div class="gauge-value">—</div>
          <span class="gauge-caption">Számított<br>vízellátottság</span>
        </div>

        <div class="device-facts">
          <p class="soil-detail"><span>Mért talajnedvesség</span><strong data-soil-value>—</strong></p>
          <p class="care-state" role="status"><span>Állapot</span><strong class="care-value">Várakozás</strong></p>
        </div>
        <details class="reading-explainer"><summary>Miért két külön százalék?</summary><p class="reading-explanation"></p><p>A szenzorérték nem a talaj víztartalmának laboratóriumi mérése. Öntözés előtt ellenőrizd a földet is.</p></details>
        <div class="slider-container" style="display:none;">
          <div class="slider-labels"><span class="led-heading"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg><span>LED világítás<small class="led-state">Kikapcsolva</small></span></span><button class="led-toggle" type="button" aria-label="LED világítás be- és kikapcsolása" aria-pressed="false"><span></span></button></div>
          <div class="led-reading"><strong class="led-output">0%</strong><span>fényerő</span></div>
          <input type="range" min="0" max="100" step="10" value="0" class="led-slider" />
          <div class="led-scale" aria-hidden="true"><span>Ki</span><span>50%</span><span>Max</span></div>
        </div>

        <div class="air-quality-card" style="display:none;">
          <div class="air-quality-header">
            <span><i class="fa-solid fa-wind"></i> Levegőminőség</span>
            <span class="air-quality-state air-tone-unknown">Nincs adat</span>
          </div>
          <div class="air-quality-metrics">
            <div class="air-metric"><span>AQI</span><strong class="air-aqi">—</strong></div>
            <div class="air-metric"><span>TVOC</span><strong class="air-tvoc">—</strong></div>
            <div class="air-metric"><span>eCO2</span><strong class="air-eco2">—</strong></div>
          </div>
        </div>

        <div class="plant-select-wrap">
          <span class="category-label">Kiválasztott vízigény</span>
          <div class="plant-select" data-uid="${uid}" data-device="${deviceId}">
            <span class="plant-select-value">Válassz kategóriát</span>
            <span class="plant-select-arrow">Módosítás <span aria-hidden="true">⌄</span></span>
          </div>
        </div>


        </div>
      `;

      const deleteBtn = card.querySelector(".deleteBtn");
      const titleEl = card.querySelector(".plant-title");
      const planBadgeEl = card.querySelector("[data-plan-badge]");
      const lastUpdateEl = card.querySelector("[data-last-update]");

      const editBtn = card.querySelector(".edit-pill");
      const editWrap = card.querySelector(".name-edit-wrap");
      const nameInput = card.querySelector(".name-input");
      const okBtn = card.querySelector(".ok-btn");
      const cancelBtn = card.querySelector(".cancel-btn");

      const gaugeValueEl = card.querySelector(".gauge-value");
      const gaugeCircleEl = card.querySelector(".gauge-fill");
      const sliderContainer = card.querySelector(".slider-container");
      const slider = card.querySelector(".led-slider");
      const airCard = card.querySelector(".air-quality-card");
      const airStateEl = card.querySelector(".air-quality-state");
      const airAqiEl = card.querySelector(".air-aqi");
      const airTvocEl = card.querySelector(".air-tvoc");
      const airEco2El = card.querySelector(".air-eco2");

      const batteryBox = card.querySelector(".battery-box");
      const batteryImg = card.querySelector(".battery-icon");

      // gauge stroke
      const R = 80;
      const C = 2 * Math.PI * R;
      gaugeCircleEl.style.strokeDasharray = C;
      gaugeCircleEl.style.strokeDashoffset = C;
      // 🔹 alap szín induláskor (ne legyen fekete)
      gaugeCircleEl.style.stroke = "#c8e6c9";
      gaugeValueEl.style.color = "#7e917c";


      let currPercent = 0;
      let currCat = "";

      deviceCards.set(key, {
        card,
        cleanups,
        uid,
        deviceId,
        name: email,
        history: [],
        lastUpdated: 0,
        lastMeasurementAt: 0,
        deviceMetaTimestamp: 0,
        airData: null
      });

      updateLastMeasurementBadge(lastUpdateEl, 0);

      const plantTypeRef = ref(db, `users/${uid}/devices/${deviceId}/plantType`);
      const plantSelectValueEl = card.querySelector(".plant-select-value");

      function getFallbackCategoryForUid() {
        const allowed = window.__getAllowedCategoriesForUid(uid);
        return allowed[0] || "🌿Kiegyensúlyozott vízigényű";
      }

      function refreshPlanBadgeAndRestrictions() {
        if (planBadgeEl) {
          planBadgeEl.textContent = getPlanBadgeText(uid);
          planBadgeEl.className = `plan-badge ${getPlanBadgeClass(uid)}`;
        }

        const allowed = window.__getAllowedCategoriesForUid(uid);
        if (!allowed.includes(currCat)) {
          currCat = getFallbackCategoryForUid();
          plantSelectValueEl.textContent = currCat.replace(/^[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+/u, '');
          updateAccountGauge(currPercent, currCat);

        }
      }

      subscribe(plantTypeRef, (snap) => {
        const v = snap.exists() ? String(snap.val() || "") : "";
        if (v) {
          currCat = v;
          plantSelectValueEl.textContent = v.replace(/^[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+/u, '');
          refreshPlanBadgeAndRestrictions();
          updateAccountGauge(currPercent, currCat);
        } else {
          currCat = getFallbackCategoryForUid();
          plantSelectValueEl.textContent = currCat.replace(/^[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+/u, '');
          updateAccountGauge(currPercent, currCat);
        }
      });

      window.addEventListener("subscription-plan-updated", refreshPlanBadgeAndRestrictions);
      cleanups.push(() => window.removeEventListener("subscription-plan-updated", refreshPlanBadgeAndRestrictions));


      function updateAccountGauge(realPercent, cat) {
        // visszaadjuk a kijelzett %-ot is

        realPercent = Math.max(0, Math.min(100, Number(realPercent)));
        let display = realPercent;

        if (plantCategories[cat]) {
          const { min, max } = plantCategories[cat];

          if (realPercent < min) display = 0;
          else if (realPercent > max) display = 100;
          else {
            display = Math.round(((realPercent - min) / (max - min)) * 100);
          }
        }

        card.dataset.level = String(display);
        card.dataset.category = cat;
        card.style.setProperty('--gauge-angle', (display * 3.6) + 'deg');
        const range = plantCategories[cat];
        const label = String(cat || '').replace(/^[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+/u, '');
        card.querySelector('.reading-explanation').textContent = range
          ? `A szenzor ${Math.round(realPercent)}%-ot mér. A(z) „${label}” beállítás ${range.min}–${range.max}% közötti szenzorértékből számít 0–100%-os skálát. Ezért a számított érték most ${display}%. A 100% a skála felső vége, nem azt jelenti, hogy tökéletes az állapot.`
          : 'A nagy kör a kiválasztott vízigényhez igazított számított érték; a mért talajnedvesség külön látható.';
        card.querySelector('[data-soil-value]').textContent = Math.round(realPercent) + '%';
        card.querySelector('.care-value').textContent = display < 35 ? 'Öntözést igényelhet' : display >= 95 ? 'Magas vízellátottság' : 'Megfelelő';
        card.classList.toggle('needs-attention', display < 35 || display >= 95);
        card.style.setProperty('--water-top', (100 - display) + '%');
        const previous = gaugeValueEl.dataset.value === undefined ? 0 : Number(gaugeValueEl.dataset.value);
        gaugeValueEl.dataset.value = String(display);
        if (gaugeValueEl.__numberFrame) cancelAnimationFrame(gaugeValueEl.__numberFrame);
        const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off';
        if (reduceMotion || !Number.isFinite(previous) || previous === display) {
          gaugeValueEl.textContent = display + '%';
        } else {
          const started = performance.now();
          const tick = now => {
            const progress = Math.min(1, (now - started) / 650);
            const eased = 1 - Math.pow(1 - progress, 3);
            gaugeValueEl.textContent = Math.round(previous + (display - previous) * eased) + '%';
            if (document.documentElement.dataset.motion === 'off' || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) { gaugeValueEl.textContent = display + '%'; return; }
            if (progress < 1 && card.isConnected) gaugeValueEl.__numberFrame = requestAnimationFrame(tick);
          };
          gaugeValueEl.__numberFrame = requestAnimationFrame(tick);
        }
        const offset = C - (display / 100) * C;
        gaugeCircleEl.style.strokeDashoffset = offset;

        const color = getGradientColor(display);
        card.style.setProperty('--reading-color', display < 35 ? '#a54822' : display >= 95 ? '#76531b' : '#275e37');
        gaugeCircleEl.style.stroke = color;
        gaugeValueEl.style.color = color;
        return display;
      }

      function updateAirUI(airData) {
        const obj = deviceCards.get(key);
        if (obj) obj.airData = airData || null;

        if (!airData || !airCard || !airStateEl || !airAqiEl || !airTvocEl || !airEco2El) {
          if (airCard) airCard.style.display = "none";
          return;
        }

        airCard.style.display = "block";
        const visual = getAirQualityVisual(airData.status, airData.bad);
        airStateEl.textContent = visual.label;
        airStateEl.className = `air-quality-state air-tone-${visual.tone}`;
        airAqiEl.textContent = Number.isFinite(Number(airData.aqi)) ? String(Number(airData.aqi)) : "—";
        airTvocEl.textContent = Number.isFinite(Number(airData.tvoc)) ? `${Number(airData.tvoc)} ppb` : "—";
        airEco2El.textContent = Number.isFinite(Number(airData.eco2)) ? `${Number(airData.eco2)} ppm` : "—";
      }


      // kiválasztás (push-hoz)
      card.addEventListener("click", (e) => {
        // ha törlés / gomb nyomás -> ne ütközzön
        if (e.target.closest(".deleteBtn") || e.target.closest(".edit-pill") || e.target.closest(".name-edit-wrap") || e.target.closest("select") || e.target.closest("input") || e.target.closest(".plant-select") ) return;
        window.jelenlegiUID = uid;
        window.jelenlegiEmail = email;
        setSelectedDevice(deviceId);
      });

      // alapból legyen kiválasztva az első, ha még nincs
      if (!window.jelenlegiEszkozID) {
        window.jelenlegiUID = uid;
        window.jelenlegiEmail = email;
        setSelectedDevice(deviceId);
      }

      // név szerkesztés UI
      function openEdit() {
        editWrap.style.display = "flex";
        editBtn.style.display = "none";
        nameInput.value = titleEl.textContent.trim() || "";
        nameInput.focus();
        nameInput.select();
      }
      function closeEdit() {
        editWrap.style.display = "none";
        editBtn.style.display = "inline-flex";
      }

      editBtn.addEventListener("click", (e)=>{ e.stopPropagation(); openEdit(); });
      cancelBtn.addEventListener("click", (e)=>{ e.stopPropagation(); closeEdit(); });

      async function saveDisplayName() {
        const newName = nameInput.value.trim();
        if (!newName) { closeEdit(); return; }
        okBtn.disabled = true;
        try {
          await set(ref(db, `users/${uid}/devices/${deviceId}/displayName`), newName);
          titleEl.textContent = newName;
          titleEl.title = newName;
          closeEdit();
        } catch {
          window.showAppToast('A név mentése nem sikerült. Próbáld újra.', 'Mentési hiba');
        } finally { okBtn.disabled = false; }
      }
      okBtn.addEventListener('click', e => { e.stopPropagation(); saveDisplayName(); });
      nameInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeEdit();
        if (e.key === 'Enter') { e.preventDefault(); if (!okBtn.disabled) saveDisplayName(); }
      });

      // törlés (csak fiók eltávolítás logika: UID törlése localstorage-ból)
      deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const confirmed = await showConfirmModal("Biztosan törlöd ezt a fiókot?");
      if (!confirmed) return;

      card.classList.add("removing");

      setTimeout(() => {
        removeAllCardsForUid(uid);
      }, 450);
    });


      // Firebase: displayName
      const displayNameRef = ref(db, `users/${uid}/devices/${deviceId}/displayName`);
      subscribe(displayNameRef, (snap) => {
        const v = snap.exists() ? String(snap.val() || "").trim() : "";
        const name = v || email;
        titleEl.textContent = name;
        titleEl.title = name;
        
        // sync a charts névhez is
        const obj = deviceCards.get(key);
        if (obj) obj.name = v ? v : name;
      });

      
      function updateBatteryUI(data) {
        const raw = data.batteryPercent ?? data.battery;
        const p = raw === null || raw === '' || raw === undefined ? NaN : Number(raw);
        batteryBox.style.display = Number.isFinite(p) ? 'flex' : 'none';
        if (!Number.isFinite(p)) return;
        const safe = Math.max(0, Math.min(100, Math.round(p)));
        const level = safe >= 80 ? 100 : safe >= 60 ? 75 : safe >= 40 ? 50 : safe >= 20 ? 25 : 0;
        batteryImg.src = `batteryPercent/battery_${level}.png`;
        batteryImg.alt = `Akkumulátor: ${safe}%`;
        batteryBox.dataset.low = String(safe <= 20);
        batteryBox.title = batteryImg.alt;
        batteryBox.setAttribute('role', 'img');
        batteryBox.setAttribute('aria-label', batteryImg.alt);
        batteryBox.style.setProperty('--battery-level', safe + '%');
        card.querySelector('.battery-number').textContent = safe + '%';
      }
      const deviceRootRef = ref(db, `users/${uid}/devices/${deviceId}`);
      subscribe(deviceRootRef, (snap) => {
        if (!snap.exists()) return;
        const obj = deviceCards.get(key);
        if (!obj) return;

        updateBatteryUI(snap.val());
        const ts = extractDeviceChangeTimestamp(snap.val()) || 0;
        obj.deviceMetaTimestamp = ts;

        if (ts > 0) {
          obj.lastMeasurementAt = ts;
        }

        updateLastMeasurementBadge(lastUpdateEl, obj.lastMeasurementAt || ts || 0);

        try {
          const cacheKey = `plant_${uid}_${deviceId}`;
          const cached = localStorage.getItem(cacheKey);
          const cacheData = cached ? JSON.parse(cached) : {};
          cacheData.lastMeasurementAt = ts;
          cacheData.lastUpdated = obj.lastUpdated || 0;
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
          console.warn("Device timestamp cache mentési hiba:", e);
        }

        if (chartsModal.style.display === "flex") rebuildChartsModal();
      });

     // Firebase: soil sensor + EMAIL riasztás
    const soilRef = ref(db, `users/${uid}/devices/${deviceId}/sensorValue`);
          subscribe(soilRef, async (snap) => {
            if (!snap.exists()) return;

            const v = Number(snap.val());
            if (!Number.isFinite(v)) return;

            currPercent = v;
            const displayPct = updateAccountGauge(currPercent, currCat);
            // 💾 OFFLINE CACHE MENTÉS
            try {
              const cacheKey = `plant_${uid}_${deviceId}`;

              const cacheObj = deviceCards.get(uid + "|" + deviceId);
              const cacheData = {
                sensorValue: currPercent,
                displayValue: displayPct,
                category: currCat || "",
                name: titleEl.textContent || "",
                history: cacheObj?.history || [],
                lastUpdated: cacheObj?.lastUpdated || 0,
                lastMeasurementAt: cacheObj?.lastMeasurementAt || 0,
                airData: cacheObj?.airData || null
              };

              localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (e) {
              console.warn("Offline cache mentési hiba:", e);
            }


            const obj = deviceCards.get(uid + "|" + deviceId);
            const measurementTimestamp = obj?.deviceMetaTimestamp || obj?.lastMeasurementAt || obj?.lastUpdated || 0;

            if (obj) {
              obj.lastMeasurementAt = measurementTimestamp;
              updateLastMeasurementBadge(lastUpdateEl, obj.lastMeasurementAt || 0);
            }

            if (isHistoryEnabledForUid(uid)) {
              try { await appendHistoryIfChanged(uid, deviceId, displayPct, measurementTimestamp); }
              catch (error) { console.warn('Mérési előzmény mentése:', error.code); }
            } else if (obj) {
              obj.history = [];
              obj.lastUpdated = 0;
            }

            if (chartsModal.style.display === "flex") rebuildChartsModal();


        //if (window.__maybeEmailNotify) {
          //window.__maybeEmailNotify({
          //uid,
          //deviceId,
          //realPct: currPercent,   // ← EZ A VALÓDI SZENZOR %   ❌ NINCS AZONNALI EMAIL
          //displayPct,
          //plantType: currCat,
          //displayName: titleEl.textContent });
        //}
      });

      const airQualityRef = ref(db, `users/${uid}/devices/${deviceId}/airQuality`);
      subscribe(airQualityRef, (snap) => {
        if (!snap.exists()) {
          updateAirUI(null);
          return;
        }

        const raw = snap.val() || {};
        const airData = {
          aqi: Number(raw.aqi),
          tvoc: Number(raw.tvoc),
          eco2: Number(raw.eco2),
          bad: !!raw.bad,
          status: String(raw.status || ""),
          updatedAt: Number(raw.updatedAt || raw.measuredAt || raw.lastMeasurementAt || 0)
        };
        updateAirUI(airData);

        try {
          const cacheKey = `plant_${uid}_${deviceId}`;
          const cached = localStorage.getItem(cacheKey);
          const cacheData = cached ? JSON.parse(cached) : {};
          cacheData.airData = airData;
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
          console.warn("Offline air cache mentési hiba:", e);
        }
      });
// Firebase: LED (csak ha van)
      const ledLevelRef = ref(db, `users/${uid}/devices/${deviceId}/ledLevel`);
      const ledToggle = card.querySelector('.led-toggle');
      function renderLedLevel(value) {
        const on = Number(value) > 0;
        card.querySelector('.led-output').textContent = value + '%';
        slider.style.setProperty('--slider-progress', value + '%');
        ledToggle.setAttribute('aria-pressed', String(on));
        card.querySelector('.led-state').textContent = on ? 'Bekapcsolva' : 'Kikapcsolva';
        sliderContainer.classList.toggle('is-on', on);
      }
      slider.addEventListener('input', () => renderLedLevel(slider.value));
      ledToggle.addEventListener('click', () => {
        if(slider.disabled) return;
        slider.value = Number(slider.value) > 0 ? '0' : (slider.dataset.lastOn || '50');
        renderLedLevel(slider.value);
        slider.dispatchEvent(new Event('change', {bubbles:true}));
      });
      get(ledLevelRef).then((snap) => {
        if (snap.exists()) {
          sliderContainer.style.display = "flex";
          slider.value = Math.round((Number(snap.val()) || 0) / 10) * 10;
          slider.dataset.savedLevel = slider.value;
          if(Number(slider.value) > 0) slider.dataset.lastOn = slider.value;
          renderLedLevel(slider.value);
          subscribe(ledLevelRef, (s2) => {
            if (s2.exists()) {
              slider.value = Math.round((Number(s2.val()) || 0) / 10) * 10;
              slider.dataset.savedLevel = slider.value;
              if(Number(slider.value) > 0) slider.dataset.lastOn = slider.value;
              renderLedLevel(slider.value);
            }
          });
          slider.setAttribute('aria-label', 'LED fényerő');
          slider.addEventListener("change", async (e)=> {
            e.stopPropagation();
            const snapped = Math.max(0, Math.min(100, Math.round((Number(e.target.value) || 0) / 10) * 10));
            e.target.value = snapped;
            const savedLevel = Number(slider.dataset.savedLevel ?? slider.value);
            if (!navigator.onLine) {
              slider.value = String(savedLevel);
              renderLedLevel(savedLevel);
              window.showAppToast('A világítás állításához internetkapcsolat szükséges.', 'Nincs internet');
              return;
            }
            slider.disabled = true;
            ledToggle.disabled = true;
            sliderContainer.setAttribute('aria-busy', 'true');
            try { await set(ledLevelRef, snapped); slider.dataset.savedLevel = String(snapped); if(snapped > 0) slider.dataset.lastOn = String(snapped); }
            catch {
              slider.value = String(savedLevel);
              renderLedLevel(savedLevel);
              window.showAppToast('A fényerő mentése nem sikerült. Próbáld újra.', 'Mentési hiba');
            }
            finally { slider.disabled = false; ledToggle.disabled = false; sliderContainer.removeAttribute('aria-busy'); }
          });
        } else {
          sliderContainer.style.display = "none";
        }
      }).catch(() => { window.showAppToast('A világítás beállítása nem tölthető be. Ellenőrizd a kapcsolatot.', 'Betöltési hiba'); });

      // 🔹 HISTORY szinkron Firebase-ből (grafikonhoz) – csak Plusnál
      const historyRef = ref(db, `users/${uid}/devices/${deviceId}/history`);
      subscribe(historyRef, (snap) => {
        const obj = deviceCards.get(key);
        if (!obj) return;

        if (!isHistoryEnabledForUid(uid)) {
          obj.history = [];
          obj.lastUpdated = 0;
          if (chartsModal.style.display === "flex") rebuildChartsModal();
          return;
        }

        if (!snap.exists()) {
          obj.history = [];
          obj.lastUpdated = 0;
          if (chartsModal.style.display === "flex") rebuildChartsModal();
          return;
        }

        const entries = Object.entries(snap.val())
          .map(([t, v]) => ({ t: Number(t), v: Number(v) }))
          .filter(p => Number.isFinite(p.t) && Number.isFinite(p.v));

        updateDeviceHistoryState(key, entries);
        if (chartsModal.style.display === "flex") rebuildChartsModal();
      });
      // 📦 OFFLINE CACHE BETÖLTÉS (ha van)
      try {
        const cacheKey = `plant_${uid}_${deviceId}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
          const data = JSON.parse(cached);

          // név
          if (data.name) {
            titleEl.textContent = data.name;
            titleEl.title = data.name;
          }

          // kategória
          if (data.category) {
            currCat = data.category;
            plantSelectValueEl.textContent = data.category.replace(/^[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+/u, '');
          }

          // szenzor érték
          if (Number.isFinite(data.sensorValue)) {
            currPercent = data.sensorValue;
            updateAccountGauge(currPercent, currCat);
          }

          // history (grafikon)
          if (Array.isArray(data.history)) {
            const obj = deviceCards.get(key);
            if (obj) {
              obj.history = data.history;
              obj.lastUpdated = data.lastUpdated || 0;
              obj.lastMeasurementAt = data.lastMeasurementAt || data.lastUpdated || 0;
            }
          }

          if (data.airData) {
            updateAirUI(data.airData);
          }
        }
      } catch (e) {
        console.warn("Offline cache betöltési hiba:", e);
      }


      // kártya hozzáadás a DOM-hoz
      accountsContainer.appendChild(card);

      // alap kijelölés
      if (window.jelenlegiEszkozID === deviceId) card.classList.add("selected");
    }

    function removeAllCardsForUid(uid) {
      subscriptionUnsubscribers.get(uid)?.();
      subscriptionUnsubscribers.delete(uid);
      subscriptionListenerUids.delete(uid);
      userPlanCache.delete(uid);
      removeStoredAccount(uid);

      // DOM + map törlés
      for (const [key, obj] of Array.from(deviceCards.entries())) {
        if (key.startsWith(uid + "|")) {
          obj.cleanups?.forEach(stop => stop());
          obj.card.remove();
          deviceCards.delete(key);
        }
      }

      // ha nincs már kártya, vissza login
      if (deviceCards.size === 0) {
        showLoginScreen();
      } else {
        // válasszunk egy maradék eszközt
        const first = Array.from(deviceCards.keys())[0];
        const devId = first.split("|")[1];
        setSelectedDevice(devId);
      }
    }

    // ====== Fiók betöltés: UID -> devices -> minden eszköz külön kártya ======
    async function addAccountByUid(uid, emailLabel) {
      await ensureUserSubscriptionDefaults(uid, emailLabel || "");
      await loadUserSubscription(uid, emailLabel || "");
      listenToUserSubscription(uid, emailLabel || "");

      const devicesSnap = await get(ref(db, `users/${uid}/devices`));
      if (!devicesSnap.exists()) return;

      const devicesData = devicesSnap.val();
      const deviceIds = Object.keys(devicesData || {});
      if (deviceIds.length === 0) return;

      // minden eszköz külön kártya
      for (const deviceId of deviceIds) {
        // csak akkor jelenítsük meg, ha van már szenzor érték (különben "0%" ghost kártyák lesznek)
        const dev = devicesData[deviceId] || {};
        if (typeof dev.sensorValue === "undefined") continue;
        createDeviceCardForUser(uid, emailLabel, deviceId);
      }

      // ha még nincs kijelölt device, az első legyen
      if (!window.jelenlegiEszkozID) setSelectedDevice(deviceIds[0]);
    }

    // ====== Login / fiók hozzáadás ======
    window.addEventListener("load", async () => {
      try {
        await auth.authStateReady();
        const stored = getStoredAccounts();
        if (stored.length > 0 && auth.currentUser) {
          hideLoginScreen();
          for (const acc of stored) {
            await addAccountByUid(acc.uid, acc.email || "Fiók");
          }
        } else {
          showLoginScreen();
        }
        if (auth.currentUser && stored.length > 0 && deviceCards.size === 0) hideLoginScreen();
      } catch (error) {
        showLoginScreen();
        statusDiv.textContent = 'A fiók betöltése nem sikerült. Jelentkezz be újra.';
        console.warn('Fiók betöltés:', error.code);
      } finally {
        window.dispatchEvent(new CustomEvent("app-content-ready"));
      }
    });

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusDiv.style.color = "green";
      statusDiv.textContent = "Bejelentkezés...";

      try {
        const userCred = await signInWithEmailAndPassword(auth, emailInput.value, passInput.value);
        const user = userCred.user;

        // localstorage hozzáadás
        addStoredAccount(emailInput.value, user.uid);
        await ensureUserSubscriptionDefaults(user.uid, emailInput.value);

        // kártyák létrehozása
        hideLoginScreen();
        await addAccountByUid(user.uid, emailInput.value);

        passInput.value = '';
        statusDiv.textContent = "";
      } catch (err) {
        statusDiv.style.color = "red";
        if (["auth/invalid-credential","auth/wrong-password","auth/user-not-found"].includes(err.code)) {
          statusDiv.textContent = "Hibás felhasználónév vagy jelszó!";
        } else {
          statusDiv.textContent = "Hiba: " + err.message;
        }
      }
    });

    addAccountBtn.addEventListener("click", () => {
      modal.style.display = "flex";
      addAccountStatus.textContent = "";
    });

    if (paymentBtn) {
      paymentBtn.addEventListener("click", () => {
        window.location.href = "payment.html";
      });
    }

    if (infoBtn && infoModal) {
      infoBtn.addEventListener("click", () => {
        infoModal.style.display = "flex";
        document.body.classList.remove("menu-open");
        if (menuBtn) menuBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
      });
    }

    if (infoModalClose && infoModal) {
      infoModalClose.addEventListener("click", () => {
        infoModal.style.display = "none";
      });
    }

    window.addEventListener("click", (e) => {
      if (e.target === infoModal) infoModal.style.display = "none";
    });

    modalCloseBtn.addEventListener("click", () => { modal.style.display = "none"; });
    window.addEventListener("click", (e)=>{ if (e.target === modal) modal.style.display = "none"; });

    addNewAccountForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = newAccountEmail.value.trim();
      const pass  = newAccountPass.value;

      addAccountStatus.textContent = "";

      const stored = getStoredAccounts();
      if (stored.some(acc => (acc.email || "").toLowerCase() === email.toLowerCase())) {
        addAccountStatus.style.color = "red";
        addAccountStatus.textContent = "Ez a fiók már hozzá van adva!";
        return;
      }

      try {
        const userCred = await signInWithEmailAndPassword(auth, email, pass);
        const uid = userCred.user.uid;

        addStoredAccount(email, uid);
        await ensureUserSubscriptionDefaults(uid, email);
        await addAccountByUid(uid, email);

        modal.style.display = "none";
        newAccountEmail.value = "";
        newAccountPass.value = "";
        addAccountStatus.textContent = "";

      } catch (err) {
        addAccountStatus.style.color = "red";
        if (err.code === "auth/invalid-credential") {
          addAccountStatus.textContent = "Hibás email vagy jelszó.";
        } else {
          addAccountStatus.textContent = "Hiba történt: " + err.message;
        }
      }
    });

    logoutBtn.style.display = "none";
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      for (const uid of new Set([...deviceCards.values()].map(item => item.uid))) removeAllCardsForUid(uid);
      setStoredAccounts([]);
      window.jelenlegiEszkozID = null;
      showLoginScreen();
    });

    // ====== Confirm modal ======
    let confirmResolve = null;
    function showConfirmModal(message) {
      return new Promise((resolve) => {
        const modal = document.getElementById("confirmModal");
        document.getElementById("confirmText").innerText = message;
        modal.style.display = "flex";
        confirmResolve = resolve;
      });
    }
    function hideConfirmModal() {
      const modal = document.getElementById("confirmModal");
      modal.style.display = "none";
      if (confirmResolve) confirmResolve(false);
      confirmResolve = null;
    }

    window.addEventListener("DOMContentLoaded", () => {
      document.getElementById("confirmIgenBtn").addEventListener("click", () => {
        const modal = document.getElementById("confirmModal");
        modal.style.display = "none";
        if (confirmResolve) confirmResolve(true);
        confirmResolve = null;
      });
      document.getElementById("confirmNemBtn").addEventListener("click", () => { hideConfirmModal(); });
      document.getElementById("confirmClose").addEventListener("click", () => { hideConfirmModal(); });
      window.addEventListener("keydown", (e) => {
        if(e.key === "Escape" && document.getElementById("confirmModal").style.display === "flex") hideConfirmModal();
      });
    });

    // ====== Expose for push script ======
    window.__setSelectedDevice = setSelectedDevice;
