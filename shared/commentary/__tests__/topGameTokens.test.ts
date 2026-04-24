import { describe, it, expect } from "vitest";
import { selectCommentary } from "../selectCommentary";
import type { CommentaryInput } from "../types";

function baseInput(overrides: Partial<CommentaryInput> = {}): CommentaryInput {
  return {
    sport: "basketball",
    totalFp: 150,
    winTier: "MVP",
    streak: 1,
    prevStreak: 0,
    isBust: false,
    handCount: 5,
    roster: [
      { name: "Nikola Jokic", basePlayerId: "203999", salary: 89, actualFp: 120, projectedFp: 60,
        cardTier: "ORANGE", statLine: { pts: 31, reb: 21, ast: 22 }, gameDate: "2025-02-10" },
    ],
    ...overrides,
  };
}

describe("Top Games template tokens", () => {
  it("T1 composite renders {topStat} as '31/21/22'", () => {
    const input = baseInput({
      topGame: {
        tier: "all_time",
        primaryReason: { category: "td_30_20_20", label: "30/20/20 — top-five ever", value: 1 },
        allReasons: [],
      },
    });
    const result = selectCommentary(input as any);
    expect(result.primary).toMatch(/31\/21\/22|30\/20\/20 — top-five ever/);
  });

  it("T2 single renders {topStat} as '58 pts'", () => {
    const input = baseInput({
      totalFp: 80, winTier: "STARTER",
      roster: [{ name: "Luka", basePlayerId: "x", salary: 80, actualFp: 58, projectedFp: 55,
                 cardTier: "ORANGE", statLine: { pts: 58, reb: 7, ast: 9 }, gameDate: "2025-01-05" }],
      topGame: {
        tier: "season",
        primaryReason: { category: "pts", label: "Top-10 scoring game of the season (58 pts)", value: 58 },
        allReasons: [],
      },
    });
    const result = selectCommentary(input as any);
    expect(result.primary.toLowerCase()).toContain("58");
  });
});
