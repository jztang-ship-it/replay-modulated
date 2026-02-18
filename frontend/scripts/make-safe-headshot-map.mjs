import fs from "fs";
import path from "path";

const PLAYERS_JSON = path.resolve("public/data/players.json");
const HEADSHOTS_DIR = path.resolve("public/headshots");
const OUT_JSON = path.resolve("public/headshots/safe-headshot-map.json");

if (!fs.existsSync(PLAYERS_JSON)) {
  console.error("players.json not found at:", PLAYERS_JSON);
  process.exit(1);
}

const players = JSON.parse(fs.readFileSync(PLAYERS_JSON, "utf-8"));

// Accept both png + jpg if your downloader saved either
const files = new Set(fs.existsSync(HEADSHOTS_DIR) ? fs.readdirSync(HEADSHOTS_DIR) : []);

function keyOf(p) {
  // Card identity: basePlayerId + season
  return `${String(p.basePlayerId ?? "").trim()}|${String(p.season ?? "").trim()}`;
}

function baseOf(p) {
  return String(p.basePlayerId ?? "").trim();
}

function codeOf(p) {
  return String(p.photoCode ?? "").trim();
}

// Map: photoCode -> Set(basePlayerId)
// (this is the only collision rule we care about)
const codeToBases = new Map();

for (const p of players) {
  const code = codeOf(p);
  const base = baseOf(p);
  if (!code || !base) continue;

  if (!codeToBases.has(code)) codeToBases.set(code, new Set());
  codeToBases.get(code).add(base);
}

function hasFileFor(code) {
  if (!code) return false;
  return files.has(`${code}.png`) || files.has(`${code}.jpg`) || files.has(`${code}.jpeg`);
}

const safe = {}; // identityKey -> photoCode

let safeCount = 0;
let missingFileCount = 0;
let collidedCount = 0;
let skippedNoBaseOrCode = 0;

for (const p of players) {
  const code = codeOf(p);
  const base = baseOf(p);
  if (!code || !base) {
    skippedNoBaseOrCode++;
    continue;
  }

  const bases = codeToBases.get(code);
  // SAFE only if this photoCode maps to exactly one basePlayerId
  if (!bases || bases.size !== 1) {
    collidedCount++;
    continue;
  }

  // SAFE only if we actually have the file locally (png/jpg)
  if (!hasFileFor(code)) {
    missingFileCount++;
    continue;
  }

  safe[keyOf(p)] = code;
  safeCount++;
}

fs.writeFileSync(OUT_JSON, JSON.stringify(safe, null, 2), "utf-8");

console.log("players:", players.length);
console.log("unique photoCodes:", codeToBases.size);
console.log("safe mappings written:", safeCount);
console.log("skipped because collision (code used by >1 basePlayerId):", collidedCount);
console.log("skipped because missing file:", missingFileCount);
console.log("skipped missing base/code:", skippedNoBaseOrCode);
console.log("Wrote:", OUT_JSON);
