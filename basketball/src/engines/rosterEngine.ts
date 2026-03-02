/**
 * rosterEngine.ts — Layer 1 (sport-agnostic)
 *
 * Generates rosters from a player eval pool.
 * All sport-specific slot requirements come in via RosterConfig.
 * No fetching. No UI. Pure logic.
 */

import type { TierColor } from "./economyEngine";
import { tierFromSalary, totalSalary, clampInt, type EconomyConfig } from "./economyEngine";
import type { RawPlayer } from "./dataEngine";

// ── Types ──────────────────────────────────────────────────────────────────

export type SlotRequirement = string | "FLEX";

export interface RosterConfig {
  rosterSize: number;
  /** Slot requirements in order. e.g. ["FW","MD","DE","GK","FLEX","FLEX"] */
  slotRequirements: SlotRequirement[];
  /** Positions that are "anchor" tier (ORANGE/PURPLE) — excluded from FLEX */
  excludeFromFlex?: string[];
}

export interface PlayerEval {
  // Identity
  id: string;
  basePlayerId: string;
  personKey: string;
  cardId: string;

  // Display
  name: string;
  team: string;
  season: string;
  position: string;
  photoCode?: string | number;
  headshotUrl?: string;

  // Economy
  projectedFp: number;
  salary: number;
  tier: TierColor;
}

export interface GeneratedCard extends PlayerEval {
  slotIndex: number;
  wasHeld: boolean;
  actualFp: number;
  fpDelta: number;
  gameInfo: { date: string; opponent: string; homeAway?: string };
  statLine: Record<string, any>;
  achievements: any[];
}

// ── Deterministic RNG ──────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Date.now() ^ Math.floor(Math.random() * 1e9);
}

export function pickOne<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

// ── Core roster generation ─────────────────────────────────────────────────

/**
 * Generate a roster from an eval pool.
 *
 * Budget-aware approach: tracks remaining cap slot-by-slot during build,
 * always reserving enough for remaining slots at minimum salary ($5 each).
 * This means the cap is NEVER exceeded during construction — enforceCapWithReplacement
 * is a safety net only, not the primary mechanism.
 *
 * Guarantees: unique players, slot requirements met, cap respected, anchor present.
 */
