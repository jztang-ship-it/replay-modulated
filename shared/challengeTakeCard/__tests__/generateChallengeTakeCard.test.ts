// shared/challengeTakeCard/__tests__/generateChallengeTakeCard.test.ts
//
// Phase 2c gate suite. Pins the lock's non-negotiables on the reshaped
// 6-field output: take/dare mode-correct, determinism preserved, no
// outcome reference in correction dare, heldCards legacy gate, CTA
// family.

import { describe, expect, it } from "vitest";
import { generateChallengeTakeCard, deriveMode } from "../generateChallengeTakeCard";
import {
  TAKES,
  TAKES_MISS_WIDE_GAP,
  TAKES_CHOKE_ANCHOR_VINDICATED,
  TAKES_CHOKE_ANCHOR_BLAMED,
  TAKES_CHOKE_CULTURE_VINDICATED,
  TAKES_CHOKE_CULTURE_BLAMED,
  MISS_ONE_DECISION_THRESHOLD_FP,
  DARES,
  CTAS,
  BANNED_CTAS,
  CORRECTION_DARE_BANNED_SUBSTRINGS,
  SUB_HEADLINE,
} from "../templates";
import type { TakeCardInput, TakeCardTrigger } from "../types";

// Default held-card ratios land in the MID zone (~0.74) — neither
// "delivered" (>=0.90) nor "tanked" (<0.60) — so the default anchor
// classification is "generic" and existing tests pin the generic
// TAKES.choke bank. 2d-specific tests override actualFp/projectedFp to
// route into the vindicated/blamed branches explicitly.
function input(over: Partial<TakeCardInput> = {}): TakeCardInput {
  return {
    trigger: "choke",
    challengerName: "Mike",
    targetScore: 184.5,
    winTier: "BUST",
    holdsRecorded: true,
    heldCards: [
      { name: "Vucevic", actualFp: 18.5, projectedFp: 25, tier: "PURPLE" },
      { name: "Embiid",  actualFp: 22.0, projectedFp: 30, tier: "RED" },
    ],
    anchorName: "Vucevic",
    nearMissGap: null,
    nearMissNextTier: null,
    bestScore: null,
    attemptCount: 2,
    winnerCount: 0,
    challengeId: "ch_abc123",
    ...over,
  };
}

describe("generateChallengeTakeCard — 6-field shape", () => {
  const triggers: TakeCardTrigger[] = ["rare_pull", "big_score", "choke", "miss", "default"];

  for (const trigger of triggers) {
    it(`${trigger}: all six fields present, no stray {tokens}`, () => {
      const card = generateChallengeTakeCard(input({
        trigger,
        nearMissGap: trigger === "miss" ? 4 : null,
        nearMissNextTier: trigger === "miss" ? "ALL_STAR" : null,
        winTier: trigger === "big_score" || trigger === "rare_pull" ? "ALL_STAR"
               : trigger === "miss" ? "STARTER"
               : "BUST",
        anchorName: trigger === "default" ? null : "Vucevic",
      }));
      expect(card.mode).toMatch(/^(correction|competition|neutral)$/);
      expect(card.take.length, "take must be non-empty").toBeGreaterThan(0);
      expect(card.subHeadline).toBe(SUB_HEADLINE);
      expect(Array.isArray(card.heldCards)).toBe(true);
      expect(card.evidenceLine.length, "evidenceLine must be non-empty").toBeGreaterThan(0);
      expect(card.dare.length, "dare must be non-empty").toBeGreaterThan(0);
      expect(card.ctaText.length, "ctaText must be non-empty").toBeGreaterThan(0);
      for (const field of [card.take, card.subHeadline, card.evidenceLine, card.dare, card.ctaText]) {
        expect(/\{\w+\}/.test(field), `stray token in: ${field}`).toBe(false);
      }
    });
  }
});

describe("generateChallengeTakeCard — DETERMINISM (preserved through reshape)", () => {
  it("same challengeId → identical card across repeated calls (all 5 triggers)", () => {
    const triggers: TakeCardTrigger[] = ["rare_pull", "big_score", "choke", "miss", "default"];
    for (const trigger of triggers) {
      const args = input({
        trigger,
        challengeId: `ch_det_${trigger}`,
        nearMissGap: trigger === "miss" ? 4 : null,
        nearMissNextTier: trigger === "miss" ? "ALL_STAR" : null,
        winTier: trigger === "big_score" || trigger === "rare_pull" ? "ALL_STAR"
               : trigger === "miss" ? "STARTER"
               : "BUST",
        anchorName: trigger === "default" ? null : "Vucevic",
      });
      const a = generateChallengeTakeCard(args);
      const b = generateChallengeTakeCard(args);
      const c = generateChallengeTakeCard(args);
      expect(a, `${trigger}: not deterministic (b != a)`).toEqual(b);
      expect(b, `${trigger}: not deterministic (c != b)`).toEqual(c);
    }
  });

  it("two different challengeIds vary on at least one field across a representative spread", () => {
    const a = generateChallengeTakeCard(input({ challengeId: "ch_aaa" }));
    const b = generateChallengeTakeCard(input({ challengeId: "ch_zzz" }));
    const c = generateChallengeTakeCard(input({ challengeId: "ch_q_q" }));
    const allEqual =
      JSON.stringify(a) === JSON.stringify(b) &&
      JSON.stringify(b) === JSON.stringify(c);
    expect(allEqual, "three distinct ids collapsed to one card — seed not differentiating").toBe(false);
  });
});

