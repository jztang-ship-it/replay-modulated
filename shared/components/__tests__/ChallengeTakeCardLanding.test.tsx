// @vitest-environment jsdom
//
// shared/components/__tests__/ChallengeTakeCardLanding.test.tsx
//
// RD5.1 v3 — decision-frame challenge landing. Spec of record:
// docs/rd5-1-headline-system-spec.md (v3 — native vocabulary lock).
//
// Governing principle the assertions enforce:
//   - Headline starts an argument (HELD verb), seal provides evidence
//     (TierGauge vocabulary), CTA lets the recipient answer (KEEP).
//   - Headline never contains the rendered seal's vocabulary (dynamic
//     guardrail computed from the seal at test time, not a const list).
//   - Score appears EXACTLY ONCE on the screen — in the target line.
//   - Recipient CTA = frame-aware. Owner alreadyAttempted path keeps
//     "Play Again" verbatim.
//   - Held cards use the yellow-H corner glyph (NOT a HOLD text pill).
//   - Deleted: HELD line, dare, attribution footer.
//   - Retired strings absent from the rendered tree: BIG SCORE, NEW RECORD,
//     MAKE THE BETTER CALL, FIND THE SWAP, TRUSTED, ONE SWAP STOOD BETWEEN.

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChallengeTakeCardLanding, type ChallengeLandingData } from "../ChallengeTakeCardLanding";
import {
  resolveSeal,
  headlineContainsSealVocabulary,
} from "../landingHeadlines";
import type { WinTierKey } from "@shared/utils/payoutLogic";

// Deterministic tier resolver for tests. Matches the legacy fallback
// thresholds (LEGEND 255 / MVP 235 / ALL_STAR 225) so a fixture at
// target_score=232.5 maps to ALL_STAR and 250 maps to MVP — the spec
// expectations for the big_score block.
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
  attemptCount?: number;
  winnerCount?: number;
}

function makeData(opts: MakeOpts = {}): ChallengeLandingData {
  const heldPair = opts.heldPair ?? null;
  const isHeld = (id: string) => !!heldPair && heldPair.includes(id);
  const card = (
    id: string,
    name: string,
    team: string,
    tier: string,
    salary: number,
    slotIndex: number,
    projectedFp: number,
    defaultActualFp: number,
  ) => ({
    id, basePlayerId: id, personKey: id, cardId: `${id}_c`,
    name, team, season: "2425", position: "F", photoCode: null,
    salary, tier, slotIndex, projectedFp,
    wasHeld: isHeld(id),
    actualFp: isHeld(id) ? defaultActualFp : 0,
  });
  return {
    challenge_id: "ch_test_1",
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
    attempt_count: opts.attemptCount ?? 2,
    winner_count: opts.winnerCount ?? 0,
    best_score: null,
    best_user_name: null,
    near_miss_gap: opts.nearMissGap ?? null,
    near_miss_next_tier: opts.nearMissNextTier ?? null,
    anchor_base_player_id: opts.anchor === undefined ? "voo" : opts.anchor,
    top_game_tier: opts.topGameTier ?? null,
  };
}

// ── Per-trigger headline + seal + CTA wiring (v3) ──────────────────────

