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
  /** Per-tier player pool, ranked most-recognizable-first. When present
   *  together with `slateComposition`, slateSelector switches to tier-quota
   *  mode (daily count per tier within range, sampled from the tier's pool). */
  getTierPool?: (tier: string) => string[];
  /** Sport-specific composition: per-tier count ranges + which tier is
   *  protected and which absorb slack during normalization to slateSize. */
  slateComposition?: SlateComposition;
};

export type SlateComposition = {
  /** Per-tier [min, max] count for the slate (inclusive). */
  tierRanges: Record<string, [number, number]>;
  /** Tier never trimmed or expanded when normalizing total to slateSize. */
  protectedTier: string;
  /** Tiers used to absorb slack, in priority order. */
  absorbTiers: string[];
  /** Tiers taken IN FULL every slate (all eligible players), reserved before
   *  the quota roll and excluded from normalization/trim. Absent/empty ⇒
   *  current behavior (every tier is quota-rolled). */
  guaranteedTiers?: string[];
};

/** Tier order used for cap evaluation + anchor fill. */
const TIER_ORDER = ["RED", "ORANGE", "PURPLE", "BLUE", "GREEN", "WHITE"] as const;

/** Anchor target counts per tier under the standard composition.
 *  9 total = 2 RED + 7 ORANGE. Most seasons only have 4 RED players, so
 *  guaranteeing 3 anchored every day means the user sees 75% of REDs on
 *  every hand — too predictable. Defaulting to 2 keeps the rotation real
 *  (50% of REDs visible per day; the daily-seeded shuffle still varies
 *  which 2 surface).
 *
 *  Two independent daily swaps tweak the mix:
 *   - RED bonus swap (~15% of days): 3 RED + 6 ORANGE — gives a "stacked"
 *     anchor day occasionally without making it the norm. Never all 4
 *     since SLATE_TIER_CAPS.RED=3.
 *   - PURPLE swap (~30% of days): borrows one ORANGE slot for a PURPLE
 *     anchor — same as before, just rebased on the new defaults. */
const ANCHOR_TARGET_STD: Record<string, number> = { RED: 2, ORANGE: 7, PURPLE: 0 };
const ANCHOR_TARGET_RED_BONUS: Record<string, number> = { RED: 3, ORANGE: 6, PURPLE: 0 };
const ANCHOR_TARGET_PURPLE_SWAP: Record<string, number> = { RED: 2, ORANGE: 6, PURPLE: 1 };
const ANCHOR_TARGET_RED_AND_PURPLE: Record<string, number> = { RED: 3, ORANGE: 5, PURPLE: 1 };
/** Probability of the PURPLE swap each day (0..1). */
const PURPLE_SWAP_RATE = 0.30;
/** Probability of the RED-bonus swap each day (0..1). Independent of PURPLE. */
const RED_BONUS_RATE = 0.15;

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

  // Tier-quota mode: adapter supplies per-tier pools + composition spec.
  // Roll a count per tier within its range, normalize to slateSize, then
  // sample N from each tier's pool (most-recognizable first, shuffled for
  // daily variance). Bypasses anchor/rotator distinction — the composition
  // ranges fully describe the slate shape.
  if (typeof adapter.getTierPool === "function" && adapter.slateComposition) {
    return selectByTierQuota(adapter, config.slateSize, rng);
  }

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
  // Roll the two swap dice independently so a day can be e.g. red-bonus
  // AND purple-swap, or just one, or neither.
  const redBonus = rng() < RED_BONUS_RATE;
  const purpleSwap = rng() < PURPLE_SWAP_RATE;
  const target = redBonus && purpleSwap
    ? ANCHOR_TARGET_RED_AND_PURPLE
    : redBonus
      ? ANCHOR_TARGET_RED_BONUS
      : purpleSwap
        ? ANCHOR_TARGET_PURPLE_SWAP
        : ANCHOR_TARGET_STD;
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

/**
 * Tier-quota mode: pick a count per tier within its range, normalize to
 * slateSize, then sample from each tier's pool. PURPLE is protected (never
 * adjusted during normalization); BLUE/GREEN absorb the slack.
 */
