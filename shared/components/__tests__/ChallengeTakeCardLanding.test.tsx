// @vitest-environment jsdom
//
// shared/components/__tests__/ChallengeTakeCardLanding.test.tsx
//
// RD5.1 — decision-frame challenge landing with voiced copy bank.
// Spec of record: docs/rd5-1-headline-system-spec.md.
//
// What this file asserts about the rendered surface:
//   - Headline + CTA come from the right bank pool per trigger (banks
//     in landingHeadlines.ts are the source of truth — we don't pin
//     exact strings because selection is bank-seeded, not single-line).
//   - Seal labels + colors mirror TierGauge (v3 contract unchanged).
//   - Selection is deterministic per challenge ID (refresh stability).
//   - Analytics fires once on mount with the selected variant key.
//   - Owner alreadyAttempted path keeps "Play Again" verbatim.
//   - Score appears exactly once (target line); HELD line / dare /
//     attribution stay absent; yellow-H glyph on held cards.
//   - Retired pre-bank strings are absent (BIG SCORE / NEW RECORD /
//     MAKE THE BETTER CALL / FIND THE SWAP / TRUSTED).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChallengeTakeCardLanding, type ChallengeLandingData } from "../ChallengeTakeCardLanding";
import { recordBossResult } from "@shared/utils/bossResultMemory";
import type { CardRenderer } from "../H2HRevealScreen";
import {
  resolveSeal,
  headlineContainsSealVocabulary,
  BANKS,
  type BankVariant,
} from "../landingHeadlines";
import type { WinTierKey } from "@shared/utils/payoutLogic";

