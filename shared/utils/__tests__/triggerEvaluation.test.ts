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

  it("returns miss when STARTER within 5 FP of ALL_STAR", () => {
    // 222 FP — STARTER (needs 225 for ALL_STAR) — gap = 3
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 44.4 }));
    const result = evaluateTrigger({ roster, totalFp: 222, winTier: "STARTER", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("miss");
    expect(result.nearMissGap).toBeCloseTo(3, 0);
    expect(result.nearMissNextTier).toBe("ALL_STAR");
  });

  it("does NOT fire miss for BUST→ROOKIE transitions", () => {
    // 184 FP — BUST 1 FP below ROOKIE threshold. Tightened logic: no
    // miss below STARTER, since BUST hands aren't share-worthy.
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 36.8 }));
    const result = evaluateTrigger({ roster, totalFp: 184, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).not.toBe("miss");
  });

  it("does NOT fire miss for ROOKIE→STARTER transitions", () => {
    // 202 FP — ROOKIE 3 FP below STARTER. Same rule: needs STARTER+.
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 40.4 }));
    const result = evaluateTrigger({ roster, totalFp: 202, winTier: "ROOKIE", badges: [], winTiersMap: TIERS });
    expect(result.trigger).not.toBe("miss");
  });

  it("returns bad_beat for BUST with 2+ held RED/ORANGE cards", () => {
    // Per the May 16 "held-only gate" fix: bad_beat is the share-worthy
    // "I stacked my lineup and it cooked" story. The 2+ R/O threshold
    // counts only cards the user actually held — RNG-drawn high-tier
    // cards are not a stack-and-bust narrative.
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8, wasHeld: true }),
      card({ slotIndex: 1, tier: "ORANGE", actualFp: 8, wasHeld: true }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("bad_beat");
  });

  it("fires bad_beat for BUST with 1 held RED card (broadened threshold, 2026-05-25)", () => {
    // Threshold dropped from >= 2 to >= 1 (bucket 2 piece B final
    // amend) to match user mental model: "any premium-held hand that
    // BUSTs is a bad beat." Empirical frequency calibration tracked
    // as open followup. This test guards against accidental revert.
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8, wasHeld: true }),
      card({ slotIndex: 1, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("bad_beat");
  });

  it("fires bad_beat for ROOKIE with 1 held ORANGE card (broadened threshold)", () => {
    // Mirrors the Webber-style hand: single held premium card,
    // ROOKIE outcome. Pre-broadening this returned "default".
    const roster = [
      card({ slotIndex: 0, tier: "ORANGE", actualFp: 30, wasHeld: true }),
      card({ slotIndex: 1, tier: "WHITE", actualFp: 35 }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 35 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 35 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 35 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 200, winTier: "ROOKIE", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("bad_beat");
  });

  it("does NOT fire bad_beat for BUST with 0 held RED/ORANGE cards", () => {
    // After broadening, the floor is still HELD >= 1 R/O. RNG-drawn
    // R/O cards in the lineup don't count — the "stacked lineup got
    // cooked" story requires deliberate user holds.
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8, wasHeld: false }),
      card({ slotIndex: 1, tier: "ORANGE", actualFp: 8, wasHeld: false }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("default");
  });

  it("does NOT fire bad_beat when 2+ RED/ORANGE cards are NOT held", () => {
    // Held-only gate: RNG-drawn high-tier cards aren't a "stacked lineup
    // got cooked" story. Even with two R/O slots in the lineup, if neither
    // was wasHeld, bad_beat must not fire.
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8, wasHeld: false }),
      card({ slotIndex: 1, tier: "ORANGE", actualFp: 8, wasHeld: false }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("default");
  });

  it("rare_pull wins over big_score", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 47 }));
    const badges = [{ id: "TOP_GAME", icon: "🏆", label: "Top Game", fp: 10 }];
    const result = evaluateTrigger({ roster, totalFp: 235, winTier: "MVP", badges, winTiersMap: TIERS });
    expect(result.trigger).toBe("rare_pull");
  });

  it("propagates topGamePrimaryReason and topGameAllReasons on rare_pull (Bucket 2 Q3.1)", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 47 }));
    const reasons = [
      { category: "fifty_plus_game", label: "Top-rarity: 50-point game", value: 1 },
      { category: "pts", label: "1st highest scoring game of the season (57 pts)", value: 57, rank: 1 },
    ];
    const result: TriggerResult = evaluateTrigger({
      roster, totalFp: 235, winTier: "MVP", badges: [], winTiersMap: TIERS,
      topGameTier: "season",
      topGamePrimaryReason: reasons[0],
      topGameAllReasons: reasons,
    });
    expect(result.trigger).toBe("rare_pull");
    expect(result.topGameTier).toBe("season");
    expect(result.topGamePrimaryReason?.category).toBe("fifty_plus_game");
    expect(result.topGameAllReasons).toHaveLength(2);
    expect(result.topGameAllReasons?.[1].category).toBe("pts");
  });

  it("rare_pull without TopGameReason context yields null fields (degradation path)", () => {
    // useChallengeShare.evaluateTrigger call doesn't carry topGame
    // context — confirm graceful null-out so downstream selector
    // routes to RECORD fallback per Q3.1 spec.
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 47 }));
    const result: TriggerResult = evaluateTrigger({
      roster, totalFp: 235, winTier: "MVP", badges: [], winTiersMap: TIERS,
      topGameTier: "season",
      // no topGamePrimaryReason / topGameAllReasons
    });
    expect(result.trigger).toBe("rare_pull");
    expect(result.topGamePrimaryReason).toBeNull();
    expect(result.topGameAllReasons).toBeNull();
  });

  // ── Phase 5c Path A (2026-06-01): real-input anchor emission tests ────
  // Closes the mock-vs-real gap from S1: previous tests only verified that
  // a pre-set mock's anchor field propagates to the result. These tests
  // verify that evaluateTrigger ACTUALLY EMITS the anchor for a real-shape
  // TriggerInput. Same pattern (real input, real evaluator) goes for the
  // end-to-end emission test in useChallengeShare.test.tsx.

  it("bad_beat emits anchorBasePlayerId = worst-delta held card's basePlayerId", () => {
    // Two held cards: harden underperforms by 20 FP, lebron by 5 FP. Anchor
    // should be harden (worst delta). The non-held cards on the roster
    // (even ones with worse deltas) are excluded.
    const roster = [
      card({ slotIndex: 0, basePlayerId: "harden",  tier: "RED",    actualFp: 30, projectedFp: 50, salary: 65, wasHeld: true  }),
      card({ slotIndex: 1, basePlayerId: "lebron",  tier: "ORANGE", actualFp: 45, projectedFp: 50, salary: 60, wasHeld: true  }),
      card({ slotIndex: 2, basePlayerId: "rng-low", tier: "RED",    actualFp: 10, projectedFp: 50, salary: 70, wasHeld: false }), // worse delta but not held — ignored
      card({ slotIndex: 3, basePlayerId: "filler",  tier: "WHITE",  actualFp: 8 }),
      card({ slotIndex: 4, basePlayerId: "filler2", tier: "WHITE",  actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 101, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("bad_beat");
    expect(result.anchorBasePlayerId).toBe("harden");
  });

  it("bad_beat tiebreaks equal deltas by highest salary", () => {
    // Two held cards with identical -20 FP delta. Tiebreak: pick higher-
    // salary card (bigger conviction = bigger betrayal narrative).
    const roster = [
      card({ slotIndex: 0, basePlayerId: "expensive", tier: "RED", actualFp: 30, projectedFp: 50, salary: 70, wasHeld: true }),
      card({ slotIndex: 1, basePlayerId: "cheaper",   tier: "RED", actualFp: 30, projectedFp: 50, salary: 50, wasHeld: true }),
      card({ slotIndex: 2, basePlayerId: "filler",    tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, basePlayerId: "filler2",   tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, basePlayerId: "filler3",   tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 84, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("bad_beat");
    expect(result.anchorBasePlayerId).toBe("expensive");
  });

  it("big_score emits anchorBasePlayerId = highest-actualFp card", () => {
    const roster = [
      card({ slotIndex: 0, basePlayerId: "leader",  actualFp: 62 }),
      card({ slotIndex: 1, basePlayerId: "second",  actualFp: 50 }),
      card({ slotIndex: 2, basePlayerId: "filler1", actualFp: 45 }),
      card({ slotIndex: 3, basePlayerId: "filler2", actualFp: 42 }),
      card({ slotIndex: 4, basePlayerId: "filler3", actualFp: 36 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 235, winTier: "MVP", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("big_score");
    expect(result.anchorBasePlayerId).toBe("leader");
  });

  it("big_score prefers wasHeld inside the 1-FP tiebreak window", () => {
    // Top scorer (62 FP) was NOT held; held card at 61.5 FP is within 1 FP.
    // Tiebreak: prefer the held one for the "bet-on player gets credit"
    // narrative. The 0.5-FP delta is inside the window.
    const roster = [
      card({ slotIndex: 0, basePlayerId: "hot-replacement", actualFp: 62,   wasHeld: false }),
      card({ slotIndex: 1, basePlayerId: "held-star",       actualFp: 61.5, wasHeld: true  }),
      card({ slotIndex: 2, basePlayerId: "filler1",         actualFp: 45 }),
      card({ slotIndex: 3, basePlayerId: "filler2",         actualFp: 42 }),
      card({ slotIndex: 4, basePlayerId: "filler3",         actualFp: 36 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 246.5, winTier: "ALL_STAR", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("big_score");
    expect(result.anchorBasePlayerId).toBe("held-star");
  });

  it("big_score keeps the unheld leader when the next-highest held card is OUTSIDE the 1-FP window", () => {
    // Top scorer (62 FP) was NOT held; the highest-held card is 59 FP —
    // 3 FP behind, outside the tiebreak window. The unheld leader keeps
    // the anchor; the held-preference rule doesn't apply.
    const roster = [
      card({ slotIndex: 0, basePlayerId: "hot-replacement", actualFp: 62, wasHeld: false }),
      card({ slotIndex: 1, basePlayerId: "held-mid",        actualFp: 59, wasHeld: true  }),
      card({ slotIndex: 2, basePlayerId: "filler1",         actualFp: 45 }),
      card({ slotIndex: 3, basePlayerId: "filler2",         actualFp: 42 }),
      card({ slotIndex: 4, basePlayerId: "filler3",         actualFp: 36 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 244, winTier: "ALL_STAR", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("big_score");
    expect(result.anchorBasePlayerId).toBe("hot-replacement");
  });

  it("default trigger continues to emit no anchor (no per-trigger anchor for default)", () => {
    // default has no anchor concept by design — verify it stays unpopulated
    // even with a clearly-leading card.
    const roster = [
      card({ slotIndex: 0, basePlayerId: "leader", actualFp: 50 }),
      card({ slotIndex: 1, basePlayerId: "two",    actualFp: 35 }),
      card({ slotIndex: 2, basePlayerId: "three",  actualFp: 30 }),
      card({ slotIndex: 3, basePlayerId: "four",   actualFp: 30 }),
      card({ slotIndex: 4, basePlayerId: "five",   actualFp: 35 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 180, winTier: "STARTER", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("default");
    expect(result.anchorBasePlayerId).toBeUndefined();
  });
});
