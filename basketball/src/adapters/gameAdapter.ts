/**
 * gameAdapter.ts — Basketball
 * Thin orchestration layer between GameView and the engines.
 */

import { sportAdapter } from "./SportAdapter";
import { getPlayers, getLogsByKey } from "../engines/dataEngine";
import { generateRoster, redrawRoster as engineRedraw, mulberry32, randomSeed } from "../engines/rosterEngine";
import { resolveCards } from "../engines/resolveEngine";
import { DEFAULT_ECONOMY_CONFIG, tierFromSalary } from "../engines/economyEngine";
import { buildDailyBonusMap, getDailyBonusDateKey, getDailyBonusPlayers, type DailyBonusPlayer } from "@shared/utils/dailyBonus";
import { buildBonusPoolFromPlayers } from "@shared/utils/dailyBonusPool";
import { getDealPool } from "@shared/utils/dealGate";
import { hashStr, mulberry32 as seededMulberry32 } from "@shared/utils/seededRng";
import { SessionRepeatLimit, DEFAULT_REPEAT_LIMIT } from "@shared/utils/sessionRepeatLimit";
import { getCachedSlate } from "@shared/utils/slateSelector";
import { isSlateV2Enabled } from "@shared/featureFlags";
import { track } from "@shared/analytics/analytics";
import type { PlayerCard } from "./types";
import type { PlayerEval, GeneratedCard } from "../engines/rosterEngine";
import type { EconomyConfig } from "../engines/economyEngine";

/** Module-level session singleton — sliding window of recent draws. No-op when
 *  no records have been pushed; `record()` populates it after each deal.
 *  onRelaxed → fires the internal-only `repeat_limit_relaxed` event so we can
 *  see when the soft cap is being undermined by a too-small pool floor. */
const repeatLimit = new SessionRepeatLimit(() => {
  track("slate", "repeat_limit_relaxed", {}, "basketball");
});

/** Single canonical key used everywhere player identity is compared.
 *  basePlayerId is always preferred; id is the fallback (may include season suffix).
 *  Trimming prevents whitespace mismatches. */
function playerKey(p: any): string {
  return String(p.basePlayerId ?? p.id ?? "").trim();
}

function buildProjections(players: any[]): { projByBaseId: Map<string, number> } {
  const projByBaseId = new Map<string, number>();
  for (const p of players) {
    const bid = playerKey(p);
    const proj = Number(p.avgFP ?? p.projectedFp ?? 0);
    if (bid) projByBaseId.set(bid, proj);
  }
  return { projByBaseId };
}

function getEconomyConfig(): EconomyConfig {
  return {
    ...DEFAULT_ECONOMY_CONFIG,
    capMax: sportAdapter.salaryCap,
  };
}

function toPlayerEval(p: any, projByBaseId: Map<string, number>): PlayerEval {
  const baseId = playerKey(p);
  const proj = projByBaseId.get(baseId) ?? Number(p.avgFP ?? p.projectedFp ?? 0);
  const eco = getEconomyConfig();
  // Basketball uses pre-computed salaries in players.json (range $13-$89).
  // Only clamp the LOWER bound — never cap the top, or superstars collapse
  // to the same salary as mid-tier starters (was squashing top 9 to $65).
  const salary = Math.max(eco.salaryMin, Number(p.salary ?? 10));
  // Derive tier from salary rather than trusting players.json — the JSON tier
  // field is stale and inconsistent (e.g. same-salary players tagged differently).
  // Salary-derived tiers align with strategic economy thresholds.
  return {
    id: String(p.id),
    basePlayerId: baseId,
    personKey: baseId,
    cardId: `${baseId}-${Math.random().toString(36).slice(2, 7)}`,
    name: String(p.name ?? ""),
    team: String(p.team ?? ""),
    season: String(p.season ?? ""),
    position: sportAdapter.normalizePosition(p.position),
    photoCode: p.photoCode != null ? String(p.photoCode) : undefined,
    projectedFp: proj,
    salary,
    tier: tierFromSalary(salary, eco),
  };
}

/** Returns true if this player-season has at least one meaningful game log.
 *  Looks up logs keyed by `${basePlayerId}|${season}`, where season is the
 *  numeric form (e.g. 2425, 2324) the dataEngine indexes under. Must have
 *  per-game quickFP >= 8 AND minutes >= 10 (matches resolve filter). */
