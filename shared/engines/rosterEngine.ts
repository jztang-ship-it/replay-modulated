/**
 * shared/engines/rosterEngine.ts — Layer 1 (sport-agnostic)
 */

import type { EconomyConfig, SlotRequirement, RosterConfig, PlayerEval, GeneratedCard } from "../types";
import { totalSalary } from "./economyEngine.js";

export type { SlotRequirement, RosterConfig, PlayerEval, GeneratedCard };

// Re-export to preserve `import { mulberry32 } from "../engines/rosterEngine.js"`
// in sport adapters (basketball/baseball/football).
export { mulberry32 } from "../utils/seededRng.js";

export function randomSeed(): number {
  return Date.now() ^ Math.floor(Math.random() * 1e9);
}

export function pickOne<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

export function generateRoster(evalPool: PlayerEval[], config: RosterConfig, economyConfig: EconomyConfig, rnd: () => number): GeneratedCard[] {
  const { rosterSize, slotRequirements } = config;
  if (!evalPool.length) return [];
  const cap = economyConfig.capMax;
  const minSalary = Math.min(...evalPool.map(p => p.salary));
  const byPos = buildPositionPools(evalPool);

  // Position-agnostic path — basketball-style deals. The sport sets
  // positionAware=false; we pick N undifferentiated cards under cap (anchor
  // pick + salary²-weighted fillers), then run the same cap-enforcement and
  // tier-floor guarantee against the full eval pool.
  // See CLAUDE.md "Positional requirements rule".
  if (config.positionAware === false) {
    return generateRosterPositionAgnostic(evalPool, rosterSize, cap, minSalary, byPos, economyConfig, rnd);
  }

  const usedPeople = new Set<string>();
  const roster: Array<GeneratedCard | null> = Array(rosterSize).fill(null);
  const excludePos = new Set((config.excludeFromFlex ?? ["GK"]).map(p => p.toUpperCase()));
  const pools = slotRequirements.map(req => evalPool.filter(p => req === "FLEX"
    ? !excludePos.has(p.position.toUpperCase()) : p.position.toUpperCase() === req.toUpperCase())
    .sort((a, b) => a.salary - b.salary));
  const anchorThreshold = economyConfig.tierThresholds.find(t => t.tier === "ORANGE")?.minSalary ?? 52;
  const anchorSlotIdx = slotRequirements.findIndex(req => req !== "FLEX" && req.toUpperCase() !== "GK");
  const order = Array.from({ length: rosterSize }, (_, i) => i).sort((a, b) =>
    (a === anchorSlotIdx ? -1 : b === anchorSlotIdx ? 1 :
      Number(slotRequirements[a] === "FLEX") - Number(slotRequirements[b] === "FLEX")));
  let budgetRemaining = cap;

  // Reserve an actual eligible, distinct-player completion, not global minSalary
  // times empty slots. The old bound could leave a P/GK slot unfunded, then
  // "repair" it with a BAT/other position. An impossible pool fails closed.
  const reserveCompletion = (indices: number[], unavailable: Set<string>): number => {
    const reserved = new Set(unavailable);
    let cost = 0;
    for (const i of [...indices].sort((a, b) => pools[a].length - pools[b].length)) {
      const p = pools[i].find(p => !reserved.has(p.personKey));
      if (!p) return Infinity;
      reserved.add(p.personKey);
      cost += p.salary;
    }
    return cost;
  };
  for (let step = 0; step < order.length; step++) {
    const i = order[step];
    const remaining = order.slice(step + 1);
    let candidates = pools[i].filter(p => !usedPeople.has(p.personKey)
      && p.salary + reserveCompletion(remaining, new Set([...usedPeople, p.personKey])) <= budgetRemaining);
    if (i === anchorSlotIdx) {
      const premium = candidates.filter(p => ["RED", "ORANGE"].includes(String(p.tier).toUpperCase()));
      const salaryAnchors = candidates.filter(p => p.salary >= anchorThreshold);
      if (premium.length) candidates = premium;
      else if (salaryAnchors.length) candidates = salaryAnchors;
    }
    const picked = pickWeightedRandom(candidates, usedPeople, rnd);
    if (!picked) throw new Error("No legal roster within budget");
    usedPeople.add(picked.personKey);
    budgetRemaining -= picked.salary;
    roster[i] = toGeneratedCard(picked, i);
  }

  const filled = roster.filter(Boolean) as GeneratedCard[];
  const arranged = arrangeAnchors(filled, slotRequirements);
  const result = enforceCapWithReplacement(arranged, evalPool, byPos, slotRequirements, economyConfig, rnd, undefined, config);
  const guaranteed = guaranteeTierFloor(result, evalPool, economyConfig, rnd, [], config);
  const finalTotal = totalSalary(guaranteed.map(c => c.salary));
  if (finalTotal > cap) console.warn(`[RosterEngine] CAP BREACH: $${finalTotal} > $${cap}`);
  return guaranteed;
}

