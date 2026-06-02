// @vitest-environment jsdom
//
// shared/components/__tests__/ChallengeTakeCardLanding.test.tsx
//
// Phase 2b — landing-component gates. Lock:
// docs/challenge-landing-v2-phase2b-landing-component-lock.md.
// Pins the locked product decisions:
//   - The hook PRECEDES the score in DOM order (the anti-regression
//     guard for the score-first → V2 hierarchy flip — gate 3).
//   - Held cards render prominent + an inline actualFp chip; discards
//     render plain with NO outcome number.
//   - holdsRecorded:false → 6 plain cards, no chips, no crash.
//   - All 5 triggers render hook + hand + outcome + disagreement + CTA.
//   - The CTA wires to onAccept.

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

describe("ChallengeTakeCardLanding — V2 hierarchy gates", () => {
  it("hook PRECEDES the score in DOM order (the score-first anti-regression guard)", () => {
    const { container } = render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"], targetScore: 142.5 })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const root = container.querySelector("[data-testid='challenge-take-card-landing']")!;
    const text = root.textContent ?? "";
    const hook = screen.getByTestId("hook-headline").textContent ?? "";
    expect(hook.length).toBeGreaterThan(0);
    const hookIndex = text.indexOf(hook);
    const scoreIndex = text.indexOf("142.5");
    // The score may also appear inside the outcome line — the guard is
    // that the hook appears FIRST in the rendered text. If we ever flip
    // back to "giant 68px FP at top," this assertion catches it.
    expect(hookIndex, "hook not found in rendered text").toBeGreaterThan(-1);
    expect(scoreIndex, "score (target_score) not found in rendered text").toBeGreaterThan(-1);
    expect(hookIndex).toBeLessThan(scoreIndex);
  });

  it("score is NOT the first rendered element (anti-regression for the V2 hierarchy)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    // The hook test-id must precede the outcome row in DOM order.
    const root = screen.getByTestId("challenge-take-card-landing");
    const children = Array.from(root.children);
    const hookIdx = children.findIndex(el => el.querySelector("[data-testid='hook-headline']") || el.getAttribute("data-testid") === "hook-headline");
    const outcomeIdx = children.findIndex(el => el.querySelector("[data-testid='outcome-row']") || el.getAttribute("data-testid") === "outcome-row");
    expect(hookIdx).toBeGreaterThanOrEqual(0);
    expect(outcomeIdx).toBeGreaterThanOrEqual(0);
    expect(hookIdx).toBeLessThan(outcomeIdx);
  });
});

describe("ChallengeTakeCardLanding — held-card prominence + chip", () => {
  it("2 held cards render prominent with actualFp chips; 4 plain cards render without chips", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const heldCards = screen.getAllByTestId("hand-card-held");
    const plainCards = screen.getAllByTestId("hand-card-plain");
    expect(heldCards).toHaveLength(2);
    expect(plainCards).toHaveLength(4);
    const chips = screen.getAllByTestId("held-actualfp-chip");
    expect(chips).toHaveLength(2);
    // Chips render rounded actualFp — 22.0 → "22"; 18.5 → "19".
    const chipNumbers = chips.map(c => Number(c.textContent));
    expect(chipNumbers).toContain(22);
    expect(chipNumbers).toContain(19);
  });

  it("NEVER renders '0' on a plain (discarded) card — discard outcome is suppressed", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const plainCards = screen.getAllByTestId("hand-card-plain");
    for (const card of plainCards) {
      // The salary text "$X" is the only numeric in a discard card.
      // A bare "0" outside a salary chip would be the regression we're
      // pinning against — chip is rendered ONLY on held cards.
      expect(card.querySelector("[data-testid='held-actualfp-chip']")).toBeNull();
    }
  });

  it("holdsRecorded:false → 6 plain cards, no chips, no crash (graceful degrade)", () => {
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
    expect(screen.queryAllByTestId("held-actualfp-chip")).toHaveLength(0);
    // Hook + disagreement still render (the generator's no-anchor route
    // takes over) — no half-filled tokens leak.
    expect(screen.getByTestId("hook-headline").textContent?.length).toBeGreaterThan(0);
    expect(screen.getByTestId("disagreement-line").textContent?.length).toBeGreaterThan(0);
    expect(screen.getByTestId("disagreement-line").textContent ?? "").not.toMatch(/\{\w+\}/);
  });
});