function hasValidLogs(basePlayerId: string, season: number | string, logsByKey: Map<string, any[]>): boolean {
  const base = basePlayerId.trim();
  if (!base) return false;
  const seasonNum = Number(season);
  if (!Number.isFinite(seasonNum)) return false;
  const minMins = (sportAdapter as any).config?.historicalLogFilters?.minMinutes ?? 10;
  const candidates = logsByKey.get(`${base}|${seasonNum}`) ?? [];
  if (candidates.length === 0) return false;
  return candidates.some((l: any) => {
    const s = l.stats ?? {};
    const pts = Number(s.pts ?? s.points ?? s.PTS ?? 0);
    const reb = Number(s.reb ?? s.rebounds ?? s.REB ?? s.trb ?? 0);
    const ast = Number(s.ast ?? s.assists ?? s.AST ?? 0);
    if ((pts * 1.0 + reb * 1.2 + ast * 1.5) < 8) return false;
    // Also check minutes — must match the resolve-time filter
    const mp = s.mp ?? s.minutes ?? s.min ?? s.MIN ?? s.minutesPlayed;
    if (mp !== undefined && mp !== null) {
      const mpStr = String(mp);
      const mins = mpStr.includes(":") ? parseFloat(mpStr.split(":")[0]) : parseFloat(mpStr);
      if (Number.isFinite(mins) && mins < minMins) return false;
    }
    return true;
  });
}

/** Daily-seeded "which season for this player today?" picker. Deterministic
 *  per (date, basePlayerId): the same player gets the same season-of-the-day
 *  across the entire deal flow within one UTC day, but different days roll
 *  different seasons. Single-season players short-circuit. */
function chooseSeasonForPlayer(basePlayerId: string, seasons: string[], dateKey: string): string {
  if (seasons.length <= 1) return seasons[0] ?? "";
  const seed = hashStr(`basketball|${dateKey}|${basePlayerId}`);
  const rng = seededMulberry32(seed);
  return seasons[Math.floor(rng() * seasons.length)];
}

/** Group players by basePlayerId and pick one season per player using the
 *  daily-seeded RNG. Replaces the old `_2425` filter — instead of locking the
 *  pool to a single hardcoded season, every basePlayerId is represented once
 *  per day at one of its eligible seasons (chosen deterministically). The
 *  slate engine downstream sees a clean basePlayerId-unique pool, no aware-
 *  ness of seasons required. */
function buildDedupedPool(allPlayers: any[], date: Date): any[] {
  const dateKey = getDailyBonusDateKey(date);
  const byBaseId = new Map<string, any[]>();
  for (const p of allPlayers) {
    const bid = String(p.basePlayerId ?? p.id ?? "").trim();
    if (!bid) continue;
    const arr = byBaseId.get(bid);
    if (arr) arr.push(p);
    else byBaseId.set(bid, [p]);
  }
  const out: any[] = [];
  for (const [bid, entries] of byBaseId) {
    const seasons = entries.map(e => String(e.season ?? "")).filter(Boolean);
    const chosen = chooseSeasonForPlayer(bid, seasons, dateKey);
    const pick = entries.find(e => String(e.season ?? "") === chosen) ?? entries[0];
    out.push(pick);
  }
  return out;
}

/** Build the eval pool — all tiers eligible as long as they have valid logs. */
function buildEvalPool(players: any[], logs: Map<string, any[]>, projByBaseId: Map<string, number>): PlayerEval[] {
  const result = players
    .filter((p: any) => hasValidLogs(playerKey(p), Number(p.season ?? 2425), logs))
    .map(p => toPlayerEval(p, projByBaseId));

  return result;
}

/** Build the bonus-eligible pool once: today's deduped pool, players with
 *  valid logs for their chosen season, tier from salary. The seasonFilter
 *  argument to buildBonusPoolFromPlayers is dropped — the deduped pool is
 *  already one-entry-per-basePlayerId, with the season pinned to today's
 *  daily-seeded pick. */
