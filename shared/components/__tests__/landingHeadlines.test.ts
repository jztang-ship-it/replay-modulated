// shared/components/__tests__/landingHeadlines.test.ts
//
// RD5.1 — unit tests for the voiced copy bank + seeded selection.
// Spec: docs/rd5-1-headline-system-spec.md. Pure (no React, no DOM).

import { describe, it, expect } from "vitest";
import {
  pickHeadlineAndCta,
  substituteNames,
  resolveSeal,
  forbiddenTokensFromSeal,
  headlineContainsSealVocabulary,
  eligibleChokeLines,
  rngFromChallengeId,
  mulberry32,
  BANKS,
  FALLBACK_CTA,
  type BankVariant,
} from "../landingHeadlines";
import type { TakeCardTrigger } from "@shared/challengeTakeCard/types";

// ── Bank schema ────────────────────────────────────────────────────────

describe("bank schema — every line has the required fields", () => {
  const allBanks: Record<string, readonly BankVariant[]> = {
    choke: BANKS.choke, miss: BANKS.miss, respect: BANKS.respect, default: BANKS.default,
  };
  for (const [name, bank] of Object.entries(allBanks)) {
    it(`${name}: every entry has headline, cta, voice, weight ≥ 1, and unique key`, () => {
      expect(bank.length).toBeGreaterThan(0);
      const keys = new Set<string>();
      for (const v of bank) {
        expect(v.headline, `${name}: headline missing on ${v.key}`).toBeTruthy();
        expect(v.cta, `${name}: cta missing on ${v.key}`).toBeTruthy();
        expect(v.voice, `${name}: voice missing on ${v.key}`).toBeTruthy();
        expect(v.weight).toBeGreaterThanOrEqual(1);
        expect(v.key).toMatch(/^[a-z0-9_]+$/);
        expect(keys.has(v.key), `${name}: duplicate key ${v.key}`).toBe(false);
        keys.add(v.key);
      }
    });
  }

  it("respect lines all carry a stance", () => {
    for (const v of BANKS.respect) {
      expect(v.stance, `respect line ${v.key} missing stance`).toMatch(/^(respect|disrespect)$/);
    }
  });

  it("choke named lines reference {name1}/{name}/{name2}; generic lines do not", () => {
    for (const v of BANKS.choke) {
      const hasToken = /\{name[12]?\}/.test(v.headline);
      if (v.named) expect(hasToken, `choke named line ${v.key} has no {nameN} token`).toBe(true);
      else expect(hasToken, `choke generic line ${v.key} has a {nameN} token`).toBe(false);
    }
  });
});

// ── substituteNames ────────────────────────────────────────────────────

describe("substituteNames — last-name substitution", () => {
  it("replaces {name1} and {name2} with last names", () => {
    expect(substituteNames("{name1} and {name2}? Really?", ["James Harden", "Bradley Beal"]))
      .toBe("Harden and Beal? Really?");
  });
  it("{name} aliases to first held player's last name", () => {
    expect(substituteNames("{name}. In this economy?", ["Nikola Vucevic"]))
      .toBe("Vucevic. In this economy?");
  });
  it("missing slot → empty substitution (caller is expected to gate eligibility)", () => {
    expect(substituteNames("{name1} and {name2}", ["James Harden"])).toBe("Harden and ");
  });
  it("templates without tokens are passthrough", () => {
    expect(substituteNames("This hand aged like milk.", ["James Harden"])).toBe("This hand aged like milk.");
  });
});

// ── eligibleChokeLines ─────────────────────────────────────────────────

