/**
 * shared/utils/slateSelector.ts
 *
 * Daily slate selection. Deterministic by (sportKey, dateKey, themeKey).
 *
 * Composition policy (PR #67 — tier-balanced slate):
 *   - 9 anchors total
 *     • exactly 3 RED (or fewer if pool is smaller)
 *     • 5 or 6 ORANGE (5 when a PURPLE swap fires)
 *     • 0 or 1 PURPLE — daily-seeded ~30% of days
 *   - Total slate caps: max 3 RED, max 6 ORANGE. So all RED + all ORANGE
 *     used by the slate live in the anchor band; rotators are drawn only
 *     from PURPLE / BLUE / GREEN / WHITE.
 *   - Within each tier the anchor pick is daily-shuffled, so different
 *     RED/ORANGE players surface across days.
 */

import { hashStr, mulberry32 } from "./seededRng";
import { weightedSampleWithoutReplacement } from "./weightedSample";
import { getDailyBonusDateKey } from "./dailyBonus";
import { resolveEligibility } from "./slateEligibility";

export type SlateConfig = {
  slateSize: number;
  anchorCount: number;
  weightExponent: number;
};

export type SlateAdapter = {
  sportKey: string;
  getAnchors(): string[];
  getCareerFPById(playerId: string): number;
  /** Live tier lookup (computed from salary, not the stale stored field).
   *  Optional for back-compat with adapters that predate tier-capping;
   *  missing impl falls through to the legacy "no tier caps" path. */
  getTierById?: (playerId: string) => string;
};

/** Tier order used for cap evaluation + anchor fill. */
const TIER_ORDER = ["RED", "ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"] as const;

/** Anchor target counts per tier under the standard composition.
 *  9 total = 3 RED + 6 ORANGE. The PURPLE swap (daily-seeded) borrows
 *  one slot from ORANGE and gives it to PURPLE. */
const ANCHOR_TARGET_STD: Record<string, number> = { RED: 3, ORANGE: 6, PURPLE: 0 };
const ANCHOR_TARGET_PURPLE_SWAP: Record<string, number> = { RED: 3, ORANGE: 5, PURPLE: 1 };
/** Probability of the PURPLE swap each day (0..1). */
const PURPLE_SWAP_RATE = 0.30;

/** Total-slate caps. Tiers absent from this map are uncapped. */
const SLATE_TIER_CAPS: Record<string, number> = { RED: 3, ORANGE: 6 };

function fisherYates<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build today's slate.
 *
 * @param adapter   sport-bound slate adapter
 * @param eligible  pre-resolved eligibility (from resolveEligibility)
 * @param date      target date (UTC date used for seed)
 * @param themeKey  optional theme; affects seed only (eligibility already
 *                  resolved upstream)
 * @param config    sizing
 * @param _userTier RESERVED HOOK for VIP/comps spec; ignored in v1
 */
