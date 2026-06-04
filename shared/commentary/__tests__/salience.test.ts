// shared/commentary/__tests__/salience.test.ts
//
// Phase 4 Pass 1 (lock: docs/challenge-landing-v2-phase4-salience-stat-
// hygiene-foundation-lock.md). Pins:
//   - the statLine trim (FP-component keys only; min / threes never render;
//     "to" → "turnovers" key fix);
//   - the totalFp render line;
//   - the salience block render shape (primaryPositive / primaryNegative /
//     primaryDragPlayer) for the three salience-bearing triggers
//     (big_score / choke / miss) and the rare_pull omission;
//   - buildCommentaryFacts pass-through of all three new fields.
//
// The salience COMPUTATION (the per-stat ranking math) lives at the caller
// per lock §3 Option A — see ChallengeSharePrompt.tsx. This file exercises
// the FACTS-shape boundary: given a salience object on input, does facts
// + buildUserPrompt do the right thing.

import { describe, expect, it } from "vitest";
import {
  buildCommentaryFacts,
  type BuildCommentaryFactsInput,
  type CommentaryFacts,
  type CommentaryFactsCard,
} from "../commentaryFacts";
import { buildUserPrompt } from "../voiceContract";

const FP_STAT_KEYS = ["pts", "reb", "ast", "stl", "blk", "turnovers"] as const;

function card(over: Partial<CommentaryFactsCard> = {}): CommentaryFactsCard {
  return {
    basePlayerId: "ANY",
    name: "Any Player",
    tier: "RED",
    team: "MIA",
    actualFp: 30,
    projectedFp: 40,
    wasHeld: true,
    gameInfo: { date: "2009-01-01", opponent: "HOU", homeAway: "H" },
    statLine: { pts: 20, reb: 5, ast: 5 },
    ...over,
  };
}

function input(over: Partial<BuildCommentaryFactsInput> = {}): BuildCommentaryFactsInput {
  return {
    surface: "challenge_headline",
    sport: "basketball",
    season: "2425",
    trigger: "big_score",
    roster: [card({ basePlayerId: "977", name: "Kobe Bryant" })],
    anchorBasePlayerId: "977",
    holdsRecorded: true,
    fpStatKeys: FP_STAT_KEYS,
    totalFp: 238.7,
    ...over,
  };
}

// ── statLine trim ──────────────────────────────────────────────────────────

