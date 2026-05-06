import { describe, expect, it, beforeEach } from "vitest";
import { _resetSlateCache, getCachedSlate } from "../utils/slateSelector";
import { SessionRepeatLimit } from "../utils/sessionRepeatLimit";
import { getDailyBonusDateKey } from "../utils/dailyBonus";

function mkAdapter(sportKey: string, eligible: string[]) {
  return {
    sportKey,
    rosterSize: 1,
    config: { slateSize: Math.min(3, eligible.length), anchorCount: 0, weightExponent: 1.0 },
    getAnchors: () => [],
    getCareerFPById: () => 1,
    getEligiblePool: () => eligible,
    getThemedEligibility: () => null,
    getExclusionList: () => [],
  } as any;
}

describe("sport-isolation invariants (slate v2)", () => {
  beforeEach(() => _resetSlateCache());

  it("slate cache keys are independent per sport (basketball vs baseball)", () => {
    const date = new Date("2026-05-05");
    // Disjoint pools so slates can be distinguished.
    const bballAdapter = mkAdapter("basketball", ["bb-a", "bb-b", "bb-c", "bb-d"]);
    const bsblAdapter = mkAdapter("baseball", ["bs-x", "bs-y", "bs-z", "bs-w"]);

    const bball1 = getCachedSlate(bballAdapter, date);
    const bsbl1 = getCachedSlate(bsblAdapter, date);

    // Each sport's slate is drawn only from its own eligible pool.
    expect(bball1.every(id => id.startsWith("bb-"))).toBe(true);
    expect(bsbl1.every(id => id.startsWith("bs-"))).toBe(true);

    // The two sports' slates have no overlap → cache keys must be independent.
    const overlap = bball1.filter(id => bsbl1.includes(id));
    expect(overlap).toEqual([]);

    // Cache hits return identity (same reference) for the same sport.
    expect(getCachedSlate(bballAdapter, date)).toBe(bball1);
    expect(getCachedSlate(bsblAdapter, date)).toBe(bsbl1);
  });

  it("SessionRepeatLimit instances are independent per sport", () => {
    const bballCap = new SessionRepeatLimit();
    const bsblCap = new SessionRepeatLimit();
    bballCap.record(["a", "a", "a"]);
    bballCap.record(["a", "a", "a"]);
    bballCap.record(["a", "a", "a"]);
    // baseball cap untouched
    const pool = [{ basePlayerId: "a" }, { basePlayerId: "b" }];
    expect(bsblCap.filter(pool, { windowSize: 10, maxAppearances: 3, minPoolFloor: 1 })).toEqual(pool);
  });

  it("getDailyBonusDateKey is sport-independent (does not take sportKey input)", () => {
    const date1 = new Date("2026-05-05T12:00:00Z");
    const date2 = new Date("2026-05-05T12:00:00Z");
    // Same date → same dateKey, regardless of any sport context.
    expect(getDailyBonusDateKey(date1)).toBe(getDailyBonusDateKey(date2));
    // The function signature itself takes only a Date, not a sportKey — the
    // sport-independence is structural, but verify by passing the same date and
    // confirming the output is a stable UTC date string.
    const key = getDailyBonusDateKey(date1);
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