export function generateRoster(
  evalPool: PlayerEval[],
  config: RosterConfig,
  economyConfig: EconomyConfig,
  rnd: () => number
): GeneratedCard[] {
  const { rosterSize, slotRequirements } = config;
  if (!evalPool.length) return [];

  const cap = economyConfig.capMax;
  // Minimum salary in the pool (floor for budget reservation)
  const minSalary = Math.min(...evalPool.map(p => p.salary));
  const byPos = buildPositionPools(evalPool);
  const usedPeople = new Set<string>();
  const roster: Array<GeneratedCard | null> = Array(rosterSize).fill(null);

  // ── Step 1: Pick one anchor (ORANGE or PURPLE) first ────────────────────
  // This guarantees an anchor exists and we budget around it.
  const anchorThreshold = economyConfig.tierThresholds.find(t => t.tier === "PURPLE")?.minSalary ?? 40;
  const anchorPool = evalPool
    .filter(p => p.salary >= anchorThreshold)
    .sort((a, b) => b.salary - a.salary);

  // Anchor must leave room for remaining 5 slots at minSalary each
  const maxAnchorSalary = cap - (rosterSize - 1) * minSalary;
  const affordableAnchors = anchorPool.filter(p => p.salary <= maxAnchorSalary);

  let budgetRemaining = cap;

  if (affordableAnchors.length > 0) {
    const anchor = pickWeightedRandom(affordableAnchors, usedPeople, rnd) ?? affordableAnchors[0];
    usedPeople.add(anchor.personKey);
    budgetRemaining -= anchor.salary;

    // Place anchor in first non-GK required slot (or slot 0 if none)
    const anchorSlot = slotRequirements.findIndex(
      (req, i) => req !== "FLEX" && req.toUpperCase() !== "GK"
    );
    const targetSlot = anchorSlot >= 0 ? anchorSlot : 0;
    roster[targetSlot] = toGeneratedCard(anchor, targetSlot);
  }

  // ── Step 2: Fill remaining required slots (non-FLEX) ────────────────────
  for (let i = 0; i < rosterSize; i++) {
    if (roster[i] !== null) continue;
    const req = slotRequirements[i];
    if (req === "FLEX") continue;

    const slotsStillEmpty = roster.filter((s, idx) => s === null && idx >= i).length;
    const maxForSlot = budgetRemaining - (slotsStillEmpty - 1) * minSalary;

    const posPool = byPos[req.toUpperCase()] ?? [];
    const candidates = posPool.filter(p =>
      !usedPeople.has(p.personKey) &&
      p.salary <= maxForSlot
    );

    const picked = candidates.length
      ? (pickWeightedRandom(candidates, usedPeople, rnd) ?? candidates[candidates.length - 1])
      : cheapestAvailable(posPool.length ? posPool : evalPool, usedPeople, maxForSlot);

    if (picked) {
      usedPeople.add(picked.personKey);
      budgetRemaining -= picked.salary;
      roster[i] = toGeneratedCard(picked, i);
    }
  }

  // ── Step 3: Fill FLEX slots ──────────────────────────────────────────────
  const excludePos = new Set(config.excludeFromFlex ?? ["GK"]);
  const flexPool = evalPool
    .filter(p => !excludePos.has(p.position.toUpperCase()))
    .sort((a, b) => b.salary - a.salary);

  for (let i = 0; i < rosterSize; i++) {
    if (roster[i] !== null) continue;

    const slotsStillEmpty = roster.filter((s, idx) => s === null && idx >= i).length;
    const maxForSlot = budgetRemaining - (slotsStillEmpty - 1) * minSalary;

    const candidates = flexPool.filter(p =>
      !usedPeople.has(p.personKey) &&
      p.salary <= maxForSlot
    );

    const picked = candidates.length
      ? (pickWeightedRandom(candidates, usedPeople, rnd) ?? candidates[candidates.length - 1])
      : cheapestAvailable(evalPool, usedPeople, maxForSlot);

    if (picked) {
      usedPeople.add(picked.personKey);
      budgetRemaining -= picked.salary;
      roster[i] = toGeneratedCard(picked, i);
    }
  }

  // ── Step 4: Fallback for any still-null slots ────────────────────────────
  for (let i = 0; i < rosterSize; i++) {
    if (roster[i] !== null) continue;
    const slotsStillEmpty = roster.filter((s, idx) => s === null && idx >= i).length;
    const maxForSlot = budgetRemaining - (slotsStillEmpty - 1) * minSalary;

    const fallback = cheapestAvailable(evalPool, usedPeople, maxForSlot)
      ?? evalPool.find(p => !usedPeople.has(p.personKey))
      ?? evalPool[0];

    usedPeople.add(fallback.personKey);
    budgetRemaining -= fallback.salary;
    roster[i] = toGeneratedCard(fallback, i);
  }

  const filled = roster.filter(Boolean) as GeneratedCard[];

  // ── Step 5: Arrange anchors into top slots ───────────────────────────────
  const arranged = arrangeAnchors(filled, slotRequirements);

  // ── Step 6: Cap enforcement (safety net — should rarely trigger now) ─────
  const result = enforceCapWithReplacement(arranged, evalPool, byPos, slotRequirements, economyConfig, rnd);

  // Final sanity log
  const finalTotal = totalSalary(result.map(c => c.salary));
  if (finalTotal > cap) {
    console.warn(`[RosterEngine] CAP BREACH after all enforcement: $${finalTotal} > $${cap}`);
  } else {
    console.log(`[RosterEngine] Roster built OK: $${finalTotal}/$${cap}`);
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns the cheapest player in pool not already used, that fits within maxSalary */
function cheapestAvailable(
  pool: PlayerEval[],
  usedPeople: Set<string>,
  maxSalary: number
): PlayerEval | null {
  const available = pool
    .filter(p => !usedPeople.has(p.personKey) && p.salary <= maxSalary)
    .sort((a, b) => a.salary - b.salary);
  return available[0] ?? null;
}

function buildPositionPools(pool: PlayerEval[]): Record<string, PlayerEval[]> {
  const byPos: Record<string, PlayerEval[]> = {};
  for (const p of pool) {
    const pos = p.position.toUpperCase();
    (byPos[pos] ??= []).push(p);
  }
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => b.salary - a.salary);
  }
  return byPos;
}

