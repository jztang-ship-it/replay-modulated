/**
 * resolveEngine.ts — Layer 1 (sport-agnostic)
 *
 * Attaches real game log data to cards and computes actual FP.
 * No fetching. No roster generation. Pure transformation.
 */

import type { RawLog } from "./dataEngine";
import type { GeneratedCard } from "./rosterEngine";
import { sportAdapter } from "../adapters/SportAdapter";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  icon: string;
  label: string;
  fp: number;
}

export interface ResolvedCard extends GeneratedCard {
  actualFp: number;
  fpDelta: number;
  gameInfo: { date: string; opponent: string; homeAway?: string };
  statLine: Record<string, any>;
  achievements: Achievement[];
}

export interface ResolveConfig {
  /** Multiplier applied to raw FP from logs */
  fpScale: number;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function resolveCards(
  cards: GeneratedCard[],
  logsByKey: Map<string, RawLog[]>,
  config: ResolveConfig,
  rnd: () => number
): { resolved: ResolvedCard[]; mvpCardId: string | undefined } {
  let bestFp = -Infinity;
  let mvpCardId: string | undefined;

  const resolved: ResolvedCard[] = cards.map(card => {
    const log = pickBiasedLog(card.basePlayerId, parseSeasonNum(card.season), card.tier, logsByKey, rnd);
    const stats = log?.stats ?? {};

    const rawFp = extractFpFromStats(stats);
    if (rawFp === 0) console.warn('[resolve] zero FP for', card.name, 'log:', log, 'stats:', stats);
    const scaledFp = Math.max(0, rawFp * config.fpScale);

    const achievements = computeAchievements(stats, card.projectedFp, scaledFp);
    const badgeBonus = achievements.reduce((s, a) => s + a.fp, 0);
    const totalFp = scaledFp + badgeBonus;

    const gameInfo = {
      date: String(log?.matchDate ?? log?.date ?? ""),
      opponent: String(log?.meta?.opponent ?? log?.opponent ?? ""),
      homeAway: String(log?.meta?.homeAway ?? log?.homeAway ?? "") as "H" | "A" | "",
    };

    if (totalFp > bestFp) {
      bestFp = totalFp;
      mvpCardId = card.cardId;
    }

    return {
      ...card,
      actualFp: totalFp,
      fpDelta: totalFp - card.projectedFp,
      gameInfo,
      statLine: stats,
      achievements,
    };
  });

  return { resolved, mvpCardId };
}

// ── FP extraction ──────────────────────────────────────────────────────────

export function extractFpFromStats(stats: Record<string, any>): number {
  if (!stats) return 0;

  // FPL logs use total_points as the canonical FP field — check first
  const tp = stats.total_points ?? stats.totalPoints;
  if (tp !== undefined && tp !== null) return toNum(tp);

  // Fallback for other data sources
  const direct = stats.fp ?? stats.fantasyPoints ?? stats.fantasy_points ?? stats.FP ?? stats.xP;
  const dv = toNum(direct);
  if (dv !== 0) return dv;
  // Basketball — compute from raw stats
  const pts = toNum(stats.pts);
  const reb = toNum(stats.reb);
  const ast = toNum(stats.ast);
  const stl = toNum(stats.stl);
  const blk = toNum(stats.blk);
  const tov = toNum(stats.turnovers ?? stats.tov ?? stats.to);
  if (pts + reb + ast + stl + blk > 0) {
    return (pts * 1.0) + (reb * 1.2) + (ast * 1.5) + (stl * 2.0) + (blk * 2.0) + (tov * -1.0);
  }

  return 0;
}

/**
 * Compute auto-scale factor so FP numbers feel natural.
 * Target mean FP across all players = targetMean.
 */
export function computeFpScale(
  projections: Map<string, number>,
  targetMean = 10.5
): number {
  let sum = 0;
  let count = 0;
  for (const v of projections.values()) {
    if (Number.isFinite(v) && v > 0) { sum += v; count++; }
  }
  const mean = count ? sum / count : 0;
  if (!mean) return 1;
  return Math.max(0.75, Math.min(8, targetMean / mean));
}

// ── Achievements ───────────────────────────────────────────────────────────

function computeAchievements(
  stats: Record<string, any>,
  _projected: number,
  _actual: number
): Achievement[] {
  const badges = (sportAdapter.config as any).badges ?? [];
  const out: Achievement[] = [];

  // Milestones — highest suppresses lower (check in priority order)
  const milestoneIds = ['QUAD_DBL', '5X5', 'TRIPLE_DBL', 'DOUBLE_DBL'];
  for (const mid of milestoneIds) {
    const badge = badges.find((b: any) => b.id === mid);
    if (badge?.test(stats)) { out.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp }); break; }
  }

  // Scoring — highest suppresses lower
  const scoringIds = ['GOD_MODE', 'FIRE', 'BUCKET'];
  for (const sid of scoringIds) {
    const badge = badges.find((b: any) => b.id === sid);
    if (badge?.test(stats)) { out.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp }); break; }
  }

  // Glass — highest suppresses lower
  const glassIds = ['BEAST', 'GLASS'];
  for (const gid of glassIds) {
    const badge = badges.find((b: any) => b.id === gid);
    if (badge?.test(stats)) { out.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp }); break; }
  }

  // Dish — highest suppresses lower
  const dishIds = ['WIZARD', 'DIME'];
  for (const did of dishIds) {
    const badge = badges.find((b: any) => b.id === did);
    if (badge?.test(stats)) { out.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp }); break; }
  }

  // Lockdown — all independent (different skills)
  const lockIds = ['THIEF', 'SWAT', 'LOCK'];
  for (const lid of lockIds) {
    const badge = badges.find((b: any) => b.id === lid);
    if (badge?.test(stats)) { out.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp }); }
  }

  return out;
}

