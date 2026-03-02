/**
 * shared/engines/rosterEngine.ts — Layer 1 (sport-agnostic)
 *
 * Generates rosters from a player eval pool.
 * All sport-specific slot requirements come in via RosterConfig.
 * No fetching. No UI. Pure logic.
 */

import type { TierColor, EconomyConfig, SlotRequirement, RosterConfig, PlayerEval, GeneratedCard } from "../types";
import { tierFromSalary, totalSalary, clampInt } from "./economyEngine";

export type { SlotRequirement, RosterConfig, PlayerEval, GeneratedCard };

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

export function generateRoster(
  evalPool: PlayerEval[],
  config: RosterConfig,
  economyConfig: EconomyConfig,
  rnd: () => number
): GeneratedCard[] {
  const { rosterSize, slotRequirements } = config;
  if (!evalPool.length) return [];

  const cap = economyConfig.capMax;
  const minSalary = Math.min(...evalPool.map(p => p.salary));
  const byPos = buildPositionPools(evalPool);
  const usedPeople = new Set<string>();
  const roster: Array<GeneratedCard | null> = Array(rosterSize).fill(null);

  // ── Step 1: Pick one anchor (ORANGE or PURPLE) first ────────────────────
  const anchorThreshold = economyConfig.tierThresholds.find(t => t.tier === "PURPLE")?.minSalary ?? 40;
  const anchorPool = evalPool
    .filter(p => p.salary >= anchorThreshold)
    .sort((a, b) => b.salary - a.salary);

  const maxAnchorSalary = cap - (rosterSize - 1) * minSalary;
  const affordableAnchors = anchorPool.filter(p => p.salary <= maxAnchorSalary);

  let budgetRemaining = cap;

  if (affordableAnchors.length > 0) {
    const anchor = pickWeightedRandom(affordableAnchors, usedPeople, rnd) ?? affordableAnchors[0];
    usedPeople.add(anchor.personKey);
    budgetRemaining -= anchor.salary;

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
  const arranged = arrangeAnchors(filled, slotRequirements);
  const result = enforceCapWithReplacement(arranged, evalPool, byPos, slotRequirements, economyConfig, rnd);

  const finalTotal = totalSalary(result.map(c => c.salary));
  if (finalTotal > cap) {
    console.warn(`[RosterEngine] CAP BREACH: $${finalTotal} > $${cap}`);
  } else {
    console.log(`[RosterEngine] Roster OK: $${finalTotal}/$${cap}`);
  }

  return result;
}

// ── Redraw ─────────────────────────────────────────────────────────────────

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

  const result = current.map((c, i) => {
    if (heldMask[i]) {
      usedPeople.add(c.personKey);
      return { ...c, wasHeld: true };
    }
    return { ...c, wasHeld: false };
  });

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

  const byPosFull = buildPositionPools(evalPool);
  return enforceCapWithReplacement(result as GeneratedCard[], evalPool, byPosFull, config.slotRequirements, economyConfig, rnd, heldMask);
}

// ── Internal helpers ───────────────────────────────────────────────────────

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

    const swappable = clone
      .map((c, i) => ({ i, c }))
      .filter(({ i, c }) => {
        if (isHeld(i)) return false;
        const tier = (c.tier ?? "").toUpperCase();
        if (tier === "ORANGE" || tier === "PURPLE") return false;
        return true;
      })
      .sort((a, b) => b.c.salary - a.c.salary);

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
