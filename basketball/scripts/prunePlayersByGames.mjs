/**
 * prunePlayersByGames.mjs
 *
 * Tightens the per-season players.json files by removing low-GP entries —
 * the cup-of-coffee guys, 10-day contracts, end-of-bench DNP-CDs that
 * survived the original `>= 3 games` threshold but aren't real rotation
 * players in any meaningful sense.
 *
 * Threshold: `>= 30% of that season's length`. Scaled by season because
 * a flat number breaks the 1998-99 lockout (50 games) and 2019-20 COVID
 * stop (~70 games) — 30% of those seasons is 15 / 21 respectively, which
 * is a fair "made it out of the call-up bucket" floor.
 *
 * Idempotent: re-running on already-pruned files is a no-op.
 *
 * Inputs (read):
 *   basketball/public/data/seasons/{key}/gamelogs.json — for game count
 *   basketball/public/data/seasons/{key}/players.json — for entries to keep/drop
 *
 * Outputs:
 *   basketball/public/data/seasons/{key}/players.json (rewritten in place)
 *
 * Usage:
 *   node basketball/scripts/prunePlayersByGames.mjs
 *   node basketball/scripts/prunePlayersByGames.mjs --threshold-pct=25
 *   node basketball/scripts/prunePlayersByGames.mjs --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");

const args = parseArgs(process.argv.slice(2));
const thresholdPct = Number(args["threshold-pct"] ?? 30);
const dryRun = args["dry-run"] === true;
const minFloor = 5; // never go below this even for very short tournament-style seasons

const seasonKeys = readdirSync(SEASONS_DIR).filter(e => {
  if (e.startsWith("_") || e.startsWith(".")) return false;
  return statSync(join(SEASONS_DIR, e)).isDirectory();
}).sort();

console.log(`🔍 Pruning ${seasonKeys.length} seasons at threshold = ${thresholdPct}% of season length\n`);

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

  // Count games per player. A "game" is any log row for that player —
  // gamelogs already filtered DNPs at extract time.
  const gamesByPid = new Map();
  for (const log of logs) {
    const pid = String(log.basePlayerId ?? "");
    if (!pid) continue;
    gamesByPid.set(pid, (gamesByPid.get(pid) ?? 0) + 1);
  }

  // Season length proxy: max GP across all players (the leader plays nearly
  // the full schedule). For 82-game seasons this lands at 82±2; for
  // shortened seasons it scales naturally.
  const seasonLength = Math.max(...gamesByPid.values(), 0);
  const threshold = Math.max(minFloor, Math.round(seasonLength * thresholdPct / 100));

  const kept = players.filter(p => {
    const pid = String(p.basePlayerId ?? "");
    const games = gamesByPid.get(pid) ?? 0;
    return games >= threshold;
  });
  const dropped = players.length - kept.length;

  summary.push({
    key,
    seasonLength,
    threshold,
    before: players.length,
    after: kept.length,
    dropped,
  });
  totalKept += kept.length;
  totalDropped += dropped;

  if (!dryRun) {
    writeFileSync(playersPath, JSON.stringify(kept, null, 2));
  }
}

// ── Report ────────────────────────────────────────────────────────────────
console.log("Per-season:");
console.log("  key   season_len  threshold  before  after  dropped");
for (const s of summary) {
  console.log(
    `  ${s.key}      ${String(s.seasonLength).padStart(3)}        ${String(s.threshold).padStart(3)}     ${String(s.before).padStart(4)}   ${String(s.after).padStart(4)}    ${String(s.dropped).padStart(3)}`
  );
}
const totalBefore = totalKept + totalDropped;
console.log(`\nTotal: ${totalBefore} → ${totalKept} (${totalDropped} dropped, ${(100 * totalDropped / totalBefore).toFixed(1)}%)`);

if (dryRun) {
  console.log("\n[dry-run] no files written");
} else {
  console.log("\n✅ players.json files rewritten");
  console.log("\nNext: re-run downloadHeadshots.mjs / uploadHeadshots.mjs if you want to clean up orphans.");
  console.log("Or leave the orphan headshots in place — they're harmless.");
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    out[k] = v ?? true;
  }
  return out;
}