describe("eligibleChokeLines — named gating", () => {
  it("0 held → generic only (no named lines)", () => {
    const elig = eligibleChokeLines([]);
    for (const v of elig) expect(v.named).not.toBe(true);
  });
  it("3+ held → generic only (per spec — named eligible only when 1-2 fit)", () => {
    const elig = eligibleChokeLines(["A B", "C D", "E F"]);
    for (const v of elig) expect(v.named).not.toBe(true);
  });
  it("2 held → 2-name named lines + 1-name named lines + generic lines all eligible", () => {
    const elig = eligibleChokeLines(["James Harden", "Bradley Beal"]);
    const keys = new Set(elig.map(v => v.key));
    expect(keys.has("choke_bar_embiidvuc")).toBe(true);  // needs 2
    expect(keys.has("choke_bar_vucecon")).toBe(true);    // needs 1
    expect(keys.has("choke_bar_holds")).toBe(true);      // generic
  });
  it("1 held → 2-name named line excluded; 1-name named line included; generic lines included", () => {
    const elig = eligibleChokeLines(["Stephen Curry"]);
    const keys = new Set(elig.map(v => v.key));
    expect(keys.has("choke_bar_embiidvuc")).toBe(false); // needs 2 → out
    expect(keys.has("choke_bar_vucecon")).toBe(true);    // needs 1
    expect(keys.has("choke_bar_holds")).toBe(true);      // generic
  });
});

// ── Seal resolution (unchanged contract from v3) ───────────────────────

describe("resolveSeal — TierGauge vocabulary (no BIG SCORE, no NEW prefix)", () => {
  it("choke → CHOKE", () => { expect(resolveSeal({ trigger: "choke" })!.label).toBe("CHOKE"); });
  it("miss + MVP → 'MVP MISS'", () => { expect(resolveSeal({ trigger: "miss", missTier: "MVP" })!.label).toBe("MVP MISS"); });
  it("miss + ALL_STAR → 'ALL STAR MISS'", () => { expect(resolveSeal({ trigger: "miss", missTier: "ALL_STAR" })!.label).toBe("ALL STAR MISS"); });
  it("miss + null → bare MISS fallback", () => { expect(resolveSeal({ trigger: "miss" })!.label).toBe("MISS"); });
  it("big_score MVP → 'MVP'", () => { expect(resolveSeal({ trigger: "big_score", winTier: "MVP" })!.label).toBe("MVP"); });
  it("big_score LEGEND → 'LEGEND'", () => { expect(resolveSeal({ trigger: "big_score", winTier: "LEGEND" })!.label).toBe("LEGEND"); });
  it("big_score ALL_STAR → 'ALL-STAR' (hyphen)", () => { expect(resolveSeal({ trigger: "big_score", winTier: "ALL_STAR" })!.label).toBe("ALL-STAR"); });
  it("big_score with sub-eligibility tier → soft-fails to ALL-STAR floor", () => {
    expect(resolveSeal({ trigger: "big_score", winTier: "STARTER" })!.label).toBe("ALL-STAR");
    expect(resolveSeal({ trigger: "big_score" })!.label).toBe("ALL-STAR");
  });
  it("rare_pull → bare RECORD/CAREER HIGH/SEASON HIGH (no NEW)", () => {
    expect(resolveSeal({ trigger: "rare_pull", topGameTier: "record" })!.label).toBe("RECORD");
    expect(resolveSeal({ trigger: "rare_pull", topGameTier: "career" })!.label).toBe("CAREER HIGH");
    expect(resolveSeal({ trigger: "rare_pull", topGameTier: "season" })!.label).toBe("SEASON HIGH");
  });
  it("default → null (no seal)", () => { expect(resolveSeal({ trigger: "default" })).toBeNull(); });
});

// ── Seeded RNG + determinism ───────────────────────────────────────────

