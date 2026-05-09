/**
 * rebuildSeasonsManifest.mjs
 *
 * Walks basketball/public/data/seasons/ and rebuilds _manifest.json from
 * whatever directories exist. Source-agnostic — works whether seasons came
 * from the splitter (monolithic source) or extractNbaSeason.mjs (live API).
 *
 * Usage:
 *   node basketball/scripts/rebuildSeasonsManifest.mjs
 */

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");

const seasons = [];

for (const entry of readdirSync(SEASONS_DIR).sort()) {
  if (entry.startsWith("_") || entry.startsWith(".")) continue;
  const seasonDir = join(SEASONS_DIR, entry);
  if (!statSync(seasonDir).isDirectory()) continue;

  const playersPath = join(seasonDir, "players.json");
  const logsPath = join(seasonDir, "gamelogs.json");
  if (!existsSync(playersPath) || !existsSync(logsPath)) {
    console.warn(`⚠ ${entry}: missing players.json or gamelogs.json — skipping`);
    continue;
  }

  let players;
  try {
    players = JSON.parse(readFileSync(playersPath, "utf8"));
  } catch (e) {
    console.warn(`⚠ ${entry}: players.json unreadable — skipping (${e.message})`);
    continue;
  }
  if (!Array.isArray(players) || players.length === 0) {
    console.warn(`⚠ ${entry}: players.json empty — skipping`);
    continue;
  }

  const logs = JSON.parse(readFileSync(logsPath, "utf8"));
  const playersBytes = statSync(playersPath).size;
  const logsBytes = statSync(logsPath).size;

  seasons.push({
    key: entry,
    label: seasonLabel(entry),
    playerCount: players.length,
    logCount: logs.length,
    playersBytes,
    logsBytes,
  });
}

const manifest = {
  generatedAt: new Date().toISOString(),
  seasons,
};

const manifestPath = join(SEASONS_DIR, "_manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`✅ Wrote manifest with ${seasons.length} season(s)`);
const totalPlayers = seasons.reduce((s, x) => s + x.playerCount, 0);
const totalLogs = seasons.reduce((s, x) => s + x.logCount, 0);
const totalPlayersMb = seasons.reduce((s, x) => s + x.playersBytes, 0) / 1024 / 1024;
const totalLogsMb = seasons.reduce((s, x) => s + x.logsBytes, 0) / 1024 / 1024;
console.log(`   ${totalPlayers.toLocaleString()} player-seasons, ${totalLogs.toLocaleString()} logs total`);
console.log(`   ${totalPlayersMb.toFixed(1)} MB players + ${totalLogsMb.toFixed(1)} MB logs`);
// Lexical key sort puts 9697 after 2425 — for human-readable range output,
// re-sort by chronological start year derived from the label.
const chrono = [...seasons].sort((a, b) => Number(a.label.slice(0, 4)) - Number(b.label.slice(0, 4)));
console.log(`   range: ${chrono[0].label} → ${chrono[chrono.length - 1].label}`);

function seasonLabel(key) {
  const k = String(key).padStart(4, "0");
  const a = Number(k.slice(0, 2));
  const b = Number(k.slice(2, 4));
  // 96+97 → "1996-97"; 23+24 → "2023-24"; 99+00 → "1999-00"; 00+01 → "2000-01"
  const aCentury = a >= 50 ? "19" : "20";
  const bCentury = a >= 50 && b >= 50 ? "19" : a < 50 ? "20" : "20";
  return `${aCentury}${k.slice(0, 2)}-${k.slice(2, 4)}`;
}
