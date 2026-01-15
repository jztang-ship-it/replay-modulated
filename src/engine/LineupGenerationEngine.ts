/**
 * LineupGenerationEngine - Deterministic lineup generation under cap + position rules
 * Sport-agnostic algorithm.
 *
 * Key properties:
 * - Enforces salary cap
 * - Enforces position min/max from SportConfig
 * - Enforces "no duplicate base player" (season cards share basePlayerId)
 * - Adds controlled randomness to reduce repeated anchors (top-band weighted pick)
 * - Still deterministic for a given seed (RandomEngine)
 */

import { Player, SportConfig, RosterSlot } from "../models";
import { RandomEngine } from "./RandomEngine";

/** Identity for season cards: basePlayerId (if present) else id */
function getBaseId(p: { id: string; basePlayerId?: string }) {
  const b = p.basePlayerId?.trim();
  return b && b.length > 0 ? b : p.id;
}

function makeEmptyRoster(size: number): RosterSlot[] {
  const roster: RosterSlot[] = [];
  for (let i = 0; i < size; i++) roster.push({ index: i, player: null, held: false });
  return roster;
}

function getLimits(config: SportConfig, position: string) {
  const limits = config.positionLimits?.[position];
  return limits ?? { min: 0, max: Number.POSITIVE_INFINITY };
}

/**
 * Weighted pick from the top band (sorted by salary desc).
 * Higher ranks are more likely, but lower ranks still possible.
 * This reduces repetition while still preferring expensive players.
 */
function pickWeightedFromTopBand(
  candidatesSortedDesc: Player[],
  rng: RandomEngine,
  bandSize: number,
  opts?: {
    temperature?: number; // higher = flatter distribution => more variety
    floor?: number;       // minimum additive weight, prevents tail from being ~0
  }
): Player | null {
  const band = candidatesSortedDesc.slice(0, Math.min(bandSize, candidatesSortedDesc.length));
  if (band.length === 0) return null;

  const temperature = opts?.temperature ?? 1.5;
  const floor = opts?.floor ?? 0.25;

  // rank i=0 is best
  const weights = band.map((_, i) => Math.exp(-(i / temperature)) + floor);
  const total = weights.reduce((s, w) => s + w, 0);

  let r = rng.random() * total;
  for (let i = 0; i < band.length; i++) {
    r -= weights[i];
    if (r <= 0) return band[i];
  }
  return band[band.length - 1];
}

