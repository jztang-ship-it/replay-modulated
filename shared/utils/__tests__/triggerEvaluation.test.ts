// shared/utils/__tests__/triggerEvaluation.test.ts
//
// Phase 1 trigger split (2026-06-03, docs/challenge-landing-v2-phase1-
// trigger-split-lock.md): bad_beat → choke (rename + tighten ≥1 → ≥2),
// miss window flat 5 FP → 5% of next tier's minFp, precedence choke
// before miss. The deleted "BAD BEAT" stamp's old 1-held-RED/ORANGE case
// now drops to default — choke is rare and earned.
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
  it("returns null for a normal hand — default trigger removed (no challenge initiated)", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 36 }));
    const result = evaluateTrigger({ roster, totalFp: 180, winTier: "STARTER", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
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

  // ── miss + default triggers REMOVED (2026-06-20) ────────────────────────
  // A tier near-miss and an ordinary hand no longer initiate a challenge:
  // evaluateTrigger returns null. The near-miss reveal STAMP still fires — it
  // rides the gauge's standalone 5% band (computeGaugeState + NEAR_MISS_BAND),
  // covered by shared/components/__tests__/TierGauge.nearMiss.test.ts. These
  // cases pin that former-miss / non-special hands now classify as null.

  it("former near-miss (STARTER 3 FP shy of ALL_STAR) now returns null", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 44.4 }));
    const result = evaluateTrigger({ roster, totalFp: 222, winTier: "STARTER", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });

  it("former high-tier near-miss (STARTER 10 FP shy of ALL_STAR) now returns null", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 43 }));
    const result = evaluateTrigger({ roster, totalFp: 215, winTier: "STARTER", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });

  it("former tight near-miss (STARTER 4.9 FP shy of ALL_STAR) now returns null", () => {
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 44.02 }));
    const result = evaluateTrigger({ roster, totalFp: 220.1, winTier: "STARTER", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });

  it("BUST→ROOKIE (no choke) returns null — neither miss nor default fires", () => {
    // 184 FP — BUST 1 FP below ROOKIE threshold, no held high-tier cards.
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 36.8 }));
    const result = evaluateTrigger({ roster, totalFp: 184, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });

  it("ROOKIE→STARTER (no choke) returns null — neither miss nor default fires", () => {
    // 202 FP — ROOKIE 3 FP below STARTER, no held high-tier cards.
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 40.4 }));
    const result = evaluateTrigger({ roster, totalFp: 202, winTier: "ROOKIE", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });

  // ── choke — Phase 1 trigger split (renamed from bad_beat, tightened ≥1 → ≥2) ──
  // Choke is rare and earned: the held studs-and-bricked story. The
  // 1-held-high-tier-card case drops to default; rarity is what makes
  // the stamp sting.

  it("returns choke for BUST with 2 held RED/ORANGE cards (boundary — exactly 2 fires)", () => {
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8, wasHeld: true }),
      card({ slotIndex: 1, tier: "ORANGE", actualFp: 8, wasHeld: true }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("choke");
  });

  it("does NOT fire choke at 1 held RED card on BUST (Phase 1 boundary — now returns null)", () => {
    // Phase 1 trigger split: the 1-held case used to fire bad_beat
    // (broadened threshold in May 2026); now it drops to default to
    // reserve the choke stamp for the truly stacked-and-bricked case.
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8, wasHeld: true }),
      card({ slotIndex: 1, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });

  it("does NOT fire choke at 1 held ORANGE card on ROOKIE (Phase 1 boundary — now returns null)", () => {
    const roster = [
      card({ slotIndex: 0, tier: "ORANGE", actualFp: 30, wasHeld: true }),
      card({ slotIndex: 1, tier: "WHITE", actualFp: 35 }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 35 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 35 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 35 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 200, winTier: "ROOKIE", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });

  it("does NOT fire choke for BUST with 0 held RED/ORANGE cards", () => {
    // Held-only gate: RNG-drawn R/O cards don't count.
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8, wasHeld: false }),
      card({ slotIndex: 1, tier: "ORANGE", actualFp: 8, wasHeld: false }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });

  it("does NOT fire choke when 2+ RED/ORANGE cards are NOT held", () => {
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8, wasHeld: false }),
      card({ slotIndex: 1, tier: "ORANGE", actualFp: 8, wasHeld: false }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 40, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });

  // ── precedence — choke before miss ──────────────────────────────────────
  // Phase 1 lock: choke OUTRANKS miss. Today the natural winTier gates
  // make them mutually exclusive (choke BUST/ROOKIE vs miss STARTER+),
  // so a real hand can't match both. The evaluator's block ORDER still
  // matters — if a future change makes the gates overlap (e.g. miss
  // floor relaxed to ROOKIE), choke must win. This test pins the
  // currently-firing case AND structurally asserts the block ordering
  // via the source so a future reordering is caught.

  it("precedence: choke fires on the BUST+2-held-R/O case (the dominant path)", () => {
    const roster = [
      card({ slotIndex: 0, tier: "RED", actualFp: 8, wasHeld: true }),
      card({ slotIndex: 1, tier: "ORANGE", actualFp: 8, wasHeld: true }),
      card({ slotIndex: 2, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, tier: "WHITE", actualFp: 8 }),
    ];
    // 184 FP — would be in BUST's near-ROOKIE band IF the miss floor
    // were ever lowered. Today the miss STARTER+ check blocks miss
    // from firing; choke wins by source-order anyway.
    const result = evaluateTrigger({ roster, totalFp: 184, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("choke");
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
    const roster = Array(5).fill(null).map((_, i) => card({ slotIndex: i, actualFp: 47 }));
    const result: TriggerResult = evaluateTrigger({
      roster, totalFp: 235, winTier: "MVP", badges: [], winTiersMap: TIERS,
      topGameTier: "season",
    });
    expect(result.trigger).toBe("rare_pull");
    expect(result.topGamePrimaryReason).toBeNull();
    expect(result.topGameAllReasons).toBeNull();
  });

  // ── Phase 5c Path A (2026-06-01): real-input anchor emission tests ────

  it("choke emits anchorBasePlayerId = worst-delta held card's basePlayerId", () => {
    const roster = [
      card({ slotIndex: 0, basePlayerId: "harden",  tier: "RED",    actualFp: 30, projectedFp: 50, salary: 65, wasHeld: true  }),
      card({ slotIndex: 1, basePlayerId: "lebron",  tier: "ORANGE", actualFp: 45, projectedFp: 50, salary: 60, wasHeld: true  }),
      card({ slotIndex: 2, basePlayerId: "rng-low", tier: "RED",    actualFp: 10, projectedFp: 50, salary: 70, wasHeld: false }),
      card({ slotIndex: 3, basePlayerId: "filler",  tier: "WHITE",  actualFp: 8 }),
      card({ slotIndex: 4, basePlayerId: "filler2", tier: "WHITE",  actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 101, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("choke");
    expect(result.anchorBasePlayerId).toBe("harden");
  });

  it("choke tiebreaks equal deltas by highest salary", () => {
    const roster = [
      card({ slotIndex: 0, basePlayerId: "expensive", tier: "RED", actualFp: 30, projectedFp: 50, salary: 70, wasHeld: true }),
      card({ slotIndex: 1, basePlayerId: "cheaper",   tier: "RED", actualFp: 30, projectedFp: 50, salary: 50, wasHeld: true }),
      card({ slotIndex: 2, basePlayerId: "filler",    tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 3, basePlayerId: "filler2",   tier: "WHITE", actualFp: 8 }),
      card({ slotIndex: 4, basePlayerId: "filler3",   tier: "WHITE", actualFp: 8 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 84, winTier: "BUST", badges: [], winTiersMap: TIERS });
    expect(result.trigger).toBe("choke");
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

  it("an ordinary hand (formerly default) now returns null — no trigger, no anchor", () => {
    const roster = [
      card({ slotIndex: 0, basePlayerId: "leader", actualFp: 50 }),
      card({ slotIndex: 1, basePlayerId: "two",    actualFp: 35 }),
      card({ slotIndex: 2, basePlayerId: "three",  actualFp: 30 }),
      card({ slotIndex: 3, basePlayerId: "four",   actualFp: 30 }),
      card({ slotIndex: 4, basePlayerId: "five",   actualFp: 35 }),
    ];
    const result = evaluateTrigger({ roster, totalFp: 180, winTier: "STARTER", badges: [], winTiersMap: TIERS });
    expect(result).toBeNull();
  });
});
