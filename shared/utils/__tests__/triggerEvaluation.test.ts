// shared/utils/__tests__/triggerEvaluation.test.ts
import { describe, it, expect } from "vitest";
import { evaluateTrigger, type TriggerResult } from "../triggerEvaluation";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";

function card(overrides: Partial<GeneratedCard> = {}): GeneratedCard {
  return {
    id: "p1", basePlayerId: "p1", personKey: "p1", cardId: "p1-x",
    name: "Player", team: "LAL", season: "2122", position: "SG",
    salary: 40, tier: "BLUE", projectedFp: 30, slotIndex: 0,
    actualFp: 30, fpDelta: 0, statLine: {}, gameInfo: { date: "", opponent: "" },
    achievements: [], wasHeld: false, ...overrides,
  } as GeneratedCard;
}

const TIERS: WinTierMap = {
  LEGEND: { minFp: 255, multiplier: 50 },
  MVP:    { minFp: 235, multiplier: 8 },
  ALL_STAR: { minFp: 225, multiplier: 3 },
  STARTER:  { minFp: 205, multiplier: 1.5 },
  ROOKIE:   { minFp: 185, multiplier: 0.5 },
  BUST:     { minFp: 0,   multiplier: 0 },
};

describe("evaluateTrigger", () => {
  it("returns default trigger for normal hand", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 36 }));
    const result = evaluateTrigger({ roster, totalFp: 180, winTier: "STARTER", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("default");
    expect(result.headline).toContain("180");
  });

  it("returns big_score for MVP tier", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 47 }));
    const result = evaluateTrigger({ roster, totalFp: 235, winTier: "MVP", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("big_score");
  });

  it("returns big_score for LEGEND tier", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 52 }));
    const result = evaluateTrigger({ roster, totalFp: 260, winTier: "LEGEND", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("big_score");
  });

  it("returns near_miss when within 5 FP of next tier", () => {
    // 202 FP — ROOKIE (needs 205 for STARTER) — gap = 3
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 40.4 }));
    const result = evaluateTrigger({ roster, totalFp: 202, winTier: "ROOKIE", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("near_miss");
    expect(result.nearMissGap).toBeCloseTo(3, 0);
  });

  it("returns bad_beat for BUST with high-tier card", () => {
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8 }),
      card({ slotIndex: 1, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("bad_beat");
  });

  it("rare_pull wins over big_score", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 47 }));
    const badges = [{ id: "TOP_GAME", icon: "🏆", label: "Top Game", fp: 10 }];
    const result = evaluateTrigger({ roster, totalFp: 235, winTier: "MVP", badges, winTiersMap: TIERS });
    expect(result.trigger).toBe("rare_pull");
  });
});