describe("formatStatLine — trim to FP-component keys only", () => {
  it("drops min / threes / fg% from the rendered statLine", () => {
    const r = buildCommentaryFacts(input({
      roster: [card({
        basePlayerId: "977",
        statLine: { pts: 42, reb: 5, ast: 7, threes: 9, min: 35, fg_pct: 0.55 },
      })],
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    const prompt = buildUserPrompt(r.facts);
    // Allowlist keys present.
    expect(prompt).toMatch(/^\s*statLine: 42 pts, 5 reb, 7 ast/m);
    // Off-allowlist keys absent — including the value, which would
    // otherwise leak as a bare number in the prompt.
    expect(prompt).not.toMatch(/\b9 threes\b/);
    expect(prompt).not.toMatch(/\b35 min\b/);
    expect(prompt).not.toMatch(/\bfg_pct\b/);
    expect(prompt).not.toMatch(/0\.55/);
  });

  it("renders turnovers in its allowlist slot (the pre-Phase-4 'to' mis-key fix)", () => {
    const r = buildCommentaryFacts(input({
      roster: [card({
        basePlayerId: "977",
        statLine: { pts: 26, reb: 5, ast: 10, stl: 1, blk: 0, turnovers: 2, min: 35 },
      })],
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    const prompt = buildUserPrompt(r.facts);
    // turnovers renders in its slot — after blk, before any tail.
    expect(prompt).toMatch(/^\s*statLine: 26 pts, 5 reb, 10 ast, 1 stl, 0 blk, 2 turnovers$/m);
    // min was withheld — would have leaked under the old "tail bucket"
    // pattern even after the allowlist trim if not gated correctly.
    expect(prompt).not.toMatch(/\b35 min\b/);
  });

  it("omits the statLine line entirely when fpStatKeys is absent (legacy fallback)", () => {
    const r = buildCommentaryFacts(input({
      fpStatKeys: undefined,
      roster: [card({
        basePlayerId: "977",
        statLine: { pts: 30, reb: 8, threes: 5, min: 38 },
      })],
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    const prompt = buildUserPrompt(r.facts);
    // No statLine emitted → no leak of unweighted stats.
    expect(prompt).not.toMatch(/^\s*statLine:/m);
    expect(prompt).not.toMatch(/\b5 threes\b/);
    expect(prompt).not.toMatch(/\b38 min\b/);
  });
});

// ── totalFp ────────────────────────────────────────────────────────────────

describe("totalFp — threaded through the boundary", () => {
  it("renders TOTAL_FP near the top of the prompt", () => {
    const r = buildCommentaryFacts(input({ totalFp: 238.7 }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    expect(r.facts.totalFp).toBe(238.7);
    const prompt = buildUserPrompt(r.facts);
    expect(prompt).toContain("TOTAL_FP: 238.7");
  });

  it("threads through on miss (no anchor) too", () => {
    const r = buildCommentaryFacts(input({
      trigger: "miss",
      anchorBasePlayerId: null,
      nearMissGap: 7,
      nearMissNextTier: "ALL_STAR",
      totalFp: 218.4,
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    expect(r.facts.totalFp).toBe(218.4);
    const prompt = buildUserPrompt(r.facts);
    expect(prompt).toContain("TOTAL_FP: 218.4");
  });

  it("omits TOTAL_FP when caller did not provide one", () => {
    const r = buildCommentaryFacts(input({ totalFp: null }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    expect(r.facts.totalFp).toBeUndefined();
    expect(buildUserPrompt(r.facts)).not.toContain("TOTAL_FP:");
  });
});

// ── salience block render ──────────────────────────────────────────────────

const BIG_SCORE_SALIENCE: NonNullable<CommentaryFacts["salience"]> = {
  primaryPositive: { category: "pts", value: 42, label: "42 FP from 42 pts" },
  primaryNegative: { category: "turnovers", value: -3, label: "-3 FP from 3 turnovers" },
};

const CHOKE_SALIENCE: NonNullable<CommentaryFacts["salience"]> = {
  primaryPositive: { category: "pts", value: 38, label: "38 FP from 38 pts" },
  primaryNegative: { category: "turnovers", value: -4, label: "-4 FP from 4 turnovers" },
  primaryDragPlayer: { basePlayerId: "101108", name: "Chris Paul", shortfall: -22.5 },
};

const MISS_SALIENCE: NonNullable<CommentaryFacts["salience"]> = {
  primaryPositive: { category: "pts", value: 30, label: "30 FP from 30 pts" },
};

describe("salience block — render shape per signal", () => {
  it("big_score: emits SALIENCE: header + primaryPositive + primaryNegative", () => {
    const r = buildCommentaryFacts(input({
      trigger: "big_score",
      salience: BIG_SCORE_SALIENCE,
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    const prompt = buildUserPrompt(r.facts);
    expect(prompt).toContain("SALIENCE:");
    expect(prompt).toContain("  primaryPositive: 42 FP from 42 pts (pts=42)");
    expect(prompt).toContain("  primaryNegative: -3 FP from 3 turnovers (turnovers=-3)");
    expect(prompt).not.toContain("primaryDragPlayer");
  });

  it("choke: emits primaryPositive + primaryNegative + primaryDragPlayer", () => {
    const r = buildCommentaryFacts(input({
      trigger: "choke",
      anchorBasePlayerId: "977",
      roster: [
        card({ basePlayerId: "977", name: "Kobe Bryant", actualFp: 32, projectedFp: 35 }),
        card({ basePlayerId: "101108", name: "Chris Paul", actualFp: 18, projectedFp: 40.5 }),
      ],
      salience: CHOKE_SALIENCE,
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    const prompt = buildUserPrompt(r.facts);
    expect(prompt).toContain("SALIENCE:");
    expect(prompt).toContain("  primaryPositive: 38 FP from 38 pts (pts=38)");
    expect(prompt).toContain("  primaryNegative: -4 FP from 4 turnovers (turnovers=-4)");
    expect(prompt).toContain("  primaryDragPlayer: Chris Paul shortfall -22.5 FP (basePlayerId=101108)");
  });

  it("miss: primaryPositive only — primaryNegative leans on existing nearMissGap (lock §per-trigger)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "miss",
      anchorBasePlayerId: null,
      nearMissGap: 7,
      nearMissNextTier: "ALL_STAR",
      salience: MISS_SALIENCE,
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    const prompt = buildUserPrompt(r.facts);
    expect(prompt).toContain("SALIENCE:");
    expect(prompt).toContain("  primaryPositive: 30 FP from 30 pts (pts=30)");
    expect(prompt).not.toContain("primaryNegative");
    expect(prompt).not.toContain("primaryDragPlayer");
    // nearMiss block still present — the existing miss-negative signal.
    expect(prompt).toContain("NEAR_MISS_GAP_FP: 7");
  });

  it("rare_pull: salience omitted at the builder boundary even when caller passes one", () => {
    // The caller is expected to skip the computation for rare_pull, but
    // buildCommentaryFacts enforces the omission at the boundary so
    // misuse by a future caller can't leak salience onto a rare_pull
    // hand (which would duplicate / distract from topReason).
    const r = buildCommentaryFacts(input({
      trigger: "rare_pull",
      anchorBasePlayerId: "2548",
      roster: [card({ basePlayerId: "2548", name: "Dwyane Wade" })],
      topGamePrimaryReason: { category: "pts", value: 48, label: "48 pts (career)" },
      salience: BIG_SCORE_SALIENCE,
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    expect(r.facts.salience).toBeUndefined();
    const prompt = buildUserPrompt(r.facts);
    expect(prompt).not.toContain("SALIENCE:");
    // topReason is the rare_pull signal — must still be present.
    expect(prompt).toContain("topReason: 48 pts (career) (pts=48)");
  });

  it("omits the entire SALIENCE: block when no signal is on facts", () => {
    const r = buildCommentaryFacts(input({ trigger: "big_score", salience: undefined }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    expect(buildUserPrompt(r.facts)).not.toContain("SALIENCE:");
  });
});

// ── pass-through plumbing ──────────────────────────────────────────────────

describe("buildCommentaryFacts — pass-through of new optional fields", () => {
  it("threads fpStatKeys onto facts unchanged", () => {
    const r = buildCommentaryFacts(input({ fpStatKeys: ["pts", "reb"] }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    expect(r.facts.fpStatKeys).toEqual(["pts", "reb"]);
  });

  it("threads salience onto facts unchanged for non-rare_pull triggers", () => {
    const r = buildCommentaryFacts(input({ trigger: "choke", salience: CHOKE_SALIENCE }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    expect(r.facts.salience).toEqual(CHOKE_SALIENCE);
  });

  it("threads totalFp onto facts unchanged", () => {
    const r = buildCommentaryFacts(input({ totalFp: 312.4 }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    expect(r.facts.totalFp).toBe(312.4);
  });
});