describe("generateChallengeTakeCard — MODE-CORRECT take/dare", () => {
  it("choke → correction TAKE family (wasted / should not have / hand had / stars were)", () => {
    const card = generateChallengeTakeCard(input({ trigger: "choke" }));
    expect(card.mode).toBe("correction");
    expect(card.take).toMatch(/WASTED|SHOULD NOT|WINNING SHAPE|STARS WERE/i);
  });

  it("miss small-gap (gap ≤ 7) → 'ONE DECISION' / cut line / cleared the bar family", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "miss",
      nearMissGap: 4,
      nearMissNextTier: "ALL_STAR",
    }));
    expect(card.mode).toBe("correction");
    expect(card.take).toMatch(/ONE DECISION|CUT LINE|CLEARED THE BAR/i);
  });

  // 2c-review overclaim guard. The 5%-of-next-tier miss window
  // stretches up to ~13 FP near LEGEND; "ONE DECISION FROM {tier}" at
  // 11 FP overclaims a 2-3 decision deficit. Above the threshold the
  // take routes to TAKES_MISS_WIDE_GAP and the "ONE DECISION" claim
  // disappears, replaced by "CAME UP SHORT OF {tier}" / cut-line /
  // cleared-the-bar / bar-was-there framings.
  it("miss WIDE-gap (gap > 7) → 'CAME UP SHORT OF {tier}' family, NEVER 'ONE DECISION'", () => {
    for (let i = 0; i < 30; i++) {
      const card = generateChallengeTakeCard(input({
        trigger: "miss",
        nearMissGap: 11,
        nearMissNextTier: "LEGEND",
        challengeId: `ch_miss_wide_${i}`,
      }));
      expect(card.take.toUpperCase(), `wide-gap miss leaked 'ONE DECISION': ${card.take}`).not.toContain("ONE DECISION");
      // Confirm the take is one of the wide-gap family entries
      expect(card.take).toMatch(/CAME UP SHORT|CUT LINE|CLEARED THE BAR|BAR WAS THERE/i);
    }
  });

  it("miss gap exactly at threshold (=7) → still routes to small-gap bank (ONE DECISION allowed)", () => {
    // Threshold semantics: gap > threshold → wide. gap == threshold →
    // still small. The seed at this id+slot lands on a non-"ONE
    // DECISION" smallGap entry; the structural assertion is that the
    // take is sourced from the smallGap bank, NOT wideGap.
    const card = generateChallengeTakeCard(input({
      trigger: "miss",
      nearMissGap: MISS_ONE_DECISION_THRESHOLD_FP, // exactly 7
      nearMissNextTier: "ALL_STAR",
      challengeId: "ch_miss_boundary_7",
    }));
    // The substituted line must appear in the smallGap bank (named or
    // noName); wideGap entries are excluded.
    const smallGapAll = [...TAKES.miss.named, ...TAKES.miss.noName].map(s => s.replace(/\{\w+\}/g, ""));
    const wideGapAll = [...TAKES_MISS_WIDE_GAP.named, ...TAKES_MISS_WIDE_GAP.noName].map(s => s.replace(/\{\w+\}/g, ""));
    const renderedNoTokens = card.take.replace(/[A-Z-]+(?= MISS)|ALL-STAR|MVP|LEGEND/g, "").trim();
    const sourceTakeLines = smallGapAll.map(s => s.trim());
    const wideOnlyLines = wideGapAll
      .filter(w => !sourceTakeLines.some(s => s.includes(w) || w.includes(s)))
      .map(s => s.trim());
    // Either the rendered card matches a smallGap-only line (e.g.
    // "ONE DECISION ..." or "THIS HAND WAS ONE DECISION AWAY") OR it
    // matches a line that's shared between banks ("THIS HAND TOUCHED
    // THE CUT LINE", "ALMOST CLEARED THE BAR. NOT QUITE."). What it
    // must NOT match is a wideGap-only entry ("CAME UP SHORT...",
    // "THE BAR WAS THERE. JUST OUT OF REACH.").
    const matchedWideOnly = wideOnlyLines.some(w => card.take.includes(w));
    expect(matchedWideOnly, `at gap=threshold the take must NOT pull from wideGap-only entries: ${card.take}`).toBe(false);
  });

  it("miss gap=8 (one over threshold) → routes to wide-gap bank", () => {
    for (let i = 0; i < 20; i++) {
      const card = generateChallengeTakeCard(input({
        trigger: "miss",
        nearMissGap: 8,
        nearMissNextTier: "ALL_STAR",
        challengeId: `ch_miss_8_${i}`,
      }));
      expect(card.take.toUpperCase()).not.toContain("ONE DECISION");
    }
  });

  it("TAKES_MISS_WIDE_GAP bank itself contains no 'ONE DECISION' string", () => {
    for (const entry of [...TAKES_MISS_WIDE_GAP.named, ...TAKES_MISS_WIDE_GAP.noName]) {
      expect(entry.toUpperCase(), `wide-gap miss bank entry leaks 'ONE DECISION': ${entry}`).not.toContain("ONE DECISION");
    }
  });

  it("big_score → competition TAKE family (safe / wall / bar / receipt)", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "big_score",
      anchorName: "Curry",
    }));
    expect(card.mode).toBe("competition");
    expect(card.take).toMatch(/SAFE|WALL|BAR|RECEIPT/i);
  });

  it("rare_pull → competition TAKE family (history / record book / historic / once-a-season)", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "rare_pull",
      anchorName: "Wembanyama",
    }));
    expect(card.mode).toBe("competition");
    expect(card.take).toMatch(/HISTORY|RECORD BOOK|HISTORIC|ONCE-A-SEASON/i);
  });

  it("default → neutral TAKE family (same hand / cards on table / posted / same six)", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "default",
      anchorName: null,
    }));
    expect(card.mode).toBe("neutral");
    expect(card.take).toMatch(/SAME HAND|ON THE TABLE|POSTED|SAME SIX/i);
  });

  it("deriveMode mapping is the locked one", () => {
    expect(deriveMode("choke")).toBe("correction");
    expect(deriveMode("miss")).toBe("correction");
    expect(deriveMode("big_score")).toBe("competition");
    expect(deriveMode("rare_pull")).toBe("competition");
    expect(deriveMode("default")).toBe("neutral");
  });

  it("choke DARE is pure-hypothetical — no outcome reference (the FP-spoiler guard)", () => {
    for (let i = 0; i < 30; i++) {
      const card = generateChallengeTakeCard(input({
        trigger: "choke",
        challengeId: `ch_dare_guard_${i}`,
      }));
      const lower = card.dare.toLowerCase();
      for (const banned of CORRECTION_DARE_BANNED_SUBSTRINGS) {
        expect(lower, `choke dare contained outcome ref '${banned}': ${card.dare}`).not.toContain(banned);
      }
    }
  });

  it("miss DARE is pure-hypothetical — no outcome reference", () => {
    for (let i = 0; i < 30; i++) {
      const card = generateChallengeTakeCard(input({
        trigger: "miss",
        nearMissGap: 4,
        nearMissNextTier: "ALL_STAR",
        challengeId: `ch_dare_miss_guard_${i}`,
      }));
      const lower = card.dare.toLowerCase();
      for (const banned of CORRECTION_DARE_BANNED_SUBSTRINGS) {
        expect(lower, `miss dare contained outcome ref '${banned}': ${card.dare}`).not.toContain(banned);
      }
    }
  });

  it("BANK-LEVEL check: every correction-mode dare line contains zero outcome refs", () => {
    for (const trigger of ["choke", "miss"] as const) {
      for (const line of DARES.correction[trigger]) {
        const lower = line.toLowerCase();
        for (const banned of CORRECTION_DARE_BANNED_SUBSTRINGS) {
          expect(lower, `correction dare bank entry contains '${banned}': ${line}`).not.toContain(banned);
        }
      }
    }
  });
});

