/**
 * shared/engines/resolveEngine.ts — Layer 1 (sport-agnostic)
 * Adapter is injected — not imported as singleton.
 */

import type { RawLog, GeneratedCard, Achievement } from "../types";

export interface ResolvedCard extends GeneratedCard {
  actualFp: number;
  fpDelta: number;
  gameInfo: { date: string; opponent: string; homeAway?: string };
  statLine: Record<string, any>;
  achievements: Achievement[];
}

export interface ResolveConfig { fpScale: number; minMinutes?: number; handCount?: number; }

export interface ResolveAdapter {
  computeFantasyPoints(stats: Record<string, any>): number;
  computeBadges(stats: Record<string, any>): Achievement[];
}

export function resolveCards(cards: GeneratedCard[], logsByKey: Map<string, RawLog[]>, config: ResolveConfig, adapter: ResolveAdapter, rnd: () => number): { resolved: ResolvedCard[]; mvpCardId: string | undefined } {
  let bestFp = -Infinity;
  let mvpCardId: string | undefined;
  const resolved: ResolvedCard[] = cards.map(card => {
    const log = pickBiasedLog(card.basePlayerId, parseSeasonNum(card.season), card.tier, logsByKey, rnd, config.minMinutes ?? 8, config.handCount ?? 999);
    const stats = log?.stats ?? {};
    // Inject _position BEFORE FP calc so positionProjectionWeights are used
    const statsWithPosition = { ...stats, _position: card.position ?? "" };
    const rawFp = extractFpFromStats(statsWithPosition, adapter);
    const scaledFp = Math.max(0, rawFp * config.fpScale);
    const achievements = adapter.computeBadges(statsWithPosition);

    const badgeBonus = achievements.reduce((s, a) => s + (a.fp ?? 0), 0);
    const totalFp = scaledFp + badgeBonus;
    const gameInfo = {
      date: String(log?.matchDate ?? log?.date ?? ""),
      opponent: String(log?.meta?.opponent ?? log?.opponent ?? ""),
      homeAway: String(log?.meta?.homeAway ?? log?.homeAway ?? "") as "H" | "A" | "",
    };
    if (totalFp > bestFp) { bestFp = totalFp; mvpCardId = card.cardId; }
    return { ...card, actualFp: totalFp, fpDelta: totalFp - card.projectedFp, gameInfo, statLine: statsWithPosition, achievements };
  });
  return { resolved, mvpCardId };
}

export function extractFpFromStats(stats: Record<string, any>, adapter: ResolveAdapter): number {
  if (!stats) return 0;
  const tp = stats.total_points ?? stats.totalPoints;
  if (tp !== undefined && tp !== null) return toNum(tp);
  const direct = stats.fp ?? stats.fantasyPoints ?? stats.fantasy_points ?? stats.FP;
  const dv = toNum(direct);
  if (dv !== 0) return dv;
  return adapter.computeFantasyPoints(stats);
}

function pickBiasedLog(basePlayerId: string, season: number | null, tier: string, logsByKey: Map<string, RawLog[]>, rnd: () => number, minMinutes: number = 8, handCount: number = 999): RawLog | null {
  const base = basePlayerId.trim();
  if (!base) return null;
  let candidates: RawLog[] = season !== null ? (logsByKey.get(`${base}|${season}`) ?? []) : [];
  if (!candidates.length) candidates = logsByKey.get(base) ?? [];
  // Filter out garbage logs:
  // 1. Must have at least one positive stat value (all-zero = DNP or corrupt data)
  // 2. If minutes field exists, must meet minMinutes threshold from config
  //    (defaults to 8 if not set; basketballConfig sets 10)
  // 3. If no minutes field, trust the stats — valid game, just missing metadata
  const minMins = minMinutes;
  candidates = candidates.filter(l => {
    const stats = l.stats ?? {};
    // Must have at least one positive numeric stat value (all-zero = DNP or corrupt).
    // Sport-agnostic: works for basketball (pts/reb/ast) and baseball (h/ip/k/etc.)
    const hasPositive = Object.values(stats).some(v => typeof v === "number" && v > 0);
    if (!hasPositive) return false;
    const mp = stats.mp ?? stats.minutes ?? stats.min ?? stats.MIN ?? stats.minutesPlayed;
    if (mp !== undefined && mp !== null) {
      const mpStr = String(mp);
      const mins = mpStr.includes(":") ? parseFloat(mpStr.split(":")[0]) : parseFloat(mpStr);
      if (Number.isFinite(mins) && mins < minMins) return false;
    }
    return true;
  });
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const sorted = [...candidates].sort((a, b) => sumStats(b.stats) - sumStats(a.stats));
  const n = sorted.length;
  const t = (tier ?? "").toUpperCase();
  // Protected mode: hands 2-30 sample from top 60% of logs regardless of tier
  // This gives newbie players better game nights without changing thresholds
  const isProtected = handCount >= 2 && handCount <= 30;
  let lo: number, hi: number;
  if (isProtected) {
    lo = 0; hi = Math.max(1, Math.ceil(n * 0.60));
  } else if (t === "ORANGE")      { lo = 0;                       hi = Math.max(1, Math.ceil(n * 0.40)); }
  else if (t === "PURPLE") { lo = 0;                       hi = Math.max(1, Math.ceil(n * 0.55)); }
  else if (t === "BLUE")   { lo = Math.floor(n * 0.20);    hi = Math.min(n, Math.ceil(n * 0.70)); }
  else if (t === "GREEN")  { lo = Math.floor(n * 0.30);    hi = Math.min(n, Math.ceil(n * 0.80)); }
  else                     { lo = Math.floor(n * 0.40);    hi = n; }
  lo = Math.max(0, lo); hi = Math.min(n, Math.max(lo + 1, hi));
  const window = sorted.slice(lo, hi);
  return window[Math.floor(rnd() * window.length)];
}

function sumStats(stats: Record<string, any>): number {
  return Object.values(stats).filter(v => typeof v === "number" && v > 0).reduce((s: number, v) => s + (v as number), 0);
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