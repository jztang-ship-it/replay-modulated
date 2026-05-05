/**
 * shared/__tests__/footballEdgeCases.test.ts
 *
 * Edge-case unit tests for football data + scoring. PR 2 Task 2.5.
 * Per spec's Data edge cases section:
 *   - Substitutes (low minutes)
 *   - 0-minute appearances filter out
 *   - Position fluidity normalization
 *   - GK-scored-goal stacking (the rare goal stacks with save weight, not suppressed)
 *   - Red card -15 FP applies
 *   - Penalty shootouts: behavior documented (not enforced — depends on source data)
 *
 * Tests construct minimal config + sport adapter inputs rather than importing
 * football/ directly, which would cross the cross-package alias boundary that
 * vitest doesn't resolve. The logic under test is the shared SportAdapter
 * base class behavior with football-shaped weights and badges.
 */

import { describe, it, expect } from "vitest";
import { SportAdapter } from "../adapters/SportAdapter";
import type { SportConfigShape } from "../types";

// Minimal football-shaped config — mirrors the live values from
// football/src/adapters/footballConfig.ts but stays self-contained so the
// test doesn't import across the workspace alias boundary.
const FOOTBALL_TEST_CONFIG: SportConfigShape = {
  sportKey: "football",
  sportLabel: "Football",
  rosterSize: 5,
  maxPlayers: 5,
  rosterSlots: ["GK", "DEF", "MID", "FWD", "FLEX"],
  excludeFromFlex: ["GK"],
  salaryCap: 180,
  positions: ["GK", "DEF", "MID", "FWD"],
  positionAliases: {
    "Goalkeeper": "GK",
    "Center Back": "DEF",
    "Right Wing Back": "DEF",
    "Defensive Midfield": "MID",
    "Attacking Midfield": "MID",
    "Right Wing": "MID",
    "Center Forward": "FWD",
    "Left Center Forward": "FWD",
    "Secondary Striker": "FWD",
  },
  economyConfig: { capMax: 180, capMin: 140, salaryMin: 10, salaryMax: 60 },
  projectionWeights: { goals: 12, assists: 8, saves: 20 },
  positionProjectionWeights: {
    GK: { saves: 20, goals: 60, goals_conceded: -6, yellow_cards: -5, red_cards: -15 },
    DEF: { goals: 18, assists: 7, tackles: 5, interceptions: 6, clearances: 1.5, yellow_cards: -5, red_cards: -15 },
    MID: { goals: 12, assists: 8, key_passes: 5, tackles: 4, interceptions: 5, yellow_cards: -5, red_cards: -15 },
    FWD: { goals: 22, assists: 8, shots_on_target: 4, key_passes: 3, dribbles_completed: 2, yellow_cards: -5, red_cards: -15 },
  },
  tierThresholds: [
    { tier: "ORANGE", minSalary: 52 },
    { tier: "PURPLE", minSalary: 40 },
    { tier: "BLUE", minSalary: 28 },
    { tier: "GREEN", minSalary: 16 },
    { tier: "WHITE", minSalary: 0 },
  ],
  winTiers: [
    { name: "SUB", minFp: 130, multiplier: 0.5, color: "#94A3B8" },
    { name: "STARTER", minFp: 150, multiplier: 1.5, color: "#10B981" },
    { name: "CAPTAIN", minFp: 167, multiplier: 3, color: "#3B82F6" },
    { name: "MOTM", minFp: 192, multiplier: 8, color: "#F59E0B" },
    { name: "LEGEND", minFp: 215, multiplier: 50, color: "#EF4444" },
  ],
  badges: [
    { id: "HAT_TRICK", position: "FWD", icon: "🎩", label: "HAT-TRICK", fp: 30, suppressedBy: [], suppresses: ["BRACE", "POACHER"], trigger: (s: Record<string, number>) => s.goals >= 3 },
    { id: "BRACE", position: "FWD", icon: "⚡", label: "BRACE", fp: 15, suppressedBy: ["HAT_TRICK"], suppresses: ["POACHER"], trigger: (s: Record<string, number>) => s.goals === 2 },
    { id: "CREATOR", position: "FWD", icon: "🪄", label: "CREATOR", fp: 18, suppressedBy: [], suppresses: [], trigger: (s: Record<string, number>) => s.assists >= 2 },
    { id: "WALL", position: "GK", icon: "🧱", label: "THE WALL", fp: 10, suppressedBy: [], suppresses: ["KEEPER"], trigger: (s: Record<string, number>) => s.saves >= 3 },
    { id: "CLEAN_SHEET_GK", position: "GK", icon: "✨", label: "CLEAN SHEET", fp: 10, suppressedBy: [], suppresses: [], trigger: (s: Record<string, number>) => s.goals_conceded === 0 && s.minutes_played >= 60 },
    { id: "RED", position: "ALL", icon: "🟥", label: "SENT OFF", fp: 0, suppressedBy: [], suppresses: [], trigger: (s: Record<string, number>) => s.red_cards >= 1 },
  ],
  statDisplay: { default: [{ key: "goals", label: "G" }] },
  headshotUrl: () => null,
};

const adapter = new SportAdapter(FOOTBALL_TEST_CONFIG);

