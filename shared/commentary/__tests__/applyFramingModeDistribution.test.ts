// shared/commentary/__tests__/applyFramingModeDistribution.test.ts
//
// Defect-fix regression: applyFraming's mode 3 (and mode 5) previously
// discarded a non-empty Chad analogy unconditionally — even when wantsChad
// fired, the bare-main path returned just the template. Measured baseline:
// ~17.5% of STARTER_normal wins rendered under 100 chars (bare proxy).
//
// These tests pin the win condition end-to-end via the REAL selectCommentary
// path. They drive a spread of seeds, count the bare-or-near-bare output
// rate, and assert it is now near-zero. They also verify the achievement
// modes-2/3 restriction (no framing) survives the fix.
//
// Methodology note: there is no programmatic hook to inspect which mode
// fired. The proxy is output length: a bare template is ~76 chars median,
// a template+analogy is ~140+ chars. Sub-100-char outputs are the leak
// signal. We also pin a stricter sub-80-char "definitely-bare-main"
// floor, which after the fix should be ~0.

import { describe, it, expect, beforeEach } from "vitest";
import { selectCommentary } from "../selectCommentary";
import type { CommentaryInput, WinTier } from "../types";

// ── localStorage stub (selectCommentary's anti-repeat + tone history) ──
const _storage: Record<string, string> = {};
beforeEach(() => {
  for (const k of Object.keys(_storage)) delete _storage[k];
});
(globalThis as any).localStorage = {
  getItem: (k: string) => _storage[k] ?? null,
  setItem: (k: string, v: string) => { _storage[k] = v; },
  removeItem: (k: string) => { delete _storage[k]; },
  clear: () => { for (const k of Object.keys(_storage)) delete _storage[k]; },
};

const STARS = [
  { name: "Anthony Edwards", salary: 62 },
  { name: "Nikola Jokic", salary: 89 },
  { name: "Giannis Antetokounmpo", salary: 79 },
  { name: "Jayson Tatum", salary: 72 },
  { name: "Luka Doncic", salary: 85 },
];
const OPPS = ["BOS","LAL","GSW","MIA","PHX","CHI","NYK","DEN","DAL","MIL"];

function buildStarterNormal(i: number): CommentaryInput {
  const star = STARS[i % STARS.length];
  const opp = OPPS[i % OPPS.length];
  return {
    sport: "basketball",
    totalFp: 210 + (i % 14),
    winTier: "STARTER" as WinTier,
    nextTier: "ALL_STAR" as WinTier,
    tierFloor: 205,
    nextTierMin: 225,
    streak: i % 6,
    prevStreak: Math.max(0, (i % 6) - 1),
    isBust: false,
    handCount: 5 + i,
    roster: [
      { name: star.name, salary: star.salary, actualFp: 35 + (i % 12), projectedFp: 35, cardTier: "ORANGE", opponent: opp, gameDate: "2024-12-15", statLine: { pts: 24, reb: 7, ast: 5 } },
      { name: "Marcus Smart", salary: 18, actualFp: 22, projectedFp: 20, cardTier: "BLUE", opponent: opp, statLine: {} },
      { name: "Bobby Portis", salary: 15, actualFp: 18, projectedFp: 16, cardTier: "GREEN", opponent: opp, statLine: {} },
      { name: "Malik Beasley", salary: 12, actualFp: 14, projectedFp: 13, cardTier: "WHITE", opponent: opp, statLine: {} },
    ],
  };
}

