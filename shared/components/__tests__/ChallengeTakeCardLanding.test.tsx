// @vitest-environment jsdom
//
// shared/components/__tests__/ChallengeTakeCardLanding.test.tsx
//
// RD5.1 — decision-frame challenge landing. Spec of record:
// docs/rd5-1-headline-system-spec.md. Directive: docs/rd5-1-directive.md.
//
// Governing principle the assertions enforce:
//   - The headline starts an argument; the seal provides evidence; the
//     CTA lets the recipient answer. Headline never contains the seal's
//     word (no-duplication guardrail).
//   - Score appears EXACTLY ONCE on the screen — in the target line,
//     above the CTA. Never in any headline.
//   - Recipient CTA = frame-aware (per-trigger). Owner / alreadyAttempted
//     path keeps "Play Again" verbatim (out of scope for RD5.1).
//   - Deleted: HELD line · dare ("Can you beat him?") · attribution
//     footer · the red "HOLD" pill. Held cards now carry the yellow-H
//     corner glyph (same as the live game / H2H card).
//
// Pure-headline mechanics live in landingHeadlines.test.ts; this file
// scopes to the rendered surface.

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChallengeTakeCardLanding, type ChallengeLandingData } from "../ChallengeTakeCardLanding";

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

// ── Per-trigger headline + seal + CTA (rendered surface) ────────────────

describe("RD5.1 landing — per-trigger headline + seal + CTA wiring", () => {
  it("choke: decision-frame headline + CHOKE seal + MAKE THE BETTER CALL cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "John", targetScore: 126.2 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("JOHN TRUSTED EMBIID AND VUCEVIC. THE CALL COST HIM.");
    expect(screen.getByTestId("landing-badge").textContent).toBe("CHOKE");
    expect(screen.getByTestId("accept-cta").textContent).toBe("MAKE THE BETTER CALL");
  });

  it("big_score: monster-hand headline + BIG SCORE seal + TRY TO TOP IT cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "big_score", heldPair: ["cur", "emb"], challengerName: "John" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("JOHN PUT TOGETHER A MONSTER HAND.");
    expect(screen.getByTestId("landing-badge").textContent).toBe("BIG SCORE");
    expect(screen.getByTestId("accept-cta").textContent).toBe("TRY TO TOP IT");
  });

  it("rare_pull (career): nobody-saw-it headline + CAREER HIGH seal + TAKE YOUR SHOT cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "rare_pull", heldPair: ["cur", "emb"], challengerName: "John", topGameTier: "career" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("JOHN FOUND SOMETHING NOBODY SAW COMING.");
    expect(screen.getByTestId("landing-badge").textContent).toBe("CAREER HIGH");
    expect(screen.getByTestId("accept-cta").textContent).toBe("TAKE YOUR SHOT");
  });

  it("miss (MVP): tier-agnostic headline + 'MVP MISS' seal + FIND THE SWAP cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "miss", heldPair: ["bro", "cur"], challengerName: "John", nearMissGap: 4, nearMissNextTier: "MVP" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("ONE SWAP STOOD BETWEEN JOHN AND GREATNESS.");
    expect(screen.getByTestId("landing-badge").textContent).toBe("MVP MISS");
    expect(screen.getByTestId("accept-cta").textContent).toBe("FIND THE SWAP");
  });

  it("miss headline is tier-agnostic (same string for ALL_STAR / MVP / LEGEND)", () => {
    const headlineFor = (tier: string) => {
      const { unmount } = render(
        <ChallengeTakeCardLanding
          data={makeData({ trigger: "miss", heldPair: ["bro", "cur"], challengerName: "John", nearMissNextTier: tier })}
          statsLine={null}
          alreadyAttempted={false}
          onAccept={() => {}}
        />,
      );
      const t = screen.getByTestId("take-headline").textContent;
      unmount();
      return t;
    };
    expect(headlineFor("ALL_STAR")).toBe(headlineFor("MVP"));
    expect(headlineFor("MVP")).toBe(headlineFor("LEGEND"));
  });

  it("default: clean direct dare + NO seal + CLEAR IT cta", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null, challengerName: "John" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("take-headline").textContent).toBe("JOHN SET THE BAR.");
    expect(screen.queryByTestId("evidence-seal")).toBeNull();
    expect(screen.queryByTestId("landing-badge")).toBeNull();
    expect(screen.getByTestId("accept-cta").textContent).toBe("CLEAR IT");
  });

  it("legacy stored trigger_type='bad_beat' routes through normalizeTriggerType → CHOKE", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "bad_beat", heldPair: ["emb", "voo"], challengerName: "John" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("landing-badge").textContent).toBe("CHOKE");
    expect(screen.getByTestId("accept-cta").textContent).toBe("MAKE THE BETTER CALL");
  });
});

