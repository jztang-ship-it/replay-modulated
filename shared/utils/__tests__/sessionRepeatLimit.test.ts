import { describe, expect, it, vi } from "vitest";
import {
  SessionRepeatLimit,
  DEFAULT_REPEAT_LIMIT,
  type RepeatLimitConfig,
} from "../sessionRepeatLimit";

const POOL = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"]
  .map(id => ({ basePlayerId: id }));

describe("SessionRepeatLimit", () => {
  it("returns full pool on first call (empty window)", () => {
    const cap = new SessionRepeatLimit();
    expect(cap.filter(POOL, DEFAULT_REPEAT_LIMIT)).toEqual(POOL);
  });

  it("excludes a player who hit maxAppearances in the window", () => {
    const cap = new SessionRepeatLimit();
    cap.record(["a", "b", "c"]);
    cap.record(["a", "d", "e"]);
    cap.record(["a", "f", "g"]);
    const out = cap.filter(POOL, DEFAULT_REPEAT_LIMIT);
    expect(out.map(p => p.basePlayerId)).not.toContain("a");
  });

  it("does not exclude players below the threshold", () => {
    const cap = new SessionRepeatLimit();
    cap.record(["a", "b", "c"]);
    cap.record(["a", "d", "e"]);
    const out = cap.filter(POOL, DEFAULT_REPEAT_LIMIT);
    expect(out.map(p => p.basePlayerId)).toContain("a"); // 2 appearances < 3 max
  });

  it("relaxes (returns pre-filter pool) when filtering shrinks below minPoolFloor", () => {
    const cap = new SessionRepeatLimit();
    // Saturate everyone in a 3-player pool to force relaxation
    const tinyPool = [{ basePlayerId: "a" }, { basePlayerId: "b" }, { basePlayerId: "c" }];
    cap.record(["a", "b", "c"]);
    cap.record(["a", "b", "c"]);
    cap.record(["a", "b", "c"]);
    const out = cap.filter(tinyPool, { windowSize: 10, maxAppearances: 3, minPoolFloor: 12 });
    expect(out).toEqual(tinyPool);
  });

  it("ages out hands beyond windowSize", () => {
    const cap = new SessionRepeatLimit();
    // Saturate "a" with 3 appearances
    cap.record(["a"]); cap.record(["a"]); cap.record(["a"]);
    expect(cap.filter(POOL, DEFAULT_REPEAT_LIMIT).map(p => p.basePlayerId)).not.toContain("a");
    // Push 10 more empty-of-"a" hands → "a" ages out
    for (let i = 0; i < 10; i++) cap.record(["b"]);
    expect(cap.filter(POOL, DEFAULT_REPEAT_LIMIT).map(p => p.basePlayerId)).toContain("a");
  });

  it("respects custom windowSize in record() (cap is config-driven, not hardcoded)", () => {
    const cap = new SessionRepeatLimit();
    // Tiny window of 3 — fourth record() must evict the oldest hand.
    // maxAppearances=2 lets us *probe* via filter() whether "a" still counts.
    const tinyConfig: RepeatLimitConfig = {
      windowSize: 3,
      maxAppearances: 2,
      minPoolFloor: 1,
    };
    cap.record(["a"], tinyConfig);
    cap.record(["a"], tinyConfig);
    // Two appearances within window → "a" should now be excluded.
    expect(cap.filter(POOL, tinyConfig).map(p => p.basePlayerId)).not.toContain("a");

    cap.record(["b"], tinyConfig);
    cap.record(["c"], tinyConfig); // window now [a, b, c] after evicting first "a"
    // After eviction, only one "a" remains in the window → below maxAppearances.
    expect(cap.filter(POOL, tinyConfig).map(p => p.basePlayerId)).toContain("a");

    cap.record(["d"], tinyConfig); // window now [b, c, d] — both "a"s evicted
    expect(cap.filter(POOL, tinyConfig).map(p => p.basePlayerId)).toContain("a");
  });

  it("reset() clears the window", () => {
    const cap = new SessionRepeatLimit();
    cap.record(["a"]); cap.record(["a"]); cap.record(["a"]);
    cap.reset();
    expect(cap.filter(POOL, DEFAULT_REPEAT_LIMIT)).toEqual(POOL);
  });

  it("invokes onRelaxed callback when pool floor relaxation triggers", () => {
    const onRelaxed = vi.fn();
    const cap = new SessionRepeatLimit(onRelaxed);
    const tinyPool = [{ basePlayerId: "a" }, { basePlayerId: "b" }, { basePlayerId: "c" }];
    cap.record(["a", "b", "c"]);
    cap.record(["a", "b", "c"]);
    cap.record(["a", "b", "c"]);
    // Force relaxation: filtering would empty the pool, which is below minPoolFloor.
    cap.filter(tinyPool, { windowSize: 10, maxAppearances: 3, minPoolFloor: 12 });
    expect(onRelaxed).toHaveBeenCalledTimes(1);

    // No relaxation when pool stays above floor — callback should not re-fire.
    cap.filter(POOL, DEFAULT_REPEAT_LIMIT);
    expect(onRelaxed).toHaveBeenCalledTimes(1);
  });
});
