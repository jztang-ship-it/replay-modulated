#!/usr/bin/env node
// scripts/build-boss-bands.mjs
//
// Phase 2-mount step-1: per-season boss bands (parity-by-construction).
//
// THE PRINCIPLE: a challenge locks a season; the boss's target/band derives from
// THAT season — not a global modern simulation. This Monte-Carlos a per-season
// lineup-FP distribution and takes [P60,P85] as the band, so a boss rolled into
// its own season's band is fair-by-construction against a recipient drafting from
// the same season.
//
// PARITY: lineup FP is computed with bossData.canonicalFp — proven equal to the
// play-path resolveEngine FP (boss-fp-parity.test.ts; fpScale=1, same fns+config,
// _position, dailyBonus excluded). Same scoring method as the boss roll
// (rollGames: a uniformly-random qualifying game per card).
//
// METHOD (replicates the global band's runSimulator construction): random legal
// lineup = 5 distinct random players from the season's eligible pool whose stored
// salaries sum ≤ the $250 cap; each card scores a uniformly-random qualifying
// game (canonicalFp). Validated by reproducing the modern global band (~132–159.6
// on 2425) within tolerance — if 2425 drifts far from that, the model is wrong.
//
// TWO-STEP EDIT RITUAL: this script is the only writer of bossBands.generated.json.
// To change bands: edit here / the inputs, run `npm run build:boss-bands`, and
// commit the regenerated JSON. The drift-guard test byte-matches the committed
// artifact to a fresh run (same pattern as bossBank.generated.json).
//
// Run:  npm run build:boss-bands   (then commit the regenerated JSON)

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { canonicalFp, qualifies, MIN_MINUTES, REPO } from "../basketball/src/tools/bossData.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ARTIFACT_PATH = resolve(HERE, "../api/boss/_lib/bossBands.generated.json");
const SEASONS_DIR = resolve(REPO, "basketball/public/data/seasons");

const SALARY_CAP = 250; // basketballConfig.salaryCap
const ROSTER_SIZE = 5;
const N_LINEUPS = 20000;
const P_LO = 60, P_HI = 85;
// RE-ANCHOR (2026-06-26): the band now calibrates against OPTIMISED play
// (best-N-of-roster), not random legal lineups. Daily band = [P25, P40] of the
// season's best-N realised distribution (≈75%→60% win vs optimised play); P50 is
// the marquee target (≈50% win). bestN selection = the cap-constrained max-Σ-projFp
// lineup; realised spread = each starter scores a uniformly-random qualifying game.
const P_FLOOR = 25, P_CEIL = 40, P_MID = 50;
const MIN_GAMES_THIS_SEASON = 30; // matches the game's getEligiblePool (and the global band's runSimulator eligibility) — parity, not tuning
const SEED = 1729;

// Distinct seasons for the 15 candidate bosses (TOR-0001 + PHI-0001 share 0001).
export const BAND_SEASONS = [
  "0001", "0102", "0304", "0607", "0708", "1011", "1314",
  "1516", "1920", "2021", "2223", "2425", "9697", "9798",
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pctile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];
}

// Exact 0/1 knapsack: EXACTLY `size` distinct players, salary sum <= cap, maximise
// total projFp (meanFp) — the expected-value-optimal lineup ("optimised play").
// Stores the actual distinct player-index set per (k,c) so reconstruction is
// distinct-safe (parent pointers are not). Salaries rounded to int for the DP.
function bestNLineup(pool, cap, size) {
  const NEG = -Infinity;
  const dp = Array.from({ length: size + 1 }, () => new Float64Array(cap + 1).fill(NEG));
  const setOf = Array.from({ length: size + 1 }, () => new Array(cap + 1).fill(null));
  dp[0][0] = 0; setOf[0][0] = [];
  for (let pi = 0; pi < pool.length; pi++) {
    const s = Math.round(pool[pi].salary), m = pool[pi].meanFp;
    if (s <= 0 || s > cap) continue;
    for (let k = size; k >= 1; k--) for (let c = cap; c >= s; c--) {
      const prev = dp[k - 1][c - s];
      if (prev !== NEG && prev + m > dp[k][c]) { dp[k][c] = prev + m; setOf[k][c] = [...setOf[k - 1][c - s], pi]; }
    }
  }
  let bestC = -1, bestV = NEG;
  for (let c = 0; c <= cap; c++) if (dp[size][c] > bestV) { bestV = dp[size][c]; bestC = c; }
  return setOf[size][bestC].map((i) => pool[i]);
}
// Realised-FP distribution of a FIXED lineup (each card scores a uniformly-random
// qualifying game — identical scoring to the boss roll / random band).
function mcFixed(lineup, n, rng) {
  const t = [];
  for (let i = 0; i < n; i++) { let fp = 0; for (const pl of lineup) fp += pl.gamePool[Math.floor(rng() * pl.gamePool.length)]; t.push(fp); }
  return t.sort((a, b) => a - b);
}

/** Build the eligible draft pool for a season: per player {id, salary, meanFp, gamePool}.
 *  Exported for the step-3 beatability analysis (same pool the band uses). */
