/**
 * worldcup/src/adapters/gameAdapter.ts
 * Builds projections from actual scoring logs with _position injected.
 * No multipliers. No shared projectionEngine.
 */

import type { PlayerCard } from "./types";
import { sportAdapter } from "./SportAdapter";
import { getPlayers, getLogsByKey } from "../engines/dataEngine";
import { generateRoster, redrawRoster as engineRedraw, mulberry32, randomSeed } from "../engines/rosterEngine";
import { resolveCards } from "../engines/resolveEngine";
import { salaryFromProjection } from "@shared/engines/economyEngine";
import type { PlayerEval, GeneratedCard, RawLog } from "@shared/types";

// ── Non-scoring fields — excluded from log filter ────────────────────────────

const NON_SCORING = new Set([
  "passes_attempted",
  "passes_completed", 
  "minutes_played",
]);

function hasScoringStats(stats: Record<string, any>): boolean {
  return Object.entries(stats ?? {}).some(
    ([k, v]) => !NON_SCORING.has(k) && typeof v === "number" && v > 0
  );
}

// ── Filter to scoring-only logs ───────────────────────────────────────────────

function filterScoringLogs(logsByKey: Map<string, RawLog[]>): Map<string, RawLog[]> {
  const filtered = new Map<string, RawLog[]>();
  for (const [key, logs] of logsByKey.entries()) {
    const scoring = logs.filter(l => hasScoringStats(l.stats ?? {}));
    if (scoring.length > 0) filtered.set(key, scoring);
  }
  return filtered;
}

// ── Build projections using position-specific weights ────────────────────────
// proj = avg FP across all scoring logs, with _position injected so
// SportAdapter uses positionProjectionWeights for the correct position.
// This means a $34 GK and $34 DEF will project similarly — same salary = same proj range.

function buildProjectionsFromLogs(
  players: any[],
  scoringLogs: Map<string, RawLog[]>
): Map<string, number> {
  const projByBaseId = new Map<string, number>();

  for (const p of players) {
    const id  = String(p.basePlayerId ?? p.id ?? "").trim();
    const pos = sportAdapter.normalizePosition(p.position);
    if (!id) continue;

    const logs = scoringLogs.get(id) ?? [];
    if (!logs.length) continue;

    // Inject _position so position-specific weights are used
    const fps = logs
      .map(l => sportAdapter.computeFantasyPoints({ ...(l.stats ?? {}), _position: pos }))
      .filter(fp => fp > 0);

    if (!fps.length) continue;

    const avg = fps.reduce((s, v) => s + v, 0) / fps.length;
    projByBaseId.set(id, avg);
  }

  return projByBaseId;
}

// ── Build eval pool ───────────────────────────────────────────────────────────

function buildEvalPool(
  players: any[],
  scoringLogs: Map<string, RawLog[]>
): PlayerEval[] {
  const projByBaseId = buildProjectionsFromLogs(players, scoringLogs);

  // Compute per-position means so salaryFromProjection can normalise within position
  const posSums: Record<string, number> = {};
  const posCounts: Record<string, number> = {};
  for (const p of players) {
    const id  = String(p.basePlayerId ?? p.id ?? "").trim();
    const pos = sportAdapter.normalizePosition(p.position);
    const proj = projByBaseId.get(id);
    if (proj === undefined) continue;
    posSums[pos]   = (posSums[pos]   ?? 0) + proj;
    posCounts[pos] = (posCounts[pos] ?? 0) + 1;
  }
  const posMeans: Record<string, number> = {};
  for (const pos of Object.keys(posSums)) {
    posMeans[pos] = posSums[pos] / Math.max(1, posCounts[pos]);
  }

  const econCfg = sportAdapter.economyConfig;

  return players
    .filter(p => {
      const id = String(p.basePlayerId ?? p.id ?? "").trim();
      return id && projByBaseId.has(id);
    })
    .map(p => {
      const baseId = String(p.basePlayerId ?? p.id ?? "");
      const pos    = sportAdapter.normalizePosition(p.position);
      const proj   = projByBaseId.get(baseId) ?? 0;

      // Salary derived FROM proj (within-position normalisation)
      // This is the key: same proj = same salary regardless of position
      const salary = salaryFromProjection(proj, posMeans[pos] ?? proj, econCfg);

      return {
        id:           String(p.id),
        basePlayerId: baseId,
        personKey:    baseId,
        cardId:       `${baseId}-${Math.random().toString(36).slice(2, 7)}`,
        name:         String(p.name ?? ""),
        team:         String(p.team ?? ""),
        season:       String(p.season ?? ""),
        position:     pos,
        photoCode:    p.photoCode != null ? String(p.photoCode) : undefined,
        projectedFp:  proj,
        salary,
        tier:         sportAdapter.normalizeTier(p.tier), // tier re-assigned by rosterEngine from salary
      } as PlayerEval;
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function dealInitialRoster(): Promise<{ roster: PlayerCard[] }> {
  const players     = getPlayers();
  const logsByKey   = getLogsByKey();
  const scoringLogs = filterScoringLogs(logsByKey);
  const evalPool    = buildEvalPool(players, scoringLogs);

  const rnd = mulberry32(randomSeed());
  const rosterConfig = {
    rosterSize:       sportAdapter.rosterSize,
    slotRequirements: sportAdapter.rosterSlots,
    excludeFromFlex:  sportAdapter.excludeFromFlex,
  };

  const cards = generateRoster(evalPool, rosterConfig, sportAdapter.economyConfig, rnd);
  return { roster: cards as unknown as PlayerCard[] };
}

export async function redrawRoster({
  currentCards,
  lockedCardIds,
}: {
  currentCards:  PlayerCard[];
  lockedCardIds: Set<string>;
}): Promise<{ roster: PlayerCard[] }> {
  const players     = getPlayers();
  const logsByKey   = getLogsByKey();
  const scoringLogs = filterScoringLogs(logsByKey);
  const evalPool    = buildEvalPool(players, scoringLogs);

  const heldSlots = new Set<number>();
  currentCards.forEach((c, i) => {
    if (lockedCardIds.has(String(c.cardId ?? c.basePlayerId ?? ""))) heldSlots.add(i);
  });

  const rnd = mulberry32(randomSeed());
  const rosterConfig = {
    rosterSize:       sportAdapter.rosterSize,
    slotRequirements: sportAdapter.rosterSlots,
    excludeFromFlex:  sportAdapter.excludeFromFlex,
  };

  const cards = engineRedraw(
    currentCards as unknown as GeneratedCard[],
    heldSlots,
    evalPool,
    rosterConfig,
    sportAdapter.economyConfig,
    rnd,
  );
  return { roster: cards as unknown as PlayerCard[] };
}

export async function resolveRoster({
  finalCards,
}: {
  finalCards: PlayerCard[];
}): Promise<{ roster: PlayerCard[]; mvpCardId?: string }> {
  const logsByKey   = getLogsByKey();
  const scoringLogs = filterScoringLogs(logsByKey);
  const rnd         = mulberry32(randomSeed());

  const { resolved, mvpCardId } = resolveCards(
    finalCards as unknown as GeneratedCard[],
    scoringLogs,        // ← filtered map, no passes-only logs
    { fpScale: 1 },
    sportAdapter,
    rnd,
  );

  return { roster: resolved as unknown as PlayerCard[], mvpCardId };
}