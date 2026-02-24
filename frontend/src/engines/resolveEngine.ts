/**
 * resolveEngine.ts — Layer 1 (sport-agnostic)
 *
 * Attaches real game log data to cards and computes actual FP.
 * No fetching. No roster generation. Pure transformation.
 */

import type { RawLog } from "./dataEngine";
import type { GeneratedCard } from "./rosterEngine";

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
  projected: number,
  actual: number
): Achievement[] {
  const out: Achievement[] = [];

  if (projected > 0) {
    const ratio = actual / projected;
    if (ratio >= 1.4) out.push({ id: "career", icon: "🚀", label: "Career Night", fp: 3 });
    else if (ratio >= 1.15) out.push({ id: "hot", icon: "🔥", label: "On Fire", fp: 2 });
    else if (ratio <= 0.7) out.push({ id: "ice", icon: "🥶", label: "Ice Cold", fp: 0 });
  }

  const goals = toNum(stats?.goals_scored);
  const assists = toNum(stats?.assists);
  const cs = toNum(stats?.clean_sheets);

  if (goals >= 3) out.push({ id: "hattrick", icon: "🎩", label: "Hat Trick", fp: 4 });
  else if (goals >= 2) out.push({ id: "brace", icon: "⚡", label: "Two Goals", fp: 2 });
  if (assists >= 2) out.push({ id: "playmaker", icon: "🎯", label: "2+ Assists", fp: 2 });
  if (cs >= 1) out.push({ id: "cleansheet", icon: "🧱", label: "Clean Sheet", fp: 2 });

  // Deduplicate
  const seen = new Set<string>();
  return out.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)));
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