function buildBonusPool(): Array<{ basePlayerId: string; name: string; tier: string }> {
  const logs = getLogsByKey();
  const eco = getEconomyConfig();
  const dedupedPool = buildDedupedPool(getPlayers(), new Date());
  const allBonusEligible = buildBonusPoolFromPlayers(
    dedupedPool,
    (p: any) => hasValidLogs(playerKey(p), Number(p.season ?? 2425), logs),
    (salary) => tierFromSalary(salary, eco),
    eco.salaryMin,
  );

  // When slate v2 is ON for basketball, restrict bonus picks to today's slate
  // so bonus players are guaranteed drawable.
  if (isSlateV2Enabled("basketball")) {
    const slateIds = new Set(getCachedSlate(sportAdapter as any, new Date()));
    return allBonusEligible.filter(p => slateIds.has(p.basePlayerId));
  }
  return allBonusEligible;
}

/** Today's 3 hot players with their bonus FP values — shown in Legend modal. */
export function getTodaysStars(): DailyBonusPlayer[] {
  return getDailyBonusPlayers(buildBonusPool());
}

/** Internal: today's bonus map (basePlayerId → bonus FP), used at resolve time. */
function getDailyBonusMapNow(): Map<string, number> {
  return buildDailyBonusMap(buildBonusPool());
}

export async function dealInitialRoster(): Promise<{ roster: PlayerCard[] }> {
  const allPlayers = getPlayers();
  const logs = getLogsByKey();
  // Multi-season aware: dedupe by basePlayerId, daily-seeded pick of which
  // season each player surfaces as today. Replaces the old hardcoded _2425
  // filter so 2023-24 entries are eligible to roll into the slate.
  const dedupedPool = buildDedupedPool(allPlayers, new Date());

  // Slate v2 gate (no-op when feature flag is OFF — returns input unchanged).
  // Each player needs basePlayerId for the gate; cast is safe because RawPlayer
  // includes optional basePlayerId and we fall back to id when missing.
  const slatePool = getDealPool(
    sportAdapter as any,
    dedupedPool.map((p: any) => ({ ...p, basePlayerId: String(p.basePlayerId ?? p.id ?? "").trim() })),
  );
  // Repeat limit — sliding window with pool-floor relaxation (no-op on first deal).
  const players = isSlateV2Enabled("basketball")
    ? repeatLimit.filter(slatePool, DEFAULT_REPEAT_LIMIT)
    : slatePool;

  const { projByBaseId } = buildProjections(players);
  const evalPool = buildEvalPool(players, logs, projByBaseId);

  const rnd = mulberry32(randomSeed());
  const rosterConfig = {
    rosterSize: sportAdapter.rosterSize,
    slotRequirements: sportAdapter.rosterSlots,
    excludeFromFlex: [] as string[],
  };

  const cards = generateRoster(evalPool, rosterConfig, getEconomyConfig(), rnd);
  const orangeDealt = cards.filter((c: any) => (c.tier ?? "").toUpperCase() === "ORANGE");
  if (orangeDealt.length > 0) {
    console.log(`[roster] DEALT orange: ${orangeDealt.map((c: any) => c.name).join(", ")}`);
  }

  // Record drawn cards for the repeat-limit window.
  if (isSlateV2Enabled("basketball")) {
    repeatLimit.record(
      cards.map((c: any) => String(c.basePlayerId ?? "")).filter(Boolean),
      DEFAULT_REPEAT_LIMIT,
    );
  }

  return { roster: cards as unknown as PlayerCard[] };
}

