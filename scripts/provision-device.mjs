import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applicationDefault, deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import webPush from "web-push";

const models = new Map([
  ["usb", "01_USB"],
  ["usb-led", "02_USB_LED"],
  ["battery", "03_Akkumulatoros"],
  ["battery-touch", "04_Akkus_Erintos_LED"],
  ["battery-air", "05_Akkus_LED_ENS160"]
]);
const projectId = process.env.FIREBASE_PROJECT_ID;
const databaseURL = process.env.FIREBASE_DATABASE_URL;
const apiKey = process.env.FIREBASE_WEB_API_KEY;
const output = new URL("../device-output/", import.meta.url);
const firmware = new URL("../firmware/", import.meta.url);
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function safeId() { return randomBytes(12).toString("hex"); }
function activationCode() { return Array.from(randomBytes(16), byte => alphabet[byte & 31]).join(""); }

async function writePrivate(path, content) {
  await writeFile(path, content, { mode: 0o600, flag: "wx" });
}

async function prepare(variant) {
  const isAlerts = variant === "alerts";
  const id = (isAlerts ? "alerts_" : "nf_") + safeId();
  const draft = {
    projectId,
    databaseURL,
    variant,
    id,
    email: `${id}@eszk.restricted.invalid`,
    password: randomBytes(32).toString("base64url"),
    code: isAlerts ? null : activationCode()
  };
  const folder = new URL(id + "/", output);
  await mkdir(output, { recursive: true, mode: 0o700 });
  await mkdir(folder, { mode: 0o700 });
  await writePrivate(new URL(".pending.json", folder), JSON.stringify(draft));
  return draft;
}

async function provisionUser(auth, draft, claim) {
  let existing;
  try {
    existing = await auth.getUser(draft.id);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
  }
  if (existing && existing.email !== draft.email) throw new Error("A Firebase UID már másik fiókhoz tartozik.");
  if (!existing) await auth.createUser({ uid: draft.id, email: draft.email, password: draft.password });
  await auth.setCustomUserClaims(draft.id, { [claim]: true });
}

async function prepareSketch(folder, draft) {
  const model = models.get(draft.variant);
  const sketch = new URL(model + "/", folder);
  await mkdir(sketch, { recursive: true });
  await copyFile(new URL(`${model}/${model}.ino`, firmware), new URL(model + ".ino", sketch));
  const headers = ["NovenyCore.h", "GoogleTrustRoots.h"];
  if (draft.variant === "usb-led") headers.push("NovenyLedStream.h");
  for (const name of headers) await copyFile(new URL("common/" + name, firmware), new URL(name, sketch));
  const fields = {
    DEVICE_ID: draft.id,
    DB_URL: databaseURL,
    API_KEY: apiKey,
    AUTH_EMAIL: draft.email,
    AUTH_PASSWORD: draft.password
  };
  const content = "#pragma once\n\n" + Object.entries(fields)
    .map(([key, value]) => `static const char *${key} = ${JSON.stringify(value)};\n`).join("");
  const secrets = new URL("DeviceSecrets.h", sketch);
  await writeFile(secrets, content, { mode: 0o600 });
}

async function main() {
  const [variant, resume] = process.argv.slice(2);
  if ((!models.has(variant) && variant !== "alerts" && variant !== "--resume") ||
      (variant === "--resume" && !/^(nf|alerts)_[a-f0-9]{24}$/.test(resume ?? ""))) {
    throw new Error("Használat: npm run provision -- usb|usb-led|battery|battery-touch|battery-air|alerts  vagy  npm run provision -- --resume <azonosító>");
  }
  if (!projectId || !databaseURL || !apiKey) throw new Error("Add meg a FIREBASE_PROJECT_ID, FIREBASE_DATABASE_URL és FIREBASE_WEB_API_KEY változót.");
  const parsed = new URL(databaseURL);
  if (parsed.protocol !== "https:" || !/\.(firebaseio\.com|firebasedatabase\.app)$/.test(parsed.hostname) ||
      parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password || parsed.port) {
    throw new Error("A Realtime Database HTTPS alapcímét add meg.");
  }
  const draft = variant === "--resume"
    ? JSON.parse(await readFile(new URL(`${resume}/.pending.json`, output), "utf8"))
    : await prepare(variant);
  if (draft.projectId !== projectId || draft.databaseURL !== databaseURL ||
      (resume && draft.id !== resume) || (!models.has(draft.variant) && draft.variant !== "alerts")) {
    throw new Error("A korábbi csomag másik Firebase-projekthez tartozik.");
  }
  const folder = new URL(draft.id + "/", output);
  const app = initializeApp({ credential: applicationDefault(), projectId, databaseURL });
  try {
    const auth = getAuth(app);
    if (draft.variant === "alerts") {
      const vapid = webPush.generateVAPIDKeys();
      await provisionUser(auth, draft, "novenyAlerts");
      const env = {
        NF_FIREBASE_DATABASE_URL: databaseURL,
        NF_FIREBASE_API_KEY: apiKey,
        NF_ALERT_USER: draft.email,
        NF_ALERT_PASSWORD: draft.password,
        NF_VAPID_PUBLIC_KEY: vapid.publicKey,
        NF_VAPID_PRIVATE_KEY: vapid.privateKey,
        NF_VAPID_SUBJECT: "mailto:" + (process.env.NF_VAPID_CONTACT || ""),
        NF_MAIL_RELAY_SECRET: randomBytes(32).toString("hex"),
        NF_MAIL_RELAY_URL: "",
        NF_ALERTS_ENABLED: "false"
      };
      await writePrivate(new URL("netlify-alerts.env", folder), Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
      console.log(`Az értesítő csomag elkészült: device-output/${draft.id}/netlify-alerts.env`);
    } else {
      await prepareSketch(folder, draft);
      await provisionUser(auth, draft, "novenyDevice");
      const digest = createHash("sha256").update(draft.code).digest("hex");
      const v2 = getDatabase(app).ref("v2");
      const [registry, invite] = await Promise.all([
        v2.child(`registry/${draft.id}`).get(),
        v2.child(`invites/${digest}/meta`).get()
      ]);
      if (!registry.exists() && !invite.exists()) {
        await v2.update({
          [`registry/${draft.id}`]: { variant: draft.variant, deviceUid: draft.id, inviteHash: digest },
          [`invites/${digest}/meta`]: { id: draft.id, variant: draft.variant }
        });
      } else if (registry.val()?.inviteHash !== digest || registry.val()?.deviceUid !== draft.id || invite.val()?.id !== draft.id) {
        throw new Error("Az azonosítóhoz tartozó Firebase-bejegyzések eltérnek.");
      }
      const printedCode = "NF-" + draft.code.match(/.{4}/g).join("-");
      await writeFile(new URL("Aktiválókód.txt", folder), printedCode + "\n", { mode: 0o600 });
      console.log(`Virágtartó elkészült: device-output/${draft.id}/${models.get(draft.variant)}/`);
      console.log("A vevőnek az Aktiválókód.txt tartalmát add át.");
    }
    await rm(new URL(".pending.json", folder));
  } catch (error) {
    console.error(`Folytatás a hiba javítása után: npm run provision -- --resume ${draft.id}`);
    throw error;
  } finally {
    await deleteApp(app);
  }
}

main().catch(error => {
  // Avoid logging HTTP errors with tokens, credentials, or response details.
  console.error(error.code || (error instanceof Error ? error.message.split("\n")[0].slice(0, 200) : "Ismeretlen hiba"));
  process.exitCode = 1;
});