describe("RD5.1 v3 landing — per-trigger headline + seal + CTA", () => {
  it("choke: HELD-verb headline + CHOKE seal + KEEP THE RIGHT ONES cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "John", targetScore: 126.2 })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("JOHN HELD EMBIID AND VUCEVIC. IT COST HIM.");
    expect(screen.getByTestId("landing-badge").textContent).toBe("CHOKE");
    expect(screen.getByTestId("accept-cta").textContent).toBe("KEEP THE RIGHT ONES");
  });

  it("big_score: held-stars-delivered headline + tier-only seal (MVP) + TRY TO TOP IT cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "big_score", heldPair: ["cur", "emb"], challengerName: "John", targetScore: 240 })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("JOHN HELD HIS STARS AND THEY DELIVERED.");
    expect(screen.getByTestId("landing-badge").textContent).toBe("MVP");
    expect(screen.getByTestId("accept-cta").textContent).toBe("TRY TO TOP IT");
  });

  it("big_score with LEGEND target → seal renders 'LEGEND' (not BIG SCORE)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "big_score", heldPair: ["cur", "emb"], challengerName: "John", targetScore: 260 })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("landing-badge").textContent).toBe("LEGEND");
  });

  it("big_score with ALL-STAR target → seal renders 'ALL-STAR' (hyphen)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "big_score", heldPair: ["cur", "emb"], challengerName: "John", targetScore: 228 })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("landing-badge").textContent).toBe("ALL-STAR");
  });

  it("rare_pull: nobody-saw-it headline + bare CAREER HIGH seal (no NEW) + TAKE YOUR SHOT cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "rare_pull", heldPair: ["cur", "emb"], challengerName: "John", topGameTier: "career" })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("JOHN FOUND SOMETHING NOBODY SAW COMING.");
    expect(screen.getByTestId("landing-badge").textContent).toBe("CAREER HIGH");
    expect(screen.getByTestId("accept-cta").textContent).toBe("TAKE YOUR SHOT");
  });

  it("rare_pull with topGameTier=record → seal renders bare 'RECORD' (no NEW prefix)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "rare_pull", heldPair: ["cur", "emb"], challengerName: "John", topGameTier: "record" })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("landing-badge").textContent).toBe("RECORD");
    expect(screen.getByTestId("landing-badge").textContent).not.toContain("NEW");
  });

  it("miss (MVP): keep-away headline + MVP MISS seal + KEEP WHO YOU'D KEEP cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "miss", heldPair: ["bro", "cur"], challengerName: "John", nearMissGap: 4, nearMissNextTier: "MVP" })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("JOHN WAS ONE KEEP AWAY FROM GREATNESS.");
    expect(screen.getByTestId("landing-badge").textContent).toBe("MVP MISS");
    expect(screen.getByTestId("accept-cta").textContent).toBe("KEEP WHO YOU'D KEEP");
  });

  it("default: SET THE BAR + no seal + KEEP THE RIGHT ONES cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null, challengerName: "John" })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("JOHN SET THE BAR.");
    expect(screen.queryByTestId("evidence-seal")).toBeNull();
    expect(screen.queryByTestId("landing-badge")).toBeNull();
    expect(screen.getByTestId("accept-cta").textContent).toBe("KEEP THE RIGHT ONES");
  });

  it("legacy bad_beat → normalized to CHOKE seal + HELD-verb choke headline", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "bad_beat", heldPair: ["emb", "voo"], challengerName: "John" })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("landing-badge").textContent).toBe("CHOKE");
    expect(screen.getByTestId("take-headline").textContent).toContain("HELD");
    expect(screen.getByTestId("accept-cta").textContent).toBe("KEEP THE RIGHT ONES");
  });
});

// ── Retired v2 strings absent from the rendered tree ───────────────────

describe("RD5.1 v3 landing — retired pre-v3 strings absent everywhere", () => {
  const triggers: Array<{ trigger: string; opts: MakeOpts }> = [
    { trigger: "choke",     opts: { trigger: "choke", heldPair: ["emb", "voo"], targetScore: 126.2 } },
    { trigger: "big_score", opts: { trigger: "big_score", heldPair: ["cur", "emb"], targetScore: 240 } },
    { trigger: "rare_pull", opts: { trigger: "rare_pull", heldPair: ["cur", "emb"], topGameTier: "record" } },
    { trigger: "miss",      opts: { trigger: "miss", heldPair: ["bro", "cur"], nearMissNextTier: "MVP" } },
    { trigger: "default",   opts: { trigger: "default", heldPair: null, anchor: null } },
  ];
  for (const c of triggers) {
    it(`${c.trigger}: BIG SCORE / NEW RECORD / MAKE THE BETTER CALL / FIND THE SWAP / TRUSTED / ONE SWAP STOOD BETWEEN absent`, () => {
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
        expect(text, `${c.trigger} should not contain retired v2 string "${retired}"`).not.toContain(retired);
      }
    });
  }
});

// ── Dynamic no-duplication guardrail on the rendered output ────────────

describe("RD5.1 v3 landing — dynamic no-duplication guardrail", () => {
  const cases: Array<{ trigger: string; opts: MakeOpts; sealArgs: Parameters<typeof resolveSeal>[0] }> = [
    { trigger: "choke",     opts: { trigger: "choke", heldPair: ["emb", "voo"] },                                              sealArgs: { trigger: "choke" } },
    { trigger: "big_score", opts: { trigger: "big_score", heldPair: ["emb", "cur"], targetScore: 240 },                        sealArgs: { trigger: "big_score", winTier: "MVP" } },
    { trigger: "miss",      opts: { trigger: "miss", heldPair: ["bro", "cur"], nearMissNextTier: "MVP" },                      sealArgs: { trigger: "miss", missTier: "MVP" } },
    { trigger: "miss",      opts: { trigger: "miss", heldPair: ["bro", "cur"], nearMissNextTier: "ALL_STAR" },                 sealArgs: { trigger: "miss", missTier: "ALL_STAR" } },
    { trigger: "rare_pull", opts: { trigger: "rare_pull", heldPair: ["cur", "emb"], topGameTier: "record" },                   sealArgs: { trigger: "rare_pull", topGameTier: "record" } },
    { trigger: "rare_pull", opts: { trigger: "rare_pull", heldPair: ["cur", "emb"], topGameTier: "career" },                   sealArgs: { trigger: "rare_pull", topGameTier: "career" } },
  ];
  for (const c of cases) {
    it(`${c.trigger} (seal=${resolveSeal(c.sealArgs)?.label}): rendered headline contains NO seal-vocabulary token`, () => {
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
        `${c.trigger} headline "${headline}" tripped seal "${seal?.label}" on token "${result.word}"`,
      ).toBe(false);
    });
  }
});

