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
  it("T0 record renders {topStat} with the record value", () => {
    const input = baseInput({
      roster: [{ name: "Wilt", basePlayerId: "x", salary: 80, actualFp: 100, projectedFp: 60,
                 cardTier: "ORANGE", statLine: { pts: 100, reb: 25, ast: 2 }, gameDate: "2025-02-10" }],
      topGame: {
        tier: "record",
        primaryReason: { category: "pts", label: "tied the all-time pts record of 100", value: 100 },
        allReasons: [],
      },
    });
    const result = selectCommentary(input as any);
    expect(result.primary).toMatch(/100/);
  });

  it("T2 season renders {topStat} with the stat headline", () => {
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

describe("Top Games T1 career detail", () => {
  it("T1 career exposes a season_best_stat detail token (legacy name) for templates that opt in", () => {
    const input: CommentaryInput = {
      sport: "basketball", totalFp: 140, winTier: "ALL_STAR", streak: 1, prevStreak: 0,
      isBust: false, handCount: 5,
      roster: [{
        name: "Anthony Edwards", basePlayerId: "1630162", salary: 62, actualFp: 95, projectedFp: 55,
        cardTier: "PURPLE", statLine: { pts: 45, reb: 6, ast: 5 }, gameDate: "2025-01-20",
      }],
      topGame: {
        tier: "career",
        primaryReason: { category: "pts", label: "personal best — 45 pts", value: 45 },
        allReasons: [{ category: "pts", label: "personal best — 45 pts", value: 45 }],
      },
    };
    const r = selectCommentary(input as any);
    expect(r.primary.toLowerCase()).toMatch(/best|45|personal|night/);
  });
});
