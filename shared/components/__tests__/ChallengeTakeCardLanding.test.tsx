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
  challengerName?: string;
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
    actualFp: number,
  ) => ({
    id, basePlayerId: id, personKey: id, cardId: `${id}_c`,
    name, team, season: "2425", position: "F", photoCode: null,
    salary, tier, slotIndex, projectedFp,
    wasHeld: isHeld(id),
    actualFp: isHeld(id) ? actualFp : 0,
  });
  return {
    challenge_id: "ch_test_1",
    created_by: "u_creator",
    challenger_name: opts.challengerName ?? "Mike",
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
        card("emb", "Embiid",  "PHI", "RED",    80, 0, 50, 22.0),
        card("voo", "Vucevic", "ORL", "PURPLE", 65, 1, 35, 18.5),
        card("bro", "Brown",   "BOS", "PURPLE", 55, 2, 30, 28.0),
        card("cur", "Curry",   "GSW", "RED",    75, 3, 42, 58.5),
        card("bag", "Bagley",  "WAS", "BLUE",   35, 4, 18, 10.0),
        card("hol", "Holiday", "BOS", "GREEN",  25, 5, 14, 12.0),
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
  it("2 held → 2 prominent + 2 HOLD badges + labeled list 'Mike held: Embiid, Vucevic'", () => {
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
    const heldList = screen.getByTestId("held-list");
    expect(heldList.textContent).toContain("Mike held:");
    expect(heldList.textContent).toContain("Embiid");
    expect(heldList.textContent).toContain("Vucevic");
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

describe("ChallengeTakeCardLanding — hand TOTAL renders in both modes", () => {
  it("correction (choke) → evidence-line shows the total as stakes ('142.0 FP on the board')", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], targetScore: 142.0 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("evidence-line").textContent).toBe("142.0 FP on the board");
  });

  it("competition (big_score) → evidence-line shows the total as the wall (still unbeaten when attempts>0)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "big_score",
          heldPair: ["cur", "emb"],
          targetScore: 232.5,
          attemptCount: 3,
          winnerCount: 0,
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const line = screen.getByTestId("evidence-line").textContent ?? "";
    expect(line).toContain("232.5 FP");
    expect(line).toContain("still unbeaten");
  });

  it("neutral (default) → evidence-line shows the total with 'to beat' framing", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null, targetScore: 184.5 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("evidence-line").textContent).toBe("184.5 FP to beat");
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
