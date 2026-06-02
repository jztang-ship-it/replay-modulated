// shared/commentary/__tests__/recipientIntro.test.ts
//
// Phase 5c S3 — coverage for the recipient contextual intro selectors:
// selectIntroAnchor (Path A id resolve + derivation fallback per T2),
// selectRecipientIntro / selectRecipientDealNudge (T5 four-level
// fallback chain + culture-line preference rules).

import { describe, it, expect } from "vitest";
import {
  selectIntroAnchor,
  selectRecipientIntro,
  selectRecipientDealNudge,
  recipientIntroBank,
  recipientDealNudgeBank,
  type RecipientIntroAnchor,
  type Line,
  type LinePart,
  type StampToken,
} from "../chadChallenge";

// Minimal GeneratedCard fixtures — full shape has many fields; selectors
// only read a handful. Cast through `any` to keep tests focused on the
// fields the selectors actually consume.
function card(over: Record<string, any>): any {
  return {
    name: over.name ?? "Test Player",
    basePlayerId: over.basePlayerId ?? "9001",
    team: over.team ?? "NYK",
    tier: over.tier ?? "GREEN", // GREEN → culture lookup returns null by default
    salary: over.salary ?? 40,
    projectedFp: over.projectedFp ?? 30,
    actualFp: over.actualFp ?? 30,
    wasHeld: over.wasHeld ?? false,
    gameInfo: over.gameInfo ?? { date: "2025-02-01", opponent: "BOS" },
    statLine: {},
    achievements: [],
  };
}

function strings(line: Line): string {
  return line.filter((p): p is string => typeof p === "string").join("");
}
function stamps(line: Line): StampToken[] {
  return line.filter((p): p is StampToken => typeof p !== "string");
}

describe("selectIntroAnchor — Path A id-resolve precedence", () => {
  it("rare_pull: resolves anchorBasePlayerId against senderCards verbatim", () => {
    const cards = [
      card({ name: "Alpha", basePlayerId: "1", actualFp: 80 }),
      card({ name: "Bravo", basePlayerId: "2", actualFp: 40 }),
    ];
    const anchor = selectIntroAnchor({
      triggerType: "rare_pull",
      senderCards: cards,
      anchorBasePlayerId: "2", // not the top scorer — Path A wins
      topGameTier: "record",
      sport: "basketball",
    });
    expect(anchor?.basePlayerId).toBe("2");
    expect(anchor?.name).toBe("Bravo");
    expect(anchor?.topGameTier).toBe("record");
  });

  it("choke: Path A id resolves even when not the worst-delta card", () => {
    const cards = [
      card({ name: "Hero", basePlayerId: "10", wasHeld: true, actualFp: 50, projectedFp: 40 }), // +10
      card({ name: "Disappointment", basePlayerId: "20", wasHeld: true, actualFp: 5, projectedFp: 40 }), // -35
    ];
    const anchor = selectIntroAnchor({
      triggerType: "choke",
      senderCards: cards,
      anchorBasePlayerId: "10", // persisted choice overrides derivation
      topGameTier: null,
      sport: "basketball",
    });
    expect(anchor?.basePlayerId).toBe("10");
  });

  it("big_score: Path A id wins over highest-FP rule", () => {
    const cards = [
      card({ name: "Top", basePlayerId: "100", actualFp: 90 }),
      card({ name: "Mid", basePlayerId: "200", actualFp: 60, wasHeld: true }),
    ];
    const anchor = selectIntroAnchor({
      triggerType: "big_score",
      senderCards: cards,
      anchorBasePlayerId: "200",
      topGameTier: null,
      sport: "basketball",
    });
    expect(anchor?.basePlayerId).toBe("200");
  });
});

