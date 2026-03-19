import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
    import { getDatabase, ref, onValue, set, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
    const menuBtn = document.getElementById("menuBtn");
    const chartsModal = document.getElementById("chartsModal");
    const chartsModalClose = document.getElementById("chartsModalClose");

    const chartsWrap = document.getElementById("chartsWrap");

    const FLOATING_BUTTONS = [menuBtn, paymentBtn, chartsBtn, document.getElementById("notifBellBtn"), addAccountBtn];

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

    function normalizePlan(value) {
      return String(value || "free").toLowerCase() === "plus" ? "plus" : "free";
    }

    function getAllowedCategoriesForPlan(plan) {
      return normalizePlan(plan) === "plus"
        ? [...PLUS_PLAN_CATEGORIES]
        : [...FREE_PLAN_CATEGORIES];
    }

    window.__getAllowedCategoriesForUid = function(uid) {
      const entry = userPlanCache.get(uid) || {};
      return getAllowedCategoriesForPlan(entry.plan);
    };

    window.__isPlusForUid = function(uid) {
      const entry = userPlanCache.get(uid) || {};
      return normalizePlan(entry.plan) === "plus";
    };

    function getPlanBadgeText(uid) {
      return window.__isPlusForUid(uid) ? "PLUS" : "FREE";
    }

    function getPlanBadgeClass(uid) {
      return window.__isPlusForUid(uid) ? "plus" : "free";
    }

    function emitPlanRefresh() {
      window.dispatchEvent(new CustomEvent("subscription-plan-updated"));
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

    function listenToUserSubscription(uid, emailValue = "") {
      const subRef = ref(db, `users/${uid}/subscription`);
      onValue(subRef, (snap) => {
        const data = snap.exists() ? (snap.val() || {}) : {};
        const normalized = {
          plan: normalizePlan(data.plan),
          expiresAt: Number(data.expiresAt || 0),
          status: String(data.status || "inactive"),
          email: data.email || emailValue || "",
          updatedAt: Number(data.updatedAt || 0)
        };
        userPlanCache.set(uid, normalized);
        emitPlanRefresh();
      });
    }

    function getGradientColor(value) {
      let r, g, b;
      if (value <= 50) {
        const ratio = value / 50;
        r = 255;
        g = Math.round(69 + (215 - 69) * ratio);
        b = 0;
      } else {
        const ratio = (value - 50) / 50;
        r = Math.round(255 + (76 - 255) * ratio);
        g = Math.round(215 + (175 - 215) * ratio);
        b = Math.round(0 + (80 - 0) * ratio);
      }
      return `rgb(${r},${g},${b})`;
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
      loginForm.style.display = "none";
      statusDiv.style.display = "none";
      logoutBtn.style.display = "none";
      plantDataCard.style.display = "none";
      accountsContainer.style.display = "block";
      addAccountBtn.style.display = "flex";
      chartsBtn.style.display = "flex";
      setFloatingMenuVisibility(true);
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

      // 🔹 csak az utolsó 5 nap maradjon (max ~10 adat)
      const fiveDaysAgo = now.getTime() - 5 * 24 * 60 * 60 * 1000;
      obj.history = obj.history.filter(p => p.t >= fiveDaysAgo);

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

    const data = history.slice(-7);
    const barCount = data.length;
    const MAX_BARS = 7; // mindig 7 oszlopnyi helyet számolunk
    const visualCount = Math.max(data.length, MAX_BARS); 


    const paddingTop = 22;
    const paddingBottom = 28;
    const paddingX = 18;
    const gap = 16;

    const usableHeight = h - paddingTop - paddingBottom;
    const barWidth = (w - paddingX * 2 - gap * (MAX_BARS - 1)) / MAX_BARS;


    let animProgress = 0;

    function animate() {
      ctx.clearRect(0, 0, w, h);

      animProgress += 0.015;
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

        // százalék SZÍNE a sáv színe
        ctx.fillStyle = color;
        ctx.font = "900 16px Roboto";
        ctx.textAlign = "center";
        ctx.fillText(`${value}%`, x + barWidth / 2, h - 8);
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
          return window.__isPlusForUid(uid);
        })
        .map(([key, obj]) => ({ key, ...obj }));
      items.sort((a,b)=> (b.lastUpdated||0) - (a.lastUpdated||0));

      for (const item of items) {
        const chartCard = document.createElement("div");
        chartCard.className = "chart-card";

        const title = document.createElement("div");
        title.className = "chart-title";

        const left = document.createElement("div");
        left.textContent = item.name || "Növény";

        const right = document.createElement("small");
        right.textContent = item.lastUpdated ? new Date(item.lastUpdated).toLocaleTimeString() : "";

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
      const activeUid = window.jelenlegiUID;
      if (activeUid && !window.__isPlusForUid(activeUid)) {
        alert("A grafikon csak Plus csomagban érhető el.");
        return;
      }

      const eligibleItems = Array.from(deviceCards.entries()).filter(([key]) => {
        const uid = key.split("|")[0];
        return window.__isPlusForUid(uid);
      });

      if (eligibleItems.length === 0) {
        alert("Jelenleg nincs Plus csomagos fiók a grafikonokhoz.");
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
    function createDeviceCardForUser(uid, email, deviceId) {
      const key = uid + "|" + deviceId;

      // már létezik → ne duplázzuk
      if (deviceCards.has(key)) return;

      const plantTypes = window.__getAllowedCategoriesForUid(uid);

      const selectId = `plantTypeSelect-${uid}-${deviceId}`;

      const card = document.createElement("div");
      card.className = "card";
      // 🔹 belépő animáció késleltetés (stagger)
      const index = accountsContainer.children.length;
      card.style.animationDelay = `${index * 0.25}s`;


      card.innerHTML = `
        <button class="deleteBtn" aria-label="Fiók törlése">✖</button>
        <div class="plan-badge-wrap">
          <div class="plan-badge ${getPlanBadgeClass(uid)}" data-plan-badge>${getPlanBadgeText(uid)}</div>
          <div class="battery-box">
            <img class="battery-icon" src="batteryPercent/battery_100.png" alt="akku">
          </div>
        </div>

        <div class="title-row">
          <div class="plant-title-pill">
            <span class="plant-title">Rosso</span>
            <button class="edit-pill" aria-label="Név szerkesztése">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
        </div>


        <div class="name-edit-wrap">
          <input type="text" class="name-input" maxlength="50" placeholder="Növény neve...">
          <button class="icon-btn ok-btn" type="button" aria-label="Mentés"><i class="fa-solid fa-check"></i></button>
          <button class="icon-btn cancel-btn" type="button" aria-label="Mégse"><i class="fa-solid fa-xmark"></i></button>
        </div>


        <div class="gauge-container">
          <svg class="gauge-svg" width="200" height="200" viewBox="0 0 200 200">
            <circle class="gauge-bg" cx="100" cy="100" r="80"></circle>
            <circle class="gauge-fill" cx="100" cy="100" r="80"></circle>
          </svg>
          <div class="gauge-value">0%</div>
        </div>

        <div class="slider-container" style="display:none;">
          <input type="range" min="0" max="100" step="10" value="0" class="led-slider" list="led-steps" />
          <div class="slider-labels"><span>Fény erő</span></div>
        </div>

        <div style="margin-top:16px; position:relative; z-index:2;">
          <div class="plant-select" data-uid="${uid}" data-device="${deviceId}">
            <span class="plant-select-value">Válassz kategóriát</span>
            <span class="plant-select-arrow">▾</span>
          </div>
        </div>


        </div>
      `;

      const deleteBtn = card.querySelector(".deleteBtn");
      const titleEl = card.querySelector(".plant-title");
      const planBadgeEl = card.querySelector("[data-plan-badge]");

      const editBtn = card.querySelector(".edit-pill");
      const editWrap = card.querySelector(".name-edit-wrap");
      const nameInput = card.querySelector(".name-input");
      const okBtn = card.querySelector(".ok-btn");
      const cancelBtn = card.querySelector(".cancel-btn");

      const gaugeValueEl = card.querySelector(".gauge-value");
      const gaugeCircleEl = card.querySelector(".gauge-fill");
      const sliderContainer = card.querySelector(".slider-container");
      const slider = card.querySelector(".led-slider");

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
          plantSelectValueEl.textContent = currCat;
          updateAccountGauge(currPercent, currCat);
          window.__set(ref(db, `users/${uid}/devices/${deviceId}/plantType`), currCat)
            .catch((err) => console.warn("plantType fallback hiba:", err));
        }
      }

      onValue(plantTypeRef, (snap) => {
        const v = snap.exists() ? String(snap.val() || "") : "";
        if (v) {
          currCat = v;
          plantSelectValueEl.textContent = v;
          refreshPlanBadgeAndRestrictions();
          updateAccountGauge(currPercent, currCat);
        } else {
          currCat = getFallbackCategoryForUid();
          plantSelectValueEl.textContent = currCat;
          updateAccountGauge(currPercent, currCat);
        }
      });

      window.addEventListener("subscription-plan-updated", () => {
        refreshPlanBadgeAndRestrictions();
      });


      function updateAccountGauge(realPercent, cat) {
        // visszaadjuk a kijelzett %-ot is

        let display = realPercent;

        if (plantCategories[cat]) {
          const { min, max } = plantCategories[cat];

          if (realPercent < min) display = 0;
          else if (realPercent > max) display = 100;
          else {
            display = Math.round(((realPercent - min) / (max - min)) * 100);
          }
        }

        gaugeValueEl.textContent = display + "%";
        const offset = C - (display / 100) * C;
        gaugeCircleEl.style.strokeDashoffset = offset;

        const color = getGradientColor(display);
        gaugeCircleEl.style.stroke = color;
        gaugeValueEl.style.color = color;
        return display;
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

      okBtn.addEventListener("click", async (e)=> {
        e.stopPropagation();
        const newName = nameInput.value.trim();
        if (!newName) { closeEdit(); return; }
        titleEl.textContent = newName;
        titleEl.title = newName;
        
        closeEdit();
        await set(ref(db, `users/${uid}/devices/${deviceId}/displayName`), newName);
      });

      nameInput.addEventListener("keydown", async (e)=> {
        if (e.key === "Escape") { closeEdit(); }
        if (e.key === "Enter") {
          const newName = nameInput.value.trim();
          if (!newName) { closeEdit(); return; }
          titleEl.textContent = newName;
          titleEl.title = newName;
          
          closeEdit();
          await set(ref(db, `users/${uid}/devices/${deviceId}/displayName`), newName);
        }
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
      onValue(displayNameRef, (snap) => {
        const v = snap.exists() ? String(snap.val() || "").trim() : "";
        const name = v || email;
        titleEl.textContent = name;
        titleEl.title = name;
        
        // sync a charts névhez is
        const obj = deviceCards.get(key);
        if (obj) obj.name = v ? v : name;
      });

      

     // Firebase: soil sensor + EMAIL riasztás
    const soilRef = ref(db, `users/${uid}/devices/${deviceId}/sensorValue`);
          onValue(soilRef, async (snap) => {
            if (!snap.exists()) return;

            const v = Number(snap.val());
            if (!Number.isFinite(v)) return;

            currPercent = v;
            const displayPct = updateAccountGauge(currPercent, currCat);
            // 💾 OFFLINE CACHE MENTÉS
            try {
              const cacheKey = `plant_${uid}_${deviceId}`;

              const cacheData = {
                sensorValue: currPercent,
                displayValue: displayPct,
                category: currCat || "",
                name: titleEl.textContent || "",
                history: (deviceCards.get(uid + "|" + deviceId)?.history) || [],
                lastUpdated: Date.now()
              };

              localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            } catch (e) {
              console.warn("Offline cache mentési hiba:", e);
            }


            const historyRef = ref(db, `users/${uid}/devices/${deviceId}/history`);

    if (window.__isPlusForUid(uid)) {
      const snapHist = await get(historyRef);

      let entries = [];
      if (snapHist.exists()) {
        entries = Object.entries(snapHist.val())
          .map(([t, val]) => ({ t: Number(t), v: Number(val) }))
          .filter(p => Number.isFinite(p.v))
          .sort((a, b) => a.t - b.t);
      }

      entries.push({ t: Date.now(), v: displayPct });
      entries = entries.slice(-7);

      const newHistory = {};
      for (const e of entries) {
        newHistory[e.t] = e.v;
      }

      await set(historyRef, newHistory);

      const obj = deviceCards.get(uid + "|" + deviceId);
      if (obj) {
        obj.history = entries;
        obj.lastUpdated = entries.at(-1)?.t || Date.now();
      }
    } else {
      const obj = deviceCards.get(uid + "|" + deviceId);
      if (obj) {
        obj.history = [];
        obj.lastUpdated = 0;
      }
    }


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
// Firebase: LED (csak ha van)
      const ledLevelRef = ref(db, `users/${uid}/devices/${deviceId}/ledLevel`);
      get(ledLevelRef).then((snap) => {
        if (snap.exists()) {
          sliderContainer.style.display = "block";
          slider.value = Math.round((Number(snap.val()) || 0) / 10) * 10;
          onValue(ledLevelRef, (s2) => {
            if (s2.exists()) slider.value = Math.round((Number(s2.val()) || 0) / 10) * 10;
          });
          slider.addEventListener("input", async (e)=> {
            e.stopPropagation();
            const snapped = Math.max(0, Math.min(100, Math.round((Number(e.target.value) || 0) / 10) * 10));
            e.target.value = snapped;
            await set(ledLevelRef, snapped);
          });
        } else {
          sliderContainer.style.display = "none";
        }
      });

      // Firebase: battery (csak ha van)
      const batteryRef = ref(db, `users/${uid}/devices/${deviceId}/batteryPercent`);
      get(batteryRef).then((snap) => {
        if (!snap.exists()) {
          batteryBox.style.display = "none";
          return;
        }
        batteryBox.style.display = "block";
        onValue(batteryRef, (s2)=> {
          if (!s2.exists()) { batteryBox.style.display = "none"; return; }
          batteryBox.style.display = "block";
          const p = Number(s2.val());
          let icon = "battery_0.png";
          if (p >= 80) icon = "battery_100.png";
          else if (p >= 60) icon = "battery_75.png";
          else if (p >= 40) icon = "battery_50.png";
          else if (p >= 20) icon = "battery_25.png";
          batteryImg.src = `batteryPercent/${icon}`;
        });
      });

      // 🔹 HISTORY betöltése Firebase-ből (grafikonhoz) – csak Plusnál
      if (window.__isPlusForUid(uid)) {
        const historyRef = ref(db, `users/${uid}/devices/${deviceId}/history`);
        get(historyRef).then(snap => {
          if (!snap.exists()) return;

          const obj = deviceCards.get(key);
          if (!obj) return;

          const entries = Object.entries(snap.val())
            .map(([t, v]) => ({ t: Number(t), v: Number(v) }))
            .filter(p => Number.isFinite(p.v))
            .sort((a,b) => a.t - b.t)
            .slice(-7);

          obj.history = entries;
          obj.lastUpdated = entries.at(-1)?.t || 0;
        });
      }


      // tároljuk
      deviceCards.set(key, {
        card,
        uid,
        deviceId,
        name: email,
        history: [],
        lastUpdated: 0
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
            plantSelectValueEl.textContent = data.category;
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
              obj.lastUpdated = data.lastUpdated || Date.now();
            }
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
      // töröljük localstorage-ból
      removeStoredAccount(uid);

      // DOM + map törlés
      for (const [key, obj] of Array.from(deviceCards.entries())) {
        if (key.startsWith(uid + "|")) {
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
      if (!userPlanCache.has(uid)) {
        listenToUserSubscription(uid, emailLabel || "");
      }

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
      const stored = getStoredAccounts();
      if (stored.length > 0) {
        hideLoginScreen();
        for (const acc of stored) {
          await addAccountByUid(acc.uid, acc.email || "Fiók");
        }
      } else {
        showLoginScreen();
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

    modalCloseBtn.addEventListener("click", () => { modal.style.display = "none"; });
    window.addEventListener("click", (e)=>{ if (e.target === modal) modal.style.display = "none"; });

    addNewAccountForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = newAccountEmail.value.trim();
      const pass  = newAccountPass.value.trim();

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
