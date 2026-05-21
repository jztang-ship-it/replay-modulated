#!/usr/bin/env node
/**
 * slateAwareCalibrate.ts — Production-faithful threshold calibration sim.
 *
 * Models the production deal pipeline:
 *   1. Per hand, pick a date (rotated daily across the run).
 *   2. Build a minimal SlateAdapter for the season + call getCachedSlate
 *      to get the 60-player daily slate (tier-quota mode: 2-3 RED, 8-12
 *      ORANGE, 12-20 PURPLE, 8-18 BLUE, 6-12 GREEN, 8-12 WHITE → normalized
 *      to slateSize=60).
 *   3. Build a PlayerEval[] from the 60 slate IDs.
 *   4. Call generateRoster(evalPool, positionAware: false) — same as
 *      production after the dealGate.
 *   5. Resolve each card with uniform log sampling.
 *   6. Aggregate.
 *
 * Eligibility filter: ≥30 games played (basketball SportAdapter's
 * MIN_GAMES_THIS_SEASON constant). No repeat-limit modeling — each
 * hand gets a fresh date, so we measure the aggregate cross-day
 * distribution, not within-session dynamics.
 *
 * Outputs:
 *   1. Slate-aware FP distribution table.
 *   2. Full-pool FP distribution table (Task 6 reference).
 *   3. Per-season delta on key percentiles.
 *
 * Run from basketball/:
 *   npx tsx src/tools/slateAwareCalibrate.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateRoster, mulberry32 } from "../../../shared/engines/rosterEngine";
import { resolveCards } from "../../../shared/engines/resolveEngine";
import { getCachedSlate, _resetSlateCache } from "../../../shared/utils/slateSelector";
import { buildDailyBonusMap } from "../../../shared/utils/dailyBonus";
import type { PlayerEval, EconomyConfig, TierColor, SlotRequirement } from "../../../shared/types";
import { computeBasketballCareerFp } from "../adapters/careerFp";
import { computeBasketballFp } from "../adapters/fantasyPoints";
import { computeBasketballBadges } from "../adapters/badges";
import { BasketballSportConfig } from "../adapters/basketballConfig";

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
const MIN_MINUTES_LOG = 10;
const MIN_GAMES_THIS_SEASON = 30;

// Mirror basketball/src/adapters/SportAdapter.ts:371-375
const TIER_POOL_CAPS: Record<string, number> = { BLUE: 40, GREEN: 25, WHITE: 20 };

// Mirror basketball/src/adapters/SportAdapter.ts:379-392
const SLATE_COMPOSITION = {
  tierRanges: {
    RED:    [2, 3]   as [number, number],
    ORANGE: [8, 12]  as [number, number],
    PURPLE: [12, 20] as [number, number],
    BLUE:   [8, 18]  as [number, number],
    GREEN:  [6, 12]  as [number, number],
    WHITE:  [8, 12]  as [number, number],
  },
  protectedTier: "PURPLE",
  absorbTiers: ["BLUE", "GREEN"],
};

// ── FP / badges via production helpers (sim-production parity) ────────────
// The resolve sim builds a ResolveAdapter that delegates to the same pure
// helpers SportAdapter calls in production. resolveCards invokes the real
// pickBiasedLog (with its tier-aware min-minutes filter), so this sim sees
// the same log distribution production does.
const RESOLVE_ADAPTER = {
  computeFantasyPoints: (stats: Record<string, any>) =>
    computeBasketballFp(stats, BasketballSportConfig.projectionWeights),
  computeBadges: (stats: Record<string, any>) =>
    computeBasketballBadges(stats, (BasketballSportConfig as any).badges ?? []),
};
// Eligibility probe — does the player have at least one log with positive
// minutes? Matches the broader of pickBiasedLog's two tier filters.
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

// ── Per-season data load ──────────────────────────────────────────────────
interface SeasonData {
  season: string;
  playerById: Map<string, any>;      // id → players.json record
  logsByPlayerRaw: Map<string, any[]>; // id → unfiltered logs — fed directly to resolveCards
  totalGamesById: Map<string, number>;
  eligible: string[];                // ids: salary > 0 + ≥ MIN_GAMES_THIS_SEASON games + has ≥1 positive-minutes log
  careerFpById: Map<string, number>; // id → career FP via production helper (last-2-seasons × 2 weight)
  byTier: Map<string, string[]>;     // tier → eligible ids
}

function loadSeason(season: string): SeasonData {
  const seasonDir = path.join(SEASONS_DIR, season);
  const playersJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "players.json"), "utf8"));
  const logsJson: any[] = JSON.parse(fs.readFileSync(path.join(seasonDir, "gamelogs.json"), "utf8"));

  const totalGamesById = new Map<string, number>();
  const logsByPlayerRaw = new Map<string, any[]>();       // unfiltered — production resolveCards/pickBiasedLog applies the filter at resolve time
  for (const l of logsJson) {
    const k = String(l.basePlayerId ?? "");
    if (!k) continue;
    // Total-games count uses ALL logs in the file. Mirrors production's
    // getEligiblePool which counts log rows verbatim.
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

  // Eligibility: ≥30 games this season AND salary > 0 AND ≥1 log with
  // positive minutes (broader of the two tier-aware filters — anything
  // resolvable for at least premium tiers).
  const eligible: string[] = [];
  for (const [id, p] of playerById) {
    if (!(p.salary > 0)) continue;
    if ((totalGamesById.get(id) ?? 0) < MIN_GAMES_THIS_SEASON) continue;
    const logs = logsByPlayerRaw.get(id) ?? [];
    if (!hasAnyPositiveMinutesLog(logs)) continue;
    eligible.push(id);
  }

  // Career FP via production's computeBasketballCareerFp helper.
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

  return { season, playerById, logsByPlayerRaw, totalGamesById, eligible, careerFpById, byTier };
}

// ── Minimal SlateAdapter inline ───────────────────────────────────────────
function makeSlateAdapter(season: string, data: SeasonData) {
  return {
    sportKey: "basketball",
    rosterSize: 6,
    config: { slateSize: 60, anchorCount: 9, weightExponent: 1.0 },

    getCareerFPById(playerId: string): number {
      return data.careerFpById.get(playerId) ?? 0;
    },
    getTierById(playerId: string): string {
      const p = data.playerById.get(playerId);
      return String(p?.tier ?? "WHITE").toUpperCase();
    },
    getTierPool(tier: string): string[] {
      const ids = data.byTier.get(tier) ?? [];
      // Rank by career FP desc (production helper — matches SportAdapter.getCareerFPById).
      const ranked = [...ids].sort(
        (a, b) => (data.careerFpById.get(b) ?? 0) - (data.careerFpById.get(a) ?? 0)
      );
      const cap = TIER_POOL_CAPS[tier];
      return cap !== undefined ? ranked.slice(0, cap) : ranked;
    },
    getAnchors(count: number = 9): string[] {
      // Not used in tier-quota mode (slateSelector branches before calling
      // this when getTierPool + slateComposition are present), but required
      // by the SlateAdapter interface.
      const all = [...data.eligible].sort(
        (a, b) => (data.careerFpById.get(b) ?? 0) - (data.careerFpById.get(a) ?? 0)
      );
      return all.slice(0, count);
    },
    slateComposition: SLATE_COMPOSITION,

    // CacheableAdapter additions
    getEligiblePool(): string[] { return data.eligible; },
    getThemedEligibility(_themeKey: string): string[] | null { return null; },
    getExclusionList(): string[] { return []; },
    getCacheNamespace(): string { return season; },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function buildEvalFromIds(ids: string[], data: SeasonData, season: string): PlayerEval[] {
  const out: PlayerEval[] = [];
  for (const id of ids) {
    const p = data.playerById.get(id);
    if (!p) continue;
    if (!(p.salary > 0)) continue;
    const logs = data.logsByPlayerRaw.get(id) ?? [];
    if (!hasAnyPositiveMinutesLog(logs)) continue;
    const salary = Math.max(5, Number(p.salary));
    const tier = String(p.tier ?? "WHITE").toUpperCase() as TierColor;
    out.push({
      id, basePlayerId: id, personKey: id, cardId: id + "_card",
      name: String(p.name ?? ""), team: String(p.team ?? ""),
      season, position: String(p.position ?? "PG").toUpperCase(),
      photoCode: String(p.photoCode ?? ""),
      projectedFp: Number(p.projectedFp ?? p.avgFP ?? 0),
      salary, tier,
    });
  }
  return out;
}

function buildFullEvalPool(data: SeasonData, season: string): PlayerEval[] {
  // Full eligible pool — what Task 6 (full-pool reference) used.
  return buildEvalFromIds(data.eligible, data, season);
}

// ── Run a single season under one mode ────────────────────────────────────
interface SeasonResult {
  season: string;
  poolSize: number;
  fps: number[];
  meanFp: number;
}

function runSeason(season: string, mode: "slate" | "full"): SeasonResult | null {
  const data = loadSeason(season);
  if (data.eligible.length < 6) {
    console.warn(`  ${season}: only ${data.eligible.length} eligible — SKIPPED`);
    return null;
  }

  // Same seed strategy as Task 6 — reproducible per (season, mode).
  const rngSeed = (mode === "slate" ? 1_000_000 : 0)
    + 42
    + season.charCodeAt(0) * 257
    + season.charCodeAt(1) * 31
    + (season.charCodeAt(2) ?? 0) * 13
    + (season.charCodeAt(3) ?? 0);
  const rng = mulberry32(rngSeed);

  const fps: number[] = [];
  let skipped = 0;

  // Production-parity resolve: real resolveCards / pickBiasedLog. Tier-aware
  // minutes filter (premium ≥ 0, non-premium ≥ 10) is applied inside
  // pickBiasedLog. minMinutes: 10 mirrors basketballConfig.historicalLogFilters.
  // Slate mode also passes dailyBonusMap so the +20/+10/+5 daily-bonus
  // bonuses are applied additively, matching production. Full mode is the
  // pre-slate baseline and keeps no daily bonus for clean comparison.
  const processRoster = (roster: any[], dailyBonusMap?: Map<string, number>) => {
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
  };

  if (mode === "full") {
    const evalPool = buildFullEvalPool(data, season);
    for (let i = 0; i < HANDS; i++) {
      const roster = generateRoster(evalPool, ROSTER_CONFIG, ECONOMY_CONFIG, rng);
      if (roster.length < 6) { skipped++; continue; }
      processRoster(roster);
    }
  } else {
    const adapter = makeSlateAdapter(season, data);
    _resetSlateCache();
    const baseDate = new Date("2020-01-01T00:00:00Z").getTime();
    const DAY_MS = 86_400_000;
    for (let i = 0; i < HANDS; i++) {
      const date = new Date(baseDate + i * DAY_MS);
      const slateIds = getCachedSlate(adapter as any, date);
      const evalPool = buildEvalFromIds(slateIds, data, season);
      if (evalPool.length < 6) { skipped++; continue; }
      const roster = generateRoster(evalPool, ROSTER_CONFIG, ECONOMY_CONFIG, rng);
      if (roster.length < 6) { skipped++; continue; }
      // Build per-day bonus pool from slate IDs.
      const bonusPool: Array<{ basePlayerId: string; name: string; tier: string }> = [];
      for (const id of slateIds) {
        const p = data.playerById.get(id);
        if (!p) continue;
        bonusPool.push({ basePlayerId: id, name: String(p.name ?? ""), tier: String(p.tier ?? "WHITE").toUpperCase() });
      }
      const dailyBonusMap = buildDailyBonusMap(bonusPool, date);
      processRoster(roster, dailyBonusMap);
    }
  }
  if (skipped > 0) console.warn(`  ${season} [${mode}]: skipped ${skipped}/${HANDS}`);
  if (fps.length < HANDS / 2) return null;

  fps.sort((a, b) => a - b);
  const meanFp = fps.reduce((a, b) => a + b, 0) / fps.length;
  return { season, poolSize: data.eligible.length, fps, meanFp };
}

// ── Formatter ─────────────────────────────────────────────────────────────
const COL_W = 7;
const SEP = " | ";

function fmtNum(v: number): string { return v.toFixed(1).padStart(COL_W); }
function fmtSigned(v: number): string {
  const s = v >= 0 ? "+" : "";
  return (s + v.toFixed(1)).padStart(COL_W);
}
function fmtStr(v: string | number, w = COL_W): string { return String(v).padStart(w); }

function renderHeader(headers: string[]): string {
  return headers.map(h => fmtStr(h)).join(SEP);
}
function renderDivider(numCols: number): string {
  return Array(numCols).fill("-".repeat(COL_W)).join(SEP.replace(/ /g, "-"));
}

function emitTable(label: string, rows: SeasonResult[]) {
  console.log(`\n=== ${label} ===`);
  const headers = ["Sn", "pool", "min", "p10", "p25", "median", "mean", "p75", "p90", "p95", "p99", "max"];
  console.log(renderHeader(headers));
  console.log(renderDivider(headers.length));
  for (const r of rows) {
    const s = r.fps;
    console.log([
      fmtStr(r.season), fmtStr(r.poolSize),
      fmtNum(s[0]), fmtNum(pctileAt(s, 10)), fmtNum(pctileAt(s, 25)),
      fmtNum(pctileAt(s, 50)), fmtNum(r.meanFp), fmtNum(pctileAt(s, 75)),
      fmtNum(pctileAt(s, 90)), fmtNum(pctileAt(s, 95)), fmtNum(pctileAt(s, 99)),
      fmtNum(s[s.length - 1]),
    ].join(SEP));
  }
}

function emitDelta(slateRows: SeasonResult[], fullRows: SeasonResult[]) {
  console.log(`\n=== DELTA (slate − full) on key percentiles ===`);
  const headers = ["Sn", "Δmean", "Δp25", "Δp50", "Δp75", "Δp90", "Δp95", "Δp99"];
  console.log(renderHeader(headers));
  console.log(renderDivider(headers.length));
  const byFull = new Map(fullRows.map(r => [r.season, r]));
  for (const slate of slateRows) {
    const full = byFull.get(slate.season);
    if (!full) continue;
    const sf = slate.fps, ff = full.fps;
    const cols = [
      fmtStr(slate.season),
      fmtSigned(slate.meanFp - full.meanFp),
      fmtSigned(pctileAt(sf, 25) - pctileAt(ff, 25)),
      fmtSigned(pctileAt(sf, 50) - pctileAt(ff, 50)),
      fmtSigned(pctileAt(sf, 75) - pctileAt(ff, 75)),
      fmtSigned(pctileAt(sf, 90) - pctileAt(ff, 90)),
      fmtSigned(pctileAt(sf, 95) - pctileAt(ff, 95)),
      fmtSigned(pctileAt(sf, 99) - pctileAt(ff, 99)),
    ];
    console.log(cols.join(SEP));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  const seasons = fs.readdirSync(SEASONS_DIR).filter(d => /^\d{4}$/.test(d)).sort();
  console.log(`[slate-aware-calibrate] ${HANDS} hands × ${seasons.length} seasons`);
  console.log(`Modes: SLATE (60-player daily slate, date rotated per hand, eligibility ≥30 games)`);
  console.log(`       FULL (Task 6 reference: full eligible pool, ≥30 games filter applied)`);
  console.log("");

  const slateRows: SeasonResult[] = [];
  const fullRows: SeasonResult[] = [];
  for (const s of seasons) {
    const slate = runSeason(s, "slate");
    const full = runSeason(s, "full");
    if (slate) slateRows.push(slate);
    if (full) fullRows.push(full);
  }

  emitTable("SLATE-AWARE FP distribution", slateRows);
  emitTable("FULL-POOL FP distribution (≥30 games filter applied — note: differs from Task 6 which used ≥1 log)", fullRows);
  emitDelta(slateRows, fullRows);
}

main();