describe("rngFromChallengeId — deterministic seeded selection", () => {
  it("same challenge_id → identical RNG sequence", () => {
    const a = rngFromChallengeId("ch_xyz_123");
    const b = rngFromChallengeId("ch_xyz_123");
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it("different challenge_ids → different sequences", () => {
    const a = rngFromChallengeId("ch_abc");
    const b = rngFromChallengeId("ch_def");
    const aFirst = [a(), a(), a()];
    const bFirst = [b(), b(), b()];
    expect(aFirst).not.toEqual(bFirst);
  });
});

describe("pickHeadlineAndCta — deterministic per challenge ID", () => {
  it("same challenge_id → same variant key across calls (refresh stability)", () => {
    const args = {
      trigger: "choke" as TakeCardTrigger,
      challengerName: "John",
      heldNamesList: ["James Harden", "Bradley Beal"],
      challengeId: "ch_stable_seed",
    };
    const a = pickHeadlineAndCta(args);
    const b = pickHeadlineAndCta(args);
    expect(a.variantKey).toBe(b.variantKey);
    expect(a.headline).toBe(b.headline);
    expect(a.ctaLabel).toBe(b.ctaLabel);
  });

  it("different challenge_ids → over many seeds, the bank is well-distributed", () => {
    // Sanity: across many random IDs, no single key dominates and every
    // line gets some traction. This is a smoke test of "selection
    // actually fans out" — not a strict distribution test.
    const seen = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const out = pickHeadlineAndCta({
        trigger: "choke",
        challengerName: "John",
        heldNamesList: ["James Harden", "Bradley Beal"],
        challengeId: `ch_${i}`,
      });
      seen.set(out.variantKey, (seen.get(out.variantKey) ?? 0) + 1);
    }
    expect(seen.size).toBeGreaterThan(5); // many distinct lines fired
    // No single line takes more than 30% of mass.
    for (const [, count] of seen) {
      expect(count / 2000).toBeLessThan(0.3);
    }
  });
});

// ── Per-trigger pool sourcing ──────────────────────────────────────────

describe("trigger → pool routing", () => {
  function poolKeys(trigger: TakeCardTrigger, opts: Partial<{ topGameTier: "record" | "career" | "season"; missTier: string; winTier: "MVP" }> = {}): Set<string> {
    const keys = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const out = pickHeadlineAndCta({
        trigger,
        challengerName: "John",
        heldNamesList: ["James Harden", "Bradley Beal"],
        challengeId: `ch_pool_${i}`,
        topGameTier: opts.topGameTier ?? null,
        missTier: opts.missTier ?? null,
        winTier: opts.winTier ?? null,
      });
      keys.add(out.variantKey);
    }
    return keys;
  }

  it("choke → only choke_* keys", () => {
    for (const k of poolKeys("choke")) expect(k.startsWith("choke_")).toBe(true);
  });
  it("miss → only miss_* keys", () => {
    for (const k of poolKeys("miss", { missTier: "MVP" })) expect(k.startsWith("miss_")).toBe(true);
  });
  it("big_score → only resp_* keys (shares the respect pool)", () => {
    for (const k of poolKeys("big_score", { winTier: "MVP" })) expect(k.startsWith("resp_")).toBe(true);
  });
  it("rare_pull → only resp_* keys (shares the respect pool)", () => {
    for (const k of poolKeys("rare_pull", { topGameTier: "record" })) expect(k.startsWith("resp_")).toBe(true);
  });
  it("default → only def_* keys", () => {
    for (const k of poolKeys("default")) expect(k.startsWith("def_")).toBe(true);
  });
});

// ── Voice + stance distributions (statistical smoke tests) ────────────

