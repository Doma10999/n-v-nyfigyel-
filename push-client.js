(() => {
  "use strict";

  const WORKER_BASE =
    "https://novenyfigyelo-push.drobnidominik.workers.dev";

  const UI_ID = "webPushSettingsBox";
  const ENABLE_ID = "webPushEnableBtn";
  const DISABLE_ID = "webPushDisableBtn";
  const STATUS_ID = "webPushStatusText";

  let refreshBusy = false;
  let registrationPromise = null;
  let vapidPublicKeyPromise = null;


  /* =====================================================
     SEGÉDFÜGGVÉNYEK
     ===================================================== */

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }


  function isIOS() {
    return (
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (
        navigator.platform === "MacIntel" &&
        navigator.maxTouchPoints > 1
      )
    );
  }


  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }


  function detectPlatform() {
    if (isIOS()) {
      return isStandalone()
        ? "ios-pwa"
        : "ios-browser";
    }

    if (/Android/i.test(navigator.userAgent)) {
      return isStandalone()
        ? "android-pwa"
        : "android-web";
    }

    return "web";
  }


  function getBasicPushErrorCode() {
    if (!window.isSecureContext) {
      return "secure_context_required";
    }

    if (!("serviceWorker" in navigator)) {
      return "service_worker_not_supported";
    }

    if (!("Notification" in window)) {
      return "push_not_supported";
    }

    return "";
  }


  function pushSupported() {
    return !getBasicPushErrorCode();
  }


  function errorWithCode(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }


  function withTimeout(
    promise,
    timeoutMs,
    code
  ) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(errorWithCode(code)),
        timeoutMs
      );

      Promise.resolve(promise).then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        }
      );
    });
  }


  /* =====================================================
     UI
     ===================================================== */

  function setStatus(text, tone = "neutral") {
    const el =
      document.getElementById(STATUS_ID);

    if (!el) return;

    el.textContent = text;

    if (tone === "ok") {
      el.style.color = "#1b5e20";
    } else if (tone === "error") {
      el.style.color = "#b71c1c";
    } else if (tone === "warn") {
      el.style.color = "#8a5a00";
    } else {
      el.style.color = "#52615a";
    }
  }


  function setButtons({
    enable = false,
    disable = false,
    busy = false
  } = {}) {

    const enableBtn =
      document.getElementById(ENABLE_ID);

    const disableBtn =
      document.getElementById(DISABLE_ID);

    if (enableBtn) {
      enableBtn.style.display =
        enable ? "inline-flex" : "none";

      enableBtn.disabled = busy;
      enableBtn.style.opacity =
        busy ? ".65" : "1";
    }

    if (disableBtn) {
      disableBtn.style.display =
        disable ? "inline-flex" : "none";

      disableBtn.disabled = busy;
      disableBtn.style.opacity =
        busy ? ".65" : "1";
    }
  }


  function createUi() {
    if (document.getElementById(UI_ID)) {
      return;
    }

    const modalContent =
      document.getElementById(
        "notifModalContent"
      );

    if (!modalContent) {
      return;
    }

    const box =
      document.createElement("div");

    box.id = UI_ID;

    box.style.cssText = [
      "margin-top:18px",
      "padding:16px",
      "border-radius:16px",
      "border:1px solid rgba(30,90,65,.14)",
      "background:linear-gradient(145deg,rgba(235,248,241,.96),rgba(247,251,249,.96))",
      "box-shadow:0 8px 24px rgba(25,65,48,.06)",
      "text-align:left"
    ].join(";");


    box.innerHTML = `

      <div
        style="
          display:flex;
          align-items:center;
          gap:10px;
          margin-bottom:8px;
        "
      >

        <div
          style="
            width:36px;
            height:36px;
            border-radius:12px;
            background:#e3f2e8;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:18px;
          "
        >
          🔔
        </div>


        <div>

          <div
            style="
              font-weight:800;
              color:#173c2a;
              font-size:15px;
            "
          >
            Push értesítések
          </div>

          <div
            style="
              font-size:12px;
              color:#62736a;
              margin-top:2px;
            "
          >
            Plus csomaghoz
          </div>

        </div>

      </div>


      <div
        id="${STATUS_ID}"
        style="
          font-size:13px;
          line-height:1.45;
          color:#52615a;
          margin:8px 0 12px;
        "
      >
        Állapot ellenőrzése…
      </div>


      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
        "
      >

        <button
          id="${ENABLE_ID}"
          type="button"
          style="
            display:none;
            align-items:center;
            justify-content:center;
            background:linear-gradient(
              145deg,
              #1f8f55,
              #37ad70
            );
            color:#fff;
            border:0;
            border-radius:12px;
            padding:10px 14px;
            font-weight:750;
            cursor:pointer;
            width:auto;
          "
        >
          Push bekapcsolása
        </button>


        <button
          id="${DISABLE_ID}"
          type="button"
          style="
            display:none;
            align-items:center;
            justify-content:center;
            background:#e8efeb;
            color:#31463b;
            border:0;
            border-radius:12px;
            padding:10px 14px;
            font-weight:750;
            cursor:pointer;
            width:auto;
          "
        >
          Push kikapcsolása
        </button>

      </div>


      <div
        style="
          font-size:11px;
          color:#7a8880;
          margin-top:10px;
          line-height:1.4;
        "
      >
        A böngésző vagy telefon saját
        értesítési rendszerét használja.
      </div>

    `;


    const cancelButton =
      document.getElementById(
        "notifCancel"
      );

    const actions =
      cancelButton
        ? cancelButton.parentElement
        : null;


    if (
      actions &&
      actions.parentElement === modalContent
    ) {
      modalContent.insertBefore(
        box,
        actions
      );
    } else {
      modalContent.appendChild(box);
    }


    document
      .getElementById(ENABLE_ID)
      ?.addEventListener(
        "click",
        enablePush
      );


    document
      .getElementById(DISABLE_ID)
      ?.addEventListener(
        "click",
        disablePush
      );
  }


  /* =====================================================
     FIREBASE
     ===================================================== */

  async function waitForAuth(
    timeoutMs = 15000
  ) {

    const started =
      Date.now();

    while (
      Date.now() - started <
      timeoutMs
    ) {

      if (window.__auth) {
        return window.__auth;
      }

      await sleep(150);
    }

    return null;
  }


  async function currentFirebaseUser() {
    const auth =
      await waitForAuth();

    return auth?.currentUser || null;
  }


  async function getFirebaseToken() {

    const user =
      await currentFirebaseUser();

    if (!user) {
      throw new Error(
        "not_logged_in"
      );
    }

    return user.getIdToken();
  }


  /* =====================================================
     CLOUDFLARE API
     ===================================================== */

  async function api(
    path,
    options = {}
  ) {

    const token =
      await getFirebaseToken();

    const headers =
      new Headers(
        options.headers || {}
      );


    headers.set(
      "Authorization",
      `Bearer ${token}`
    );


    if (
      options.body &&
      !headers.has(
        "Content-Type"
      )
    ) {

      headers.set(
        "Content-Type",
        "application/json"
      );
    }


    const response =
      await fetch(
        WORKER_BASE + path,
        {
          ...options,
          headers,
          cache: "no-store"
        }
      );


    let data = {};

    try {
      data =
        await response.json();
    } catch (_) {}


    if (!response.ok) {

      const error =
        new Error(
          data?.error ||
          `http_${response.status}`
        );

      error.status =
        response.status;

      error.code =
        data?.error || "";

      throw error;
    }


    return data;
  }


  async function getVapidPublicKey() {
    if (!vapidPublicKeyPromise) {
      vapidPublicKeyPromise = (async () => {
        const response = await fetch(
          WORKER_BASE + "/vapid-public-key",
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw errorWithCode("vapid_key_unavailable");
        }

        const data = await response.json();

        if (!data?.publicKey) {
          throw errorWithCode("vapid_key_missing");
        }

        return data.publicKey;
      })().catch((error) => {
        vapidPublicKeyPromise = null;
        throw error;
      });
    }

    return vapidPublicKeyPromise;
  }


  /* =====================================================
     VAPID ÁTALAKÍTÁS
     ===================================================== */

  function urlBase64ToUint8Array(
    base64String
  ) {

    const padding =
      "=".repeat(
        (
          4 -
          (
            base64String.length %
            4
          )
        ) %
        4
      );


    const base64 =
      (
        base64String +
        padding
      )
        .replace(/-/g, "+")
        .replace(/_/g, "/");


    const rawData =
      window.atob(base64);


    const outputArray =
      new Uint8Array(
        rawData.length
      );


    for (
      let i = 0;
      i < rawData.length;
      i++
    ) {

      outputArray[i] =
        rawData.charCodeAt(i);
    }


    return outputArray;
  }


  /* =====================================================
     SERVICE WORKER
     ===================================================== */

  async function getRegistration() {
    if (!("serviceWorker" in navigator)) {
      throw errorWithCode("service_worker_not_supported");
    }

    if (!registrationPromise) {
      registrationPromise = (async () => {
        let registration = await navigator.serviceWorker.getRegistration("/");

        if (!registration) {
          try {
            registration = await navigator.serviceWorker.register(
              "/service-worker.js",
              { scope: "/" }
            );
          } catch (error) {
            const wrappedError = errorWithCode("service_worker_registration_failed");
            wrappedError.cause = error;
            throw wrappedError;
          }
        }

        if (registration.active) {
          registration.update().catch((error) => {
            console.warn("Service worker update check failed:", error);
          });
        }

        return withTimeout(
          navigator.serviceWorker.ready,
          15000,
          "service_worker_timeout"
        );
      })().catch((error) => {
        registrationPromise = null;
        throw error;
      });
    }

    return registrationPromise;
  }


  async function getPushRegistration() {
    const basicErrorCode = getBasicPushErrorCode();
    if (basicErrorCode) {
      throw errorWithCode(basicErrorCode);
    }

    const registration = await getRegistration();
    const pushManager = registration?.pushManager;

    if (
      !pushManager ||
      typeof pushManager.getSubscription !== "function" ||
      typeof pushManager.subscribe !== "function"
    ) {
      throw errorWithCode("push_not_supported");
    }

    return registration;
  }


  /* =====================================================
     HIBAÜZENETEK
     ===================================================== */

  function friendlyError(
    error
  ) {

    const code =
      String(
        error?.code ||
        error?.message ||
        ""
      );

    const errorName = String(error?.name || "");


    if (
      code ===
      "plus_subscription_required"
    ) {

      return (
        "A push értesítés csak " +
        "aktív Plus csomagban érhető el."
      );
    }


    if (
      code ===
      "subscription_access_denied"
    ) {

      return (
        "A Plus jogosultság " +
        "ellenőrzése nem sikerült."
      );
    }


    if (
      code === "not_logged_in" ||
      code ===
      "missing_firebase_token"
    ) {

      return (
        "Először jelentkezz be."
      );
    }


    if (
      code ===
      "invalid_firebase_token"
    ) {

      return (
        "A bejelentkezés lejárt. " +
        "Jelentkezz be újra."
      );
    }


    if (
      code ===
        "vapid_key_unavailable" ||
      code ===
        "vapid_key_missing"
    ) {

      return (
        "A push kulcs jelenleg " +
        "nem érhető el."
      );
    }


    if (code === "permission_denied" || errorName === "NotAllowedError") {

      return (
        "Az értesítések le vannak " +
        "tiltva a böngészőben. " +
        "Engedélyezd őket a webhely " +
        "beállításainál."
      );
    }


    if (
      code === "push_not_supported" ||
      code === "service_worker_not_supported" ||
      errorName === "NotSupportedError"
    ) {
      if (/Android/i.test(navigator.userAgent)) {
        return (
          "Ezen a telefonos böngészőn nincs Web Push támogatás. " +
          "Nyisd meg a Növényfigyelőt Chrome-ban, telepítsd az alkalmazást, " +
          "majd az appból kapcsold be a Push értesítést."
        );
      }

      return "Ez a böngésző nem támogatja a Web Push értesítéseket.";
    }


    if (code === "secure_context_required") {
      return "A Push értesítés csak biztonságos HTTPS-kapcsolaton használható.";
    }


    if (
      code === "service_worker_timeout" ||
      code === "service_worker_registration_failed"
    ) {
      return (
        "Az értesítési rendszer nem indult el. " +
        "Zárd be, majd nyisd meg újra az alkalmazást, és próbáld ismét."
      );
    }


    if (
      code ===
      "ios_home_screen_required"
    ) {

      return (
        "iPhone-on előbb add a " +
        "Növényfigyelőt a " +
        "Főképernyőhöz, majd onnan " +
        "nyisd meg és kapcsold be " +
        "a push értesítést."
      );
    }


    return (
      "A push értesítés beállítása " +
      "most nem sikerült. " +
      "Próbáld újra."
    );
  }


  /* =====================================================
     PUSH BEKAPCSOLÁS
     ===================================================== */

  async function enablePush() {

    setButtons({
      enable: true,
      disable: false,
      busy: true
    });


    setStatus(
      "Push értesítés bekapcsolása…"
    );


    try {

      if (
        isIOS() &&
        !isStandalone()
      ) {
        throw errorWithCode("ios_home_screen_required");
      }

      if (!pushSupported()) {
        throw errorWithCode(getBasicPushErrorCode() || "push_not_supported");
      }

      const user =
        window.__auth?.currentUser ||
        await currentFirebaseUser();


      if (!user) {
        throw new Error(
          "not_logged_in"
        );
      }


      let permission =
        Notification.permission;


      if (
        permission ===
        "default"
      ) {

        permission =
          await Notification
            .requestPermission();
      }


      if (
        permission !==
        "granted"
      ) {

        const error =
          new Error(
            "permission_denied"
          );

        error.code =
          "permission_denied";

        throw error;
      }


      const registration =
        await getPushRegistration();


      let subscription =
        await registration
          .pushManager
          .getSubscription();


      if (!subscription) {

        const publicKey =
          await getVapidPublicKey();


        subscription =
          await registration
            .pushManager
            .subscribe({

              userVisibleOnly:
                true,

              applicationServerKey:
                urlBase64ToUint8Array(
                  publicKey
                )

            });
      }


      await api(
        "/subscribe",
        {

          method:
            "POST",

          body:
            JSON.stringify({

              subscription:
                subscription
                  .toJSON(),

              platform:
                detectPlatform()

            })

        }
      );


      setStatus(
        "Push értesítések bekapcsolva ezen az eszközön. ✅",
        "ok"
      );


      setButtons({
        enable: false,
        disable: true,
        busy: false
      });


    } catch (error) {

      console.error(
        "Push enable error:",
        error
      );


      setStatus(
        friendlyError(error),
        "error"
      );


      setButtons({
        enable: true,
        disable: false,
        busy: false
      });
    }
  }


  /* =====================================================
     PUSH KIKAPCSOLÁS
     ===================================================== */

  async function disablePush() {

    setButtons({
      enable: false,
      disable: true,
      busy: true
    });


    setStatus(
      "Push értesítés kikapcsolása…"
    );


    try {

      const registration =
        await getPushRegistration();


      const subscription =
        await registration
          .pushManager
          .getSubscription();


      if (subscription) {

        try {

          await api(
            "/unsubscribe",
            {

              method:
                "POST",

              body:
                JSON.stringify({
                  endpoint:
                    subscription.endpoint
                })

            }
          );

        } catch (serverError) {

          console.warn(
            "Push szerveres leiratkozás hiba:",
            serverError
          );

        }


        await subscription
          .unsubscribe();
      }


      setStatus(
        "Push értesítések kikapcsolva ezen az eszközön."
      );


      setButtons({
        enable: true,
        disable: false,
        busy: false
      });


    } catch (error) {

      console.error(
        "Push disable error:",
        error
      );


      setStatus(
        friendlyError(error),
        "error"
      );


      setButtons({
        enable: false,
        disable: true,
        busy: false
      });
    }
  }


  /* =====================================================
     ÁLLAPOT FRISSÍTÉS
     ===================================================== */

  async function refreshPushState() {

    if (refreshBusy) {
      return;
    }

    refreshBusy = true;


    try {

      createUi();


      if (
        !document.getElementById(
          UI_ID
        )
      ) {
        return;
      }


      if (
        isIOS() &&
        !isStandalone()
      ) {
        setStatus(
          friendlyError(errorWithCode("ios_home_screen_required")),
          "warn"
        );
        setButtons({
          enable: false,
          disable: false
        });
        return;
      }


      if (!pushSupported()) {
        setStatus(
          friendlyError(errorWithCode(getBasicPushErrorCode() || "push_not_supported")),
          "warn"
        );

        setButtons({
          enable: false,
          disable: false
        });

        return;
      }


      let registration;

      try {
        registration = await getPushRegistration();
      } catch (error) {
        setStatus(friendlyError(error), "warn");
        setButtons({
          enable: false,
          disable: false
        });
        return;
      }


      const user =
        await currentFirebaseUser();


      if (!user) {

        setStatus(
          "Jelentkezz be a push értesítések használatához."
        );

        setButtons({
          enable: false,
          disable: false
        });

        return;
      }


      /*
       * Aktív Plus ellenőrzés
       * a Cloudflare Workerben.
       */

      try {

        await api(
          "/subscription-status",
          {
            method: "GET"
          }
        );

      } catch (error) {

        if (
          error?.code ===
          "plus_subscription_required"
        ) {

          setStatus(
            "A push értesítés Plus csomagban érhető el.",
            "warn"
          );

          setButtons({
            enable: false,
            disable: false
          });

          return;
        }

        throw error;
      }


      getVapidPublicKey().catch((error) => {
        console.warn("VAPID key preload failed:", error);
      });


      if (
        Notification.permission ===
        "denied"
      ) {

        setStatus(
          "Az értesítések le vannak tiltva ennél a webhelynél. Engedélyezd őket a böngésző webhely-beállításainál.",
          "warn"
        );

        setButtons({
          enable: false,
          disable: false
        });

        return;
      }


      const localSubscription =
        await registration
          .pushManager
          .getSubscription();


      if (localSubscription) {

        setStatus(
          "Push értesítések bekapcsolva ezen az eszközön. ✅",
          "ok"
        );

        setButtons({
          enable: false,
          disable: true
        });

      } else {

        setStatus(
          "A push értesítések még nincsenek bekapcsolva ezen az eszközön."
        );

        setButtons({
          enable: true,
          disable: false
        });
      }


    } catch (error) {

      console.warn(
        "Push state refresh error:",
        error
      );


      setStatus(
        friendlyError(error),
        "error"
      );


      setButtons({
        enable: true,
        disable: false
      });

    } finally {

      refreshBusy = false;
    }
  }


  /* =====================================================
     LOGIN FIGYELÉS
     ===================================================== */

  function startWatcher() {

    let previousUid = null;


    const check =
      async () => {

        const auth =
          window.__auth;

        const uid =
          auth?.currentUser?.uid ||
          null;


        if (
          uid !== previousUid
        ) {

          previousUid =
            uid;

          await refreshPushState();
        }
      };


    check();


    setInterval(
      check,
      2500
    );
  }


  /* =====================================================
     INDÍTÁS
     ===================================================== */

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      createUi();

      refreshPushState();

      startWatcher();

    }
  );


  /*
   * Ha a Plus / Free csomag
   * megváltozik, újra ellenőrizzük.
   */

  window.addEventListener(
    "subscription-plan-updated",
    () => {

      refreshPushState();

    }
  );


  /*
   * Debug / későbbi használat.
   */

  window.__refreshPushState =
    refreshPushState;

  window.__enableWebPush =
    enablePush;

  window.__disableWebPush =
    disablePush;

})();
