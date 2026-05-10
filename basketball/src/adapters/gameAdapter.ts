/**
 * gameAdapter.ts — Basketball
 * Thin orchestration layer between GameView and the engines.
 */

import { sportAdapter } from "./SportAdapter";
import { getPlayers, getLogsByKey } from "../engines/dataEngine";
import { generateRoster, redrawRoster as engineRedraw, mulberry32, randomSeed } from "../engines/rosterEngine";
import { resolveCards } from "../engines/resolveEngine";
import { DEFAULT_ECONOMY_CONFIG } from "../engines/economyEngine";
import { buildDailyBonusMap, getDailyBonusPlayers, type DailyBonusPlayer } from "@shared/utils/dailyBonus";
import { getDealPool } from "@shared/utils/dealGate";
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
  // Tier is resolved through SportAdapter.getTierById so it includes the
  // hybrid floor+quota promotion (sparse seasons get their next-best
  // PURPLE players bumped to ORANGE so every season has ≥ 8 ORANGE).
  // Card display, slate panel, and slate selector all consult the same
  // map and therefore stay in sync.
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
    tier: sportAdapter.getTierById(baseId),
  };
}

/** Returns true if this player has at least one meaningful game log in the
 *  active season. The dataEngine is per-season now (only one season's logs
 *  in the Map at any time), so we look up by basePlayerId — the season-
 *  suffixed key is no longer needed for disambiguation.
 *  Threshold: quickFP >= 8 AND minutes >= 10 (matches resolve filter). */
function hasValidLogs(basePlayerId: string, logsByKey: Map<string, any[]>): boolean {
  const base = basePlayerId.trim();
  if (!base) return false;
  const minMins = (sportAdapter as any).config?.historicalLogFilters?.minMinutes ?? 10;
  const candidates = logsByKey.get(base) ?? [];
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

/** Build the eval pool — all tiers eligible as long as they have valid logs. */
function buildEvalPool(players: any[], logs: Map<string, any[]>, projByBaseId: Map<string, number>): PlayerEval[] {
  const result = players
    .filter((p: any) => hasValidLogs(playerKey(p), logs))
    .map(p => toPlayerEval(p, projByBaseId));

  return result;
}

/** Build the bonus-eligible pool once: today's active-season players with
 *  valid logs, tier from salary. Per-season dataEngine means getPlayers()
 *  already returns only the active season's pool — no season-suffix filter
 *  needed. */
function buildBonusPool(): Array<{ basePlayerId: string; name: string; tier: string }> {
  const logs = getLogsByKey();
  // Inline pool build so tier resolution can use SportAdapter.getTierById
  // (which applies the hybrid floor+quota promotion). The shared helper's
  // mapper signature is salary-only and there's no per-player hook for
  // basketball's promotion logic — replicating the small filter/map keeps
  // it scoped to the sport that needs the promotion.
  const allBonusEligible = getPlayers()
    .filter((p: any) => hasValidLogs(playerKey(p), logs))
    .map((p: any) => ({
      basePlayerId: playerKey(p),
      name: String(p.name ?? ""),
      tier: sportAdapter.getTierById(playerKey(p)),
    }));

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
  // Per-season dataEngine: getPlayers() is already scoped to today's active
  // season. No season-suffix filter needed.

  // Slate v2 gate (no-op when feature flag is OFF — returns input unchanged).
  // Each player needs basePlayerId for the gate; cast is safe because RawPlayer
  // includes optional basePlayerId and we fall back to id when missing.
  const slatePool = getDealPool(
    sportAdapter as any,
    allPlayers.map((p: any) => ({ ...p, basePlayerId: String(p.basePlayerId ?? p.id ?? "").trim() })),
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
  // Per-season dataEngine: pool is already scoped to today's active season.

  // Slate v2 gate + repeat-limit (no-op when feature flag is OFF).
  const slatePool = getDealPool(
    sportAdapter as any,
    allPlayers.map((p: any) => ({ ...p, basePlayerId: String(p.basePlayerId ?? p.id ?? "").trim() })),
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