describe("generateChallengeTakeCard — heldCards (structured, legacy gate)", () => {
  it("holdsRecorded:true → heldCards populated with provided names (trimmed, in input order)", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      holdsRecorded: true,
      heldCards: [
        { name: "Vucevic", actualFp: 18.5, projectedFp: 25, tier: "PURPLE" },
        { name: "Embiid",  actualFp: 22.0, projectedFp: 30, tier: "RED" },
      ],
    }));
    expect(card.heldCards).toEqual(["Vucevic", "Embiid"]);
  });

  it("holdsRecorded:false → heldCards is [] (the landing's held block omits)", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      holdsRecorded: false,
      heldCards: [],
    }));
    expect(card.heldCards).toEqual([]);
  });

  it("holdsRecorded:false IGNORES any heldCards input (defensive — snapshot flag is authoritative)", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      holdsRecorded: false,
      heldCards: [
        { name: "ShouldNotAppear", actualFp: 0, projectedFp: 0, tier: "RED" },
      ],
    }));
    expect(card.heldCards).toEqual([]);
  });

  it("filters out empty / whitespace-only names from heldCards", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      heldCards: [
        { name: "Vucevic", actualFp: 18.5, projectedFp: 25, tier: "PURPLE" },
        { name: "   ",     actualFp: 0,    projectedFp: 0,  tier: "RED" },
        { name: "",        actualFp: 0,    projectedFp: 0,  tier: "RED" },
        { name: "Embiid",  actualFp: 22.0, projectedFp: 30, tier: "RED" },
      ],
    }));
    expect(card.heldCards).toEqual(["Vucevic", "Embiid"]);
  });
});