export function redrawRoster(current: GeneratedCard[], heldSlots: Set<number>, evalPool: PlayerEval[], config: RosterConfig, economyConfig: EconomyConfig, rnd: () => number): GeneratedCard[] {
  // Position-agnostic redraw — held cards stay; unheld slots refill from the
  // full eval pool. See CLAUDE.md "Positional requirements rule".
  if (config.positionAware === false) {
    return redrawRosterPositionAgnostic(current, heldSlots, evalPool, economyConfig, rnd);
  }

  const heldMask = current.map((_, i) => heldSlots.has(i));
  const result = current.map((c,i) => ({...c,wasHeld:heldMask[i]}));
  const usedPeople = new Set(current.map(c=>c.personKey));
  for (let i=0;i<result.length;i++) {
    if (heldMask[i]) continue;
    const previous = result[i];
    usedPeople.delete(previous.personKey);
    const req = config.slotRequirements[i] ?? "FLEX";
    // Reserve the actual cost of every untouched slot, not the cheapest player
    // in an unrelated position. The prior legal card is always a safe fallback.
    const budget = economyConfig.capMax - totalSalary(result.map(c=>c.salary)) + previous.salary;
    const candidates = evalPool.filter(p=>!usedPeople.has(p.personKey) && p.salary<=budget &&
      (req === "FLEX" ? !config.excludeFromFlex?.includes(p.position) : p.position.toUpperCase()===req.toUpperCase()));
    const picked = pickWeightedRandom(candidates,usedPeople,rnd) ?? previous;
    result[i] = {...toGeneratedCard(picked,i),wasHeld:false};
    usedPeople.add(picked.personKey);
  }
  const afterCap = enforceCapWithReplacement(result as GeneratedCard[], evalPool, buildPositionPools(evalPool), config.slotRequirements, economyConfig, rnd, heldMask, config);
  return guaranteeTierFloor(afterCap, evalPool, economyConfig, rnd, heldMask, config);
}

