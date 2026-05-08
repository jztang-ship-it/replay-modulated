/**
 * calibrationCheckPerSeason.mjs
 *
 * Per-season win-tier calibration check. For each season, simulates
 * 5000 random salary-weighted rosters and reports FP distribution +
 * tier hit rates. The point: confirm the within-season salary curve
 * neutralizes era differences enough that one set of fixed-FP win
 * tiers (LIVE thresholds) works across 1996 → 2024.
 *
 * Method (matches shared/tools/runSimulator's loop, condensed):
 *   1. Load season's players.json + gamelogs.json
 *   2. Compute each player's avg FP from logs
 *   3. Build a within-season salary using salaryFromProjection
 *   4. Deal 8-player rosters at random subject to $250 cap
 *   5. Per dealt roster, draw a random log per player → compute team FP
 *   6. Aggregate; report per-tier hit rate against fixed LIVE thresholds
 *
 * Pure analytics — no files written. Run from basketball/.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = join(__dirname, "..", "public", "data", "seasons");
const N = parseInt(process.argv[2] ?? "5000", 10);

// Per BASKETBALL_WIN_TIERS in basketball/src/utils/payoutLogic.ts
const LIVE_TIERS = [
  { tier: "ROOKIE",   minFP: 185 },
  { tier: "STARTER",  minFP: 205 },
  { tier: "ALL_STAR", minFP: 225 },
  { tier: "MVP",      minFP: 235 },
  { tier: "LEGEND",   minFP: 255 },
];

// Basketball weights — kept in sync with basketballConfig.projectionWeights.
const WEIGHTS = { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, turnovers: -1 };
const SALARY_CAP = 250, SALARY_MIN = 5, SALARY_MAX = 65;
const SALARY_FLOOR_RATIO = 0.3, SALARY_CEILING_RATIO = 2.0;
const ROSTER_SIZE = 8;

function fp(stats) {
  let s = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) s += (Number(stats?.[k] ?? 0)) * w;
  return Math.max(0, s);
}

function salaryFor(proj, mean) {
  const ratio = proj / Math.max(mean, 1);
  const t = Math.max(0, Math.min(1, (ratio - SALARY_FLOOR_RATIO) / (SALARY_CEILING_RATIO - SALARY_FLOOR_RATIO)));
  return Math.max(SALARY_MIN, Math.min(SALARY_MAX, Math.round(SALARY_MIN + t * (SALARY_MAX - SALARY_MIN))));
}

function pct(arr, p) { return arr[Math.min(Math.floor(arr.length * p / 100), arr.length - 1)] ?? 0; }
function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function analyzeSeason(key) {
  const playersPath = join(SEASONS_DIR, key, "players.json");
  const logsPath = join(SEASONS_DIR, key, "gamelogs.json");
  if (!existsSync(playersPath) || !existsSync(logsPath)) return null;

  const players = JSON.parse(readFileSync(playersPath, "utf8"));
  const logs = JSON.parse(readFileSync(logsPath, "utf8"));

  const logMap = new Map();
  for (const l of logs) {
    const id = String(l.basePlayerId ?? "");
    if (!id) continue;
    if (!logMap.has(id)) logMap.set(id, []);
    logMap.get(id).push(l);
  }

  const projById = new Map();
  for (const p of players) {
    const id = String(p.basePlayerId ?? "");
    const playerLogs = logMap.get(id) ?? [];
    if (!playerLogs.length) continue;
    const fps = playerLogs.map(l => fp(l.stats)).filter(x => x > 0);
    if (!fps.length) continue;
    projById.set(id, avg(fps));
  }
  const meanProj = avg([...projById.values()]);

  const pool = [];
  for (const p of players) {
    const id = String(p.basePlayerId ?? "");
    const proj = projById.get(id);
    if (proj === undefined) continue;
    pool.push({ id, name: p.name, projFp: proj, salary: salaryFor(proj, meanProj) });
  }
  if (pool.length < ROSTER_SIZE * 2) return null;

  // Deal N rosters at random with cap-aware selection (mirrors simulator).
  const rng = makeRng(42);
  const handFps = [];
  for (let i = 0; i < N; i++) {
    const used = new Set();
    let totalSal = 0;
    const roster = [];
    for (let slot = 0; slot < ROSTER_SIZE; slot++) {
      const left = ROSTER_SIZE - roster.length;
      const aff = pool.filter(p => !used.has(p.id) && totalSal + p.salary <= SALARY_CAP - (left - 1) * SALARY_MIN);
      const pickFrom = aff.length ? aff : pool.filter(p => !used.has(p.id));
      const p = pickFrom[Math.floor(rng() * pickFrom.length)];
      if (!p) break;
      roster.push(p);
      used.add(p.id);
      totalSal += p.salary;
    }
    let teamFp = 0;
    for (const p of roster) {
      const playerLogs = logMap.get(p.id);
      const log = playerLogs[Math.floor(rng() * playerLogs.length)];
      teamFp += fp(log.stats);
    }
    handFps.push(teamFp);
  }

  handFps.sort((a, b) => a - b);

  const tierHits = {};
  for (const t of LIVE_TIERS) {
    tierHits[t.tier] = handFps.filter(f => f >= t.minFP).length / N * 100;
  }

  return {
    key,
    nPlayers: pool.length,
    meanProj: +meanProj.toFixed(1),
    p50: +pct(handFps, 50).toFixed(1),
    p90: +pct(handFps, 90).toFixed(1),
    p99: +pct(handFps, 99).toFixed(1),
    max: +handFps[handFps.length - 1].toFixed(1),
    tierHits,
  };
}

const seasons = readdirSync(SEASONS_DIR).filter(e => {
  if (e.startsWith("_") || e.startsWith(".")) return false;
  return statSync(join(SEASONS_DIR, e)).isDirectory();
}).sort();

console.log(`🎲 ${N} simulated rosters per season — ${seasons.length} seasons\n`);
console.log("Tiers (per BASKETBALL_WIN_TIERS): ROOKIE=185, STARTER=205, ALL_STAR=225, MVP=235, LEGEND=255\n");

const header = "key  ".padEnd(7) + "Nplayers".padStart(9) + "p50".padStart(7) + "p90".padStart(7) + "p99".padStart(7) + "max".padStart(7) +
  LIVE_TIERS.map(t => t.tier.padStart(11)).join("");
console.log(header);
console.log("-".repeat(header.length));

const allRows = [];
for (const k of seasons) {
  const r = analyzeSeason(k);
  if (!r) { console.log(`${k}  (skipped)`); continue; }
  allRows.push(r);
  const tierCells = LIVE_TIERS.map(t => (r.tierHits[t.tier].toFixed(1) + "%").padStart(11)).join("");
  console.log(
    `${k}  `.padEnd(7) +
    String(r.nPlayers).padStart(9) +
    String(r.p50).padStart(7) +
    String(r.p90).padStart(7) +
    String(r.p99).padStart(7) +
    String(r.max).padStart(7) +
    tierCells
  );
}

// Aggregate
console.log("\n=== ACROSS ALL SEASONS ===");
for (const t of LIVE_TIERS) {
  const rates = allRows.map(r => r.tierHits[t.tier]);
  const min = Math.min(...rates), max = Math.max(...rates), mean = avg(rates);
  const ratio = min > 0 ? (max / min).toFixed(2) : "∞";
  console.log(`  ${t.tier.padEnd(9)} hit rate: min=${min.toFixed(1)}%  mean=${mean.toFixed(1)}%  max=${max.toFixed(1)}%  ratio=${ratio}x`);
}
const meanP90 = avg(allRows.map(r => r.p90));
const minP90 = Math.min(...allRows.map(r => r.p90));
const maxP90 = Math.max(...allRows.map(r => r.p90));
console.log(`\n  Hand p90 across seasons: ${minP90.toFixed(1)} → ${maxP90.toFixed(1)}  (mean ${meanP90.toFixed(1)})`);
const meanP99 = avg(allRows.map(r => r.p99));
const minP99 = Math.min(...allRows.map(r => r.p99));
const maxP99 = Math.max(...allRows.map(r => r.p99));
console.log(`  Hand p99 across seasons: ${minP99.toFixed(1)} → ${maxP99.toFixed(1)}  (mean ${meanP99.toFixed(1)})`);
