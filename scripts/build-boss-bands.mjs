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

/** Monte-Carlo the season's random-legal-lineup FP distribution → [P60,P85]. */
function bandForSeason(season, rng) {
  const pool = buildSeasonPool(season);
  if (pool.length < ROSTER_SIZE * 4) throw new Error(`thin pool for ${season}: ${pool.length}`);
  const totals = [];
  for (let i = 0; i < N_LINEUPS; i++) {
    // random legal lineup: 5 distinct under cap (re-pick on over-cap, like runSimulator's cap check)
    let cost = 0, picked = [];
    const used = new Set();
    let guard = 0;
    while (picked.length < ROSTER_SIZE && guard++ < 200) {
      const c = pool[Math.floor(rng() * pool.length)];
      if (used.has(c.id)) continue;
      if (cost + c.salary > SALARY_CAP) continue;
      used.add(c.id); picked.push(c); cost += c.salary;
    }
    if (picked.length < ROSTER_SIZE) continue;
    let fp = 0;
    for (const c of picked) fp += c.gamePool[Math.floor(rng() * c.gamePool.length)];
    totals.push(fp);
  }
  totals.sort((a, b) => a - b);
  return {
    lo: Math.round(pctile(totals, P_LO) * 10) / 10,
    hi: Math.round(pctile(totals, P_HI) * 10) / 10,
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
      method: "per-season random-legal-lineup Monte-Carlo; FP=bossData.canonicalFp (play-parity); band=[P60,P85]",
      cap: SALARY_CAP, rosterSize: ROSTER_SIZE, nLineups: N_LINEUPS, seed: SEED,
      pLo: P_LO, pHi: P_HI, minGamesThisSeason: MIN_GAMES_THIS_SEASON,
      generatedBy: "scripts/build-boss-bands.mjs",
      note: "Regenerate via `npm run build:boss-bands` + commit. Drift-guarded byte-match.",
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
  // Validation anchor: modern season 2425 should reproduce the global band (~132–159.6).
  const m = obj.bands["2425"];
  console.log(`VALIDATION 2425 band [${m.lo}, ${m.hi}] (mean ${m.mean}) vs global [132, 159.6] — pool ${m.poolSize}`);
  console.log("\nper-season bands:");
  for (const s of BAND_SEASONS) {
    const b = obj.bands[s];
    console.log(`  ${s}  [${String(b.lo).padStart(6)}, ${String(b.hi).padStart(6)}]  mean ${String(b.mean).padStart(6)}  pool ${b.poolSize}`);
  }
}