// ── No-duplication guardrail (rendered headlines) ──────────────────────

describe("RD5.1 landing — no-duplication guardrail (headline must NOT contain seal's word)", () => {
  const cases: Array<{ trigger: string; opts: MakeOpts; forbidden: RegExp }> = [
    { trigger: "choke",     opts: { trigger: "choke",     heldPair: ["emb", "voo"], challengerName: "John" },                                              forbidden: /\b(choke|choked|choking)\b/i },
    { trigger: "big_score", opts: { trigger: "big_score", heldPair: ["emb", "cur"], challengerName: "John" },                                              forbidden: /\b(big|score|scored|scoring)\b/i },
    { trigger: "miss",      opts: { trigger: "miss",      heldPair: ["bro", "cur"], challengerName: "John", nearMissNextTier: "MVP" },                     forbidden: /\b(miss|missed|missing)\b/i },
    { trigger: "rare_pull", opts: { trigger: "rare_pull", heldPair: ["cur", "emb"], challengerName: "John", topGameTier: "record" },                       forbidden: /\b(rare|pull|record|career|season)\b/i },
  ];
  for (const c of cases) {
    it(`${c.trigger} headline does not contain the seal's vocabulary`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData(c.opts)}
          statsLine={null}
          alreadyAttempted={false}
          onAccept={() => {}}
        />,
      );
      const text = screen.getByTestId("take-headline").textContent ?? "";
      expect(text, `${c.trigger} headline "${text}" tripped its own seal vocabulary`).not.toMatch(c.forbidden);
    });
  }
});

// ── Score-renders-once + target-line placement ─────────────────────────

describe("RD5.1 landing — score appears exactly once, in the target line", () => {
  const triggers = ["choke", "miss", "big_score", "rare_pull", "default"];
  for (const trigger of triggers) {
    it(`${trigger}: target line renders '${trigger === "miss" ? "" : "Target to beat: …"}'; no number in any headline`, () => {
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
          onAccept={() => {}}
        />,
      );
      const target = screen.getByTestId("target-line");
      expect(target.textContent?.toUpperCase()).toContain("TARGET TO BEAT");
      expect(target.textContent).toContain("126.2 FP");
      // No headline contains the numeric.
      expect(screen.getByTestId("take-headline").textContent).not.toContain("126.2");
      // The numeric appears exactly once in the rendered tree.
      const root = screen.getByTestId("challenge-take-card-landing");
      const matches = (root.textContent ?? "").match(/126\.2/g) ?? [];
      expect(matches.length, `numeric '126.2' rendered ${matches.length} times — should be exactly 1`).toBe(1);
    });
  }

  it("target line rounds to one decimal (165 → 165.0)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], targetScore: 165, challengerName: "John" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("target-line").textContent).toContain("165.0 FP");
  });
});

// ── CTA — recipient frame-aware vs owner unchanged ─────────────────────

