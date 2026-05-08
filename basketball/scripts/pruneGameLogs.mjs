/**
 * pruneGameLogs.mjs
 *
 * Trims `seasons/{key}/gamelogs.json` to drop log rows for players that
 * were removed by `prunePlayersByGames.mjs`. The players.json files are
 * the source of truth — anything whose `basePlayerId` is no longer in
 * the season's players.json gets dropped from the logs.
 *
 * Idempotent: a second run is a no-op.
 *
 * Run order:
 *   1. node basketball/scripts/prunePlayersByGames.mjs   (must run first)
 *   2. node basketball/scripts/pruneGameLogs.mjs
 *
 * Flags: --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");

const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] === true;

const seasonKeys = readdirSync(SEASONS_DIR).filter(e => {
  if (e.startsWith("_") || e.startsWith(".")) return false;
  return statSync(join(SEASONS_DIR, e)).isDirectory();
}).sort();

console.log(`🔍 Pruning gamelogs across ${seasonKeys.length} seasons\n`);

const summary = [];
let totalKept = 0;
let totalDropped = 0;

for (const key of seasonKeys) {
  const seasonDir = join(SEASONS_DIR, key);
  const playersPath = join(seasonDir, "players.json");
  const logsPath = join(seasonDir, "gamelogs.json");
  if (!existsSync(playersPath) || !existsSync(logsPath)) {
    console.log(`⏩ ${key} — missing files, skipping`);
    continue;
  }

  const players = JSON.parse(readFileSync(playersPath, "utf8"));
  const logs = JSON.parse(readFileSync(logsPath, "utf8"));

  const keptIds = new Set(players.map(p => String(p.basePlayerId ?? "")).filter(Boolean));

  const kept = logs.filter(l => keptIds.has(String(l.basePlayerId ?? "")));
  const dropped = logs.length - kept.length;

  summary.push({ key, before: logs.length, after: kept.length, dropped });
  totalKept += kept.length;
  totalDropped += dropped;

  if (!dryRun) {
    writeFileSync(logsPath, JSON.stringify(kept, null, 2));
  }
}

console.log("Per-season:");
console.log("  key    before    after  dropped");
for (const s of summary) {
  console.log(
    `  ${s.key}    ${String(s.before).padStart(5)}    ${String(s.after).padStart(5)}    ${String(s.dropped).padStart(5)}`
  );
}
const totalBefore = totalKept + totalDropped;
console.log(`\nTotal: ${totalBefore} → ${totalKept} (${totalDropped} dropped, ${(100 * totalDropped / totalBefore).toFixed(1)}%)`);

if (dryRun) {
  console.log("\n[dry-run] no files written");
} else {
  console.log("\n✅ gamelogs.json files rewritten");
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    out[k] = v ?? true;
  }
  return out;
}
