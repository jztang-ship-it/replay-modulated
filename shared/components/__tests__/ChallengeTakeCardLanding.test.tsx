// @vitest-environment jsdom
//
// shared/components/__tests__/ChallengeTakeCardLanding.test.tsx
//
// Phase 2c landing gates. Lock: docs/challenge-landing-v2-phase2c-
// take-evidence-dare-lock.md. Pins the locked product decisions:
//   - TAKE → EVIDENCE → DARE hierarchy: TAKE precedes USP, USP precedes
//     cards, cards precede evidence line, evidence line precedes dare,
//     dare precedes CTA.
//   - Held cards render bright + HOLD badge; discards dim.
//   - FP SPOILER GUARD: NO per-card actualFp chip renders on any card
//     in either mode.
//   - Hand TOTAL renders in both modes (stakes / wall framing).
//   - heldCards [] → labeled held list omits entirely.
//   - In-flow badge: no thud wrapper, no absolute, no translate.
//   - CTA wires to onAccept; alreadyAttempted relabels to "Play Again".

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChallengeTakeCardLanding, type ChallengeLandingData } from "../ChallengeTakeCardLanding";

// Wrap the take-card generator in vi.fn so the #4a blank-case floor
// test can mockReturnValueOnce an empty take. Default delegates to the
// real implementation, so every other spec runs against the real
// generator output.
vi.mock("@shared/challengeTakeCard/generateChallengeTakeCard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/challengeTakeCard/generateChallengeTakeCard")>();
  return {
    ...actual,
    generateChallengeTakeCard: vi.fn(actual.generateChallengeTakeCard),
  };
});
import { generateChallengeTakeCard } from "@shared/challengeTakeCard/generateChallengeTakeCard";

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
  /** Phase 2d — per-card actualFp override (basePlayerId → fp). When
   *  omitted, defaults yield MID-zone ratios → anchor-truth = generic. */
  heldOutcomes?: Record<string, number>;
}

function makeData(opts: MakeOpts = {}): ChallengeLandingData {
  const heldPair = opts.heldPair ?? null;
  const isHeld = (id: string) => !!heldPair && heldPair.includes(id);
  const outcomes = opts.heldOutcomes ?? {};
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
    actualFp: isHeld(id) ? (outcomes[id] ?? defaultActualFp) : 0,
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
        // Default actualFp values land each held card at ratio ~0.76 — in
        // the MID zone, so anchor-truth defaults to "generic" for every
        // existing test. 2d-specific tests override via heldOutcomes.
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

function domOrderOf(rootSelector: string, testIds: string[]): Map<string, number> {
  const root = document.querySelector(rootSelector);
  if (!root) throw new Error(`root ${rootSelector} not found`);
  const seen = new Map<string, number>();
  let i = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Element | null = root as Element;
  while (node) {
    const t = (node as HTMLElement).getAttribute?.("data-testid");
    if (t && testIds.includes(t) && !seen.has(t)) {
      seen.set(t, i++);
    }
    node = walker.nextNode() as Element | null;
  }
  return seen;
}

describe("ChallengeTakeCardLanding — RD5 hierarchy (TAKE → starting-hand → held-list → dare → CTA)", () => {
  it("DOM order: TAKE → starting-hand → held-list → dare → CTA (USP deleted)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], targetScore: 142.5 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const order = domOrderOf("[data-testid='challenge-take-card-landing']", [
      "take-headline",
      "starting-hand",
      "held-list",
      "dare-line",
      "accept-cta",
    ]);
    expect(order.get("take-headline")!).toBeLessThan(order.get("starting-hand")!);
    expect(order.get("starting-hand")!).toBeLessThan(order.get("held-list")!);
    expect(order.get("held-list")!).toBeLessThan(order.get("dare-line")!);
    expect(order.get("dare-line")!).toBeLessThan(order.get("accept-cta")!);
    // RD5: the usp-subheadline ("Same starting hand. Different decisions.")
    // was deleted; the held-list + HOLD badges carry the
    // fairness-mechanic story now.
    expect(screen.queryByTestId("usp-subheadline")).toBeNull();
    // The pre-RD5 stakes-word evidence-line is also gone — its slot is
    // now occupied by the held-list element.
    expect(screen.queryByTestId("evidence-line")).toBeNull();
  });
});

