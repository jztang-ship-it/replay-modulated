// shared/utils/__tests__/computeSalience.test.ts
//
// Phase 4 Pass 1 (lock §3 — SALIENCE COMPUTATION). Pins the actual math:
// per-stat FP ranking across the roster, choke's primaryDragPlayer
// (held shortfall), the per-trigger filters (miss strips primaryNegative,
// rare_pull returns undefined), and the no-signal fallback.

import { describe, expect, it } from "vitest";
import { computeSalience, fpStatKeysForSport } from "../computeSalience";
import type { CommentaryFactsCard } from "@shared/commentary/commentaryFacts";

function card(over: Partial<CommentaryFactsCard> = {}): CommentaryFactsCard {
  return {
    basePlayerId: "ANY",
    name: "Any Player",
    tier: "RED",
    team: "MIA",
    actualFp: 30,
    projectedFp: 40,
    wasHeld: true,
    statLine: { pts: 20, reb: 5, ast: 5 },
    ...over,
  };
}

// ── sport lookup ───────────────────────────────────────────────────────────

describe("fpStatKeysForSport", () => {
  it("returns the basketball FP-component key set", () => {
    const keys = fpStatKeysForSport("basketball");
    expect(keys).toEqual(expect.arrayContaining(["pts", "reb", "ast", "stl", "blk", "turnovers"]));
    // Off-formula keys must NOT be in the allowlist.
    expect(keys).not.toContain("min");
    expect(keys).not.toContain("threes");
  });

  it("returns null for sports not wired yet (forward-compat)", () => {
    expect(fpStatKeysForSport("football")).toBeNull();
    expect(fpStatKeysForSport("baseball")).toBeNull();
  });
});

// ── primaryPositive / primaryNegative ranking ─────────────────────────────

describe("computeSalience — per-stat FP contribution rank", () => {
  it("big_score · Curry-shaped hand → primaryPositive=pts; primaryNegative absent (no turnovers)", () => {
    const { salience } = computeSalience("big_score", "basketball", [
      card({
        basePlayerId: "201939",
        name: "Stephen Curry",
        actualFp: 65.5,
        projectedFp: 45,
        statLine: { pts: 42, reb: 5, ast: 7, stl: 1, blk: 0, min: 35, threes: 9 },
      }),
    ]);
    expect(salience).toBeDefined();
    // Highest FP contribution: pts (42 × 1.0 = 42); ast (7 × 1.5 = 10.5); reb (5 × 1.2 = 6); stl (1 × 2.0 = 2).
    expect(salience?.primaryPositive?.category).toBe("pts");
    // .value still carries FP CONTRIBUTION (for downstream computation /
    // joins); .label is the model-facing concept ("42 points").
    expect(salience?.primaryPositive?.value).toBe(42);
    expect(salience?.primaryPositive?.label).toBe("42 points");
    // No turnovers → no negative.
    expect(salience?.primaryNegative).toBeUndefined();
    expect(salience?.primaryDragPlayer).toBeUndefined();
  });

  it("primaryNegative surfaces when turnovers are present (typical big_score)", () => {
    const { salience } = computeSalience("big_score", "basketball", [
      card({
        basePlayerId: "977",
        name: "Kobe Bryant",
        actualFp: 50,
        projectedFp: 45,
        statLine: { pts: 40, reb: 6, ast: 4, stl: 1, blk: 0, turnovers: 3 },
      }),
    ]);
    expect(salience?.primaryNegative?.category).toBe("turnovers");
    // .value stays signed (-3 FP contribution); .label is unsigned —
    // sign is conveyed by the MOST IMPORTANT NEGATIVE header in the
    // SALIENCE block.
    expect(salience?.primaryNegative?.value).toBe(-3);
    expect(salience?.primaryNegative?.label).toBe("3 turnovers");
  });

  it("uses singular concept word when raw count is exactly 1 (1 turnover / 1 steal / 1 block / 1 assist)", () => {
    const { salience } = computeSalience("big_score", "basketball", [
      card({
        statLine: { pts: 30, reb: 5, ast: 1, stl: 0, blk: 0, turnovers: 1 },
      }),
    ]);
    // Highest positive among present stats: pts=30 wins; the singular
    // case is exercised on the negative (turnovers=1) and rendered as
    // "1 turnover" (not "1 turnovers").
    expect(salience?.primaryPositive?.label).toBe("30 points");
    expect(salience?.primaryNegative?.label).toBe("1 turnover");
  });

  it("hand-level (not anchor-only): sums contributions across all cards", () => {
    // Two-card hand. Player A drives pts; Player B drives ast. The
    // hand-level pts contribution (45 + 12 = 57 FP) should still beat
    // the hand-level ast contribution (3*1.5 + 10*1.5 = 19.5 FP) —
    // verifying we sum across the roster, not just look at one card.
    const { salience } = computeSalience("big_score", "basketball", [
      card({ basePlayerId: "A", statLine: { pts: 45, reb: 5, ast: 3 } }),
      card({ basePlayerId: "B", statLine: { pts: 12, reb: 8, ast: 10 } }),
    ]);
    expect(salience?.primaryPositive?.category).toBe("pts");
    expect(salience?.primaryPositive?.value).toBe(57);
  });
});

