import { classifyArchetype } from "../classifyArchetype";
import type { CommentaryInput, CommentaryRosterCard } from "../types";

function makeCard(overrides: Partial<CommentaryRosterCard> = {}): CommentaryRosterCard {
  return {
    name: "Test Player",
    salary: 50,
    actualFp: 40,
    projectedFp: 30,
    cardTier: "ORANGE",
    statLine: { pts: 30, reb: 8, ast: 5, stl: 1, blk: 1, turnovers: 2 },
    achievements: [],
    extremeFlags: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<CommentaryInput> = {}): CommentaryInput {
  return {
    sport: "basketball",
    totalFp: 200,
    winTier: "STARTER",
    nextTier: "ALL_STAR",
    tierFloor: 168,
    nextTierMin: 188,
    streak: 0,
    prevStreak: 0,
    isBust: false,
    handCount: 1,
    roster: [makeCard()],
    ...overrides,
  };
}

describe("classifyArchetype", () => {
  test("career_night fires for tier 1 extreme on star", () => {
    const card = makeCard({
      extremeFlags: [{ type: "god_mode_pts", tier: 1, priority: 100, headline: "50+ pts", keyStat: "pts", value: 55 }],
    });
    expect(classifyArchetype(makeInput({ roster: [card] })).archetype).toBe("career_night");
  });

  test("badge_explosion fires for multi-stat rare badge", () => {
    const card = makeCard({
      achievements: [{ id: "TRIPLE_DBL", label: "Triple Double" }],
    });
    expect(classifyArchetype(makeInput({ roster: [card] })).archetype).toBe("badge_explosion");
  });

  test("near_miss fires for loss within 5 FP of ROOKIE", () => {
    const result = classifyArchetype(makeInput({
      isBust: true, totalFp: 145, nextTierMin: 148, winTier: "BUST",
    }));
    expect(result.archetype).toBe("near_miss");
    expect(result.nearMiss).toBe(true);
  });

  test("collapse fires for loss after streak with big gap", () => {
    const result = classifyArchetype(makeInput({
      isBust: true, totalFp: 120, nextTierMin: 148, prevStreak: 4, winTier: "BUST",
    }));
    expect(result.archetype).toBe("collapse");
  });

  test("star_carry_big fires for high-ratio win at high tier", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    expect(classifyArchetype(makeInput({ roster: [card], winTier: "ALL_STAR" })).archetype).toBe("star_carry_big");
  });

  test("star_carry fires for high-ratio win at low tier", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    expect(classifyArchetype(makeInput({ roster: [card], winTier: "STARTER" })).archetype).toBe("star_carry");
  });

  test("star_carried_loss fires for high-ratio loss", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    expect(classifyArchetype(makeInput({ roster: [card], isBust: true, winTier: "BUST" })).archetype).toBe("star_carried_loss");
  });

  test("star_failed fires for very low ratio loss", () => {
    const card = makeCard({ actualFp: 15, projectedFp: 40 });
    expect(classifyArchetype(makeInput({
      roster: [card], isBust: true, winTier: "BUST", totalFp: 100, nextTierMin: 148,
    })).archetype).toBe("star_failed");
  });

  test("star_cold fires for moderate underperformance loss", () => {
    const card = makeCard({ actualFp: 22, projectedFp: 30 });
    expect(classifyArchetype(makeInput({
      roster: [card], isBust: true, winTier: "BUST", totalFp: 130, nextTierMin: 148,
    })).archetype).toBe("star_cold");
  });

  test("rookie_neutral preempts ugly_win for ROOKIE-tier wins", () => {
    // Per design: ROOKIE is the in-between tier (just above bust), not a
    // celebrated "win". ALL ROOKIE-tier wins route to rookie_neutral after
    // achievement / career-night / badge-explosion overrides have had their
    // shot, regardless of star ratio.
    const lowRatio = makeCard({ actualFp: 20, projectedFp: 30 });
    expect(classifyArchetype(makeInput({ roster: [lowRatio], winTier: "ROOKIE" })).archetype).toBe("rookie_neutral");
    const highRatio = makeCard({ actualFp: 50, projectedFp: 30 });
    expect(classifyArchetype(makeInput({ roster: [highRatio], winTier: "ROOKIE" })).archetype).toBe("rookie_neutral");
  });

  test("star_delivered fires for solid ratio win", () => {
    const card = makeCard({ actualFp: 35, projectedFp: 30 });
    expect(classifyArchetype(makeInput({ roster: [card] })).archetype).toBe("star_delivered");
  });

  test("everyone_flat is loss fallthrough", () => {
    const card = makeCard({ actualFp: 25, projectedFp: 30 });
    expect(classifyArchetype(makeInput({
      roster: [card], isBust: true, winTier: "BUST", totalFp: 130, nextTierMin: 148,
    })).archetype).toBe("everyone_flat");
  });

  test("balanced_win is win fallthrough", () => {
    const card = makeCard({ actualFp: 25, projectedFp: 30 });
    expect(classifyArchetype(makeInput({ roster: [card] })).archetype).toBe("balanced_win");
  });

  test("returns exactly one archetype (deterministic)", () => {
    const card = makeCard({ actualFp: 50, projectedFp: 30 });
    const r1 = classifyArchetype(makeInput({ roster: [card] }));
    const r2 = classifyArchetype(makeInput({ roster: [card] }));
    expect(r1.archetype).toBe(r2.archetype);
  });
});
