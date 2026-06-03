// shared/commentary/__tests__/commentaryFacts.test.ts
//
// Phase 3 verified-fact builder gates (lock §"Test / acceptance gates").
// This is the honesty layer — verdict + anchor + topReason — and IS
// testable. The LLM output is not unit-asserted byte-for-byte; only the
// fact assembly is.

import { describe, expect, it } from "vitest";
import {
  buildCommentaryFacts,
  type BuildCommentaryFactsInput,
  type CommentaryFactsCard,
} from "../commentaryFacts";

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
    season: "0809",
    trigger: "choke",
    roster: [
      card({ basePlayerId: "977", name: "Kobe Bryant", tier: "RED" }),
      card({ basePlayerId: "101108", name: "Chris Paul", tier: "RED" }),
    ],
    anchorBasePlayerId: "977",
    holdsRecorded: true,
    ...over,
  };
}

describe("buildCommentaryFacts — default trigger short-circuits to skip", () => {
  it("trigger=default → kind:'skip' (caller MUST NOT POST)", () => {
    const r = buildCommentaryFacts(input({ trigger: "default" }));
    expect(r.kind).toBe("skip");
    if (r.kind === "skip") expect(r.reason).toBe("default_trigger");
  });
});

describe("buildCommentaryFacts — verdict matrix", () => {
  it("choke + mid-zone (Kobe-style) → neutral", () => {
    const r = buildCommentaryFacts(input({
      trigger: "choke",
      anchorBasePlayerId: "977",
      roster: [
        card({ basePlayerId: "977", actualFp: 32.4, projectedFp: 41.7 }), // 0.78
        card({ basePlayerId: "101108", actualFp: 42.7, projectedFp: 48.9 }), // 0.87
      ],
    }));
    expect(r.kind).toBe("facts");
    if (r.kind === "facts") expect(r.facts.verdict).toBe("neutral");
  });

  it("choke + anchor delivered + other tanked → credited", () => {
    const r = buildCommentaryFacts(input({
      trigger: "choke",
      roster: [
        card({ basePlayerId: "977", actualFp: 47, projectedFp: 50 }),       // 0.94
        card({ basePlayerId: "101108", actualFp: 13, projectedFp: 35 }),    // 0.37
      ],
    }));
    expect(r.kind).toBe("facts");
    if (r.kind === "facts") expect(r.facts.verdict).toBe("credited");
  });

  it("choke + anchor tanked → blamed", () => {
    const r = buildCommentaryFacts(input({
      trigger: "choke",
      roster: [
        card({ basePlayerId: "977", actualFp: 15, projectedFp: 50 }),       // 0.30
        card({ basePlayerId: "101108", actualFp: 50, projectedFp: 50 }),    // 1.00
      ],
    }));
    expect(r.kind).toBe("facts");
    if (r.kind === "facts") expect(r.facts.verdict).toBe("blamed");
  });

  it("rare_pull → credited (honest-by-construction)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "rare_pull",
      anchorBasePlayerId: "2548",
      roster: [card({ basePlayerId: "2548", name: "Dwyane Wade", actualFp: 80.8, projectedFp: 51.1 })],
      topGamePrimaryReason: { category: "pts", value: 48, label: "48 pts" },
    }));
    expect(r.kind).toBe("facts");
    if (r.kind === "facts") expect(r.facts.verdict).toBe("credited");
  });

  it("big_score → credited", () => {
    const r = buildCommentaryFacts(input({
      trigger: "big_score",
      anchorBasePlayerId: "977",
    }));
    expect(r.kind).toBe("facts");
    if (r.kind === "facts") expect(r.facts.verdict).toBe("credited");
  });

  it("miss → neutral", () => {
    const r = buildCommentaryFacts(input({
      trigger: "miss",
      anchorBasePlayerId: null,
      nearMissGap: 7,
      nearMissNextTier: "ALL_STAR",
    }));
    expect(r.kind).toBe("facts");
    if (r.kind === "facts") expect(r.facts.verdict).toBe("neutral");
  });
});

