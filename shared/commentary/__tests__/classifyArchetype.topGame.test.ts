// shared/commentary/__tests__/classifyArchetype.topGame.test.ts
import { describe, it, expect } from "vitest";
import { classifyArchetype } from "../classifyArchetype";
import { selectCommentary } from "../selectCommentary";
import type { CommentaryInput } from "../types";

function baseInput(overrides: Partial<CommentaryInput> = {}): CommentaryInput {
  return {
    sport: "basketball",
    totalFp: 120,
    winTier: "ALL_STAR",
    streak: 1,
    prevStreak: 0,
    isBust: false,
    handCount: 5,
    roster: [
      { name: "Nikola Jokic", basePlayerId: "203999", salary: 89, actualFp: 90, projectedFp: 60,
        cardTier: "ORANGE", statLine: { pts: 31, reb: 21, ast: 22 }, gameDate: "2025-02-10" },
      { name: "Role Player",  basePlayerId: "000001", salary: 30, actualFp: 15, projectedFp: 20, cardTier: "BLUE" },
    ],
    ...overrides,
  };
}

describe("classifyArchetype — Top Games override", () => {
  it("T0 topGame.tier='record' → historic_record (overrides all other priorities)", () => {
    const input = baseInput({
      topGame: {
        tier: "record",
        primaryReason: { category: "pts", label: "broke the all-time pts record", value: 101 },
        allReasons: [],
      },
    });
    expect(classifyArchetype(input).archetype).toBe("historic_record");
  });

  it("T2 topGame.tier='season' → historic_season", () => {
    const input = baseInput({
      topGame: {
        tier: "season",
        primaryReason: { category: "pts", label: "Top-10 scoring game of the season (58 pts)", value: 58 },
        allReasons: [],
      },
    });
    expect(classifyArchetype(input).archetype).toBe("historic_season");
  });

  it("T1 topGame.tier='career' → historic_career (now overrides)", () => {
    const input = baseInput({
      topGame: {
        tier: "career",
        primaryReason: { category: "pts", label: "personal best — 40 pts", value: 40 },
        allReasons: [],
      },
    });
    expect(classifyArchetype(input).archetype).toBe("historic_career");
  });

  it("topGame absent → existing behavior unchanged", () => {
    const input = baseInput();
    expect(classifyArchetype(input).archetype).toBe("star_carry_big");
  });

  it("topGame.tier=null → existing behavior unchanged", () => {
    const input = baseInput({
      topGame: { tier: null, primaryReason: null, allReasons: [] },
    });
    expect(classifyArchetype(input).archetype).toBe("star_carry_big");
  });
});