export function buildSeasonPool(season) {
  const dir = resolve(SEASONS_DIR, season);
  const players = JSON.parse(readFileSync(resolve(dir, "players.json"), "utf8"));
  const logs = JSON.parse(readFileSync(resolve(dir, "gamelogs.json"), "utf8"));
  const posById = new Map();
  const salById = new Map();
  const nameById = new Map();
  for (const p of players) {
    posById.set(String(p.basePlayerId), String(p.position ?? ""));
    salById.set(String(p.basePlayerId), Number(p.salary ?? 0));
    nameById.set(String(p.basePlayerId), String(p.name ?? ""));
  }
  const poolById = new Map();
  const totalGames = new Map(); // ALL games (eligibility), vs qualifying games (scoring pool)
  for (const l of logs) {
    const id = String(l.basePlayerId ?? "");
    const pos = posById.get(id);
    if (!pos) continue;
    totalGames.set(id, (totalGames.get(id) ?? 0) + 1);
    const stats = l.stats ?? {};
    if (!qualifies(stats)) continue;
    (poolById.get(id) ?? poolById.set(id, []).get(id)).push(canonicalFp(stats, pos));
  }
  const pool = [];
  for (const [id, gamePool] of poolById) {
    const salary = salById.get(id) ?? 0;
    // Eligibility = ≥30 games this season (the game's getEligiblePool rule);
    // scoring pool = qualifying games (≥MIN_MINUTES). Need ≥1 to roll from.
    if (salary <= 0) continue;
    if ((totalGames.get(id) ?? 0) < MIN_GAMES_THIS_SEASON) continue;
    if (gamePool.length < 1) continue;
    const meanFp = gamePool.reduce((a, b) => a + b, 0) / gamePool.length;
    pool.push({ id, name: nameById.get(id) ?? "", salary, meanFp, gamePool });
  }
  return pool;
}

/** Monte-Carlo the season's BEST-N (optimised-play) realised-FP distribution →
 *  lo=P25 (daily floor, ~75% win), hi=P40 (daily ceiling, ~60% win), p50=P50
 *  (marquee target, ~50% win). bestN lineup is deterministic; the spread is the
 *  realised game-variance of that one optimal lineup. */
function bandForSeason(season, rng) {
  const pool = buildSeasonPool(season);
  if (pool.length < ROSTER_SIZE * 4) throw new Error(`thin pool for ${season}: ${pool.length}`);
  const lineup = bestNLineup(pool, SALARY_CAP, ROSTER_SIZE);
  const totals = mcFixed(lineup, N_LINEUPS, rng);
  return {
    lo: Math.round(pctile(totals, P_FLOOR) * 10) / 10,
    hi: Math.round(pctile(totals, P_CEIL) * 10) / 10,
    p50: Math.round(pctile(totals, P_MID) * 10) / 10,
    mean: Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10,
    poolSize: pool.length,
    n: totals.length,
  };
}

export function buildBossBandsArtifact() {
  const rng = mulberry32(SEED);
  const bands = {};
  for (const season of BAND_SEASONS) bands[season] = bandForSeason(season, rng);
  return {
    _meta: {
      method: "per-season BEST-N (optimised-play) realised-FP Monte-Carlo; bestN=cap-constrained max-Σ-projFp lineup, scored by uniformly-random qualifying game (FP=bossData.canonicalFp, play-parity); daily band=[P25,P40], marquee target=P50",
      cap: SALARY_CAP, rosterSize: ROSTER_SIZE, nLineups: N_LINEUPS, seed: SEED,
      pFloor: P_FLOOR, pCeil: P_CEIL, pMid: P_MID, minGamesThisSeason: MIN_GAMES_THIS_SEASON,
      generatedBy: "scripts/build-boss-bands.mjs",
      note: "Regenerate via `npm run build:boss-bands` + commit. Drift-guarded byte-match. Re-anchored 2026-06-26 from random-legal to best-N optimised play.",
    },
    bands,
  };
}

export function bossBandsArtifactString() {
  return JSON.stringify(buildBossBandsArtifact()) + "\n";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const obj = buildBossBandsArtifact();
  writeFileSync(ARTIFACT_PATH, JSON.stringify(obj) + "\n");
  console.log("wrote", ARTIFACT_PATH, "\n");
  // Validation anchor: best-N 2425 daily band ≈ [197, 209], marquee P50 ≈ 217
  // (from the re-anchor recon). Drift far from that → the model is wrong.
  const m = obj.bands["2425"];
  console.log(`VALIDATION 2425 best-N daily [${m.lo}, ${m.hi}] marquee ${m.p50} (mean ${m.mean}) vs recon ~[197, 209]/217 — pool ${m.poolSize}`);
  console.log("\nper-season best-N bands (daily [P25,P40] / marquee P50):");
  for (const s of BAND_SEASONS) {
    const b = obj.bands[s];
    console.log(`  ${s}  [${String(b.lo).padStart(6)}, ${String(b.hi).padStart(6)}]  mq ${String(b.p50).padStart(6)}  mean ${String(b.mean).padStart(6)}  pool ${b.poolSize}`);
  }
}