describe("selectIntroAnchor — derivation fallback per T2", () => {
  it("choke: worst held actualFp − projectedFp wins (tiebreak salary)", () => {
    const cards = [
      card({ name: "Equal1", basePlayerId: "A", wasHeld: true, actualFp: 10, projectedFp: 30, salary: 40 }), // -20
      card({ name: "Equal2", basePlayerId: "B", wasHeld: true, actualFp: 10, projectedFp: 30, salary: 60 }), // -20, higher salary
      card({ name: "Mild", basePlayerId: "C", wasHeld: true, actualFp: 25, projectedFp: 30, salary: 80 }), // -5
    ];
    const anchor = selectIntroAnchor({
      triggerType: "choke",
      senderCards: cards,
      anchorBasePlayerId: null,
      topGameTier: null,
      sport: "basketball",
    });
    // Both Equal1/Equal2 share the -20 delta. Tiebreak: highest salary (Equal2).
    expect(anchor?.basePlayerId).toBe("B");
  });

  it("choke: null anchor when no held cards", () => {
    const cards = [card({ wasHeld: false }), card({ wasHeld: false })];
    const anchor = selectIntroAnchor({
      triggerType: "choke",
      senderCards: cards,
      anchorBasePlayerId: null,
      topGameTier: null,
      sport: "basketball",
    });
    expect(anchor).toBeNull();
  });

  it("big_score: highest actualFp wins; prefers wasHeld within 1 FP", () => {
    const cards = [
      card({ name: "Top", basePlayerId: "T", actualFp: 80, wasHeld: false }),
      card({ name: "Held", basePlayerId: "H", actualFp: 79.5, wasHeld: true }), // within 1 FP of top
      card({ name: "Other", basePlayerId: "O", actualFp: 60, wasHeld: true }),
    ];
    const anchor = selectIntroAnchor({
      triggerType: "big_score",
      senderCards: cards,
      anchorBasePlayerId: null,
      topGameTier: null,
      sport: "basketball",
    });
    expect(anchor?.basePlayerId).toBe("H");
  });

  it("big_score: top scorer wins when no wasHeld is within 1 FP", () => {
    const cards = [
      card({ name: "Top", basePlayerId: "T", actualFp: 80, wasHeld: false }),
      card({ name: "Held", basePlayerId: "H", actualFp: 60, wasHeld: true }),
    ];
    const anchor = selectIntroAnchor({
      triggerType: "big_score",
      senderCards: cards,
      anchorBasePlayerId: null,
      topGameTier: null,
      sport: "basketball",
    });
    expect(anchor?.basePlayerId).toBe("T");
  });

  it("rare_pull derivation: top scorer wins; does NOT fabricate topGameTier", () => {
    const cards = [
      card({ name: "Top", basePlayerId: "T", actualFp: 85 }),
      card({ name: "Other", basePlayerId: "O", actualFp: 50 }),
    ];
    const anchor = selectIntroAnchor({
      triggerType: "rare_pull",
      senderCards: cards,
      anchorBasePlayerId: null,
      topGameTier: null, // legacy: persisted tier absent
      sport: "basketball",
    });
    expect(anchor?.basePlayerId).toBe("T");
    expect(anchor?.topGameTier).toBeNull();
  });
});

describe("selectIntroAnchor — null-returning paths", () => {
  it("miss → null (no anchor concept)", () => {
    const anchor = selectIntroAnchor({
      triggerType: "miss",
      senderCards: [card({})],
      anchorBasePlayerId: "1",
      topGameTier: null,
      sport: "basketball",
    });
    expect(anchor).toBeNull();
  });

  it("default → null", () => {
    const anchor = selectIntroAnchor({
      triggerType: "default",
      senderCards: [card({})],
      anchorBasePlayerId: null,
      topGameTier: null,
      sport: "basketball",
    });
    expect(anchor).toBeNull();
  });

  it("empty / undefined senderCards → null", () => {
    expect(
      selectIntroAnchor({
        triggerType: "rare_pull",
        senderCards: [],
        anchorBasePlayerId: "1",
        topGameTier: "record",
        sport: "basketball",
      }),
    ).toBeNull();
    expect(
      selectIntroAnchor({
        triggerType: "rare_pull",
        senderCards: undefined,
        anchorBasePlayerId: "1",
        topGameTier: "record",
        sport: "basketball",
      }),
    ).toBeNull();
  });

  it("undefined triggerType → null", () => {
    const anchor = selectIntroAnchor({
      triggerType: undefined,
      senderCards: [card({})],
      anchorBasePlayerId: "1",
      topGameTier: null,
      sport: "basketball",
    });
    expect(anchor).toBeNull();
  });
});

// ── selectRecipientIntro fallback chain ───────────────────────────────────

function fakeCulture(over: any = {}): any {
  return {
    nicknames: over.nicknames ?? [],
    overperform: over.overperform ?? [],
    underperform: over.underperform ?? [],
    controversy: over.controversy ?? [],
    signatureGames: over.signatureGames,
    milestones: over.milestones,
    streakLines: over.streakLines,
  };
}

function fakeAnchor(over: Partial<RecipientIntroAnchor> = {}): RecipientIntroAnchor {
  return {
    name: over.name ?? "Test Player",
    basePlayerId: over.basePlayerId ?? "9001",
    team: over.team,
    tier: over.tier ?? "GREEN",
    actualFp: over.actualFp,
    projectedFp: over.projectedFp,
    wasHeld: over.wasHeld,
    salary: over.salary,
    gameInfo: over.gameInfo,
    culture: over.culture ?? null,
    topGameTier: over.topGameTier ?? null,
  };
}

