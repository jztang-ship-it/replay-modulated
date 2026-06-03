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

describe("ChallengeTakeCardLanding — V2c hierarchy (TAKE → EVIDENCE → DARE)", () => {
  it("DOM order: TAKE → USP → starting-hand → evidence-line → dare → CTA", () => {
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
      "usp-subheadline",
      "starting-hand",
      "evidence-line",
      "dare-line",
      "accept-cta",
    ]);
    expect(order.get("take-headline")!).toBeLessThan(order.get("usp-subheadline")!);
    expect(order.get("usp-subheadline")!).toBeLessThan(order.get("starting-hand")!);
    expect(order.get("starting-hand")!).toBeLessThan(order.get("evidence-line")!);
    expect(order.get("evidence-line")!).toBeLessThan(order.get("dare-line")!);
    expect(order.get("dare-line")!).toBeLessThan(order.get("accept-cta")!);
  });

  it("USP subHeadline is the canonical string ('Same starting hand. Different decisions.')", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("usp-subheadline").textContent).toBe("Same starting hand. Different decisions.");
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
  it("2 held → 2 prominent + 2 HOLD badges + structured 'MIKE'S LINE / HOLD: Embiid / Vucevic' block", () => {
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
    // Phase 2d: structured DENZEL'S LINE / HOLD: block (label-led
    // exhibit, vertical names — replaces 2c's "{name} held: X, Y" prose).
    expect(screen.getByTestId("line-owner").textContent).toBe("MIKE'S LINE");
    const heldNames = screen.getAllByTestId("held-name").map(n => n.textContent);
    expect(heldNames).toEqual(["Embiid", "Vucevic"]);
    const heldList = screen.getByTestId("held-list");
    expect(heldList.textContent).toContain("HOLD:");
  });

  it("anonymous sender → 'THE LINE' label (no sender name leak in the held-list header)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: null })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("line-owner").textContent).toBe("THE LINE");
  });

  it("holdsRecorded:false → 6 plain cards, no HOLD badges, held list OMITTED entirely", () => {
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
    expect(screen.queryByTestId("held-list")).toBeNull();
  });

  it("every card carries name + salary + rarity (kept on both held and plain)", () => {
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
    for (const tier of ["RED", "PURPLE", "BLUE", "GREEN"]) {
      expect(text, `missing tier label ${tier}`).toContain(tier);
    }
    for (const salary of ["$80", "$65", "$55", "$75", "$35", "$25"]) {
      expect(text, `missing salary ${salary}`).toContain(salary);
    }
  });
});

describe("ChallengeTakeCardLanding — Phase 2e conditional choke evidence", () => {
  it("correction (choke, generic, 2 held) → 'HELD THE STARS. BUSTED.' prefix (no held-name fuse)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], targetScore: 142.0 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    // Default makeData ratios are MID → anchor-truth = generic → 2e
    // conditional prefix fires "HELD THE STARS. BUSTED." (replaces the
    // 2d name-fusion "EMBIID AND VUCEVIC. BUSTED.").
    expect(screen.getByTestId("evidence-line").textContent).toBe("HELD THE STARS. BUSTED.");
  });

  it("competition (big_score) → '{N} TRIED. {N} FAILED.' stakes when 2+ attempts / 0 winners", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "big_score",
          heldPair: ["cur", "emb"],
          attemptCount: 3,
          winnerCount: 0,
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("evidence-line").textContent).toBe("3 TRIED. 3 FAILED.");
  });

  it("competition (big_score) with 0 attempts → 'UNBEATEN' stakes", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "big_score",
          heldPair: ["cur", "emb"],
          attemptCount: 0,
          winnerCount: 0,
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("evidence-line").textContent).toBe("UNBEATEN");
  });

  it("neutral (default) → 'A NUMBER ON THE BOARD. BEAT IT.' stakes", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null, targetScore: 184.5 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("evidence-line").textContent).toBe("A NUMBER ON THE BOARD. BEAT IT.");
  });

  // Phase 2d core gate: no raw FP number on the landing.
  it("NO 'X.X FP' string anywhere in the rendered landing across all triggers", () => {
    const triggers = ["choke", "miss", "big_score", "rare_pull", "default"];
    const fpNumberRe = /\d+(?:\.\d+)?\s*FP\b/i;
    for (const trigger of triggers) {
      const { unmount } = render(
        <ChallengeTakeCardLanding
          data={makeData({
            trigger,
            heldPair: trigger === "default" ? null : ["emb", "voo"],
            anchor: trigger === "default" ? null : "voo",
            nearMissGap: trigger === "miss" ? 4 : null,
            nearMissNextTier: trigger === "miss" ? "ALL_STAR" : null,
          })}
          statsLine={null}
          alreadyAttempted={false}
          onAccept={() => {}}
        />
      );
      const root = screen.getByTestId("challenge-take-card-landing");
      const allText = root.textContent ?? "";
      expect(fpNumberRe.test(allText), `${trigger} landing leaked raw FP: ${allText}`).toBe(false);
      unmount();
    }
  });
});

