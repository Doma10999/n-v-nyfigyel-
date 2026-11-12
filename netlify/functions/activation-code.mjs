import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

const database = "https://plant-monitor-3976f-default-rtdb.europe-west1.firebasedatabase.app";
const onlineModels = new Set(["usb", "usb-led", "battery", "battery-touch", "battery-air"]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const reply = (status, data) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store" }
});

export const config = {
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] }
};

export function activationHandler(openStore, fetchMeta = fetch) {
  return async request => {
    if (request.method !== "POST") return reply(405, { error: "method" });

    const body = await request.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9]{6}$/.test(code)) return reply(400, { error: "invalid" });

    const key = sha256(code);
    const proof = body.proof;
    try {
      const store = openStore();
      if (proof === undefined) {
        const entry = await store.get(key, { type: "json" });
        if (!/^[a-f0-9]{64}$/.test(entry?.digest ?? "")) return reply(404, { error: "unavailable" });
        return reply(200, { digest: entry.digest });
      }
      if (typeof proof !== "string" || !/^[0-9A-HJKMNP-TV-Z]{16}$/.test(proof)) {
        return reply(400, { error: "invalid" });
      }

      // Only a Firebase Admin can write the code hash into this exact, unlisted invite.
      const digest = sha256(proof);
      const prior = await store.get(key, { type: "json" });
      if (prior?.digest === digest) return reply(200, { saved: true });
      const response = await fetchMeta(`${database}/v2/invites/${digest}/meta.json`, {
        signal: AbortSignal.timeout(5000)
      });
      if (response.status === 401 || response.status === 403) return reply(404, { error: "unavailable" });
      if (!response.ok) return reply(503, { error: "temporary" });
      const meta = await response.json();
      if (meta?.shortCodeHash !== key || !/^nf_[a-f0-9]{24}$/.test(meta.id ?? "") || !onlineModels.has(meta.variant)) {
        return reply(404, { error: "unavailable" });
      }
      const { modified } = await store.setJSON(key, { digest }, { onlyIfNew: true });
      if (modified) return reply(201, { saved: true });
      const existing = await store.get(key, { type: "json" });
      if (existing?.digest === digest) return reply(200, { saved: true });
      return reply(409, { error: "in-use" });
    } catch {
      return reply(503, { error: "temporary" });
    }
  };
}

export default activationHandler(() => getStore({ name: "activation-codes", consistency: "strong" }));
