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
  /** Daily bonus FP added to actualFp (0 if player is not in today's hot list). */
  dailyBonus?: number;
}

export interface ResolveConfig {
  fpScale: number;
  minMinutes?: number;
  /** Map of basePlayerId → daily bonus FP. Applied additively on top of real FP. */
  dailyBonusMap?: Map<string, number>;
}

export interface ResolveAdapter {
  computeFantasyPoints(stats: Record<string, any>): number;
  computeBadges(stats: Record<string, any>): Achievement[];
  /** Optional per-card log filter — used by sports with role-mixed players
   *  (e.g. baseball two-way: a BAT card must not pull a pitcher's log line).
   *  Sports without role distinctions can omit; default is "all logs valid". */
  isLogValidForCard?(position: unknown, log: RawLog): boolean;
}

export function resolveCards(cards: GeneratedCard[], logsByKey: Map<string, RawLog[]>, config: ResolveConfig, adapter: ResolveAdapter, rnd: () => number, _handCount?: number): { resolved: ResolvedCard[]; mvpCardId: string | undefined } {
  let bestFp = -Infinity;
  let mvpCardId: string | undefined;
  const bonusMap = config.dailyBonusMap;
  const resolved: ResolvedCard[] = cards.map(card => {
    const log = pickBiasedLog(card, logsByKey, adapter, rnd, config.minMinutes ?? 8);
    const stats = log?.stats ?? {};
    // Inject _position BEFORE FP calc so positionProjectionWeights are used
    const statsWithPosition = { ...stats, _position: card.position ?? "" };
    const rawFp = extractFpFromStats(statsWithPosition, adapter);
    const scaledFp = rawFp * config.fpScale;
    const achievements = adapter.computeBadges(statsWithPosition);

    const badgeBonus = achievements.reduce((s, a) => s + (a.fp ?? 0), 0);
    // Daily bonus: additive on top of real FP (doesn't affect bestFp comparison for MVP —
    // MVP is "who popped off in their real game", not "who got lucky with a bonus").
    const dailyBonus = bonusMap?.get(card.basePlayerId) ?? 0;
    const totalFp = scaledFp + badgeBonus + dailyBonus;
    const gameInfo = {
      date: String(log?.matchDate ?? log?.date ?? ""),
      opponent: String(log?.meta?.opponent ?? log?.opponent ?? ""),
      homeAway: String(log?.meta?.homeAway ?? log?.homeAway ?? "") as "H" | "A" | "",
    };
    if (totalFp > bestFp) { bestFp = totalFp; mvpCardId = card.cardId; }
    return { ...card, actualFp: totalFp, fpDelta: totalFp - card.projectedFp, gameInfo, statLine: statsWithPosition, achievements, dailyBonus };
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

function pickBiasedLog(card: GeneratedCard, logsByKey: Map<string, RawLog[]>, adapter: ResolveAdapter, rnd: () => number, minMinutes: number = 8): RawLog | null {
  const base = String(card.basePlayerId ?? "").trim();
  if (!base) return null;
  const season = parseSeasonNum(card.season);
  const tier = card.tier;
  const seasonKey = season !== null ? `${base}|${season}` : null;
  let candidates: RawLog[] = seasonKey ? (logsByKey.get(seasonKey) ?? []) : [];
  const seasonKeyHits = candidates.length;
  if (!candidates.length) candidates = logsByKey.get(base) ?? [];
  const beforeFilter = candidates.length;
  // Filter out garbage logs:
  // 1. Must have at least one positive stat value (all-zero = DNP or corrupt data)
  // 2. If minutes field exists, must meet minMinutes threshold from config
  //    (defaults to 8 if not set; basketballConfig sets 10)
  // 3. If no minutes field, trust the stats — valid game, just missing metadata
  // 4. Role-aware: adapter.isLogValidForCard rejects wrong-role lines (e.g. a
  //    baseball BAT card pulling a pitcher's stat line for a two-way player).
  //    Sports without roles (basketball) leave this hook unset → all logs pass.
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
    if (adapter.isLogValidForCard && !adapter.isLogValidForCard(card.position, l)) return false;
    return true;
  });
  // Diagnostic — when a card resolves to no candidates, log enough to
  // pin the cause from the browser console. Three failure modes:
  //   1. seasonKeyHits=0, beforeFilter=0: lookup never matched. Either
  //      logsByKey has no entry for this base|season (wrong active
  //      season loaded?) and no fallback for the base-only key
  //      either (player not in any loaded season's logs?).
  //   2. beforeFilter=0 but seasonKeyHits>0: shouldn't happen — would
  //      mean candidates was non-empty and is now empty without the
  //      filter running. Indicates a logic bug below this line.
  //   3. beforeFilter>0, candidates.length=0: filter rejected every
  //      candidate. Bug 1 patterns: missing min field on every log,
  //      all stats zero, or adapter.isLogValidForCard returning false
  //      for every log (sport with role validation).
  // Gated on null result so we don't spam logs for normal resolves.
  if (!candidates.length) {
    // eslint-disable-next-line no-console
    console.warn("[resolveEngine] pickBiasedLog returning null", {
      basePlayerId: base,
      card_season: card.season,
      card_position: card.position,
      card_tier: tier,
      parsed_season_num: season,
      lookup_key: seasonKey,
      season_key_hits: seasonKeyHits,
      before_filter: beforeFilter,
      after_filter: 0,
      min_minutes_threshold: minMinutes,
      logs_by_key_size: logsByKey.size,
    });
    return null;
  }
  if (candidates.length === 1) return candidates[0];
  // Uniform sampling across the player's season log, post-filter. Replaced the
  // prior tier-windowed bias (RED/ORANGE top 40%, PURPLE top 55%, BLUE 20-70%,
  // GREEN 30-80%, WHITE bottom 40-100%). Card tier no longer constrains the log
  // window — matchup, opponent, season-arc variance are now meaningful inputs
  // to hold/redraw decisions. Win-tier thresholds were re-derived per season
  // against this distribution; do not reintroduce bias without recalibrating.
  return candidates[Math.floor(rnd() * candidates.length)];
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