describe("voice weighting — 70% bar / 25% analyst / 5% copy (choke + miss)", () => {
  function voiceFromKey(key: string, bank: readonly BankVariant[]): string {
    const v = bank.find(x => x.key === key);
    return v?.voice ?? "?";
  }

  function distribution(trigger: TakeCardTrigger, samples: number): Record<string, number> {
    const dist: Record<string, number> = { bar: 0, analyst: 0, copy: 0 };
    for (let i = 0; i < samples; i++) {
      const out = pickHeadlineAndCta({
        trigger,
        challengerName: "John",
        heldNamesList: ["James Harden", "Bradley Beal"],
        challengeId: `ch_dist_${trigger}_${i}`,
        missTier: trigger === "miss" ? "MVP" : null,
      });
      const v = voiceFromKey(out.variantKey, trigger === "choke" ? BANKS.choke : BANKS.miss);
      dist[v] = (dist[v] ?? 0) + 1;
    }
    return dist;
  }

  it("choke voice distribution within ±5% of 70/25/5 over 5000 samples", () => {
    const samples = 5000;
    const d = distribution("choke", samples);
    expect(d.bar / samples).toBeGreaterThan(0.65);
    expect(d.bar / samples).toBeLessThan(0.75);
    expect(d.analyst / samples).toBeGreaterThan(0.20);
    expect(d.analyst / samples).toBeLessThan(0.30);
    expect(d.copy / samples).toBeGreaterThan(0.02);
    expect(d.copy / samples).toBeLessThan(0.08);
  });

  it("miss voice distribution within ±5% of 70/25/5 over 5000 samples", () => {
    const samples = 5000;
    const d = distribution("miss", samples);
    expect(d.bar / samples).toBeGreaterThan(0.65);
    expect(d.bar / samples).toBeLessThan(0.75);
    expect(d.analyst / samples).toBeGreaterThan(0.20);
    expect(d.analyst / samples).toBeLessThan(0.30);
    expect(d.copy / samples).toBeGreaterThan(0.02);
    expect(d.copy / samples).toBeLessThan(0.08);
  });
});

describe("stance weighting — 70% respect / 30% disrespect (big_score + rare_pull share)", () => {
  function stanceFromKey(key: string): string {
    const v = BANKS.respect.find(x => x.key === key);
    return v?.stance ?? "?";
  }

  it("big_score stance distribution within ±5% of 70/30 over 5000 samples", () => {
    const samples = 5000;
    let respect = 0, disrespect = 0;
    for (let i = 0; i < samples; i++) {
      const out = pickHeadlineAndCta({
        trigger: "big_score",
        challengerName: "John",
        heldNamesList: ["James Harden", "Bradley Beal"],
        challengeId: `ch_bs_${i}`,
        winTier: "MVP",
      });
      const s = stanceFromKey(out.variantKey);
      if (s === "respect") respect++;
      else if (s === "disrespect") disrespect++;
    }
    expect(respect / samples).toBeGreaterThan(0.65);
    expect(respect / samples).toBeLessThan(0.75);
    expect(disrespect / samples).toBeGreaterThan(0.25);
    expect(disrespect / samples).toBeLessThan(0.35);
  });

  it("rare_pull stance distribution within ±5% of 70/30 over 5000 samples", () => {
    const samples = 5000;
    let respect = 0, disrespect = 0;
    for (let i = 0; i < samples; i++) {
      const out = pickHeadlineAndCta({
        trigger: "rare_pull",
        challengerName: "John",
        heldNamesList: ["James Harden", "Bradley Beal"],
        challengeId: `ch_rp_${i}`,
        topGameTier: "career",
      });
      const s = stanceFromKey(out.variantKey);
      if (s === "respect") respect++;
      else if (s === "disrespect") disrespect++;
    }
    expect(respect / samples).toBeGreaterThan(0.65);
    expect(respect / samples).toBeLessThan(0.75);
    expect(disrespect / samples).toBeGreaterThan(0.25);
    expect(disrespect / samples).toBeLessThan(0.35);
  });
});

// ── Choke named-line gating end-to-end ─────────────────────────────────

describe("choke named-line gating end-to-end", () => {
  it("3+ held → never fires a named line (5000-seed sweep)", () => {
    for (let i = 0; i < 5000; i++) {
      const out = pickHeadlineAndCta({
        trigger: "choke",
        challengerName: "John",
        heldNamesList: ["A B", "C D", "E F"],
        challengeId: `ch_three_${i}`,
      });
      const v = BANKS.choke.find(x => x.key === out.variantKey);
      expect(v?.named, `seed ${i} fired named line ${out.variantKey} with 3 holds`).not.toBe(true);
    }
  });

  it("0 held → never fires a named line (no names to substitute)", () => {
    for (let i = 0; i < 1000; i++) {
      const out = pickHeadlineAndCta({
        trigger: "choke",
        challengerName: "John",
        heldNamesList: [],
        challengeId: `ch_zero_${i}`,
      });
      const v = BANKS.choke.find(x => x.key === out.variantKey);
      expect(v?.named).not.toBe(true);
    }
  });

  it("2 held → can fire choke_bar_embiidvuc with substituted names", () => {
    // Find a seed that picks choke_bar_embiidvuc.
    let found = false;
    for (let i = 0; i < 5000 && !found; i++) {
      const out = pickHeadlineAndCta({
        trigger: "choke",
        challengerName: "John",
        heldNamesList: ["James Harden", "Bradley Beal"],
        challengeId: `ch_named_${i}`,
      });
      if (out.variantKey === "choke_bar_embiidvuc") {
        expect(out.headline).toBe("Harden and Beal? Really?");
        found = true;
      }
    }
    expect(found, "choke_bar_embiidvuc never fired across 5000 seeds with 2 holds").toBe(true);
  });
});