export async function redrawRoster({
  currentCards,
  lockedCardIds,
}: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ roster: PlayerCard[] }> {
  const allPlayers = getPlayers();
  const logs = getLogsByKey();
  // Same multi-season dedup as dealInitialRoster — keeps held cards stable
  // (held cards already have a season pinned), and lets redrawn slots come
  // from today's deduped pool.
  const dedupedPool = buildDedupedPool(allPlayers, new Date());

  // Slate v2 gate + repeat-limit (no-op when feature flag is OFF).
  const slatePool = getDealPool(
    sportAdapter as any,
    dedupedPool.map((p: any) => ({ ...p, basePlayerId: String(p.basePlayerId ?? p.id ?? "").trim() })),
  );
  const players = isSlateV2Enabled("basketball")
    ? repeatLimit.filter(slatePool, DEFAULT_REPEAT_LIMIT)
    : slatePool;

  const { projByBaseId } = buildProjections(players);
  const evalPool = buildEvalPool(players, logs, projByBaseId);

  const heldSlots = new Set<number>();
  currentCards.forEach((c, i) => {
    const id = String((c as any).cardId ?? (c as any).basePlayerId ?? "");
    if (lockedCardIds.has(id)) heldSlots.add(i);
  });

  const rnd = mulberry32(randomSeed());
  const rosterConfig = {
    rosterSize: sportAdapter.rosterSize,
    slotRequirements: sportAdapter.rosterSlots,
    excludeFromFlex: [] as string[],
  };

  const cards = engineRedraw(
    currentCards as unknown as GeneratedCard[],
    heldSlots,
    evalPool,
    rosterConfig,
    getEconomyConfig(),
    rnd,
  );

  // Record drawn cards for the repeat-limit window (held + redrawn cards).
  if (isSlateV2Enabled("basketball")) {
    repeatLimit.record(
      cards.map((c: any) => String(c.basePlayerId ?? "")).filter(Boolean),
      DEFAULT_REPEAT_LIMIT,
    );
  }

  return { roster: cards as unknown as PlayerCard[] };
}

export async function resolveRoster({
  finalCards,
}: {
  finalCards: PlayerCard[];
}): Promise<{ roster: PlayerCard[]; mvpCardId?: string }> {
  const logsByKey = getLogsByKey();
  const rnd = mulberry32(randomSeed());

  const { resolved, mvpCardId } = resolveCards(
    finalCards as unknown as GeneratedCard[],
    logsByKey,
    {
      fpScale: 1,
      minMinutes: (sportAdapter as any).config?.historicalLogFilters?.minMinutes ?? 10,
      dailyBonusMap: getDailyBonusMapNow(),
    },
    sportAdapter,
    rnd,
  );

  return { roster: resolved as unknown as PlayerCard[], mvpCardId };
}

/**
 * Compute the roster's theoretical ceiling: sum of each player's PERSONAL PEAK FP
 * from their 2024-25 game logs. Matches the same filter used at resolve time:
 * must have positive stats and minMinutes of playing time.
 *
 * Returns the sum of each card's best single-game FP (including badge bonuses).
 */
export function computeRosterCeiling(roster: PlayerCard[]): number {
  const logsByKey = getLogsByKey();
  const minMinutes = (sportAdapter as any).config?.historicalLogFilters?.minMinutes ?? 10;
  let ceiling = 0;

  for (const card of roster) {
    const baseId = String((card as any).basePlayerId ?? (card as any).personKey ?? "").trim();
    if (!baseId) continue;

    // Match resolveEngine: prefer season-specific logs, fall back to all
    const seasonStr = String((card as any).season ?? "");
    const seasonNum = Number(seasonStr);
    const seasonKey = Number.isFinite(seasonNum) && seasonNum > 0 ? `${baseId}|${Math.round(seasonNum)}` : null;
    let candidates = seasonKey ? (logsByKey.get(seasonKey) ?? []) : [];
    if (!candidates.length) candidates = logsByKey.get(baseId) ?? [];

    let bestFp = 0;
    for (const log of candidates) {
      const stats = (log as any).stats ?? {};
      // Must have at least one positive stat value
      const hasPositive = Object.values(stats).some(v => typeof v === "number" && v > 0);
      if (!hasPositive) continue;
      // Must meet min minutes threshold
      const mp = stats.mp ?? stats.minutes ?? stats.min ?? stats.MIN ?? stats.minutesPlayed;
      if (mp !== undefined && mp !== null) {
        const mpStr = String(mp);
        const mins = mpStr.includes(":") ? parseFloat(mpStr.split(":")[0]) : parseFloat(mpStr);
        if (Number.isFinite(mins) && mins < minMinutes) continue;
      }
      // Compute FP with position injected (matches resolveEngine)
      const statsWithPosition = { ...stats, _position: (card as any).position ?? "" };
      const baseFp = sportAdapter.computeFantasyPoints(statsWithPosition);
      const badges = sportAdapter.computeBadges(statsWithPosition);
      const badgeBonus = badges.reduce((s, b) => s + (b.fp ?? 0), 0);
      const total = baseFp + badgeBonus;
      if (total > bestFp) bestFp = total;
    }
    ceiling += bestFp;
  }

  return Math.round(ceiling * 10) / 10;
}