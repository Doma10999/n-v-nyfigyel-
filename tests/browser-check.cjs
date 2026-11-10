// Run after npm run build under the demo Auth/RTDB emulators.
const assert = require("node:assert/strict");
const { createHash, randomBytes } = require("node:crypto");
const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const { join, basename, extname } = require("node:path");
const { chromium } = require("playwright");

const project = "demo-novenyfigyelo";
const namespace = project + "-default-rtdb";
const authBase = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const site = "http://127.0.0.1:8765";
const firstCode = "1TS9WDQH2CJ8M3RB";
const secondCode = "ZRW2S31BNP35HGS8";
const email = `browser-${randomBytes(6).toString("hex")}@example.test`;
const password = "Browser-only-password-23";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };

async function admin(path, method = "GET", body) {
  const response = await fetch(`http://127.0.0.1:9000/${path}.json?ns=${namespace}`, {
    method, headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function authCall(method, body) {
  const response = await fetch(`${authBase}/accounts:${method}?key=demo-api-key`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function oobCode(type) {
  for (let tries = 0; tries < 30; tries++) {
    const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${project}/oobCodes`);
    const { oobCodes } = await response.json();
    const found = oobCodes.findLast(entry => entry.email === email && entry.requestType === type);
    if (found) return found.oobCode;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Missing emulator email " + type);
}

async function seed(code, variant) {
  const id = "nf_" + randomBytes(12).toString("hex");
  const digest = createHash("sha256").update(code).digest("hex");
  await admin("v2", "PATCH", {
    [`registry/${id}`]: { variant, deviceUid: id, inviteHash: digest },
    [`invites/${digest}/meta`]: { id, variant }
  });
  return id;
}

async function assertFit(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}

async function closeModal(page, name) {
  await page.locator(`#${name}Close`).click();
  await page.locator(`#${name}`).waitFor({ state: "hidden" });
}

async function openMenuItem(page, selector) {
  const menu = page.locator("#menuBtn");
  if (await menu.getAttribute("aria-expanded") !== "true") await menu.click();
  await page.locator(selector).click();
}

async function main() {
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST, "Run the local demo emulators with emulators:exec.");
  const [first, second] = await Promise.all([seed(firstCode, "usb-led"), seed(secondCode, "battery-air")]);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, site);
      if (url.pathname === "/.netlify/functions/push-key") {
        response.writeHead(503).end();
        return;
      }
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const data = await readFile(join("dist", file));
      response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }).end(data);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(8765, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", ...JSON.parse(process.env.CHROMIUM_EXTRA_ARGS || "[]")]
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://www.gstatic.com/firebasejs/10.12.2/**", async route => {
    const dir = process.env.FIREBASE_CDN_DIR;
    if (!dir) return route.continue();
    const file = basename(new URL(route.request().url()).pathname);
    await route.fulfill({ body: await readFile(join(dir, file)), contentType: "text/javascript" });
  });
  await page.route(/^https:\/\/(fonts\.googleapis\.com|cdnjs\.cloudflare\.com)/, route => route.abort());

  try {
    await page.goto(site + "/?emulator=1");
    await page.locator("#appLaunchSplash").waitFor({ state: "detached" });
    await assertFit(page);
    await page.locator("#activationCode").fill("hibás");
    await page.locator("#activationForm button[type=submit]").click();
    assert.match(await page.locator("#status").innerText(), /Ellenőrizd a kódot/);
    await page.locator("#activationCode").fill("NF-" + firstCode.match(/.{4}/g).join("-").toLowerCase());
    await page.locator("#activationForm button[type=submit]").click();
    await page.locator("#registerForm").waitFor();
    await assertFit(page);
    await page.locator("#registerEmail").fill(email);
    await page.locator("#registerPassword").fill(password);
    await page.locator("#registerForm button[type=submit]").click();
    await page.locator(".device-card").first().waitFor();
    assert.equal(await page.locator(".care-value").first().innerText(), "Mérésre vár");
    assert.equal(await page.locator("#paymentBtn").count(), 0);

    const owner = await admin(`v2/registry/${first}/ownerUid`);
    assert.ok(owner);
    const base = `v2/users/${owner}/devices`;
    await openMenuItem(page, "#addAccountBtn");
    await page.locator("#additionalCode").fill(secondCode);
    await page.locator("#addNewAccountForm button[type=submit]").click();
    await page.waitForFunction(() => document.querySelectorAll(".device-card").length === 2);
    assert.equal(await admin(`v2/registry/${second}/ownerUid`), owner);
    const [firstCard, secondCard] = [
      page.locator(`.device-card:has([data-device="${first}"])`),
      page.locator(`.device-card:has([data-device="${second}"])`)
    ];
    const now = Date.now();
    const history = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}`, { t: now - (10 - i) * 3600000, v: 30 + i }]));
    await admin(base, "PATCH", {
      [`${first}/displayName`]: "Monstera",
      [`${first}/reading`]: { sensorValue: 81, lastMeasurementAt: now },
      [`${first}/history`]: history,
      [`${second}/displayName`]: "Páfrány",
      [`${second}/reading`]: { sensorValue: 47, batteryPercent: 76, lastMeasurementAt: now },
      [`${second}/airQuality`]: { aqi: 3, tvoc: 120, eco2: 850, status: "kozepes" }
    });
    await firstCard.getByText("81%", { exact: true }).waitFor();
    await secondCard.getByText("76%", { exact: true }).waitFor();
    assert.equal(await secondCard.locator(".air-quality-state").innerText(), "Közepes");
    assert.ok(!await secondCard.locator(".led-slider").isVisible());
    await firstCard.locator(".led-toggle").click();
    await page.waitForFunction(id => {
      const card = document.querySelector(`.device-card:has([data-device="${id}"])`);
      return !card.querySelector(".led-toggle").disabled && card.querySelector(".led-output").textContent === "50%";
    }, first);
    assert.equal(await admin(`${base}/${first}/ledLevel`), 50);
    await firstCard.locator(".plant-select").click();
    assert.equal(await page.locator(".plant-option:visible").count(), 5);
    await page.locator(".plant-option").last().click();
    await page.locator("#plantTypeModal").waitFor({ state: "hidden" });
    assert.match(await admin(`${base}/${first}/plantType`), /Vízigényes/);
    assert.equal(await firstCard.locator(".gauge-value").innerText(), "81%");

    await page.locator("#chartsBtn").click();
    const chart = page.locator(".chart-card canvas").filter({ visible: true }).first();
    await chart.waitFor();
    const graphLabels = await page.locator(".chart-card canvas").evaluateAll(canvases => canvases.map(canvas => canvas.getAttribute("aria-label")));
    assert.ok(graphLabels.some(label => (label.match(/%/g) || []).length === 10));
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await assertFit(page);
      const dialog = page.locator("#chartsModalContent");
      const rect = await dialog.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width);
    }
    await closeModal(page, "chartsModal");

    await openMenuItem(page, "#notifBellBtn");
    await page.locator("#verifyAlertEmail").waitFor();
    await page.locator("#verifyAlertEmail").click();
    await page.getByText(/Megküldtük a megerősítő linket/).waitFor();
    await authCall("update", { oobCode: await oobCode("VERIFY_EMAIL") });
    await closeModal(page, "notifModal");
    await openMenuItem(page, "#notifBellBtn");
    await page.getByText(/^E-mail-cím:/).waitFor();
    await page.locator("#notifDeviceList input[type=checkbox]").first().check();
    await page.locator("#notifSave").click();
    await page.locator("#notifModal").waitFor({ state: "hidden" });
    assert.equal(await admin(`v2/users/${owner}/notificationEmail`), email);

    await firstCard.locator(".deleteBtn").click();
    await page.locator("#confirmIgenBtn").click();
    await firstCard.waitFor({ state: "detached" });
    await openMenuItem(page, "#addAccountBtn");
    await page.locator("#additionalCode").fill(firstCode);
    await page.locator("#addNewAccountForm button[type=submit]").click();
    await firstCard.waitFor();

    await page.goto(site + "/offline.html");
    assert.equal(await page.locator(".offline-plant").count(), 2);
    await page.goto(site + "/?emulator=1");
    await page.locator(".device-card").first().waitFor();
    await page.locator("#sessionLogout").click();
    await page.locator("#loginForm").waitFor();
    await page.locator("#showReset").click();
    await page.locator("#resetEmail").fill(email);
    await page.locator("#resetForm button[type=submit]").click();
    await page.getByText(/hamarosan megérkezik a jelszó-visszaállító link/).waitFor();
    const newPassword = "Browser-only-new-password-44";
    await authCall("resetPassword", { oobCode: await oobCode("PASSWORD_RESET"), newPassword });
    await page.locator("#resetBack").click();
    await page.locator("#password").fill(newPassword);
    await page.locator("#loginForm button[type=submit]").click();
    await page.waitForFunction(() => document.querySelectorAll(".device-card").length === 2);
    assert.deepEqual(errors, []);
    console.log("Chromium: registration, additional device, telemetry, LED, category, charts, verified email settings, hide/restore, offline and reset passed.");
  } catch (error) {
    console.error("Browser errors:", errors);
    console.error("UI status:", await page.locator("#status").textContent().catch(() => ""));
    if (process.env.BROWSER_FAILURE_SCREENSHOT) await page.screenshot({ path: process.env.BROWSER_FAILURE_SCREENSHOT }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
