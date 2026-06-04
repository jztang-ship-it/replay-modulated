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

// Phase 4 Pass 1 (fixup) — salience renders as CONCEPTS, not analyst
// shorthand. The `label` on each SalienceFact is now magnitude + concept
// word ("42 points" instead of "42 FP from 42 pts"). The data fields
// (category, value, shortfall, basePlayerId) remain on the objects for
// computation / downstream joins but never render into the prompt.
const BIG_SCORE_SALIENCE: NonNullable<CommentaryFacts["salience"]> = {
  primaryPositive: { category: "pts", value: 42, label: "42 points" },
  primaryNegative: { category: "turnovers", value: -3, label: "3 turnovers" },
};

const CHOKE_SALIENCE: NonNullable<CommentaryFacts["salience"]> = {
  primaryPositive: { category: "pts", value: 38, label: "38 points" },
  primaryNegative: { category: "turnovers", value: -4, label: "4 turnovers" },
  primaryDragPlayer: { basePlayerId: "101108", name: "Chris Paul", shortfall: -22.5 },
};

const MISS_SALIENCE: NonNullable<CommentaryFacts["salience"]> = {
  primaryPositive: { category: "pts", value: 30, label: "30 points" },
};

describe("salience block — render shape per signal", () => {
  it("big_score: emits SALIENCE: header + MOST IMPORTANT POSITIVE + NEGATIVE (concept labels)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "big_score",
      salience: BIG_SCORE_SALIENCE,
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    const prompt = buildUserPrompt(r.facts);
    expect(prompt).toContain("SALIENCE:");
    expect(prompt).toContain("  MOST IMPORTANT POSITIVE: 42 points");
    expect(prompt).toContain("  MOST IMPORTANT NEGATIVE: 3 turnovers");
    // Analyst-shorthand suffix (key=value) and "FP from" framing must
    // not leak back into the rendered prompt.
    expect(prompt).not.toMatch(/\(pts=42\)/);
    expect(prompt).not.toMatch(/FP from/);
    expect(prompt).not.toContain("primaryPositive:");
    expect(prompt).not.toContain("primaryNegative:");
    expect(prompt).not.toContain("BIGGEST DRAG:");
  });

  it("choke: emits MOST IMPORTANT POSITIVE + NEGATIVE + BIGGEST DRAG (concept phrasing)", () => {
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
    expect(prompt).toContain("  MOST IMPORTANT POSITIVE: 38 points");
    expect(prompt).toContain("  MOST IMPORTANT NEGATIVE: 4 turnovers");
    expect(prompt).toContain("  BIGGEST DRAG: Chris Paul — gave you far less than his hold was worth");
    // Drag must NEVER leak basePlayerId, shortfall number, or analyst
    // framing (projected/actual/shortfall words) into the prompt.
    expect(prompt).not.toMatch(/basePlayerId/);
    expect(prompt).not.toMatch(/101108/);
    expect(prompt).not.toMatch(/-22\.5/);
    expect(prompt).not.toMatch(/shortfall/i);
    expect(prompt).not.toMatch(/projected/i);
    expect(prompt).not.toMatch(/below expectation/i);
  });

  it("miss: MOST IMPORTANT POSITIVE only — NEGATIVE leans on existing nearMissGap (lock §per-trigger)", () => {
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
    expect(prompt).toContain("  MOST IMPORTANT POSITIVE: 30 points");
    expect(prompt).not.toContain("MOST IMPORTANT NEGATIVE");
    expect(prompt).not.toContain("BIGGEST DRAG");
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

// ── render invariant ──────────────────────────────────────────────────────
// Lock §"render invariant": every non-drag salience fact references a stat
// present in the rendered (trimmed) statLine. Naturally true by
// construction — computeSalience only ranks weights' keys, which are the
// same set as facts.fpStatKeys (the trim allowlist) — but pinned here as a
// gate so a future shape change can't silently produce a salience signal
// for a stat the trim is hiding from the model (which would name a stat
// the model doesn't see in its statLine).

describe("render invariant — non-drag salience signals reference stats in the trimmed statLine", () => {
  function statLineKeys(prompt: string): string[] {
    const m = prompt.match(/^\s*statLine:\s*(.+)$/m);
    if (!m) return [];
    // statLine line is "X pts, Y reb, ..." — split by ", " and take the
    // second token of each comma-separated pair.
    return m[1].split(",").map(part => part.trim().split(/\s+/)[1]);
  }

  it("big_score: primaryPositive.category + primaryNegative.category both present in the rendered statLine", () => {
    const r = buildCommentaryFacts(input({
      trigger: "big_score",
      roster: [card({
        basePlayerId: "977",
        statLine: { pts: 42, reb: 5, ast: 7, stl: 1, blk: 0, turnovers: 3 },
      })],
      salience: BIG_SCORE_SALIENCE,
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    const prompt = buildUserPrompt(r.facts);
    const keys = statLineKeys(prompt);
    expect(keys).toContain(r.facts.salience!.primaryPositive!.category);
    expect(keys).toContain(r.facts.salience!.primaryNegative!.category);
  });

  it("choke: same invariant — drag player is exempt (not a stat reference)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "choke",
      anchorBasePlayerId: "977",
      roster: [
        card({
          basePlayerId: "977",
          name: "Kobe Bryant",
          statLine: { pts: 38, reb: 6, ast: 5, stl: 2, blk: 1, turnovers: 4 },
        }),
        card({ basePlayerId: "101108", name: "Chris Paul", actualFp: 18, projectedFp: 40.5 }),
      ],
      salience: CHOKE_SALIENCE,
    }));
    expect(r.kind).toBe("facts");
    if (r.kind !== "facts") return;
    const prompt = buildUserPrompt(r.facts);
    const keys = statLineKeys(prompt);
    expect(keys).toContain(r.facts.salience!.primaryPositive!.category);
    expect(keys).toContain(r.facts.salience!.primaryNegative!.category);
    // primaryDragPlayer is the held-shortfall signal — it doesn't carry
    // a `category` field, so the invariant doesn't apply to it.
    expect(r.facts.salience!.primaryDragPlayer).toBeDefined();
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