// Mock the analytics surface so test assertions can verify the emit
// without coupling to the real client. The component imports `track`
// from "@shared/analytics/analytics" — we replace it with a vi.fn so
// every test can inspect the call list.
const trackMock = vi.fn();
vi.mock("@shared/analytics/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

beforeEach(() => {
  trackMock.mockClear();
});

// Deterministic tier resolver — same fallback thresholds the v3 tests
// used. Big_score variants test at target_score 240 → MVP, 260 → LEGEND,
// 228 → ALL_STAR.
function testWinTier(totalFp: number): WinTierKey {
  if (totalFp >= 255) return "LEGEND";
  if (totalFp >= 235) return "MVP";
  if (totalFp >= 225) return "ALL_STAR";
  if (totalFp >= 205) return "STARTER";
  if (totalFp >= 185) return "ROOKIE";
  return "BUST";
}

interface MakeOpts {
  trigger?: string;
  heldPair?: [string, string] | null;
  holdsRecorded?: boolean;
  anchor?: string | null;
  topGameTier?: "record" | "career" | "season" | null;
  nearMissGap?: number | null;
  nearMissNextTier?: string | null;
  targetScore?: number;
  challengerName?: string | null;
  challengeId?: string;
}

function makeData(opts: MakeOpts = {}): ChallengeLandingData {
  const heldPair = opts.heldPair ?? null;
  const isHeld = (id: string) => !!heldPair && heldPair.includes(id);
  const card = (
    id: string, name: string, team: string, tier: string,
    salary: number, slotIndex: number, projectedFp: number, defaultActualFp: number,
  ) => ({
    id, basePlayerId: id, personKey: id, cardId: `${id}_c`,
    name, team, season: "2425", position: "F", photoCode: null,
    salary, tier, slotIndex, projectedFp,
    wasHeld: isHeld(id),
    actualFp: isHeld(id) ? defaultActualFp : 0,
  });
  return {
    challenge_id: opts.challengeId ?? "ch_test_1",
    created_by: "u_creator",
    challenger_name: (opts.challengerName === undefined ? "Mike" : opts.challengerName) ?? "",
    target_score: opts.targetScore ?? 142.0,
    sport: "basketball",
    season: "2425",
    trigger_type: opts.trigger ?? "choke",
    share_headline: "",
    initial_roster: {
      v: 1,
      sport: "basketball",
      holdsRecorded: opts.holdsRecorded ?? true,
      cards: [
        card("emb", "Embiid",  "PHI", "RED",    80, 0, 50, 38.0),
        card("voo", "Vucevic", "ORL", "PURPLE", 65, 1, 35, 27.0),
        card("bro", "Brown",   "BOS", "PURPLE", 55, 2, 30, 23.0),
        card("cur", "Curry",   "GSW", "RED",    75, 3, 42, 32.0),
        card("bag", "Bagley",  "WAS", "BLUE",   35, 4, 18, 14.0),
        card("hol", "Holiday", "BOS", "GREEN",  25, 5, 14, 11.0),
      ],
    },
    roster_size: 6,
    attempt_count: 2,
    winner_count: 0,
    best_score: null,
    best_user_name: null,
    near_miss_gap: opts.nearMissGap ?? null,
    near_miss_next_tier: opts.nearMissNextTier ?? null,
    anchor_base_player_id: opts.anchor === undefined ? "voo" : opts.anchor,
    top_game_tier: opts.topGameTier ?? null,
  };
}

// ── Headline + CTA come from the right pool per trigger ────────────────

describe("rendered headline + CTA come from the per-trigger bank", () => {
  const cases: Array<{ trigger: string; opts: MakeOpts; pool: readonly BankVariant[]; sealLabel: string | null }> = [
    { trigger: "choke",     opts: { trigger: "choke",     heldPair: ["emb", "voo"], challengeId: "ch_choke_1" },                                          pool: BANKS.choke,   sealLabel: "CHOKE" },
    { trigger: "miss",      opts: { trigger: "miss",      heldPair: ["bro", "cur"], nearMissNextTier: "MVP", challengeId: "ch_miss_1" },                  pool: BANKS.miss,    sealLabel: "MVP MISS" },
    { trigger: "big_score", opts: { trigger: "big_score", heldPair: ["cur", "emb"], targetScore: 240, challengeId: "ch_bs_1" },                           pool: BANKS.respect, sealLabel: "MVP" },
    { trigger: "rare_pull", opts: { trigger: "rare_pull", heldPair: ["cur", "emb"], topGameTier: "record", challengeId: "ch_rp_1" },                      pool: BANKS.respect, sealLabel: "RECORD" },
    { trigger: "default",   opts: { trigger: "default",   heldPair: null, anchor: null, challengeId: "ch_def_1" },                                        pool: BANKS.default, sealLabel: null },
  ];

  for (const c of cases) {
    it(`${c.trigger}: headline is from the right pool, CTA matches the bank, seal=${c.sealLabel ?? "(none)"}`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({ ...c.opts, challengerName: "John" })}
          statsLine={null}
          alreadyAttempted={false}
          calculateWinTier={testWinTier}
          onAccept={() => {}}
        />,
      );
      const headlineText = screen.getByTestId("take-headline").textContent ?? "";
      const ctaText = screen.getByTestId("accept-cta").textContent ?? "";
      // Find the matching bank variant by paired (headline, cta). For
      // choke named lines the headline is name-substituted at render,
      // so we compare against the substituted form.
      const heldNames = c.opts.heldPair === null
        ? []
        : c.opts.heldPair.map(id => ({ emb: "Embiid", voo: "Vucevic", bro: "Brown", cur: "Curry", bag: "Bagley", hol: "Holiday" }[id] ?? "?"));
      // CSS textTransform:uppercase is a VISUAL render; textContent returns
      // the source-case string. Compare against the bank's sentence-case
      // source verbatim.
      const match = c.pool.find(v => {
        const substituted = v.headline
          .replace(/\{name1\}/g, heldNames[0] ?? "")
          .replace(/\{name2\}/g, heldNames[1] ?? "")
          .replace(/\{name\}/g, heldNames[0] ?? "");
        return substituted === headlineText && v.cta === ctaText;
      });
      expect(
        match,
        `${c.trigger}: no bank variant matched headline="${headlineText}" cta="${ctaText}"`,
      ).toBeDefined();

      if (c.sealLabel === null) {
        expect(screen.queryByTestId("evidence-seal")).toBeNull();
      } else {
        expect(screen.getByTestId("landing-badge").textContent).toBe(c.sealLabel);
      }
    });
  }
});

// ── Determinism per challenge_id ──────────────────────────────────────

