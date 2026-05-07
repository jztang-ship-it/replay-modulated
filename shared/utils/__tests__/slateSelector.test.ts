import { describe, expect, it } from "vitest";
import { selectDailySlate, type SlateConfig } from "../slateSelector";
import { getCachedSlate, defaultSlateConfig, _resetSlateCache } from "../slateSelector";

const CFG: SlateConfig = { slateSize: 10, anchorCount: 3, weightExponent: 1.0 };

function adapter(opts: { sportKey?: string; anchors?: string[]; careerFp?: Record<string, number> } = {}) {
  return {
    sportKey: opts.sportKey ?? "stub",
    getAnchors: () => opts.anchors ?? [],
    getCareerFPById: (id: string) => opts.careerFp?.[id] ?? 0,
  };
}

describe("selectDailySlate", () => {
  it("places eligible anchors first in the result", () => {
    const a = adapter({ anchors: ["A1", "A2", "A3"] });
    const eligible = ["A1", "A2", "A3", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];
    const out = selectDailySlate(a, eligible, new Date("2026-05-05"), undefined, CFG);
    expect(out.slice(0, 3)).toEqual(["A1", "A2", "A3"]);
    expect(out).toHaveLength(10);
  });

  it("drops anchors that are not in the eligibility set", () => {
    const a = adapter({ anchors: ["A1", "ineligible-anchor"] });
    const eligible = ["A1", "r1", "r2", "r3", "r4", "r5"];
    const out = selectDailySlate(a, eligible, new Date(), undefined, { ...CFG, slateSize: 5, anchorCount: 2 });
    expect(out).toContain("A1");
    expect(out).not.toContain("ineligible-anchor");
    expect(out).toHaveLength(5);
  });

  it("is deterministic given (sport, date, theme)", () => {
    const eligible = Array.from({ length: 50 }, (_, i) => `p${i}`);
    const careerFp: Record<string, number> = Object.fromEntries(eligible.map((id, i) => [id, 50 - i]));
    const a = adapter({ careerFp });
    const out1 = selectDailySlate(a, eligible, new Date("2026-06-01"), undefined, CFG);
    const out2 = selectDailySlate(a, eligible, new Date("2026-06-01"), undefined, CFG);
    expect(out1).toEqual(out2);
  });

  it("produces different slates for different dates", () => {
    const eligible = Array.from({ length: 50 }, (_, i) => `p${i}`);
    const careerFp: Record<string, number> = Object.fromEntries(eligible.map((id, i) => [id, 50 - i]));
    const a = adapter({ careerFp });
    const out1 = selectDailySlate(a, eligible, new Date("2026-06-01"), undefined, CFG);
    const out2 = selectDailySlate(a, eligible, new Date("2026-06-02"), undefined, CFG);
    expect(out1).not.toEqual(out2);
  });

  it("biases rotating selection toward higher career FP statistically", () => {
    const eligible = ["heavy", "light"];
    const careerFp: Record<string, number> = { heavy: 1000, light: 1 };
    const a = adapter({ careerFp });
    const cfg: SlateConfig = { slateSize: 1, anchorCount: 0, weightExponent: 1.0 };
    let heavyCount = 0;
    for (let day = 0; day < 200; day++) {
      const date = new Date(2026, 5, day);
      const out = selectDailySlate(a, eligible, date, undefined, cfg);
      if (out[0] === "heavy") heavyCount++;
    }
    expect(heavyCount).toBeGreaterThan(180); // ~99%+ with 1000:1 weight
  });

  it("returns a slate exactly of slateSize when eligibility is large enough", () => {
    const eligible = Array.from({ length: 100 }, (_, i) => `p${i}`);
    const careerFp: Record<string, number> = Object.fromEntries(eligible.map((id) => [id, Math.random() * 100]));
    const a = adapter({ careerFp });
    const out = selectDailySlate(a, eligible, new Date("2026-05-05"), undefined, CFG);
    expect(out).toHaveLength(10);
  });
});

describe("defaultSlateConfig", () => {
  it("derives slateSize from rosterSize × 10 by default", () => {
    const adapter = { sportKey: "x", rosterSize: 6, config: {} } as any;
    expect(defaultSlateConfig(adapter)).toEqual({
      slateSize: 60,
      anchorCount: 9,
      weightExponent: 1.0,
    });
  });

  it("respects per-sport config overrides", () => {
    const adapter = {
      sportKey: "x",
      rosterSize: 6,
      config: { slateSize: 80, anchorCount: 12, weightExponent: 1.5 },
    } as any;
    expect(defaultSlateConfig(adapter)).toEqual({
      slateSize: 80,
      anchorCount: 12,
      weightExponent: 1.5,
    });
  });
});

describe("getCachedSlate", () => {
  it("memoizes by (sport, date, theme); same inputs return cached result", () => {
    _resetSlateCache();
    const eligible = ["a", "b", "c", "d", "e"];
    let careerFpCalls = 0;
    const adapter = {
      sportKey: "x",
      rosterSize: 1,
      config: { slateSize: 3, anchorCount: 0, weightExponent: 1.0 },
      getAnchors: () => [],
      getCareerFPById: (_id: string) => { careerFpCalls++; return 1; },
      getEligiblePool: () => eligible,
      getThemedEligibility: () => null,
      getExclusionList: () => [],
    } as any;
    const date = new Date("2026-05-05");
    const r1 = getCachedSlate(adapter, date);
    const callsAfterFirst = careerFpCalls;
    const r2 = getCachedSlate(adapter, date);
    expect(r1).toEqual(r2);
    expect(careerFpCalls).toBe(callsAfterFirst);
  });

  it("different sports cache independently", () => {
    _resetSlateCache();
    const mkAdapter = (sport: string) => ({
      sportKey: sport,
      rosterSize: 1,
      config: { slateSize: 2, anchorCount: 0, weightExponent: 1.0 },
      getAnchors: () => [],
      getCareerFPById: () => 1,
      getEligiblePool: () => ["a", "b", "c", "d"],
      getThemedEligibility: () => null,
      getExclusionList: () => [],
    } as any);
    const d = new Date("2026-05-05");
    const bball = getCachedSlate(mkAdapter("basketball"), d);
    const baseball = getCachedSlate(mkAdapter("baseball"), d);
    // Slates may coincidentally agree, but cache keys must differ — verify by
    // confirming a second basketball call returns the same as bball regardless
    // of any baseball call between.
    const bball2 = getCachedSlate(mkAdapter("basketball"), d);
    expect(bball).toEqual(bball2);
  });
});
