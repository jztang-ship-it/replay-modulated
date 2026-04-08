/**
 * baseball/src/adapters/gameAdapter.ts
 * Orchestration layer between GameView and the shared engines.
 * Forked from basketball — baseball uses P/BAT slots, different log filter.
 */

import { sportAdapter } from "./SportAdapter";
import { getPlayers, getLogsByKey } from "../engines/dataEngine";
import { generateRoster, redrawRoster as engineRedraw, mulberry32, randomSeed } from "../engines/rosterEngine";
import { resolveCards } from "../engines/resolveEngine";
import { DEFAULT_ECONOMY_CONFIG } from "../engines/economyEngine";
import type { PlayerCard } from "./types";
import type { PlayerEval, GeneratedCard } from "../engines/rosterEngine";
import type { EconomyConfig } from "../engines/economyEngine";

function buildProjections(players: any[]): { projByBaseId: Map<string, number> } {
  const projByBaseId = new Map<string, number>();
  for (const p of players) {
    const bid = String(p.basePlayerId ?? p.id ?? "").trim();
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
  const baseId = String(p.basePlayerId ?? p.id ?? "");
  const proj = projByBaseId.get(baseId) ?? Number(p.avgFP ?? p.projectedFp ?? 0);
  const eco = getEconomyConfig();
  const salary = Math.max(eco.salaryMin, Math.min(Number(p.salary ?? 10), eco.salaryMax));
  return {
    id: String(p.id),
    basePlayerId: baseId,
    personKey: baseId,
    cardId: `${baseId}-${Math.random().toString(36).slice(2, 7)}`,
    name: String(p.name ?? ""),
    team: String(p.team ?? ""),
    season: String(p.season ?? ""),
    position: sportAdapter.normalizePosition(p.position),
    photoCode: p.photoCode ?? String(p.basePlayerId ?? p.id ?? ""),
    projectedFp: proj,
    salary,
    tier: (p.tier as any) ?? "WHITE",
  };
}

/**
 * Baseball log validity check — thresholds match recalc-tiers.mjs EHLP filters.
 * Pitchers: ip >= 4 (qualifying start).
 * Hitters: pa >= 3 AND at least one counting event.
 */
function hasValidLogs(basePlayerId: string, position: string, logsByKey: Map<string, any[]>): boolean {
  const base = basePlayerId.trim();
  if (!base) return false;
  const candidates = logsByKey.get(`${base}|2425`) ?? logsByKey.get(base) ?? [];
  if (candidates.length === 0) return false;

  const isPitcher = sportAdapter.isPitcherPosition(position);

  return candidates.some((l: any) => {
    const s = l.stats ?? {};
    if (isPitcher) {
      const ip = Number(s.ip ?? 0);
      return ip >= 4;
    } else {
      const pa = Number(s.pa ?? 0);
      const events = Number(s.h ?? 0) + Number(s.hr ?? 0) + Number(s.r ?? 0) +
                     Number(s.rbi ?? 0) + Number(s.bb ?? 0) + Number(s.sb ?? 0) +
                     Number(s.doubles ?? 0) + Number(s.triples ?? 0);
      return pa >= 3 && events >= 1;
    }
  });
}

export async function dealInitialRoster(): Promise<{ roster: PlayerCard[] }> {
  const allPlayers = getPlayers();
  const logs = getLogsByKey();

  const { projByBaseId } = buildProjections(allPlayers);

  const evalPool = allPlayers
    .filter((p: any) => hasValidLogs(
      String(p.basePlayerId ?? p.id ?? ""),
      String(p.position ?? ""),
      logs
    ))
    .map(p => toPlayerEval(p, projByBaseId));

  if (evalPool.length === 0) {
    console.error('[gameAdapter] evalPool is empty — game-logs.json missing or all players filtered out');
  }

  const rnd = mulberry32(randomSeed());
  const rosterConfig = {
    rosterSize: sportAdapter.rosterSize,
    slotRequirements: sportAdapter.rosterSlots as string[],
    excludeFromFlex: [] as string[],
  };

  const cards = generateRoster(evalPool, rosterConfig, getEconomyConfig(), rnd);
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
  const { projByBaseId } = buildProjections(allPlayers);

  const evalPool = allPlayers
    .filter((p: any) => hasValidLogs(
      String(p.basePlayerId ?? p.id ?? ""),
      String(p.position ?? ""),
      logs
    ))
    .map(p => toPlayerEval(p, projByBaseId));

  const heldSlots = new Set<number>();
  currentCards.forEach((c, i) => {
    const id = String((c as any).cardId ?? (c as any).basePlayerId ?? "");
    if (lockedCardIds.has(id)) heldSlots.add(i);
  });

  const rnd = mulberry32(randomSeed());
  const rosterConfig = {
    rosterSize: sportAdapter.rosterSize,
    slotRequirements: sportAdapter.rosterSlots as string[],
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
  return { roster: cards as unknown as PlayerCard[] };
}

export async function resolveRoster({
  finalCards,
  handCount,
}: {
  finalCards: PlayerCard[];
  handCount?: number;
}): Promise<{ roster: PlayerCard[]; mvpCardId?: string }> {
  const logsByKey = getLogsByKey();
  const rnd = mulberry32(randomSeed());

  const { resolved, mvpCardId } = resolveCards(
    finalCards as unknown as GeneratedCard[],
    logsByKey,
    {
      fpScale: 1,
      minMinutes: 0, // baseball has no minutes filter
      handCount: handCount ?? 999,
    },
    sportAdapter,
    rnd,
  );

  return { roster: resolved as unknown as PlayerCard[], mvpCardId };
}