describe("ChallengeTakeCardLanding — Phase 2d anchor-truth wiring (component → generator)", () => {
  it("anchor DELIVERED + other TANKED → take vindicates anchor", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: ["emb", "voo"],
          anchor: "emb",                   // anchor = Embiid
          heldOutcomes: { emb: 47, voo: 12 }, // emb 0.94 DELIVERED, voo 0.34 TANKED
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const take = screen.getByTestId("take-headline").textContent ?? "";
    expect(take).toMatch(/WASN'T THE PROBLEM|DID HIS PART|DON'T BLAME|SHOWED UP\. THE REST/i);
    expect(take.toUpperCase()).toContain("EMBIID");
  });

  it("anchor TANKED → take blames anchor", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: ["emb", "voo"],
          anchor: "emb",
          heldOutcomes: { emb: 18, voo: 24 }, // emb 0.36 TANKED, voo 0.69 MID
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const take = screen.getByTestId("take-headline").textContent ?? "";
    expect(take).toMatch(/COULDN'T SAVE|FORGOT TO SHOW|WAS THE ONE THAT MISSED|BLINKED/i);
    expect(take.toUpperCase()).toContain("EMBIID");
  });

  it("legacy (holdsRecorded:false) → take is GENERIC, no anchor name leak", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: null,
          holdsRecorded: false,
          anchor: "emb",
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const take = screen.getByTestId("take-headline").textContent ?? "";
    expect(take).toMatch(/WASTED|SHOULD NOT|WINNING SHAPE|STARS WERE/i);
    expect(take.toUpperCase()).not.toContain("EMBIID");
    expect(take.toUpperCase()).not.toContain("WASN'T THE PROBLEM");
    expect(take.toUpperCase()).not.toContain("COULDN'T SAVE");
  });
});

