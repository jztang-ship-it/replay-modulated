// shared/components/__tests__/landingHeadlines.test.ts
//
// RD5.1 — unit tests for the headline / seal / CTA system. Spec:
// docs/rd5-1-headline-system-spec.md. These tests are pure (no React,
// no DOM); the component tests in ChallengeTakeCardLanding.test.tsx
// cover the rendered surface.

import { describe, it, expect } from "vitest";
import {
  pickHeadlineAndCta,
  formatHeldNamesForHeadline,
  resolveSealLabel,
  headlineContainsForbiddenWord,
  forbiddenWordsForTrigger,
  CHOKE_SETUP_VERBS,
  CHOKE_CONSEQUENCE_DEFAULT,
  CHOKE_CONSEQUENCE_ALTERNATES,
  FALLBACK_CTA,
} from "../landingHeadlines";
import type { TakeCardTrigger } from "@shared/challengeTakeCard/types";

// ── Name listing ─────────────────────────────────────────────────────────

describe("formatHeldNamesForHeadline — spec §Name rules", () => {
  it("0 held → HIS STARS (defensive: usually paired with the no-held-cards branch upstream)", () => {
    expect(formatHeldNamesForHeadline([])).toBe("HIS STARS");
  });
  it("1 held → last name, uppercase", () => {
    expect(formatHeldNamesForHeadline(["James Harden"])).toBe("HARDEN");
    expect(formatHeldNamesForHeadline(["Stephen Curry"])).toBe("CURRY");
  });
  it("2 held → 'A AND B', both last names uppercased", () => {
    expect(formatHeldNamesForHeadline(["James Harden", "Bradley Beal"])).toBe("HARDEN AND BEAL");
  });
  it("3+ held → HIS STARS (the bucket label; the cards carry the full roster)", () => {
    expect(formatHeldNamesForHeadline(["James Harden", "Bradley Beal", "Stephen Curry"])).toBe("HIS STARS");
    expect(formatHeldNamesForHeadline(["A", "B", "C", "D"])).toBe("HIS STARS");
  });
  it("single-token name still uppercases (defensive)", () => {
    expect(formatHeldNamesForHeadline(["Giannis"])).toBe("GIANNIS");
  });
});

// ── Seal label resolution ────────────────────────────────────────────────

describe("resolveSealLabel — spec §Stamp = evidence", () => {
  it("choke → CHOKE", () => {
    expect(resolveSealLabel("choke")).toBe("CHOKE");
  });
  it("big_score → BIG SCORE", () => {
    expect(resolveSealLabel("big_score")).toBe("BIG SCORE");
  });
  it("default → null (no seal)", () => {
    expect(resolveSealLabel("default")).toBeNull();
  });
  it("miss + ALL_STAR → 'ALL STAR MISS' (no NEAR MISS; underscore→space)", () => {
    expect(resolveSealLabel("miss", "ALL_STAR")).toBe("ALL STAR MISS");
  });
  it("miss + MVP → 'MVP MISS'", () => {
    expect(resolveSealLabel("miss", "MVP")).toBe("MVP MISS");
  });
  it("miss + LEGEND → 'LEGEND MISS'", () => {
    expect(resolveSealLabel("miss", "LEGEND")).toBe("LEGEND MISS");
  });
  it("miss + empty tier → bare 'MISS' (defensive fallback)", () => {
    expect(resolveSealLabel("miss", "")).toBe("MISS");
    expect(resolveSealLabel("miss", null)).toBe("MISS");
    expect(resolveSealLabel("miss", undefined)).toBe("MISS");
  });
  it("rare_pull + topGameTier maps to the verified label set", () => {
    expect(resolveSealLabel("rare_pull", null, "record")).toBe("NEW RECORD");
    expect(resolveSealLabel("rare_pull", null, "career")).toBe("CAREER HIGH");
    expect(resolveSealLabel("rare_pull", null, "season")).toBe("SEASON HIGH");
  });
  it("rare_pull + no topGameTier → 'RARE PULL' fallback", () => {
    expect(resolveSealLabel("rare_pull")).toBe("RARE PULL");
    expect(resolveSealLabel("rare_pull", null, null)).toBe("RARE PULL");
  });
});

