// shared/components/__tests__/landingHeadlines.test.ts
//
// RD5.1 v3 — unit tests for the headline / seal / CTA system. Spec:
// docs/rd5-1-headline-system-spec.md (v3). These are pure (no React,
// no DOM); the component tests in ChallengeTakeCardLanding.test.tsx
// cover the rendered surface.

import { describe, it, expect } from "vitest";
import {
  pickHeadlineAndCta,
  formatHeldNamesForHeadline,
  resolveSeal,
  forbiddenTokensFromSeal,
  headlineContainsSealVocabulary,
  HOLD_VERBS,
  CHOKE_CONSEQUENCE_DEFAULT,
  CHOKE_CONSEQUENCE_ALTERNATES,
  FALLBACK_CTA,
} from "../landingHeadlines";
import type { TakeCardTrigger } from "@shared/challengeTakeCard/types";
import type { WinTierKey } from "@shared/utils/payoutLogic";

// ── Name listing ─────────────────────────────────────────────────────────

describe("formatHeldNamesForHeadline — spec §Name rules", () => {
  it("0 held → HIS STARS (defensive, usually paired with the no-held-cards branch upstream)", () => {
    expect(formatHeldNamesForHeadline([])).toBe("HIS STARS");
  });
  it("1 held → last name, uppercase", () => {
    expect(formatHeldNamesForHeadline(["James Harden"])).toBe("HARDEN");
    expect(formatHeldNamesForHeadline(["Stephen Curry"])).toBe("CURRY");
  });
  it("2 held → 'A AND B', both last names uppercased", () => {
    expect(formatHeldNamesForHeadline(["James Harden", "Bradley Beal"])).toBe("HARDEN AND BEAL");
  });
  it("3+ held → HIS STARS", () => {
    expect(formatHeldNamesForHeadline(["James Harden", "Bradley Beal", "Stephen Curry"])).toBe("HIS STARS");
  });
});

// ── Seal resolution (mirrors TierGauge) ──────────────────────────────────

describe("resolveSeal — spec §Stamp = evidence (mirrors TierGauge.tsx)", () => {
  it("choke → CHOKE with red gradient", () => {
    const s = resolveSeal({ trigger: "choke" });
    expect(s).not.toBeNull();
    expect(s!.label).toBe("CHOKE");
    expect(s!.background).toContain("#ef4444");
  });

  it("miss + MVP → 'MVP MISS' with amber gradient", () => {
    const s = resolveSeal({ trigger: "miss", missTier: "MVP" });
    expect(s!.label).toBe("MVP MISS");
    expect(s!.background).toContain("#f59e0b");
  });

  it("miss + ALL_STAR → 'ALL STAR MISS' (underscore→space)", () => {
    expect(resolveSeal({ trigger: "miss", missTier: "ALL_STAR" })!.label).toBe("ALL STAR MISS");
  });

  it("miss + null tier → bare MISS fallback", () => {
    expect(resolveSeal({ trigger: "miss" })!.label).toBe("MISS");
  });

  it("big_score → tier label only, NOT 'BIG SCORE'", () => {
    const legend = resolveSeal({ trigger: "big_score", winTier: "LEGEND" });
    expect(legend!.label).toBe("LEGEND");
    expect(legend!.label).not.toBe("BIG SCORE");
    expect(legend!.background).toBe("#EF4444");

    const mvp = resolveSeal({ trigger: "big_score", winTier: "MVP" });
    expect(mvp!.label).toBe("MVP");
    expect(mvp!.background).toBe("#FB923C");

    const allstar = resolveSeal({ trigger: "big_score", winTier: "ALL_STAR" });
    expect(allstar!.label).toBe("ALL-STAR"); // hyphen, matches TIER_CFG
    expect(allstar!.background).toBe("#C084FC");
  });

  it("big_score with cross-season threshold drift (winTier falls below eligibility) → soft-fails to ALL-STAR", () => {
    // Real failure mode: sender hit MVP at season X (235 threshold);
    // recipient renders under season Y (248 MVP); same 240 FP value now
    // calculateWinTier-resolves to STARTER. Don't render a "STARTER"
    // seal under a big_score trigger.
    const s = resolveSeal({ trigger: "big_score", winTier: "STARTER" });
    expect(s!.label).toBe("ALL-STAR");
  });

  it("big_score with null winTier → soft-fails to ALL-STAR", () => {
    expect(resolveSeal({ trigger: "big_score", winTier: null })!.label).toBe("ALL-STAR");
    expect(resolveSeal({ trigger: "big_score" })!.label).toBe("ALL-STAR");
  });

  it("rare_pull → bare RECORD / CAREER HIGH / SEASON HIGH (NO 'NEW' prefix — matches TierGauge)", () => {
    expect(resolveSeal({ trigger: "rare_pull", topGameTier: "record" })!.label).toBe("RECORD");
    expect(resolveSeal({ trigger: "rare_pull", topGameTier: "career" })!.label).toBe("CAREER HIGH");
    expect(resolveSeal({ trigger: "rare_pull", topGameTier: "season" })!.label).toBe("SEASON HIGH");
    expect(resolveSeal({ trigger: "rare_pull", topGameTier: "record" })!.label).not.toContain("NEW");
  });

  it("rare_pull with no topGameTier → defensive 'RARE PULL' fallback", () => {
    expect(resolveSeal({ trigger: "rare_pull" })!.label).toBe("RARE PULL");
  });

  it("default → null (no seal)", () => {
    expect(resolveSeal({ trigger: "default" })).toBeNull();
  });
});

