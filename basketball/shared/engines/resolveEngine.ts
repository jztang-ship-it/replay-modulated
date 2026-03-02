/**
 * shared/engines/resolveEngine.ts — Layer 1 (sport-agnostic)
 *
 * Attaches real game log data to cards and computes actual FP.
 * No fetching. No roster generation. Pure transformation.
 *
 * Key change from basketball version: sportAdapter is injected via
 * resolveCards() rather than imported as a singleton. This makes
 * the engine truly sport-agnostic and testable.
 */

import type { RawLog, GeneratedCard, Achievement } from "../types";

export interface ResolvedCard extends GeneratedCard {
  actualFp: number;
  fpDelta: number;
  gameInfo: { date: string; opponent: string; homeAway?: string };
  statLine: Record<string, any>;
  achievements: Achievement[];
}

export interface ResolveConfig {
  fpScale: number;
}

/** Minimal adapter interface resolveEngine needs — injected by caller */
export interface ResolveAdapter {
  computeFantasyPoints(stats: Record<string, any>): number;
  computeBadges(stats: Record<string, any>): Achievement[];
}

// ── Public API ─────────────────────────────────────────────────────────────

export function resolveCards(
  cards: GeneratedCard[],
  logsByKey: Map<string, RawLog[]>,
  config: ResolveConfig,
  adapter: ResolveAdapter,
  rnd: () => number
): { resolved: ResolvedCard[]; mvpCardId: string | undefined } {
  let bestFp = -Infinity;
  let mvpCardId: string | undefined;

  const resolved: ResolvedCard[] = cards.map(card => {
    const log = pickBiasedLog(card.basePlayerId, parseSeasonNum(card.season), card.tier, logsByKey, rnd);
    const stats = log?.stats ?? {};

    const rawFp = extractFpFromStats(stats, adapter);
    if (rawFp === 0) console.warn("[resolve] zero FP for", card.name, "stats:", stats);

    const scaledFp = Math.max(0, rawFp * config.fpScale);
    const achievements = adapter.computeBadges(stats);
    const badgeBonus = achievements.reduce((s, a) => s + (a.fp ?? 0), 0);
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

export function extractFpFromStats(
  stats: Record<string, any>,
  adapter: ResolveAdapter
): number {
  if (!stats) return 0;

  // Check for pre-computed FP fields first (FPL uses total_points)
  const tp = stats.total_points ?? stats.totalPoints;
  if (tp !== undefined && tp !== null) return toNum(tp);

  const direct = stats.fp ?? stats.fantasyPoints ?? stats.fantasy_points ?? stats.FP;
  const dv = toNum(direct);
  if (dv !== 0) return dv;

  // Delegate to sport adapter — reads weights from Layer 2 config
  return adapter.computeFantasyPoints(stats);
}

// ── Log selection (tier-biased) ────────────────────────────────────────────

/**
 * Tier-biased log selection.
 * ORANGE/PURPLE → top percentile logs
 * BLUE/GREEN → middle range
 * WHITE → lower half more likely
 * Meaningful variance is preserved — bad games are always possible.
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
    const vals = Object.values(s).filter(v => typeof v === "number");
    return vals.some(v => (v as number) > 0);
  });

  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  // Sort best → worst by raw FP value in stats
  const sorted = [...candidates].sort((a, b) => {
    const fpA = sumStatValues(a.stats ?? {});
    const fpB = sumStatValues(b.stats ?? {});
    return fpB - fpA;
  });

  const n = sorted.length;
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
    lo = Math.floor(n * 0.40); hi = n;
  }

  lo = Math.max(0, lo);
  hi = Math.min(n, Math.max(lo + 1, hi));

  const window = sorted.slice(lo, hi);
  return window[Math.floor(rnd() * window.length)];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Rough sum of positive stat values — used for sorting logs when FP isn't precomputed */
function sumStatValues(stats: Record<string, any>): number {
  return Object.values(stats)
    .filter(v => typeof v === "number" && v > 0)
    .reduce((s: number, v) => s + (v as number), 0);
}

function parseSeasonNum(v: any): number | null {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : null;
}

function toNum(v: any): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
