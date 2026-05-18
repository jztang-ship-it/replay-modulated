#!/usr/bin/env node
/**
 * calibrateWinTiers.mjs — Per-season win-tier threshold calibration.
 *
 * For each season, simulates 10k hands of "balanced" play (random pick from
 * the 5 highest-salary affordable players per slot — models a thoughtful
 * player who picks recognizable stars but doesn't strictly optimize).
 * Derives ROOKIE/STARTER/ALL_STAR/MVP/LEGEND thresholds at fixed percentiles
 * of that season's FP distribution so every season feels equally winnable.
 *
 * Target rates (balanced player):
 *   ROOKIE   p55  → 45% cash rate
 *   STARTER  p75  → 25%
 *   ALL_STAR p88  → 12%
 *   MVP      p95  →  5%
 *   LEGEND   p98  →  2%
 *
 * Outputs:
 *   basketball/src/data/winThresholds.json — runtime (imported by payoutLogic)
 *   basketball/public/data/winThresholds.json — audit copy (same file)
 *
 * Run after data refresh or after changing the FP scoring formula.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SEASONS_DIR = resolve(ROOT, "basketball/public/data/seasons");
const POSITIONS_FILE = resolve(ROOT, "basketball/public/data/nba-positions.json");
const OUT_RUNTIME = resolve(ROOT, "basketball/src/data/winThresholds.json");
const OUT_PUBLIC = resolve(ROOT, "basketball/public/data/winThresholds.json");

const ROSTER_SLOTS = ["PG", "SG", "SF", "PF", "C", "FLEX"];
const CAP = 250;
const SALARY_MIN = 5;
const HANDS = 10000;
const PERCENTILES = { ROOKIE: 55, STARTER: 75, ALL_STAR: 88, MVP: 95, LEGEND: 98 };

// Absolute floors per tier. Pre-2003 NBA had compressed stat output (slower
// pace, fewer assists/3pt attempts) so raw percentile thresholds came in
// far too low — e.g. 1996-97 LEGEND landed at 139 FP, meaning any single
// 40-pt night could hit "GOAT tier." Floors ensure LEGEND means something
// even when the era's balanced-player ceiling is naturally lower; the
// trade is that LEGEND in old eras is rare (you must outperform the era).
const TIER_FLOORS = { ROOKIE: 150, STARTER: 175, ALL_STAR: 205, MVP: 235, LEGEND: 260 };
// Minimum gap between consecutive tiers. Prevents MVP and LEGEND from
// landing within ~10 FP of each other (an issue in dense modern-era
// percentile outputs and ALL old-era outputs).
const MIN_TIER_GAP = 15;
const TIER_ORDER = ["ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];

// FP formula MUST match the runtime scoring engine. Updates to either should
// be mirrored in the other; otherwise calibration drifts.
function approxFp(s) {
  return (s.pts ?? 0) + 1.2 * (s.reb ?? 0) + 1.5 * (s.ast ?? 0)
       + 3 * (s.stl ?? 0) + 3 * (s.blk ?? 0) - (s.turnovers ?? 0);
}
function badgeBonus(s) {
  let b = 0;
  const cats = [s.pts, s.reb, s.ast, s.stl, s.blk].filter(v => (v ?? 0) >= 10);
  if (cats.length >= 4) b += 25;
  else if (cats.length >= 3) b += 10;
  else if (cats.length >= 2) b += 3;
  if ((s.pts ?? 0) >= 50) b += 15;
  else if ((s.pts ?? 0) >= 40) b += 5;
  return b;
}
function fp(s) { return approxFp(s) + badgeBonus(s); }

// Models a "balanced" recipient — recognizes stars, but doesn't max-stack
// the roster. Picks from a wider band than the strict top-5 to mimic the
// real slate generator's mix of anchors + supporting cast + filler. The
// previous top-5 picker over-fit eras with deeper mid-tier talent
// (1819+, where ~12 mid-priced stars fit under the cap together) and
// drove ROOKIE thresholds 50+ FP above neighbouring seasons despite
// near-identical underlying log distributions. Top-12 is wide enough to
// reach genuine fillers and produces consistent bal_mean across eras.
const PICK_BAND = 12;
function pickRoster(byPos, pool, rng) {
  const used = new Set(), roster = [];
  let totalSal = 0;
  for (const slot of ROSTER_SLOTS) {
    const candidates = (slot === "FLEX" ? pool : (byPos[slot] ?? [])).filter(p => !used.has(p.id));
    if (!candidates.length) continue;
    const remaining = ROSTER_SLOTS.length - roster.length - 1;
    const affordable = candidates.filter(p => totalSal + p.salary <= CAP - remaining * SALARY_MIN);
    const final = affordable.length ? affordable : candidates;
    const sorted = [...final].sort((a, b) => b.salary - a.salary);
    const pick = sorted[Math.floor(rng() * Math.min(sorted.length, PICK_BAND))];
    roster.push(pick);
    used.add(pick.id);
    totalSal += pick.salary;
  }
  return roster;
}

function main() {
  const positions = JSON.parse(readFileSync(POSITIONS_FILE, "utf8"));
  const seasons = readdirSync(SEASONS_DIR).filter(d => /^\d{4}$/.test(d)).sort();
  console.log(`[calibrate] ${HANDS} hands × ${seasons.length} seasons`);

  const out = {};
  for (const s of seasons) {
    const players = JSON.parse(readFileSync(join(SEASONS_DIR, s, "players.json"), "utf8"));
    const logs = JSON.parse(readFileSync(join(SEASONS_DIR, s, "gamelogs.json"), "utf8"));
    const logsByPlayer = new Map();
    for (const l of logs) {
      if (!logsByPlayer.has(l.basePlayerId)) logsByPlayer.set(l.basePlayerId, []);
      logsByPlayer.get(l.basePlayerId).push(l);
    }
    const pool = players
      .filter(p => logsByPlayer.has(p.basePlayerId))
      .map(p => ({
        id: p.basePlayerId,
        position: positions[p.name]?.position?.toUpperCase() ?? "PG",
        salary: Math.max(SALARY_MIN, Number(p.salary ?? 0)),
        logs: logsByPlayer.get(p.basePlayerId),
      }));
    const byPos = {};
    for (const p of pool) (byPos[p.position] ??= []).push(p);

    const rng = (() => { let x = 42 + s.charCodeAt(0); return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; })();
    const fps = [];
    for (let i = 0; i < HANDS; i++) {
      const roster = pickRoster(byPos, pool, rng);
      let hfp = 0;
      for (const player of roster) {
        const log = player.logs[Math.floor(rng() * player.logs.length)];
        hfp += fp(log.stats ?? {});
      }
      fps.push(hfp);
    }
    fps.sort((a, b) => a - b);
    const pct = (p) => Math.round(fps[Math.floor(fps.length * p / 100)]);
    const raw = {
      ROOKIE: pct(PERCENTILES.ROOKIE),
      STARTER: pct(PERCENTILES.STARTER),
      ALL_STAR: pct(PERCENTILES.ALL_STAR),
      MVP: pct(PERCENTILES.MVP),
      LEGEND: pct(PERCENTILES.LEGEND),
    };
    // Apply tier floors + minimum-gap enforcement. Walk top-to-bottom so
    // each tier respects both its absolute floor and a gap above the
    // previous tier's final value.
    let prev = 0;
    const final = {};
    for (const tier of TIER_ORDER) {
      const gapFloor = prev > 0 ? prev + MIN_TIER_GAP : 0;
      final[tier] = Math.max(raw[tier], TIER_FLOORS[tier], gapFloor);
      prev = final[tier];
    }
    out[s] = final;
    const meanFp = fps.reduce((a, b) => a + b, 0) / fps.length;
    const note = TIER_ORDER.some(t => final[t] !== raw[t]) ? " (floored)" : "";
    console.log(`  ${s}: bal_mean=${meanFp.toFixed(0)}  R=${final.ROOKIE} S=${final.STARTER} A=${final.ALL_STAR} M=${final.MVP} L=${final.LEGEND}${note}`);
  }

  const json = JSON.stringify(out, null, 2) + "\n";
  writeFileSync(OUT_RUNTIME, json, "utf8");
  writeFileSync(OUT_PUBLIC, json, "utf8");
  console.log(`\nWrote ${OUT_RUNTIME}`);
  console.log(`Wrote ${OUT_PUBLIC}`);
}

main();
