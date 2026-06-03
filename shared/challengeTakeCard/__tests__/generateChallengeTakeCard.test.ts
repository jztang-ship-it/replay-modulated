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
  MISS_ONE_DECISION_THRESHOLD_FP,
  DARES,
  CTAS,
  BANNED_CTAS,
  CORRECTION_DARE_BANNED_SUBSTRINGS,
  SUB_HEADLINE,
} from "../templates";
import type { TakeCardInput, TakeCardTrigger } from "../types";

function input(over: Partial<TakeCardInput> = {}): TakeCardInput {
  return {
    trigger: "choke",
    challengerName: "Mike",
    targetScore: 184.5,
    winTier: "BUST",
    holdsRecorded: true,
    heldCards: [
      { name: "Vucevic", actualFp: 18.5, tier: "PURPLE" },
      { name: "Embiid",  actualFp: 22.0, tier: "RED" },
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
        { name: "Vucevic", actualFp: 18.5, tier: "PURPLE" },
        { name: "Embiid",  actualFp: 22.0, tier: "RED" },
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
        { name: "ShouldNotAppear", actualFp: 0, tier: "RED" },
      ],
    }));
    expect(card.heldCards).toEqual([]);
  });

  it("filters out empty / whitespace-only names from heldCards", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "choke",
      heldCards: [
        { name: "Vucevic", actualFp: 18.5, tier: "PURPLE" },
        { name: "   ",     actualFp: 0,    tier: "RED" },
        { name: "",        actualFp: 0,    tier: "RED" },
        { name: "Embiid",  actualFp: 22.0, tier: "RED" },
      ],
    }));
    expect(card.heldCards).toEqual(["Vucevic", "Embiid"]);
  });
});

describe("generateChallengeTakeCard — evidenceLine (mode-aware framing)", () => {
  it("correction → hand total as stakes ('157.9 FP on the board')", () => {
    const card = generateChallengeTakeCard(input({ trigger: "choke", targetScore: 157.9 }));
    expect(card.evidenceLine).toBe("157.9 FP on the board");
  });

  it("competition with unbeaten attempts → wall framing ('238.7 FP · {n} attempts, still unbeaten')", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "big_score",
      targetScore: 238.7,
      attemptCount: 5,
      winnerCount: 0,
    }));
    expect(card.evidenceLine).toBe("238.7 FP · 5 attempts, still unbeaten");
  });

  it("competition with 1 unbeaten attempt → singular framing", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "big_score",
      targetScore: 232.5,
      attemptCount: 1,
      winnerCount: 0,
    }));
    expect(card.evidenceLine).toBe("232.5 FP · 1 attempt, still standing");
  });

  it("competition with no attempts yet → bare wall framing ('… · the wall')", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "big_score",
      targetScore: 232.5,
      attemptCount: 0,
      winnerCount: 0,
    }));
    expect(card.evidenceLine).toBe("232.5 FP · the wall");
  });

  it("neutral (default) → hand total with 'to beat' framing", () => {
    const card = generateChallengeTakeCard(input({
      trigger: "default",
      targetScore: 184.5,
      anchorName: null,
    }));
    expect(card.evidenceLine).toBe("184.5 FP to beat");
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
  it("correction CTAs assert FIX/PROVE/PLAY energy only — no MATCH or BEAT leak", () => {
    for (const cta of CTAS.correction) {
      expect(cta).toMatch(/PROVE|FIX|PLAY YOUR LINE/);
      expect(cta).not.toMatch(/BEAT|MATCH/);
    }
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

  it("every correction-mode emission across 50 ids × {choke, miss} hits a FIX/PROVE/PLAY CTA", () => {
    for (const trigger of ["choke", "miss"] as const) {
      for (let i = 0; i < 50; i++) {
        const card = generateChallengeTakeCard(input({
          trigger,
          challengeId: `ch_cta_mode_${trigger}_${i}`,
          nearMissGap: trigger === "miss" ? 4 : null,
          nearMissNextTier: trigger === "miss" ? "ALL_STAR" : null,
        }));
        expect(card.ctaText, `${trigger} #${i} CTA drifted from correction energy: ${card.ctaText}`)
          .toMatch(/PROVE|FIX|PLAY YOUR LINE/);
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
