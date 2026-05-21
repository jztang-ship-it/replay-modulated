#!/usr/bin/env node
/**
 * deriveThresholds.ts — Per-season tier-threshold derivation.
 *
 * For each season under basketball/public/data/seasons/, runs 10000 hands
 * of the position-agnostic no-hold sim (same seed strategy as
 * dumpFpDistribution.ts so the FP arrays are identical), computes
 * cumulative percentile cuts at p35 / p72.5 / p94 / p98 / p99.8, rounds
 * each cut to nearest integer, then re-applies the rounded cuts and
 * reports the actual tier shares + per-tier fit against the target bands.
 *
 * Independent per-season — no cross-season averaging, no floors, no
 * min-gap enforcement. Each season's thresholds are derived from its own
 * raw distribution.
 *
 * Run from basketball/:
 *   npx tsx src/tools/deriveThresholds.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRoster, mulberry32 } from "../../../shared/engines/rosterEngine";
import type { PlayerEval, EconomyConfig, TierColor, SlotRequirement } from "../../../shared/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = path.resolve(HERE, "../../public/data/seasons");

const ECONOMY_CONFIG: EconomyConfig = {
  capMax: 250,
  salaryMin: 5,
  salaryMax: 95,
  salaryRatioCeiling: 1.60,
  salaryRatioFloor: 0.40,
  tierThresholds: [
    { tier: "RED" as TierColor, minSalary: 73 },
    { tier: "ORANGE" as TierColor, minSalary: 58 },
    { tier: "PURPLE" as TierColor, minSalary: 44 },
    { tier: "BLUE" as TierColor, minSalary: 30 },
    { tier: "GREEN" as TierColor, minSalary: 20 },
  ],
};

const FLEX_SLOTS: SlotRequirement[] = ["FLEX", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"];
const ROSTER_CONFIG = {
  rosterSize: 6,
  slotRequirements: FLEX_SLOTS,
  excludeFromFlex: [] as string[],
  positionAware: false,
};

const HANDS = 10000;
const MIN_MINUTES = 10;

// Cumulative percentile cuts for the target tier-share midpoints.
const CUM_PCT = {
  ROOKIE: 35.0,
  STARTER: 72.5,
  ALL_STAR: 94.0,
  MVP: 98.0,
  LEGEND: 99.8,
};

// Target tier-share acceptance bands.
const TARGET: Record<string, [number, number]> = {
  BUST:     [0.30,  0.40],
  ROOKIE:   [0.35,  0.40],
  STARTER:  [0.18,  0.25],
  ALL_STAR: [0.03,  0.05],
  MVP:      [0.01,  0.02],
  LEGEND:   [0.001, 0.003],
};
const TIER_ORDER = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"] as const;

function computeFp(stats: Record<string, any>): number {
  const g = (k: string) => Number(stats[k] ?? stats[k.toLowerCase()] ?? 0);
  return g("pts") * 1.0
       + g("reb") * 1.2
       + g("ast") * 1.5
       + g("stl") * 2.0
       + g("blk") * 2.0
       + g("turnovers") * -1.0;
}
function computeBadgeBonus(stats: Record<string, any>): number {
  const g = (k: string) => Number(stats[k] ?? stats[k.toLowerCase()] ?? 0);
  const pts = g("pts"), reb = g("reb"), ast = g("ast");
  const stl = g("stl"), blk = g("blk"), to = g("turnovers");
  let bonus = 0;
  if (pts >= 50) bonus += 10;
  else if (pts >= 40) bonus += 5;
  else if (pts >= 30) bonus += 2;
  if (reb >= 15) bonus += 5;
  else if (reb >= 10) bonus += 3;
  if (ast >= 15) bonus += 5;
  else if (ast >= 10) bonus += 3;
  if (stl >= 5) bonus += 4;
  else if (stl >= 3) bonus += 2;
  if (blk >= 5) bonus += 4;
  else if (blk >= 3) bonus += 2;
  if (ast >= 10 && to === 0) bonus += 8;
  else if (ast >= 5 && to === 0) bonus += 3;
  if (to >= 6) bonus -= 6;
  else if (to >= 4) bonus -= 3;
  const cats = [pts, reb, ast, stl, blk].filter(v => v >= 10).length;
  if (cats >= 4) bonus += 30;
  else if (cats >= 3) bonus += 8;
  else if (cats >= 2) bonus += 2;
  if ([pts, reb, ast, stl, blk].every(v => v >= 5)) bonus += 15;
  return bonus;
}
function logPlayable(l: any): boolean {
  const s = l?.stats ?? {};
  const hasPositive = Object.values(s).some((v: any) => typeof v === "number" && v > 0);
  if (!hasPositive) return false;
  const mp = s.mp ?? s.minutes ?? s.min ?? s.MIN ?? s.minutesPlayed;
  if (mp !== undefined && mp !== null) {
    const str = String(mp);
    const mins = str.includes(":") ? parseFloat(str.split(":")[0]) : parseFloat(str);
    if (Number.isFinite(mins) && mins < MIN_MINUTES) return false;
  }
  return true;
}

function pctileAt(sorted: number[], p: number): number {
  const i = Math.min(Math.floor(sorted.length * p / 100), sorted.length - 1);
  return sorted[i];
}

function tierOf(fp: number, t: { ROOKIE: number; STARTER: number; ALL_STAR: number; MVP: number; LEGEND: number }): typeof TIER_ORDER[number] {
  if (fp >= t.LEGEND) return "LEGEND";
  if (fp >= t.MVP) return "MVP";
  if (fp >= t.ALL_STAR) return "ALL_STAR";
  if (fp >= t.STARTER) return "STARTER";
  if (fp >= t.ROOKIE) return "ROOKIE";
  return "BUST";
}

interface SeasonResult {
  season: string;
  poolSize: number;
  fps: number[];
  meanFp: number;
  rawCuts: { ROOKIE: number; STARTER: number; ALL_STAR: number; MVP: number; LEGEND: number };
  thresholds: { ROOKIE: number; STARTER: number; ALL_STAR: number; MVP: number; LEGEND: number };
  shares: Record<string, number>;
  fit: Record<string, boolean>;
}

function runSeason(season: string): SeasonResult | null {
  const seasonDir = path.join(SEASONS_DIR, season);
  const playersJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "players.json"), "utf8"));
  const logsJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "gamelogs.json"), "utf8"));

  const logsByPlayer = new Map<string, any[]>();
  for (const l of logsJson) {
    const k = String(l.basePlayerId ?? "");
    if (!k) continue;
    if (!logPlayable(l)) continue;
    if (!logsByPlayer.has(k)) logsByPlayer.set(k, []);
    logsByPlayer.get(k)!.push(l);
  }

  const evalPool: PlayerEval[] = [];
  for (const p of playersJson) {
    const id = String(p.basePlayerId ?? p.id ?? "");
    if (!id) continue;
    if (!(p.salary > 0)) continue;
    if (!logsByPlayer.has(id) || logsByPlayer.get(id)!.length === 0) continue;
    const salary = Math.max(5, Number(p.salary));
    const tier = String(p.tier ?? "WHITE").toUpperCase() as TierColor;
    evalPool.push({
      id, basePlayerId: id, personKey: id, cardId: id + "_card",
      name: String(p.name ?? ""), team: String(p.team ?? ""),
      season, position: String(p.position ?? "PG").toUpperCase(),
      photoCode: String(p.photoCode ?? ""),
      projectedFp: Number(p.projectedFp ?? p.avgFP ?? 0),
      salary, tier,
    });
  }
  if (evalPool.length < 6) return null;

  // Same seed strategy as dumpFpDistribution.ts so distributions match.
  const rng = mulberry32(
    42
    + season.charCodeAt(0) * 257
    + season.charCodeAt(1) * 31
    + (season.charCodeAt(2) ?? 0) * 13
    + (season.charCodeAt(3) ?? 0)
  );
  const fps: number[] = [];
  for (let i = 0; i < HANDS; i++) {
    const roster = generateRoster(evalPool, ROSTER_CONFIG, ECONOMY_CONFIG, rng);
    if (roster.length < 6) continue;
    let handFp = 0;
    for (const card of roster) {
      const cardLogs = logsByPlayer.get(card.basePlayerId) ?? [];
      if (!cardLogs.length) continue;
      const log = cardLogs[Math.floor(rng() * cardLogs.length)];
      const stats = log.stats ?? {};
      handFp += computeFp(stats) + computeBadgeBonus(stats);
    }
    fps.push(handFp);
  }
  if (fps.length < HANDS / 2) return null;
  fps.sort((a, b) => a - b);

  const rawCuts = {
    ROOKIE:   pctileAt(fps, CUM_PCT.ROOKIE),
    STARTER:  pctileAt(fps, CUM_PCT.STARTER),
    ALL_STAR: pctileAt(fps, CUM_PCT.ALL_STAR),
    MVP:      pctileAt(fps, CUM_PCT.MVP),
    LEGEND:   pctileAt(fps, CUM_PCT.LEGEND),
  };
  const thresholds = {
    ROOKIE:   Math.round(rawCuts.ROOKIE),
    STARTER:  Math.round(rawCuts.STARTER),
    ALL_STAR: Math.round(rawCuts.ALL_STAR),
    MVP:      Math.round(rawCuts.MVP),
    LEGEND:   Math.round(rawCuts.LEGEND),
  };
  // Apply rounded thresholds to compute actual shares.
  const counts: Record<string, number> = { BUST: 0, ROOKIE: 0, STARTER: 0, ALL_STAR: 0, MVP: 0, LEGEND: 0 };
  for (const fp of fps) counts[tierOf(fp, thresholds)]++;
  const shares: Record<string, number> = {};
  const fit: Record<string, boolean> = {};
  for (const tier of TIER_ORDER) {
    shares[tier] = counts[tier] / fps.length;
    const [lo, hi] = TARGET[tier];
    fit[tier] = shares[tier] >= lo && shares[tier] <= hi;
  }
  const meanFp = fps.reduce((a, b) => a + b, 0) / fps.length;
  return {
    season, poolSize: evalPool.length, fps, meanFp,
    rawCuts, thresholds, shares, fit,
  };
}

// ── Formatter ─────────────────────────────────────────────────────────────
const COL_W = 7;
const SEP = " | ";

function fmt(v: string | number, w = COL_W): string {
  return String(v).padStart(w);
}
function fmtShare(pct: number, ok: boolean): string {
  return (pct * 100).toFixed(2).padStart(5) + "% " + (ok ? "✓" : "✗");
}

function main() {
  const seasons = fs.readdirSync(SEASONS_DIR).filter(d => /^\d{4}$/.test(d)).sort();
  console.log(`[derive-thresholds] ${HANDS} hands × ${seasons.length} seasons  positionAware: false + uniform sampling\n`);

  const rows: SeasonResult[] = [];
  for (const s of seasons) {
    const row = runSeason(s);
    if (row) rows.push(row);
  }

  // ── Table ──────────────────────────────────────────────────────────────
  const headers = [
    fmt("Sn"), fmt("mean"),
    fmt("R_min"), fmt("S_min"), fmt("A_min"), fmt("M_min"), fmt("L_min"),
    "BUST".padStart(9), "ROOKIE".padStart(9), "STARTER".padStart(9),
    "ALL_STAR".padStart(9), "MVP".padStart(9), "LEGEND".padStart(9),
  ];
  console.log(headers.join(SEP));
  console.log("-".repeat(headers.join(SEP).length));
  for (const r of rows) {
    const cols = [
      fmt(r.season),
      r.meanFp.toFixed(1).padStart(COL_W),
      fmt(r.thresholds.ROOKIE),
      fmt(r.thresholds.STARTER),
      fmt(r.thresholds.ALL_STAR),
      fmt(r.thresholds.MVP),
      fmt(r.thresholds.LEGEND),
      fmtShare(r.shares.BUST,     r.fit.BUST),
      fmtShare(r.shares.ROOKIE,   r.fit.ROOKIE),
      fmtShare(r.shares.STARTER,  r.fit.STARTER),
      fmtShare(r.shares.ALL_STAR, r.fit.ALL_STAR),
      fmtShare(r.shares.MVP,      r.fit.MVP),
      fmtShare(r.shares.LEGEND,   r.fit.LEGEND),
    ];
    console.log(cols.join(SEP));
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const fullPass = rows.filter(r => TIER_ORDER.every(t => r.fit[t])).length;
  console.log(`\n${fullPass}/${rows.length} seasons hit all 6 target bands.`);

  const misses = rows.filter(r => !TIER_ORDER.every(t => r.fit[t]));
  if (misses.length) {
    console.log("\nSeasons with one or more out-of-band tiers:");
    for (const r of misses) {
      const bad = TIER_ORDER.filter(t => !r.fit[t]);
      const parts = bad.map(t => `${t}=${(r.shares[t] * 100).toFixed(2)}% (target ${(TARGET[t][0] * 100).toFixed(1)}–${(TARGET[t][1] * 100).toFixed(1)}%)`);
      console.log(`  ${r.season}: ${parts.join(", ")}`);
    }
  }

  // ── Edge-case probes ───────────────────────────────────────────────────
  const lowPoolSeasons = rows.filter(r => r.poolSize < 250);
  if (lowPoolSeasons.length) {
    console.log(`\nLow-pool seasons (< 250 eligible players, distribution may be less stable):`);
    for (const r of lowPoolSeasons) console.log(`  ${r.season}: pool=${r.poolSize}`);
  }

  // Unusually low ROOKIE threshold (relative to the cohort)
  const allRookies = rows.map(r => r.thresholds.ROOKIE).sort((a, b) => a - b);
  const medRookie = allRookies[Math.floor(allRookies.length / 2)];
  const lowRookieOutliers = rows.filter(r => medRookie - r.thresholds.ROOKIE > 8);
  if (lowRookieOutliers.length) {
    console.log(`\nROOKIE threshold > 8 FP below the 29-season median (${medRookie}):`);
    for (const r of lowRookieOutliers) console.log(`  ${r.season}: ROOKIE=${r.thresholds.ROOKIE} (delta ${r.thresholds.ROOKIE - medRookie})`);
  }
  const highRookieOutliers = rows.filter(r => r.thresholds.ROOKIE - medRookie > 8);
  if (highRookieOutliers.length) {
    console.log(`\nROOKIE threshold > 8 FP above the 29-season median (${medRookie}):`);
    for (const r of highRookieOutliers) console.log(`  ${r.season}: ROOKIE=${r.thresholds.ROOKIE} (delta +${r.thresholds.ROOKIE - medRookie})`);
  }

  // Tier-to-tier gaps — flag if MVP and ALL_STAR end up within 5 FP
  console.log(`\nTier gaps (S-A / A-M / M-L) by season — flag where any gap < 5:`);
  for (const r of rows) {
    const t = r.thresholds;
    const sa = t.ALL_STAR - t.STARTER;
    const am = t.MVP - t.ALL_STAR;
    const ml = t.LEGEND - t.MVP;
    const tight = (sa < 5) || (am < 5) || (ml < 5);
    if (tight) console.log(`  ${r.season}: S→A=${sa}, A→M=${am}, M→L=${ml}`);
  }

  // Spread of LEGEND threshold — sanity for the tail
  const legends = rows.map(r => r.thresholds.LEGEND).sort((a, b) => a - b);
  console.log(`\nLEGEND threshold range across 29 seasons: ${legends[0]} – ${legends[legends.length - 1]}  (median ${legends[Math.floor(legends.length / 2)]})`);
}

main();
