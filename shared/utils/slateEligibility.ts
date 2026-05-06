/**
 * shared/utils/slateEligibility.ts
 *
 * Pure function: given (adapter, date, themeKey?) resolve the set of
 * player IDs eligible to appear in today's slate.
 *
 * v1: themeKey is always undefined in production paths (no sport
 * overrides getThemeForDate). Phase 2 lights up the themed branch.
 */

type EligibilityAdapter = {
  getEligiblePool(): string[];
  getThemedEligibility(themeKey: string): string[] | null;
  getExclusionList(): string[];
};

export function resolveEligibility(
  adapter: EligibilityAdapter,
  _date: Date,
  themeKey?: string,
): string[] {
  const base = themeKey
    ? (adapter.getThemedEligibility(themeKey) ?? adapter.getEligiblePool())
    : adapter.getEligiblePool();
  const excluded = new Set(adapter.getExclusionList());
  return base.filter(id => !excluded.has(id));
}
