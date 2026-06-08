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
    // joins); .label is the model-facing concept ("42 points from your held lineup").
    expect(salience?.primaryPositive?.value).toBe(42);
    expect(salience?.primaryPositive?.label).toBe("42 points from your held lineup");
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
    expect(salience?.primaryNegative?.label).toBe("3 turnovers from your held lineup");
  });

  it("uses singular concept word when raw count is exactly 1 (1 turnover / 1 steal / 1 block / 1 assist)", () => {
    const { salience } = computeSalience("big_score", "basketball", [
      card({
        statLine: { pts: 30, reb: 5, ast: 1, stl: 0, blk: 0, turnovers: 1 },
      }),
    ]);
    // Highest positive among present stats: pts=30 wins; the singular
    // case is exercised on the negative (turnovers=1) and rendered as
    // "1 turnover from your held lineup" (not "1 turnovers").
    expect(salience?.primaryPositive?.label).toBe("30 points from your held lineup");
    expect(salience?.primaryNegative?.label).toBe("1 turnover from your held lineup");
  });

  it("held-level (not anchor-only): sums contributions across HELD cards", () => {
    // Phase 4 Pass 1 held-only fix (was "hand-level... across all
    // cards"). Two-card hand, BOTH HELD via the card() factory's
    // wasHeld:true default. Player A drives pts; Player B drives ast.
    // Held-only pts contribution (45 + 12 = 57 FP) beats held-only
    // ast contribution (3*1.5 + 10*1.5 = 19.5 FP) — verifying we sum
    // across the HELD subset, not just one card.
    const { salience } = computeSalience("big_score", "basketball", [
      card({ basePlayerId: "A", wasHeld: true, statLine: { pts: 45, reb: 5, ast: 3 } }),
      card({ basePlayerId: "B", wasHeld: true, statLine: { pts: 12, reb: 8, ast: 10 } }),
    ]);
    expect(salience?.primaryPositive?.category).toBe("pts");
    expect(salience?.primaryPositive?.value).toBe(57);
  });

  it("HELD-ONLY: unheld cards' stats do NOT contribute to primaryPositive / primaryNegative", () => {
    // Phase 4 Pass 1 held-only-fix regression test (lock §4 item 2).
    // Reproduces the real on-glass bug: the "Fourteen turnovers killed
    // this before Bosh could matter." choke headline against
    // challenge c3b8247b… — only 3 turnovers came from the user's two
    // held cards (Bosh 2 + Jefferson 1); the other 11 turnovers came
    // from bench cards the user cut (Duncan alone had 6). The
    // narrative SALIENCE block must reflect the user's DECISIONS (the
    // held cards), not the all-cards box score (which is the FP-score
    // scope, not the narrative scope).
    //
    // Held subset for this test:
    //   Bosh:      2 TO,  12 pts → contributes pts +12, turnovers −2
    //   Jefferson: 1 TO,  27 pts → contributes pts +27, turnovers −1
    //   held totals: pts 39, turnovers 3
    //
    // Bench (must be ignored):
    //   Duncan: 6 TO  ← largest single-card negative; pre-fix would
    //                   have dominated the negative aggregate
    //   Jack:   3 TO
    //   Arthur: 1 TO
    //   Speights: 1 TO
    //   bench would have added: pts +37, turnovers −11
    //
    // Expected (post-fix): primaryPositive = "39 points from your held lineup";
    //                      primaryNegative = "3 turnovers from your held lineup" (NOT 14).
    // Pre-fix this test FAILS because the all-cards aggregate would
    // surface primaryPositive.value=76 and primaryNegative.label="14
    // turnovers" — verified by removing the wasHeld guard locally and
    // observing the assertion deltas.
    const { salience } = computeSalience("choke", "basketball", [
      card({ basePlayerId: "2547", name: "Chris Bosh",   wasHeld: true,
             actualFp: 27.8, projectedFp: 39.9,
             statLine: { pts: 12, reb: 9, ast: 2, stl: 2, blk: 0, turnovers: 2 } }),
      card({ basePlayerId: "2744", name: "Al Jefferson", wasHeld: true,
             actualFp: 51.5, projectedFp: 41.7,
             statLine: { pts: 27, reb: 5, ast: 5, stl: 2, blk: 3, turnovers: 1 } }),
      card({ basePlayerId: "1717", name: "Tim Duncan",   wasHeld: false,
             actualFp: 15.8, projectedFp: 39.6,
             statLine: { pts: 14, reb: 9, ast: 2, stl: 0, blk: 0, turnovers: 6 } }),
      card({ basePlayerId: "201571", name: "Jarrett Jack", wasHeld: false,
             actualFp: 24.4, projectedFp: 23.6,
             statLine: { pts: 13, reb: 7, ast: 4, stl: 0, blk: 0, turnovers: 3 } }),
      card({ basePlayerId: "201589", name: "Darrell Arthur", wasHeld: false,
             actualFp: 5.2, projectedFp: 14,
             statLine: { pts: 3, reb: 1, ast: 0, stl: 1, blk: 0, turnovers: 1 } }),
      card({ basePlayerId: "201578", name: "Marreese Speights", wasHeld: false,
             actualFp: 15.6, projectedFp: 14.2,
             statLine: { pts: 7, reb: 3, ast: 0, stl: 1, blk: 2, turnovers: 1 } }),
    ]);
    // Held-only positive: pts wins (39 from Bosh+Jefferson, NOT 76 all-cards).
    expect(salience?.primaryPositive?.category).toBe("pts");
    expect(salience?.primaryPositive?.value).toBe(39);
    expect(salience?.primaryPositive?.label).toBe("39 points from your held lineup");
    // The critical regression assertion: held-only negative is 3
    // turnovers (Bosh 2 + Jefferson 1), NOT 14 (the all-cards sum).
    expect(salience?.primaryNegative?.category).toBe("turnovers");
    expect(salience?.primaryNegative?.value).toBe(-3);
    expect(salience?.primaryNegative?.label).toBe("3 turnovers from your held lineup");
    // The narrative's better "why" for this choke is the held shortfall —
    // Bosh delivered 27.8 vs projected 39.9 (-12.1) while Jefferson over-
    // performed (+9.8) — so primaryDragPlayer correctly surfaces Bosh.
    expect(salience?.primaryDragPlayer?.basePlayerId).toBe("2547");
    expect(salience?.primaryDragPlayer?.name).toBe("Chris Bosh");
    expect(salience?.primaryDragPlayer?.shortfall).toBe(-12.1);
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

// ── RD0 — held-lineup scope baked into the aggregate label ────────────────
//
// The rankPerStat filter (`if (c.wasHeld !== true) continue;`) makes the
// aggregate a held-lineup sum — not one player, not drawn/cut cards.
// magnitudeLabel names that scope verbatim so the voice contract's
// ATTRIBUTION rule can lean on the label rather than policing attribution
// in prose. The named drag signal (primaryDragPlayer) stays
// player-attributed; only the aggregate (positive/negative) is scoped.

describe("RD0 — aggregate label names the held-lineup scope", () => {
  it("primaryPositive.label is scoped 'from your held lineup'", () => {
    const { salience } = computeSalience("big_score", "basketball", [
      card({ statLine: { pts: 42, reb: 5, ast: 7 } }),
    ]);
    expect(salience?.primaryPositive?.label).toMatch(/from your held lineup$/);
  });

  it("primaryNegative.label is scoped 'from your held lineup'", () => {
    const { salience } = computeSalience("big_score", "basketball", [
      card({ statLine: { pts: 40, reb: 6, ast: 4, stl: 1, blk: 0, turnovers: 3 } }),
    ]);
    expect(salience?.primaryNegative?.label).toMatch(/from your held lineup$/);
  });

  it("primaryDragPlayer stays player-attributed (no held-lineup phrase on the named drag)", () => {
    const { salience } = computeSalience("choke", "basketball", [
      card({ basePlayerId: "977", name: "Kobe Bryant", wasHeld: true,
             actualFp: 15, projectedFp: 38.5,
             statLine: { pts: 12, reb: 3, ast: 2, stl: 0, blk: 0, turnovers: 4 } }),
    ]);
    expect(salience?.primaryDragPlayer?.name).toBe("Kobe Bryant");
    // primaryDragPlayer is a structured object (basePlayerId/name/shortfall);
    // there is no .label to scope. The held-lineup phrase belongs only to
    // the aggregate (primaryPositive/primaryNegative) so the named drag
    // stays a clean player-level signal.
    expect((salience?.primaryDragPlayer as any)?.label).toBeUndefined();
  });

  it("the scope phrase reads exactly 'from your held lineup' (not 'across the hand')", () => {
    // Spec lock: 'across the hand' reads as all cards (it isn't —
    // rankPerStat is held-only). Pin the literal phrase.
    const { salience } = computeSalience("big_score", "basketball", [
      card({ statLine: { pts: 30, reb: 5, ast: 5 } }),
    ]);
    expect(salience?.primaryPositive?.label).toContain("from your held lineup");
    expect(salience?.primaryPositive?.label).not.toContain("across the hand");
  });
});
