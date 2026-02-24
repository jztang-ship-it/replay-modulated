/**
 * gameAdapter.ts — Public API
 *
 * Thin orchestration layer. Loads data, builds eval pool, delegates to engines.
 */

import { ensureLoaded, getPlayers, getLogsByKey } from "../engines/dataEngine";
import { buildProjections } from "../engines/projectionEngine";
import { DEFAULT_ECONOMY_CONFIG, salaryFromProjection, tierFromSalary } from "../engines/economyEngine";
import {
  generateRoster,
  redrawRoster as engineRedrawRoster,
  mulberry32,
  randomSeed,
  type PlayerEval,
  type GeneratedCard,
  type RosterConfig,
} from "../engines/rosterEngine";
import { resolveCards, type ResolveConfig } from "../engines/resolveEngine";
import { sportAdapter } from "./SportAdapter";
import type { PlayerCard } from "./types";

// ── Sport config ───────────────────────────────────────────────────────────

const ECONOMY_CONFIG = {
  ...DEFAULT_ECONOMY_CONFIG,
  capMax: sportAdapter.salaryCap,
};

const ROSTER_CONFIG: RosterConfig = {
  rosterSize: sportAdapter.rosterSize,
  slotRequirements: ["FW", "MD", "DE", "GK", "FLEX", "FLEX"],
  excludeFromFlex: ["GK"],
};

// ── Eval pool cache ────────────────────────────────────────────────────────

let _evalPool: PlayerEval[] | null = null;
let _resolveConfig: ResolveConfig | null = null;

async function getEvalPool(): Promise<{ pool: PlayerEval[]; resolveConfig: ResolveConfig }> {
  await ensureLoaded();

  if (_evalPool && _resolveConfig) {
    return { pool: _evalPool, resolveConfig: _resolveConfig };
  }

  const players = getPlayers();
  const logsByKey = getLogsByKey();
  const { projByBaseId, posMeans, fpScale } = buildProjections(players);

  // Only include players that have log data
  // Log keys are basePlayerId strings (e.g. "679")
  const logIds = new Set<string>(logsByKey.keys());

  _evalPool = players
    .filter(p => {
      const bid = baseId(p);
      return logIds.has(bid);
    })
    .map(p => {
      const bid = baseId(p);
      const proj = (projByBaseId.get(bid) ?? 0) * fpScale;
      const pos = String(p.position ?? "").toUpperCase() || "UNK";
      const mean = (posMeans[pos] ?? 0) * fpScale;

      // Trust players.json salary and tier — they were built correctly
      const salary = Number((p as any).salary ?? salaryFromProjection(proj, mean, ECONOMY_CONFIG));
      const tier = String((p as any).tier ?? tierFromSalary(salary, ECONOMY_CONFIG));

      return {
        id: String(p.id),
        basePlayerId: bid,
        personKey: `base:${bid}`,
        cardId: `${bid}|${String(p.season ?? "")}|${String(p.position ?? "")}`,
        name: String(p.name ?? ""),
        team: String(p.team ?? ""),
        season: String(p.season ?? ""),
        position: String(p.position ?? ""),
        photoCode: (p as any).photoCode ?? null,
        projectedFp: proj,
        salary,
        tier,
      } as PlayerEval;
    });

  _resolveConfig = { fpScale };

  // Debug — remove after confirming data is correct
  const tc: Record<string, number> = {};
  for (const p of _evalPool) tc[p.tier] = (tc[p.tier] ?? 0) + 1;
  console.log(`[GameAdapter] Eval pool: ${_evalPool.length} players, tiers:`, tc);
  console.log(`[GameAdapter] Sample:`, JSON.stringify(_evalPool[0]));

  return { pool: _evalPool, resolveConfig: _resolveConfig };
}

// ── Public API ─────────────────────────────────────────────────────────────

export type DealResult = { roster: PlayerCard[]; cards: PlayerCard[] };
export type ResolveResult = DealResult & { mvpCardId?: string };

export async function dealInitialRoster(): Promise<DealResult> {
  const { pool } = await getEvalPool();
  const rnd = mulberry32(randomSeed());
  const roster = generateRoster(pool, ROSTER_CONFIG, ECONOMY_CONFIG, rnd);
  const cards = roster.map(toPlayerCard);
  return { roster: cards, cards };
}

export async function redrawRoster(params: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<DealResult> {
  const { pool } = await getEvalPool();
  const rnd = mulberry32(randomSeed());

  const current = params.currentCards.map(toGeneratedCard);

  const heldSlots = new Set<number>();
  params.currentCards.forEach((c, i) => {
    if (params.lockedCardIds.has(cardIdOf(c))) heldSlots.add(i);
  });

  const redrawn = engineRedrawRoster(current, heldSlots, pool, ROSTER_CONFIG, ECONOMY_CONFIG, rnd);
  const cards = redrawn.map(toPlayerCard);
  return { roster: cards, cards };
}

export async function resolveRoster(params: {
  finalCards: PlayerCard[];
}): Promise<ResolveResult> {
  const { resolveConfig } = await getEvalPool();
  const logsByKey = getLogsByKey();
  const rnd = mulberry32(randomSeed());

  const cards = params.finalCards.map(toGeneratedCard);
  const { resolved, mvpCardId } = resolveCards(cards, logsByKey, resolveConfig!, rnd);

  return {
    roster: resolved.map(toPlayerCard),
    cards: resolved.map(toPlayerCard),
    mvpCardId,
  };
}

export function invalidateCache() {
  _evalPool = null;
  _resolveConfig = null;
}

// ── Type converters ────────────────────────────────────────────────────────

function toPlayerCard(c: GeneratedCard): PlayerCard {
  return {
    cardId: c.cardId,
    basePlayerId: c.basePlayerId,
    name: c.name,
    team: c.team,
    season: c.season,
    position: c.position as any,
    tier: c.tier as any,
    salary: c.salary,
    projectedFp: c.projectedFp,
    actualFp: c.actualFp ?? 0,
    fpDelta: c.fpDelta ?? 0,
    gameInfo: c.gameInfo as any ?? { date: "", opponent: "" },
    statLine: c.statLine ?? {},
    achievements: c.achievements as any ?? [],
    slotIndex: c.slotIndex ?? 0,
    wasHeld: c.wasHeld ?? false,
    photoCode: String(c.photoCode ?? ""),
  } as PlayerCard;
}

function toGeneratedCard(c: PlayerCard): GeneratedCard {
  return {
    id: String((c as any).id ?? c.basePlayerId),
    basePlayerId: c.basePlayerId,
    personKey: `base:${c.basePlayerId}`,
    cardId: c.cardId,
    name: c.name,
    team: c.team,
    season: c.season,
    position: c.position,
    photoCode: (c as any).photoCode,
    projectedFp: Number(c.projectedFp ?? 0),
    salary: Number(c.salary ?? 0),
    tier: (c as any).tier ?? "WHITE",
    slotIndex: c.slotIndex ?? 0,
    wasHeld: c.wasHeld ?? false,
    actualFp: Number(c.actualFp ?? 0),
    fpDelta: Number(c.fpDelta ?? 0),
    gameInfo: c.gameInfo as any,
    statLine: c.statLine ?? {},
    achievements: c.achievements ?? [],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function baseId(p: { id: string; basePlayerId?: string }): string {
  const b = String(p.basePlayerId ?? "").trim();
  return b.length ? b : String(p.id).split("-")[0];
}

function cardIdOf(c: PlayerCard): string {
  return String(c?.cardId ?? c?.basePlayerId ?? "");
}