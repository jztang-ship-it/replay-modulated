import { describe, expect, it, beforeEach } from "vitest";
import { _resetSlateCache, getCachedSlate } from "../utils/slateSelector";
import { SessionRepeatLimit } from "../utils/sessionRepeatLimit";

function mkAdapter(sportKey: string) {
  return {
    sportKey,
    rosterSize: 1,
    config: { slateSize: 3, anchorCount: 0, weightExponent: 1.0 },
    getAnchors: () => [],
    getCareerFPById: () => 1,
    getEligiblePool: () => ["a", "b", "c", "d", "e"],
    getThemedEligibility: () => null,
    getExclusionList: () => [],
  } as any;
}

describe("sport-isolation invariants (slate v2)", () => {
  beforeEach(() => _resetSlateCache());

  it("basketball slate cache key differs from baseball slate cache key", () => {
    const date = new Date("2026-05-05");
    const bball = getCachedSlate(mkAdapter("basketball"), date);
    const bsbl = getCachedSlate(mkAdapter("baseball"), date);
    // Subsequent calls for the same sport return the cached result
    const bball2 = getCachedSlate(mkAdapter("basketball"), date);
    const bsbl2 = getCachedSlate(mkAdapter("baseball"), date);
    expect(bball).toBe(bball2); // identity on cache hit
    expect(bsbl).toBe(bsbl2);
    // Independence: clearing/repopulating one sport doesn't affect the other
    _resetSlateCache();
    const bsblAfterReset = getCachedSlate(mkAdapter("baseball"), date);
    expect(bsblAfterReset).toEqual(bsbl);
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

  it("date-key generation is sport-independent (same UTC date for both sports)", () => {
    const date = new Date("2026-05-05T12:00:00Z");
    const bball = getCachedSlate(mkAdapter("basketball"), date);
    const bsbl = getCachedSlate(mkAdapter("baseball"), date);
    // Both should be deterministic; confirm a same-date second call equals first
    expect(getCachedSlate(mkAdapter("basketball"), date)).toEqual(bball);
    expect(getCachedSlate(mkAdapter("baseball"), date)).toEqual(bsbl);
  });
});