describe("Deterministic selection — same challenge_id → same variant", () => {
  it("two renders of the same data produce the same headline + cta", () => {
    const data = makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengeId: "ch_stable_x" });
    const { unmount } = render(
      <ChallengeTakeCardLanding data={data} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />,
    );
    const firstHead = screen.getByTestId("take-headline").textContent;
    const firstCta = screen.getByTestId("accept-cta").textContent;
    unmount();

    render(
      <ChallengeTakeCardLanding data={data} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe(firstHead);
    expect(screen.getByTestId("accept-cta").textContent).toBe(firstCta);
  });
});

// ── No-duplication guardrail on rendered output ────────────────────────

describe("No-duplication guardrail on the rendered surface", () => {
  const cases: Array<{ trigger: string; opts: MakeOpts; sealArgs: Parameters<typeof resolveSeal>[0] }> = [
    { trigger: "choke",     opts: { trigger: "choke",     heldPair: ["emb", "voo"], challengeId: "ch_g_choke" },                                                    sealArgs: { trigger: "choke" } },
    { trigger: "miss MVP",  opts: { trigger: "miss",      heldPair: ["bro", "cur"], nearMissNextTier: "MVP", challengeId: "ch_g_miss_mvp" },                        sealArgs: { trigger: "miss", missTier: "MVP" } },
    { trigger: "miss AS",   opts: { trigger: "miss",      heldPair: ["bro", "cur"], nearMissNextTier: "ALL_STAR", challengeId: "ch_g_miss_as" },                    sealArgs: { trigger: "miss", missTier: "ALL_STAR" } },
    { trigger: "big_score", opts: { trigger: "big_score", heldPair: ["emb", "cur"], targetScore: 240, challengeId: "ch_g_bs" },                                     sealArgs: { trigger: "big_score", winTier: "MVP" } },
    { trigger: "rare_pull", opts: { trigger: "rare_pull", heldPair: ["cur", "emb"], topGameTier: "career", challengeId: "ch_g_rp" },                                sealArgs: { trigger: "rare_pull", topGameTier: "career" } },
  ];
  for (const c of cases) {
    it(`${c.trigger}: rendered headline does not contain seal "${resolveSeal(c.sealArgs)?.label}" vocab`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({ ...c.opts, challengerName: "John" })}
          statsLine={null}
          alreadyAttempted={false}
          calculateWinTier={testWinTier}
          onAccept={() => {}}
        />,
      );
      const headline = screen.getByTestId("take-headline").textContent ?? "";
      const seal = resolveSeal(c.sealArgs);
      const result = headlineContainsSealVocabulary(headline, seal);
      expect(
        result.hit,
        `${c.trigger}: headline "${headline}" tripped seal "${seal?.label}" on "${result.word}"`,
      ).toBe(false);
    });
  }
});

// ── Analytics emit ────────────────────────────────────────────────────

describe("Analytics — selected variant key emitted on mount", () => {
  it("fires track('challenges', 'challenge_landing_variant', {variant_key, ...}) on mount", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengeId: "ch_track_choke" })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    const calls = trackMock.mock.calls.filter(c => c[0] === "challenges" && c[1] === "challenge_landing_variant");
    expect(calls.length).toBe(1);
    const props = calls[0][2] as Record<string, unknown>;
    expect(props.challenge_id).toBe("ch_track_choke");
    expect(props.sport).toBe("basketball");
    expect(props.trigger).toBe("choke");
    expect(typeof props.variant_key).toBe("string");
    expect((props.variant_key as string).startsWith("choke_")).toBe(true);
  });

  it("the emitted variant_key is from the respect bank when trigger=rare_pull", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "rare_pull", heldPair: ["cur", "emb"], topGameTier: "record", challengeId: "ch_track_rp" })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    const calls = trackMock.mock.calls.filter(c => c[0] === "challenges" && c[1] === "challenge_landing_variant");
    expect(calls.length).toBe(1);
    expect(((calls[0][2] as Record<string, unknown>).variant_key as string).startsWith("resp_")).toBe(true);
  });
});

// ── Retired pre-bank strings absent ───────────────────────────────────