// ── Per-trigger headline + CTA ──────────────────────────────────────────

describe("pickHeadlineAndCta — spec §Voice profiles", () => {
  const baseArgs = { challengerName: "John", heldNamesList: ["James Harden", "Bradley Beal"] };

  it("choke — worked example: TRUSTED + THE CALL COST HIM + MAKE THE BETTER CALL + CHOKE seal", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "choke" });
    expect(out.headline).toBe("JOHN TRUSTED HARDEN AND BEAL. THE CALL COST HIM.");
    expect(out.ctaLabel).toBe("MAKE THE BETTER CALL");
    expect(out.sealLabel).toBe("CHOKE");
  });
  it("big_score — JOHN PUT TOGETHER A MONSTER HAND + TRY TO TOP IT + BIG SCORE seal", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "big_score" });
    expect(out.headline).toBe("JOHN PUT TOGETHER A MONSTER HAND.");
    expect(out.ctaLabel).toBe("TRY TO TOP IT");
    expect(out.sealLabel).toBe("BIG SCORE");
  });
  it("rare_pull — FOUND SOMETHING NOBODY SAW COMING + TAKE YOUR SHOT + tier seal", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "rare_pull", topGameTier: "career" });
    expect(out.headline).toBe("JOHN FOUND SOMETHING NOBODY SAW COMING.");
    expect(out.ctaLabel).toBe("TAKE YOUR SHOT");
    expect(out.sealLabel).toBe("CAREER HIGH");
  });
  it("miss — ONE SWAP STOOD BETWEEN JOHN AND GREATNESS + FIND THE SWAP + tier seal (tier-agnostic headline)", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "miss", missTier: "MVP" });
    expect(out.headline).toBe("ONE SWAP STOOD BETWEEN JOHN AND GREATNESS.");
    expect(out.ctaLabel).toBe("FIND THE SWAP");
    expect(out.sealLabel).toBe("MVP MISS");
  });
  it("miss headline is tier-agnostic — same string for all three miss tiers", () => {
    const a = pickHeadlineAndCta({ ...baseArgs, trigger: "miss", missTier: "ALL_STAR" }).headline;
    const b = pickHeadlineAndCta({ ...baseArgs, trigger: "miss", missTier: "MVP" }).headline;
    const c = pickHeadlineAndCta({ ...baseArgs, trigger: "miss", missTier: "LEGEND" }).headline;
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
  it("default — JOHN SET THE BAR + CLEAR IT + NO seal", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "default" });
    expect(out.headline).toBe("JOHN SET THE BAR.");
    expect(out.ctaLabel).toBe("CLEAR IT");
    expect(out.sealLabel).toBeNull();
  });
  it("challenger name uppercased in every trigger", () => {
    for (const trigger of ["choke", "big_score", "rare_pull", "miss", "default"] as TakeCardTrigger[]) {
      const out = pickHeadlineAndCta({ ...baseArgs, trigger });
      expect(out.headline).toContain("JOHN");
      expect(out.headline).not.toContain("john");
    }
  });
});

// ── No-duplication guardrail (spec §Governing principle) ────────────────

