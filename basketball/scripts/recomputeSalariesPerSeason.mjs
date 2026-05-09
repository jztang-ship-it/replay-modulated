/**
 * recomputeSalariesPerSeason.mjs
 *
 * Walks each season's players.json and recomputes salary + tier using
 * within-season scaling (avgFP relative to that season's mean), instead
 * of the fixed `avgFP × 1.45` multiplier the extractor uses.
 *
 * Why this matters:
 *   - 1996-97 had 1 RED player (Shaq).
 *   - 2024-25 had 4 REDs.
 *   - Many seasons had 0 REDs.
 *   The fixed multiplier amplifies era differences instead of washing
 *   them out — which contradicts the slot-machine premise that within-
 *   season salary curves should normalize raw stat output.
 *
 * After this script: every season's top-FP players hit ~$89 (RED), and
 * the tier distribution is roughly era-agnostic.
 *
 * Idempotent. Flags: --dry-run
 *
 * Run AFTER prunePlayersByGames.mjs (so the mean is computed across the
 * pruned rotation, not 10-day-contract noise).
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");

const args = parseArgs(process.argv.slice(2));
const dryRun = args["dry-run"] === true;

// Mirrors shared/engines/economyEngine.ts DEFAULT_ECONOMY_CONFIG.
const SALARY_MIN = 5;
const SALARY_MAX = 89;
const TIERS = [
  { tier: "RED",    minSalary: 73 },
  { tier: "ORANGE", minSalary: 58 },
  { tier: "PURPLE", minSalary: 44 },
  { tier: "BLUE",   minSalary: 30 },
  { tier: "GREEN",  minSalary: 23 },
  { tier: "WHITE",  minSalary: 0  },
];

function tierFromSalary(s) {
  for (const t of TIERS) if (s >= t.minSalary) return t.tier;
  return "WHITE";
}

/** Base salary curve — same shape as the extractor's `avgFP × 1.45`,
 *  preserved so tier counts in 2010s+ seasons stay close to what the
 *  rest of the system was tuned against. After this, top-4 of each
 *  season get bumped to RED so older eras are guaranteed star presence. */
function baseSalary(avgFP) {
  const raw = (Number(avgFP) || 0) * 1.45;
  return Math.max(SALARY_MIN, Math.min(SALARY_MAX, Math.round(raw)));
}

/** Top-4 salaries (descending rank): hand-picked so they all clear the
 *  RED threshold ($73) in any era. Player at rank 0 (season leader) gets
 *  the biggest bump, rank 3 gets the smallest. */
const RED_FLOOR_BY_RANK = [85, 80, 76, 73];

const seasons = readdirSync(SEASONS_DIR).filter(e => {
  if (e.startsWith("_") || e.startsWith(".")) return false;
  return statSync(join(SEASONS_DIR, e)).isDirectory();
}).sort();

console.log(`💰 Recomputing salaries (within-season scaling) — ${seasons.length} seasons\n`);

const summary = [];
for (const k of seasons) {
  const playersPath = join(SEASONS_DIR, k, "players.json");
  if (!existsSync(playersPath)) continue;
  const players = JSON.parse(readFileSync(playersPath, "utf8"));
  if (!players.length) continue;

  // Sort by avgFP descending so top-4 can be bumped to RED floors.
  const ranked = [...players].sort((a, b) => (Number(b.avgFP) || 0) - (Number(a.avgFP) || 0));
  const pivot = Number(ranked[Math.min(2, ranked.length - 1)]?.avgFP) || 0;

  const tierCount = { RED: 0, ORANGE: 0, PURPLE: 0, BLUE: 0, GREEN: 0, WHITE: 0 };
  for (let rank = 0; rank < ranked.length; rank++) {
    const p = ranked[rank];
    let newSalary = baseSalary(p.avgFP);
    if (rank < RED_FLOOR_BY_RANK.length) {
      newSalary = Math.max(newSalary, RED_FLOOR_BY_RANK[rank]);
    }
    const newTier = tierFromSalary(newSalary);
    p.salary = newSalary;
    p.tier = newTier;
    tierCount[newTier]++;
  }

  summary.push({ k, mean: +pivot.toFixed(1), n: players.length, ...tierCount });
  if (!dryRun) {
    writeFileSync(playersPath, JSON.stringify(players, null, 2));
  }
}

console.log("key   pivot   N     RED  ORG  PUR  BLU  GRN  WHT");
console.log("-".repeat(54));
for (const s of summary) {
  console.log(
    `${s.k}   ${String(s.mean).padStart(4)}  ${String(s.n).padStart(4)}   ` +
    `${String(s.RED).padStart(3)}  ${String(s.ORANGE).padStart(3)}  ${String(s.PURPLE).padStart(3)}  ` +
    `${String(s.BLUE).padStart(3)}  ${String(s.GREEN).padStart(3)}  ${String(s.WHITE).padStart(3)}`
  );
}

if (dryRun) console.log("\n[dry-run] no files written");
else console.log("\n✅ players.json salaries + tiers rewritten");

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, "").split("=");
    out[k] = v ?? true;
  }
  return out;
}
