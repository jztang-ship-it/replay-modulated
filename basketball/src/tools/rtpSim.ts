#!/usr/bin/env node
/**
 * rtpSim.ts — dollar-RTP validation sim under the rebalanced basketball
 * multiplier schedule.
 *
 * Same 29-season × 10k-hand pipeline as slateAwareThresholds (slate-aware
 * deal + production-parity resolve + daily bonus + tier-aware filter +
 * true career FP). Per hand: bet $1, compute payout =
 *   bet × tierMultiplier × streakMultiplier.
 * Aggregate RTP = Σ payouts / Σ bets across all hands.
 *
 * Streak semantics: matches the sim's prior streak validation — the
 * streak multiplier reads the count BEFORE this win is added to streak.
 * So the 4th consecutive win is the first to land 1.2x (basketball's
 * rebalanced 3-win tier); the 6th lands 1.5x; the 11th lands 2.0x.
 * (Matches the production payoutLogic.calculatePayoutWithStreak call
 * shape, which takes `streak` and looks up via getStreakMultiplier.)
 *
 * Bet sizing: this sim uses a constant $1 bet per hand. Production
 * supports user-selectable bet multipliers (1/3/5/10×) on top of a base
 * bet — see shared/components/GameBar.tsx betMultiplier prop. RTP as a
 * ratio is bet-invariant (both numerator and denominator scale together),
 * so the $1 model is mathematically equivalent for RTP purposes. If you
 * want EV-per-session under realistic betting behavior, that's a
 * separate sim layer that mixes bet sizes — flag and we'll discuss.
 *
 * Output:
 *   - Per-season RTP under auto_press hold strategy.
 *   - Aggregate RTP (mean across 29 seasons + range).
 *   - Streak-multiplier contribution: fraction of total payout that came
 *     from hands resolved at 1.0× / 1.2× / 1.5× / 2.0× active multiplier.
 *   - Per-tier payout contribution: fraction of total payout from each
 *     win tier.
 *
 * Run from basketball/:
 *   npx tsx src/tools/rtpSim.ts
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
import type { WinTierKey, WinTierMap, StreakTier } from "../../../shared/utils/payoutLogic";
import perSeasonThresholds from "../data/winThresholds.json";

// Schedule constants — must match basketball/src/utils/payoutLogic.ts.
// Inlined because basketball's payoutLogic transitively imports from the
// @shared/* Vite alias, which tsx (used to run this sim from Node) can't
// resolve. The values are duplicated here intentionally; the test suite
// covers production's payoutLogic, this sim validates dollar RTP at the
// schedule level.
const MULTIPLIERS: Record<WinTierKey, number> = {
  LEGEND: 20, MVP: 8, ALL_STAR: 3, STARTER: 1.5, ROOKIE: 0.5, BUST: 0,
};
const STREAK_TIERS: StreakTier[] = [
  { wins: 10, multiplier: 2.0 },
  { wins: 5,  multiplier: 1.5 },
  { wins: 3,  multiplier: 1.2 },
];
function calculateWinTier(totalFp: number, tiers: WinTierMap): WinTierKey {
  const fp = Math.round(totalFp * 10) / 10;
  if (tiers.LEGEND   && fp >= tiers.LEGEND.minFp)   return "LEGEND";
  if (tiers.MVP      && fp >= tiers.MVP.minFp)      return "MVP";
  if (tiers.ALL_STAR && fp >= tiers.ALL_STAR.minFp) return "ALL_STAR";
  if (tiers.STARTER  && fp >= tiers.STARTER.minFp)  return "STARTER";
  if (tiers.ROOKIE   && fp >= tiers.ROOKIE.minFp)   return "ROOKIE";
  return "BUST";
}
function streakMultFor(streak: number): number {
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.wins) return tier.multiplier;
  }
  return 1.0;
}
function calculatePayoutWithStreak(tier: WinTierKey, bet: number, streak: number): number {
  return bet * (MULTIPLIERS[tier] ?? 0) * streakMultFor(streak);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEASONS_DIR = path.resolve(HERE, "../../public/data/seasons");
const HANDS_PER_SEASON = 10_000;
const MIN_MINUTES_LOG = 10;
const MIN_GAMES_THIS_SEASON = 30;
const BET = 1.0;
const TIER_ORDER: WinTierKey[] = ["BUST","ROOKIE","STARTER","ALL_STAR","MVP","LEGEND"];

const ECONOMY_CONFIG: EconomyConfig = {
  capMax: 250, salaryMin: 5, salaryMax: 95,
  salaryRatioCeiling: 1.60, salaryRatioFloor: 0.40,
  tierThresholds: [
    { tier: "RED" as TierColor, minSalary: 73 }, { tier: "ORANGE" as TierColor, minSalary: 58 },
    { tier: "PURPLE" as TierColor, minSalary: 44 }, { tier: "BLUE" as TierColor, minSalary: 30 },
    { tier: "GREEN" as TierColor, minSalary: 20 },
  ],
};
const FLEX_SLOTS: SlotRequirement[] = ["FLEX","FLEX","FLEX","FLEX","FLEX"];
const ROSTER_CONFIG = { rosterSize: 5, slotRequirements: FLEX_SLOTS, excludeFromFlex: [] as string[], positionAware: false };
const TIER_POOL_CAPS: Record<string, number> = { BLUE: 40, GREEN: 25, WHITE: 20 };
const SLATE_COMPOSITION = {
  tierRanges: {
    RED: [2,3] as [number,number], ORANGE: [8,12] as [number,number],
    PURPLE: [12,20] as [number,number], BLUE: [8,18] as [number,number],
    GREEN: [6,12] as [number,number], WHITE: [8,12] as [number,number],
  },
  protectedTier: "PURPLE", absorbTiers: ["BLUE","GREEN"],
};
const RESOLVE_ADAPTER = {
  computeFantasyPoints: (s: Record<string, any>) =>
    computeBasketballFp(s, BasketballSportConfig.projectionWeights),
  computeBadges: (s: Record<string, any>) =>
    computeBasketballBadges(s, (BasketballSportConfig as any).badges ?? []),
};

const BASE_MULTIPLIERS: Record<WinTierKey, number> = { LEGEND: 20, MVP: 8, ALL_STAR: 3, STARTER: 1.5, ROOKIE: 0.5, BUST: 0 };
function makeWinTiersMap(season: string): WinTierMap {
  const t = (perSeasonThresholds as any)[season];
  if (!t) throw new Error(`No thresholds for season ${season}`);
  return {
    BUST:     { minFp: 0,            multiplier: 0 },
    ROOKIE:   { minFp: t.ROOKIE,     multiplier: BASE_MULTIPLIERS.ROOKIE },
    STARTER:  { minFp: t.STARTER,    multiplier: BASE_MULTIPLIERS.STARTER },
    ALL_STAR: { minFp: t.ALL_STAR,   multiplier: BASE_MULTIPLIERS.ALL_STAR },
    MVP:      { minFp: t.MVP,        multiplier: BASE_MULTIPLIERS.MVP },
    LEGEND:   { minFp: t.LEGEND,     multiplier: BASE_MULTIPLIERS.LEGEND },
  };
}

function parseMin(s: any): number | null {
  const mp = s?.mp ?? s?.minutes ?? s?.min ?? s?.MIN ?? s?.minutesPlayed;
  if (mp === undefined || mp === null) return null;
  const str = String(mp);
  const m = str.includes(":") ? parseFloat(str.split(":")[0]) : parseFloat(str);
  return Number.isFinite(m) ? m : null;
}
function hasAnyPositiveMinutesLog(logs: any[]): boolean {
  for (const l of logs) {
    const s = l?.stats ?? {};
    if (!Object.values(s).some((v: any) => typeof v === "number" && v > 0)) continue;
    const m = parseMin(s);
    if (m === null || m > 0) return true;
  }
  return false;
}

interface SeasonData {
  season: string;
  playerById: Map<string, any>;
  logsByPlayerRaw: Map<string, any[]>;
  eligible: string[];
  careerFpById: Map<string, number>;
  byTier: Map<string, string[]>;
}
function loadSeason(season: string): SeasonData {
  const dir = path.join(SEASONS_DIR, season);
  const players: any[] = JSON.parse(fs.readFileSync(path.join(dir, "players.json"), "utf8"));
  const logs: any[] = JSON.parse(fs.readFileSync(path.join(dir, "gamelogs.json"), "utf8"));
  const totalGames = new Map<string, number>();
  const logsByPlayerRaw = new Map<string, any[]>();
  for (const l of logs) {
    const k = String(l.basePlayerId ?? "");
    if (!k) continue;
    totalGames.set(k, (totalGames.get(k) ?? 0) + 1);
    if (!logsByPlayerRaw.has(k)) logsByPlayerRaw.set(k, []);
    logsByPlayerRaw.get(k)!.push(l);
  }
  const playerById = new Map<string, any>();
  for (const p of players) {
    const id = String(p.basePlayerId ?? p.id ?? "");
    if (id) playerById.set(id, p);
  }
  const eligible: string[] = [];
  for (const [id, p] of playerById) {
    if (!(p.salary > 0)) continue;
    if ((totalGames.get(id) ?? 0) < MIN_GAMES_THIS_SEASON) continue;
    if (!hasAnyPositiveMinutesLog(logsByPlayerRaw.get(id) ?? [])) continue;
    eligible.push(id);
  }
  const careerFpById = new Map<string, number>();
  for (const id of eligible) {
    careerFpById.set(id, computeBasketballCareerFp(id, logsByPlayerRaw,
      s => computeBasketballFp(s, BasketballSportConfig.projectionWeights)));
  }
  const byTier = new Map<string, string[]>();
  for (const id of eligible) {
    const t = String(playerById.get(id)?.tier ?? "WHITE").toUpperCase();
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(id);
  }
  return { season, playerById, logsByPlayerRaw, eligible, careerFpById, byTier };
}

function makeSlateAdapter(season: string, data: SeasonData) {
  return {
    sportKey: "basketball", rosterSize: 5,
    config: { slateSize: 60, anchorCount: 9, weightExponent: 1.0 },
    getCareerFPById: (id: string) => data.careerFpById.get(id) ?? 0,
    getTierById: (id: string) => String(data.playerById.get(id)?.tier ?? "WHITE").toUpperCase(),
    getTierPool: (tier: string) => {
      const ids = data.byTier.get(tier) ?? [];
      const ranked = [...ids].sort((a, b) => (data.careerFpById.get(b) ?? 0) - (data.careerFpById.get(a) ?? 0));
      const cap = TIER_POOL_CAPS[tier];
      return cap !== undefined ? ranked.slice(0, cap) : ranked;
    },
    getAnchors: (count = 9) =>
      [...data.eligible].sort((a, b) => (data.careerFpById.get(b) ?? 0) - (data.careerFpById.get(a) ?? 0)).slice(0, count),
    slateComposition: SLATE_COMPOSITION,
    getEligiblePool: () => data.eligible,
    getThemedEligibility: () => null,
    getExclusionList: () => [],
    getCacheNamespace: () => season,
  };
}

function buildEvalFromIds(ids: string[], data: SeasonData, season: string): PlayerEval[] {
  const out: PlayerEval[] = [];
  for (const id of ids) {
    const p = data.playerById.get(id);
    if (!p) continue;
    if (!(p.salary > 0)) continue;
    if (!hasAnyPositiveMinutesLog(data.logsByPlayerRaw.get(id) ?? [])) continue;
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
  hands: number;
  totalBet: number;
  totalPayout: number;
  rtp: number;
  payoutByTier: Record<WinTierKey, number>;
  payoutByStreakMult: Record<string, number>;  // "1.0" / "1.2" / "1.5" / "2.0"
}

function runSeasonRtp(season: string): SeasonResult | null {
  const data = loadSeason(season);
  if (data.eligible.length < ROSTER_CONFIG.rosterSize) return null;
  const winTiers = makeWinTiersMap(season);
  const rngSeed = 9_000_000 + 42 + season.charCodeAt(0) * 257 + season.charCodeAt(1) * 31
    + (season.charCodeAt(2) ?? 0) * 13 + (season.charCodeAt(3) ?? 0);
  const rng = mulberry32(rngSeed);
  const adapter = makeSlateAdapter(season, data);
  _resetSlateCache();
  const baseDate = new Date("2020-01-01T00:00:00Z").getTime();
  const DAY = 86_400_000;

  let totalBet = 0;
  let totalPayout = 0;
  const payoutByTier: Record<WinTierKey, number> = TIER_ORDER.reduce((a, t) => (a[t] = 0, a), {} as Record<WinTierKey, number>);
  const payoutByStreakMult: Record<string, number> = { "1.0": 0, "1.2": 0, "1.5": 0, "2.0": 0 };

  let streak = 0;
  let i = 0, built = 0;
  while (built < HANDS_PER_SEASON) {
    const date = new Date(baseDate + i * DAY);
    i++;
    const slateIds = getCachedSlate(adapter as any, date);
    const evalPool = buildEvalFromIds(slateIds, data, season);
    if (evalPool.length < ROSTER_CONFIG.rosterSize) continue;
    const roster = generateRoster(evalPool, ROSTER_CONFIG, ECONOMY_CONFIG, rng);
    if (roster.length < ROSTER_CONFIG.rosterSize) continue;
    const bonusPool: Array<{ basePlayerId: string; name: string; tier: string }> = [];
    for (const id of slateIds) {
      const p = data.playerById.get(id);
      if (!p) continue;
      bonusPool.push({ basePlayerId: id, name: String(p.name ?? ""), tier: String(p.tier ?? "WHITE").toUpperCase() });
    }
    const dailyBonusMap = buildDailyBonusMap(bonusPool, date);
    const { resolved } = resolveCards(roster, data.logsByPlayerRaw, { fpScale: 1, minMinutes: MIN_MINUTES_LOG, dailyBonusMap }, RESOLVE_ADAPTER, rng);
    let totalFp = 0;
    for (const c of resolved) totalFp += c.actualFp;
    const winTier = calculateWinTier(totalFp, winTiers);
    // Streak multiplier reads count BEFORE this win is added — matches
    // shared/utils/payoutLogic.getStreakMultiplier semantics.
    const streakMultBefore = streakMultFor(streak);
    const payout = calculatePayoutWithStreak(winTier, BET, streak);
    totalBet += BET;
    totalPayout += payout;
    payoutByTier[winTier] += payout;
    payoutByStreakMult[streakMultBefore.toFixed(1)] = (payoutByStreakMult[streakMultBefore.toFixed(1)] ?? 0) + payout;
    if (winTier !== "BUST") streak++;
    else streak = 0;
    built++;
  }
  return {
    season,
    hands: built,
    totalBet,
    totalPayout,
    rtp: totalBet > 0 ? totalPayout / totalBet : 0,
    payoutByTier,
    payoutByStreakMult,
  };
}

function pad(s: string | number, w: number): string { return String(s).padStart(w); }

function main() {
  const seasons = fs.readdirSync(SEASONS_DIR).filter(d => /^\d{4}$/.test(d)).sort();
  console.log(`[rtp-sim] ${HANDS_PER_SEASON} hands × ${seasons.length} seasons`);
  console.log(`Multiplier schedule: LEGEND 20× | MVP 8× | ALL_STAR 3× | STARTER 1.5× | ROOKIE 0.5× | BUST 0×`);
  console.log(`Streak schedule:     3-win 1.2× | 5-win 1.5× | 10-win 2.0×`);
  console.log(`Bet:                 $${BET} per hand (RTP ratio is bet-invariant)`);
  console.log();

  const rows: SeasonResult[] = [];
  for (const s of seasons) {
    const r = runSeasonRtp(s);
    if (r) rows.push(r);
  }

  // Per-season RTP
  console.log("=== PER-SEASON RTP (auto_press) ===");
  console.log("Sn      |   hands  |     bet ($) |  payout ($) |     RTP");
  console.log("-".repeat(60));
  let totalBet = 0, totalPayout = 0;
  for (const r of rows) {
    console.log(
      pad(r.season, 7) + " | " + pad(r.hands.toLocaleString(), 8) + " | " +
      pad(r.totalBet.toFixed(0), 11) + " | " + pad(r.totalPayout.toFixed(1), 11) + " | " +
      pad((r.rtp * 100).toFixed(2) + "%", 7)
    );
    totalBet += r.totalBet;
    totalPayout += r.totalPayout;
  }
  const rtps = rows.map(r => r.rtp);
  rtps.sort((a, b) => a - b);
  const aggRtp = totalPayout / totalBet;
  console.log("-".repeat(60));
  console.log(`Aggregate RTP across ${rows.length} seasons: ${(aggRtp * 100).toFixed(2)}%`);
  console.log(`  Range: ${(rtps[0] * 100).toFixed(2)}% – ${(rtps[rtps.length - 1] * 100).toFixed(2)}%`);
  console.log(`  Median: ${(rtps[Math.floor(rtps.length / 2)] * 100).toFixed(2)}%`);

  // Per-streak-mult contribution
  console.log();
  console.log("=== PAYOUT CONTRIBUTION BY ACTIVE STREAK MULTIPLIER ===");
  console.log("Mult |    payout ($) | fraction of total");
  console.log("-".repeat(45));
  const totalByMult: Record<string, number> = { "1.0": 0, "1.2": 0, "1.5": 0, "2.0": 0 };
  for (const r of rows) {
    for (const k of Object.keys(totalByMult)) totalByMult[k] += r.payoutByStreakMult[k] ?? 0;
  }
  for (const k of ["1.0","1.2","1.5","2.0"]) {
    const v = totalByMult[k];
    console.log(pad(k + "×", 5) + " | " + pad(v.toFixed(1), 13) + " | " + pad((v/totalPayout*100).toFixed(2) + "%", 10));
  }

  // Per-tier contribution
  console.log();
  console.log("=== PAYOUT CONTRIBUTION BY WIN TIER ===");
  console.log("Tier     |    payout ($) | fraction of total");
  console.log("-".repeat(48));
  const totalByTier: Record<WinTierKey, number> = TIER_ORDER.reduce((a, t) => (a[t] = 0, a), {} as Record<WinTierKey, number>);
  for (const r of rows) {
    for (const t of TIER_ORDER) totalByTier[t] += r.payoutByTier[t];
  }
  for (const t of TIER_ORDER) {
    const v = totalByTier[t];
    console.log(pad(t, 8) + " | " + pad(v.toFixed(1), 13) + " | " + pad((v/totalPayout*100).toFixed(2) + "%", 10));
  }
}

main();
