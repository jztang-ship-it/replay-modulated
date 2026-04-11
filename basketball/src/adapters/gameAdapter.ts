/**
 * gameAdapter.ts — Basketball
 * Thin orchestration layer between GameView and the engines.
 */

import { sportAdapter } from "./SportAdapter";
import { getPlayers, getLogsByKey } from "../engines/dataEngine";
import { generateRoster, redrawRoster as engineRedraw, mulberry32, randomSeed } from "../engines/rosterEngine";
import { resolveCards } from "../engines/resolveEngine";
import { DEFAULT_ECONOMY_CONFIG } from "../engines/economyEngine";
import { getDailyOrangePool } from "@shared/utils/dailyRotation";
import type { PlayerCard } from "./types";
import type { PlayerEval, GeneratedCard } from "../engines/rosterEngine";
import type { EconomyConfig } from "../engines/economyEngine";

const DAILY_ORANGE_COUNT = 4;

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
    photoCode: p.photoCode,
    projectedFp: proj,
    salary,
    tier: sportAdapter.normalizeTier(p.tier),
  };
}

/** Returns true if this player has at least one meaningful 2425 season game log.
 *  Must have 2425-specific logs with quickFP >= 8 AND minutes >= 10 (matches resolve filter). */
function hasValidLogs(basePlayerId: string, logsByKey: Map<string, any[]>): boolean {
  const base = basePlayerId.trim();
  if (!base) return false;
  const minMins = (sportAdapter as any).config?.historicalLogFilters?.minMinutes ?? 10;
  const candidates = logsByKey.get(`${base}|2425`) ?? [];
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

/** Build the eval pool with daily ORANGE rotation applied. */
function buildEvalPool(players: any[], logs: Map<string, any[]>, projByBaseId: Map<string, number>): PlayerEval[] {
  const allOrangeIds = players
    .filter((p: any) => String(p.tier ?? "").toUpperCase() === "ORANGE")
    .map((p: any) => playerKey(p));
  const activeOrange = getDailyOrangePool(allOrangeIds, DAILY_ORANGE_COUNT);
  const result = players
    .filter((p: any) => {
      if (!hasValidLogs(playerKey(p), logs)) return false;
      // ORANGE players only appear if in today's rotation
      const tier = String(p.tier ?? "").toUpperCase();
      if (tier === "ORANGE") {
        const key = playerKey(p);
        const active = activeOrange.has(key);
        console.log(`[rotation-check] ${String(p.name ?? "")} key=${key} active=${active}`);
        return active;
      }
      return true;
    })
    .map(p => toPlayerEval(p, projByBaseId));

  const orangeInPool = result.filter(p => (p.tier ?? "").toUpperCase() === "ORANGE");
  console.log(`[roster v4] pool=${result.length} orangeInPool=${orangeInPool.length} names=${orangeInPool.map(p => p.name).join(",")}`);
  return result;
}

/** Get today's active ORANGE star names + IDs (for legend modal). */
export function getTodaysStars(): Array<{ name: string; basePlayerId: string; salary: number }> {
  const allPlayers = getPlayers();
  const players = allPlayers.filter((p: any) => String(p.id ?? "").includes("_2425"));
  const orangePlayers = players.filter((p: any) => String(p.tier ?? "").toUpperCase() === "ORANGE");
  const allOrangeIds = orangePlayers.map((p: any) => playerKey(p));
  const activeIds = getDailyOrangePool(allOrangeIds, DAILY_ORANGE_COUNT);
  return orangePlayers
    .filter((p: any) => activeIds.has(playerKey(p)))
    .map((p: any) => ({ name: String(p.name ?? ""), basePlayerId: playerKey(p), salary: Number(p.salary ?? 0) }));
}

export async function dealInitialRoster(): Promise<{ roster: PlayerCard[] }> {
  const allPlayers = getPlayers();
  const logs = getLogsByKey();
  const players = allPlayers.filter((p: any) => String(p.id ?? '').includes('_2425'));
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
  const players = allPlayers.filter((p: any) => String(p.id ?? '').includes('_2425'));
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