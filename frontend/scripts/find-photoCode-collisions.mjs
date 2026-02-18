import fs from "fs";
import path from "path";

const PLAYERS_JSON = path.resolve("public/data/players.json");
const players = JSON.parse(fs.readFileSync(PLAYERS_JSON, "utf-8"));

const byCode = new Map(); // code -> Set(names)

for (const p of players) {
  const code = String(p.photoCode ?? "").trim();
  if (!code) continue;
  if (!byCode.has(code)) byCode.set(code, new Set());
  byCode.get(code).add(`${p.name} (${p.team ?? "?"}, ${p.season ?? "?"})`);
}

const collisions = [];
for (const [code, namesSet] of byCode.entries()) {
  const names = Array.from(namesSet);
  if (names.length > 1) collisions.push({ code, count: names.length, names });
}

collisions.sort((a, b) => b.count - a.count);

console.log("Unique photoCodes:", byCode.size);
console.log("Collisions (same photoCode used by >1 player):", collisions.length);
console.log("\nTop 20 collisions:");
for (const c of collisions.slice(0, 20)) {
  console.log(`\nphotoCode ${c.code} used by ${c.count} players:`);
  c.names.slice(0, 10).forEach((n) => console.log(" -", n));
  if (c.names.length > 10) console.log(` ... +${c.names.length - 10} more`);
}

fs.writeFileSync(
  path.resolve("public/headshots/photoCode-collisions.json"),
  JSON.stringify(collisions, null, 2),
  "utf-8"
);
console.log("\nWrote: public/headshots/photoCode-collisions.json");