/**
 * Pick randomly from pool with salary-weighted probability.
 * Higher salary = more likely to be picked, but ALL tiers have a chance.
 */
function pickWeightedRandom(
  pool: PlayerEval[],
  usedPeople: Set<string>,
  rnd: () => number
): PlayerEval | null {
  const available = pool.filter(p => !usedPeople.has(p.personKey));
  if (!available.length) return null;

  const weights = available.map(p => Math.pow(p.salary, 2));
  const total = weights.reduce((s, w) => s + w, 0);

  let rand = rnd() * total;
  for (let i = 0; i < available.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return available[i];
  }
  return available[available.length - 1];
}

function toGeneratedCard(p: PlayerEval, slotIndex: number): GeneratedCard {
  return {
    ...p,
    slotIndex,
    wasHeld: false,
    actualFp: 0,
    fpDelta: 0,
    gameInfo: { date: "", opponent: "", homeAway: "" },
    statLine: {},
    achievements: [],
  };
}

// ── Slot arrangement (anchors in top rows) ─────────────────────────────────

function arrangeAnchors(
  cards: GeneratedCard[],
  slotRequirements: SlotRequirement[]
): GeneratedCard[] {
  const result = [...cards];
  const n = result.length;
  const topSlots = Math.min(4, n);

  for (let i = 0; i < topSlots; i++) {
    const req = slotRequirements[i];
    if (req === "FLEX") continue;

    let bestIdx = -1;
    let bestSalary = -1;

    for (let j = i; j < n; j++) {
      const c = result[j];
      if (c.position.toUpperCase() !== req.toUpperCase()) continue;
      if (c.salary > bestSalary) {
        bestSalary = c.salary;
        bestIdx = j;
      }
    }

    if (bestIdx > i) {
      const tmp = result[i];
      result[i] = { ...result[bestIdx], slotIndex: i };
      result[bestIdx] = { ...tmp, slotIndex: bestIdx };
    }
  }

  result.forEach((c, i) => { c.slotIndex = i; });
  return result;
}

// ── Cap enforcement (safety net) ───────────────────────────────────────────