// ── Score-renders-once + target-line placement ─────────────────────────

describe("RD5.1 v3 landing — score appears exactly once, in target line", () => {
  const triggers = ["choke", "miss", "big_score", "rare_pull", "default"];
  for (const trigger of triggers) {
    it(`${trigger}: target line carries 126.2 FP, no headline contains it`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({
            trigger,
            heldPair: trigger === "default" ? null : ["emb", "voo"],
            anchor: trigger === "default" ? null : "voo",
            nearMissGap: trigger === "miss" ? 4 : null,
            nearMissNextTier: trigger === "miss" ? "MVP" : null,
            topGameTier: trigger === "rare_pull" ? "career" : null,
            targetScore: 126.2,
            challengerName: "John",
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

// ── CTA wiring — recipient frame-aware vs owner unchanged ──────────────

describe("RD5.1 v3 landing — CTA wiring", () => {
  it("recipient (fresh) on choke → 'KEEP THE RIGHT ONES'", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("accept-cta").textContent).toBe("KEEP THE RIGHT ONES");
  });

  it("OWNER path (alreadyAttempted=true) keeps 'Play Again' verbatim — out of scope for RD5.1", () => {
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

// ── Seal placement — standalone element, NOT inside the h1 ─────────────

describe("RD5.1 v3 landing — seal is a standalone evidence element", () => {
  it("choke: seal lives in evidence-seal wrapper outside the take-headline", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
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
});

// ── Hand evidence — yellow-H glyph on held cards ───────────────────────

describe("RD5.1 v3 landing — yellow-H hold glyph on held cards", () => {
  it("held cards render the yellow-H corner glyph (NOT a HOLD text pill)", () => {
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
      expect(polygon).not.toBeNull();
      expect(polygon!.getAttribute("fill")?.toUpperCase()).toBe("#F5C850");
    }
  });

  it("holdsRecorded:false → 6 plain cards, 0 hold glyphs", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null, holdsRecorded: false })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.queryAllByTestId("hand-card-held")).toHaveLength(0);
    expect(screen.queryAllByTestId("hand-card-plain")).toHaveLength(6);
    expect(screen.queryAllByTestId("hold-badge")).toHaveLength(0);
  });
});

// ── Deleted surfaces (HELD line · dare · attribution) ──────────────────

describe("RD5.1 v3 landing — deleted surfaces are absent", () => {
  const triggers = ["choke", "miss", "big_score", "rare_pull", "default"];
  for (const trigger of triggers) {
    it(`${trigger}: HELD line, dare-line, and attribution footer absent`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({
            trigger,
            heldPair: trigger === "default" ? null : ["emb", "voo"],
            anchor: trigger === "default" ? null : "voo",
            nearMissNextTier: trigger === "miss" ? "MVP" : null,
            topGameTier: trigger === "rare_pull" ? "career" : null,
            challengerName: "John",
          })}
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
  }
});

// ── Supporting culture line — preserved curated path ───────────────────

describe("RD5.1 v3 landing — supporting culture line (preserved)", () => {
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
      <ChallengeTakeCardLanding
        data={makeCultureRichData()}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
      />,
    );
    expect(screen.queryByTestId("supporting-culture-line")).toBeNull();
  });

  it("ON renders the knownFor line", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeCultureRichData()}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
        showCultureLine={true}
      />,
    );
    const line = screen.queryByTestId("supporting-culture-line");
    expect(line).not.toBeNull();
    expect(line!.textContent).toMatch(/champion|All-Star|Jordan|LeBron/);
  });

  it("ON + synthetic IDs (no culture match) → not rendered, no crash", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        calculateWinTier={testWinTier}
        onAccept={() => {}}
        showCultureLine={true}
      />,
    );
    expect(screen.queryByTestId("supporting-culture-line")).toBeNull();
  });
});
