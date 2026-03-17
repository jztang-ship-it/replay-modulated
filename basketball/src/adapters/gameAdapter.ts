/**
 * gameAdapter.ts — Basketball
 * Thin orchestration layer between GameView and the engines.
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
  const salary = Number(p.salary ?? 10);
  return {
    id: String(p.id),
    basePlayerId: baseId,
    personKey: baseId,
    cardId: `${baseId}-${Math.random().toString(36).slice(2, 7)}`,
    name: String(p.name ?? ""),
    team: String(p.team ?? ""),
    season: String(p.season ?? ""),
    position: sportAdapter.normalizePosition(p.position),
    photoCode: p.photoCode,
    projectedFp: proj,
    salary,
    tier: sportAdapter.normalizeTier(p.tier),
  };
}

export async function dealInitialRoster(): Promise<{ roster: PlayerCard[] }> {
  const allPlayers = getPlayers();
  const players = allPlayers.filter((p: any) => String(p.id ?? '').includes('_2425'));
  const { projByBaseId } = buildProjections(players);
  const evalPool = players.map(p => toPlayerEval(p, projByBaseId));

  const rnd = mulberry32(randomSeed());
  const rosterConfig = {
    rosterSize: sportAdapter.rosterSize,
    slotRequirements: sportAdapter.rosterSlots,
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
  const players = allPlayers.filter((p: any) => String(p.id ?? '').includes('_2425'));
  const { projByBaseId } = buildProjections(players);
  const evalPool = players.map(p => toPlayerEval(p, projByBaseId));

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
      minMinutes: (sportAdapter as any).config?.historicalLogFilters?.minMinutes ?? 10,
      handCount: handCount ?? 999,
    },
    sportAdapter,
    rnd,
  );

  return { roster: resolved as unknown as PlayerCard[], mvpCardId };
}