describe("ChallengeTakeCardLanding — Phase 2e culture-flavored take + supporting line + de-dup", () => {
  // The component wires lookupCulture(name, sport, tier, seed, basePlayerId,
  // team). The makeData synthetic basePlayerIds (emb/voo/etc.) won't hit
  // the basketball culture DB → lookupCulture returns null → generator
  // falls to 2d non-culture banks. Use a Kobe fixture with the REAL
  // basePlayerId "977" to exercise the culture-flavored path end-to-end.

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

  it("culture-rich anchor (Kobe, vindicated) → take uses a Kobe nickname (Mamba family)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeCultureRichData()}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const take = screen.getByTestId("take-headline").textContent ?? "";
    // Iconic nicknames from bryant_977: BLACK MAMBA, MAMBA, VINO, KB24,
    // MAMBA MENTALITY. The seeded pick lands on one of these.
    expect(take).toMatch(/BLACK MAMBA|MAMBA|VINO|KB24|MAMBA MENTALITY/);
    expect(take).not.toMatch(/\{nickname\}/);
    expect(take).not.toMatch(/\{anchorName\}/);
  });

  it("culture-rich anchor (Kobe, blamed) → take blames the Mamba family", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeCultureRichData({ kobe: 18, kidd: 25 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const take = screen.getByTestId("take-headline").textContent ?? "";
    expect(take).toMatch(/BLACK MAMBA|MAMBA|VINO|KB24|MAMBA MENTALITY/);
    expect(take).toMatch(/WENT QUIET|FORGOT TO SHOW|BLINKED|BUILT AROUND/);
  });

  it("culture-poor anchor (synthetic 'emb' basePlayerId) → falls to 2d 'EMBIID …' bank, no broken token", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: ["emb", "voo"],
          anchor: "emb",
          heldOutcomes: { emb: 47, voo: 12 },
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const take = screen.getByTestId("take-headline").textContent ?? "";
    expect(take.toUpperCase()).toContain("EMBIID");
    expect(take).not.toMatch(/\{nickname\}/);
    expect(take).not.toMatch(/\{anchorName\}/);
  });

  it("DE-DUP: stakes line never contains the held player NAMES (the 2d → 2e cut)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const evidence = screen.getByTestId("evidence-line").textContent ?? "";
    expect(evidence.toUpperCase()).not.toContain("EMBIID");
    expect(evidence.toUpperCase()).not.toContain("VUCEVIC");
    // The DENZEL'S LINE block still lists them — that's the one mention.
    const heldNames = screen.getAllByTestId("held-name").map(n => n.textContent);
    expect(heldNames).toContain("Embiid");
    expect(heldNames).toContain("Vucevic");
  });

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

  // Phase 2d single-mention rule: EXACTLY ONE sender mention per
  // landing. With held data → MIKE'S LINE block is the mention; without
  // held data (legacy) → bottom "from {sender}" line is the mention.
  // The two tests below pin both halves of the rule.

  it("HOLDS-RECORDED → sender mentioned EXACTLY ONCE (in MIKE'S LINE block, NOT in attribution)", () => {
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
    // Case-insensitive match counts both "Denzel" (anonymous-safe) and
    // "DENZEL" (uppercased line-owner label) as one mention each.
    const matches = (root.textContent ?? "").match(/Denzel/gi) ?? [];
    expect(matches.length, `holds-recorded sender mentioned ${matches.length} times — should be exactly 1`).toBe(1);
    // The single mention is the line-owner label, NOT a bottom "from X".
    expect(screen.getByTestId("line-owner").textContent).toBe("DENZEL'S LINE");
    const attribution = screen.queryByTestId("attribution");
    if (attribution) {
      expect(attribution.textContent ?? "", "attribution must NOT include 'from Denzel' when held block names sender").not.toMatch(/from\s+Denzel/i);
    }
  });

  it("LEGACY (holdsRecorded:false) → sender mentioned EXACTLY ONCE (in bottom 'from {sender}', not in line-owner)", () => {
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
    expect(matches.length, `legacy sender mentioned ${matches.length} times — should be exactly 1`).toBe(1);
    // The single mention is in the bottom attribution (legacy has no
    // MIKE'S LINE block).
    expect(screen.queryByTestId("line-owner")).toBeNull();
    expect(screen.getByTestId("attribution").textContent).toContain("from Denzel");
  });

  it("LEGACY + statsLine → both 'from {sender}' AND stats render, still exactly one sender mention", () => {
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
    const root = screen.getByTestId("challenge-take-card-landing");
    const matches = (root.textContent ?? "").match(/Denzel/gi) ?? [];
    expect(matches.length).toBe(1);
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

  it("HOLDS-RECORDED + null statsLine → attribution surface omitted (the held block IS the mention)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "Denzel" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("attribution")).toBeNull();
    expect(screen.getByTestId("line-owner").textContent).toBe("DENZEL'S LINE");
  });

  it("HOLDS-RECORDED + statsLine → attribution renders stats only, NEVER 'from {sender}'", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], challengerName: "Denzel" })}
        statsLine="3 attempts · 67% failed"
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const attribution = screen.getByTestId("attribution");
    expect(attribution.textContent).toBe("3 attempts · 67% failed");
    expect(attribution.textContent).not.toContain("from Denzel");
  });
});