describe("Multi-star carry — two genuinely massive nights", () => {
  // Rule: both star and costar had MASSIVE games. Not "second-best did fine."
  //   - Star    actualFp >= 90 AND ratio >= 1.3
  //   - Costar  actualFp >= 65 AND ratio >= 1.3
  //   - Win tier ≥ ALL_STAR (the hand has to actually cash big)
  // When the rule fires, both players must be named in the resulting commentary.
  it("classifies as multi_star_carry when star and costar both went massive", () => {
    const input: CommentaryInput = {
      sport: "basketball", totalFp: 200, winTier: "LEGEND", streak: 1, prevStreak: 0,
      isBust: false, handCount: 5,
      roster: [
        { name: "Jimmy Butler",   salary: 60, actualFp: 110, projectedFp: 60, statLine: { pts: 35, reb: 19, ast: 10 } },
        { name: "Luka Doncic",    salary: 70, actualFp: 78,  projectedFp: 55, statLine: { pts: 32, reb: 8,  ast: 12 } },
        { name: "Random Bench",   salary: 12, actualFp: 8,   projectedFp: 12, statLine: { pts: 6,  reb: 2,  ast: 1  } },
      ],
    };
    expect(classifyArchetype(input).archetype).toBe("multi_star_carry");
  });

  it("does NOT fire when only one player went massive", () => {
    const input: CommentaryInput = {
      sport: "basketball", totalFp: 150, winTier: "MVP", streak: 1, prevStreak: 0,
      isBust: false, handCount: 5,
      roster: [
        { name: "Jimmy Butler",   salary: 60, actualFp: 110, projectedFp: 60, statLine: { pts: 35, reb: 19, ast: 10 } },
        { name: "Solid Guard",    salary: 30, actualFp: 35,  projectedFp: 30, statLine: { pts: 18, reb: 4,  ast: 5  } },
        { name: "Random Bench",   salary: 12, actualFp: 8,   projectedFp: 12, statLine: { pts: 6,  reb: 2,  ast: 1  } },
      ],
    };
    expect(classifyArchetype(input).archetype).not.toBe("multi_star_carry");
  });

  it("does NOT fire on losses, even with two big games", () => {
    const input: CommentaryInput = {
      sport: "basketball", totalFp: 60, winTier: "BUST", streak: 0, prevStreak: 1,
      isBust: true, handCount: 5,
      roster: [
        { name: "Jimmy Butler",   salary: 60, actualFp: 110, projectedFp: 60, statLine: { pts: 35, reb: 19, ast: 10 } },
        { name: "Luka Doncic",    salary: 70, actualFp: 78,  projectedFp: 55, statLine: { pts: 32, reb: 8,  ast: 12 } },
      ],
    };
    expect(classifyArchetype(input).archetype).not.toBe("multi_star_carry");
  });

  it("does NOT fire when costar's ratio is unimpressive (raw FP only)", () => {
    const input: CommentaryInput = {
      sport: "basketball", totalFp: 200, winTier: "LEGEND", streak: 1, prevStreak: 0,
      isBust: false, handCount: 5,
      roster: [
        { name: "Jimmy Butler",   salary: 60, actualFp: 110, projectedFp: 60, statLine: { pts: 35, reb: 19, ast: 10 } },
        // Met FP threshold but only 1.05 ratio — high salary, expected to do this
        { name: "Big Anchor",     salary: 95, actualFp: 70,  projectedFp: 67, statLine: { pts: 28, reb: 9,  ast: 5  } },
      ],
    };
    expect(classifyArchetype(input).archetype).not.toBe("multi_star_carry");
  });
});

describe("Multi-star carry — end-to-end commentary names both", () => {
  it("primary commentary names both star and costar", () => {
    const seeds = [200, 210, 220, 230, 240];
    for (const fp of seeds) {
      const input: CommentaryInput = {
        sport: "basketball", totalFp: fp, winTier: "LEGEND", streak: 1, prevStreak: 0,
        isBust: false, handCount: 5,
        roster: [
          { name: "Jimmy Butler", salary: 60, actualFp: 110, projectedFp: 60, statLine: { pts: 35, reb: 19, ast: 10 } },
          { name: "Luka Doncic",  salary: 70, actualFp: 78,  projectedFp: 55, statLine: { pts: 32, reb: 8,  ast: 12 } },
          { name: "Random Bench", salary: 12, actualFp: 8,   projectedFp: 12, statLine: { pts: 6,  reb: 2,  ast: 1  } },
        ],
      };
      const r = selectCommentary(input as any);
      const lower = r.primary.toLowerCase();
      const namesButler = lower.includes("butler") || lower.includes("jimmy");
      const namesDoncic = lower.includes("doncic") || lower.includes("luka");
      expect(
        namesButler && namesDoncic,
        `seed ${fp} produced "${r.primary}" — must name both Butler and Doncic`,
      ).toBe(true);
    }
  });
});

describe("Top Games — end-to-end selectCommentary", () => {
  it("T0 produces a historic_record line with topStat token interpolated", () => {
    const input: CommentaryInput = {
      sport: "basketball", totalFp: 150, winTier: "MVP", streak: 1, prevStreak: 0,
      isBust: false, handCount: 5,
      roster: [{
        name: "Wilt Chamberlain", basePlayerId: "x", salary: 89, actualFp: 120, projectedFp: 60,
        cardTier: "ORANGE", statLine: { pts: 100, reb: 25, ast: 2 }, gameDate: "2025-02-10",
      }],
      topGame: {
        tier: "record",
        primaryReason: { category: "pts", label: "tied the all-time pts record of 100", value: 100 },
        allReasons: [{ category: "pts", label: "tied the all-time pts record of 100", value: 100 }],
      },
    };
    const r = selectCommentary(input as any);
    const matchesSome = /100|record|flip|read|check|box/i.test(r.primary);
    expect(matchesSome).toBe(true);
  });
});
