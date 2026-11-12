import { mountHistoryChart } from "./history-chart.js?v=20261110activation";
import { activationMessage, claimActivation, devicePath, inspectActivation } from "./activation.js?v=20261112";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
    import { connectDatabaseEmulator, getDatabase, ref, onValue, set, get, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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

    const localEmulator = location.hostname === "127.0.0.1" &&
      new URLSearchParams(location.search).get("emulator") === "1";
    const app = initializeApp(localEmulator ? {
      ...firebaseConfig,
      apiKey: "demo-api-key",
      projectId: "demo-novenyfigyelo",
      authDomain: "demo-novenyfigyelo.firebaseapp.com",
      databaseURL: "https://demo-novenyfigyelo-default-rtdb.firebaseio.com"
    } : firebaseConfig);
    const db = getDatabase(app);
    const auth = getAuth(app);
    auth.languageCode = "hu";
    if (localEmulator) {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectDatabaseEmulator(db, "127.0.0.1", 9000);
    }
    window.__auth = auth;

    // expose Firebase helpers for non-module scripts
    window.__db = db;
    window.__ref = ref;
    window.__get = get;
    window.__set = set;
    window.__update = update;
    window.__onValue = onValue;
    window.__devicePath = devicePath;
    window.__setPlantType = (uid, id, plantType) =>
      update(ref(db, cardDevicePath(uid, id)), { plantType, plantTypeChangedAt: serverTimestamp() });


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
    const addAccountStatus = document.getElementById("addAccountStatus");
    const accountsContainer = document.getElementById("accountsContainer");

    const chartsBtn = document.getElementById("chartsBtn");
    const infoBtn = document.getElementById("infoBtn");
    const menuBtn = document.getElementById("menuBtn");
    const chartsModal = document.getElementById("chartsModal");
    const chartsModalClose = document.getElementById("chartsModalClose");
    const infoModal = document.getElementById("infoModal");
    const infoModalClose = document.getElementById("infoModalClose");

    const chartsWrap = document.getElementById("chartsWrap");

    const FLOATING_BUTTONS = [menuBtn, infoBtn, chartsBtn, document.getElementById("notifBellBtn"), addAccountBtn];

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

    // ====== Kategóriák ======
    const plantCategories = {
      "🌵Szárazkedvelő": { min: 10, max: 40 },
      "🌾Mérsékelten száraz": { min: 20, max: 45 },
      "🌿Kiegyensúlyozott vízigényű": { min: 30, max: 60 },
      "🌱Nedvességkedvelő": { min: 50, max: 80 },
      "💧Vízigényes": { min: 70, max: 100 }
    };

    const DEFAULT_CATEGORY = "🌿Kiegyensúlyozott vízigényű";

    const OFFLINE_UID = "noveny-v2-offline-uid";
    const cacheKeyFor = (uid, id) => `noveny-v2-plant_${uid}_${id}`;

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
    const legacyPath = uid => `users/${uid}/devices`;

    function cardDevicePath(uid, id) {
      return deviceCards.get(`${uid}|${id}`)?.legacy ? `${legacyPath(uid)}/${id}` : devicePath(uid, id);
    }

    function legacyTimestamp(value) {
      const numeric = Number(value);
      if (numeric > 0 && Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
      if (typeof value !== "string") return 0;
      return Date.parse(value.replace(/^(\d{4})\.(\d{2})\.(\d{2})-/, "$1-$2-$3T")) || 0;
    }

    function legacyDevices(value) {
      const result = [];
      for (const [id, data] of Object.entries(value || {})) {
        if (data?.sensorValue == null || data.sensorValue === "" || !Number.isFinite(Number(data.sensorValue))) continue;
        const history = normalizeHistoryEntries(
          Object.entries(data.history || {}).map(([t, v]) => ({ t: legacyTimestamp(t), v: Number(v) }))
        );
        const lastMeasurementAt = legacyTimestamp(data.lastMeasurementAt || data.measuredAt || data.sensorUpdatedAt ||
          data.lastSensorUpdate || data.lastUpdated || data.timestamp) || Number(history.at(-1)?.t) || 0;
        result.push([id, {
          ...data, legacy: true, history,
          reading: { sensorValue: Number(data.sensorValue), batteryPercent: data.batteryPercent ?? data.battery, lastMeasurementAt }
        }]);
      }
      return Object.fromEntries(result);
    }

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
      statusDiv.style.display = "block";
      logoutBtn.style.display = "none";
      plantDataCard.style.display = "block";
      accountsContainer.style.display = "none";
      addAccountBtn.style.display = "none";
      chartsBtn.style.display = "none";
      setFloatingMenuVisibility(false);
      statusDiv.textContent = "";
    }

    function hideLoginScreen() {
      document.body.classList.add("is-authenticated");
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
      const n = Number(ts) || 0;
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

    function normalizeHistoryEntries(value) {
      return Object.values(value || {})
        .filter(point => Number.isFinite(point?.t) && Number.isFinite(point?.v))
        .sort((a, b) => a.t - b.t)
        .slice(-10);
    }

    let chartDisposers = [];
    function clearChartRenderers() {
      chartDisposers.forEach(dispose => dispose());
      chartDisposers = [];
    }

    function rebuildChartsModal() {
      clearChartRenderers();
      chartsWrap.innerHTML = "";
      const items = [...deviceCards.values()];
      if (!items.length) {
        chartsWrap.innerHTML = '<div class="chart-empty"><h3>Még nincs mérés</h3><p>Párosíts egy virágtartót, majd várd meg az első mérését.</p></div>';
      }
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
        // CSS fixes the visible height; the renderer matches the actual pixel density.
        canvas.width = 1;
        canvas.height = 1;
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${item.name || "Növény"} korábbi talajnedvesség-mérései: ${(item.history || []).map(p => Math.round(p.v) + "%").join(", ") || "még nincs adat"}`);

        chartCard.appendChild(title);
        chartCard.appendChild(canvas);

        chartsWrap.appendChild(chartCard);

        chartDisposers.push(mountHistoryChart(canvas, normalizeHistoryEntries(item.history || [])));
      }
    }

    function openChartsModal() {
      chartsModal.style.display = "flex";
      rebuildChartsModal();
    }

    function closeChartsModal() {
      clearChartRenderers();
      chartsModal.style.display = "none";
    }

    chartsBtn.addEventListener("click", openChartsModal);
    chartsModalClose.addEventListener("click", closeChartsModal);
    window.addEventListener("click", (e)=>{ if (e.target === chartsModal) closeChartsModal(); });

    // ====== Kártya létrehozása egy konkrét eszközhöz ======
    let gaugeSequence = 0;
    function createDeviceCardForUser(uid, deviceId, legacy) {
      const gaugeId = `water-ring-${++gaugeSequence}`;
      const key = uid + "|" + deviceId;

      // már létezik → ne duplázzuk
      if (deviceCards.has(key)) return;

      const base = legacy ? `${legacyPath(uid)}/${deviceId}` : devicePath(uid, deviceId);
      const card = document.createElement("div");
      card.className = "card device-card";
      // 🔹 belépő animáció késleltetés (stagger)
      const index = accountsContainer.children.length;
      card.style.animationDelay = `${Math.min(index, 5) * 0.06}s`;


      card.innerHTML = `
        <button class="deleteBtn" type="button" aria-label="Virágtartó elrejtése"><span class="close-x-icon" aria-hidden="true"></span></button>
        <div class="plan-badge-wrap">
          <div class="battery-box">
            <img class="battery-icon" src="batteryPercent/battery_100.png" alt="akku"><span class="battery-number"></span>
          </div>
        </div>

        <div class="last-update-pill" data-last-update>nincs adat</div>

        <div class="title-row">
          <span class="plant-avatar" aria-hidden="true"><svg class="plant-category-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#plant-leaf"/></svg></span>
          <div class="plant-title-pill">
            <span class="plant-title">Növényem</span>
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
          <svg class="gauge-botanical" viewBox="0 0 280 280" fill="none" aria-hidden="true" focusable="false">
            <path d="M87 252C36 229 12 184 22 124M195 25c48 14 72 51 65 99" stroke="#357a4d" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M48 222C25 226 12 213 12 193c22 1 36 11 36 29Z" fill="#4ea967"/><path d="M31 195C10 190 3 174 10 157c20 7 27 19 21 38Z" fill="#a0cf80"/><path d="M25 165C9 155 9 139 18 125c16 12 19 25 7 40Z" fill="#4a9b58"/><path d="M64 239c-2-21 9-32 28-33 1 20-9 32-28 33Z" fill="#82be70"/><path d="M42 211c-1-19 8-30 25-33 4 18-6 31-25 33Z" fill="#b6d992"/>
            <path d="M217 36c-1-19 10-27 27-26-1 17-9 25-27 26Z" fill="#7eb965"/><path d="M241 57c5-19 18-25 33-17-7 16-17 22-33 17Z" fill="#a8d585"/><path d="M258 87c7-16 19-20 31-12-7 14-18 18-31 12Z" fill="#4c9b60"/>
            <g class="gauge-blossom" transform="translate(235 49)"><circle cy="-9" r="8" fill="#eeafb1"/><circle cx="9" cy="-3" r="8" fill="#e8a0a9"/><circle cx="6" cy="8" r="8" fill="#f2c2bb"/><circle cx="-6" cy="8" r="8" fill="#e8a0a9"/><circle cx="-9" cy="-3" r="8" fill="#f2c2bb"/><circle r="5" fill="#f5d787"/></g>
            <g transform="translate(37 229)"><circle cy="-5" r="5" fill="#e4bd74"/><circle cx="5" r="5" fill="#f5dc9c"/><circle cy="5" r="5" fill="#edce8a"/><circle cx="-5" r="5" fill="#f5dc9c"/><circle r="3" fill="#93652c"/></g>
          </svg>
          <svg class="gauge-svg" width="200" height="200" viewBox="0 0 200 200" aria-hidden="true" style="--ring-gradient:url(#${gaugeId});--ring-warning:url(#${gaugeId}-warm)">
            <defs><linearGradient id="${gaugeId}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#49db8e"/><stop offset="1" stop-color="#087c60"/></linearGradient><linearGradient id="${gaugeId}-warm" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffc669"/><stop offset="1" stop-color="#d57925"/></linearGradient></defs>
            <circle class="gauge-ticks" cx="100" cy="100" r="95"/>
            <circle class="gauge-inner" cx="100" cy="100" r="62"/>
            <circle class="gauge-bg" cx="100" cy="100" r="80"></circle>
            <circle class="gauge-fill" cx="100" cy="100" r="80"></circle>
            <g class="gauge-marker"><circle cx="180" cy="100" r="5"/></g>
          </svg>
          <div class="gauge-value">—</div>
          <span class="gauge-caption">Talajnedvesség<small>Szenzormérés</small></span>
        </div>

        <p class="first-reading-hint" hidden>Első méréshez kapcsold be a tartót. Wi-Fi beállításához csatlakozz a <strong>Novenyfigyelo</strong> hálózathoz, és kövesd a megjelenő lépéseket.</p>

        <div class="device-facts">
          <p class="care-state" role="status"><span>Állapot a kiválasztott vízigény alapján</span><strong class="care-value">Mérésre vár</strong></p>
        </div>

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
          <span class="category-label"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><use href="#plant-herb"/></svg> Kiválasztott vízigény</span>
          <div class="plant-select">
            <span class="plant-select-value">Válassz kategóriát</span>
            <span class="plant-select-arrow">Módosítás <span aria-hidden="true">⌄</span></span>
          </div>
        </div>


        </div>
      `;

      const deleteBtn = card.querySelector(".deleteBtn");
      if (legacy) deleteBtn.style.display = "none";
      const plantSelect = card.querySelector(".plant-select");
      plantSelect.dataset.uid = uid;
      plantSelect.dataset.device = deviceId;
      const titleEl = card.querySelector(".plant-title");
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


      let currPercent;
      let currCat;
      let confirmedLedLevel = 0;
      const plantSelectValueEl = card.querySelector(".plant-select-value");
      const obj = { card, uid, deviceId, legacy, name: "Növényem", history: [], lastMeasurementAt: 0 };
      deviceCards.set(key, obj);

      function updateAccountGauge(realPercent, cat) {
        const range = plantCategories[cat];
        card.dataset.category = cat;
        const botanicalIcon = {'🌵Szárazkedvelő':'dry','🌾Mérsékelten száraz':'herb','🌿Kiegyensúlyozott vízigényű':'leaf','🌱Nedvességkedvelő':'tropical','💧Vízigényes':'water'}[cat] || 'leaf';
        card.querySelector('.plant-category-icon use').setAttribute('href', '#plant-' + botanicalIcon);
        if(realPercent === null || realPercent === '' || !Number.isFinite(Number(realPercent))) {
          card.dataset.level = 'unknown';
          card.classList.remove('needs-attention');
          gaugeValueEl.textContent = '—';
          card.querySelector('.care-value').textContent = 'Mérésre vár';
          gaugeCircleEl.style.strokeDashoffset = C;
          return;
        }
        realPercent = Math.max(0, Math.min(100, Number(realPercent)));
        const score = range ? Math.max(0,Math.min(100,Math.round((realPercent-range.min)/(range.max-range.min)*100))) : realPercent;
        const display = Math.round(realPercent);
        card.dataset.level = String(display);
        card.style.setProperty('--gauge-angle', (display * 3.6) + 'deg');
        const low = score < 35, high = score >= 95;
        card.dataset.condition = low ? 'low' : high ? 'high' : 'normal';
        card.querySelector('.care-value').textContent = low ? 'Alacsony talajnedvesség' : high ? 'Magas talajnedvesség' : 'Megfelelő';
        card.classList.toggle('needs-attention', low || high);
        card.style.setProperty('--water-top', (100-display) + '%');
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

        const color = getGradientColor(score);
        card.style.setProperty('--reading-color', low ? '#a54822' : high ? '#76531b' : '#275e37');
        gaugeCircleEl.style.stroke = color;
        gaugeValueEl.style.color = color;
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
        setSelectedDevice(deviceId);
      });

      // alapból legyen kiválasztva az első, ha még nincs
      if (!window.jelenlegiEszkozID) {
        window.jelenlegiUID = uid;
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
          await set(ref(db, `${base}/displayName`), newName);
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

      deleteBtn.addEventListener("click", async event => {
        event.stopPropagation();
        if (!await showConfirmModal("Elrejted ezt a virágtartót? Az aktiválókódjával később újra megjelenítheted.")) return;
        try {
          await set(ref(db, `${base}/hidden`), true);
        } catch {
          window.showAppToast("A virágtartó elrejtése megszakadt. Próbáld újra.", "Mentési hiba");
        }
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
      const ledLevelRef = ref(db, `${base}/ledLevel`);
      const ledToggle = card.querySelector(".led-toggle");
      slider.setAttribute("aria-label", "LED fényerő");
      function renderLedLevel(value) {
        const on = Number(value) > 0;
        card.querySelector(".led-output").textContent = value + "%";
        slider.style.setProperty("--slider-progress", value + "%");
        ledToggle.setAttribute("aria-pressed", String(on));
        card.querySelector(".led-state").textContent = on ? "Bekapcsolva" : "Kikapcsolva";
        sliderContainer.classList.toggle("is-on", on);
      }
      slider.addEventListener("input", () => renderLedLevel(slider.value));
      ledToggle.addEventListener("click", () => {
        if (slider.disabled) return;
        slider.value = Number(slider.value) > 0 ? "0" : (slider.dataset.lastOn || "50");
        renderLedLevel(slider.value);
        slider.dispatchEvent(new Event("change", { bubbles: true }));
      });
      slider.addEventListener("change", async event => {
        event.stopPropagation();
        const wanted = Number(slider.value);
        const previous = confirmedLedLevel;
        if (!navigator.onLine) {
          slider.value = String(previous);
          renderLedLevel(previous);
          window.showAppToast("A világítás állításához internetkapcsolat szükséges.", "Nincs internet");
          return;
        }
        slider.disabled = ledToggle.disabled = true;
        sliderContainer.setAttribute("aria-busy", "true");
        try {
          await set(ledLevelRef, wanted);
        } catch {
          slider.value = String(previous);
          renderLedLevel(previous);
          window.showAppToast("A fényerő mentése megszakadt. Próbáld újra.", "Mentési hiba");
        } finally {
          slider.disabled = ledToggle.disabled = false;
          sliderContainer.removeAttribute("aria-busy");
        }
      });

      obj.render = data => {
        obj.name = data.displayName || "Növényem";
        titleEl.textContent = obj.name;
        titleEl.title = obj.name;
        const category = Object.hasOwn(plantCategories, data.plantType) ? data.plantType : DEFAULT_CATEGORY;
        const reading = data.reading || {};
        const percent = Number.isFinite(reading.sensorValue) ? reading.sensorValue : null;
        if (currCat !== category || currPercent !== percent) {
          currCat = category;
          currPercent = percent;
          plantSelectValueEl.textContent = currCat.replace(/^[^\p{L}]+/u, "");
          updateAccountGauge(currPercent, currCat);
        }

        card.querySelector(".first-reading-hint").hidden = percent !== null;
        obj.lastMeasurementAt = Number(reading.lastMeasurementAt) || 0;
        obj.history = normalizeHistoryEntries(data.history);
        obj.lastUpdated = obj.history.at(-1)?.t || 0;
        updateLastMeasurementBadge(lastUpdateEl, obj.lastMeasurementAt);
        updateBatteryUI(reading);
        updateAirUI(data.airQuality || null);

        const hasLed = data.variant === "usb-led" || (legacy && data.ledLevel != null);
        sliderContainer.style.display = hasLed ? "flex" : "none";
        if (hasLed) {
          const level = Math.round((Number(data.ledLevel) || 0) / 10) * 10;
          if (String(level) !== slider.dataset.savedLevel) {
            confirmedLedLevel = level;
            slider.dataset.savedLevel = String(level);
            if (level > 0) slider.dataset.lastOn = String(level);
            slider.value = String(level);
            renderLedLevel(level);
          }
        }

        try {
          localStorage.setItem(cacheKeyFor(uid, deviceId), JSON.stringify({
            name: obj.name,
            category: currCat,
            sensorValue: currPercent,
            lastMeasurementAt: obj.lastMeasurementAt
          }));
        } catch {}
      };

      // kártya hozzáadás a DOM-hoz
      accountsContainer.appendChild(card);

      // alap kijelölés
      if (window.jelenlegiEszkozID === deviceId) card.classList.add("selected");
    }

    const authPanels = ["activationForm", "registerForm", "loginForm", "resetForm"];
    const activationInput = document.getElementById("activationCode");
    const additionalInput = document.getElementById("additionalCode");
    const registerEmail = document.getElementById("registerEmail");
    const resetEmail = document.getElementById("resetEmail");
    const devicesStatus = document.getElementById("devicesStatus");
    let pendingInvite;
    let stopDeviceListener;

    function showStatus(element, message = "", isError = false) {
      element.textContent = message;
      element.dataset.error = String(isError);
    }

    function showAuthPanel(id, focus = true) {
      for (const panel of authPanels) document.getElementById(panel).hidden = panel !== id;
      document.getElementById("showActivation").setAttribute("aria-pressed", String(id === "activationForm" || id === "registerForm"));
      document.getElementById("showLogin").setAttribute("aria-pressed", String(id === "loginForm" || id === "resetForm"));
      showStatus(statusDiv);
      if (focus) document.getElementById(id).querySelector("input")?.focus();
    }

    function renderDevices(uid, data) {
      for (const [key, item] of deviceCards) {
        const next = Object.hasOwn(data, item.deviceId) ? data[item.deviceId] : null;
        if (item.uid === uid && next && !next.hidden && item.legacy === (next.legacy === true)) continue;
        cancelAnimationFrame(item.card.querySelector(".gauge-value").__numberFrame);
        item.card.remove();
        deviceCards.delete(key);
        try { localStorage.removeItem(cacheKeyFor(item.uid, item.deviceId)); } catch {}
      }
      for (const [id, device] of Object.entries(data)) {
        if (device.hidden) {
          try { localStorage.removeItem(cacheKeyFor(uid, id)); } catch {}
          continue;
        }
        createDeviceCardForUser(uid, id, device.legacy === true);
        deviceCards.get(`${uid}|${id}`).render(device);
      }
      const visibleIds = [...deviceCards.values()].map(item => item.deviceId);
      if (!visibleIds.includes(window.jelenlegiEszkozID)) setSelectedDevice(visibleIds[0] || null);
      if (chartsModal.style.display === "flex") rebuildChartsModal();
    }

    function startSession(user) {
      stopDeviceListener?.();
      stopDeviceListener = null;
      devicesStatus.hidden = true;
      if (!user) {
        for (const item of deviceCards.values()) item.card.remove();
        deviceCards.clear();
        setSelectedDevice(null);
        try { localStorage.removeItem(OFFLINE_UID); } catch {}
        modal.style.display = "none";
        closeChartsModal();
        if (infoModal) infoModal.style.display = "none";
        document.getElementById("notifModal").style.display = "none";
        showLoginScreen();
        return;
      }
      hideLoginScreen();
      window.jelenlegiUID = user.uid;
      window.jelenlegiEmail = user.email;
      try { localStorage.setItem(OFFLINE_UID, user.uid); } catch {}
      let current = {};
      let legacy = {};
      const render = () => renderDevices(user.uid, { ...legacy, ...current });
      const stopCurrent = onValue(ref(db, devicePath(user.uid)), snapshot => {
        devicesStatus.hidden = true;
        current = snapshot.val() || {};
        render();
      }, () => {
        devicesStatus.textContent = "A virágtartók adatai most nem érhetők el. Próbáld újra az oldal frissítésével.";
        devicesStatus.hidden = false;
      });
      const stopLegacy = onValue(ref(db, legacyPath(user.uid)), snapshot => {
        legacy = legacyDevices(snapshot.val());
        render();
      }, () => {
        legacy = {};
        render();
      });
      stopDeviceListener = () => {
        stopCurrent();
        stopLegacy();
      };
    }

    onAuthStateChanged(auth, user => {
      startSession(user);
      window.dispatchEvent(new CustomEvent("app-content-ready"));
    });

    function wireForm(form, status, action, errorMessage) {
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const button = form.querySelector("button[type=submit]");
        if (button.disabled) return;
        button.disabled = true;
        showStatus(status, "Egy pillanat…");
        try {
          await action();
        } catch (error) {
          showStatus(status, errorMessage(error), true);
        } finally {
          button.disabled = false;
        }
      });
    }

    function authError(error) {
      if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error.code)) return "Hibás e-mail-cím vagy jelszó.";
      if (error.code === "auth/invalid-email") return "Ellenőrizd az e-mail-címet.";
      if (error.code === "auth/weak-password" || error.code === "auth/password-does-not-meet-requirements") return "Válassz hosszabb, erősebb jelszót.";
      if (error.code === "auth/too-many-requests") return "Túl sok próbálkozás. Próbáld újra később.";
      return "A fiókművelet megszakadt. Ellenőrizd a kapcsolatot, majd próbáld újra.";
    }

    function openDeviceModal(code = "", message = "") {
      showStatus(addAccountStatus, message, Boolean(message));
      additionalInput.value = code;
      modal.style.display = "flex";
      document.body.classList.remove("menu-open");
      additionalInput.focus();
    }

    async function finishPairing(user) {
      if (!pendingInvite) return;
      try {
        await claimActivation(db, user.uid, pendingInvite);
        window.showAppToast("A virágtartó megjelent a növényeid között.", "Sikeres párosítás");
      } catch (error) {
        openDeviceModal(activationInput.value, activationMessage(error));
        return;
      } finally {
        pendingInvite = null;
      }
      activationInput.value = "";
    }

    document.getElementById("showActivation").onclick = () => {
      pendingInvite = null;
      showAuthPanel("activationForm");
    };
    document.getElementById("showLogin").onclick = () => showAuthPanel("loginForm");
    document.getElementById("registerExisting").onclick = () => {
      emailInput.value = registerEmail.value;
      showAuthPanel("loginForm");
    };
    document.getElementById("showReset").onclick = () => {
      resetEmail.value = emailInput.value;
      showAuthPanel("resetForm");
    };
    document.getElementById("resetBack").onclick = () => {
      emailInput.value = resetEmail.value;
      showAuthPanel("loginForm");
    };

    wireForm(document.getElementById("activationForm"), statusDiv, async () => {
      pendingInvite = await inspectActivation(db, activationInput.value);
      showAuthPanel("registerForm");
    }, activationMessage);

    wireForm(document.getElementById("registerForm"), statusDiv, async () => {
      if (!pendingInvite) {
        showAuthPanel("activationForm");
        return;
      }
      try {
        const password = document.getElementById("registerPassword");
        const { user } = await createUserWithEmailAndPassword(auth, registerEmail.value.trim(), password.value);
        password.value = "";
        await finishPairing(user);
      } catch (error) {
        if (error.code !== "auth/email-already-in-use") throw error;
        emailInput.value = registerEmail.value;
        showAuthPanel("loginForm");
        showStatus(statusDiv, "Ehhez az e-mail-címhez már tartozik fiók. Lépj be a virágtartó hozzáadásához.");
      }
    }, authError);

    wireForm(loginForm, statusDiv, async () => {
      const { user } = await signInWithEmailAndPassword(auth, emailInput.value.trim(), passInput.value);
      passInput.value = "";
      showStatus(statusDiv);
      await finishPairing(user);
    }, authError);

    wireForm(document.getElementById("resetForm"), statusDiv, async () => {
      try {
        await sendPasswordResetEmail(auth, resetEmail.value.trim());
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }
      showStatus(statusDiv, "Ha ehhez az e-mail-címhez tartozik fiók, hamarosan megérkezik a jelszó-visszaállító link.");
    }, authError);

    addAccountBtn.onclick = () => openDeviceModal();
    document.getElementById("emptyAddDevice").onclick = () => openDeviceModal();
    modalCloseBtn.onclick = () => { modal.style.display = "none"; };
    modal.addEventListener("click", event => {
      if (event.target === modal) modal.style.display = "none";
    });
    wireForm(addNewAccountForm, addAccountStatus, async () => {
      const user = auth.currentUser;
      if (!user) return;
      const invite = await inspectActivation(db, additionalInput.value);
      await claimActivation(db, user.uid, invite);
      modal.style.display = "none";
      showStatus(addAccountStatus);
      window.showAppToast("A virágtartó megjelent a növényeid között.", "Sikeres párosítás");
    }, activationMessage);

    infoBtn.addEventListener("click", () => {
      infoModal.style.display = "flex";
      document.body.classList.remove("menu-open");
    });
    infoModalClose.addEventListener("click", () => { infoModal.style.display = "none"; });
    infoModal.addEventListener("click", event => {
      if (event.target === infoModal) infoModal.style.display = "none";
    });

    logoutBtn.style.display = "none";
    logoutBtn.addEventListener("click", async () => {
      const uid = auth.currentUser?.uid;
      try {
        await window.__detachPushForSession?.().catch(() => {});
        await signOut(auth);
        pendingInvite = null;
        try {
          for (const key of Object.keys(localStorage)) {
            if (uid && key.startsWith(`noveny-v2-plant_${uid}_`)) localStorage.removeItem(key);
          }
        } catch {}
        showAuthPanel("loginForm", false);
      } catch {
        window.showAppToast("A kijelentkezés megszakadt. Próbáld újra.", "Kapcsolati hiba");
      }
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