function buildBustMid(i: number): CommentaryInput {
  const star = STARS[i % STARS.length];
  const opp = OPPS[i % OPPS.length];
  return {
    sport: "basketball",
    totalFp: 170 + (i % 15),
    winTier: "BUST" as WinTier,
    nextTier: "ROOKIE" as WinTier,
    tierFloor: 0,
    nextTierMin: 190,
    streak: i % 4,
    prevStreak: i % 4,
    isBust: true,
    handCount: 5 + i,
    roster: [
      { name: star.name, salary: star.salary, actualFp: 18 + (i % 8), projectedFp: 42, cardTier: "ORANGE", opponent: opp, gameDate: "2024-12-15", statLine: { pts: 8, reb: 3, ast: 2 } },
      { name: "Marcus Smart", salary: 18, actualFp: 10, projectedFp: 20, cardTier: "BLUE", opponent: opp, statLine: {} },
      { name: "Bobby Portis", salary: 15, actualFp: 8, projectedFp: 16, cardTier: "GREEN", opponent: opp, statLine: {} },
      { name: "Malik Beasley", salary: 12, actualFp: 6, projectedFp: 13, cardTier: "WHITE", opponent: opp, statLine: {} },
    ],
  };
}

/** Build a hand that routes to historic_career via topGame.tier === "career".
 *  Use a deliberately low totalFp (ROOKIE tier) so the RESULT_FRAMING tier
 *  mismatch the user-spec warned about (ROOKIE framing on a career-high
 *  hand) would be visible IF the achievement modes-2/3 restriction broke. */
