import fs from "fs";
import path from "path";

const PLAYERS_JSON = path.resolve("public/data/players.json");
const HEADSHOTS_DIR = path.resolve("public/headshots");

if (!fs.existsSync(PLAYERS_JSON)) {
  console.error("players.json not found at:", PLAYERS_JSON);
  process.exit(1);
}
if (!fs.existsSync(HEADSHOTS_DIR)) {
  console.error("headshots dir not found at:", HEADSHOTS_DIR);
  process.exit(1);
}

const players = JSON.parse(fs.readFileSync(PLAYERS_JSON, "utf-8"));
const files = new Set(fs.readdirSync(HEADSHOTS_DIR));

const missing = [];
for (const p of players) {
  const code = String(p.photoCode ?? "").trim();
  if (!code) continue;
  const want = `${code}.png`;
  if (!files.has(want)) missing.push({ name: p.name, team: p.team, photoCode: code, want });
}

console.log("Players:", players.length);
console.log("Headshot files:", files.size);
console.log("Missing headshots:", missing.length);

console.log("\nFirst 25 missing:");
missing.slice(0, 25).forEach((m) => console.log(`- ${m.photoCode} (${m.name}) -> ${m.want}`));

fs.writeFileSync(path.resolve("missing-headshots.json"), JSON.stringify(missing, null, 2), "utf-8");
console.log("\nWrote missing-headshots.json");