describe("selectRecipientIntro — anchor-bearing fallback levels", () => {
  it("Level 1 — anchor + culture entry + cultureLine resolves → CULTURE bank", () => {
    const cultureBank = recipientIntroBank("choke_culture");
    const anchor = fakeAnchor({
      name: "Harden",
      culture: fakeCulture({
        controversy: ["Quit on three teams in three seasons."],
        underperform: ["The playoff demons are always lurking."],
      }),
    });
    const line = selectRecipientIntro({
      triggerType: "choke",
      challengerName: "Mike",
      targetScore: 142.5,
      anchor,
    });
    // CULTURE bank lines all include {cultureLine}; after substitution the
    // resulting text must contain ONE of the seeded culture lines verbatim.
    const text = strings(line);
    const culturePhrases = ["Quit on three teams", "playoff demons"];
    expect(culturePhrases.some(p => text.includes(p))).toBe(true);
    expect(text).toContain("Harden");
    expect(text).not.toContain("{cultureLine}");
    expect(text).not.toContain("{name}");
    // Anchor-bearing choke banks all carry the choke stamp.
    expect(stamps(line).some(s => s.stamp === "choke")).toBe(true);
    // targetScore appears in 5 of 6 CULTURE lines — exercised over many
    // runs but skipped here because anti-repeat dedup is nondeterministic
    // on a single call. The voice guardrail (every line carries the
    // choke stamp + cultureLine) is the load-bearing assertion.
  });

  it("Level 2 — anchor present but culture null → NAME bank", () => {
    const nameBank = recipientIntroBank("big_score_name");
    const anchor = fakeAnchor({ name: "Wembanyama", culture: null });
    const line = selectRecipientIntro({
      triggerType: "big_score",
      challengerName: "Mike",
      targetScore: 210.0,
      anchor,
    });
    const text = strings(line);
    expect(text).toContain("Wembanyama");
    expect(text).toContain("Mike");
    expect(text).toContain("210.0");
    // NAME bank doesn't carry {cultureLine}; sanity-check substitution.
    expect(text).not.toContain("{");
    // big_score banks carry the win_tier stamp.
    expect(stamps(line).some(s => s.stamp === "win_tier")).toBe(true);
  });

  it("Level 3 — anchor null but anchor-bearing trigger → GENERIC bank", () => {
    const line = selectRecipientIntro({
      triggerType: "rare_pull",
      challengerName: "Mike",
      targetScore: 280.0,
      anchor: null,
    });
    const text = strings(line);
    expect(text).toContain("Mike");
    expect(text).toContain("280.0");
    expect(text).not.toContain("{");
    expect(stamps(line).some(s => s.stamp === "rare_pull")).toBe(true);
  });

  it("Level 4 — no triggerType → legacy chadChallengeIntro single-string Line", () => {
    const line = selectRecipientIntro({
      triggerType: null,
      challengerName: "Mike",
      targetScore: 100.0,
      anchor: null,
    });
    // Legacy fallback path wraps chadChallengeIntro string as a single
    // string-typed Line. No stamps; one string part.
    expect(line.length).toBe(1);
    expect(typeof line[0]).toBe("string");
    expect((line[0] as string).length).toBeGreaterThan(0);
    // chadChallengeIntro substitutes {name} (= Mike) and {target} (= 100.0).
    expect(line[0]).toContain("100.0");
  });
});

describe("selectRecipientIntro — signatureGames preferred over generic pool", () => {
  it("date + opponent match on anchor.gameInfo → uses the signature line", () => {
    const SIG = "vs IND, the night the math broke.";
    const anchor = fakeAnchor({
      name: "Westbrook",
      gameInfo: { date: "2024-12-02", opponent: "IND" },
      culture: fakeCulture({
        overperform: ["Generic overperform line we do NOT want to see."],
        signatureGames: [
          { date: "2024-12-02", opponent: "IND", line: SIG, fp: 80 },
          { date: "2024-11-11", opponent: "BOS", line: "Different night.", fp: 70 },
        ],
      }),
    });
    // Big_score reads from overperform ∪ signatureGames; the date+opp
    // match path short-circuits and returns the signature line directly.
    const line = selectRecipientIntro({
      triggerType: "big_score",
      challengerName: "Mike",
      targetScore: 200.0,
      anchor,
    });
    expect(strings(line)).toContain(SIG);
  });
});

