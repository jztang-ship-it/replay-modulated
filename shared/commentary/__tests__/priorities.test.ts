import { classifyArchetype } from "../classifyArchetype";
import type { CommentaryInput, CommentaryRosterCard } from "../types";

function makeCard(overrides: Partial<CommentaryRosterCard> = {}): CommentaryRosterCard {
  return {
    name: "Test Star", salary: 50, actualFp: 40, projectedFp: 30,
    cardTier: "ORANGE", statLine: { pts: 30, reb: 8, ast: 5 },
    achievements: [], extremeFlags: [], ...overrides,
  };
}

function makeInput(overrides: Partial<CommentaryInput> = {}): CommentaryInput {
  return {
    sport: "basketball", totalFp: 200, winTier: "STARTER",
    tierFloor: 168, nextTierMin: 188, streak: 0, prevStreak: 0,
    isBust: false, handCount: 1, roster: [makeCard()], ...overrides,
  };
}

describe("Priority Rules", () => {
  test("career_night beats badge_explosion (priority 1 > 2)", () => {
    const card = makeCard({
      extremeFlags: [{ type: "god_mode_pts", tier: 1, priority: 100, headline: "50+", keyStat: "pts", value: 55 }],
      achievements: [{ id: "TRIPLE_DBL", label: "Triple Double" }],
    });
    expect(classifyArchetype(makeInput({ roster: [card] })).archetype).toBe("career_night");
  });

  test("badge_explosion beats star_carry (priority 2 > 5)", () => {
    const card = makeCard({
      actualFp: 70, projectedFp: 40,
      achievements: [{ id: "TRIPLE_DBL", label: "Triple Double" }],
    });
    expect(classifyArchetype(makeInput({ roster: [card] })).archetype).toBe("badge_explosion");
  });

  test("near_miss beats star_failed in loss (priority 3 > 8)", () => {
    const card = makeCard({ actualFp: 15, projectedFp: 40 });
    expect(classifyArchetype(makeInput({
      roster: [card], isBust: true, winTier: "BUST", totalFp: 145, nextTierMin: 148,
    })).archetype).toBe("near_miss");
  });

  test("collapse beats star_cold (priority 4 > 9)", () => {
    const card = makeCard({ actualFp: 22, projectedFp: 30 });
    expect(classifyArchetype(makeInput({
      roster: [card], isBust: true, winTier: "BUST", totalFp: 120, nextTierMin: 148, prevStreak: 4,
    })).archetype).toBe("collapse");
  });

  test("star_carry_big requires high tier", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    expect(classifyArchetype(makeInput({ roster: [card], winTier: "STARTER" })).archetype).toBe("star_carry");
    expect(classifyArchetype(makeInput({ roster: [card], winTier: "ALL_STAR" })).archetype).toBe("star_carry_big");
  });

  test("streak does NOT override star narrative", () => {
    const card = makeCard({ actualFp: 70, projectedFp: 40 });
    expect(classifyArchetype(makeInput({
      roster: [card], streak: 5, prevStreak: 4,
    })).archetype).toBe("star_carry");
  });

  test("near_miss only triggers within 5 FP threshold", () => {
    const card = makeCard({ actualFp: 25, projectedFp: 30 });
    expect(classifyArchetype(makeInput({
      roster: [card], isBust: true, winTier: "BUST", totalFp: 142, nextTierMin: 148,
    })).archetype).not.toBe("near_miss");
  });
});
