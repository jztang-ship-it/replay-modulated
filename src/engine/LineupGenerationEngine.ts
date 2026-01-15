/**
 * LineupGenerationEngine - Deterministic cap-maximizing lineup generation
 * Sport-agnostic algorithm that fills roster slots under cap + position rules
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

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * Weighted pick from the top band (sorted by salary desc).
 * Higher ranks are more likely, but lower ranks still possible.
 * This reduces repetition while still preferring expensive players.
 */
function pickWeightedFromTopBand(
  candidatesSortedDesc: Player[],
  rng: RandomEngine,
  bandSize: number
): Player | null {
  const band = candidatesSortedDesc.slice(0, Math.min(bandSize, candidatesSortedDesc.length));
  if (band.length === 0) return null;

  // weights: 1.0, 0.95, 0.90, ... (never below 0.15)
  const weights = band.map((_, i) => Math.max(0.15, 1 - i * 0.05));
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

    const roster = makeEmptyRoster(rosterSize);

    let remainingCap = salaryCap;
    const usedBaseIds = new Set<string>();
    const positionCounts: Record<string, number> = {};
    for (const pos of config.positions) positionCounts[pos] = 0;

    /**
     * Apply held slots (step 2 -> step 3).
     * IMPORTANT: do not allow duplicate base identity; drop invalid helds quietly.
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

    const emptySlots = roster.filter((s) => !s.player);
    const slotsToFill = emptySlots.length;

    /**
     * Remaining mins we still must satisfy across the whole lineup.
     * This is what enforces "at least 1 of each position" (or whatever mins config defines).
     */
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

    // Stable sorted pools (sports-agnostic)
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
     * if we pick a candidate, can we still finish the lineup (under cap) while meeting mins?
     * This prevents dead-ends and reduces partial lineups.
     */
    const minPossibleCostToFinish = (slotsRemaining: number, capLeft: number): number => {
      const required: string[] = [];
      for (const pos of config.positions) {
        const need = minsRemaining(pos);
        for (let i = 0; i < need; i++) required.push(pos);
      }
      if (required.length > slotsRemaining) return Number.POSITIVE_INFINITY;

      const tmpUsed = new Set<string>(usedBaseIds);
      const tmpCounts: Record<string, number> = { ...positionCounts };

      const canUseTmp = (p: Player, cap: number) => {
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

      // Fill required mins first (cheapest possible)
      for (const pos of required) {
        const p = pickCheapest(byPosAsc[pos] ?? [], capLeft - cost);
        if (!p) return Number.POSITIVE_INFINITY;
        cost += p.salary;
        tmpUsed.add(getBaseId(p));
        tmpCounts[p.position] = (tmpCounts[p.position] ?? 0) + 1;
      }

      // Fill remaining flex with cheapest possible
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
      for (let slotIndex = 0; slotIndex < slotsToFill; slotIndex++) {
        const slotsRemaining = slotsToFill - slotIndex;

        const stillNeeded = Object.values(minPositionsNeeded).reduce((s, c) => s + c, 0);

        // Build eligible candidates under current constraints
        let candidates = bySalaryDesc.filter((p) => canUse(p, remainingCap));
        if (candidates.length === 0) throw new Error(`Cannot fill slot ${slotIndex + 1}: no eligible players`);

        /**
         * If we MUST satisfy mins soon (no slack), restrict to needed positions when possible.
         */
        if (stillNeeded > 0 && slotsRemaining <= stillNeeded) {
          const neededPositions = Object.entries(minPositionsNeeded)
            .filter(([, count]) => count > 0)
            .map(([pos]) => pos);

          const restricted = candidates.filter((p) => neededPositions.includes(p.position));
          if (restricted.length > 0) candidates = restricted;
        }

        /**
         * Anti-repetition change:
         * Instead of always grabbing the absolute highest salary,
         * choose from a top band with weighted randomness, but only if it stays feasible.
         */
        const bandSize =
          slotIndex === 0 ? 35 : 50; // slightly tighter for first anchor, wider later

        let picked: Player | null = null;

        // Try a handful of weighted picks until one is feasible.
        for (let attempt = 0; attempt < 80; attempt++) {
          const candidate = pickWeightedFromTopBand(candidates, rng, bandSize);
          if (!candidate) break;

          const capAfter = remainingCap - candidate.salary;
          if (capAfter < 0) continue;

          // Temporarily "simulate" taking candidate
          usedBaseIds.add(getBaseId(candidate));
          positionCounts[candidate.position] = (positionCounts[candidate.position] ?? 0) + 1;

          const minCost = minPossibleCostToFinish(slotsRemaining - 1, capAfter);

          // Undo simulation
          usedBaseIds.delete(getBaseId(candidate));
          positionCounts[candidate.position] = (positionCounts[candidate.position] ?? 1) - 1;

          if (minCost <= capAfter) {
            picked = candidate;
            break;
          }
        }

        // Fallback: pick the best feasible by salary (deterministic)
        if (!picked) {
          picked =
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

        if (!picked) throw new Error(`Cannot fill slot ${slotIndex + 1}: feasibility failed`);

        commitPick(slotIndex, picked);
      }
    } catch (err) {
      // If not relaxed, bubble up
      if (config.lineupGenerationMode !== "RELAXED") throw err;

      // RELAXED fallback: clear non-held and try to fill with looser approach (still respects cap/max/dupes)
      for (let i = 0; i < rosterSize; i++) {
        if (roster[i].player && roster[i].held) continue;
        if (!roster[i].player) roster[i] = { index: i, player: null, held: false };
      }

      // rebuild state from kept players
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

      // fill empty slots greedily but with band randomness
      const relaxedEmpty = roster.filter((s) => !s.player);

      for (let i = 0; i < relaxedEmpty.length; i++) {
        const slotsRemaining = relaxedEmpty.length - i;

        // Prefer needed positions if any mins are still missing
        let neededPos: string | null = null;
        for (const pos of config.positions) {
          if (minsRemaining(pos) > 0) {
            neededPos = pos;
            break;
          }
        }

        let pool = bySalaryDesc.filter((p) => canUse(p, remainingCap));
        if (pool.length === 0) break;

        if (neededPos) {
          const restricted = pool.filter((p) => p.position === neededPos);
          if (restricted.length > 0) pool = restricted;
        }

        // band pick, but keep it feasible if possible
        const bandSize = neededPos ? 30 : 45;
        let picked: Player | null = null;

        for (let attempt = 0; attempt < 60; attempt++) {
          const candidate = pickWeightedFromTopBand(pool, rng, bandSize);
          if (!candidate) break;
          const capAfter = remainingCap - candidate.salary;
          if (capAfter < 0) continue;

          usedBaseIds.add(getBaseId(candidate));
          positionCounts[candidate.position] = (positionCounts[candidate.position] ?? 0) + 1;
          const minCost = minPossibleCostToFinish(slotsRemaining - 1, capAfter);
          usedBaseIds.delete(getBaseId(candidate));
          positionCounts[candidate.position] = (positionCounts[candidate.position] ?? 1) - 1;

          if (minCost <= capAfter) {
            picked = candidate;
            break;
          }
        }

        if (!picked) picked = pool[0];

        relaxedEmpty[i].player = picked;
        remainingCap -= picked.salary;
        usedBaseIds.add(getBaseId(picked));
        positionCounts[picked.position] = (positionCounts[picked.position] ?? 0) + 1;
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
    // If user holds ZERO, roster has no held players -> this produces a brand new lineup.
    // If user holds some, those are applied and the rest are refilled under remaining cap + mins.
    return this.generateDeterministicLineup(config, availablePlayers, rng, roster);
  }
}