// ── miss filter ───────────────────────────────────────────────────────────

describe("computeSalience — miss strips primaryNegative", () => {
  it("miss → primaryPositive set, primaryNegative undefined even with turnovers", () => {
    const { salience } = computeSalience("miss", "basketball", [
      card({
        statLine: { pts: 25, reb: 3, ast: 2, stl: 1, blk: 0, turnovers: 4 },
      }),
    ]);
    expect(salience?.primaryPositive?.category).toBe("pts");
    expect(salience?.primaryNegative).toBeUndefined();
    expect(salience?.primaryDragPlayer).toBeUndefined();
  });
});

// ── choke + primaryDragPlayer ─────────────────────────────────────────────

describe("computeSalience — choke also computes primaryDragPlayer", () => {
  it("picks the HELD card with the largest negative (actualFp - projectedFp)", () => {
    const { salience } = computeSalience("choke", "basketball", [
      // Held; mild shortfall.
      card({
        basePlayerId: "977",
        name: "Kobe Bryant",
        wasHeld: true,
        actualFp: 28,
        projectedFp: 35,
      }),
      // Held; bigger shortfall — should win.
      card({
        basePlayerId: "101108",
        name: "Chris Paul",
        wasHeld: true,
        actualFp: 15,
        projectedFp: 38.5,
      }),
      // Not held — must be ignored even with worse shortfall.
      card({
        basePlayerId: "201142",
        name: "Other Player",
        wasHeld: false,
        actualFp: 5,
        projectedFp: 50,
      }),
    ]);
    expect(salience?.primaryDragPlayer?.basePlayerId).toBe("101108");
    expect(salience?.primaryDragPlayer?.name).toBe("Chris Paul");
    expect(salience?.primaryDragPlayer?.shortfall).toBe(-23.5);
  });

  it("primaryDragPlayer is omitted when no held card underperformed (bench-drag choke)", () => {
    const { salience } = computeSalience("choke", "basketball", [
      // All held cards delivered at or above projection.
      card({
        basePlayerId: "977",
        wasHeld: true,
        actualFp: 35,
        projectedFp: 32,
        statLine: { pts: 30, reb: 3, ast: 2 },
      }),
    ]);
    // No held shortfall → no primaryDragPlayer.
    expect(salience?.primaryDragPlayer).toBeUndefined();
    // primaryPositive should still be computed.
    expect(salience?.primaryPositive?.category).toBe("pts");
  });

  it("non-choke triggers never get primaryDragPlayer", () => {
    const { salience: bs } = computeSalience("big_score", "basketball", [
      card({ wasHeld: true, actualFp: 5, projectedFp: 50 }),
    ]);
    expect(bs?.primaryDragPlayer).toBeUndefined();
    const { salience: ms } = computeSalience("miss", "basketball", [
      card({ wasHeld: true, actualFp: 5, projectedFp: 50 }),
    ]);
    expect(ms?.primaryDragPlayer).toBeUndefined();
  });
});

// ── rare_pull omission ────────────────────────────────────────────────────

describe("computeSalience — rare_pull omitted", () => {
  it("rare_pull → returns { salience: undefined }", () => {
    const { salience } = computeSalience("rare_pull", "basketball", [
      card({ statLine: { pts: 48, reb: 10, ast: 8, stl: 4, blk: 6 } }),
    ]);
    expect(salience).toBeUndefined();
  });
});

// ── sport fallback ────────────────────────────────────────────────────────

describe("computeSalience — sports without wired weights", () => {
  it("football → { salience: undefined } (no wired FP helper)", () => {
    const { salience } = computeSalience("big_score", "football", [
      card({ statLine: { pts: 30, reb: 5 } }),
    ]);
    expect(salience).toBeUndefined();
  });
});

// ── no-signal fallback ────────────────────────────────────────────────────

describe("computeSalience — empty / zero-stat hands", () => {
  it("returns { salience: undefined } when no card has a statLine", () => {
    const { salience } = computeSalience("big_score", "basketball", [
      card({ statLine: undefined }),
    ]);
    expect(salience).toBeUndefined();
  });

  it("returns { salience: undefined } when every weighted stat is zero", () => {
    const { salience } = computeSalience("big_score", "basketball", [
      card({ statLine: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, turnovers: 0 } }),
    ]);
    expect(salience).toBeUndefined();
  });
});