describe("selectRecipientIntro — miss bucket gap framing", () => {
  it("nearMissGap + nearMissNextTier present → MISS_WITH_GAP bank", () => {
    const line = selectRecipientIntro({
      triggerType: "miss",
      challengerName: "Mike",
      targetScore: 150.0,
      anchor: null,
      nearMissGap: 8,
      nearMissNextTier: "MVP",
    });
    const text = strings(line);
    expect(text).toContain("8 FP");
    expect(text).toContain("Mike");
    // miss stamp with substituted tier
    const missStamp = stamps(line).find(s => s.stamp === "miss");
    expect(missStamp?.tier).toBe("MVP");
  });

  it("nearMissGap null → MISS_GENERIC bank (no gap invention)", () => {
    const line = selectRecipientIntro({
      triggerType: "miss",
      challengerName: "Mike",
      targetScore: 150.0,
      anchor: null,
      nearMissGap: null,
      nearMissNextTier: null,
    });
    const text = strings(line);
    // No invented integer gap, no tier label
    expect(text).not.toMatch(/\d+ FP/);
    expect(text).not.toContain("{nearMissGap}");
    expect(text).not.toContain("{nearMissNextTier}");
    // miss stamp present but with no tier (renderer falls back to context)
    const missStamp = stamps(line).find(s => s.stamp === "miss");
    expect(missStamp?.tier).toBeUndefined();
  });
});

describe("selectRecipientDealNudge — mirrors trigger routing", () => {
  it("choke with culture → CULTURE nudge bank", () => {
    const anchor = fakeAnchor({
      name: "Harden",
      culture: fakeCulture({
        controversy: ["Quit on three teams in three seasons."],
      }),
    });
    const line = selectRecipientDealNudge({
      triggerType: "choke",
      challengerName: "Mike",
      targetScore: 100,
      anchor,
    });
    const text = strings(line);
    expect(text).toContain("Quit on three teams");
    expect(text).not.toContain("{");
  });

  it("no triggerType → DEFAULT nudge bank (non-empty, fully substituted)", () => {
    const line = selectRecipientDealNudge({
      triggerType: null,
      challengerName: "Mike",
      targetScore: 100,
      anchor: null,
    });
    const text = strings(line);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain("{");
  });

  it("rare_pull Stage 1 CULTURE bank substitutes persisted topGameTier into stamps", () => {
    // Stage 1 CULTURE bank for rare_pull: every line carries the
    // {stamp: rare_pull, tier: "{rarePullTier}"} pair, so the substitution
    // path is exercised deterministically on every pick. Stage 2 nudge
    // banks intentionally drop the stamp on some lines for verb-first
    // brevity — substitution correctness is the same regardless.
    const anchor = fakeAnchor({
      name: "Wembanyama",
      culture: fakeCulture({
        overperform: ["Carved a stat line into the league record book."],
        milestones: ["Top-of-draft expectations met on the floor."],
      }),
      topGameTier: "career",
    });
    const line = selectRecipientIntro({
      triggerType: "rare_pull",
      challengerName: "Mike",
      targetScore: 280,
      anchor,
    });
    const rare = stamps(line).find(s => s.stamp === "rare_pull");
    expect(rare?.tier).toBe("career");
  });
});

describe("substitution safety — no orphan placeholders survive", () => {
  // Cycle through each bank key to ensure substitution covers every
  // template token in every bank line.
  const banks: Array<["intro" | "nudge", string]> = [
    ["intro", "choke_culture"],
    ["intro", "choke_name"],
    ["intro", "choke_generic"],
    ["intro", "big_score_culture"],
    ["intro", "big_score_name"],
    ["intro", "big_score_generic"],
    ["intro", "rare_pull_culture"],
    ["intro", "rare_pull_name"],
    ["intro", "rare_pull_generic"],
    ["intro", "miss_with_gap"],
    ["intro", "miss_generic"],
    ["intro", "default"],
    ["nudge", "choke_culture"],
    ["nudge", "choke_name"],
    ["nudge", "choke_generic"],
    ["nudge", "big_score_culture"],
    ["nudge", "big_score_name"],
    ["nudge", "big_score_generic"],
    ["nudge", "rare_pull_culture"],
    ["nudge", "rare_pull_name"],
    ["nudge", "rare_pull_generic"],
    ["nudge", "miss"],
    ["nudge", "default"],
  ];

  it("every bank-line token has a substitution sub", () => {
    // Direct text inspection — the substitution routine should replace
    // {name}, {cultureLine}, {challengerName}, {targetScore},
    // {nearMissGap}, {nearMissNextTier}. Walk every bank line and
    // confirm only these tokens appear (no unexpected ones).
    const ALLOWED = new Set([
      "{name}", "{cultureLine}", "{challengerName}",
      "{targetScore}", "{nearMissGap}", "{nearMissNextTier}",
    ]);
    for (const [kind, key] of banks) {
      const bank = kind === "intro"
        ? recipientIntroBank(key as any)
        : recipientDealNudgeBank(key as any);
      for (const line of bank) {
        for (const part of line) {
          if (typeof part !== "string") continue;
          const tokens = part.match(/\{[a-zA-Z]+\}/g) ?? [];
          for (const t of tokens) {
            expect(ALLOWED.has(t)).toBe(true);
          }
        }
      }
    }
  });
});
