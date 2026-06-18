#!/usr/bin/env node
/**
 * slateAwareThresholds.ts — Per-season threshold derivation, slate-aware.
 *
 * Same method as deriveThresholds.ts (Task 6) but the per-hand sim uses the
 * production deal pipeline: 60-player daily slate via getCachedSlate, then
 * generateRoster(positionAware: false), then uniform log sampling. Date
 * rotated per hand to capture the cross-day aggregate. Eligibility filter:
 * ≥30 games played (mirrors production's getEligiblePool).
 *
 * Cumulative percentile cuts at 35 / 72.5 / 94 / 98 / 99.8. Rounded to
 * integer. Re-applied to verify tier shares hit the target bands.
 *
 * Run from basketball/:
 *   npx tsx src/tools/slateAwareThresholds.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRoster, mulberry32 } from "../../../shared/engines/rosterEngine";
import { resolveCards } from "../../../shared/engines/resolveEngine";
import { getCachedSlate, _resetSlateCache } from "../../../shared/utils/slateSelector";
import { buildDailyBonusMap } from "../../../shared/utils/dailyBonus";
import { computeBasketballCareerFp } from "../adapters/careerFp";
import { computeBasketballFp } from "../adapters/fantasyPoints";
import { computeBasketballBadges } from "../adapters/badges";
import { BasketballSportConfig } from "../adapters/basketballConfig";
import type { PlayerEval, EconomyConfig, TierColor, SlotRequirement } from "../../../shared/types";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = path.resolve(HERE, "../../public/data/seasons");

const ECONOMY_CONFIG: EconomyConfig = {
  capMax: 250, salaryMin: 5, salaryMax: 95,
  salaryRatioCeiling: 1.60, salaryRatioFloor: 0.40,
  tierThresholds: [
    { tier: "RED" as TierColor, minSalary: 73 },
    { tier: "ORANGE" as TierColor, minSalary: 58 },
    { tier: "PURPLE" as TierColor, minSalary: 44 },
    { tier: "BLUE" as TierColor, minSalary: 30 },
    { tier: "GREEN" as TierColor, minSalary: 20 },
  ],
};

const FLEX_SLOTS: SlotRequirement[] = ["FLEX", "FLEX", "FLEX", "FLEX", "FLEX"];
const ROSTER_CONFIG = {
  rosterSize: 5, slotRequirements: FLEX_SLOTS,
  excludeFromFlex: [] as string[], positionAware: false,
};
const HANDS = 10000;
const MIN_MINUTES_LOG = 10;
const MIN_GAMES_THIS_SEASON = 30;

const TIER_POOL_CAPS: Record<string, number> = { BLUE: 40, GREEN: 25, WHITE: 20 };
const SLATE_COMPOSITION = {
  tierRanges: {
    RED:    [2, 3]   as [number, number], ORANGE: [8, 12]  as [number, number],
    PURPLE: [12, 20] as [number, number], BLUE:   [8, 18]  as [number, number],
    GREEN:  [6, 12]  as [number, number], WHITE:  [8, 12]  as [number, number],
  },
  protectedTier: "PURPLE", absorbTiers: ["BLUE", "GREEN"],
};

const CUM_PCT = { ROOKIE: 35.0, STARTER: 72.5, ALL_STAR: 94.0, MVP: 98.0, LEGEND: 99.8 };
const TARGET: Record<string, [number, number]> = {
  BUST:     [0.30,  0.40],   ROOKIE:   [0.35,  0.40],
  STARTER:  [0.18,  0.25],   ALL_STAR: [0.03,  0.05],
  MVP:      [0.01,  0.02],   LEGEND:   [0.001, 0.003],
};
const TIER_ORDER = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"] as const;

// Task 6 full-pool thresholds (for the 2425 comparison row).
const TASK6_2425 = { ROOKIE: 174, STARTER: 203, ALL_STAR: 233, MVP: 249, LEGEND: 276 };

// ── FP / badges via production helpers (sim-production parity). ─────────────
// The resolve sim builds a ResolveAdapter that delegates to the same pure
// helpers that basketball/src/adapters/SportAdapter.ts calls in production.
// pickBiasedLog (called from resolveCards) handles tier-aware filtering;
// no log pre-filter at season-load.
const RESOLVE_ADAPTER = {
  computeFantasyPoints: (stats: Record<string, any>) =>
    computeBasketballFp(stats, BasketballSportConfig.projectionWeights),
  computeBadges: (stats: Record<string, any>) =>
    computeBasketballBadges(stats, (BasketballSportConfig as any).badges ?? []),
};
// Career-FP helper still needs a "is this log countable" probe to decide
// eligibility; uses positive-minutes only (the broader of the two tier
// filters) so any player who could resolve a premium-tier card is eligible.
function hasAnyPositiveMinutesLog(logs: any[]): boolean {
  for (const l of logs) {
    const s = l?.stats ?? {};
    const hasPositive = Object.values(s).some((v: any) => typeof v === "number" && v > 0);
    if (!hasPositive) continue;
    const mp = s.mp ?? s.minutes ?? s.min ?? s.MIN ?? s.minutesPlayed;
    if (mp === undefined || mp === null) return true; // no minute field → trust stats
    const str = String(mp);
    const mins = str.includes(":") ? parseFloat(str.split(":")[0]) : parseFloat(str);
    if (Number.isFinite(mins) && mins > 0) return true;
  }
  return false;
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

// ── Season data ───────────────────────────────────────────────────────────
interface SeasonData {
  season: string;
  playerById: Map<string, any>;
  logsByPlayerRaw: Map<string, any[]>;       // unfiltered — fed to resolveCards (production's filter is at resolve)
  eligible: string[];
  careerFpById: Map<string, number>;         // via production helper
  byTier: Map<string, string[]>;
}
function loadSeason(season: string): SeasonData {
  const seasonDir = path.join(SEASONS_DIR, season);
  const playersJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "players.json"), "utf8"));
  const logsJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "gamelogs.json"), "utf8"));

  const totalGamesById = new Map<string, number>();
  const logsByPlayerRaw = new Map<string, any[]>();     // unfiltered — production resolveCards/pickBiasedLog filters at resolve time
  for (const l of logsJson) {
    const k = String(l.basePlayerId ?? "");
    if (!k) continue;
    totalGamesById.set(k, (totalGamesById.get(k) ?? 0) + 1);
    if (!logsByPlayerRaw.has(k)) logsByPlayerRaw.set(k, []);
    logsByPlayerRaw.get(k)!.push(l);
  }
  const playerById = new Map<string, any>();
  for (const p of playersJson) {
    const id = String(p.basePlayerId ?? p.id ?? "");
    if (!id) continue;
    playerById.set(id, p);
  }
  // Eligibility: salary > 0, ≥30 games this season, has at least one log
  // with positive minutes (the broader of the two tier-aware filters in
  // production's pickBiasedLog). Cards whose logs are all sub-10-min will
  // still get drawn — they resolve to 0 FP for non-premium tiers, which
  // matches production's pickBiasedLog returning null.
  const eligible: string[] = [];
  for (const [id, p] of playerById) {
    if (!(p.salary > 0)) continue;
    if ((totalGamesById.get(id) ?? 0) < MIN_GAMES_THIS_SEASON) continue;
    const logs = logsByPlayerRaw.get(id) ?? [];
    if (!hasAnyPositiveMinutesLog(logs)) continue;
    eligible.push(id);
  }
  // Career FP via production's computeBasketballCareerFp helper. Walks the
  // RAW (unfiltered) logs map — matches production's dataEngine, which
  // builds its index from pre-filter logs and lets getCareerFPById see
  // sub-10-min appearances.
  const careerFpById = new Map<string, number>();
  for (const id of eligible) {
    careerFpById.set(id, computeBasketballCareerFp(id, logsByPlayerRaw,
      stats => computeBasketballFp(stats, BasketballSportConfig.projectionWeights)));
  }
  const byTier = new Map<string, string[]>();
  for (const id of eligible) {
    const t = String(playerById.get(id)?.tier ?? "WHITE").toUpperCase();
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(id);
  }
  return { season, playerById, logsByPlayerRaw, eligible, careerFpById, byTier };
}

// ── Inline SlateAdapter ───────────────────────────────────────────────────
function makeSlateAdapter(season: string, data: SeasonData) {
  return {
    sportKey: "basketball", rosterSize: 5,
    config: { slateSize: 60, anchorCount: 9, weightExponent: 1.0 },
    getCareerFPById(id: string): number { return data.careerFpById.get(id) ?? 0; },
    getTierById(id: string): string {
      return String(data.playerById.get(id)?.tier ?? "WHITE").toUpperCase();
    },
    getTierPool(tier: string): string[] {
      const ids = data.byTier.get(tier) ?? [];
      const ranked = [...ids].sort((a, b) => (data.careerFpById.get(b) ?? 0) - (data.careerFpById.get(a) ?? 0));
      const cap = TIER_POOL_CAPS[tier];
      return cap !== undefined ? ranked.slice(0, cap) : ranked;
    },
    getAnchors(count: number = 9): string[] {
      return [...data.eligible].sort(
        (a, b) => (data.careerFpById.get(b) ?? 0) - (data.careerFpById.get(a) ?? 0)
      ).slice(0, count);
    },
    slateComposition: SLATE_COMPOSITION,
    getEligiblePool(): string[] { return data.eligible; },
    getThemedEligibility(_t: string): string[] | null { return null; },
    getExclusionList(): string[] { return []; },
    getCacheNamespace(): string { return season; },
  };
}

function buildEvalFromIds(ids: string[], data: SeasonData, season: string): PlayerEval[] {
  const out: PlayerEval[] = [];
  for (const id of ids) {
    const p = data.playerById.get(id);
    if (!p) continue;
    if (!(p.salary > 0)) continue;
    const logs = data.logsByPlayerRaw.get(id) ?? [];
    if (!hasAnyPositiveMinutesLog(logs)) continue;
    out.push({
      id, basePlayerId: id, personKey: id, cardId: id + "_card",
      name: String(p.name ?? ""), team: String(p.team ?? ""),
      season, position: String(p.position ?? "PG").toUpperCase(),
      photoCode: String(p.photoCode ?? ""),
      projectedFp: Number(p.projectedFp ?? p.avgFP ?? 0),
      salary: Math.max(5, Number(p.salary)),
      tier: String(p.tier ?? "WHITE").toUpperCase() as TierColor,
    });
  }
  return out;
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
  const data = loadSeason(season);
  if (data.eligible.length < 6) return null;

  // Slate-mode seed (matches slateAwareCalibrate.ts so distributions align).
  const rngSeed = 1_000_000 + 42
    + season.charCodeAt(0) * 257 + season.charCodeAt(1) * 31
    + (season.charCodeAt(2) ?? 0) * 13 + (season.charCodeAt(3) ?? 0);
  const rng = mulberry32(rngSeed);
  const adapter = makeSlateAdapter(season, data);
  _resetSlateCache();
  const baseDate = new Date("2020-01-01T00:00:00Z").getTime();
  const DAY_MS = 86_400_000;

  const fps: number[] = [];
  for (let i = 0; i < HANDS; i++) {
    const date = new Date(baseDate + i * DAY_MS);
    const slateIds = getCachedSlate(adapter as any, date);
    const evalPool = buildEvalFromIds(slateIds, data, season);
    if (evalPool.length < 6) continue;
    const roster = generateRoster(evalPool, ROSTER_CONFIG, ECONOMY_CONFIG, rng);
    if (roster.length < 6) continue;
    // Daily bonus: production picks 3 slate-eligible players per UTC day
    // (+20/+10/+5 FP, ORANGE/PURPLE/BLUE/GREEN only). Build the pool from
    // the same slate that fed the deal; buildDailyBonusMap handles tier
    // filter + deterministic shuffle + bonus assignment. Each sim hand is
    // a fresh UTC day → fresh rotation.
    const bonusPool: Array<{ basePlayerId: string; name: string; tier: string }> = [];
    for (const id of slateIds) {
      const p = data.playerById.get(id);
      if (!p) continue;
      bonusPool.push({
        basePlayerId: id,
        name: String(p.name ?? ""),
        tier: String(p.tier ?? "WHITE").toUpperCase(),
      });
    }
    const dailyBonusMap = buildDailyBonusMap(bonusPool, date);
    // Production-parity resolve: real resolveCards / pickBiasedLog. The
    // tier-aware minutes filter (premium ≥ 0, non-premium ≥ 10) lives
    // inside pickBiasedLog, so the sim sees the same log distribution
    // production does. minMinutes: 10 mirrors basketball's
    // historicalLogFilters.minMinutes (basketballConfig.ts).
    const { resolved } = resolveCards(
      roster,
      data.logsByPlayerRaw,
      { fpScale: 1, minMinutes: MIN_MINUTES_LOG, dailyBonusMap },
      RESOLVE_ADAPTER,
      rng,
    );
    let handFp = 0;
    for (const c of resolved) handFp += c.actualFp;
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
  return { season, poolSize: data.eligible.length, fps, meanFp, rawCuts, thresholds, shares, fit };
}

// ── Output ────────────────────────────────────────────────────────────────
const COL_W = 7;
const SEP = " | ";
function fmt(v: string | number, w = COL_W): string { return String(v).padStart(w); }
function fmtShare(pct: number, ok: boolean): string {
  return (pct * 100).toFixed(2).padStart(5) + "% " + (ok ? "✓" : "✗");
}

const OUT_RUNTIME = path.resolve(HERE, "../../src/data/winThresholds.json");
const OUT_PUBLIC = path.resolve(HERE, "../../public/data/winThresholds.json");

function main() {
  const args = process.argv.slice(2);
  const writeJson = args.includes("--write");

  const seasons = fs.readdirSync(SEASONS_DIR).filter(d => /^\d{4}$/.test(d)).sort();
  console.log(`[slate-thresholds] ${HANDS} hands × ${seasons.length} seasons  slate-aware (production-faithful)${writeJson ? "  [WRITE]" : ""}\n`);

  const rows: SeasonResult[] = [];
  for (const s of seasons) {
    const r = runSeason(s);
    if (r) rows.push(r);
  }

  // Main table
  const headers = [
    fmt("Sn"), fmt("mean"), fmt("R_min"), fmt("S_min"), fmt("A_min"), fmt("M_min"), fmt("L_min"),
    "BUST".padStart(9), "ROOKIE".padStart(9), "STARTER".padStart(9),
    "ALL_STAR".padStart(9), "MVP".padStart(9), "LEGEND".padStart(9),
  ];
  console.log(headers.join(SEP));
  console.log("-".repeat(headers.join(SEP).length));
  for (const r of rows) {
    const t = r.thresholds, s = r.shares;
    const cols = [
      fmt(r.season), r.meanFp.toFixed(1).padStart(COL_W),
      fmt(t.ROOKIE), fmt(t.STARTER), fmt(t.ALL_STAR), fmt(t.MVP), fmt(t.LEGEND),
      fmtShare(s.BUST, r.fit.BUST), fmtShare(s.ROOKIE, r.fit.ROOKIE),
      fmtShare(s.STARTER, r.fit.STARTER), fmtShare(s.ALL_STAR, r.fit.ALL_STAR),
      fmtShare(s.MVP, r.fit.MVP), fmtShare(s.LEGEND, r.fit.LEGEND),
    ];
    console.log(cols.join(SEP));
  }

  // Summary
  const fullPass = rows.filter(r => TIER_ORDER.every(t => r.fit[t])).length;
  console.log(`\n${fullPass}/${rows.length} seasons hit all 6 target bands.`);

  // Misses
  const misses = rows.filter(r => !TIER_ORDER.every(t => r.fit[t]));
  if (misses.length) {
    console.log(`\nMARGINAL MISSES — seasons with any tier outside target band:`);
    for (const r of misses) {
      const bad = TIER_ORDER.filter(t => !r.fit[t]);
      const parts = bad.map(t => {
        const [lo, hi] = TARGET[t];
        const v = r.shares[t];
        const dir = v > hi ? `over ceiling by ${((v - hi) * 100).toFixed(2)}pp` : `under floor by ${((lo - v) * 100).toFixed(2)}pp`;
        return `${t}=${(v * 100).toFixed(2)}% (${dir})`;
      });
      console.log(`  ${r.season}: ${parts.join(", ")}`);
    }
  } else {
    console.log(`\nNo marginal misses — every season's thresholds hit every tier band cleanly.`);
  }

  // 2425 focused comparison
  const r2425 = rows.find(r => r.season === "2425");
  if (r2425) {
    console.log(`\n=== 2425 (active production season) — full-pool (Task 6) vs slate-aware (this) ===`);
    const cmpHeaders = ["tier", "full-pool", "slate", "Δ"];
    console.log(cmpHeaders.map(h => h.padStart(11)).join(SEP));
    console.log("-".repeat(cmpHeaders.length * (11 + SEP.length) - SEP.length));
    const tiers = ["ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"] as const;
    for (const t of tiers) {
      const fullVal = TASK6_2425[t];
      const slateVal = r2425.thresholds[t];
      const delta = slateVal - fullVal;
      const sign = delta >= 0 ? "+" : "";
      console.log([t.padStart(11), String(fullVal).padStart(11), String(slateVal).padStart(11), (sign + String(delta)).padStart(11)].join(SEP));
    }
  }

  // Tight tier gaps
  console.log(`\nTIER GAPS check (flag any gap < 5 FP between adjacent thresholds):`);
  let anyTight = false;
  for (const r of rows) {
    const t = r.thresholds;
    const gaps = {
      "R→S": t.STARTER - t.ROOKIE,
      "S→A": t.ALL_STAR - t.STARTER,
      "A→M": t.MVP - t.ALL_STAR,
      "M→L": t.LEGEND - t.MVP,
    };
    const tight = Object.entries(gaps).filter(([_, g]) => g < 5);
    if (tight.length) {
      anyTight = true;
      console.log(`  ${r.season}: ${tight.map(([k, g]) => `${k}=${g}`).join(", ")} (full gaps R→S=${gaps["R→S"]}, S→A=${gaps["S→A"]}, A→M=${gaps["A→M"]}, M→L=${gaps["M→L"]})`);
    }
  }
  if (!anyTight) console.log(`  No tight gaps — every adjacent-tier gap is ≥ 5 FP across all 29 seasons.`);

  // Threshold spread sanity
  const rs = rows.map(r => r.thresholds.ROOKIE).sort((a, b) => a - b);
  const ls = rows.map(r => r.thresholds.LEGEND).sort((a, b) => a - b);
  console.log(`\nThreshold spread across 29 seasons:`);
  console.log(`  ROOKIE: ${rs[0]} – ${rs[rs.length - 1]}  (median ${rs[Math.floor(rs.length / 2)]})`);
  console.log(`  LEGEND: ${ls[0]} – ${ls[ls.length - 1]}  (median ${ls[Math.floor(ls.length / 2)]})`);

  if (writeJson) {
    const out: Record<string, { ROOKIE: number; STARTER: number; ALL_STAR: number; MVP: number; LEGEND: number }> = {};
    for (const r of rows) out[r.season] = r.thresholds;
    const json = JSON.stringify(out, null, 2) + "\n";
    fs.writeFileSync(OUT_RUNTIME, json, "utf8");
    fs.writeFileSync(OUT_PUBLIC, json, "utf8");
    console.log(`\nWrote ${OUT_RUNTIME}`);
    console.log(`Wrote ${OUT_PUBLIC}`);
  }
}

main();