// ── guaranteeTierFloor ────────────────────────────────────────────────────
// Design rule enforced: every hand must have a RED or ORANGE premium anchor.
// The initial deal handles 99.99% of hands (validated 290k hands × 29 seasons
// under the position-agnostic basketball deal); this function is the safety
// net for the rare cap-pressured case where the initial anchor pick failed
// to land a RED/ORANGE card.
//
// Secondary responsibility: enforce a minimum spend (cap - 6 = $244 at the
// $250 cap) by upgrading cheapest non-held cards until the roster reaches it.
function guaranteeTierFloor(roster: GeneratedCard[], evalPool: PlayerEval[], economyConfig: EconomyConfig, rnd: () => number, heldMask: boolean[], rosterConfig?: RosterConfig) {
  const cap = economyConfig.capMax;
  const minSpend = cap - 6;
  const result = [...roster];
  const usedPeople = new Set(result.map(c => c.personKey));

  const fitsSlot = (p: PlayerEval, i: number) => {
    if (!rosterConfig || rosterConfig.positionAware === false) return true;
    const req = rosterConfig.slotRequirements[i] ?? "FLEX";
    return req === "FLEX" ? !rosterConfig.excludeFromFlex?.includes(p.position) : p.position.toUpperCase() === req.toUpperCase();
  };
  const tierOf = (c: { tier?: string }) => String(c.tier ?? "").toUpperCase();
  // RED counts as a premium anchor interchangeably with ORANGE. A hand with Jokić
  // (RED) satisfies the anchor guarantee the same way an ORANGE card does.
  const isPremiumAnchor = (c: { tier?: string }) => tierOf(c) === "RED" || tierOf(c) === "ORANGE";

  function getSwappable() {
    return result.map((c, i) => ({ i, c })).filter(({ i }) => !heldMask || !heldMask[i]).sort((a, b) => b.c.salary - a.c.salary);
  }
  function getHeadroom() {
    return cap - totalSalary(result.map(c => c.salary));
  }
  // Upgrade a non-anchor slot to a RED/ORANGE player. Used once after the
  // initial deal when the anchor pick failed to land a premium tier.
  function tryUpgradeToRedOrOrange(): boolean {
    for (const { i, c } of getSwappable()) {
      const curTier = tierOf(c);
      if (curTier === "RED" || curTier === "ORANGE") continue;
      const budget = c.salary + getHeadroom();
      const upgrades = evalPool
        .filter((p: any) => {
          if (usedPeople.has(p.personKey) && p.personKey !== c.personKey) return false;
          if (p.salary > budget || !fitsSlot(p, i)) return false;
          const pt = String(p.tier ?? "").toUpperCase();
          return pt === "RED" || pt === "ORANGE";
        })
        .sort((a: any, b: any) => b.salary - a.salary);
      if (!upgrades.length) continue;
      const excl = new Set([...usedPeople].filter(k => k !== c.personKey));
      const picked = pickWeightedRandom(upgrades, excl, rnd) ?? upgrades[0];
      usedPeople.delete(c.personKey);
      usedPeople.add(picked.personKey);
      result[i] = toGeneratedCard(picked, i);
      return true;
    }
    return false;
  }
  const hasPremiumAnchor = () => result.some(isPremiumAnchor);
  // If the initial deal didn't land a RED/ORANGE card, attempt one upgrade.
  // If that also fails (effectively unreachable in practice), accept the
  // roster as-is — the min-spend pass below still runs to keep cap utilized.
  if (!hasPremiumAnchor()) {
    tryUpgradeToRedOrOrange();
  }
  let spendTotal = totalSalary(result.map(c => c.salary));
  if (spendTotal < minSpend) {
    const sorted = result.map((c, i) => ({ i, c })).filter(({ i }) => !heldMask || !heldMask[i]).sort((a, b) => a.c.salary - b.c.salary);
    for (const { i, c } of sorted) {
      if (spendTotal >= minSpend) break;
      // Recalculate gap each iteration so upgrades never push total past cap
      const gap = Math.min(minSpend - spendTotal, cap - spendTotal);
      if (gap <= 0) break;
      const upgrades = evalPool.filter((p: any) => fitsSlot(p, i) && (!usedPeople.has(p.personKey) || p.personKey === c.personKey) && p.salary > c.salary && p.salary <= c.salary + gap).sort((a: any, b: any) => b.salary - a.salary);
      if (!upgrades.length) continue;
      const excl = new Set([...usedPeople].filter(k => k !== c.personKey));
      const picked = pickWeightedRandom(upgrades, excl, rnd) ?? upgrades[0];
      usedPeople.delete(c.personKey);
      usedPeople.add(picked.personKey);
      spendTotal += picked.salary - c.salary;
      result[i] = toGeneratedCard(picked, i);
    }
  }
  return result;
}

