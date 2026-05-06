import { describe, expect, it } from "vitest";
import { mulberry32 } from "../seededRng";
import { weightedSampleWithoutReplacement } from "../weightedSample";

describe("weightedSampleWithoutReplacement", () => {
  it("returns exactly `count` distinct items from input", () => {
    const items = ["a", "b", "c", "d", "e"];
    const weights = [1, 1, 1, 1, 1];
    const rng = mulberry32(1);
    const out = weightedSampleWithoutReplacement(items, weights, 3, rng);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
    out.forEach(x => expect(items).toContain(x));
  });

  it("returns all items when count >= items.length", () => {
    const items = ["a", "b", "c"];
    const weights = [1, 1, 1];
    const out = weightedSampleWithoutReplacement(items, weights, 5, mulberry32(2));
    expect(out).toHaveLength(3);
    expect(new Set(out)).toEqual(new Set(items));
  });

  it("biases selection toward higher weights statistically", () => {
    const items = ["heavy", "light"];
    const weights = [100, 1];
    let heavyCount = 0;
    for (let i = 0; i < 1000; i++) {
      const out = weightedSampleWithoutReplacement(items, weights, 1, mulberry32(i));
      if (out[0] === "heavy") heavyCount++;
    }
    // With 100:1 weight, heavy should dominate strongly. Exact ratio varies but >85% is robust.
    expect(heavyCount).toBeGreaterThan(850);
  });

  it("treats zero-weight items as never-selected when other items are available", () => {
    const items = ["a", "b", "c"];
    const weights = [0, 1, 1];
    for (let i = 0; i < 50; i++) {
      const out = weightedSampleWithoutReplacement(items, weights, 2, mulberry32(i));
      expect(out).not.toContain("a");
    }
  });

  it("is deterministic given the same RNG state", () => {
    const items = ["a", "b", "c", "d", "e"];
    const weights = [3, 1, 4, 1, 5];
    const a = weightedSampleWithoutReplacement(items, weights, 3, mulberry32(42));
    const b = weightedSampleWithoutReplacement(items, weights, 3, mulberry32(42));
    expect(a).toEqual(b);
  });

  it("returns empty array when count is 0", () => {
    const out = weightedSampleWithoutReplacement(["a"], [1], 0, mulberry32(1));
    expect(out).toEqual([]);
  });
});