describe("ChallengeTakeCardLanding — FP-SPOILER GUARD (no per-card FP chip in either mode)", () => {
  const triggers = ["choke", "miss", "big_score", "rare_pull", "default"];

  for (const trigger of triggers) {
    it(`${trigger}: zero cards render a held-actualfp-chip test-id`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({
            trigger,
            heldPair: trigger === "default" ? null : ["emb", "voo"],
            nearMissGap: trigger === "miss" ? 4 : null,
            nearMissNextTier: trigger === "miss" ? "ALL_STAR" : null,
            anchor: trigger === "default" ? null : "voo",
          })}
          statsLine={null}
          alreadyAttempted={false}
          onAccept={() => {}}
        />
      );
      // The 2b chip used data-testid="held-actualfp-chip"; 2c removes
      // it entirely. Verify by absence.
      expect(screen.queryAllByTestId("held-actualfp-chip")).toHaveLength(0);
    });
  }

  it("HOLD badge marks the held cards (in lieu of the FP chip)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const holds = screen.getAllByTestId("hold-badge");
    expect(holds).toHaveLength(2);
    for (const h of holds) {
      expect(h.textContent).toBe("HOLD");
    }
  });
});

describe("ChallengeTakeCardLanding — held-card prominence + held list + legacy", () => {
  it("2 held → 2 prominent + 2 HOLD badges; RD5 held-list names the same held cards", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getAllByTestId("hand-card-held")).toHaveLength(2);
    expect(screen.getAllByTestId("hand-card-plain")).toHaveLength(4);
    expect(screen.getAllByTestId("hold-badge")).toHaveLength(2);
    // RD5 — the held-list element renders held names (no per-card FP).
    // The pre-RD5 #4a "always-absent" rule was reversed by the
    // 2026-06-08 lock amendment (FP-spoiler rule split): per-card FP
    // is still suppressed, but the held-name supporting line is the
    // RD5 lead-in to the dare.
    const heldList = screen.getByTestId("held-list");
    expect(heldList.textContent).toContain("Held:");
    expect(heldList.textContent?.toUpperCase()).toContain("EMBIID");
    expect(heldList.textContent?.toUpperCase()).toContain("VUCEVIC");
    // The legacy "MIKE'S LINE" exhibit + per-name testid stay retired.
    expect(screen.queryByTestId("line-owner")).toBeNull();
    expect(screen.queryAllByTestId("held-name")).toHaveLength(0);
  });

  it("holdsRecorded:false → 6 plain cards, no HOLD badges, held-list OMITTED (empty heldNames)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: null,
          holdsRecorded: false,
          anchor: null,
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryAllByTestId("hand-card-held")).toHaveLength(0);
    expect(screen.queryAllByTestId("hand-card-plain")).toHaveLength(6);
    expect(screen.queryAllByTestId("hold-badge")).toHaveLength(0);
    // Empty held set → element omitted entirely (no bare "Held:" label).
    expect(screen.queryByTestId("held-list")).toBeNull();
  });

  it("every card carries name + team (#4a declutter: tier chip + salary stripped from HandCard)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const root = screen.getByTestId("starting-hand");
    const text = root.textContent ?? "";
    for (const name of ["Embiid", "Vucevic", "Brown", "Curry", "Bagley", "Holiday"]) {
      expect(text, `missing name ${name}`).toContain(name);
    }
    for (const team of ["PHI", "ORL", "BOS", "GSW", "WAS"]) {
      expect(text, `missing team ${team}`).toContain(team);
    }
    // #4a stripped the visible tier chip + per-card salary — cards now
    // read as name + team. Tier color still threads via data-tier-accent
    // on the HandCard root (asserted separately).
    for (const salary of ["$80", "$65", "$55", "$75", "$35", "$25"]) {
      expect(text, `salary ${salary} should be stripped`).not.toContain(salary);
    }
    for (const tier of ["RED", "PURPLE", "BLUE", "GREEN"]) {
      expect(text, `tier chip ${tier} should be stripped`).not.toContain(tier);
    }
  });
});

// RD5 (2026-06-08): the Phase-2e "conditional choke evidence" describe
// (stakes-word evidence-line per mode) and the Phase-2d "anchor-truth
// wiring" describe (take-headline content via takeCard.take) were
// deleted from this file. The landing no longer renders the take
// engine's evidenceLine OR takeCard.take — the hero is the deterministic
// number-forward template and the held-list takes the evidence slot.
// Generator-level coverage of anchor-truth + stakes mapping stays in
// shared/challengeTakeCard/__tests__/generateChallengeTakeCard.test.ts;
// this file scopes to LANDING-RENDER assertions.

