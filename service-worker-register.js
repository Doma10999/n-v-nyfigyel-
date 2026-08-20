(() => {
  "use strict";

  /* Service worker */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js", {
      scope: "/",
      updateViaCache: "none"
    }).then((registration) => {
      return registration.active
        ? registration.update()
        : undefined;
    }).catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  }

  function applyRuntimeUiFixes() {
    /* ---------------------------------------------------------
       TAB IKON / FAVICON
       Mindkét Netlify domain ugyanazt az icon2.png fájlt használja.
       A verzióparaméter segít a régi favicon cache megkerülésében.
       --------------------------------------------------------- */
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.type = "image/png";
    favicon.href = "/icon2.png?v=20260814v2";

    let shortcutIcon = document.querySelector('link[rel="shortcut icon"]');
    if (!shortcutIcon) {
      shortcutIcon = document.createElement("link");
      shortcutIcon.rel = "shortcut icon";
      document.head.appendChild(shortcutIcon);
    }
    shortcutIcon.type = "image/png";
    shortcutIcon.href = "/icon2.png?v=20260814v2";

    /* Modern PWA meta - megszünteti az apple-mobile-web-app figyelmeztetést. */
    if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
      const meta = document.createElement("meta");
      meta.name = "mobile-web-app-capable";
      meta.content = "yes";
      document.head.appendChild(meta);
    }

    /* ---------------------------------------------------------
       ÉRTESÍTÉSI MODAL GÖRGETÉS
       Több fiók / sok növény esetén is végig görgethető legyen
       egérrel, touchpaddal és telefonon ujjal.
       --------------------------------------------------------- */
    if (!document.getElementById("notif-modal-scroll-runtime-fix")) {
      const style = document.createElement("style");
      style.id = "notif-modal-scroll-runtime-fix";
      style.textContent = `
        #notifModal {
          overflow-y: auto !important;
          overflow-x: hidden !important;
          -webkit-overflow-scrolling: touch !important;
          overscroll-behavior-y: contain !important;
          padding-top: max(12px, env(safe-area-inset-top)) !important;
          padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
          padding-left: 12px !important;
          padding-right: 12px !important;
        }

        #notifModalContent {
          width: min(420px, 100%) !important;
          max-width: 100% !important;
          max-height: calc(100vh - 24px) !important;
          max-height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          -webkit-overflow-scrolling: touch !important;
          overscroll-behavior-y: contain !important;
          touch-action: pan-y !important;
          margin: auto !important;
          scrollbar-gutter: stable;
        }

        #notifDeviceList {
          max-width: 100% !important;
        }

        #notifModalContent::-webkit-scrollbar {
          width: 5px;
        }

        #notifModalContent::-webkit-scrollbar-track {
          background: transparent;
        }

        #notifModalContent::-webkit-scrollbar-thumb {
          background: rgba(67, 160, 71, 0.32);
          border-radius: 999px;
        }

        @media (max-width: 640px), (max-height: 760px) {
          #notifModal {
            align-items: flex-start !important;
          }

          #notifModalContent {
            margin: 0 auto !important;
            max-height: calc(100vh - 24px) !important;
            max-height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) !important;
            padding: 22px 16px 18px !important;
            border-radius: 22px !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyRuntimeUiFixes, { once: true });
  } else {
    applyRuntimeUiFixes();
  }
})();