describe("generateChallengeTakeCard — Phase 2d plain-language stakes (NO raw FP)", () => {
  // Stakes-mapping gates. Each evidenceLine asserts the plain-language
  // word a stranger can read — never the raw FP number.

  it("choke + target < BUST ceiling (173) → BUSTED stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      targetScore: 142.0,
      anchorName: null, // force generic so no fuse
      holdsRecorded: false, // force generic + no fuse
      heldCards: [],
    }));
    // Phase 2e — choke evidence wraps with trailing period.
    expect(card.evidenceLine).toBe("BUSTED.");
  });

  it("choke + target in ROOKIE band (173–202) → BARELY SURVIVED stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      targetScore: 188.0,
      anchorName: null,
      holdsRecorded: false,
      heldCards: [],
    }));
    expect(card.evidenceLine).toBe("BARELY SURVIVED.");
  });

  it("miss narrow gap (≤7) → ONE DECISION SHORT stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "miss",
      nearMissGap: 4,
      nearMissNextTier: "ALL_STAR",
      targetScore: 218.0,
    }));
    expect(card.evidenceLine).toBe("ONE DECISION SHORT");
  });

  it("miss wide gap (>7) → CAME UP SHORT stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "miss",
      nearMissGap: 11,
      nearMissNextTier: "LEGEND",
      targetScore: 260.0,
    }));
    expect(card.evidenceLine).toBe("CAME UP SHORT");
  });

  it("competition 0 attempts → UNBEATEN stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "big_score",
      attemptCount: 0,
      winnerCount: 0,
    }));
    expect(card.evidenceLine).toBe("UNBEATEN");
  });

  it("competition 1 attempt / 0 winners → UNBEATEN stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "big_score",
      attemptCount: 1,
      winnerCount: 0,
    }));
    expect(card.evidenceLine).toBe("UNBEATEN");
  });

  it("competition 2+ attempts / 0 winners → '{N} TRIED. {N} FAILED.' stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "big_score",
      attemptCount: 5,
      winnerCount: 0,
    }));
    expect(card.evidenceLine).toBe("5 TRIED. 5 FAILED.");
  });

  it("competition 2+ attempts / 1+ winners → 'BEEN BEATEN. DO IT AGAIN.' stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "big_score",
      attemptCount: 5,
      winnerCount: 2,
    }));
    expect(card.evidenceLine).toBe("BEEN BEATEN. DO IT AGAIN.");
  });

  it("neutral (default) → 'A NUMBER ON THE BOARD. BEAT IT.' stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "default",
      anchorName: null,
    }));
    expect(card.evidenceLine).toBe("A NUMBER ON THE BOARD. BEAT IT.");
  });

  // The core 2d guard — no raw FP number EVER reaches the rendered fields.
  // This is the spoiler/noise rule: "165.5 FP" is meaningless to a
  // first-timer; the stakes word leads.
  it("NO raw FP anywhere in take/evidenceLine/dare across all triggers × 50 ids", () => {
    const triggers: TakeCardTrigger[] = ["rare_pull", "big_score", "choke", "miss", "default"];
    // Match digits followed (anywhere) by " FP" — the canonical FP-number
    // surface from the 2c "X.X FP on the board" form. Includes optional
    // decimals; case-insensitive.
    const fpNumberRe = /\d+(?:\.\d+)?\s*FP\b/i;
    for (const trigger of triggers) {
      for (let i = 0; i < 50; i++) {
        const card = generateChallengeTakeCard(input({
          trigger,
          challengeId: `ch_no_fp_${trigger}_${i}`,
          targetScore: 200 + i,
          attemptCount: i % 7,
          winnerCount: i % 3,
          nearMissGap: trigger === "miss" ? (i % 13) : null,
          nearMissNextTier: trigger === "miss" ? "ALL_STAR" : null,
          anchorName: trigger === "default" ? null : "Vucevic",
        }));
        for (const field of [card.take, card.evidenceLine, card.dare]) {
          expect(fpNumberRe.test(field), `raw FP leaked into ${trigger} #${i}: ${field}`).toBe(false);
        }
      }
    }
  });
});

