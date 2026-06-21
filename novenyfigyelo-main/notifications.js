// ====== BEÁLLÍTÁSOK ======
    const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz5CwDKgK8jH2e6991Kn1HGC50ftuyT8J-KK04qHF6hxZkxisvzhLXKswEHC7Jl8E3B/exec";
    const EMAIL_THRESHOLD = 35; // kijelzett % küszöb
    const DEFAULT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 óra / növény

    // Firebase elérés a module scriptből
    function fb() {
      return {
        db: window.__db,
        ref: window.__ref,
        get: window.__get,
        set: window.__set,
        update: window.__update
      };
    }

    // ====== UI (harang) ======
    let notifState = new Map(); // key -> { uid, deviceId, name, enabled }

    function makeKey(uid, deviceId) { return `${uid}|${deviceId}`; }

    async function loadEnabled(uid, deviceId) {
      const { db, ref, get } = fb();
      const base = `users/${uid}/devices/${deviceId}`;
      const enSnap = await get(ref(db, `${base}/emailNotifEnabled`));
      return enSnap.exists() ? !!enSnap.val() : false;
    }

    async function loadNotifEmail(uid, deviceId) {
      const { db, ref, get } = fb();
      const base = `users/${uid}/devices/${deviceId}`;
      const emSnap = await get(ref(db, `${base}/emailNotifEmail`));
      return emSnap.exists() ? String(emSnap.val() || "").trim() : "";
    }

    async function clearNotifEmail(uid, deviceId) {
      const { db, ref, update } = fb();
      const base = `users/${uid}/devices/${deviceId}`;
      await update(ref(db, base), {
        emailNotifEmail: "",
        emailNotifEnabled: false
      });
    }

    async function setEnabled(uid, deviceId, enabled, email) {
      const { db, ref, update } = fb();
      const base = `users/${uid}/devices/${deviceId}`;
      await update(ref(db, base), {
        emailNotifEnabled: !!enabled,
        emailNotifEmail: String(email || ""),
        emailNotifCooldownMs: DEFAULT_COOLDOWN_MS
      });
    }

    function updateBellUI() {
      const bellBtn = document.getElementById("notifBellBtn");
      if (!bellBtn) return;
      const anyEnabled = Array.from(notifState.values()).some(v => v.enabled);
      bellBtn.classList.toggle("inactive", !anyEnabled);
    }

    
    function buildNotifList() {
      const list = document.getElementById("notifDeviceList");
      if (!list) return;

      list.innerHTML = "";
      list.className = "notif-list";

      const items = Array.from(notifState.values());

      if (items.length === 0) {
        list.innerHTML = '<div style="opacity:.7;">Nincs betöltött növény.</div>';
        return;
      }

      for (const item of items) {
        const row = document.createElement("div");
        row.className = "notif-item";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "notif-checkbox";
        cb.checked = !!item.enabled;

        cb.addEventListener("change", () => {
          item.enabled = cb.checked;
          updateBellUI();
        });

        const text = document.createElement("div");
        text.className = "notif-text";

        const name = document.createElement("div");
        name.className = "notif-name";
        name.textContent = item.name || "Növény";

        const emailRow = document.createElement("div");
        emailRow.className = "notif-email-row";

        const email = document.createElement("div");
        email.className = "notif-email";
        email.textContent = item.email || "Nincs megadott email cím";

        if (!item.email) email.classList.add("empty");

        emailRow.appendChild(email);

        if (item.email) {
          const del = document.createElement("button");
          del.className = "notif-email-delete";
          del.textContent = "✕";

          del.addEventListener("click", async (e) => {
            e.stopPropagation();
            await clearNotifEmail(item.uid, item.deviceId);
            item.email = "";
            item.enabled = false;
            cb.checked = false;
            buildNotifList();
            updateBellUI();
          });

          emailRow.appendChild(del);
        }

        text.appendChild(name);
        text.appendChild(emailRow);

        row.appendChild(cb);
        row.appendChild(text);

        list.appendChild(row);
      }
    }



    
    async function refreshNotifStateFromFirebase() {
      // deviceCards Map: key = uid|deviceId -> { card, name, ... }
      if (!window.__deviceCardsMap) return;

      const entries = Array.from(window.__deviceCardsMap.entries());
      notifState = new Map();

      for (const [key, obj] of entries) {
        const [uid, deviceId] = key.split("|");
        const enabled = await loadEnabled(uid, deviceId);
        const email = await loadNotifEmail(uid, deviceId);
        notifState.set(key, { uid, deviceId, name: obj.name || "", enabled, email });
      }

      buildNotifList();
      updateBellUI();
    }


    function openNotifModal() {
      const m = document.getElementById("notifModal");
      if (m) m.style.display = "flex";
    }
    function closeNotifModal() {
      const m = document.getElementById("notifModal");
      if (m) m.style.display = "none";
    }

    window.addEventListener("DOMContentLoaded", () => {
      const bellBtn = document.getElementById("notifBellBtn");
      const closeBtn = document.getElementById("notifModalClose");
      const saveBtn = document.getElementById("notifSave");
      const cancelBtn = document.getElementById("notifCancel");
      const modal = document.getElementById("notifModal");

      // Menü gomb: a jobb alsó lebegő gombok (grafikon/harang/+ ) animáltan nyílnak ki
      const menuBtn = document.getElementById("menuBtn");
      const addBtn = document.getElementById("addAccountBtn");
      const bell = document.getElementById("notifBellBtn");
      const charts = document.getElementById("chartsBtn");
      const paymentBtn = document.getElementById("paymentBtn");

      function setMenuOpen(open) {
        document.body.classList.toggle("menu-open", !!open);
        if (menuBtn) {
          menuBtn.innerHTML = open ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
        }
      }

      if (menuBtn) {
        setMenuOpen(false);
        menuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const open = !document.body.classList.contains("menu-open");
          setMenuOpen(open);
        });

        // ha rányomsz egy gombra, csukjuk vissza a menüt
        [addBtn, bell, charts, paymentBtn].forEach(btn => {
          if (!btn) return;
          btn.addEventListener("click", () => setMenuOpen(false));
        });
      }


      if (paymentBtn) {
        paymentBtn.addEventListener("click", () => {
          window.location.href = "payment.html";
        });
      }

      if (bellBtn) {
        bellBtn.addEventListener("click", async () => {
          const activeUid = window.jelenlegiUID;
          if (window.__isPlusForUid && activeUid && !window.__isPlusForUid(activeUid)) {
            alert("Az email értesítés csak Plus csomagban érhető el.");
            return;
          }

          await refreshNotifStateFromFirebase();
          openNotifModal();
        });
      }

      if (closeBtn) closeBtn.addEventListener("click", closeNotifModal);
      if (cancelBtn) cancelBtn.addEventListener("click", closeNotifModal);
      if (modal) window.addEventListener("click", (e) => { if (e.target === modal) closeNotifModal(); });

      
      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
          const typedEmail = (document.getElementById("notifEmailInput") && document.getElementById("notifEmailInput").value.trim()) || "";

          // Mentés logika:
          // - A checkbox (enabled) állapotot MINDEN növénynél mentjük
          // - Az EMAIL CÍMET CSAK a kipipált (enabled=true) növényekhez írjuk be, HA a mező nincs üresen.
          const { db, ref, update } = fb();

          for (const item of notifState.values()) {
            const base = `users/${item.uid}/devices/${item.deviceId}`;

            const payload = {
              emailNotifEnabled: !!item.enabled,
              emailNotifCooldownMs: DEFAULT_COOLDOWN_MS
            };

            if (item.enabled && typedEmail) {
              payload.emailNotifEmail = typedEmail;
            }

            // ha kikapcsolja, nem töröljük automatikusan az emailt, csak tiltjuk
            await update(ref(db, base), payload);
          }

          // frissítjük az állapotot (emailekkel együtt), hogy a listában rögtön látszódjon
          await refreshNotifStateFromFirebase();

          closeNotifModal();
          updateBellUI();
          alert("Mentve! Email értesítések beállítva.");
        });
      }

    });

    // ====== EMAIL küldés (automatán, szenzor frissítéskor) ======
    async function sendEmailViaAppsScript(payload) {
      if (!GOOGLE_APPS_SCRIPT_URL) return;
      try {
        await fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.warn("Apps Script email hiba:", e);
      }
    }

    // ===== AUTO EMAIL CHECK (5 percenként) =====
    setInterval(async () => {
      if (!window.__deviceCardsMap) return;

      for (const [key, obj] of window.__deviceCardsMap.entries()) {
        const [uid, deviceId] = key.split("|");

        try {
          const { db, ref, get } = window.__db
            ? { db: window.__db, ref: window.__ref, get: window.__get }
            : {};

          if (!db) return;

          const base = `users/${uid}/devices/${deviceId}`;

          const snapVal = await get(ref(db, `${base}/sensorValue`));
          if (!snapVal.exists()) continue;

          const value = Number(snapVal.val());
          if (!Number.isFinite(value)) continue;

          if (window.__isPlusForUid && !window.__isPlusForUid(uid)) continue;

          const enabledSnap = await get(ref(db, `${base}/emailNotifEnabled`));
          if (!enabledSnap.exists() || !enabledSnap.val()) continue;

          const emailSnap = await get(ref(db, `${base}/emailNotifEmail`));
          if (!emailSnap.exists()) continue;

          const cooldownSnap = await get(ref(db, `${base}/lastEmailSentAt`));
          const lastSent = cooldownSnap.exists() ? Number(cooldownSnap.val()) : 0;

          const now = Date.now();
          const cooldown = 6 * 60 * 60 * 1000; // 6 óra

          if (now - lastSent < cooldown) continue;

          if (value > 35) continue; // NEM száraz → nincs email

          // mentjük hogy elküldtük
          await window.__set(
            window.__ref(db, `${base}/lastEmailSentAt`),
            now
          );

          // EMAIL küldés
          await fetch("https://script.google.com/macros/s/AKfycbz5CwDKgK8jH2e6991Kn1HGC50ftuyT8J-KK04qHF6hxZkxisvzhLXKswEHC7Jl8E3B/exec", {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: emailSnap.val(),
              moisture: value,
              deviceId
            })
          });

          console.log("📧 Email elküldve:", deviceId);

        } catch (err) {
          console.warn("Email check error:", err);
        }
      }
    }, 5 * 60 * 1000); // 5 perc


    // Ezt hívjuk minden szenzor frissítésnél
    window.__maybeEmailNotify = async function({
      uid,
      deviceId,
      realPct,
      displayPct,
      plantType,
      displayName
    }) {

      try {
        if (!uid || !deviceId) return;
        if (window.__isPlusForUid && !window.__isPlusForUid(uid)) return;
        if (!Number.isFinite(realPct)) return;
        if (realPct > EMAIL_THRESHOLD) return;

        const { db, ref, get, set } = fb();
        const base = `users/${uid}/devices/${deviceId}`;

        const enSnap = await get(ref(db, `${base}/emailNotifEnabled`));
        const enabled = enSnap.exists() ? !!enSnap.val() : false;
        if (!enabled) return;

        const emailSnap = await get(ref(db, `${base}/emailNotifEmail`));
        const email = emailSnap.exists() ? String(emailSnap.val() || "") : "";
        if (!email) return;

        const cdSnap = await get(ref(db, `${base}/emailNotifCooldownMs`));
        const cooldownMs = cdSnap.exists() ? Number(cdSnap.val()) : DEFAULT_COOLDOWN_MS;

        const lastSnap = await get(ref(db, `${base}/lastEmailSentAt`));
        const lastAt = lastSnap.exists() ? Number(lastSnap.val()) : 0;

        const now = Date.now();
        if (now - lastAt < cooldownMs) return;

        // spam védelem: előbb rögzítjük
        await set(ref(db, `${base}/lastEmailSentAt`), now);

        await sendEmailViaAppsScript({
          uid,
          email,
          deviceId,
          moisture: displayPct,
          category: plantType || "",
          plantName: displayName || ""
        });
      } catch (e) {
        console.warn("maybeEmailNotify hiba:", e);
      }
    };
