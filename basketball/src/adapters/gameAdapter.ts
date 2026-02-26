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

const ECONOMY_CONFIG = {
  ...DEFAULT_ECONOMY_CONFIG,
  capMax: sportAdapter.salaryCap,
};

const ROSTER_CONFIG: RosterConfig = {
  rosterSize:       sportAdapter.rosterSize,
  slotRequirements: sportAdapter.rosterSlots,
  excludeFromFlex:  ["GK"],
};

let _evalPool: PlayerEval[] | null = null;
let _resolveConfig: ResolveConfig | null = null;

async function getEvalPool(): Promise<{ pool: PlayerEval[]; resolveConfig: ResolveConfig }> {
  await ensureLoaded();
  if (_evalPool && _resolveConfig) return { pool: _evalPool, resolveConfig: _resolveConfig };
  const players   = getPlayers();
  const logsByKey = getLogsByKey();
  const { projByBaseId, posMeans, fpScale } = buildProjections(players);
  const logIds = new Set<string>(logsByKey.keys());
  _evalPool = players
    .filter(p => logIds.has(baseId(p)))
    .map(p => {
      const bid    = baseId(p);
      const proj   = (projByBaseId.get(bid) ?? 0) * fpScale;
      const pos    = String(p.position ?? "").toUpperCase() || "FLEX";
      const mean   = (posMeans[pos] ?? 0) * fpScale;
      const salary = Number((p as any).salary ?? salaryFromProjection(proj, mean, ECONOMY_CONFIG));
      const tier   = String((p as any).tier   ?? tierFromSalary(salary, ECONOMY_CONFIG));
      return {
        id:           String(p.id),
        basePlayerId: bid,
        personKey:    `base:${bid}`,
        cardId:       `${bid}|${String(p.season ?? "")}|${String(p.position ?? "")}`,
        name:         String(p.name ?? ""),
        team:         String(p.team ?? ""),
        season:       String(p.season ?? ""),
        position:     String(p.position ?? ""),
        photoCode:    (p as any).photoCode ?? null,
        projectedFp:  proj,
        salary,
        tier,
      } as PlayerEval;
    });
  _resolveConfig = { fpScale };
  return { pool: _evalPool, resolveConfig: _resolveConfig };
}

function baseId(p: any): string {
  return String(p.basePlayerId ?? p.id ?? "");
}

export async function onPrimaryAction(
  phase: string,
  currentCards: PlayerCard[],
  lockedIndices: number[]
): Promise<{ cards: PlayerCard[] } | null> {
  if (phase === "IDLE" || phase === "RESULTS") return dealInitialRoster();
  if (phase === "HOLD") return redrawAndResolve(currentCards, lockedIndices);
  return null;
}

export async function dealInitialRoster(): Promise<{ roster: any[]; cards: PlayerCard[] } | null> {
  try {
    const { pool, resolveConfig } = await getEvalPool();
    const rnd  = mulberry32(randomSeed());
    const hand = generateRoster(pool, ROSTER_CONFIG, ECONOMY_CONFIG, rnd);
    if (!hand) return null;
    const logsByKey = getLogsByKey();
    const { resolved } = resolveCards(hand, logsByKey, resolveConfig, rnd);
    const processedCards = resolved.map(toPlayerCard);
    return { roster: processedCards, cards: processedCards };
  } catch (e) {
    console.error("[GameAdapter] dealInitialRoster error:", e);
    return null;
  }
}

export async function redrawAndResolve(
  currentCards: PlayerCard[],
  lockedIndices: number[]
): Promise<{ cards: PlayerCard[] } | null> {
  try {
    const { pool, resolveConfig } = await getEvalPool();
    const rnd          = mulberry32(randomSeed());
    const currentEvals = currentCards.map(c => c as unknown as GeneratedCard);
    const redrawn      = engineRedrawRoster(currentEvals, new Set(lockedIndices), pool, ROSTER_CONFIG, ECONOMY_CONFIG, rnd);
    if (!redrawn) return null;
    const logsByKey = getLogsByKey();
    const { resolved } = resolveCards(redrawn, logsByKey, resolveConfig, rnd);
    return { cards: resolved.map(toPlayerCard) };
  } catch (e) {
    console.error("[GameAdapter] redrawAndResolve error:", e);
    return null;
  }
}


function toPlayerCard(r: GeneratedCard): PlayerCard {
  const headshotUrl = sportAdapter.getHeadshotUrl(r.basePlayerId);
  return {
    ...(r as any),
    headshotUrl: headshotUrl ?? undefined,
  } as unknown as PlayerCard;
}

// ── GameView-compatible wrappers ──────────────────────────────────────────
export async function redrawRoster({ currentCards, lockedCardIds }: {
  currentCards: PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ cards: PlayerCard[] } | null> {
  const indices = currentCards
    .map((c, i) => (lockedCardIds.has((c as any).cardId ?? (c as any).id) ? i : -1))
    .filter(i => i !== -1);
  return redrawAndResolve(currentCards, indices);
}

export async function resolveRoster({ finalCards }: {
  finalCards: PlayerCard[];
}): Promise<{ cards: PlayerCard[] } | null> {
  // Cards are already resolved from redrawRoster — just return them
  return { cards: finalCards };
}
