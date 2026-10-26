document.addEventListener("DOMContentLoaded", () => {
  let currentSelectUID = null;
  let currentSelectDevice = null;
  let currentSelectEl = null;

  const plantTypeModal = document.getElementById("plantTypeModal");
  const plantTypeClose = document.getElementById("plantTypeClose");
  const plantTypeBox = document.querySelector("#plantTypeModal .modal-box");
  const allOptions = Array.from(document.querySelectorAll(".plant-option"));

  if (!plantTypeModal || !plantTypeClose || !plantTypeBox) return;

  allOptions.forEach(opt => {
    const text = opt.textContent.trim();
    opt.textContent = '';
    const copy = document.createElement('span'); copy.className = 'type-option-copy';
    const name = document.createElement('strong'); name.textContent = text;
    copy.append(name); opt.append(copy);
    const mark = document.createElement('span'); mark.className = 'type-option-check'; mark.textContent = '✓'; mark.setAttribute('aria-hidden','true'); opt.append(mark);
  });

  function getAllowedCategories(uid) {
    if (window.__getAllowedCategoriesForUid) {
      return window.__getAllowedCategoriesForUid(uid);
    }
    return [
      "🌿Kiegyensúlyozott vízigényű"
    ];
  }

  function refreshVisibleOptions() {
    const allowed = getAllowedCategories(currentSelectUID);
    allOptions.forEach(opt => {
      const visible = allowed.includes(opt.dataset.value);
      opt.style.display = visible ? "flex" : "none";
    });
  }

  document.addEventListener("click", (e) => {
    const sel = e.target.closest(".plant-select");
    if (!sel) return;

    e.stopPropagation();

    currentSelectUID = sel.dataset.uid;
    currentSelectDevice = sel.dataset.device;
    currentSelectEl = sel.querySelector(".plant-select-value");

    allOptions.forEach(opt => { const selected = opt.dataset.value === sel.closest('.device-card')?.dataset.category; opt.dataset.selected = String(selected); opt.setAttribute('aria-pressed', String(selected)); });
    refreshVisibleOptions();
    plantTypeModal.style.display = "flex";
  });

  allOptions.forEach(opt => {
    opt.addEventListener("click", async (e) => {
      e.stopPropagation();

      if (!currentSelectUID || !currentSelectDevice || !currentSelectEl) return;

      const value = opt.dataset.value;
      const allowed = getAllowedCategories(currentSelectUID);

      if (!allowed.includes(value)) {
        alert("Ez a kategória csak Plus csomagban érhető el.");
        return;
      }

      if (!navigator.onLine) {
        window.showAppToast('A kategória mentéséhez internetkapcsolat szükséges.', 'Nincs internet');
        return;
      }
      // Capture this selection: dismissing the dialog must not redirect an in-flight save.
      const target = currentSelectEl, uid = currentSelectUID, device = currentSelectDevice;
      allOptions.forEach(button => button.disabled = true);
      plantTypeBox.setAttribute('aria-busy','true');
      try {
        await window.__set(window.__ref(window.__db, `users/${uid}/devices/${device}/plantType`), value);
        target.textContent = value.replace(/^[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]+/u, '');
        plantTypeModal.style.display = 'none';
        window.showAppToast('A növény vízigényét elmentettük.');
      } catch {
        window.showAppToast('A kategória nem változott meg. Próbáld újra.', 'Nem sikerült menteni');
      } finally {
        allOptions.forEach(button => button.disabled = false);
        plantTypeBox.removeAttribute('aria-busy');
      }
    });
  });

  plantTypeClose.addEventListener("click", (e) => {
    e.stopPropagation();
    plantTypeModal.style.display = "none";
  });

  const plantTypeBackdrop = document.querySelector("#plantTypeModal .modal");
  plantTypeBox.addEventListener("click", (e) => e.stopPropagation());
  plantTypeBackdrop.addEventListener("click", (e) => {
    if (e.target === plantTypeBackdrop) plantTypeModal.style.display = "none";
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && plantTypeModal.style.display === "flex") {
      plantTypeModal.style.display = "none";
    }
  });
});