// ── Position-agnostic deal path ───────────────────────────────────────────
// Basketball deals N undifferentiated cards under cap. The flow mirrors the
// position-aware path conceptually (anchor → fill → cap enforce → tier-floor
// guarantee) but does not bucket by position. Slot indices are assigned in
// pick order; UI position labels come from the player's own `position` field.
function generateRosterPositionAgnostic(
  evalPool: PlayerEval[],
  rosterSize: number,
  cap: number,
  minSalary: number,
  byPos: Record<string, PlayerEval[]>,
  economyConfig: EconomyConfig,
  rnd: () => number,
): GeneratedCard[] {
  const usedPeople = new Set<string>();
  const lineup: GeneratedCard[] = [];
  let budgetRemaining = cap;

  // 1. Anchor — RED/ORANGE-tier, salary²-weighted, salary cap respected.
  //    Fallback to salary-threshold (>= ORANGE.minSalary) for sports whose
  //    JSON lacks tier info.
  const anchorThreshold = economyConfig.tierThresholds.find(t => t.tier === "ORANGE")?.minSalary ?? 52;
  const maxAnchorSalary = cap - (rosterSize - 1) * minSalary;
  const isAnchorTier = (p: PlayerEval) => {
    const t = String(p.tier ?? "").toUpperCase();
    return t === "RED" || t === "ORANGE";
  };
  const tierAnchorPool = evalPool.filter(p => isAnchorTier(p) && p.salary <= maxAnchorSalary);
  const anchorPool = tierAnchorPool.length > 0
    ? tierAnchorPool
    : evalPool.filter(p => p.salary >= anchorThreshold && p.salary <= maxAnchorSalary);
  if (anchorPool.length) {
    const anchor = pickWeightedRandom(anchorPool, usedPeople, rnd) ?? anchorPool[0];
    usedPeople.add(anchor.personKey);
    budgetRemaining -= anchor.salary;
    lineup.push(toGeneratedCard(anchor, lineup.length));
  }

  // 2. Fill remaining slots — salary²-weighted across the whole eval pool.
  while (lineup.length < rosterSize) {
    const slotsLeft = rosterSize - lineup.length;
    const maxForSlot = budgetRemaining - (slotsLeft - 1) * minSalary;
    const candidates = evalPool.filter(p => !usedPeople.has(p.personKey) && p.salary <= maxForSlot);
    const picked = candidates.length
      ? (pickWeightedRandom(candidates, usedPeople, rnd) ?? candidates[candidates.length - 1])
      : cheapestAvailable(evalPool, usedPeople, maxForSlot);
    if (!picked) break;
    usedPeople.add(picked.personKey);
    budgetRemaining -= picked.salary;
    lineup.push(toGeneratedCard(picked, lineup.length));
  }

  // 3. Fallback fill — absolute cheapest unused players if budget squeezed.
  while (lineup.length < rosterSize) {
    const fallback = [...evalPool]
      .filter(p => !usedPeople.has(p.personKey))
      .sort((a, b) => a.salary - b.salary)[0]
      ?? evalPool[0];
    usedPeople.add(fallback.personKey);
    budgetRemaining -= fallback.salary;
    lineup.push(toGeneratedCard(fallback, lineup.length));
  }

  // 4. Cap enforcement (use all-FLEX slot requirements so the replacement
  //    pool isn't restricted to a per-position bucket) + tier-floor guarantee.
  const flexSlots: SlotRequirement[] = Array(rosterSize).fill("FLEX");
  const result = enforceCapWithReplacement(lineup, evalPool, byPos, flexSlots, economyConfig, rnd);
  const guaranteed = guaranteeTierFloor(result, evalPool, economyConfig, rnd, []);
  const finalTotal = totalSalary(guaranteed.map(c => c.salary));
  if (finalTotal > cap) console.warn(`[RosterEngine] CAP BREACH: $${finalTotal} > $${cap}`);
  return guaranteed;
}