describe("generateChallengeTakeCard — Phase 2d anchor-truth branching (choke)", () => {
  // The lock's core correctness gate: the anchor claim must be TRUE to
  // the data. "X WASN'T THE PROBLEM" must NOT fire when X tanked; "EVEN
  // X COULDN'T SAVE IT" must NOT fire when X delivered.

  function chokeHand(overrides: {
    anchorName: string | null;
    held: Array<{ name: string; actualFp: number; projectedFp: number }>;
  }): TakeCardInput {
    return input({
      trigger: "choke",
      targetScore: 142.0,
      anchorName: overrides.anchorName,
      holdsRecorded: true,
      heldCards: overrides.held.map(h => ({ ...h, tier: "RED" })),
    });
  }

  // Bank-level shape check — banks contain the substitution token so
  // routing is observable.
  it("vindicated bank: every entry references {anchorName}", () => {
    for (const line of [...TAKES_CHOKE_ANCHOR_VINDICATED.named, ...TAKES_CHOKE_ANCHOR_VINDICATED.noName]) {
      expect(line).toContain("{anchorName}");
    }
  });

  it("blamed bank: every entry references {anchorName}", () => {
    for (const line of [...TAKES_CHOKE_ANCHOR_BLAMED.named, ...TAKES_CHOKE_ANCHOR_BLAMED.noName]) {
      expect(line).toContain("{anchorName}");
    }
  });

  it("VINDICATED: anchor delivered + other tanked → take vindicates anchor", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe",
      held: [
        { name: "Kobe", actualFp: 47, projectedFp: 50 }, // 0.94 DELIVERED
        { name: "Kidd", actualFp: 12, projectedFp: 35 }, // 0.34 TANKED
      ],
    }));
    expect(card.take).toMatch(/WASN'T THE PROBLEM|DID HIS PART|DON'T BLAME|SHOWED UP\. THE REST/i);
    expect(card.take.toUpperCase()).toContain("KOBE");
  });

  it("BLAMED: anchor tanked → take blames anchor", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe",
      held: [
        { name: "Kobe", actualFp: 18, projectedFp: 50 }, // 0.36 TANKED
        { name: "Kidd", actualFp: 28, projectedFp: 35 }, // 0.80 MID
      ],
    }));
    expect(card.take).toMatch(/EVEN .* COULDN'T SAVE|FORGOT TO SHOW|WAS THE ONE THAT MISSED|BLINKED/i);
    expect(card.take.toUpperCase()).toContain("KOBE");
  });

  it("TRUTH GUARD: anchor delivered but no other tanked → falls to GENERIC (no false 'wasn't the problem')", () => {
    // Both delivered (no contrast) → no honest "anchor wasn't the
    // problem" claim. Must fall to generic.
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe",
      held: [
        { name: "Kobe", actualFp: 47, projectedFp: 50 }, // 0.94 DELIVERED
        { name: "Kidd", actualFp: 33, projectedFp: 35 }, // 0.94 DELIVERED
      ],
    }));
    expect(card.take).toMatch(/WASTED|SHOULD NOT|WINNING SHAPE|STARS WERE/i);
    expect(card.take.toUpperCase()).not.toContain("WASN'T THE PROBLEM");
    expect(card.take.toUpperCase()).not.toContain("COULDN'T SAVE");
  });

  it("TRUTH GUARD: anchor in MID zone (neither delivered nor tanked) → falls to GENERIC", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe",
      held: [
        { name: "Kobe", actualFp: 36, projectedFp: 50 }, // 0.72 MID
        { name: "Kidd", actualFp: 10, projectedFp: 35 }, // 0.286 TANKED
      ],
    }));
    expect(card.take).toMatch(/WASTED|SHOULD NOT|WINNING SHAPE|STARS WERE/i);
    expect(card.take.toUpperCase()).not.toContain("KOBE");
  });

  it("TRUTH GUARD: anchorName not present in heldCards → falls to GENERIC", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Jordan", // not in held set
      held: [
        { name: "Kobe", actualFp: 47, projectedFp: 50 }, // 0.94 DELIVERED
        { name: "Kidd", actualFp: 12, projectedFp: 35 }, // 0.34 TANKED
      ],
    }));
    expect(card.take).toMatch(/WASTED|SHOULD NOT|WINNING SHAPE|STARS WERE/i);
    expect(card.take.toUpperCase()).not.toContain("JORDAN");
  });

  it("TRUTH GUARD: single held card → falls to GENERIC (no 'other' to indict)", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe",
      held: [{ name: "Kobe", actualFp: 47, projectedFp: 50 }], // DELIVERED but solo
    }));
    expect(card.take).toMatch(/WASTED|SHOULD NOT|WINNING SHAPE|STARS WERE/i);
    expect(card.take.toUpperCase()).not.toContain("WASN'T THE PROBLEM");
  });

  it("LEGACY GUARD: holdsRecorded:false → GENERIC take, no anchor name leak", () => {
    // Critical: the actualFp=0 default on legacy rows would otherwise
    // classify a hypothetical anchor as "tanked" (ratio 0). The gate on
    // holdsRecorded:true prevents this false claim. Pass anchorName +
    // populated heldCards (the defensive scenario) and confirm we still
    // fall to generic.
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      holdsRecorded: false,
      anchorName: "Kobe",
      heldCards: [
        { name: "Kobe", actualFp: 0, projectedFp: 50, tier: "RED" },
      ],
    }));
    expect(card.take).toMatch(/WASTED|SHOULD NOT|WINNING SHAPE|STARS WERE/i);
    expect(card.take.toUpperCase()).not.toContain("KOBE");
    expect(card.take.toUpperCase()).not.toContain("COULDN'T SAVE");
    expect(card.take.toUpperCase()).not.toContain("WASN'T THE PROBLEM");
  });

  it("anchor token substitution: vindicated take renders anchor name UPPERCASE, never a stray {anchorName}", () => {
    for (let i = 0; i < 10; i++) {
      const card = generateChallengeTakeCard(chokeHand({
        anchorName: "Kobe",
        held: [
          { name: "Kobe", actualFp: 47, projectedFp: 50 },
          { name: "Kidd", actualFp: 12, projectedFp: 35 },
        ],
      }));
      expect(card.take).not.toMatch(/\{anchorName\}/);
      expect(card.take).toContain("KOBE");
    }
  });

  it("DETERMINISM preserved across the anchor branching (same input → same card)", () => {
    const args = chokeHand({
      anchorName: "Kobe",
      held: [
        { name: "Kobe", actualFp: 47, projectedFp: 50 },
        { name: "Kidd", actualFp: 12, projectedFp: 35 },
      ],
    });
    const a = generateChallengeTakeCard(args);
    const b = generateChallengeTakeCard(args);
    expect(a).toEqual(b);
  });
});

