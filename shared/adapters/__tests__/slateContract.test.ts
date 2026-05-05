import { describe, expect, it } from "vitest";
import { SportAdapter } from "../SportAdapter";
import type { SportConfigShape } from "../../types";

const STUB_CONFIG: SportConfigShape = {
  sportKey: "stub",
  displayName: "Stub",
  salaryCap: 100,
  positions: ["F"],
  rosterSlots: ["F", "F", "F", "F", "F"],
  maxPlayers: 5,
  projectionWeights: { pts: 1 },
  statCategories: ["pts"],
} as unknown as SportConfigShape;

describe("SportAdapter.getCareerFP default", () => {
  it("returns 0 when no logs are provided", () => {
    const adapter = new SportAdapter(STUB_CONFIG);
    expect(adapter.getCareerFP("nonexistent", () => [])).toBe(0);
  });

  it("sums FP across logs with recent-bias (last 2 seasons × 2)", () => {
    const adapter = new SportAdapter(STUB_CONFIG);
    const currentYear = new Date().getUTCFullYear();
    const logs = [
      { season: currentYear,     stats: { pts: 10 } },  // recent → ×2
      { season: currentYear - 1, stats: { pts: 10 } },  // recent → ×2
      { season: currentYear - 5, stats: { pts: 10 } },  // old    → ×1
    ];
    // computeFantasyPoints({pts:10}) with weight {pts:1} = 10
    // total = 10*2 + 10*2 + 10*1 = 50
    expect(adapter.getCareerFP("p1", () => logs)).toBe(50);
  });

  it("returns 0 for player whose accessor returns empty", () => {
    const adapter = new SportAdapter(STUB_CONFIG);
    expect(adapter.getCareerFP("p2", () => [])).toBe(0);
  });
});