describe("ChallengeTakeCardLanding — every trigger renders hook + hand + outcome + disagreement + CTA", () => {
  const cases = [
    { trigger: "choke",     extra: { heldPair: ["emb", "voo"] as [string, string] } },
    { trigger: "miss",      extra: { heldPair: ["bro", "cur"] as [string, string], nearMissGap: 7, nearMissNextTier: "ALL_STAR" } },
    { trigger: "big_score", extra: { heldPair: ["cur", "emb"] as [string, string] } },
    { trigger: "rare_pull", extra: { heldPair: ["cur", "emb"] as [string, string], topGameTier: "record" as const } },
    { trigger: "default",   extra: { heldPair: null, anchor: null } },
  ];

  for (const { trigger, extra } of cases) {
    it(`${trigger}: renders all five required surfaces`, () => {
      render(
        <ChallengeTakeCardLanding
          data={makeData({ trigger, ...extra })}
          statsLine={null}
          alreadyAttempted={false}
          onAccept={() => {}}
        />
      );
      expect(screen.getByTestId("hook-headline").textContent?.length).toBeGreaterThan(0);
      expect(screen.getAllByTestId(/^hand-card-(held|plain)$/).length).toBe(6);
      expect(screen.getByTestId("outcome-row")).toBeTruthy();
      expect(screen.getByTestId("outcome-line").textContent?.length).toBeGreaterThan(0);
      expect(screen.getByTestId("disagreement-line").textContent?.length).toBeGreaterThan(0);
      expect(screen.getByTestId("accept-cta").textContent?.length).toBeGreaterThan(0);
    });
  }

  it("choke renders the TeamStamp 'CHOKE'", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    const stampWrap = screen.getByTestId("team-stamp");
    expect(stampWrap.textContent).toBe("CHOKE");
    // No pill alongside the TeamStamp.
    expect(screen.queryByTestId("trigger-pill")).toBeNull();
  });

  it("miss renders the TeamStamp '{tier} MISS' using near_miss_next_tier", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({
          trigger: "miss",
          heldPair: ["bro", "cur"],
          nearMissGap: 7,
          nearMissNextTier: "ALL_STAR",
        })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("team-stamp").textContent).toBe("ALL STAR MISS");
    expect(screen.queryByTestId("trigger-pill")).toBeNull();
  });

  it("big_score renders the BIG SCORE pill (no TeamStamp)", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "big_score", heldPair: ["cur", "emb"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("team-stamp")).toBeNull();
    expect(screen.getByTestId("trigger-pill").textContent).toBe("BIG SCORE");
  });

  it("rare_pull renders the top_game_tier-derived pill (RECORD / CAREER HIGH / SEASON HIGH)", () => {
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
    expect(screen.getByTestId("trigger-pill").textContent).toBe("NEW RECORD");
  });

  it("default renders NO stamp and NO pill", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "default", heldPair: null, anchor: null })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId("team-stamp")).toBeNull();
    expect(screen.queryByTestId("trigger-pill")).toBeNull();
  });
});

describe("ChallengeTakeCardLanding — legacy alias routes 'bad_beat' → choke surfaces", () => {
  it("stored trigger_type='bad_beat' renders the CHOKE stamp via normalizeTriggerType", () => {
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "bad_beat" })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId("team-stamp").textContent).toBe("CHOKE");
  });
});

describe("ChallengeTakeCardLanding — CTA wires to onAccept", () => {
  it("clicking the CTA fires onAccept exactly once", () => {
    const handle = vi.fn();
    render(
      <ChallengeTakeCardLanding
        data={makeData({ trigger: "choke", heldPair: ["emb", "voo"] })}
        statsLine={null}
        alreadyAttempted={false}
        onAccept={handle}
      />
    );
    const cta = screen.getByTestId("accept-cta");
    fireEvent.click(cta);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("alreadyAttempted=true relabels CTA to 'Play Again' (never blocks)", () => {
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
