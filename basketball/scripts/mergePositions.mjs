/**
 * mergePositions.mjs
 *
 * Walks every per-season players.json and merges the `position` /
 * `positionFull` fields from basketball/public/data/nba-positions.json
 * (a name-keyed lookup built from nba.com player profiles).
 *
 * Why: extractNbaSeason.mjs always wrote position="" because the
 * leaguegamelog endpoint doesn't carry position. The merge step from
 * the positions lookup never ran on the seasons-archive files, so every
 * card in the runtime fell through SportAdapter.normalizePosition()
 * to "PG" — making every card display PG.
 *
 * Idempotent: re-running on a file that already has positions is a no-op
 * unless the lookup has a new entry.
 *
 * Usage:
 *   node basketball/scripts/mergePositions.mjs
 *   node basketball/scripts/mergePositions.mjs --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");
const POSITIONS_PATH = join(__dirname, "..", "public", "data", "nba-positions.json");

const dryRun = process.argv.includes("--dry-run");

const positions = JSON.parse(readFileSync(POSITIONS_PATH, "utf8"));
console.log(`📋 Lookup table: ${Object.keys(positions).length} player names\n`);

const seasonKeys = readdirSync(SEASONS_DIR).filter(e => {
  if (e.startsWith("_") || e.startsWith(".")) return false;
  return statSync(join(SEASONS_DIR, e)).isDirectory();
}).sort();

let totalUpdated = 0;
let totalMissed = 0;
const missedSample = new Set();

for (const key of seasonKeys) {
  const playersPath = join(SEASONS_DIR, key, "players.json");
  if (!existsSync(playersPath)) continue;
  const players = JSON.parse(readFileSync(playersPath, "utf8"));
  let updated = 0;
  let missed = 0;
  for (const p of players) {
    const lookup = positions[p.name];
    if (lookup?.position) {
      if (p.position !== lookup.position || p.positionFull !== (lookup.positionFull ?? lookup.position)) {
        p.position = lookup.position;
        p.positionFull = lookup.positionFull ?? lookup.position;
        updated++;
      }
    } else {
      missed++;
      if (missedSample.size < 20) missedSample.add(p.name);
    }
  }
  if (!dryRun && updated > 0) {
    writeFileSync(playersPath, JSON.stringify(players, null, 2));
  }
  console.log(`${key}: updated=${updated.toString().padStart(4)}  missed=${missed.toString().padStart(4)}  total=${players.length}`);
  totalUpdated += updated;
  totalMissed += missed;
}

console.log(`\nTOTAL: ${totalUpdated} positions written, ${totalMissed} player-seasons missing from lookup`);
if (missedSample.size > 0) {
  console.log(`\nSample missed names (first ${missedSample.size}):`);
  for (const n of [...missedSample].sort().slice(0, 20)) console.log(`  ${n}`);
}
console.log(`\n${dryRun ? "(dry-run — no files written)" : "✅ Files updated."}`);