export class LineupGenerationEngine {
  static generateDeterministicLineup(
    config: SportConfig,
    availablePlayers: Player[],
    rng: RandomEngine,
    heldSlots?: RosterSlot[]
  ): RosterSlot[] {
    const rosterSize = config.maxPlayers;
    const salaryCap = config.salaryCap;

    // Start empty
    const roster = makeEmptyRoster(rosterSize);

    // State tracking
    let remainingCap = salaryCap;
    const usedBaseIds = new Set<string>();
    const positionCounts: Record<string, number> = {};
    for (const pos of config.positions) positionCounts[pos] = 0;

    /**
     * Apply held slots (final draw).
     * - enforce no dup base identity
     * - enforce cap
     * - enforce position max
     * If a held is invalid, drop it quietly (resilient).
     */
    if (heldSlots) {
      for (let i = 0; i < rosterSize && i < heldSlots.length; i++) {
        const hs = heldSlots[i];
        if (!hs?.held || !hs.player) continue;

        const p = hs.player;
        const baseId = getBaseId(p);

        if (usedBaseIds.has(baseId)) continue;
        if (p.salary > remainingCap) continue;

        const lim = getLimits(config, p.position);
        const cur = positionCounts[p.position] ?? 0;
        if (cur >= lim.max) continue;

        roster[i] = { ...hs };
        remainingCap -= p.salary;
        usedBaseIds.add(baseId);
        positionCounts[p.position] = cur + 1;
      }
    }

    // Slots to fill
    const emptySlots = roster.filter((s) => !s.player);
    const slotsToFill = emptySlots.length;

    // Minimums still required
    const minPositionsNeeded: Record<string, number> = {};
    for (const pos of config.positions) {
      const lim = getLimits(config, pos);
      const cur = positionCounts[pos] ?? 0;
      minPositionsNeeded[pos] = Math.max(0, lim.min - cur);
    }

    const canUse = (p: Player, capLeft: number): boolean => {
      if (!p) return false;
      if (usedBaseIds.has(getBaseId(p))) return false;
      if (p.salary > capLeft) return false;

      const lim = getLimits(config, p.position);
      const cur = positionCounts[p.position] ?? 0;
      if (cur >= lim.max) return false;

      return true;
    };

    const minsRemaining = (pos: string): number => {
      const lim = getLimits(config, pos);
      const cur = positionCounts[pos] ?? 0;
      return Math.max(0, lim.min - cur);
    };

    // Stable sorted pools
    const bySalaryDesc = [...availablePlayers].sort(
      (a, b) => b.salary - a.salary || a.id.localeCompare(b.id)
    );
    const bySalaryAsc = [...availablePlayers].sort(
      (a, b) => a.salary - b.salary || a.id.localeCompare(b.id)
    );
    const byPosAsc: Record<string, Player[]> = {};
    for (const pos of config.positions) {
      byPosAsc[pos] = bySalaryAsc.filter((p) => p.position === pos);
    }

    /**
     * Feasibility guard:
     * Given current global state, estimate the MINIMUM cost needed to finish the rest of the lineup
     * (satisfy remaining mins + fill remaining flex with cheapest possible) under current constraints.
     *
     * Returns Infinity if impossible.
     */
    const minPossibleCostToFinish = (slotsRemaining: number, capLeft: number): number => {
      const required: string[] = [];
      for (const pos of config.positions) {
        const need = minsRemaining(pos);
        for (let i = 0; i < need; i++) required.push(pos);
      }
      if (required.length > slotsRemaining) return Number.POSITIVE_INFINITY;

      // local copies
      const tmpUsed = new Set<string>(usedBaseIds);
      const tmpCounts: Record<string, number> = { ...positionCounts };

      const canUseTmp = (p: Player, cap: number): boolean => {
        if (!p) return false;
        if (tmpUsed.has(getBaseId(p))) return false;
        if (p.salary > cap) return false;
        const lim = getLimits(config, p.position);
        const cur = tmpCounts[p.position] ?? 0;
        if (cur >= lim.max) return false;
        return true;
      };

      const pickCheapest = (pool: Player[], cap: number): Player | null => {
        for (const p of pool) {
          if (canUseTmp(p, cap)) return p;
        }
        return null;
      };

      let cost = 0;

      // satisfy mins first
      for (const pos of required) {
        const p = pickCheapest(byPosAsc[pos] ?? [], capLeft - cost);
        if (!p) return Number.POSITIVE_INFINITY;
        cost += p.salary;
        tmpUsed.add(getBaseId(p));
        tmpCounts[p.position] = (tmpCounts[p.position] ?? 0) + 1;
      }

      // fill remaining flex
      const flex = slotsRemaining - required.length;
      for (let i = 0; i < flex; i++) {
        const p = pickCheapest(bySalaryAsc, capLeft - cost);
        if (!p) return Number.POSITIVE_INFINITY;
        cost += p.salary;
        tmpUsed.add(getBaseId(p));
        tmpCounts[p.position] = (tmpCounts[p.position] ?? 0) + 1;
      }

      return cost;
    };

    const commitPick = (slotIdx: number, p: Player) => {
      emptySlots[slotIdx].player = p;
      remainingCap -= p.salary;
      usedBaseIds.add(getBaseId(p));
      positionCounts[p.position] = (positionCounts[p.position] ?? 0) + 1;
      if ((minPositionsNeeded[p.position] ?? 0) > 0) minPositionsNeeded[p.position]--;
    };

    try {
      // STRICT-ish fill (still supports RELAXED fallback below)
      for (let slotIndex = 0; slotIndex < slotsToFill; slotIndex++) {
        const slotsRemaining = slotsToFill - slotIndex;
        const stillNeeded = Object.values(minPositionsNeeded).reduce((s, c) => s + c, 0);

        // Candidates
        let candidates = bySalaryDesc.filter((p) => canUse(p, remainingCap));
        if (candidates.length === 0) throw new Error(`Cannot fill slot ${slotIndex + 1}: no eligible players`);

        // If we have no slack, focus on needed positions if possible
        if (stillNeeded > 0 && slotsRemaining <= stillNeeded) {
          const neededPositions = Object.entries(minPositionsNeeded)
            .filter(([, count]) => count > 0)
            .map(([pos]) => pos);

          const restricted = candidates.filter((p) => neededPositions.includes(p.position));
          if (restricted.length > 0) candidates = restricted;
        }

        // Wider early band reduces anchor repetition a lot
        const dynamicBandSize =
          slotIndex === 0 ? 140 :
          slotIndex === 1 ? 110 :
          80;

        let pickedStrict: Player | null = null;

        // Try weighted picks until we find one that stays feasible
        for (let attempt = 0; attempt < 140; attempt++) {
          const candidate = pickWeightedFromTopBand(candidates, rng, dynamicBandSize, {
            temperature: 1.6,
            floor: 0.20,
          });
          if (!candidate) break;

          const capAfter = remainingCap - candidate.salary;
          if (capAfter < 0) continue;

          // simulate pick
          usedBaseIds.add(getBaseId(candidate));
          positionCounts[candidate.position] = (positionCounts[candidate.position] ?? 0) + 1;

          const minCost = minPossibleCostToFinish(slotsRemaining - 1, capAfter);

          // undo
          usedBaseIds.delete(getBaseId(candidate));
          positionCounts[candidate.position] = (positionCounts[candidate.position] ?? 1) - 1;

          if (minCost <= capAfter) {
            pickedStrict = candidate;
            break;
          }
        }

        // Deterministic fallback: first feasible by salary (candidates already salary desc)
        if (!pickedStrict) {
          pickedStrict =
            candidates.find((p) => {
              const capAfter = remainingCap - p.salary;
              if (capAfter < 0) return false;

              usedBaseIds.add(getBaseId(p));
              positionCounts[p.position] = (positionCounts[p.position] ?? 0) + 1;
              const minCost = minPossibleCostToFinish(slotsRemaining - 1, capAfter);
              usedBaseIds.delete(getBaseId(p));
              positionCounts[p.position] = (positionCounts[p.position] ?? 1) - 1;

              return minCost <= capAfter;
            }) ?? null;
        }

        if (!pickedStrict) throw new Error(`Cannot fill slot ${slotIndex + 1}: feasibility failed`);

        commitPick(slotIndex, pickedStrict);
      }
    } catch (err) {
      // If not relaxed, bubble up
      if (config.lineupGenerationMode !== "RELAXED") throw err;

      /**
       * RELAXED fallback:
       * - keep held players
       * - refill others with band randomness
       * - still respects cap/max/dupes
       * - tries to satisfy mins, but will not throw if it cannot
       */

      // Clear non-held, keep held players only
      for (let i = 0; i < rosterSize; i++) {
        if (roster[i].player && roster[i].held) continue;
        if (!roster[i].player) roster[i] = { index: i, player: null, held: false };
        if (roster[i].player && !roster[i].held) roster[i] = { index: i, player: null, held: false };
      }

      // rebuild state
      usedBaseIds.clear();
      for (const pos of config.positions) positionCounts[pos] = 0;

      let usedSalary = 0;
      for (const slot of roster) {
        if (!slot.player) continue;
        usedSalary += slot.player.salary;
        usedBaseIds.add(getBaseId(slot.player));
        positionCounts[slot.player.position] = (positionCounts[slot.player.position] ?? 0) + 1;
      }
      remainingCap = salaryCap - usedSalary;

      // refill mins-needed tracking
      for (const pos of config.positions) {
        const lim = getLimits(config, pos);
        const cur = positionCounts[pos] ?? 0;
        minPositionsNeeded[pos] = Math.max(0, lim.min - cur);
      }

      const relaxedEmpty = roster.filter((s) => !s.player);

      for (let i = 0; i < relaxedEmpty.length; i++) {
        const slotsRemaining = relaxedEmpty.length - i;

        // pick a needed position if any mins missing
        let neededPos: string | null = null;
        for (const pos of config.positions) {
          if (minsRemaining(pos) > 0) { neededPos = pos; break; }
        }

        let pool = bySalaryDesc.filter((p) => canUse(p, remainingCap));
        if (pool.length === 0) break;

        if (neededPos) {
          const restricted = pool.filter((p) => p.position === neededPos);
          if (restricted.length > 0) pool = restricted;
        }

        const capPressure = remainingCap / Math.max(1, slotsRemaining);
        const bandSize = neededPos
          ? (capPressure >= 25 ? 80 : 60)
          : (capPressure >= 25 ? 140 : 100);

        let pickedRelaxed: Player | null = null;

        for (let attempt = 0; attempt < 80; attempt++) {
          const candidate = pickWeightedFromTopBand(pool, rng, bandSize, {
            temperature: 1.8,
            floor: 0.25,
          });
          if (!candidate) break;

          const capAfter = remainingCap - candidate.salary;
          if (capAfter < 0) continue;

          // simulate
          usedBaseIds.add(getBaseId(candidate));
          positionCounts[candidate.position] = (positionCounts[candidate.position] ?? 0) + 1;
          const minCost = minPossibleCostToFinish(slotsRemaining - 1, capAfter);
          // undo
          usedBaseIds.delete(getBaseId(candidate));
          positionCounts[candidate.position] = (positionCounts[candidate.position] ?? 1) - 1;

          if (minCost <= capAfter) {
            pickedRelaxed = candidate;
            break;
          }
        }

        // final fallback: best salary in pool
        if (!pickedRelaxed) pickedRelaxed = pool[0];

        // commit
        relaxedEmpty[i].player = pickedRelaxed;
        remainingCap -= pickedRelaxed.salary;
        usedBaseIds.add(getBaseId(pickedRelaxed));
        positionCounts[pickedRelaxed.position] = (positionCounts[pickedRelaxed.position] ?? 0) + 1;
        if ((minPositionsNeeded[pickedRelaxed.position] ?? 0) > 0) minPositionsNeeded[pickedRelaxed.position]--;
      }
    }

    return roster;
  }

  static fillRemainingSlots(
    roster: RosterSlot[],
    config: SportConfig,
    availablePlayers: Player[],
    rng: RandomEngine
  ): RosterSlot[] {
    // If user holds ZERO, roster has no held players -> produces a brand new lineup.
    // If user holds some, those are applied and the rest are refilled under remaining cap + mins.
    return this.generateDeterministicLineup(config, availablePlayers, rng, roster);
  }
}