describe("generateChallengeTakeCard — Phase 2e conditional choke evidence (de-dup + prefix)", () => {
  // 2e drops the 2d name fuse ("KOBE AND KIDD. BUSTED.") — the held
  // names already appear in the DENZEL'S LINE block + HOLD badges, so
  // listing them in the stakes line was the third repetition. Replaced
  // with a conditional prefix:
  //   take NAMES anchor (vindicated/blamed/culture)    → bare "BUSTED."
  //   take is GENERIC + ≥2 held                        → "HELD THE STARS. BUSTED."
  //   take is GENERIC + 1 held                         → "HELD THE STAR. BUSTED."
  //   take is GENERIC + 0 held (legacy)                → "BUSTED."
  // Talent-vs-failure tension lives in the prefix when the take can't
  // carry it (generic path).

  it("GENERIC choke + 2 held → evidenceLine prefixed 'HELD THE STARS. BUSTED.'", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      targetScore: 142.0,
      anchorName: null, // force generic — no anchor split
      holdsRecorded: true,
      heldCards: [
        { name: "Kobe", actualFp: 18, projectedFp: 25, tier: "RED" },     // MID
        { name: "Kidd", actualFp: 22, projectedFp: 30, tier: "PURPLE" },  // MID
      ],
    }));
    expect(card.evidenceLine).toBe("HELD THE STARS. BUSTED.");
  });

  it("GENERIC choke + 1 held → evidenceLine singular prefix 'HELD THE STAR. BUSTED.'", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      targetScore: 142.0,
      anchorName: null,
      holdsRecorded: true,
      heldCards: [
        { name: "Kobe", actualFp: 18, projectedFp: 25, tier: "RED" },
      ],
    }));
    expect(card.evidenceLine).toBe("HELD THE STAR. BUSTED.");
  });

  it("ANCHOR-VINDICATED take → evidenceLine is BARE stakes (take already names the anchor)", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      targetScore: 142.0,
      anchorName: "Kobe",
      holdsRecorded: true,
      heldCards: [
        { name: "Kobe", actualFp: 47, projectedFp: 50, tier: "RED" },     // DELIVERED
        { name: "Kidd", actualFp: 12, projectedFp: 35, tier: "PURPLE" },  // TANKED
      ],
    }));
    expect(card.evidenceLine).toBe("BUSTED.");
    expect(card.evidenceLine).not.toContain("HELD THE STAR");
  });

  it("ANCHOR-BLAMED take → evidenceLine is BARE stakes", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      targetScore: 142.0,
      anchorName: "Kobe",
      holdsRecorded: true,
      heldCards: [
        { name: "Kobe", actualFp: 18, projectedFp: 50, tier: "RED" },     // TANKED
        { name: "Kidd", actualFp: 25, projectedFp: 35, tier: "PURPLE" },  // MID
      ],
    }));
    expect(card.evidenceLine).toBe("BUSTED.");
  });

  it("LEGACY choke (0 held) → evidenceLine is BARE stakes (nothing to credit)", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      targetScore: 142.0,
      holdsRecorded: false,
      heldCards: [],
      anchorName: null,
    }));
    expect(card.evidenceLine).toBe("BUSTED.");
    expect(card.evidenceLine).not.toContain("HELD THE STAR");
  });

  // De-dup guard: the names of the held players must NEVER appear in
  // the stakes line — that's the 2d → 2e fix.
  it("DE-DUP: stakes line never contains held player names (no 2d-style fuse)", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      targetScore: 142.0,
      anchorName: null,
      holdsRecorded: true,
      heldCards: [
        { name: "Kobe", actualFp: 18, projectedFp: 25, tier: "RED" },
        { name: "Kidd", actualFp: 22, projectedFp: 30, tier: "PURPLE" },
      ],
    }));
    expect(card.evidenceLine.toUpperCase()).not.toContain("KOBE");
    expect(card.evidenceLine.toUpperCase()).not.toContain("KIDD");
  });
});

