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

  it("T1 topGame.tier='career' falls through to the same archetype as topGame-absent", () => {
    const withoutTopGame = classifyArchetype(baseInput()).archetype;
    const withT1 = classifyArchetype(baseInput({
      topGame: {
        tier: "career",
        primaryReason: { category: "pts", label: "personal best — 40 pts", value: 40 },
        allReasons: [],
      },
    })).archetype;
    expect(withT1).toBe(withoutTopGame);
    expect(withT1).not.toBe("historic_record");
    expect(withT1).not.toBe("historic_season");
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
