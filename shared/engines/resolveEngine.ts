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

export interface ResolveConfig { fpScale: number; }

export interface ResolveAdapter {
  computeFantasyPoints(stats: Record<string, any>): number;
  computeBadges(stats: Record<string, any>): Achievement[];
}

export function resolveCards(cards: GeneratedCard[], logsByKey: Map<string, RawLog[]>, config: ResolveConfig, adapter: ResolveAdapter, rnd: () => number): { resolved: ResolvedCard[]; mvpCardId: string | undefined } {
  let bestFp = -Infinity;
  let mvpCardId: string | undefined;
  const resolved: ResolvedCard[] = cards.map(card => {
    const log = pickBiasedLog(card.basePlayerId, parseSeasonNum(card.season), card.tier, logsByKey, rnd);
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

function pickBiasedLog(basePlayerId: string, season: number | null, tier: string, logsByKey: Map<string, RawLog[]>, rnd: () => number): RawLog | null {
  const base = basePlayerId.trim();
  if (!base) return null;
  let candidates: RawLog[] = season !== null ? (logsByKey.get(`${base}|${season}`) ?? []) : [];
  if (!candidates.length) candidates = logsByKey.get(base) ?? [];
  candidates = candidates.filter(l => Object.values(l.stats ?? {}).some(v => typeof v === "number" && (v as number) > 0));
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const sorted = [...candidates].sort((a, b) => sumStats(b.stats) - sumStats(a.stats));
  const n = sorted.length;
  const t = (tier ?? "").toUpperCase();
  let lo: number, hi: number;
  if (t === "ORANGE")      { lo = 0;                       hi = Math.max(1, Math.ceil(n * 0.40)); }
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