describe("ChallengeTakeCardLanding — every trigger renders the full set of surfaces", () => {
  const cases = [
    { trigger: "choke",     extra: { heldPair: ["emb", "voo"] as [string, string] } },
    { trigger: "miss",      extra: { heldPair: ["bro", "cur"] as [string, string], nearMissGap: 4, nearMissNextTier: "ALL_STAR" } },
    { trigger: "big_score", extra: { heldPair: ["cur", "emb"] as [string, string] } },
    { trigger: "rare_pull", extra: { heldPair: ["cur", "emb"] as [string, string], topGameTier: "record" as const } },
    { trigger: "default",   extra: { heldPair: null, anchor: null } },
  ];

  for (const { trigger, extra } of cases) {
    it(`${trigger}: TAKE + USP + hand + evidence + dare + CTA all non-empty`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({ trigger, ...extra })}
          statsLine={null}
          alreadyAttempted={false}
          onAccept={() => {}}
        />
      );
      expect(screen.getByTestId("take-headline").textContent?.length).toBeGreaterThan(0);
      expect(screen.getByTestId("usp-subheadline").textContent).toBe("Same starting hand. Different decisions.");
      expect(screen.getAllByTestId(/^hand-card-(held|plain)$/).length).toBe(6);
      expect(screen.getByTestId("evidence-line").textContent?.length).toBeGreaterThan(0);
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

describe("ChallengeTakeCardLanding — Phase 2e conditional held-list block (cut when take names anchor)", () => {
  // The rule: showHeldList = heldCards.length > 0 && !takeCard.takeNamedAnchor
  // Block CUT when the take names the anchor (vindicated/blamed/culture).
  // Block KEPT when the take is generic (carries the only text-level
  // attribution of who was held).
  // Confirmed via the generic-no-culture 2×2 screenshot review.

  // Helper to access the Kobe culture-rich data builder defined above.
  function makeKoboFixture(heldOutcomes: Record<string, number>): ChallengeLandingData {
    return {
      challenge_id: "ch_kobe_block_rule",
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

  it("CULTURE-VINDICATED (Kobe DELIVERED, Kidd TANKED) → block CUT", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeKoboFixture({ kobe: 47, kidd: 12 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("held-list")).toBeNull();
    expect(screen.queryByTestId("line-owner")).toBeNull();
  });

  it("CULTURE-BLAMED (Kobe TANKED) → block CUT", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeKoboFixture({ kobe: 18, kidd: 25 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("held-list")).toBeNull();
  });

  it("NON-CULTURE VINDICATED (synthetic 'emb' DELIVERED, 'voo' TANKED) → block CUT", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: ["emb", "voo"],
          anchor: "emb",
          heldOutcomes: { emb: 47, voo: 12 },
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("held-list")).toBeNull();
  });

  it("NON-CULTURE BLAMED (synthetic 'emb' TANKED) → block CUT", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "choke",
          heldPair: ["emb", "voo"],
          anchor: "emb",
          heldOutcomes: { emb: 18, voo: 24 },
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("held-list")).toBeNull();
  });

  it("GENERIC choke (MID zone, no anchor split) → block KEPT (carries the only text-level naming)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("held-list")).toBeTruthy();
    expect(screen.getByTestId("line-owner").textContent).toBe("MIKE'S LINE");
    const heldNames = screen.getAllByTestId("held-name").map(n => n.textContent);
    expect(heldNames).toEqual(["Embiid", "Vucevic"]);
  });

  it("LEGACY (holdsRecorded:false) → block CUT (no holds to list)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: null, holdsRecorded: false, anchor: null })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("held-list")).toBeNull();
  });

  it("MISS → block KEPT (take names a tier, not a player → block carries name attribution)", () => {
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
    expect(screen.getByTestId("held-list")).toBeTruthy();
    const heldNames = screen.getAllByTestId("held-name").map(n => n.textContent);
    expect(heldNames).toEqual(["Brown", "Curry"]);
  });

  it("BIG_SCORE → block KEPT", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "big_score", heldPair: ["cur", "emb"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("held-list")).toBeTruthy();
  });

  it("RARE_PULL → block KEPT", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "rare_pull",
          heldPair: ["cur", "emb"],
          topGameTier: "record",
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("held-list")).toBeTruthy();
  });

  it("DEFAULT (no anchor) → block KEPT when holds present", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: ["bro", "hol"], anchor: null })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("held-list")).toBeTruthy();
  });

  // Sender-mention rule preserved through the conditional block:
  // when the block is cut on a vindicated/blamed case, the bottom
  // "from Mike" attribution does NOT re-instate (it only fires on
  // showHeldList:false WHEN namedChallenger). The 2d single-mention
  // rule said "block OR bottom" — but on a vindicated case the take
  // itself names the player. So the bottom attribution should NOT
  // re-fire here, since the held cards still carry the names visually.
  //
  // ACTUAL CURRENT BEHAVIOR per the landing code: showHeldList:false
  // + namedChallenger → bottom "from Mike" renders. That means on a
  // vindicated case (block cut), the bottom "from Mike" fires.
  // Document the behavior — if not desired, that's a follow-up.
  it("VINDICATED block-cut → bottom 'from Mike' RENDERS (showHeldList:false fallback fires)", () => {
    // Behavior pin — surfaces the trade-off so the rule's
    // sender-mention coverage is observable. The 2d single-mention
    // rule still holds: exactly ONE mention per landing. On vindicated
    // it's the bottom attribution; on generic it's the block.
    render(
      <ChallengeTakeCardLanding
        data={makeKoboFixture({ kobe: 47, kidd: 12 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const attribution = screen.queryByTestId("attribution");
    expect(attribution).not.toBeNull();
    expect(attribution!.textContent).toContain("from Mike");
    // Still exactly ONE sender mention overall.
    const root = screen.getByTestId("challenge-take-card-landing");
    const matches = (root.textContent ?? "").match(/Mike/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

// ── Phase 3.2 — authored_headline wiring on the TAKE ──────────────────────
// Lock: docs/challenge-landing-v2-phase3.2-wire-authored-headline-to-take-
// lock.md (commit ac4b032). The visible top headline on the accept page is
// the take-card's <h1 data-testid="take-headline">. Phase 3 wrote authored
// lines into share_headline, which the accept-page TAKE never read — so
// authored output silently bypassed the surface the lock was supposed to
// retire. Phase 3.2 splits the wire: authored_headline lands on its own
// column, and the TAKE renders it when present and falls back to the take
// card's TAKE field when null.

import { chadShareTrashTalkBank } from "../../commentary/chadChallenge";

describe("ChallengeTakeCardLanding — Phase 3.2 authored_headline wiring on the TAKE", () => {
  it("renders authored_headline as the TAKE when present (instead of takeCard.take)", () => {
    const authored = "Lakers' road trip stalls in Portland";
    render(
      <ChallengeTakeCardLanding
        data={{
          ...makeData({ trigger: "choke", heldPair: ["emb", "voo"] }),
          authored_headline: authored,
        }}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const h1 = screen.getByTestId("take-headline");
    // textContent compares against the source string (CSS uppercases at
    // render time only; the DOM string is the original casing).
    expect(h1.textContent).toContain(authored);
  });

  it("authored_headline=null → renders takeCard.take (today's behavior unchanged)", () => {
    render(
      <ChallengeTakeCardLanding
        data={{
          ...makeData({ trigger: "choke", heldPair: ["emb", "voo"] }),
          authored_headline: null,
        }}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const h1 = screen.getByTestId("take-headline");
    // The default Embiid+Vucevic fixture has mid-zone ratios → anchor-
    // truth = generic → take card picks from TAKES.choke. The exact line
    // is seed-dependent; what matters is it ISN'T the (absent) authored
    // line — i.e. text content is the take card's TAKE, not an authored
    // ESPN-register line. We assert the take card's TAKE banks contain
    // the rendered string.
    const text = (h1.textContent ?? "").toUpperCase();
    const choke = ["SOMEBODY WASTED THIS HAND", "THESE CARDS SHOULD NOT HAVE LOST",
                   "THIS HAND HAD A WINNING SHAPE", "THE STARS WERE THERE. THE SCORE WASN'T."];
    expect(choke.some(c => text.startsWith(c))).toBe(true);
  });

  it("authored_headline omitted (legacy row, pre-migration) → renders takeCard.take", () => {
    // Same as null but the field isn't in the payload at all — exercises
    // the optional-field-absent path.
    const data = makeData({ trigger: "choke", heldPair: ["emb", "voo"] });
    // No authored_headline key set on data; pass as-is.
    render(
      <ChallengeTakeCardLanding
        data={data}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const h1 = screen.getByTestId("take-headline");
    expect(h1.textContent).toBeTruthy();
    // No authored ESPN-register string accidentally rendered.
    expect(h1.textContent).not.toMatch(/road trip stalls/i);
  });

  it("badge / held-list / evidence-line / dare / CTA all unchanged when authored renders", () => {
    // Phase 3.2 lock: "No other take-card change." The h1 swap MUST NOT
    // disturb any other surface. Render with authored present and assert
    // every other test-id is still where it was.
    render(
      <ChallengeTakeCardLanding
        data={{
          ...makeData({ trigger: "choke", heldPair: ["emb", "voo"] }),
          authored_headline: "Lakers' road trip stalls in Portland",
        }}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("badge-row")).toBeTruthy();
    expect(screen.getByTestId("usp-subheadline")).toBeTruthy();
    expect(screen.getByTestId("starting-hand")).toBeTruthy();
    expect(screen.getByTestId("evidence-line")).toBeTruthy();
    expect(screen.getByTestId("dare-line")).toBeTruthy();
    expect(screen.getByTestId("accept-cta")).toBeTruthy();
  });

  it("RULE PROOF — every chadShareTrashTalk bank string never reaches the TAKE", () => {
    // The load-bearing Phase 3.2 invariant: a bank pick (which is what
    // share_headline degrades to on /api/headline failure) must NEVER be
    // rendered as the TAKE. The architectural guarantee is that the
    // client only writes authored values into authored_headline — bank
    // picks land in share_headline, which the TAKE doesn't read. This
    // test demonstrates the rule structurally: when authored_headline
    // is null (the only path a bank-pick scenario would take), the
    // rendered TAKE is from TAKES.choke / 2d / 2e banks, not from
    // SHARE_TT_CHOKE. Iterates the bank to prove none of those strings
    // ever appears in the TAKE.
    render(
      <ChallengeTakeCardLanding
        data={{
          ...makeData({ trigger: "choke", heldPair: ["emb", "voo"] }),
          authored_headline: null,
        }}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const takeText = (screen.getByTestId("take-headline").textContent ?? "").toUpperCase();
    const bank = chadShareTrashTalkBank("choke").map(s => s.toUpperCase());
    for (const bankString of bank) {
      expect(takeText).not.toContain(bankString);
    }
  });
});