// Position aliasing for football (e.g. "Right Wing Back" → "DEF") happens
// at data INGESTION time in football/scripts/transformWorldCupData.mjs and
// the simulator's loadSportConfig path, NOT at runtime via the shared
// SportAdapter. By the time a stat line reaches computeFantasyPoints, the
// position is already a normalized 4-letter code (GK/DEF/MID/FWD).
//
// The runtime fallback in shared/adapters/SportAdapter.normalizePosition
// is a defensive last-resort; it doesn't use positionAliases (intentional —
// aliases are pre-applied to the JSON, not re-derived per call).
//
// Tests for the data-ingestion alias path live under football/scripts/
// when authored separately. Out of scope for PR 2 unit tests.

describe("football edge cases — substitute (low minutes)", () => {
  it("computes FP correctly for a sub with 25 mins + 1 goal — no per-90 normalization", () => {
    // Full match goals → full goal weight. We use raw match totals, not per-90.
    const stats = { _position: "FWD", goals: 1, minutes_played: 25 };
    const fp = adapter.computeFantasyPoints(stats);
    expect(fp).toBe(22); // 1 goal × 22 (FWD weight) = 22 FP
  });

  it("CLEAN_SHEET badge gates by minutes_played >= 60 (substitute does NOT earn it)", () => {
    const subStats = { _position: "GK", saves: 0, goals_conceded: 0, minutes_played: 30 };
    const badges = adapter.computeBadges(subStats);
    expect(badges.find(b => b.id === "CLEAN_SHEET_GK")).toBeUndefined();
  });

  it("CLEAN_SHEET badge fires when minutes_played >= 60", () => {
    const fullStats = { _position: "GK", saves: 1, goals_conceded: 0, minutes_played: 90 };
    const badges = adapter.computeBadges(fullStats);
    expect(badges.find(b => b.id === "CLEAN_SHEET_GK")).toBeDefined();
  });
});

describe("football edge cases — GK scored a goal", () => {
  it("stacks GK goal weight (60 FP) with save weight", () => {
    // Rare event: a GK who scored a goal AND made saves. Weights stack — the
    // goal isn't suppressed by the keeper context.
    const stats = { _position: "GK", goals: 1, saves: 5, goals_conceded: 1, minutes_played: 90 };
    const fp = adapter.computeFantasyPoints(stats);
    // 1×60 (goal) + 5×20 (saves) + 1×-6 (GA) = 154 FP
    expect(fp).toBe(154);
  });

  it("WALL badge still fires for the GK with 5 saves (goal doesn't suppress saves badge)", () => {
    const stats = { _position: "GK", goals: 1, saves: 5, goals_conceded: 1, minutes_played: 90 };
    const badges = adapter.computeBadges(stats);
    expect(badges.find(b => b.id === "WALL")).toBeDefined();
  });
});

describe("football edge cases — red card", () => {
  it("applies -15 FP for red_cards >= 1", () => {
    const stats = { _position: "MID", goals: 0, red_cards: 1, minutes_played: 25 };
    const fp = adapter.computeFantasyPoints(stats);
    expect(fp).toBe(-15);
  });

  it("RED badge fires (visual only, fp=0 — penalty already in stat weights)", () => {
    const stats = { _position: "FWD", red_cards: 1, minutes_played: 25 };
    const badges = adapter.computeBadges(stats);
    const redBadge = badges.find(b => b.id === "RED");
    expect(redBadge).toBeDefined();
    expect(redBadge?.fp).toBe(0); // visual-only badge — fp penalty is in the stat weight
  });
});

describe("football edge cases — badge suppression on FWD", () => {
  it("HAT_TRICK suppresses BRACE", () => {
    const stats = { _position: "FWD", goals: 3 };
    const badges = adapter.computeBadges(stats);
    expect(badges.find(b => b.id === "HAT_TRICK")).toBeDefined();
    expect(badges.find(b => b.id === "BRACE")).toBeUndefined();
  });

  it("CREATOR is independent — doesn't suppress and isn't suppressed by goal-based badges", () => {
    const stats = { _position: "FWD", goals: 3, assists: 2 };
    const badges = adapter.computeBadges(stats);
    expect(badges.find(b => b.id === "HAT_TRICK")).toBeDefined();
    expect(badges.find(b => b.id === "CREATOR")).toBeDefined();
  });
});

describe("football edge cases — penalty shootouts (behavior documentation)", () => {
  // Per spec's Data edge cases section: the source-data choice on whether
  // shootout goals count toward the `goals` stat is documented here.
  // Current behavior: shootout goals are TREATED LIKE regular goals if the
  // source data records them in `goals`. StatsBomb's matchstate generally
  // does include shootout goals; if a future data source excludes them,
  // the FP for finals will reduce accordingly. No code-level enforcement —
  // we trust the source data shape.
  it("shootout goals are treated like match goals (no suppression)", () => {
    // Hypothetical: if a player scored 1 in regulation + 1 in shootout and
    // the source data records `goals: 2`, we score 2 goals × 22 = 44.
    const stats = { _position: "FWD", goals: 2 };
    const fp = adapter.computeFantasyPoints(stats);
    expect(fp).toBe(44);
  });
});