// ── Per-trigger headline + CTA (v3 — HELD verb, KEEP CTAs) ──────────────

describe("pickHeadlineAndCta — spec §Voice profiles (v3)", () => {
  const baseArgs = { challengerName: "John", heldNamesList: ["James Harden", "Bradley Beal"] };

  it("choke — JOHN HELD HARDEN AND BEAL. IT COST HIM. + CHOKE seal + KEEP THE RIGHT ONES cta", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "choke" });
    expect(out.headline).toBe("JOHN HELD HARDEN AND BEAL. IT COST HIM.");
    expect(out.seal!.label).toBe("CHOKE");
    expect(out.ctaLabel).toBe("KEEP THE RIGHT ONES");
  });

  it("big_score — JOHN HELD HIS STARS AND THEY DELIVERED. + tier seal + TRY TO TOP IT cta", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "big_score", winTier: "MVP" });
    expect(out.headline).toBe("JOHN HELD HIS STARS AND THEY DELIVERED.");
    expect(out.seal!.label).toBe("MVP");
    expect(out.ctaLabel).toBe("TRY TO TOP IT");
  });

  it("rare_pull — JOHN FOUND SOMETHING NOBODY SAW COMING. + tier seal + TAKE YOUR SHOT cta", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "rare_pull", topGameTier: "career" });
    expect(out.headline).toBe("JOHN FOUND SOMETHING NOBODY SAW COMING.");
    expect(out.seal!.label).toBe("CAREER HIGH");
    expect(out.ctaLabel).toBe("TAKE YOUR SHOT");
  });

  it("miss — JOHN WAS ONE KEEP AWAY FROM GREATNESS + tier seal + KEEP WHO YOU'D KEEP cta", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "miss", missTier: "MVP" });
    expect(out.headline).toBe("JOHN WAS ONE KEEP AWAY FROM GREATNESS.");
    expect(out.seal!.label).toBe("MVP MISS");
    expect(out.ctaLabel).toBe("KEEP WHO YOU'D KEEP");
  });

  it("miss headline is tier-agnostic — identical for ALL_STAR / MVP / LEGEND", () => {
    const a = pickHeadlineAndCta({ ...baseArgs, trigger: "miss", missTier: "ALL_STAR" }).headline;
    const b = pickHeadlineAndCta({ ...baseArgs, trigger: "miss", missTier: "MVP" }).headline;
    const c = pickHeadlineAndCta({ ...baseArgs, trigger: "miss", missTier: "LEGEND" }).headline;
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("default — JOHN SET THE BAR. + no seal + KEEP THE RIGHT ONES cta", () => {
    const out = pickHeadlineAndCta({ ...baseArgs, trigger: "default" });
    expect(out.headline).toBe("JOHN SET THE BAR.");
    expect(out.seal).toBeNull();
    expect(out.ctaLabel).toBe("KEEP THE RIGHT ONES");
  });

  it("challenger name uppercased in every trigger", () => {
    for (const trigger of ["choke", "big_score", "rare_pull", "miss", "default"] as TakeCardTrigger[]) {
      const out = pickHeadlineAndCta({ ...baseArgs, trigger, winTier: "MVP" });
      expect(out.headline).toContain("JOHN");
      expect(out.headline).not.toContain("john");
    }
  });
});