describe("generateChallengeTakeCard — Phase 2e culture-flavored anchor takes", () => {
  // Layered on top of 2d anchor-truth. When the anchor has a CultureShape
  // with an iconic nickname, the take uses {nickname}. No culture / no
  // iconic nickname → falls through to 2d non-culture anchor banks.
  // Fail-safe: NEVER emit a broken {nickname} token.

  function chokeHand(overrides: {
    anchorName: string | null;
    anchorCulture?: TakeCardInput["anchorCulture"];
    held: Array<{ name: string; actualFp: number; projectedFp: number }>;
  }): TakeCardInput {
    return input({
      trigger: "choke",
      targetScore: 142.0,
      anchorName: overrides.anchorName,
      anchorCulture: overrides.anchorCulture ?? null,
      holdsRecorded: true,
      heldCards: overrides.held.map(h => ({ ...h, tier: "RED" })),
    });
  }

  it("CULTURE-VINDICATED: anchor delivered + other tanked + nickname → 'MAMBA …' take", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe Bryant",
      anchorCulture: { nicknames: ["Black Mamba", "Mamba", "Vino"] },
      held: [
        { name: "Kobe Bryant", actualFp: 47, projectedFp: 50 }, // DELIVERED
        { name: "Jason Kidd",  actualFp: 12, projectedFp: 35 }, // TANKED
      ],
    }));
    // Culture vindicated bank lines all contain {nickname}; substituted
    // it must contain one of: BLACK MAMBA / MAMBA / VINO.
    expect(card.take).toMatch(/BLACK MAMBA|MAMBA|VINO/);
    expect(card.take).toMatch(/DID HIS PART|DON'T BLAME|SHOWED UP|YOU DON'T WASTE/);
    expect(card.take).not.toMatch(/\{nickname\}/);
    expect(card.take).not.toMatch(/\{anchorName\}/);
  });

  it("CULTURE-BLAMED: anchor tanked + nickname → 'EVEN MAMBA …' take", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe Bryant",
      anchorCulture: { nicknames: ["Black Mamba", "Mamba", "Vino"] },
      held: [
        { name: "Kobe Bryant", actualFp: 18, projectedFp: 50 }, // TANKED
        { name: "Jason Kidd",  actualFp: 25, projectedFp: 35 }, // MID
      ],
    }));
    expect(card.take).toMatch(/BLACK MAMBA|MAMBA|VINO/);
    expect(card.take).toMatch(/WENT QUIET|FORGOT TO SHOW|BLINKED|BUILT AROUND/);
    expect(card.take).not.toMatch(/\{nickname\}/);
  });

  it("FALLBACK — no culture → 2d anchor bank ('KOBE WASN'T THE PROBLEM')", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe Bryant",
      anchorCulture: null,
      held: [
        { name: "Kobe Bryant", actualFp: 47, projectedFp: 50 },
        { name: "Jason Kidd",  actualFp: 12, projectedFp: 35 },
      ],
    }));
    expect(card.take.toUpperCase()).toContain("KOBE BRYANT");
    expect(card.take).toMatch(/WASN'T THE PROBLEM|DID HIS PART|DON'T BLAME|SHOWED UP/);
    expect(card.take).not.toMatch(/\{nickname\}/);
  });

  it("FALLBACK — culture with NO iconic nickname → 2d anchor bank (no broken token)", () => {
    // Nicknames present but all match first/last name → not iconic → falls
    // to 2d behavior. Critical: must NOT emit "{nickname}" as a stray.
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe Bryant",
      anchorCulture: { nicknames: ["Kobe", "Bryant", "Kob"] }, // all non-iconic
      held: [
        { name: "Kobe Bryant", actualFp: 47, projectedFp: 50 },
        { name: "Jason Kidd",  actualFp: 12, projectedFp: 35 },
      ],
    }));
    expect(card.take).not.toMatch(/\{nickname\}/);
    expect(card.take.toUpperCase()).toContain("KOBE BRYANT");
  });

  it("FAIL-SAFE — empty nicknames array → 2d fallback, no broken {nickname} token", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe Bryant",
      anchorCulture: { nicknames: [] },
      held: [
        { name: "Kobe Bryant", actualFp: 47, projectedFp: 50 },
        { name: "Jason Kidd",  actualFp: 12, projectedFp: 35 },
      ],
    }));
    expect(card.take).not.toMatch(/\{nickname\}/);
    expect(card.take.toUpperCase()).toContain("KOBE BRYANT");
  });

  it("GENERIC anchor-truth (MID zone) → culture nickname does NOT fire (only vindicated/blamed branches use culture)", () => {
    const card = generateChallengeTakeCard(chokeHand({
      anchorName: "Kobe Bryant",
      anchorCulture: { nicknames: ["Black Mamba", "Mamba"] },
      held: [
        { name: "Kobe Bryant", actualFp: 38, projectedFp: 50 }, // 0.76 MID
        { name: "Jason Kidd",  actualFp: 26, projectedFp: 35 }, // 0.74 MID
      ],
    }));
    expect(card.take).toMatch(/WASTED|SHOULD NOT|WINNING SHAPE|STARS WERE/i);
    expect(card.take.toUpperCase()).not.toContain("MAMBA");
  });

  it("LEGACY (holdsRecorded:false) → no culture flavor, take generic, no name leak", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      holdsRecorded: false,
      anchorName: "Kobe Bryant",
      anchorCulture: { nicknames: ["Black Mamba"] }, // ignored on legacy
      heldCards: [],
    }));
    expect(card.take).toMatch(/WASTED|SHOULD NOT|WINNING SHAPE|STARS WERE/i);
    expect(card.take.toUpperCase()).not.toContain("MAMBA");
    expect(card.take.toUpperCase()).not.toContain("KOBE");
  });

  it("DETERMINISM — culture-flavored same input → same card", () => {
    const args = chokeHand({
      anchorName: "Kobe Bryant",
      anchorCulture: { nicknames: ["Black Mamba", "Mamba", "Vino"] },
      held: [
        { name: "Kobe Bryant", actualFp: 47, projectedFp: 50 },
        { name: "Jason Kidd",  actualFp: 12, projectedFp: 35 },
      ],
    });
    const a = generateChallengeTakeCard(args);
    const b = generateChallengeTakeCard(args);
    expect(a).toEqual(b);
  });

  // Bank hygiene — culture banks must always reference {nickname}.
  it("BANK SHAPE — every culture-flavored entry references {nickname}", () => {
    for (const line of [...TAKES_CHOKE_CULTURE_VINDICATED.named, ...TAKES_CHOKE_CULTURE_VINDICATED.noName]) {
      expect(line).toContain("{nickname}");
    }
    for (const line of [...TAKES_CHOKE_CULTURE_BLAMED.named, ...TAKES_CHOKE_CULTURE_BLAMED.noName]) {
      expect(line).toContain("{nickname}");
    }
  });

  // No raw FP guard preserved through 2e additions.
  it("NO RAW FP across culture-flavored emissions × 50 seeds", () => {
    const fpRe = /\d+(?:\.\d+)?\s*FP\b/i;
    for (let i = 0; i < 50; i++) {
      const card = generateChallengeTakeCard(chokeHand({
        anchorName: "Kobe Bryant",
        anchorCulture: { nicknames: ["Black Mamba", "Mamba", "Vino"] },
        held: [
          { name: "Kobe Bryant", actualFp: 47, projectedFp: 50 },
          { name: "Jason Kidd",  actualFp: 12, projectedFp: 35 },
        ],
      }));
      for (const field of [card.take, card.evidenceLine, card.dare]) {
        expect(fpRe.test(field), `2e culture #${i} leaked raw FP: ${field}`).toBe(false);
      }
    }
  });
});

describe("generateChallengeTakeCard — named / noName TAKE routing", () => {
  it("competition big_score with named challenger → {challengerName} substitution fires across a spread of seeds", () => {
    let sawNamed = false;
    for (let i = 0; i < 20; i++) {
      const card = generateChallengeTakeCard(input({
        trigger: "big_score",
        challengerName: "Mike",
        challengeId: `ch_named_${i}`,
      }));
      if (card.take.includes("Mike")) sawNamed = true;
    }
    expect(sawNamed, "named bank's {challengerName} substitution never fired across 20 seeds").toBe(true);
  });

  it("competition big_score with null challenger → no name leak, no stray token", () => {
    for (let i = 0; i < 20; i++) {
      const card = generateChallengeTakeCard(input({
        trigger: "big_score",
        challengerName: null,
        challengeId: `ch_noname_${i}`,
      }));
      expect(card.take, `noName TAKE leaked stray token: ${card.take}`).not.toMatch(/\{\w+\}/);
      expect(card.take).not.toContain("Mike");
    }
  });
});