describe("ChallengeTakeCardLanding — supporting culture line (optional, off by default)", () => {
  // The component wires lookupCulture(name, sport, tier, seed, basePlayerId,
  // team). The makeData synthetic basePlayerIds (emb/voo/etc.) won't hit
  // the basketball culture DB → lookupCulture returns null → no
  // supporting line. Use a Kobe fixture with the REAL basePlayerId
  // "977" to exercise the culture-resolved path end-to-end.
  // (RD5: the take-content + DE-DUP cases that used to share this
  // describe were retired with the take-engine landing render; the
  // supporting-culture-line surface is unaffected by RD5.)

  function makeCultureRichData(heldOutcomes: Record<string, number> = { kobe: 47, kidd: 12 }): ChallengeLandingData {
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
            projectedFp: 50, wasHeld: true, actualFp: heldOutcomes.kobe ?? 47 },
          { id: "kidd", basePlayerId: "467", personKey: "467", cardId: "kidd_c",
            name: "Jason Kidd", team: "DAL", season: "2425", position: "G",
            photoCode: null, salary: 60, tier: "RED", slotIndex: 1,
            projectedFp: 35, wasHeld: true, actualFp: heldOutcomes.kidd ?? 12 },
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

  it("supporting culture line — OFF by default (the lock-spec'd default)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeCultureRichData()}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("supporting-culture-line")).toBeNull();
  });

  it("supporting culture line — ON renders knownFor below the take (the see-it-then-decide path)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeCultureRichData()}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
        showCultureLine={true}
      />
    );
    const line = screen.queryByTestId("supporting-culture-line");
    expect(line).not.toBeNull();
    // Kobe's knownFor mentions Jordan and the bridge to LeBron's era.
    expect(line!.textContent).toMatch(/champion|All-Star|Jordan|LeBron/);
  });

  it("supporting culture line — ON but NO culture (synthetic ID) → not rendered, no crash", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
        showCultureLine={true}
      />
    );
    expect(screen.queryByTestId("supporting-culture-line")).toBeNull();
  });

  it("supporting culture line — ON + legacy (holdsRecorded:false) → not rendered (no anchor resolution)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: null, holdsRecorded: false, anchor: null })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
        showCultureLine={true}
      />
    );
    expect(screen.queryByTestId("supporting-culture-line")).toBeNull();
  });
});

