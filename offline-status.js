// =============================
    // OFFLINE / ONLINE ÁLLAPOT FIGYELÉS
    // =============================
    function updateOfflineUI() {
      const badge = document.getElementById("offlineBadge");
      if (!badge) return;

      if (!navigator.onLine) {
        badge.style.display = "flex";
      } else {
        badge.style.display = "none";
      }
    }

    // induláskor
    window.addEventListener("load", updateOfflineUI);

    // hálózat változás
    window.addEventListener("online", updateOfflineUI);
    window.addEventListener("offline", updateOfflineUI);