// ── Dynamic no-duplication guardrail ────────────────────────────────────

describe("Dynamic no-duplication guardrail — derived from rendered stamp", () => {
  it("seal=null (default trigger) → no forbidden tokens", () => {
    expect(forbiddenTokensFromSeal(null)).toEqual([]);
    expect(headlineContainsSealVocabulary("JOHN SET THE BAR.", null).hit).toBe(false);
  });

  it("CHOKE seal → forbids choke/choked/choking, whole-word, case-insensitive", () => {
    const seal = resolveSeal({ trigger: "choke" })!;
    const tokens = forbiddenTokensFromSeal(seal);
    expect(tokens).toEqual(expect.arrayContaining(["choke", "choked", "choking"]));
    expect(headlineContainsSealVocabulary("JOHN CHOKED THE HAND", seal).hit).toBe(true);
    expect(headlineContainsSealVocabulary("john choking under pressure", seal).hit).toBe(true);
    // The spec headline must NOT trip.
    expect(headlineContainsSealVocabulary("JOHN HELD HARDEN AND BEAL. IT COST HIM.", seal).hit).toBe(false);
  });

  it("MISS seal → forbids miss/missed/missing", () => {
    const seal = resolveSeal({ trigger: "miss" })!;
    expect(headlineContainsSealVocabulary("JOHN MISSED BY ONE", seal).hit).toBe(true);
    expect(headlineContainsSealVocabulary("ONE BUCKET MISSING", seal).hit).toBe(true);
    expect(headlineContainsSealVocabulary("JOHN WAS ONE KEEP AWAY FROM GREATNESS.", seal).hit).toBe(false);
  });

  it("'MVP MISS' seal → forbids both MVP and MISS as whole words", () => {
    const seal = resolveSeal({ trigger: "miss", missTier: "MVP" })!;
    const tokens = forbiddenTokensFromSeal(seal);
    expect(tokens).toEqual(expect.arrayContaining(["mvp", "miss", "missed", "missing"]));
    expect(headlineContainsSealVocabulary("CLOSE TO MVP", seal).hit).toBe(true);
    // The spec miss headline doesn't contain MVP or MISS.
    expect(headlineContainsSealVocabulary("JOHN WAS ONE KEEP AWAY FROM GREATNESS.", seal).hit).toBe(false);
  });

  it("'ALL STAR MISS' seal → forbids all/star/miss as whole words", () => {
    const seal = resolveSeal({ trigger: "miss", missTier: "ALL_STAR" })!;
    const tokens = forbiddenTokensFromSeal(seal);
    expect(tokens).toEqual(expect.arrayContaining(["all", "star", "miss"]));
    expect(headlineContainsSealVocabulary("ALL THE PIECES FELL", seal).hit).toBe(true);
    // Spec miss headline OK.
    expect(headlineContainsSealVocabulary("JOHN WAS ONE KEEP AWAY FROM GREATNESS.", seal).hit).toBe(false);
  });

  it("big_score 'MVP' seal → forbids MVP, whole-word", () => {
    const seal = resolveSeal({ trigger: "big_score", winTier: "MVP" })!;
    const tokens = forbiddenTokensFromSeal(seal);
    expect(tokens).toEqual(["mvp"]);
    expect(headlineContainsSealVocabulary("CLOSE TO MVP", seal).hit).toBe(true);
    // Spec big_score headline OK.
    expect(headlineContainsSealVocabulary("JOHN HELD HIS STARS AND THEY DELIVERED.", seal).hit).toBe(false);
  });

  it("big_score 'ALL-STAR' seal → forbids ALL and STAR (hyphen splits)", () => {
    const seal = resolveSeal({ trigger: "big_score", winTier: "ALL_STAR" })!;
    const tokens = forbiddenTokensFromSeal(seal);
    expect(tokens).toEqual(expect.arrayContaining(["all", "star"]));
    expect(headlineContainsSealVocabulary("STAR-LED COMEBACK", seal).hit).toBe(true);
    expect(headlineContainsSealVocabulary("JOHN HELD HIS STARS AND THEY DELIVERED.", seal).hit).toBe(false);
  });

  it("rare_pull 'RECORD' seal → forbids record alone (no NEW since the v3 label drops it)", () => {
    const seal = resolveSeal({ trigger: "rare_pull", topGameTier: "record" })!;
    const tokens = forbiddenTokensFromSeal(seal);
    expect(tokens).toEqual(["record"]);
    expect(headlineContainsSealVocabulary("HE SET A RECORD TONIGHT", seal).hit).toBe(true);
    expect(headlineContainsSealVocabulary("JOHN FOUND SOMETHING NOBODY SAW COMING.", seal).hit).toBe(false);
  });

  it("rare_pull 'CAREER HIGH' seal → forbids career and high", () => {
    const seal = resolveSeal({ trigger: "rare_pull", topGameTier: "career" })!;
    expect(forbiddenTokensFromSeal(seal)).toEqual(expect.arrayContaining(["career", "high"]));
    expect(headlineContainsSealVocabulary("CAREER NIGHT", seal).hit).toBe(true);
    expect(headlineContainsSealVocabulary("HIGH ABOVE THE RIM", seal).hit).toBe(true);
    expect(headlineContainsSealVocabulary("JOHN FOUND SOMETHING NOBODY SAW COMING.", seal).hit).toBe(false);
  });

  it("whole-word boundary: SCOREBOARD does not trip a 'record' or other seal-vocab guard", () => {
    const seal = resolveSeal({ trigger: "rare_pull", topGameTier: "record" })!;
    // "scoreboard" doesn't contain "record" as a whole word.
    expect(headlineContainsSealVocabulary("WATCH THE SCOREBOARD", seal).hit).toBe(false);
  });

  it("every spec-canonical headline passes its own dynamic guardrail", () => {
    const cases: Array<{ trigger: TakeCardTrigger; missTier?: string; topGameTier?: "record" | "career" | "season"; winTier?: WinTierKey }> = [
      { trigger: "choke" },
      { trigger: "big_score", winTier: "MVP" },
      { trigger: "big_score", winTier: "ALL_STAR" },
      { trigger: "big_score", winTier: "LEGEND" },
      { trigger: "rare_pull", topGameTier: "career" },
      { trigger: "rare_pull", topGameTier: "record" },
      { trigger: "rare_pull", topGameTier: "season" },
      { trigger: "miss", missTier: "MVP" },
      { trigger: "miss", missTier: "ALL_STAR" },
      { trigger: "miss", missTier: "LEGEND" },
      { trigger: "default" },
    ];
    for (const c of cases) {
      const out = pickHeadlineAndCta({
        challengerName: "John",
        heldNamesList: ["James Harden", "Bradley Beal"],
        trigger: c.trigger,
        missTier: c.missTier ?? null,
        topGameTier: c.topGameTier ?? null,
        winTier: c.winTier ?? null,
      });
      const result = headlineContainsSealVocabulary(out.headline, out.seal);
      expect(
        result.hit,
        `headline "${out.headline}" tripped its own seal vocabulary (seal=${out.seal?.label ?? "null"}, token=${result.word ?? "—"})`,
      ).toBe(false);
    }
  });
});

// ── Choke alternates + hold-verb pool are documented (no A/B harness) ──

describe("Choke spec — alternates + hold-verb pool on the tree", () => {
  it("IT COST HIM. is the build default; WRONG HOLD. / IT BACKFIRED. are documented alternates", () => {
    expect(CHOKE_CONSEQUENCE_DEFAULT).toBe("IT COST HIM.");
    expect(CHOKE_CONSEQUENCE_ALTERNATES).toContain("WRONG HOLD.");
    expect(CHOKE_CONSEQUENCE_ALTERNATES).toContain("IT BACKFIRED.");
  });
  it("hold-verb pool matches the spec list", () => {
    expect(HOLD_VERBS).toEqual(["HELD", "KEPT", "STUCK WITH", "RODE WITH"]);
  });
});

describe("Fallback CTA", () => {
  it("exposes the ACCEPT CHALLENGE fallback string", () => {
    expect(FALLBACK_CTA).toBe("ACCEPT CHALLENGE");
  });
});