describe("ChallengeTakeCardLanding — Phase 2d layout (stamp inline, all six tier-colored, one sender)", () => {
  it("stamp renders INSIDE the take-headline element (not absolute, not above)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const headline = screen.getByTestId("take-headline");
    const badge = screen.getByTestId("landing-badge");
    expect(
      headline.contains(badge),
      "stamp must live inside the take-headline so it flows after the wrap",
    ).toBe(true);
  });

  it("all six cards carry a TIER color (not the 2c near-black 'disabled' treatment) via data-tier-accent", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const all = screen.getAllByTestId(/^hand-card-(held|plain)$/);
    expect(all).toHaveLength(6);
    const knownTierAccents = ["#EF4444", "#FB923C", "#C084FC", "#3B82F6", "#22C55E", "#9CA3AF"]
      .map(s => s.toLowerCase());
    for (const c of all) {
      const accent = (c.getAttribute("data-tier-accent") ?? "").toLowerCase();
      expect(
        knownTierAccents,
        `card accent ${accent} not in tier palette — likely the 2c near-black treatment`,
      ).toContain(accent);
    }
  });

  it("HELD cards saturated + UNHELD cards muted (held opacity 1, unheld < 1)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    for (const held of screen.getAllByTestId("hand-card-held")) {
      expect((held as HTMLElement).style.opacity).toBe("1");
    }
    for (const plain of screen.getAllByTestId("hand-card-plain")) {
      const op = Number((plain as HTMLElement).style.opacity);
      expect(op, `unheld opacity ${op} should be < 1 (muted, not full)`).toBeLessThan(1);
      expect(op, `unheld opacity ${op} should be > 0.4 (muted, not disabled)`).toBeGreaterThan(0.4);
    }
  });

  // #4a single-mention rule: EXACTLY ONE sender mention per landing, in
  // the bottom attribution. The Phase 2d "MIKE'S LINE / HOLD: …" block
  // was the holds-recorded mention site pre-#4a; with that block
  // removed, attribution now carries it on every named row (holds
  // recorded or legacy).

  it("HOLDS-RECORDED + named → sender mentioned TWICE (once in the RD5 hero, once in attribution)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: ["emb", "voo"],
          challengerName: "Denzel",
        })}
        statsLine="3 attempts · 67% failed"
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const root = screen.getByTestId("challenge-take-card-landing");
    const matches = (root.textContent ?? "").match(/Denzel/gi) ?? [];
    // RD5 — the hero now reads "Denzel SCORED N FP", so the challenger
    // is named in the hero AND in the attribution. The pre-RD5
    // "EXACTLY ONCE" rule reflected the old take-content hero (which
    // never named the sender); the lock amendment makes Score-on-the-
    // landing explicit and the name surfaces in the hero by design.
    expect(matches.length, `holds-recorded sender mentioned ${matches.length} times — RD5 expects 2 (hero + attribution)`).toBe(2);
    expect(screen.getByTestId("take-headline").textContent).toContain("Denzel SCORED");
    expect(screen.getByTestId("attribution").textContent).toContain("from Denzel");
    expect(screen.queryByTestId("line-owner")).toBeNull();
  });

  it("LEGACY (holdsRecorded:false) → sender named TWICE (RD5 hero + attribution)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: null,
          holdsRecorded: false,
          anchor: null,
          challengerName: "Denzel",
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const root = screen.getByTestId("challenge-take-card-landing");
    const matches = (root.textContent ?? "").match(/Denzel/gi) ?? [];
    expect(matches.length, `legacy sender mentioned ${matches.length} times — RD5 expects 2 (hero + attribution)`).toBe(2);
    expect(screen.getByTestId("take-headline").textContent).toContain("Denzel SCORED");
    expect(screen.getByTestId("attribution").textContent).toContain("from Denzel");
    expect(screen.queryByTestId("line-owner")).toBeNull();
  });

  it("LEGACY + statsLine → attribution renders 'from {sender}' + stats; RD5 hero also names the sender", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: null,
          holdsRecorded: false,
          anchor: null,
          challengerName: "Denzel",
        })}
        statsLine="3 attempts · 67% failed"
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const attribution = screen.getByTestId("attribution");
    expect(attribution.textContent).toContain("from Denzel");
    expect(attribution.textContent).toContain("3 attempts · 67% failed");
    expect(screen.getByTestId("take-headline").textContent).toContain("Denzel SCORED");
    const root = screen.getByTestId("challenge-take-card-landing");
    const matches = (root.textContent ?? "").match(/Denzel/gi) ?? [];
    expect(matches.length).toBe(2);
  });

  it("ANONYMOUS LEGACY (no real name + holdsRecorded:false) → ZERO sender mentions (no name to attribute)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: null,
          holdsRecorded: false,
          anchor: null,
          challengerName: null,
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    // No challenger name → no MIKE'S LINE, no "from X". Zero is the
    // correct count when there's nothing to attribute.
    expect(screen.queryByTestId("line-owner")).toBeNull();
    expect(screen.queryByTestId("attribution")).toBeNull();
  });

  it("HOLDS-RECORDED + named + null statsLine → attribution renders 'from {sender}' (#4a: held-list block was the prior mention site)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "Denzel" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const attribution = screen.getByTestId("attribution");
    expect(attribution.textContent).toBe("from Denzel");
    expect(screen.queryByTestId("line-owner")).toBeNull();
  });

  it("HOLDS-RECORDED + named + statsLine → attribution renders BOTH 'from {sender}' AND stats (#4a)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "Denzel" })}
        statsLine="3 attempts · 67% failed"
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const attribution = screen.getByTestId("attribution");
    expect(attribution.textContent).toContain("from Denzel");
    expect(attribution.textContent).toContain("3 attempts · 67% failed");
  });
});

