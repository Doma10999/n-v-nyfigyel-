import { readFile, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Használat: npm run stage:rules -- meglevo-rules.json staging-rules.json");

const old = JSON.parse(await readFile(input, "utf8"));
const next = JSON.parse(await readFile(new URL("../firebase/database.rules.json", import.meta.url), "utf8"));
const rules = old.rules;
if (!rules || typeof rules !== "object" || Array.isArray(rules)) throw new Error("A bemenet egy Firebase Rules JSON-fájl legyen.");
const isClosed = value => value === undefined || value === false || value === "false";
const isPublic = value => value === true || value === "true";
if (!isClosed(rules[".read"]) || !isClosed(rules[".write"]) || rules[".validate"] ||
    Object.keys(rules).some(key => key.startsWith("$")) || rules.v2) {
  throw new Error("A jelenlegi gyökérszabály vagy v2 ág kézi ellenőrzést igényel. A fájl változatlan.");
}
for (const branch of ["users", "emailWatcher"]) {
  const legacy = rules[branch];
  if (!isPublic(legacy?.[".read"]) && !isPublic(legacy?.[".write"])) continue;
  if (Object.keys(legacy).some(key => key !== ".read" && key !== ".write")) {
    throw new Error(`A régi ${branch} ág egyedi jogosultságait ellenőrizd kézzel.`);
  }
  if (branch === "users") rules.users = next.rules.users;
  else delete rules.emailWatcher;
}
rules.v2 = next.rules.v2;
await writeFile(output, JSON.stringify(old, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log("A staging szabályfájl elkészült. A Firebase-ben még közzé kell tenni.");
