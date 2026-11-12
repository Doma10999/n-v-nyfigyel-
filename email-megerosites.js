import { activeFirebaseConfig, firebaseConfig, localEmulator } from "./firebase-config.js";

const heading = document.getElementById("heading");
const message = document.getElementById("message");
const confirm = document.getElementById("confirm");
const home = document.getElementById("home");
const query = new URLSearchParams(location.search);
const mode = query.get("mode");
const code = query.get("oobCode");

function showResult(title, detail) {
  heading.textContent = title;
  message.textContent = detail;
  confirm.hidden = true;
  home.classList.add("primary");
}

function invalidLink() {
  showResult("A link már nem használható",
    "A megerősítő link lejárt, már felhasználtad, vagy hiányos. Az Értesítések menüben kérhetsz újat.");
}

function unavailable() {
  showResult("A megerősítés megszakadt",
    "Ellenőrizd az internetkapcsolatot, majd nyisd meg újra a levélben kapott linket.");
}

function reportError(error) {
  if (["auth/invalid-action-code", "auth/expired-action-code", "auth/user-not-found",
       "auth/user-disabled"].includes(error?.code)) invalidLink();
  else unavailable();
}

async function verifyEmail() {
  const [{ initializeApp }, firebaseAuth] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js")
  ]);
  const app = initializeApp(activeFirebaseConfig, "email-verification");
  const auth = firebaseAuth.initializeAuth(app, { persistence: firebaseAuth.inMemoryPersistence });
  if (localEmulator) firebaseAuth.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const action = await firebaseAuth.checkActionCode(auth, code);
  if (action.operation !== "VERIFY_EMAIL") return invalidLink();

  message.textContent = "Erősítsd meg az e-mail-címedet, hogy bekapcsolhasd a növényeidhez tartozó e-mailes jelzéseket.";
  confirm.hidden = false;
  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    message.textContent = "E-mail-cím megerősítése…";
    try {
      await firebaseAuth.applyActionCode(auth, code);
      showResult("E-mail-cím megerősítve",
        "A Növényfigyelő Értesítések menüjében most már bekapcsolhatod az e-mailes jelzéseket.");
    } catch (error) {
      reportError(error);
    }
  }, { once: true });
}

if (location.search) history.replaceState(null, "", location.pathname);
if (!mode || !/^[A-Za-z]{1,40}$/.test(mode) || !code || code.length > 512) {
  invalidLink();
} else if (mode === "verifyEmail") {
  verifyEmail().catch(reportError);
} else {
  // Firebase uses the same configured action URL for every account email.
  const fallback = new URL("/__/auth/action", `https://${firebaseConfig.authDomain}`);
  for (const name of ["mode", "oobCode", "continueUrl", "lang", "tenantId"]) {
    const value = query.get(name);
    if (value) fallback.searchParams.set(name, value);
  }
  fallback.searchParams.set("apiKey", firebaseConfig.apiKey);
  location.replace(fallback);
}
