import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

const aiBtn = document.getElementById("aiBtn");
const aiModal = document.getElementById("aiModal");
const aiModalClose = document.getElementById("aiModalClose");
const aiForm = document.getElementById("aiForm");
const aiInput = document.getElementById("aiInput");
const aiMessages = document.getElementById("aiMessages");
const aiStatusPill = document.getElementById("aiStatusPill");
const aiSendBtn = document.getElementById("aiSendBtn");
const aiClearBtn = document.getElementById("aiClearBtn");
const quickButtons = Array.from(document.querySelectorAll(".ai-quick-btn"));

let engine = null;
let engineLoading = null;
let busy = false;

const MODEL_ID = "Phi-3.5-mini-instruct-q4f16_1-MLC";

const SYSTEM_PROMPT = `Te egy röviden válaszoló növénysegéd vagy a Növényfigyelő alkalmazásban.
Csak növényekkel kapcsolatos kérdésekre válaszolj.
Ha nem növényes a kérdés, udvariasan mondd, hogy csak növényekben tudsz segíteni.
Mindig magyarul válaszolj.
Legfeljebb 4 rövid mondatot írj.
Ha lehet, ajánld ki az egyik kategóriát ezek közül pontosan így:
- 🌵Szárazkedvelő
- 🌾Mérsékelten száraz
- 🌿Kiegyensúlyozott vízigényű
- 🌱Nedvességkedvelő
- 💧Vízigényes
Térj ki röviden a vízigényre, fényigényre és a tartási helyre, ha releváns.`;

function setStatus(text, tone = "idle") {
  if (!aiStatusPill) return;
  aiStatusPill.textContent = text;
  aiStatusPill.style.background = tone === "error" ? "#ffe4e4" : tone === "loading" ? "#eef0ff" : "#dff4e4";
  aiStatusPill.style.color = tone === "error" ? "#8b1e1e" : tone === "loading" ? "#273b8f" : "#1f5a32";
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `ai-msg ${role === "user" ? "ai-msg-user" : role === "system" ? "ai-msg-system" : "ai-msg-bot"}`;
  div.textContent = text;
  aiMessages.appendChild(div);
  aiMessages.scrollTop = aiMessages.scrollHeight;
  return div;
}

function clearMessages() {
  aiMessages.innerHTML = "";
  appendMessage("bot", "Szia! Írd meg például: „Van egy monstera növényem. Melyik kategória kell neki, mennyi fény és víz kell?”");
}

function canUseAi() {
  const uid = window.jelenlegiUID;
  return !!(uid && window.__isPlusForUid && window.__isPlusForUid(uid));
}

async function ensureEngine() {
  if (engine) return engine;
  if (engineLoading) return engineLoading;

  if (!("gpu" in navigator)) {
    throw new Error("Ezen az eszközön nincs WebGPU támogatás.");
  }

  setStatus("AI modell betöltése…", "loading");
  appendMessage("system", "Az AI modell első indításkor letöltődik. Ez eltarthat egy ideig.");

  engineLoading = CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (report) => {
      const pct = typeof report.progress === "number" ? Math.round(report.progress * 100) : null;
      setStatus(pct !== null ? `Betöltés ${pct}%` : (report.text || "Betöltés…"), "loading");
    }
  }).then((created) => {
    engine = created;
    setStatus("AI kész", "idle");
    return engine;
  }).catch((err) => {
    engineLoading = null;
    setStatus("AI hiba", "error");
    throw err;
  });

  return engineLoading;
}

function openModal() {
  if (!canUseAi()) {
    alert("Az AI növénysegéd csak Plus csomagban érhető el.");
    return;
  }
  aiModal.style.display = "flex";
  document.body.classList.remove("menu-open");
  setStatus(engine ? "AI kész" : "Készenlét", "idle");
}

function closeModal() {
  aiModal.style.display = "none";
}

async function askAi(promptText) {
  if (busy) return;
  const text = String(promptText || "").trim();
  if (!text) return;

  if (!canUseAi()) {
    appendMessage("system", "Ez a funkció csak Plus csomagban érhető el.");
    return;
  }

  busy = true;
  aiSendBtn.disabled = true;
  aiInput.disabled = true;
  appendMessage("user", text);
  aiInput.value = "";

  try {
    const llm = await ensureEngine();
    setStatus("Válasz készül…", "loading");

    const response = await llm.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text }
      ],
      temperature: 0.2,
      max_tokens: 180
    });

    const answer = response?.choices?.[0]?.message?.content?.trim() || "Most nem tudtam választ készíteni.";
    appendMessage("bot", answer);
    setStatus("AI kész", "idle");
  } catch (err) {
    console.error(err);
    appendMessage("system", `AI hiba: ${err?.message || "ismeretlen hiba"}`);
    setStatus("AI hiba", "error");
  } finally {
    busy = false;
    aiSendBtn.disabled = false;
    aiInput.disabled = false;
    aiInput.focus();
  }
}

if (aiBtn) {
  aiBtn.addEventListener("click", () => {
    openModal();
  });
}

if (aiModalClose) aiModalClose.addEventListener("click", closeModal);
if (aiModal) {
  aiModal.addEventListener("click", (e) => {
    if (e.target === aiModal) closeModal();
  });
}

if (aiForm) {
  aiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    await askAi(aiInput.value);
  });
}

if (aiClearBtn) {
  aiClearBtn.addEventListener("click", () => {
    clearMessages();
    aiInput.value = "";
    setStatus(engine ? "AI kész" : "Készenlét", "idle");
  });
}

quickButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    aiInput.value = btn.dataset.aiPrompt || "";
    aiInput.focus();
  });
});

window.addEventListener("subscription-plan-updated", () => {
  if (!canUseAi() && aiModal.style.display === "flex") {
    closeModal();
  }
});

clearMessages();