describe("headlineContainsForbiddenWord — spec §Governing principle (no-duplication)", () => {
  it("every spec-canonical headline PASSES its own trigger's forbidden vocabulary", () => {
    const cases: Array<{ trigger: TakeCardTrigger; missTier?: string; topGameTier?: "record" | "career" | "season" }> = [
      { trigger: "choke" },
      { trigger: "big_score" },
      { trigger: "rare_pull", topGameTier: "career" },
      { trigger: "miss", missTier: "MVP" },
      { trigger: "default" },
    ];
    for (const c of cases) {
      const { headline } = pickHeadlineAndCta({
        challengerName: "John",
        heldNamesList: ["James Harden", "Bradley Beal"],
        trigger: c.trigger,
        missTier: c.missTier ?? null,
        topGameTier: c.topGameTier ?? null,
      });
      const result = headlineContainsForbiddenWord(c.trigger, headline);
      expect(result.hit, `headline "${headline}" tripped trigger ${c.trigger}`).toBe(false);
    }
  });

  it("catches the obvious choke duplication: 'JOHN CHOKED THIS HAND'", () => {
    const r = headlineContainsForbiddenWord("choke", "JOHN CHOKED THIS HAND");
    expect(r.hit).toBe(true);
    if (r.hit) expect(r.word).toBe("choked");
  });

  it("catches BIG and SCORE on big_score, including inflections", () => {
    expect(headlineContainsForbiddenWord("big_score", "JOHN HAD A BIG NIGHT").hit).toBe(true);
    expect(headlineContainsForbiddenWord("big_score", "JOHN SCORED 200").hit).toBe(true);
    expect(headlineContainsForbiddenWord("big_score", "WHAT A SCORING DISPLAY").hit).toBe(true);
  });

  it("whole-word match: 'SCOREBOARD' does NOT trip the 'score' guard on big_score", () => {
    expect(headlineContainsForbiddenWord("big_score", "WATCH THE SCOREBOARD").hit).toBe(false);
  });

  it("case-insensitive: lower-case duplicates still fail", () => {
    expect(headlineContainsForbiddenWord("choke", "what a choke job").hit).toBe(true);
  });

  it("catches the rare_pull duplications spec calls out (record / career / season + rare / pull)", () => {
    expect(headlineContainsForbiddenWord("rare_pull", "JOHN HIT A CAREER HIGH").hit).toBe(true);
    expect(headlineContainsForbiddenWord("rare_pull", "JOHN SET A RECORD").hit).toBe(true);
    expect(headlineContainsForbiddenWord("rare_pull", "SEASON DEFINING NIGHT").hit).toBe(true);
    expect(headlineContainsForbiddenWord("rare_pull", "RARE NIGHT").hit).toBe(true);
    expect(headlineContainsForbiddenWord("rare_pull", "A PULL FROM A DIFFERENT GALAXY").hit).toBe(true);
  });

  it("catches the miss duplications (miss / missed / missing)", () => {
    expect(headlineContainsForbiddenWord("miss", "JOHN MISSED BY ONE").hit).toBe(true);
    expect(headlineContainsForbiddenWord("miss", "ONE BUCKET MISSING").hit).toBe(true);
  });

  it("default trigger has no forbidden vocabulary (no seal → no duplication possible)", () => {
    expect(forbiddenWordsForTrigger("default")).toEqual([]);
    expect(headlineContainsForbiddenWord("default", "JOHN SET THE BAR.").hit).toBe(false);
  });
});

// ── Choke alternates + setup verbs are documented (spec §choke) ────────

describe("Choke spec — alternates and setup verbs are on the tree (no A/B harness)", () => {
  it("THE CALL COST HIM is the build default; alternates are documented but not wired", () => {
    expect(CHOKE_CONSEQUENCE_DEFAULT).toBe("THE CALL COST HIM.");
    expect(CHOKE_CONSEQUENCE_ALTERNATES).toContain("IT COST HIM.");
    expect(CHOKE_CONSEQUENCE_ALTERNATES).toContain("WRONG CALL.");
  });
  it("setup-verb pool matches the spec list", () => {
    expect(CHOKE_SETUP_VERBS).toEqual([
      "TRUSTED",
      "BACKED",
      "RODE WITH",
      "BET ON",
      "STUCK WITH",
      "HANDED THE KEYS TO",
    ]);
  });
  it("none of the choke alternates contains 'choke' (would self-violate the guardrail)", () => {
    for (const alt of [CHOKE_CONSEQUENCE_DEFAULT, ...CHOKE_CONSEQUENCE_ALTERNATES]) {
      expect(headlineContainsForbiddenWord("choke", `JOHN BET ON HIM. ${alt}`).hit).toBe(false);
    }
  });
});

// ── Fallback CTA is exported (so callers can reuse the same string) ─────

describe("Fallback CTA", () => {
  it("exposes the ACCEPT CHALLENGE fallback string", () => {
    expect(FALLBACK_CTA).toBe("ACCEPT CHALLENGE");
  });
});