describe("buildCommentaryFacts — miss shape (no anchor; carries gap/tier)", () => {
  it("emits gap + next-tier but NO anchor block", () => {
    const r = buildCommentaryFacts(input({
      trigger: "miss",
      anchorBasePlayerId: null,
      nearMissGap: 7,
      nearMissNextTier: "ALL_STAR",
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.anchor).toBeUndefined();
    expect(r.facts.nearMissGap).toBe(7);
    expect(r.facts.nearMissNextTier).toBe("ALL_STAR");
  });

  it("omits gap field when null on input (no '0' leak)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "miss",
      anchorBasePlayerId: null,
      nearMissGap: null,
      nearMissNextTier: null,
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.nearMissGap).toBeUndefined();
    expect(r.facts.nearMissNextTier).toBeUndefined();
  });
});

describe("buildCommentaryFacts — anchor-null tolerance for non-miss triggers", () => {
  it("choke without resolvable anchor → facts emitted, verdict=neutral, no anchor block", () => {
    const r = buildCommentaryFacts(input({
      trigger: "choke",
      anchorBasePlayerId: "ghost",
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.verdict).toBe("neutral");
    expect(r.facts.anchor).toBeUndefined();
  });

  it("rare_pull without resolvable anchor → facts emitted, verdict=neutral, no anchor block", () => {
    const r = buildCommentaryFacts(input({
      trigger: "rare_pull",
      anchorBasePlayerId: null,
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.verdict).toBe("neutral");
    expect(r.facts.anchor).toBeUndefined();
  });
});

describe("buildCommentaryFacts — anchor block content", () => {
  it("populates statLine / opponent / homeAway / date / team verbatim", () => {
    const r = buildCommentaryFacts(input({
      trigger: "rare_pull",
      anchorBasePlayerId: "2548",
      roster: [card({
        basePlayerId: "2548", name: "Dwyane Wade", tier: "RED", team: "MIA",
        actualFp: 80.8, projectedFp: 51.1,
        gameInfo: { date: "2009-02-22", opponent: "CHI", homeAway: "H" },
        statLine: { pts: 48, reb: 12, ast: 12, stl: 4, blk: 6 },
      })],
      topGamePrimaryReason: { category: "pts", value: 48, label: "48 pts" },
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    const a = r.facts.anchor!;
    expect(a.name).toBe("Dwyane Wade");
    expect(a.team).toBe("MIA");
    expect(a.opponent).toBe("CHI");
    expect(a.homeAway).toBe("H");
    expect(a.date).toBe("2009-02-22");
    expect(a.statLine).toEqual({ pts: 48, reb: 12, ast: 12, stl: 4, blk: 6 });
  });

  it("threads topGamePrimaryReason verbatim onto anchor.topReason for rare_pull", () => {
    const reason = { category: "pts", value: 48, label: "48 pts (career)" };
    const r = buildCommentaryFacts(input({
      trigger: "rare_pull",
      anchorBasePlayerId: "2548",
      roster: [card({ basePlayerId: "2548", name: "Dwyane Wade" })],
      topGamePrimaryReason: reason,
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.anchor!.topReason).toEqual(reason);
  });

  it("derives big_score topReason from anchor's actualFp", () => {
    const r = buildCommentaryFacts(input({
      trigger: "big_score",
      anchorBasePlayerId: "977",
      roster: [card({ basePlayerId: "977", actualFp: 65.3 })],
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.anchor!.topReason).toEqual({
      category: "fp",
      value: 65.3,
      label: "65.3 FP",
    });
  });

  it("choke + no topReason field (the take cards' own framing carries it)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "choke",
      roster: [
        card({ basePlayerId: "977", actualFp: 15, projectedFp: 50 }),
        card({ basePlayerId: "101108", actualFp: 50, projectedFp: 50 }),
      ],
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.anchor!.topReason).toBeUndefined();
  });

  it("nicknames are an array (possibly empty) when culture exists", () => {
    // Kobe (basePlayerId 977) is present in basketball/utils/playerCulture.ts.
    const r = buildCommentaryFacts(input({
      trigger: "big_score",
      anchorBasePlayerId: "977",
      roster: [card({ basePlayerId: "977", name: "Kobe Bryant", tier: "RED", team: "LAL" })],
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(Array.isArray(r.facts.anchor!.nicknames)).toBe(true);
    // Kobe's nicknames bucket is well-known; assert at least one iconic
    // entry is present. Avoids over-pinning the bank order.
    expect(r.facts.anchor!.nicknames.some(n => /mamba/i.test(n))).toBe(true);
  });

  it("knownFor falls back to '' when no culture entry resolves (synthetic player)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "big_score",
      anchorBasePlayerId: "synthetic",
      roster: [card({ basePlayerId: "synthetic", name: "No Such Player", tier: "WHITE" })],
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.anchor!.knownFor).toBe("");
    expect(r.facts.anchor!.nicknames).toEqual([]);
  });
});

describe("buildCommentaryFacts — venue is NEVER populated (v1 rule)", () => {
  // Phase 3 lock §"Decisions locked" item 1 + §"Test gates" item 6.
  // The shape has no `venue` slot at all, so we assert the absence at
  // every point we emit an anchor.
  it.each([
    { trigger: "choke" as const,     anchor: "977", roster: [
      card({ basePlayerId: "977", actualFp: 15, projectedFp: 50 }),
      card({ basePlayerId: "101108", actualFp: 50, projectedFp: 50 }),
    ]},
    { trigger: "rare_pull" as const, anchor: "2548", roster: [card({ basePlayerId: "2548", name: "Dwyane Wade" })]},
    { trigger: "big_score" as const, anchor: "977", roster: [card({ basePlayerId: "977" })] },
  ])("venue not present on anchor for $trigger", ({ trigger, anchor, roster }) => {
    const r = buildCommentaryFacts(input({
      trigger,
      anchorBasePlayerId: anchor,
      roster,
      topGamePrimaryReason: trigger === "rare_pull" ? { category: "pts", value: 48, label: "48 pts" } : undefined,
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.anchor).toBeDefined();
    expect((r.facts.anchor as any).venue).toBeUndefined();
  });
});

describe("buildCommentaryFacts — surface tag passes through", () => {
  it("preserves surface verbatim (post_hand readers reuse the same builder)", () => {
    const r = buildCommentaryFacts(input({ surface: "post_hand", trigger: "big_score" }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.surface).toBe("post_hand");
  });
});

describe("buildCommentaryFacts — winTier passthrough (Phase 3 step 2)", () => {
  it("threads winTier onto facts when provided (big_score with anchor)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "big_score",
      winTier: "ALL_STAR",
      anchorBasePlayerId: "977",
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.winTier).toBe("ALL_STAR");
  });

  it("threads winTier onto facts on miss (no anchor)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "miss",
      winTier: "STARTER",
      anchorBasePlayerId: null,
      nearMissGap: 7,
      nearMissNextTier: "ALL_STAR",
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.winTier).toBe("STARTER");
  });

  it("threads winTier onto facts when anchor doesn't resolve (no-anchor branch)", () => {
    const r = buildCommentaryFacts(input({
      trigger: "choke",
      winTier: "BUST",
      anchorBasePlayerId: "ghost",
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.winTier).toBe("BUST");
  });

  it("omits winTier from facts when caller doesn't pass it", () => {
    const r = buildCommentaryFacts(input({
      trigger: "rare_pull",
      anchorBasePlayerId: "2548",
      roster: [card({ basePlayerId: "2548", name: "Dwyane Wade" })],
      topGamePrimaryReason: { category: "pts", value: 48, label: "48 pts" },
    }));
    if (r.kind !== "facts") throw new Error("expected facts");
    expect(r.facts.winTier).toBeUndefined();
  });
});