describe("Retired pre-bank strings absent everywhere", () => {
  const triggers: Array<{ trigger: string; opts: MakeOpts }> = [
    { trigger: "choke",     opts: { trigger: "choke",     heldPair: ["emb", "voo"], challengeId: "ch_ret_choke" } },
    { trigger: "miss",      opts: { trigger: "miss",      heldPair: ["bro", "cur"], nearMissNextTier: "MVP", challengeId: "ch_ret_miss" } },
    { trigger: "big_score", opts: { trigger: "big_score", heldPair: ["cur", "emb"], targetScore: 240, challengeId: "ch_ret_bs" } },
    { trigger: "rare_pull", opts: { trigger: "rare_pull", heldPair: ["cur", "emb"], topGameTier: "record", challengeId: "ch_ret_rp" } },
    { trigger: "default",   opts: { trigger: "default",   heldPair: null, anchor: null, challengeId: "ch_ret_def" } },
  ];
  for (const c of triggers) {
    it(`${c.trigger}: pre-bank inventions (BIG SCORE, NEW RECORD, MAKE THE BETTER CALL, FIND THE SWAP, TRUSTED, ONE SWAP STOOD BETWEEN) absent`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({ ...c.opts, challengerName: "John" })}
          statsLine="3 attempts · 67% failed"
          alreadyAttempted={false}
          calculateWinTier={testWinTier}
          onAccept={() => {}}
        />,
      );
      const root = screen.getByTestId("challenge-take-card-landing");
      const text = root.textContent ?? "";
      for (const retired of ["BIG SCORE", "NEW RECORD", "MAKE THE BETTER CALL", "FIND THE SWAP", "TRUSTED", "ONE SWAP STOOD BETWEEN"]) {
        expect(text, `${c.trigger}: should not contain retired "${retired}"`).not.toContain(retired);
      }
    });
  }
});

// ── Score renders exactly once ─────────────────────────────────────────

describe("Score appears exactly once, in the target line", () => {
  const triggers = ["choke", "miss", "big_score", "rare_pull", "default"];
  for (const trigger of triggers) {
    it(`${trigger}: target carries 126.2 FP; no headline contains it`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({
            trigger,
            heldPair: trigger === "default" ? null : ["emb", "voo"],
            anchor: trigger === "default" ? null : "voo",
            nearMissNextTier: trigger === "miss" ? "MVP" : null,
            topGameTier: trigger === "rare_pull" ? "career" : null,
            targetScore: 126.2,
            challengerName: "John",
            challengeId: `ch_score_${trigger}`,
          })}
          statsLine={null}
          alreadyAttempted={false}
          calculateWinTier={testWinTier}
          onAccept={() => {}}
        />,
      );
      const target = screen.getByTestId("target-line");
      expect(target.textContent?.toUpperCase()).toContain("TARGET TO BEAT");
      expect(target.textContent).toContain("126.2 FP");
      expect(screen.getByTestId("take-headline").textContent).not.toContain("126.2");
      const root = screen.getByTestId("challenge-take-card-landing");
      const matches = (root.textContent ?? "").match(/126\.2/g) ?? [];
      expect(matches.length).toBe(1);
    });
  }
});

// ── CTA wiring — recipient bank vs owner Play Again ────────────────────

describe("CTA wiring (recipient = bank cta; owner = Play Again verbatim)", () => {
  it("recipient on choke → CTA is non-empty (any choke bank line's CTA)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengeId: "ch_cta_recip" })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    const cta = screen.getByTestId("accept-cta").textContent ?? "";
    expect(cta.length).toBeGreaterThan(0);
    expect(cta).not.toBe("PLAY AGAIN"); // recipient path never says Play Again
  });

  it("OWNER (alreadyAttempted=true) → 'Play Again' verbatim", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={true}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("accept-cta").textContent).toBe("Play Again");
  });

  it("CTA click fires onAccept on both paths", () => {
    const handle = vi.fn();
    const { unmount } = render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={handle}
      />,
    );
    fireEvent.click(screen.getByTestId("accept-cta"));
    expect(handle).toHaveBeenCalledTimes(1);
    unmount();
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={true}
        calculateWinTier={testWinTier}
        onAccept={handle}
      />,
    );
    fireEvent.click(screen.getByTestId("accept-cta"));
    expect(handle).toHaveBeenCalledTimes(2);
  });
});