describe("ChallengeTakeCardLanding — RD5: every trigger renders the full set of surfaces", () => {
  const cases = [
    { trigger: "choke",     extra: { heldPair: ["emb", "voo"] as [string, string] }, expectHeld: true },
    { trigger: "miss",      extra: { heldPair: ["bro", "cur"] as [string, string], nearMissGap: 4, nearMissNextTier: "ALL_STAR" }, expectHeld: true },
    { trigger: "big_score", extra: { heldPair: ["cur", "emb"] as [string, string] }, expectHeld: true },
    { trigger: "rare_pull", extra: { heldPair: ["cur", "emb"] as [string, string], topGameTier: "record" as const }, expectHeld: true },
    { trigger: "default",   extra: { heldPair: null, anchor: null }, expectHeld: false },
  ];

  for (const { trigger, extra, expectHeld } of cases) {
    it(`${trigger}: hero + hand + ${expectHeld ? "held-list" : "no held-list"} + dare + CTA all present`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({ trigger, ...extra })}
          statsLine={null}
          alreadyAttempted={false}
          onAccept={() => {}}
        />
      );
      expect(screen.getByTestId("take-headline").textContent?.length).toBeGreaterThan(0);
      // RD5 — usp-subheadline + evidence-line testids are gone.
      expect(screen.queryByTestId("usp-subheadline")).toBeNull();
      expect(screen.queryByTestId("evidence-line")).toBeNull();
      expect(screen.getAllByTestId(/^hand-card-(held|plain)$/).length).toBe(6);
      if (expectHeld) {
        expect(screen.getByTestId("held-list").textContent?.length).toBeGreaterThan(0);
      } else {
        // default trigger renders heldPair: null → held-list omitted.
        expect(screen.queryByTestId("held-list")).toBeNull();
      }
      expect(screen.getByTestId("dare-line").textContent?.length).toBeGreaterThan(0);
      expect(screen.getByTestId("accept-cta").textContent?.length).toBeGreaterThan(0);
    });
  }
});

describe("ChallengeTakeCardLanding — in-flow badge (no thud, no clip)", () => {
  it("choke renders the in-flow badge with CHOKE label, NOT a TeamStamp thud wrapper", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const badge = screen.getByTestId("landing-badge");
    expect(badge.textContent).toBe("CHOKE");
    expect(badge.getAttribute("data-trigger")).toBe("choke");
    // No TeamStamp thud wrapper anywhere in the rendered tree.
    expect(document.querySelector(".ts-stamp-wrap-thud")).toBeNull();
  });

  it("miss renders the in-flow badge with '{tier} MISS' label", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "miss",
          heldPair: ["bro", "cur"],
          nearMissGap: 4,
          nearMissNextTier: "ALL_STAR",
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("landing-badge").textContent).toBe("ALL STAR MISS");
  });

  it("big_score renders the BIG SCORE in-flow badge", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "big_score", heldPair: ["cur", "emb"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("landing-badge").textContent).toBe("BIG SCORE");
  });

  it("rare_pull renders the top_game_tier-derived badge (NEW RECORD / CAREER HIGH / SEASON HIGH)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "rare_pull", heldPair: ["cur", "emb"], topGameTier: "record" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("landing-badge").textContent).toBe("NEW RECORD");
  });

  it("default renders NO badge", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("landing-badge")).toBeNull();
    expect(screen.queryByTestId("badge-row")).toBeNull();
  });

  it("in-flow badge inline style uses transform: rotate only — no translate (the clip-prevention contract)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const badge = screen.getByTestId("landing-badge") as HTMLElement;
    const transform = badge.style.transform;
    expect(transform).toContain("rotate");
    expect(transform).not.toContain("translate");
    expect(badge.style.position === "" || badge.style.position === "static").toBe(true);
  });
});

