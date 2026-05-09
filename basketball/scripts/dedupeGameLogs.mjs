/**
 * dedupeGameLogs.mjs
 *
 * Removes duplicate (basePlayerId, date) rows from each season's
 * gamelogs.json. The original 2-season extractor double-wrote some
 * games (e.g. 2425 had 27 duplicate dates for one player). The new
 * leaguegamelog-based extractor doesn't have this issue, but we still
 * need a one-time scrub.
 *
 * Idempotent. Flags: --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");

const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] === true;

const seasons = readdirSync(SEASONS_DIR).filter(e => {
  if (e.startsWith("_") || e.startsWith(".")) return false;
  return statSync(join(SEASONS_DIR, e)).isDirectory();
}).sort();

let totalKept = 0, totalDropped = 0;
const summary = [];

for (const k of seasons) {
  const logsPath = join(SEASONS_DIR, k, "gamelogs.json");
  if (!existsSync(logsPath)) continue;
  const logs = JSON.parse(readFileSync(logsPath, "utf8"));
  const seen = new Set();
  const kept = [];
  for (const l of logs) {
    const key = `${l.basePlayerId}|${l.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(l);
  }
  const dropped = logs.length - kept.length;
  totalKept += kept.length;
  totalDropped += dropped;
  summary.push({ k, before: logs.length, after: kept.length, dropped });
  if (!dryRun && dropped > 0) {
    writeFileSync(logsPath, JSON.stringify(kept, null, 2));
  }
}

console.log("key    before    after   dropped");
for (const s of summary) {
  if (s.dropped === 0) continue;
  console.log(`${s.k}    ${String(s.before).padStart(5)}    ${String(s.after).padStart(5)}    ${String(s.dropped).padStart(5)}`);
}
console.log(`\nTotal: ${totalKept + totalDropped} → ${totalKept} (${totalDropped} dups removed)`);
if (dryRun) console.log("\n[dry-run] no files written");
else console.log("\n✅ dedupe complete");

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    out[k] = v ?? true;
  }
  return out;
}