function redrawRosterPositionAgnostic(
  current: GeneratedCard[],
  heldSlots: Set<number>,
  evalPool: PlayerEval[],
  economyConfig: EconomyConfig,
  rnd: () => number,
): GeneratedCard[] {
  const heldMask = current.map((_, i) => heldSlots.has(i));
  const usedPeople = new Set<string>();
  const result = current.map((c, i) => {
    if (heldMask[i]) { usedPeople.add(c.personKey); return { ...c, wasHeld: true }; }
    return { ...c, wasHeld: false };
  });
  const heldSalary = current.reduce((sum, c, i) => heldMask[i] ? sum + c.salary : sum, 0);
  let budgetRemaining = economyConfig.capMax - heldSalary;
  let openSlotsRemaining = heldMask.filter(h => !h).length;
  const minSalary = Math.min(...evalPool.map(p => p.salary));

  for (let i = 0; i < result.length; i++) {
    if (heldMask[i]) continue;
    const maxForSlot = budgetRemaining - (openSlotsRemaining - 1) * minSalary;
    const candidates = evalPool.filter(p => !usedPeople.has(p.personKey) && p.salary <= maxForSlot);
    const picked = candidates.length
      ? (pickWeightedRandom(candidates, usedPeople, rnd) ?? candidates[candidates.length - 1])
      : (cheapestAvailable(evalPool, usedPeople, maxForSlot)
          ?? [...evalPool].filter(p => !usedPeople.has(p.personKey)).sort((a, b) => a.salary - b.salary)[0]
          ?? evalPool[0]);
    usedPeople.add(picked.personKey);
    budgetRemaining -= picked.salary;
    openSlotsRemaining--;
    result[i] = { ...toGeneratedCard(picked, i), wasHeld: false };
  }

  const flexSlots: SlotRequirement[] = Array(current.length).fill("FLEX");
  const byPos = buildPositionPools(evalPool);
  const afterCap = enforceCapWithReplacement(result as GeneratedCard[], evalPool, byPos, flexSlots, economyConfig, rnd, heldMask);
  return guaranteeTierFloor(afterCap, evalPool, economyConfig, rnd, heldMask);
}

function cheapestAvailable(pool: PlayerEval[], usedPeople: Set<string>, maxSalary: number): PlayerEval | null {
  return pool.filter(p => !usedPeople.has(p.personKey) && p.salary <= maxSalary).sort((a, b) => a.salary - b.salary)[0] ?? null;
}

function buildPositionPools(pool: PlayerEval[]): Record<string, PlayerEval[]> {
  const byPos: Record<string, PlayerEval[]> = {};
  for (const p of pool) { const pos = p.position.toUpperCase(); (byPos[pos] ??= []).push(p); }
  for (const pos of Object.keys(byPos)) byPos[pos].sort((a, b) => b.salary - a.salary);
  return byPos;
}

function pickWeightedRandom(pool: PlayerEval[], usedPeople: Set<string>, rnd: () => number): PlayerEval | null {
  const available = pool.filter(p => !usedPeople.has(p.personKey));
  if (!available.length) return null;
  const weights = available.map(p => Math.pow(p.salary, 2));
  const total = weights.reduce((s, w) => s + w, 0);
  let rand = rnd() * total;
  for (let i = 0; i < available.length; i++) { rand -= weights[i]; if (rand <= 0) return available[i]; }
  return available[available.length - 1];
}

function toGeneratedCard(p: PlayerEval, slotIndex: number): GeneratedCard {
  return { ...p, slotIndex, wasHeld: false, actualFp: 0, fpDelta: 0, gameInfo: { date: "", opponent: "", homeAway: "" }, statLine: {}, achievements: [] };
}

