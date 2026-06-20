// shared/components/__tests__/TierGauge.nearMiss.test.ts
//
// Coverage for computeGaugeState's 5%-of-next-tier near-miss band
// (NEAR_MISS_BAND = { pctOfNextMin: 5 }). This is the standalone signal that
// drives the post-reveal "missed X by Y" copy AND — as of the trigger-removal
// decouple — the solo near-miss reveal STAMP (GameView stampKind), now that the
// `miss` challenge trigger is gone.
//
// Migrated here from shared/utils/__tests__/missWindowAgreement.test.ts, which
// was deleted when the miss trigger was removed (it asserted the now-nonexistent
// trigger window agreed with this gauge band). The trigger half no longer exists;
// the gauge band is still live and keeps its coverage here.

import { describe, it, expect } from "vitest";
import { computeGaugeState } from "@shared/components/TierGauge";
import type { TierThreshold, GaugeTier } from "@shared/components/TierGauge";

// Basketball gauge thresholds — ALL_STAR minFP 225 → 5% band = 11.25 FP.
const TIERS_GAUGE: TierThreshold[] = [
  { tier: "BUST" as GaugeTier,     minFP: 0 },
  { tier: "ROOKIE" as GaugeTier,   minFP: 185 },
  { tier: "STARTER" as GaugeTier,  minFP: 205 },
  { tier: "ALL_STAR" as GaugeTier, minFP: 225 },
  { tier: "MVP" as GaugeTier,      minFP: 235 },
  { tier: "LEGEND" as GaugeTier,   minFP: 255 },
];
const BAND = { pctOfNextMin: 5 } as const;

describe("computeGaugeState — 5% near-miss band (pctOfNextMin)", () => {
  it("STARTER 10 FP shy of ALL_STAR (within 5%-of-225 = 11.25): isNearMiss, nextTier ALL_STAR", () => {
    const g = computeGaugeState(215, TIERS_GAUGE, "STARTER", BAND);
    expect(g.isNearMiss).toBe(true);
    expect(g.nextTier).toBe("ALL_STAR");
    expect(g.gap).toBeCloseTo(10, 0);
  });

  it("the SAME gap=10 under the old flat-5 band is NOT a near-miss (proves the 5% rule)", () => {
    const g = computeGaugeState(215, TIERS_GAUGE, "STARTER", 5);
    expect(g.isNearMiss).toBe(false);
  });

  it("boundary — gap exactly 11.25 (5% of 225) is a near-miss (<= is inclusive)", () => {
    const g = computeGaugeState(213.75, TIERS_GAUGE, "STARTER", BAND);
    expect(g.isNearMiss).toBe(true);
  });

  it("boundary — gap just past 5% (12 FP) is NOT a near-miss", () => {
    const g = computeGaugeState(213, TIERS_GAUGE, "STARTER", BAND);
    expect(g.isNearMiss).toBe(false);
  });

  it("no near-miss when winTier is unset (the != null guard)", () => {
    const g = computeGaugeState(215, TIERS_GAUGE, null, BAND);
    expect(g.isNearMiss).toBe(false);
  });

  it("no near-miss at max level (LEGEND has no next tier)", () => {
    const g = computeGaugeState(260, TIERS_GAUGE, "LEGEND", BAND);
    expect(g.isNearMiss).toBe(false);
  });
});
