// shared/commentary/__tests__/chadInitiationGuardrail.test.ts
//
// Defect-fix regression: INITIATION_CULTURE_FLEX and INITIATION_RARE_PULL
// previously contained authored claims about the player {name} substitutes
// to ("season-high", "career bar", "twice a year") that the selector had
// no way to verify against the underlying hand data. Those lines could
// fire on a flex/ALL_STAR overperformance with no record/career/season
// event, asserting a fact about the player that wasn't true of THAT hand.
//
// These tests pin the guardrail: drive the REAL selector on the same
// conditions that previously fired the false claims, many times to walk
// the local pickWithAntiRepeat ring through every bank line, and assert
// the unverifiable substrings NEVER surface in the output.

import { describe, it, expect } from "vitest";
import { selectChallengeInitiation } from "../chadChallenge";

const ITERATIONS = 50;

describe("Initiation guardrail — no unverifiable stat claims", () => {
  it("flex bucket with topGameTier=null + meaningful performance never claims season-high / career bar", () => {
    // bucket=flex requires winTier=ALL_STAR/MVP/LEGEND OR topGameTier=record/career.
    // Topology under test: ALL_STAR winTier + topGameTier=null +
    // starHadMeaningfulPerformance=true → routes to INITIATION_CULTURE_FLEX
    // (the bank the defect lived in).
    for (let i = 0; i < ITERATIONS; i++) {
      const line = selectChallengeInitiation({
        winTier: "ALL_STAR",
        roster: [
          { tier: "RED", wasHeld: true },
          { tier: "ORANGE", wasHeld: false },
          { tier: "PURPLE", wasHeld: false },
          { tier: "BLUE", wasHeld: false },
          { tier: "GREEN", wasHeld: false },
          { tier: "WHITE", wasHeld: false },
        ],
        topGameTier: null, // <-- the gate that exposed the defect
        starName: "Wembanyama",
        starHadMeaningfulPerformance: true, // <-- routes culture-aware
        starAchievementType: null, // <-- not rare_pull, stays in flex
      });
      // The whole point: with no record/career/season event, neither claim
      // is allowed to appear in the public-facing share copy.
      expect(line).not.toMatch(/season-high/i);
      expect(line).not.toMatch(/career bar/i);
    }
  });

  it("rare_pull output never asserts a 'twice a year' frequency claim", () => {
    // rare_pull preempts everything when starAchievementType is set.
    // Provide complete anchor data so rarePullCandidates doesn't shrink
    // the bank — the test must exercise every line including the one
    // that previously carried the bad claim.
    for (let i = 0; i < ITERATIONS; i++) {
      const line = selectChallengeInitiation({
        winTier: "LEGEND",
        roster: [
          { tier: "RED", wasHeld: true },
          { tier: "RED", wasHeld: false },
          { tier: "ORANGE", wasHeld: false },
          { tier: "PURPLE", wasHeld: false },
          { tier: "BLUE", wasHeld: false },
          { tier: "GREEN", wasHeld: false },
        ],
        topGameTier: "season",
        starName: "Wembanyama",
        starHadMeaningfulPerformance: true,
        starAchievementType: "season",
        starAnchorFp: 86,    // <-- enables {anchorFp} lines
        starProjectedFp: 55, // <-- enables {fpDelta} lines (delta=31 > 0)
      });
      expect(line).not.toMatch(/twice a year/i);
    }
  });
});