function arrangeAnchors(cards: GeneratedCard[], slotRequirements: SlotRequirement[]): GeneratedCard[] {
  const result = [...cards];
  for (let i = 0; i < Math.min(4, result.length); i++) {
    const req = slotRequirements[i];
    if (req === "FLEX") continue;
    let bestIdx = -1, bestSalary = -1;
    for (let j = i; j < result.length; j++) {
      if (result[j].position.toUpperCase() !== req.toUpperCase()) continue;
      if (result[j].salary > bestSalary) { bestSalary = result[j].salary; bestIdx = j; }
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

function enforceCapWithReplacement(roster: GeneratedCard[], evalPool: PlayerEval[], byPos: Record<string, PlayerEval[]>, slotRequirements: SlotRequirement[], config: EconomyConfig, rnd: () => number, heldMask?: boolean[], rosterConfig?: RosterConfig): GeneratedCard[] {
  const clone = roster.map(c => ({ ...c }));
  const isHeld = (i: number) => heldMask ? !!heldMask[i] : false;
  const eligible = (p: PlayerEval, i: number) => {
    const req = slotRequirements[i] ?? "FLEX";
    return req === "FLEX" ? !(rosterConfig?.excludeFromFlex ?? []).includes(p.position)
      : p.position.toUpperCase() === req.toUpperCase();
  };
  let guard = 0;
  // Pass 1 — preferred path: swap non-premium cards for cheaper same-position replacements.
  while (totalSalary(clone.map(c => c.salary)) > config.capMax && guard++ < 200) {
    const currentTotal = totalSalary(clone.map(c => c.salary));
    let swappable = clone.map((c, i) => ({ i, c })).filter(({ i, c }) => {
      if (isHeld(i)) return false;
      const tier = (c.tier ?? "").toUpperCase();
      // Protect premium tiers from being swapped first. RED/ORANGE/PURPLE are
      // the anchor and secondary tiers — only touch them if nothing else works.
      return tier !== "RED" && tier !== "ORANGE" && tier !== "PURPLE";
    }).sort((a, b) => b.c.salary - a.c.salary);
    if (!swappable.length) {
      swappable = clone.map((c, i) => ({ i, c }))
        .filter(({ i }) => !isHeld(i))
        .sort((a, b) => b.c.salary - a.c.salary);
    }
    if (!swappable.length) break;
    const { i: idx, c: cur } = swappable[0];
    const req = slotRequirements[idx] ?? "FLEX";
    const maxForSlot = config.capMax - (currentTotal - cur.salary);
    const usedPeople = new Set<string>(clone.map(c => c.personKey));
    usedPeople.delete(cur.personKey);
    const posPool = req === "FLEX" ? evalPool : (byPos[req.toUpperCase()] ?? evalPool);
    const candidates = posPool.filter(p => eligible(p, idx) && !usedPeople.has(p.personKey) && p.salary <= maxForSlot && p.salary < cur.salary);
    if (!candidates.length) break;
    candidates.sort((a, b) => b.salary - a.salary);
    clone[idx] = toGeneratedCard(candidates[0], idx);
  }

  // Pass 2 may sacrifice a premium tier, never position legality or held cards.
  // Try every swappable slot; one expensive slot with no cheaper substitute
  // must not force an illegal cross-position replacement.
  let safetyGuard = 0;
  while (totalSalary(clone.map(c => c.salary)) > config.capMax && safetyGuard++ < 200) {
    let changed = false;
    for (const { i, c } of clone.map((c, i) => ({ c, i })).filter(({ i }) => !isHeld(i)).sort((a, b) => b.c.salary - a.c.salary)) {
      const used = new Set(clone.filter((_, j) => j !== i).map(p => p.personKey));
      const cheaper = evalPool.filter(p => eligible(p, i) && !used.has(p.personKey) && p.salary < c.salary).sort((a, b) => a.salary - b.salary)[0];
      if (!cheaper) continue;
      clone[i] = toGeneratedCard(cheaper, i);
      changed = true;
      break;
    }
    if (!changed) break; // Caller must reject an infeasible roster; never fake legality.
  }

  clone.forEach((c, i) => { c.slotIndex = i; });
  return clone;
}