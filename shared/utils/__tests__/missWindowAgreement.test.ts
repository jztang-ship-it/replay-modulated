// shared/utils/__tests__/missWindowAgreement.test.ts
//
// Phase 1 trigger split (2026-06-03, docs/challenge-landing-v2-phase1-
// trigger-split-lock.md). Contradiction-guard for the #1/#3 coupling —
// the stamp window (triggerEvaluation.MISS_PCT_OF_NEXT_MIN) and the
// post-reveal "missed X by Y" copy threshold (GameView's NEAR_MISS_BAND
// passed to computeGaugeState) MUST agree, or the same results screen
// contradicts itself (stamp fires, copy says no near miss — or vice
// versa).
//
// Lock-mandated test case: a high-tier gap of ~10 FP near a tier whose
// 5% window is wider than the old flat-5. Under flat-5, the gap would
// not fire EITHER signal. Under 5%, both fire — proving lockstep.

import { describe, it, expect } from "vitest";
import { evaluateTrigger } from "../triggerEvaluation";
import { computeGaugeState } from "@shared/components/TierGauge";
import type { GeneratedCard } from "@shared/types/index";
import type { WinTierMap } from "@shared/utils/payoutLogic";
import type { TierThreshold, GaugeTier } from "@shared/components/TierGauge";

function card(overrides: Partial<GeneratedCard> = {}): GeneratedCard {
  return {
    id: "p1", basePlayerId: "p1", personKey: "p1", cardId: "p1-x",
    name: "Player", team: "LAL", season: "2324", position: "SG",
    salary: 40, tier: "BLUE", projectedFp: 30, slotIndex: 0,
    actualFp: 30, fpDelta: 0, statLine: {}, gameInfo: { date: "", opponent: "" },
    achievements: [], wasHeld: false, ...overrides,
  } as GeneratedCard;
}

// Same tier values used by triggerEvaluation tests + the basketball
// thresholds shape used by TierGauge. ALL_STAR minFp 225 → 5% = 11.25 FP.
const TIERS_MAP: WinTierMap = {
  LEGEND:   { minFp: 255, multiplier: 50 },
  MVP:      { minFp: 235, multiplier: 8 },
  ALL_STAR: { minFp: 225, multiplier: 3 },
  STARTER:  { minFp: 205, multiplier: 1.5 },
  ROOKIE:   { minFp: 185, multiplier: 0.5 },
  BUST:     { minFp: 0,   multiplier: 0 },
};
const TIERS_GAUGE: TierThreshold[] = [
  { tier: "BUST" as GaugeTier,    minFP: 0 },
  { tier: "ROOKIE" as GaugeTier,  minFP: 185 },
  { tier: "STARTER" as GaugeTier, minFP: 205 },
  { tier: "ALL_STAR" as GaugeTier, minFP: 225 },
  { tier: "MVP" as GaugeTier,     minFP: 235 },
  { tier: "LEGEND" as GaugeTier,  minFP: 255 },
];

describe("Phase 1 #1/#3 agreement — stamp window and post-reveal copy use the same 5% rule", () => {
  it("STARTER 10 FP shy of ALL_STAR (high-tier gap, 5%-of-225 = 11.25): stamp fires AND post-reveal copy says near-miss", () => {
    // #1 — the stamp window via triggerEvaluation.
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 43 }));
    const triggerResult = evaluateTrigger({
      roster, totalFp: 215, winTier: "STARTER", badges: [], winTiersMap: TIERS_MAP,
    });
    expect(triggerResult.trigger, "stamp window must fire miss at gap=10 (5% of 225 = 11.25)").toBe("miss");
    expect(triggerResult.nearMissGap).toBeCloseTo(10, 0);
    expect(triggerResult.nearMissNextTier).toBe("ALL_STAR");

    // #3 — the post-reveal "missed X by Y" copy via computeGaugeState.
    // GameView calls computeGaugeState with NEAR_MISS_BAND={pctOfNextMin:5};
    // we mirror that here. The same threshold must classify the same
    // hand as isNearMiss=true so the on-screen copy agrees with the
    // stamp.
    const gaugeSnap = computeGaugeState(
      215,
      TIERS_GAUGE,
      "STARTER",
      { pctOfNextMin: 5 },
    );
    expect(gaugeSnap.isNearMiss, "post-reveal copy must classify gap=10 as near-miss (5% rule)").toBe(true);
    expect(gaugeSnap.nextTier).toBe("ALL_STAR");
    expect(gaugeSnap.gap).toBeCloseTo(10, 0);
  });

  it("flat-5 sanity check — the same gap=10 would have failed BOTH under the old flat-5 rule (proves the change is needed)", () => {
    // Calling computeGaugeState with the old flat-5 value at the same
    // 10 FP gap returns isNearMiss=false. This is the contradiction the
    // 5% change resolves: under flat-5, evaluateTrigger (now 5%) would
    // have fired the stamp on a future-version mismatch — exactly the
    // "stamp fired but copy didn't" surface the lock forbids.
    const snapFlat5 = computeGaugeState(215, TIERS_GAUGE, "STARTER", 5);
    expect(snapFlat5.isNearMiss).toBe(false);
  });

  it("boundary — gap exactly at 5% (11.25 FP from ALL_STAR): both signals fire", () => {
    // 213.75 FP → gap = 11.25 → equal to threshold (the <= comparison
    // includes the boundary).
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 42.75 }));
    const t = evaluateTrigger({
      roster, totalFp: 213.75, winTier: "STARTER", badges: [], winTiersMap: TIERS_MAP,
    });
    expect(t.trigger).toBe("miss");
    const g = computeGaugeState(213.75, TIERS_GAUGE, "STARTER", { pctOfNextMin: 5 });
    expect(g.isNearMiss).toBe(true);
  });

  it("boundary — gap just past 5% (12 FP from ALL_STAR): neither signal fires", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 42.6 }));
    const t = evaluateTrigger({
      roster, totalFp: 213, winTier: "STARTER", badges: [], winTiersMap: TIERS_MAP,
    });
    expect(t.trigger).not.toBe("miss");
    const g = computeGaugeState(213, TIERS_GAUGE, "STARTER", { pctOfNextMin: 5 });
    expect(g.isNearMiss).toBe(false);
  });
});
