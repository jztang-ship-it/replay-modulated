// @vitest-environment jsdom
/**
 * shared/components/__tests__/H2HRevealScreen.test.tsx
 *
 * Phase 2 structural tests. Validates the static H2H reveal layout
 * mounts without runtime errors and surfaces the documented contract:
 *
 *   - both display names visible
 *   - both totalFp values visible (in zone header + right rail)
 *   - both hand strips render N renderCard calls each
 *   - battlefield renders the right slot pair (default + override)
 *   - SWAP indicator appears on non-held battlefield cards
 *   - final margin pill shows the absolute delta with leader hint
 *
 * Stubs renderCard so the test doesn't depend on basketball's
 * AthleteCard (which has heavy hooks + CSS injection). The H2H
 * component is sport-agnostic at this layer; the card renderer is
 * the seam between sport-agnostic structure and sport-specific
 * presentation.
 *
 * Phase 2 amendment (post-visual-smoke): hand strips switched from a
 * `repeat(N, 1fr)` grid to a height-capped flex row, and now invoke
 * the same renderCard prop the battlefield uses (matches the
 * LandingPage pattern where the single-player card component renders
 * at small sizes). Tests assert renderCall counts + data attributes
 * instead of grid-template-columns CSS.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { H2HRevealScreen, type H2HHand, type H2HCard, type CardRenderer } from "../H2HRevealScreen";

function makeCard(over: Partial<H2HCard> = {}): H2HCard {
  return {
    id: "p1", basePlayerId: "p1", personKey: "p1", cardId: `c-${Math.random()}`,
    name: "Player One", team: "ABC", season: "2425", position: "PG",
    photoCode: null, salary: 50, tier: "PURPLE", projectedFp: 30,
    slotIndex: 0, wasHeld: false, actualFp: 25, fpDelta: -5,
    gameInfo: { date: "2025-01-01", opponent: "XYZ" },
    statLine: { pts: 20 },
    achievements: [],
    ...over,
  };
}

function makeHand(overrides: Partial<H2HHand> = {}): H2HHand {
  const cards = overrides.cards ?? Array.from({ length: 6 }, (_, i) =>
    makeCard({ slotIndex: i, cardId: `c-${i}`, name: `Player ${i}`, basePlayerId: `p${i}` })
  );
  return {
    handId: "h-test",
    totalFp: cards.reduce((s, c) => s + c.actualFp, 0),
    tier: "ROOKIE",
    cards,
    displayName: "Someone",
    ...overrides,
  };
}

// Stub renderCard returns a minimal div per card. Counts both
// invocation calls (via vi.fn) and DOM markers so tests can
// disambiguate "rendered in hand strip" vs "rendered in battlefield"
// by walking up to the parent's data-* attribute.
function makeStub() {
  const fn = vi.fn<CardRenderer>((card: H2HCard) => (
    <div data-card-stub="true" data-card-id={card.cardId} data-was-held={String(card.wasHeld)}>
      {card.name} / fp={card.actualFp.toFixed(1)}
    </div>
  ));
  return fn;
}

describe("H2HRevealScreen — static layout", () => {
  it("renders both display names and total FPs (TeamScore only, zone header is name-only)", () => {
    const sender = makeHand({ displayName: "Mike", totalFp: 178.4 });
    const recipient = makeHand({ displayName: "You", totalFp: 182.4 });
    render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    // displayName is the sole content of the zone header (amendment 4
    // dropped the tier + totalFp duplicates that previously crowded
    // the header and made the player name visually secondary).
    expect(screen.getByText("Mike")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    // Each totalFp renders exactly once, in the TeamScore column
    // anchored to its battlefield card. Asserts the duplicate has been
    // removed (was previously in 2 places: zone header + rail).
    expect(screen.getAllByText("178.4").length).toBe(1);
    expect(screen.getAllByText("182.4").length).toBe(1);
  });

  it("invokes renderCard once per hand-strip cell + once per battlefield slot (= 2N + 2)", () => {
    const sender = makeHand();    // 6 cards default
    const recipient = makeHand();
    const renderCard = makeStub();
    render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={renderCard} />);
    // 6 hand-strip cards × 2 sides + 1 battlefield card × 2 sides = 14.
    expect(renderCard).toHaveBeenCalledTimes(14);
  });

  it("hand strip uses the same renderCard prop as the battlefield (no separate mini variant)", () => {
    const sender = makeHand();
    const recipient = makeHand();
    const renderCard = makeStub();
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={renderCard} />);
    // 2 hand strips × 6 cards each = 12 hand-strip cells.
    const stripCells = container.querySelectorAll('[data-h2h-mini-cell="true"]');
    expect(stripCells.length).toBe(12);
    // 2 battlefield cards.
    const battleCells = container.querySelectorAll('[data-h2h-battlefield-card="true"]');
    expect(battleCells.length).toBe(2);
    // Every cell contains a card-stub from the same renderCard.
    const stubs = container.querySelectorAll('[data-card-stub="true"]');
    expect(stubs.length).toBe(14);
  });

  it("hand strip is height-capped (does not balloon on wide viewports)", () => {
    // The whole point of the post-smoke fix: prior `repeat(N, 1fr)`
    // grid let each cell's width grow with the container, which forced
    // height up via aspect-ratio and made the strips dominate the
    // page. The new strip has an explicit height in the style attribute.
    const sender = makeHand();
    const recipient = makeHand();
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    const strips = container.querySelectorAll('[data-h2h-hand-strip="true"]');
    expect(strips.length).toBe(2);
    // Each strip's inline style includes a fixed height (px). The
    // exact value lives in HAND_STRIP_HEIGHT_PX; the assertion is on
    // the presence of an explicit px height, not the magic number.
    for (const strip of Array.from(strips)) {
      const style = (strip as HTMLElement).getAttribute("style") || "";
      expect(style).toMatch(/height:\s*\d+px/);
      // Should NOT have a repeat(N, 1fr) grid template — that was
      // the pre-fix shape that caused the inflation bug.
      expect(style).not.toMatch(/grid-template-columns:\s*repeat/);
    }
  });

  it("shows the SWAP pill on non-held battlefield card", () => {
    const sender = makeHand({
      cards: [
        makeCard({ slotIndex: 0, cardId: "c-held", wasHeld: true, name: "Held One" }),
        makeCard({ slotIndex: 1, cardId: "c-swap", wasHeld: false, name: "Swap One" }),
        ...Array.from({ length: 4 }, (_, i) => makeCard({ slotIndex: 2 + i, cardId: `c-${i}`, wasHeld: false, name: `Filler ${i}` })),
      ],
    });
    const recipient = makeHand();
    render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    // Battlefield default slot is the max slotIndex (5) which is a
    // non-held filler card → SWAP pill should appear.
    const swapPills = screen.queryAllByText("SWAP");
    expect(swapPills.length).toBeGreaterThan(0);
  });

  it("shows the final margin pill with correct sign + leader hint when you are ahead", () => {
    const sender = makeHand({ totalFp: 178.4, displayName: "Mike" });
    const recipient = makeHand({ totalFp: 182.4, displayName: "You" });
    render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    expect(screen.getByText("+4.0")).toBeTruthy();
    expect(screen.getByText("you")).toBeTruthy();
  });

  it("shows OPP leader hint when opponent is ahead", () => {
    const sender = makeHand({ totalFp: 200.0 });
    const recipient = makeHand({ totalFp: 180.0 });
    render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    expect(screen.getByText("+20.0")).toBeTruthy();
    expect(screen.getByText("opp")).toBeTruthy();
  });

  it("shows TIE state when scores are equal", () => {
    const sender = makeHand({ totalFp: 175.0 });
    const recipient = makeHand({ totalFp: 175.0 });
    render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    expect(screen.getByText("TIE")).toBeTruthy();
    expect(screen.getByText("even")).toBeTruthy();
  });

  it("defaults battlefield to the highest slotIndex (final reveal pair per design doc)", () => {
    const sender = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `s-${i}`, name: `Sender ${i}` })
      ),
    });
    const recipient = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `r-${i}`, name: `Recipient ${i}` })
      ),
    });
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    const battleCells = container.querySelectorAll('[data-h2h-battlefield-card="true"]');
    expect(battleCells.length).toBe(2);
    expect(battleCells[0].getAttribute("data-card-id")).toBe("s-5");
    expect(battleCells[1].getAttribute("data-card-id")).toBe("r-5");
  });

  it("respects battlefieldSlotIndex override", () => {
    const sender = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `s-${i}` })
      ),
    });
    const recipient = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `r-${i}` })
      ),
    });
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} battlefieldSlotIndex={2} />);
    const battleCells = container.querySelectorAll('[data-h2h-battlefield-card="true"]');
    expect(battleCells[0].getAttribute("data-card-id")).toBe("s-2");
    expect(battleCells[1].getAttribute("data-card-id")).toBe("r-2");
  });

  it("dims the hand-strip mini-cell whose slotIndex is currently in the battlefield (active slot)", () => {
    // Battlefield default = highest slotIndex (5 for a 6-card hand).
    // The matching mini-cell on each side should render with the
    // data-active-in-battlefield="true" marker; all other cells get
    // "false". Phase 3 (animation choreography) will drive this
    // dynamically as the reveal walks through matchups.
    const sender = makeHand();    // 6 cards default, slots 0-5
    const recipient = makeHand();
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    const activeCells = container.querySelectorAll('[data-h2h-mini-cell="true"][data-active-in-battlefield="true"]');
    const inactiveCells = container.querySelectorAll('[data-h2h-mini-cell="true"][data-active-in-battlefield="false"]');
    // One active per side = 2 total.
    expect(activeCells.length).toBe(2);
    // Remaining 5 per side = 10 total.
    expect(inactiveCells.length).toBe(10);
    // Active cells render with reduced opacity in their inline style.
    for (const cell of Array.from(activeCells)) {
      const style = (cell as HTMLElement).getAttribute("style") || "";
      expect(style).toMatch(/opacity:\s*0\.\d+/);
    }
  });

  it("dim follows the battlefieldSlotIndex prop (not hardcoded to last slot)", () => {
    const sender = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `s-${i}` })
      ),
    });
    const recipient = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `r-${i}` })
      ),
    });
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} battlefieldSlotIndex={2} />
    );
    // With battlefieldSlotIndex=2, slots 2 on each side are active.
    const active = container.querySelectorAll('[data-h2h-mini-cell="true"][data-active-in-battlefield="true"]');
    expect(active.length).toBe(2);
    expect(active[0].getAttribute("data-card-id")).toBe("s-2");
    expect(active[1].getAttribute("data-card-id")).toBe("r-2");
  });

  it("hand-strip cell count scales with N (sport-agnostic — N=11 football-shape sanity check)", () => {
    const sender = makeHand({
      cards: Array.from({ length: 11 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `s-${i}` })
      ),
    });
    const recipient = makeHand({
      cards: Array.from({ length: 11 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `r-${i}` })
      ),
    });
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    const stripCells = container.querySelectorAll('[data-h2h-mini-cell="true"]');
    expect(stripCells.length).toBe(22); // 11 × 2
  });
});