function enforceCapWithReplacement(
  roster: GeneratedCard[],
  evalPool: PlayerEval[],
  byPos: Record<string, PlayerEval[]>,
  slotRequirements: SlotRequirement[],
  config: EconomyConfig,
  rnd: () => number,
  heldMask?: boolean[]
): GeneratedCard[] {
  const clone = roster.map(c => ({ ...c }));
  const isHeld = (i: number) => heldMask ? !!heldMask[i] : false;

  let guard = 0;
  while (totalSalary(clone.map(c => c.salary)) > config.capMax && guard++ < 200) {
    const currentTotal = totalSalary(clone.map(c => c.salary));

    // Swappable: non-held, non-anchor (ORANGE/PURPLE always protected)
    const swappable = clone
      .map((c, i) => ({ i, c }))
      .filter(({ i, c }) => {
        if (isHeld(i)) return false;
        const tier = (c.tier ?? "").toUpperCase();
        if (tier === "ORANGE" || tier === "PURPLE") return false;
        return true;
      })
      .sort((a, b) => b.c.salary - a.c.salary); // highest salary first

    if (!swappable.length) {
      console.warn(`[Cap] Cannot enforce cap — all swappable slots exhausted. Total: $${currentTotal}`);
      break;
    }

    const { i: idx, c: cur } = swappable[0];
    const req = slotRequirements[idx] ?? "FLEX";
    const otherTotal = currentTotal - cur.salary;
    const maxForSlot = config.capMax - otherTotal;

    const usedPeople = new Set<string>(clone.map(c => c.personKey));
    usedPeople.delete(cur.personKey);

    const posPool = req === "FLEX"
      ? evalPool
      : (byPos[req.toUpperCase()] ?? evalPool);

    const candidates = posPool.filter(p =>
      !usedPeople.has(p.personKey) &&
      p.salary <= maxForSlot &&
      p.salary < cur.salary
    );

    console.log(`[Cap] total=${currentTotal} over=${currentTotal - config.capMax} swappable=${swappable.length} maxForSlot=${maxForSlot} candidates=${candidates.length}`);

    if (!candidates.length) {
      console.warn(`[Cap] No candidates for slot ${idx} (${req}) under $${maxForSlot}. Stuck.`);
      break;
    }

    candidates.sort((a, b) => b.salary - a.salary);
    clone[idx] = toGeneratedCard(candidates[0], idx);
  }

  clone.forEach(c => { c.tier = tierFromSalary(c.salary, config); });
  clone.forEach((c, i) => { c.slotIndex = i; });
  return clone;
}

// ── Redraw: replace non-held slots ─────────────────────────────────────────

export function redrawRoster(
  current: GeneratedCard[],
  heldSlots: Set<number>,
  evalPool: PlayerEval[],
  config: RosterConfig,
  economyConfig: EconomyConfig,
  rnd: () => number
): GeneratedCard[] {
  const heldMask = current.map((_, i) => heldSlots.has(i));
  const usedPeople = new Set<string>();

  // Lock in held cards
  const result = current.map((c, i) => {
    if (heldMask[i]) {
      usedPeople.add(c.personKey);
      return { ...c, wasHeld: true };
    }
    return { ...c, wasHeld: false };
  });

  // Calculate budget remaining after held cards
  const heldSalary = current.reduce((sum, c, i) => heldMask[i] ? sum + c.salary : sum, 0);
  const budgetForNew = economyConfig.capMax - heldSalary;
  const openSlots = heldMask.filter(h => !h).length;
  const minSalary = Math.min(...evalPool.map(p => p.salary));
  const byPos = buildPositionPools(evalPool);

  let budgetRemaining = budgetForNew;
  let openSlotsRemaining = openSlots;

  for (let i = 0; i < result.length; i++) {
    if (heldMask[i]) continue;

    const req = config.slotRequirements[i] ?? "FLEX";
    const maxForSlot = budgetRemaining - (openSlotsRemaining - 1) * minSalary;

    const posPool = req === "FLEX"
      ? evalPool.filter(p => !usedPeople.has(p.personKey) && p.salary <= maxForSlot)
      : (byPos[req.toUpperCase()] ?? evalPool).filter(p => !usedPeople.has(p.personKey) && p.salary <= maxForSlot);

    const picked = posPool.length
      ? (pickWeightedRandom(posPool, usedPeople, rnd) ?? posPool[posPool.length - 1])
      : cheapestAvailable(evalPool, usedPeople, maxForSlot) ?? evalPool.find(p => !usedPeople.has(p.personKey)) ?? evalPool[0];

    usedPeople.add(picked.personKey);
    budgetRemaining -= picked.salary;
    openSlotsRemaining--;
    result[i] = { ...toGeneratedCard(picked, i), wasHeld: false };
  }

  // Safety net
  const byPosFull = buildPositionPools(evalPool);
  return enforceCapWithReplacement(result as GeneratedCard[], evalPool, byPosFull, config.slotRequirements, economyConfig, rnd, heldMask);
}