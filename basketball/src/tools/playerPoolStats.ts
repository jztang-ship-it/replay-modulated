// basketball/src/tools/playerPoolStats.ts
//
// RD7.2 Phase 1 — per-player gamelog-pool percentile precompute.
//
// Builds {basePlayerId|season -> {n,mean,p10,p50,p90,min,max}} where the FP
// of each candidate game is computed EXACTLY as resolveCards would (real
// computeBasketballFp + computeBasketballBadges, fpScale=1, dailyBonus
// excluded — a constant per-day shift, percentile-invariant), and the
// candidate POPULATION is filtered with the SAME predicate as
// resolveEngine.pickBiasedLog (§spec NON-NEGOTIABLE: percentile must be
// measured against the population the draw actually sampled).
//
// pickBiasedLog filter (shared/engines/resolveEngine.ts:109-131), pinned:
//   - hasPositive: at least one numeric stat > 0 (DNP/corrupt rejected).
//   - minutes floor, TIER-AWARE:
//       premium tier (RED/ORANGE/PURPLE == salary >= 44): require mins > 0.
//       non-premium (BLUE/GREEN/WHITE == salary < 44):    require mins >= minMinutes (10).
//       no minutes field on the log -> trust it (pass).
//   - role filter: basketball has no isLogValidForCard -> all logs pass.
// A player's tier is deterministic from salary (economyEngine tierThresholds),
// so each (player, season) has exactly ONE applicable minutes floor.
//
// FP per candidate = computeBasketballFp(statsWithMeta, weights)            // fpScale = 1
//                  + sum(computeBasketballBadges(statsWithMeta, badges).fp) // badge bonus
// matching resolveCards: gamelogs carry no total_points/fp field, so
// extractFpFromStats falls through to adapter.computeFantasyPoints.

import { computeBasketballFp } from "../adapters/fantasyPoints";
import { computeBasketballBadges } from "../adapters/badges";
import { BasketballSportConfig } from "../adapters/basketballConfig";
// PoolStats + percentile math are sport-agnostic — canonical home is shared;
// re-exported here so the builder + existing test/batch consumers are stable.
import type { PoolStats } from "@shared/explanation/poolStats";
export type { PoolStats } from "@shared/explanation/poolStats";
export { percentileFromStats } from "@shared/explanation/poolStats";

export const POOL_STATS_VERSION = "v1";
const MIN_MINUTES = 10;          // basketballConfig.historicalLogFilters.minMinutes
const PREMIUM_SALARY_FLOOR = 44; // PURPLE+ (RED>=73, ORANGE>=58, PURPLE>=44) == premium minutes rule

const WEIGHTS = BasketballSportConfig.projectionWeights as Record<string, number>;
const BADGES = BasketballSportConfig.badges as readonly any[];

// PoolStats interface now lives in @shared/explanation/poolStats (imported above).
export interface PoolStatsFile {
  version: string;
  season: string;
  minMinutes: number;
  premiumSalaryFloor: number;
  builtFrom: "computeBasketballFp+computeBasketballBadges, fpScale=1, dailyBonus excluded";
  players: Record<string, PoolStats>; // key: `${basePlayerId}|${season}`
}

interface RawLog { basePlayerId?: string; season?: string | number; stats?: Record<string, any>; }
interface RawPlayer { basePlayerId?: string; season?: string | number; salary?: number; position?: string; }

function minutesOf(stats: Record<string, any>): number | null {
  const mp = stats.mp ?? stats.minutes ?? stats.min ?? stats.MIN ?? stats.minutesPlayed;
  if (mp === undefined || mp === null) return null;
  const s = String(mp);
  const m = s.includes(":") ? parseFloat(s.split(":")[0]) : parseFloat(s);
  return Number.isFinite(m) ? m : null;
}

/** Reproduction of pickBiasedLog's candidate predicate for one (player, premium) pair. */
export function logPassesFilter(stats: Record<string, any>, isPremium: boolean): boolean {
  if (!stats) return false;
  const hasPositive = Object.values(stats).some(v => typeof v === "number" && v > 0);
  if (!hasPositive) return false;
  const mins = minutesOf(stats);
  if (mins !== null) {
    if (isPremium) { if (mins <= 0) return false; }
    else { if (mins < MIN_MINUTES) return false; }
  }
  return true;
}

/** Faithful per-log FP (matches resolveCards totalFp minus dailyBonus). */
export function fpForLog(stats: Record<string, any>, position: string): number {
  const withMeta = { ...stats, _position: position ?? "", _injured: false, _ejected: false };
  const base = computeBasketballFp(withMeta, WEIGHTS); // fpScale = 1
  const badgeBonus = computeBasketballBadges(withMeta, BADGES).reduce((s, b) => s + (b.fp ?? 0), 0);
  return base + badgeBonus;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Returns the full filtered FP pool for one player+season (sorted asc). Exposed for tests. */
export function buildFilteredPool(
  logs: RawLog[],
  salary: number,
  position: string,
): number[] {
  const isPremium = salary >= PREMIUM_SALARY_FLOOR;
  const fps: number[] = [];
  for (const log of logs) {
    const stats = log.stats ?? {};
    if (!logPassesFilter(stats, isPremium)) continue;
    fps.push(fpForLog(stats, position));
  }
  fps.sort((a, b) => a - b);
  return fps;
}

function statsFromPool(fps: number[]): PoolStats {
  const n = fps.length;
  const mean = n ? fps.reduce((s, v) => s + v, 0) / n : 0;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    n,
    mean: r1(mean),
    p10: r1(quantile(fps, 0.10)),
    p50: r1(quantile(fps, 0.50)),
    p90: r1(quantile(fps, 0.90)),
    min: r1(fps[0] ?? 0),
    max: r1(fps[n - 1] ?? 0),
  };
}

/** Build the per-season pool-stats file content from already-parsed data. */
export function buildPoolStatsForSeason(
  season: string,
  logs: RawLog[],
  players: RawPlayer[],
): PoolStatsFile {
  // Index logs by basePlayerId (season-local file → all logs belong to `season`).
  const byPlayer = new Map<string, RawLog[]>();
  for (const log of logs) {
    const base = String(log.basePlayerId ?? "").trim();
    if (!base) continue;
    (byPlayer.get(base) ?? byPlayer.set(base, []).get(base)!).push(log);
  }
  const out: Record<string, PoolStats> = {};
  for (const p of players) {
    const base = String(p.basePlayerId ?? "").trim();
    if (!base) continue;
    const logsForP = byPlayer.get(base);
    if (!logsForP || logsForP.length === 0) continue;
    const salary = Number(p.salary ?? 0);
    const pool = buildFilteredPool(logsForP, salary, String(p.position ?? ""));
    if (pool.length === 0) continue; // no eligible games → no anchor (engine degrades to Class C)
    out[`${base}|${season}`] = statsFromPool(pool);
  }
  return {
    version: POOL_STATS_VERSION,
    season,
    minMinutes: MIN_MINUTES,
    premiumSalaryFloor: PREMIUM_SALARY_FLOOR,
    builtFrom: "computeBasketballFp+computeBasketballBadges, fpScale=1, dailyBonus excluded",
    players: out,
  };
}

// percentileFromStats now lives in @shared/explanation/poolStats (re-exported above).