// ── No-duplication guardrail across every bank line ────────────────────

describe("no-duplication guardrail — every bank line passes against its seal", () => {
  it("every choke line: headline with substituted names contains no CHOKE/CHOKED/CHOKING", () => {
    const seal = resolveSeal({ trigger: "choke" });
    const names = ["James Harden", "Bradley Beal"];
    for (const v of BANKS.choke) {
      const substituted = substituteNames(v.headline, names);
      const r = headlineContainsSealVocabulary(substituted, seal);
      expect(r.hit, `choke line ${v.key} ("${substituted}") tripped seal vocab on "${r.word}"`).toBe(false);
    }
  });

  it("every miss line passes the MISS/MVP MISS/ALL STAR MISS/LEGEND MISS seals", () => {
    const seals = [
      resolveSeal({ trigger: "miss" }),                          // bare MISS
      resolveSeal({ trigger: "miss", missTier: "MVP" }),         // MVP MISS
      resolveSeal({ trigger: "miss", missTier: "ALL_STAR" }),    // ALL STAR MISS
      resolveSeal({ trigger: "miss", missTier: "LEGEND" }),      // LEGEND MISS
    ];
    for (const v of BANKS.miss) {
      for (const seal of seals) {
        const r = headlineContainsSealVocabulary(v.headline, seal);
        expect(r.hit, `miss line ${v.key} tripped seal "${seal?.label}" on "${r.word}"`).toBe(false);
      }
    }
  });

  it("every respect line passes the big_score tier seals AND the rare_pull sub-tier seals", () => {
    const seals = [
      // big_score → tier label
      resolveSeal({ trigger: "big_score", winTier: "ALL_STAR" }),
      resolveSeal({ trigger: "big_score", winTier: "MVP" }),
      resolveSeal({ trigger: "big_score", winTier: "LEGEND" }),
      // rare_pull → sub-tier
      resolveSeal({ trigger: "rare_pull", topGameTier: "record" }),
      resolveSeal({ trigger: "rare_pull", topGameTier: "career" }),
      resolveSeal({ trigger: "rare_pull", topGameTier: "season" }),
    ];
    for (const v of BANKS.respect) {
      for (const seal of seals) {
        const r = headlineContainsSealVocabulary(v.headline, seal);
        expect(r.hit, `respect line ${v.key} ("${v.headline}") tripped "${seal?.label}" on "${r.word}"`).toBe(false);
      }
    }
  });

  it("default lines: no seal renders → no forbidden vocabulary (trivially passes)", () => {
    for (const v of BANKS.default) {
      const r = headlineContainsSealVocabulary(v.headline, null);
      expect(r.hit).toBe(false);
    }
  });
});

// ── Mulberry32 sanity ──────────────────────────────────────────────────

describe("mulberry32 sanity", () => {
  it("returns values in [0, 1)", () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ── Legacy export ──────────────────────────────────────────────────────

describe("Legacy exports", () => {
  it("FALLBACK_CTA stays exported as ACCEPT CHALLENGE (used by callers that haven't migrated)", () => {
    expect(FALLBACK_CTA).toBe("ACCEPT CHALLENGE");
  });
});