// ── Seal placement, hold glyph, deleted surfaces (unchanged contract) ──

describe("Seal placement + hand glyph + deleted surfaces", () => {
  it("choke: seal lives in evidence-seal wrapper, NOT in the h1", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengeId: "ch_seal_1" })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    const seal = screen.getByTestId("evidence-seal");
    const badge = screen.getByTestId("landing-badge");
    const h1 = screen.getByTestId("take-headline");
    expect(seal.contains(badge)).toBe(true);
    expect(h1.contains(badge)).toBe(false);
  });

  it("default: NO evidence-seal AT ALL", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.queryByTestId("evidence-seal")).toBeNull();
    expect(screen.queryByTestId("landing-badge")).toBeNull();
  });

  it("held cards render yellow-H corner glyph (NOT a HOLD text pill)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    const badges = screen.getAllByTestId("hold-badge");
    expect(badges).toHaveLength(2);
    for (const b of badges) {
      expect(b.textContent).toBe("H");
      const polygon = b.querySelector("polygon");
      expect(polygon?.getAttribute("fill")?.toUpperCase()).toBe("#F5C850");
    }
  });

  it("deleted surfaces stay absent: HELD line / dare / attribution", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "John" })}
        statsLine="3 attempts · 67% failed"
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.queryByTestId("held-list")).toBeNull();
    expect(screen.queryByTestId("dare-line")).toBeNull();
    expect(screen.queryByTestId("attribution")).toBeNull();
    const root = screen.getByTestId("challenge-take-card-landing");
    expect(root.textContent).not.toMatch(/from John/i);
    expect(root.textContent).not.toMatch(/can you beat/i);
  });
});

// ── Supporting culture line — preserved curated path ───────────────────

describe("Supporting culture line (preserved knownFor path)", () => {
  function makeCultureRichData(): ChallengeLandingData {
    return {
      challenge_id: "ch_culture_kobe",
      created_by: "u_creator",
      challenger_name: "Mike",
      target_score: 142.0,
      sport: "basketball",
      season: "2425",
      trigger_type: "choke",
      share_headline: "",
      initial_roster: {
        v: 1,
        sport: "basketball",
        holdsRecorded: true,
        cards: [
          { id: "kobe", basePlayerId: "977", personKey: "977", cardId: "kobe_c",
            name: "Kobe Bryant", team: "LAL", season: "2425", position: "G",
            photoCode: null, salary: 95, tier: "RED", slotIndex: 0,
            projectedFp: 50, wasHeld: true, actualFp: 47 },
          { id: "kidd", basePlayerId: "467", personKey: "467", cardId: "kidd_c",
            name: "Jason Kidd", team: "DAL", season: "2425", position: "G",
            photoCode: null, salary: 60, tier: "RED", slotIndex: 1,
            projectedFp: 35, wasHeld: true, actualFp: 12 },
          { id: "bro", basePlayerId: "bro", personKey: "bro", cardId: "bro_c",
            name: "Brown", team: "BOS", season: "2425", position: "F",
            photoCode: null, salary: 55, tier: "PURPLE", slotIndex: 2,
            projectedFp: 30, wasHeld: false, actualFp: 0 },
          { id: "cur", basePlayerId: "cur", personKey: "cur", cardId: "cur_c",
            name: "Curry", team: "GSW", season: "2425", position: "G",
            photoCode: null, salary: 75, tier: "RED", slotIndex: 3,
            projectedFp: 42, wasHeld: false, actualFp: 0 },
          { id: "bag", basePlayerId: "bag", personKey: "bag", cardId: "bag_c",
            name: "Bagley", team: "WAS", season: "2425", position: "F",
            photoCode: null, salary: 35, tier: "BLUE", slotIndex: 4,
            projectedFp: 18, wasHeld: false, actualFp: 0 },
          { id: "hol", basePlayerId: "hol", personKey: "hol", cardId: "hol_c",
            name: "Holiday", team: "BOS", season: "2425", position: "G",
            photoCode: null, salary: 25, tier: "GREEN", slotIndex: 5,
            projectedFp: 14, wasHeld: false, actualFp: 0 },
        ],
      },
      roster_size: 6,
      attempt_count: 2,
      winner_count: 0,
      best_score: null,
      best_user_name: null,
      near_miss_gap: null,
      near_miss_next_tier: null,
      anchor_base_player_id: "977",
      top_game_tier: null,
    };
  }

  it("OFF by default", () => {
    render(
      <ChallengeTakeCardLanding data={makeCultureRichData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />,
    );
    expect(screen.queryByTestId("supporting-culture-line")).toBeNull();
  });

  it("ON renders the knownFor line", () => {
    render(
      <ChallengeTakeCardLanding data={makeCultureRichData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} showCultureLine={true} />,
    );
    const line = screen.queryByTestId("supporting-culture-line");
    expect(line).not.toBeNull();
    expect(line!.textContent).toMatch(/champion|All-Star|Jordan|LeBron/);
  });

  it("ON + synthetic IDs (no culture match) → not rendered, no crash", () => {
    render(
      <ChallengeTakeCardLanding data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} showCultureLine={true} />,
    );
    expect(screen.queryByTestId("supporting-culture-line")).toBeNull();
  });
});