function selectByTierQuota(
  adapter: SlateAdapter,
  slateSize: number,
  rng: () => number,
): string[] {
  const comp = adapter.slateComposition!;
  const allTiers = Object.keys(comp.tierRanges);

  // 0. Guaranteed tiers (e.g. RED/ORANGE/PURPLE): taken IN FULL every slate,
  //    reserved before the quota roll and excluded from normalization/trim so
  //    they can never be rotated out. Absent/empty ⇒ behavior is identical to
  //    the original all-quota path (other sports keep their current slates).
  const guaranteed = (comp.guaranteedTiers ?? []).filter((t) => allTiers.includes(t));
  const guaranteedSet = new Set(guaranteed);
  const quotaTiers = allTiers.filter((t) => !guaranteedSet.has(t));

  // Reserve ALL eligible players from each guaranteed tier. Shuffled for
  // display order only — every player is included, so the SET never rotates
  // day-to-day; only ordering does.
  const reserved: string[] = [];
  for (const t of guaranteed) {
    const pool = adapter.getTierPool!(t);
    if (!pool.length) continue;
    reserved.push(...fisherYates(pool, rng));
  }

  // Remaining budget for the non-guaranteed (filler) tiers. If the guaranteed
  // set already meets/exceeds slateSize, take all guaranteed and add no filler —
  // the slate may EXCEED slateSize rather than trim a guaranteed tier.
  const remaining = Math.max(0, slateSize - reserved.length);

  // 1. Independent daily roll per QUOTA tier within its [min, max] range.
  const counts: Record<string, number> = {};
  for (const t of quotaTiers) {
    const [lo, hi] = comp.tierRanges[t];
    counts[t] = lo + Math.floor(rng() * (hi - lo + 1));
  }

  // 2. Normalize the quota tiers to `remaining`. Adjust absorbTiers in order
  //    before touching protectedTier; guaranteed tiers are never adjusted (they
  //    are not in quotaTiers). Each tier is clamped to its [min, max] range.
  const totalOf = () => quotaTiers.reduce((s, t) => s + counts[t], 0);
  const adjust = (tier: string, delta: number): number => {
    const [lo, hi] = comp.tierRanges[tier] ?? [counts[tier], counts[tier]];
    const before = counts[tier];
    const next = Math.max(lo, Math.min(hi, before + delta));
    counts[tier] = next;
    return next - before; // actually applied
  };
  let delta = remaining - totalOf();
  for (const t of comp.absorbTiers) {
    if (delta === 0) break;
    if (!quotaTiers.includes(t)) continue; // skip a guaranteed absorb tier
    delta -= adjust(t, delta);
  }
  // If still off, use protectedTier as last resort — unless it's guaranteed.
  if (delta !== 0 && quotaTiers.includes(comp.protectedTier)) {
    delta -= adjust(comp.protectedTier, delta);
  }
  // If still off (everything saturated), trim/extend the quota tier with most slack.
  if (delta !== 0) {
    const sorted = [...quotaTiers].sort((a, b) => {
      const [aLo, aHi] = comp.tierRanges[a];
      const [bLo, bHi] = comp.tierRanges[b];
      const aSlack = delta > 0 ? aHi - counts[a] : counts[a] - aLo;
      const bSlack = delta > 0 ? bHi - counts[b] : counts[b] - bLo;
      return bSlack - aSlack;
    });
    for (const t of sorted) {
      if (delta === 0) break;
      delta -= adjust(t, delta);
    }
  }

  // 3. Reserved guaranteed players first, then sample each quota tier's pool.
  //    Daily-shuffled with the same rng stream so different days surface
  //    different fillers; cap by current count. If a pool is smaller than the
  //    count, take what's available — the total slate is then under-sized,
  //    which the caller can detect.
  const result: string[] = [...reserved];
  for (const t of quotaTiers) {
    const want = counts[t];
    if (want <= 0) continue;
    const pool = adapter.getTierPool!(t);
    if (!pool.length) continue;
    const shuffled = fisherYates(pool, rng);
    result.push(...shuffled.slice(0, Math.min(want, shuffled.length)));
  }
  return result;
}

type CacheableAdapter = SlateAdapter & {
  rosterSize: number;
  config: { slateSize?: number; anchorCount?: number; weightExponent?: number };
  getEligiblePool(): string[];
  getThemedEligibility(themeKey: string): string[] | null;
  getExclusionList(): string[];
  /** Optional discriminator added to the slate cache key so per-season
   *  pools (basketball's daily season pick) don't share a cached slate
   *  with the previous season. Adapters return e.g. the active season
   *  key. Empty string / undefined disables the discriminator. */
  getCacheNamespace?(): string;
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
  const ns = adapter.getCacheNamespace?.() ?? "";
  const key = `${adapter.sportKey}|${getDailyBonusDateKey(date)}|${themeKey ?? "std"}|${ns}`;
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