describe("ChallengeTakeCardLanding — legacy alias + accept wiring", () => {
  it("legacy stored trigger_type='bad_beat' routes through normalizeTriggerType → CHOKE badge", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "bad_beat" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("landing-badge").textContent).toBe("CHOKE");
  });

  it("CTA click fires onAccept once", () => {
    const handle = vi.fn();
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={handle}
      />
    );
    fireEvent.click(screen.getByTestId("accept-cta"));
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("alreadyAttempted=true relabels CTA to 'Play Again' (never blocks the click)", () => {
    const handle = vi.fn();
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={true}
        onAccept={handle}
      />
    );
    const cta = screen.getByTestId("accept-cta");
    expect(cta.textContent).toBe("Play Again");
    fireEvent.click(cta);
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

// RD5 (2026-06-08): the "#4a held-list always absent" describe was
// reversed by the FP-spoiler-rule split lock amendment — held-names ARE
// now rendered as the supporting line. The "Phase 3.2 authored_headline
// wiring" describe was retired with the authored-narrative hero: the
// landing no longer reads data.authored_headline (the leak-source RD5
// is structurally immune to). Both were deleted from this file.

describe("ChallengeTakeCardLanding — RD5: number-forward hero + held names + dare CTA", () => {
  it("named challenger → hero reads '{name} SCORED {N} FP'", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], targetScore: 165.5, challengerName: "Mike" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const headline = screen.getByTestId("take-headline").textContent ?? "";
    expect(headline).toContain("Mike SCORED 165.5 FP");
    // Templated string — by construction it cannot emit "points" for
    // the FP figure (the RD0 leak shape is structurally retired here).
    expect(headline.toLowerCase()).not.toMatch(/\d+(?:\.\d+)?\s*points?\b/);
    expect(headline.toLowerCase()).not.toMatch(/\d+(?:\.\d+)?\s*pts\b/);
  });

  it("unnamed challenger → hero falls back to 'THE SCORE TO BEAT — {N} FP'", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null, targetScore: 184.5, challengerName: null })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const headline = screen.getByTestId("take-headline").textContent ?? "";
    expect(headline).toContain("THE SCORE TO BEAT — 184.5 FP");
  });

  it("hero rounds targetScore to one decimal", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], targetScore: 165, challengerName: "Mike" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("take-headline").textContent).toContain("Mike SCORED 165.0 FP");
  });

  it("held-list lists the held-card NAMES only (no per-card FP, no outcome word)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "Mike" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const heldList = screen.getByTestId("held-list");
    const text = heldList.textContent ?? "";
    expect(text).toMatch(/^Held:\s/);
    expect(text).toContain("Embiid");
    expect(text).toContain("Vucevic");
    // Per-card FP stays suppressed — heldNames is a name string, not
    // an FP receipt.
    expect(text).not.toMatch(/\d+(?:\.\d+)?\s*FP\b/);
    expect(text.toLowerCase()).not.toMatch(/busted|unbeaten|short/);
  });

  it("dare-line reads 'Can you beat him?' when challenger is named", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "Mike" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("dare-line").textContent).toBe("Can you beat him?");
  });

  it("dare-line reads 'Can you beat it?' when challenger is unnamed", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null, challengerName: null })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("dare-line").textContent).toBe("Can you beat it?");
  });

  it("accept-cta button reads 'Accept Challenge' on first attempt", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("accept-cta").textContent).toBe("Accept Challenge");
  });

  it("NO per-card FP chip rendered anywhere on the landing (spoiler guard intact)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    // The per-card FP chip data-testid stays absent — RD5 preserves
    // this spoiler guard (the lock amendment retained per-card FP
    // suppression).
    expect(screen.queryAllByTestId("held-actualfp-chip")).toHaveLength(0);
  });

  it("NO 'points' string anywhere in the hero for the FP figure (RD0 leak shape, structurally retired by RD5)", () => {
    // The landing's hero is a templated `{N} FP` string. There is no
    // code path on the landing that can render the FP figure as
    // "points". A FRESH challenge's authored_headline is no longer
    // consumed here, so a stale pre-RD0 seed on the wire cannot leak
    // through the landing surface.
    const triggers = ["choke", "miss", "big_score", "rare_pull", "default"];
    for (const trigger of triggers) {
      const { unmount } = render(
        <ChallengeTakeCardLanding
          data={makeData({
            trigger,
            heldPair: trigger === "default" ? null : ["emb", "voo"],
            anchor: trigger === "default" ? null : "voo",
            nearMissGap: trigger === "miss" ? 4 : null,
            nearMissNextTier: trigger === "miss" ? "ALL_STAR" : null,
            targetScore: 165.5,
          })}
          statsLine={null}
          alreadyAttempted={false}
          onAccept={() => {}}
        />
      );
      const headline = screen.getByTestId("take-headline").textContent ?? "";
      expect(headline.toLowerCase(), `${trigger}: hero leaked 'points' for an FP figure`).not.toMatch(/\d+(?:\.\d+)?\s*points?\b/);
      expect(headline.toLowerCase(), `${trigger}: hero leaked 'pts' for an FP figure`).not.toMatch(/\d+(?:\.\d+)?\s*pts\b/);
      unmount();
    }
  });
});
