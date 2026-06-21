document.addEventListener("DOMContentLoaded", () => {
  let currentSelectUID = null;
  let currentSelectDevice = null;
  let currentSelectEl = null;

  const plantTypeModal = document.getElementById("plantTypeModal");
  const plantTypeClose = document.getElementById("plantTypeClose");
  const allOptions = Array.from(document.querySelectorAll(".plant-option"));

  function getAllowedCategories(uid) {
    if (window.__getAllowedCategoriesForUid) {
      return window.__getAllowedCategoriesForUid(uid);
    }
    return [
      "🌾Mérsékelten száraz",
      "🌱Nedvességkedvelő"
    ];
  }

  function refreshVisibleOptions() {
    const allowed = getAllowedCategories(currentSelectUID);
    allOptions.forEach(opt => {
      const visible = allowed.includes(opt.dataset.value);
      opt.style.display = visible ? "block" : "none";
    });
  }

  document.addEventListener("click", (e) => {
    const sel = e.target.closest(".plant-select");
    if (!sel) return;

    e.stopPropagation();

    currentSelectUID = sel.dataset.uid;
    currentSelectDevice = sel.dataset.device;
    currentSelectEl = sel.querySelector(".plant-select-value");

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

      currentSelectEl.textContent = value;

      await window.__set(
        window.__ref(
          window.__db,
          `users/${currentSelectUID}/devices/${currentSelectDevice}/plantType`
        ),
        value
      );

      plantTypeModal.style.display = "none";
    });
  });

  plantTypeClose.addEventListener("click", (e) => {
    e.stopPropagation();
    plantTypeModal.style.display = "none";
  });

  const plantTypeBackdrop = document.querySelector("#plantTypeModal .modal");
  plantTypeBackdrop.addEventListener("click", () => {
    plantTypeModal.style.display = "none";
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && plantTypeModal.style.display === "flex") {
      plantTypeModal.style.display = "none";
    }
  });
});