// ── Boss convergence (Consolidation Phase 3 step 2) ────────────────────
//
// Boss CONVERGES onto this unified surface, branched internally on
// sender_kind. These assert the gating contract (the visual/layout is
// glass-required per CLAUDE.md — JSDOM proves presence/absence, not pixels):
//   - name verbatim (bypasses isRealName) + authored flavor (share_headline),
//   - boss-only eyebrow (+ tough-day suffix) + marquee label (marquee-gated),
//   - held/discard GATED OFF — all five cards render neutral, no yellow-H,
//   - human-only logic does NOT leak: no take-headline, no seal, no variant
//     analytics,
//   - the revisit branch (returning player) reconstructs BossOutwardEnding,
//   - CTA copy is the boss family ("Take the Boss" / "Play Again").

describe("Boss convergence — merged surface branches internally on sender_kind", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  function makeBossData(over: Partial<ChallengeLandingData> = {}): ChallengeLandingData {
    const base = makeData({ trigger: "boss", heldPair: ["emb", "voo"], challengeId: "ch_boss_unit" });
    return {
      ...base,
      sender_kind: "boss",
      created_by: null,
      // A non-real name string — the human path would downgrade this to
      // "THE CHALLENGER"; the boss path must show it verbatim.
      challenger_name: "Banner 18",
      share_headline: "Tatum and Brown finish it",
      tough_day: false,
      ...over,
    };
  }

  it("renders the boss branch (boss-take-card), not the human headline path", () => {
    render(<ChallengeTakeCardLanding data={makeBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getByTestId("challenge-take-card-landing")).toBeTruthy();
    expect(screen.getByTestId("boss-take-card")).toBeTruthy();
    expect(screen.queryByTestId("take-headline")).toBeNull();
    expect(screen.queryByTestId("evidence-seal")).toBeNull();
    expect(screen.queryByTestId("landing-badge")).toBeNull();
  });

  it("shows the authored name VERBATIM (bypasses the isRealName downgrade)", () => {
    render(<ChallengeTakeCardLanding data={makeBossData({ challenger_name: "73-9 Warriors" })} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getByTestId("boss-name").textContent).toBe("73-9 Warriors");
    // The human path's downgrade string must NOT appear.
    expect(screen.getByTestId("challenge-take-card-landing").textContent).not.toContain("THE CHALLENGER");
  });

  it("uses the authored share_headline as the flavor (not the headline bank)", () => {
    render(<ChallengeTakeCardLanding data={makeBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getByTestId("boss-flavor").textContent).toBe("Tatum and Brown finish it");
  });

  it("eyebrow carries the tough-day suffix only when tough_day is set", () => {
    const { unmount } = render(<ChallengeTakeCardLanding data={makeBossData({ tough_day: true })} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getByTestId("boss-eyebrow").textContent).toBe("Daily Boss · Tough Day");
    unmount();
    render(<ChallengeTakeCardLanding data={makeBossData({ tough_day: false })} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getByTestId("boss-eyebrow").textContent).toBe("Daily Boss");
  });

  it("marquee label is gated on the baked marquee flag", () => {
    const marqueeData = makeBossData({
      challenger_name: "73-9 Warriors",
      initial_roster: { ...makeBossData().initial_roster, marquee: true },
    });
    const { unmount } = render(<ChallengeTakeCardLanding data={marqueeData} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getByTestId("boss-marquee-label").textContent).toMatch(/brutal by design/i);
    unmount();
    // Beatable boss (no marquee) → no label.
    render(<ChallengeTakeCardLanding data={makeBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.queryByTestId("boss-marquee-label")).toBeNull();
  });

  it("cards render NEUTRAL — held/discard gated off, no yellow-H glyph", () => {
    // The fixture marks emb+voo wasHeld; the boss branch must ignore it.
    render(<ChallengeTakeCardLanding data={makeBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getAllByTestId("hand-card-neutral")).toHaveLength(6);
    expect(screen.queryByTestId("hand-card-held")).toBeNull();
    expect(screen.queryByTestId("hand-card-plain")).toBeNull();
    expect(screen.queryByTestId("hold-badge")).toBeNull();
  });

  it("CTA is the boss family: 'Take the Boss' fresh, 'Play Again' when alreadyAttempted", () => {
    const { unmount } = render(<ChallengeTakeCardLanding data={makeBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getByTestId("accept-cta").textContent).toBe("Take the Boss");
    unmount();
    render(<ChallengeTakeCardLanding data={makeBossData()} statsLine={null} alreadyAttempted={true} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getByTestId("accept-cta").textContent).toBe("Play Again");
  });

  it("the target line + CTA fire onAccept (the shared framework scaffold)", () => {
    const onAccept = vi.fn();
    render(<ChallengeTakeCardLanding data={makeBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={onAccept} />);
    expect(screen.getByTestId("target-line").textContent).toContain("142.0 FP");
    fireEvent.click(screen.getByTestId("accept-cta"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("REVISIT — a prior boss result reconstructs the outward ending, no accept CTA", () => {
    recordBossResult("ch_boss_revisit_unit", { score: 188.0, won: true });
    render(<ChallengeTakeCardLanding data={makeBossData({ challenge_id: "ch_boss_revisit_unit" })} statsLine={null} alreadyAttempted={true} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.getByTestId("boss-take-card")).toBeTruthy();
    expect(screen.getByTestId("boss-outward-ending")).toBeTruthy();
    // Revisit replaces the accept affordance — no target line / accept CTA.
    expect(screen.queryByTestId("accept-cta")).toBeNull();
    expect(screen.queryByTestId("target-line")).toBeNull();
  });

  it("does NOT fire the human variant analytics for a boss row", () => {
    render(<ChallengeTakeCardLanding data={makeBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    const variantCalls = trackMock.mock.calls.filter(c => c[0] === "challenges" && c[1] === "challenge_landing_variant");
    expect(variantCalls.length).toBe(0);
  });
});

// ── Boss REAL cards (Consolidation Phase 3 step 3) ─────────────────────
//
// When the sport's real-card renderer is threaded (basketball
// h2hArcRenderer), the boss branch renders REAL boss cards via that
// renderer instead of the neutral HandCard chip. JSDOM verifies the
// render-path wiring + the hub mapping is applied (NOT the visual — the
// scale/layout is glass-required per CLAUDE.md). Boss data uses the REAL
// wire shape the GET handler returns: { basePlayerId, fp, name, pos,
// salary, tier } — no `team`, no `position`, no `actualFp`.

describe("Boss real cards (Phase 3 step 3) — renderBossCard wiring + hub mapping", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* jsdom */ }
  });

  // Real boss wire shape (mirrors /api/challenge/{id} for a boss).
  function realBossData(over: Partial<ChallengeLandingData> = {}): ChallengeLandingData {
    return {
      challenge_id: "ch_boss_real",
      created_by: null,
      sender_kind: "boss",
      challenger_name: "Banner 18",
      share_headline: "Tatum and Brown finish it",
      tough_day: false,
      target_score: 145.2,
      sport: "basketball",
      season: "2425",
      trigger_type: "boss",
      initial_roster: {
        v: 1, sport: "basketball", holdsRecorded: false, marquee: false,
        cards: [
          { basePlayerId: "203999", name: "Nikola Jokić", pos: "C", salary: 80, tier: "RED", fp: 41.4 },
          { basePlayerId: "201939", name: "Stephen Curry", pos: "G", salary: 75, tier: "RED", fp: 33.8 },
          { basePlayerId: "1629029", name: "Luka Dončić", pos: "G", salary: 70, tier: "PURPLE", fp: 29.6 },
          { basePlayerId: "203954", name: "Joel Embiid", pos: "C", salary: 60, tier: "PURPLE", fp: 22.1 },
          { basePlayerId: "1628369", name: "Jayson Tatum", pos: "F", salary: 45, tier: "BLUE", fp: 18.3 },
        ],
      },
      roster_size: 5,
      attempt_count: 0, winner_count: 0, best_score: null, best_user_name: null,
      near_miss_gap: null, near_miss_next_tier: null, anchor_base_player_id: null, top_game_tier: null,
      ...over,
    };
  }

  function recordingRenderer() {
    const calls: Array<{ card: any; opts: any }> = [];
    const renderer: CardRenderer = ((card: any, opts: any) => {
      calls.push({ card, opts });
      return <div data-testid="stub-boss-card" />;
    }) as unknown as CardRenderer;
    return { renderer, calls };
  }

  it("renders REAL cards via renderBossCard (one call per card), NOT neutral chips", () => {
    const { renderer, calls } = recordingRenderer();
    render(<ChallengeTakeCardLanding data={realBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} renderBossCard={renderer} />);
    expect(screen.getByTestId("boss-real-cards")).toBeTruthy();
    expect(screen.getAllByTestId("stub-boss-card")).toHaveLength(5);
    // The neutral-chip path is NOT taken when the renderer is present.
    expect(screen.queryByTestId("starting-hand")).toBeNull();
    expect(screen.queryByTestId("hand-card-neutral")).toBeNull();
    expect(calls.length).toBe(5);
  });

  it("applies the hub mapping verbatim (cardId, position←pos, wasHeld:false, fp→actual/projected) + static opts", () => {
    const { renderer, calls } = recordingRenderer();
    render(<ChallengeTakeCardLanding data={realBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} renderBossCard={renderer} />);
    const first = calls[0].card;
    expect(first.cardId).toBe("203999-boss-0");        // ${basePlayerId}-boss-${i}
    expect(first.position).toBe("C");                   // pos → position
    expect(first.wasHeld).toBe(false);                  // boss has no held concept
    expect(first.actualFp).toBe(41.4);                  // fp → actualFp
    expect(first.projectedFp).toBe(41.4);               // fp → projectedFp
    expect(calls[0].opts.revealed).toBe(true);          // static settled card
    // positional cardId stays unique across the five
    expect(new Set(calls.map(c => c.card.cardId)).size).toBe(5);
  });

  it("falls back to the neutral HandCard chip when renderBossCard is ABSENT (graceful)", () => {
    render(<ChallengeTakeCardLanding data={realBossData()} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} />);
    expect(screen.queryByTestId("boss-real-cards")).toBeNull();
    expect(screen.getByTestId("starting-hand")).toBeTruthy();
    expect(screen.getAllByTestId("hand-card-neutral")).toHaveLength(5);
  });

  it("the HUMAN take-card path never invokes renderBossCard (boss-gated only)", () => {
    const { renderer, calls } = recordingRenderer();
    render(<ChallengeTakeCardLanding data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "John" })} statsLine={null} alreadyAttempted={false} calculateWinTier={testWinTier} onAccept={() => {}} renderBossCard={renderer} />);
    expect(screen.getByTestId("take-headline")).toBeTruthy(); // human surface
    expect(screen.queryByTestId("boss-real-cards")).toBeNull();
    expect(calls.length).toBe(0);
  });
});