export function selectDailySlate(
  adapter: SlateAdapter,
  eligible: string[],
  date: Date,
  themeKey: string | undefined,
  config: SlateConfig,
  _userTier?: string,
): string[] {
  // Daily-seeded RNG. One stream feeds anchor shuffling, the PURPLE-swap
  // coin flip, AND the rotator weighted-sample, so the whole slate is
  // reproducible from (sport, date, theme).
  const dateKey = getDailyBonusDateKey(date);
  const seed = hashStr(`slate-${adapter.sportKey}-${dateKey}-${themeKey ?? "std"}`);
  const rng = mulberry32(seed);

  // Legacy path: if adapter doesn't implement getTierById, fall back to
  // the pre-tier-cap behavior (anchors via getAnchors, weighted-random
  // rotators over remaining eligible). Keeps old tests + adapters happy.
  if (typeof adapter.getTierById !== "function") {
    const eligibleSet = new Set(eligible);
    const anchorTake = adapter.getAnchors().filter(id => eligibleSet.has(id)).slice(0, config.anchorCount);
    const anchorSet = new Set(anchorTake);
    const remaining = eligible.filter(id => !anchorSet.has(id));
    const rotatingCount = config.slateSize - anchorTake.length;
    if (rotatingCount <= 0) return [...anchorTake];
    const weights = remaining.map(id =>
      Math.pow(Math.max(0, adapter.getCareerFPById(id)), config.weightExponent)
    );
    const drawn = weightedSampleWithoutReplacement(remaining, weights, rotatingCount, rng);
    return [...anchorTake, ...drawn];
  }
  const tierOf = (id: string) => adapter.getTierById!(id) ?? "WHITE";

  // Group eligible by live tier (computed from salary).
  const byTier: Record<string, string[]> = {};
  for (const id of eligible) {
    const t = tierOf(id);
    (byTier[t] ||= []).push(id);
  }

  // Anchors: tier-capped with daily-seeded shuffle within each tier.
  const purpleSwap = rng() < PURPLE_SWAP_RATE;
  const target = purpleSwap ? ANCHOR_TARGET_PURPLE_SWAP : ANCHOR_TARGET_STD;
  const anchors: string[] = [];
  const anchorSet = new Set<string>();
  function takeFromTier(tier: string, count: number) {
    if (count <= 0) return;
    const pool = fisherYates(byTier[tier] ?? [], rng);
    for (let i = 0; i < pool.length && count > 0; i++) {
      const id = pool[i];
      if (anchorSet.has(id)) continue;
      anchors.push(id);
      anchorSet.add(id);
      count--;
    }
  }
  // Standard-tier targets first.
  takeFromTier("RED",    target.RED);
  takeFromTier("ORANGE", target.ORANGE);
  takeFromTier("PURPLE", target.PURPLE);
  // Backfill from lower tiers if any of the standard pools were short.
  for (const tier of ["PURPLE", "BLUE", "GREEN", "WHITE"]) {
    if (anchors.length >= config.anchorCount) break;
    takeFromTier(tier, config.anchorCount - anchors.length);
  }
  // Trim if somehow over (shouldn't happen with the math above).
  if (anchors.length > config.anchorCount) {
    anchors.length = config.anchorCount;
  }

  // Rotators: weighted random over non-anchor eligible MINUS any tier
  // that's already capped by the slate (RED 3, ORANGE 6 by default).
  // Counts already in anchors:
  const inAnchorByTier: Record<string, number> = {};
  for (const id of anchors) {
    const t = tierOf(id);
    inAnchorByTier[t] = (inAnchorByTier[t] ?? 0) + 1;
  }
  const rotatorPool: string[] = [];
  for (const tier of TIER_ORDER) {
    const cap = SLATE_TIER_CAPS[tier];
    const inAnchors = inAnchorByTier[tier] ?? 0;
    const remainingCap = cap === undefined ? Infinity : Math.max(0, cap - inAnchors);
    if (remainingCap === 0) continue; // tier already full from anchors
    let added = 0;
    for (const id of byTier[tier] ?? []) {
      if (anchorSet.has(id)) continue;
      if (added >= remainingCap) break;
      rotatorPool.push(id);
      added++;
    }
  }

  const rotatingCount = config.slateSize - anchors.length;
  if (rotatingCount <= 0 || rotatorPool.length === 0) return [...anchors];

  const weights = rotatorPool.map(id =>
    Math.pow(Math.max(0, adapter.getCareerFPById(id)), config.weightExponent)
  );
  const drawn = weightedSampleWithoutReplacement(rotatorPool, weights, rotatingCount, rng);
  return [...anchors, ...drawn];
}

type CacheableAdapter = SlateAdapter & {
  rosterSize: number;
  config: { slateSize?: number; anchorCount?: number; weightExponent?: number };
  getEligiblePool(): string[];
  getThemedEligibility(themeKey: string): string[] | null;
  getExclusionList(): string[];
};

export function defaultSlateConfig(adapter: CacheableAdapter): SlateConfig {
  return {
    slateSize: adapter.config.slateSize ?? adapter.rosterSize * 10,
    anchorCount: adapter.config.anchorCount ?? 9,
    weightExponent: adapter.config.weightExponent ?? 1.0,
  };
}

const slateCache = new Map<string, string[]>();

export function getCachedSlate(
  adapter: CacheableAdapter,
  date: Date,
  themeKey?: string,
): string[] {
  const key = `${adapter.sportKey}|${getDailyBonusDateKey(date)}|${themeKey ?? "std"}`;
  const cached = slateCache.get(key);
  if (cached) return cached;
  const eligible = resolveEligibility(adapter, date, themeKey);
  const slate = selectDailySlate(adapter, eligible, date, themeKey, defaultSlateConfig(adapter));
  slateCache.set(key, slate);
  return slate;
}

/** Test-only: clear the in-memory cache. Do not call from production code. */
export function _resetSlateCache(): void {
  slateCache.clear();
}