describe("generateChallengeTakeCard — CTA family lock", () => {
  it("CTA bank itself contains none of the banned phrases", () => {
    const flat = [...CTAS.correction, ...CTAS.competition, ...CTAS.neutral];
    for (const cta of flat) {
      for (const banned of BANNED_CTAS) {
        expect(cta.toUpperCase()).not.toContain(banned.toUpperCase());
      }
    }
  });

  it("never emits a banned CTA across 50 ids × every trigger", () => {
    const triggers: TakeCardTrigger[] = ["rare_pull", "big_score", "choke", "miss", "default"];
    for (const trigger of triggers) {
      for (let i = 0; i < 50; i++) {
        const card = generateChallengeTakeCard(input({
          trigger,
          challengeId: `ch_cta_${trigger}_${i}`,
          nearMissGap: trigger === "miss" ? 4 : null,
          nearMissNextTier: trigger === "miss" ? "ALL_STAR" : null,
          anchorName: trigger === "default" ? null : "Vucevic",
        }));
        const upper = card.ctaText.toUpperCase();
        for (const banned of BANNED_CTAS) {
          expect(upper, `${trigger} #${i} emitted banned CTA: ${card.ctaText}`).not.toContain(banned.toUpperCase());
        }
      }
    }
  });

  // 2c-review mode coherence — the CTAs must reinforce the mode, not
  // pick randomly across it. Pre-fix bank had "TAKE THE SAME HAND" in
  // competition and "PLAY YOUR LINE" in every mode, so a determinism
  // seed could land choke on "TAKE THE SAME HAND" (no correction
  // energy) or big_score on "PLAY YOUR LINE" (no competition energy).
  // Post-fix banks split clean: correction is FIX/PROVE/PLAY,
  // competition is BEAT/MATCH, neutral is PLAY/TAKE.
  // Phase 2d adds "DO IT BETTER" to the correction bank — same
  // FIX/PROVE/PLAY energy spectrum, names the correction.
  it("correction CTAs assert FIX/PROVE/PLAY/DO BETTER energy only — no MATCH or BEAT leak", () => {
    for (const cta of CTAS.correction) {
      expect(cta).toMatch(/PROVE|FIX|PLAY YOUR LINE|DO IT BETTER/);
      expect(cta).not.toMatch(/BEAT|MATCH/);
    }
  });

  it("correction CTAs include the Phase 2d 'DO IT BETTER' entry", () => {
    expect(CTAS.correction).toContain("DO IT BETTER");
  });

  it("competition CTAs assert BEAT/MATCH energy only — no PROVE/FIX/TAKE leak", () => {
    for (const cta of CTAS.competition) {
      expect(cta).toMatch(/BEAT|MATCH/);
      expect(cta).not.toMatch(/PROVE|FIX|TAKE THE SAME|PLAY YOUR LINE/);
    }
  });

  it("neutral CTAs are PLAY YOUR LINE / TAKE THE SAME HAND only", () => {
    expect(CTAS.neutral).toEqual(["PLAY YOUR LINE", "TAKE THE SAME HAND"]);
  });

  it("every correction-mode emission across 50 ids × {choke, miss} hits a FIX/PROVE/PLAY/DO BETTER CTA", () => {
    for (const trigger of ["choke", "miss"] as const) {
      for (let i = 0; i < 50; i++) {
        const card = generateChallengeTakeCard(input({
          trigger,
          challengeId: `ch_cta_mode_${trigger}_${i}`,
          nearMissGap: trigger === "miss" ? 4 : null,
          nearMissNextTier: trigger === "miss" ? "ALL_STAR" : null,
        }));
        expect(card.ctaText, `${trigger} #${i} CTA drifted from correction energy: ${card.ctaText}`)
          .toMatch(/PROVE|FIX|PLAY YOUR LINE|DO IT BETTER/);
      }
    }
  });

  it("every competition-mode emission across 50 ids × {big_score, rare_pull} hits a BEAT/MATCH CTA", () => {
    for (const trigger of ["big_score", "rare_pull"] as const) {
      for (let i = 0; i < 50; i++) {
        const card = generateChallengeTakeCard(input({
          trigger,
          challengeId: `ch_cta_mode_${trigger}_${i}`,
          anchorName: "Curry",
        }));
        expect(card.ctaText, `${trigger} #${i} CTA drifted from competition energy: ${card.ctaText}`)
          .toMatch(/BEAT|MATCH/);
      }
    }
  });
});

describe("generateChallengeTakeCard — bank hygiene", () => {
  it("every bank entry is a non-empty trimmed string", () => {
    const all: string[] = [
      ...Object.values(TAKES).flatMap(b => [...b.named, ...b.noName]),
      ...Object.values(DARES).flatMap(modeBanks => Object.values(modeBanks).flat()),
      ...Object.values(CTAS).flat(),
    ];
    for (const s of all) {
      expect(typeof s).toBe("string");
      expect(s.length, "empty bank entry").toBeGreaterThan(0);
      expect(s, "bank entry has leading/trailing whitespace").toBe(s.trim());
    }
  });
});