describe("RD5.1 landing — CTA wiring (frame-aware recipient; owner path unchanged)", () => {
  it("recipient (fresh) on choke → 'MAKE THE BETTER CALL'", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    expect(screen.getByTestId("accept-cta").textContent).toBe("MAKE THE BETTER CALL");
  });

  it("OWNER path (alreadyAttempted=true) keeps 'Play Again' verbatim — out of scope for RD5.1", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={true}
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
        onAccept={handle}
      />,
    );
    fireEvent.click(screen.getByTestId("accept-cta"));
    expect(handle).toHaveBeenCalledTimes(2);
  });
});

// ── Seal placement — standalone element, NOT inside the h1 ─────────────

describe("RD5.1 landing — seal is a standalone evidence element (not inline in the h1)", () => {
  it("choke: seal lives in evidence-seal wrapper outside the take-headline", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    const seal = screen.getByTestId("evidence-seal");
    const badge = screen.getByTestId("landing-badge");
    const h1 = screen.getByTestId("take-headline");
    expect(seal.contains(badge), "the badge must live inside evidence-seal").toBe(true);
    expect(h1.contains(badge), "the badge must NOT live inside the h1 take-headline anymore").toBe(false);
  });

  it("default: NO evidence-seal element AT ALL", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    expect(screen.queryByTestId("evidence-seal")).toBeNull();
    expect(screen.queryByTestId("landing-badge")).toBeNull();
  });
});

// ── Hand evidence — yellow-H glyph on held cards ───────────────────────

describe("RD5.1 landing — yellow-H hold glyph replaces the red HOLD pill", () => {
  it("held cards render the yellow-H corner glyph (NOT a 'HOLD' text pill)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    const badges = screen.getAllByTestId("hold-badge");
    expect(badges).toHaveLength(2);
    for (const b of badges) {
      // The glyph's text content is just "H", not "HOLD". This locks the
      // red-pill regression so a future tweak can't reintroduce it.
      expect(b.textContent).toBe("H");
      // The triangle uses the live game's #F5C850 yellow fill.
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
        onAccept={() => {}}
      />,
    );
    expect(screen.queryAllByTestId("hand-card-held")).toHaveLength(0);
    expect(screen.queryAllByTestId("hand-card-plain")).toHaveLength(6);
    expect(screen.queryAllByTestId("hold-badge")).toHaveLength(0);
  });

  it("every card carries name + team; tier chip + per-card salary stay stripped", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />,
    );
    const root = screen.getByTestId("starting-hand");
    const text = root.textContent ?? "";
    for (const name of ["Embiid", "Vucevic", "Brown", "Curry", "Bagley", "Holiday"]) {
      expect(text, `missing name ${name}`).toContain(name);
    }
    for (const salary of ["$80", "$65", "$55", "$75", "$35", "$25"]) {
      expect(text, `salary ${salary} should be stripped`).not.toContain(salary);
    }
  });
});

// ── Deleted elements (HELD line · dare · attribution) ──────────────────

describe("RD5.1 landing — deleted surfaces are absent", () => {
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
          onAccept={() => {}}
        />,
      );
      expect(screen.queryByTestId("held-list")).toBeNull();
      expect(screen.queryByTestId("dare-line")).toBeNull();
      expect(screen.queryByTestId("attribution")).toBeNull();
      // Defensive: no "from John" footer string in the tree.
      const root = screen.getByTestId("challenge-take-card-landing");
      expect(root.textContent).not.toMatch(/from John/i);
      // No "Can you beat" dare string.
      expect(root.textContent).not.toMatch(/can you beat/i);
    });
  }
});

// ── Supporting culture line — preserved (curated knownFor path) ────────

describe("RD5.1 landing — supporting culture line (preserved from prior phase)", () => {
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
        onAccept={() => {}}
      />,
    );
    expect(screen.queryByTestId("supporting-culture-line")).toBeNull();
  });

  it("ON renders the knownFor line below the headline (curated, single-source-of-truth)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeCultureRichData()}
        statsLine={null}
        alreadyAttempted={false}
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
        onAccept={() => {}}
        showCultureLine={true}
      />,
    );
    expect(screen.queryByTestId("supporting-culture-line")).toBeNull();
  });
});