// ── Log selection ──────────────────────────────────────────────────────────

/**
 * Tier-biased log selection.
 *
 * Rather than pure random, we sort the player's logs by total_points and
 * sample from a tier-appropriate percentile band. This ensures:
 * - ORANGE/PURPLE cards regularly return strong performances
 * - BLUE/GREEN cards return mid-range performances
 * - WHITE cards can still have the occasional good game, but trend lower
 *
 * There is still meaningful variance — a bad game is always possible —
 * but the distribution skews correctly by tier so high-salary cards
 * feel worth their cost over many hands.
 *
 * Tier bands (percentile of sorted logs, best→worst):
 *   ORANGE  → top 40%  (picks from logs ranked 0–40th percentile)
 *   PURPLE  → top 55%  (picks from logs ranked 0–55th percentile)
 *   BLUE    → 20–70%   (avoids both extremes)
 *   GREEN   → 30–80%
 *   WHITE   → 40–100%  (bottom half more likely)
 */
function pickBiasedLog(
  basePlayerId: string,
  season: number | null,
  tier: string,
  logsByKey: Map<string, RawLog[]>,
  rnd: () => number
): RawLog | null {
  const base = basePlayerId.trim();
  if (!base) return null;

  let candidates: RawLog[] = [];
  if (season !== null) {
    candidates = logsByKey.get(`${base}|${season}`) ?? [];
  }
  if (!candidates.length) {
    candidates = logsByKey.get(base) ?? [];
  }
// Filter out DNP / zero-stat logs
candidates = candidates.filter(l => {
  const s = l.stats ?? {};
  return ((s.pts ?? 0) + (s.reb ?? 0) + (s.ast ?? 0) + (s.stl ?? 0) + (s.blk ?? 0)) > 0;
});
if (!candidates.length) return null;
// Single log — no choice to make
if (candidates.length === 1) return candidates[0];

  // Sort logs best → worst by raw FP
  const sorted = [...candidates].sort((a, b) => {
    const fpA = extractFpFromStats(a.stats ?? {});
    const fpB = extractFpFromStats(b.stats ?? {});
    return fpB - fpA;
  });

  const n = sorted.length;

  // Determine percentile window [lo, hi) based on tier
  let lo: number;
  let hi: number;
  const t = (tier ?? "").toUpperCase();
  if (t === "ORANGE") {
    lo = 0; hi = Math.max(1, Math.ceil(n * 0.40));
  } else if (t === "PURPLE") {
    lo = 0; hi = Math.max(1, Math.ceil(n * 0.55));
  } else if (t === "BLUE") {
    lo = Math.floor(n * 0.20); hi = Math.min(n, Math.ceil(n * 0.70));
  } else if (t === "GREEN") {
    lo = Math.floor(n * 0.30); hi = Math.min(n, Math.ceil(n * 0.80));
  } else {
    // WHITE
    lo = Math.floor(n * 0.40); hi = n;
  }

  // Clamp to valid range
  lo = Math.max(0, lo);
  hi = Math.min(n, Math.max(lo + 1, hi));

  const window = sorted.slice(lo, hi);
  return window[Math.floor(rnd() * window.length)];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseSeasonNum(v: any): number | null {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : null;
}

function toNum(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}