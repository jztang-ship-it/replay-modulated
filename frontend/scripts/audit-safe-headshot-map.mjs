import fs from "fs";
import path from "path";

const PLAYERS_JSON = path.resolve("public/data/players.json");
const SAFE_MAP_JSON = path.resolve("public/headshots/safe-headshot-map.json");

const players = JSON.parse(fs.readFileSync(PLAYERS_JSON, "utf-8"));
const safeMap = JSON.parse(fs.readFileSync(SAFE_MAP_JSON, "utf-8"));

// identityKey -> { base, season }
function parseKey(key) {
  const [base, season] = String(key).split("|");
  return { base: String(base ?? "").trim(), season: String(season ?? "").trim() };
}

// Build reverse index: photoCode -> Set(basePlayerId)
const codeToBases = new Map();

let missingPlayerRows = 0;
for (const [identityKey, code] of Object.entries(safeMap)) {
  const { base } = parseKey(identityKey);
  if (!base || !code) continue;

  if (!codeToBases.has(code)) codeToBases.set(code, new Set());
  codeToBases.get(code).add(base);
}

// Any code used by >1 base in the safe map is a HARD ERROR
const bad = [];
for (const [code, bases] of codeToBases.entries()) {
  if (bases.size > 1) {
    bad.push({ code, bases: Array.from(bases) });
  }
}

console.log("Safe entries:", Object.keys(safeMap).length);
console.log("Unique codes in safe map:", codeToBases.size);
console.log("BAD codes (should be 0):", bad.length);

if (bad.length) {
  console.log("\nFirst 20 BAD collisions:");
  bad.slice(0, 20).forEach((b) => {
    console.log(`- code ${b.code} used by basePlayerIds: ${b.bases.join(", ")}`);
  });
  process.exit(1);
}

console.log("\n✅ Audit passed: no photoCode in safe map is shared across multiple basePlayerIds.");
