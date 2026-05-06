/**
 * shared/utils/slateSelector.ts
 *
 * Daily slate selection. Deterministic by (sportKey, dateKey, themeKey).
 * Anchors placed first; remaining slots filled by weighted random draw
 * over the eligibility set, weight = careerFP^weightExponent.
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
};

/**
 * Build today's slate.
 *
 * @param adapter   sport-bound slate adapter
 * @param eligible  pre-resolved eligibility (from resolveEligibility)
 * @param date      target date (UTC date used for seed)
 * @param themeKey  optional theme; affects seed only (eligibility already
 *                  resolved upstream)
 * @param config    sizing
 * @param userTier  RESERVED HOOK for VIP/comps spec; ignored in v1
 */
export function selectDailySlate(
  adapter: SlateAdapter,
  eligible: string[],
  date: Date,
  themeKey: string | undefined,
  config: SlateConfig,
  _userTier?: string,
): string[] {
  const eligibleSet = new Set(eligible);
  const anchorTake = adapter.getAnchors().filter(id => eligibleSet.has(id)).slice(0, config.anchorCount);
  const anchorSet = new Set(anchorTake);
  const remaining = eligible.filter(id => !anchorSet.has(id));
  const rotatingCount = config.slateSize - anchorTake.length;

  if (rotatingCount <= 0) return [...anchorTake];

  const dateKey = getDailyBonusDateKey(date);
  const seed = hashStr(`slate-${adapter.sportKey}-${dateKey}-${themeKey ?? "std"}`);
  const rng = mulberry32(seed);

  const weights = remaining.map(id =>
    Math.pow(Math.max(0, adapter.getCareerFPById(id)), config.weightExponent)
  );
  const drawn = weightedSampleWithoutReplacement(remaining, weights, rotatingCount, rng);

  return [...anchorTake, ...drawn];
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
    anchorCount: adapter.config.anchorCount ?? 10,
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