function buildCareerNightAtRookieTier(i: number): CommentaryInput {
  const star = STARS[i % STARS.length];
  const opp = OPPS[i % OPPS.length];
  return {
    sport: "basketball",
    totalFp: 192 + (i % 8),
    winTier: "ROOKIE" as WinTier,
    nextTier: "STARTER" as WinTier,
    tierFloor: 190,
    nextTierMin: 205,
    streak: 0,
    prevStreak: 0,
    isBust: false,
    handCount: 3 + i,
    roster: [
      { name: star.name, salary: star.salary, actualFp: 90, projectedFp: 35, cardTier: "ORANGE", opponent: opp, gameDate: "2024-12-15", statLine: { pts: 50, reb: 12, ast: 6 } },
      { name: "Marcus Smart", salary: 18, actualFp: 10, projectedFp: 20, cardTier: "BLUE", opponent: opp, statLine: {} },
      { name: "Bobby Portis", salary: 15, actualFp: 9, projectedFp: 16, cardTier: "GREEN", opponent: opp, statLine: {} },
      { name: "Malik Beasley", salary: 12, actualFp: 8, projectedFp: 13, cardTier: "WHITE", opponent: opp, statLine: {} },
    ],
    topGame: {
      tier: "career",
      primaryReason: { category: "pts", rank: 1 },
      allReasons: [{ category: "pts", rank: 1 }],
    } as any,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("applyFraming mode distribution — analogy not silently discarded", () => {
  it("STARTER_normal: bare-clause rate (<100 chars) is near-zero after fix", () => {
    const N = 600;
    let underHundred = 0;
    let underEighty = 0;
    const lengths: number[] = [];
    for (let i = 0; i < N; i++) {
      _storage["rm_recent_tones"] = "[]";
      _storage["rm_tone_timestamp"] = String(Date.now());
      const { primary } = selectCommentary(buildStarterNormal(i));
      lengths.push(primary.length);
      if (primary.length < 100) underHundred++;
      if (primary.length < 80) underEighty++;
    }
    // Pre-fix baseline: ~17.5% under 100 chars, ~4% under 80.
    // Post-fix expectation: well under 5% / 1% respectively. The slack
    // accounts for the legitimate wantsChad=false slice that intentionally
    // returns shorter copy.
    expect(underHundred / N).toBeLessThan(0.05);
    expect(underEighty / N).toBeLessThan(0.01);
    // Median > 120 confirms the distribution shifted right.
    const median = [...lengths].sort((a, b) => a - b)[Math.floor(N / 2)];
    expect(median).toBeGreaterThan(120);
  });

  it("bust_mid: bare-clause rate (<100 chars) is near-zero after fix", () => {
    const N = 600;
    let underHundred = 0;
    let underEighty = 0;
    const lengths: number[] = [];
    for (let i = 0; i < N; i++) {
      _storage["rm_recent_tones"] = "[]";
      _storage["rm_tone_timestamp"] = String(Date.now());
      const { primary } = selectCommentary(buildBustMid(i));
      lengths.push(primary.length);
      if (primary.length < 100) underHundred++;
      if (primary.length < 80) underEighty++;
    }
    // Pre-fix baseline: ~13.3% under 100 chars, ~3.3% under 80.
    expect(underHundred / N).toBeLessThan(0.05);
    expect(underEighty / N).toBeLessThan(0.01);
    const median = [...lengths].sort((a, b) => a - b)[Math.floor(N / 2)];
    expect(median).toBeGreaterThan(120);
  });

  it("no hand throws — exhaustive smoke across both topologies", () => {
    // Already covered by the assertions above (they call selectCommentary
    // 600 + 600 times). This test makes the contract explicit and runs
    // a smaller smoke pass for documentation.
    for (let i = 0; i < 100; i++) {
      expect(() => selectCommentary(buildStarterNormal(i))).not.toThrow();
      expect(() => selectCommentary(buildBustMid(i))).not.toThrow();
    }
  });
});

describe("achievement archetypes — modes-2/3 restriction (no framing) preserved", () => {
  // The achievement comment in selectCommentary explicitly warns that
  // ROOKIE-tier RESULT_FRAMING firing on a career-high hand would clash:
  //   "a career-high win that only cashed ROOKIE would close with
  //    'Take the cash, forget the mechanics'" (paraphrased — the actual
  //    rookie pool uses phrases like "Held the line.", "Treaded water.",
  //    "Even-Steven.", "Subsistence cash.", "Floor-level result.")
  // If the achievement modes-2/3 restriction breaks, framing from the
  // rookie pool would surface on a career-high hand. Drive 200 such
  // hands and assert NONE of those phrases ever appear.
  // RESULT_FRAMING.rookie pool — verbatim from selectCommentary.ts:143-152.
  // EXCLUDES "Neither here nor there." which also appears verbatim as a
  // tail clause inside CHAD_ANALOGIES.rookie ("Showed up, signed in, signed
  // out. Neither here nor there.") and would false-positive when the
  // analogy fires correctly on an achievement hand (mode 2 or 3).
  const ROOKIE_FRAMING_PHRASES = [
    "Held the line.",
    "Treaded water.",
    "Even-Steven.",
    "Refused to bust.",
    "Kept your seat at the table.",
    "Subsistence cash.",
    "Hovered above zero.",
    "Floor-level result.",
    "Nominal payout.",
    "Marginal green.",
    "Token return.",
    "Held position.",
    "Functional not festive.",
    "Not bust, not braggable.",
    "Pushed the chair back even.",
    "Hand of survival.",
    "Crawled across the line.",
    "Quietly survived.",
    "Break-even kind of night.",
    "Just kept the lights on.",
    "Lukewarm green.",
    "Stayed in the room.",
    "Penny-ante cash.",
    "Held even, held position.",
  ];

  it("historic_career hand at ROOKIE-tier totalFp never contains rookie RESULT_FRAMING", () => {
    const N = 200;
    let leaked = 0;
    const leakedSamples: string[] = [];
    for (let i = 0; i < N; i++) {
      _storage["rm_recent_tones"] = "[]";
      _storage["rm_tone_timestamp"] = String(Date.now());
      const { primary } = selectCommentary(buildCareerNightAtRookieTier(i));
      for (const phrase of ROOKIE_FRAMING_PHRASES) {
        if (primary.includes(phrase)) {
          leaked++;
          if (leakedSamples.length < 3) leakedSamples.push(primary);
          break;
        }
      }
    }
    if (leaked > 0) {
      throw new Error(
        `Achievement modes-2/3 restriction broken: ${leaked}/${N} historic_career hands ` +
        `contained ROOKIE RESULT_FRAMING. Samples:\n${leakedSamples.join("\n")}`,
      );
    }
    expect(leaked).toBe(0);
  });
});
