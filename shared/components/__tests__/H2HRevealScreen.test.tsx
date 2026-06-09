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
import { H2HRevealScreen, HAND_STRIP_HEIGHT_PX, type H2HHand, type H2HCard, type CardRenderer } from "../H2HRevealScreen";

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

  it("hand strip inline height equals exported HAND_STRIP_HEIGHT_PX (RD2 anchor gate)", () => {
    // RD2 (2026-06-08): the exported constant is the single source of
    // truth for both this surface and H2HRecipientPlay's mini-cells.
    // The height-capped test above stays height-agnostic on purpose
    // (it gates the SHAPE of the regression — explicit px height, no
    // repeat-grid). This test pins the strip to the exported value so
    // a silent constant drift surfaces here.
    const sender = makeHand();
    const recipient = makeHand();
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    const strips = container.querySelectorAll('[data-h2h-hand-strip="true"]');
    expect(strips.length).toBe(2);
    for (const strip of Array.from(strips)) {
      const style = (strip as HTMLElement).getAttribute("style") || "";
      const m = style.match(/height:\s*(\d+)px/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBe(HAND_STRIP_HEIGHT_PX);
    }
  });

  it("each hand strip renders exactly six mini-cells (basketball N=6)", () => {
    // RD2 dim-progress + "show which six cards are on each side"
    // depend on the per-strip cell count being exactly N. The
    // sport-agnostic N-scales test below covers football N=11; this
    // explicit basketball check guards against an off-by-one in the
    // strip's flex layout post-shrink.
    const sender = makeHand();
    const recipient = makeHand();
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    const senderStrip = container.querySelector('[data-h2h-hand-strip="true"][data-side="sender"]');
    const recipientStrip = container.querySelector('[data-h2h-hand-strip="true"][data-side="recipient"]');
    expect(senderStrip).not.toBeNull();
    expect(recipientStrip).not.toBeNull();
    expect(senderStrip!.querySelectorAll('[data-h2h-mini-cell="true"]').length).toBe(6);
    expect(recipientStrip!.querySelectorAll('[data-h2h-mini-cell="true"]').length).toBe(6);
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

  // Phase 4 fix 2 amend2 (2026-05-27): the final-margin pill (TIE /
  // EVEN / +N) was removed. The total margin is conveyed by the two
  // FP scores themselves; the per-matchup delta still renders.
  it("renders the per-matchup delta in the right rail (the +N matchup readout)", () => {
    const sender = makeHand({ totalFp: 178.4, displayName: "Mike" });
    const recipient = makeHand({ totalFp: 182.4, displayName: "You" });
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    const midRail = container.querySelector('[data-h2h-mid-rail="true"]');
    expect(midRail).toBeTruthy();
    expect(midRail?.textContent?.toLowerCase()).toMatch(/matchup/);
  });

  it("does NOT render the legacy final-margin pill text (TIE / EVEN / YOU / OPP)", () => {
    const sender = makeHand({ totalFp: 175.0 });
    const recipient = makeHand({ totalFp: 175.0 });
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    // None of the legacy pill labels should appear anywhere in the DOM.
    expect(screen.queryByText("TIE")).toBeNull();
    expect(screen.queryByText("even")).toBeNull();
    expect(screen.queryByText("you")).toBeNull();
    expect(screen.queryByText("opp")).toBeNull();
    expect(container.querySelector('[data-h2h-overlay-margin="true"]')).toBeNull();
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

  it("brightens the active mini-cell (in battlefield) and dims the inactive cells", () => {
    // Phase 4 amend5 fix 2 (2026-05-27): brightness invariant —
    // active mini-card is BRIGHT (opacity 1); the OTHER cards on
    // the same strip are DIMMED (opacity 0.35). User's eye is
    // drawn to the bright card. When no card is active on the
    // strip (none in battlefield), all cards are bright.
    const sender = makeHand();    // 6 cards default, slots 0-5
    const recipient = makeHand();
    const { container } = render(<H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />);
    const activeCells = container.querySelectorAll('[data-h2h-mini-cell="true"][data-active-in-battlefield="true"]');
    const inactiveCells = container.querySelectorAll('[data-h2h-mini-cell="true"][data-active-in-battlefield="false"]');
    expect(activeCells.length).toBe(2);
    expect(inactiveCells.length).toBe(10);
    // Active cells render their card content at full opacity (1).
    for (const cell of Array.from(activeCells)) {
      const cardLayer = cell.querySelector(":scope > div:not([data-h2h-mini-placeholder])") as HTMLElement | null;
      const style = cardLayer?.getAttribute("style") ?? "";
      expect(style).toMatch(/opacity:\s*1\b/);
    }
    // Inactive cells (on a strip that has an active card) render
    // at reduced opacity (0.35).
    for (const cell of Array.from(inactiveCells)) {
      const cardLayer = cell.querySelector(":scope > div:not([data-h2h-mini-placeholder])") as HTMLElement | null;
      const style = cardLayer?.getAttribute("style") ?? "";
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

  it("phase 3: reveal prop overrides battlefieldSlotIndex (activeMatchup wins)", () => {
    // Sender has 6 cards; reveal-order last (per (wasHeld, salary)) is
    // s-5 by default. If we hand it a synthetic `reveal` object naming
    // s-2 as activeMatchup.sender, the battlefield should render s-2,
    // not s-5.
    const sender = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `s-${i}`, actualFp: i * 10 })
      ),
    });
    const recipient = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `r-${i}`, actualFp: i * 12 })
      ),
    });
    const reveal = {
      phase: "revealing" as const,
      matchupIndex: 2,
      matchupCount: 6,
      visibleFpMap: new Map([["s-2", 0.001], ["r-2", 0.001]]),
      senderRunningTotal: 30,
      recipientRunningTotal: 36,
      activeMatchup: { sender: sender.cards[2], recipient: recipient.cards[2] },
      senderRevealOrder: sender.cards,
      recipientRevealOrder: recipient.cards,
      entranceStages: new Array(6).fill("settled" as const),
      entranceSettledCount: 6,
      pulseActive: false,
      play: () => {},
      skipToEnd: () => {},
    };
    const { container } = render(
      <H2HRevealScreen
        sender={sender}
        recipient={recipient}
        renderCard={makeStub()}
        reveal={reveal}
      />
    );
    const battleCells = container.querySelectorAll('[data-h2h-battlefield-card="true"]');
    expect(battleCells[0].getAttribute("data-card-id")).toBe("s-2");
    expect(battleCells[1].getAttribute("data-card-id")).toBe("r-2");
    // Active dim follows activeMatchup card id, not slotIndex.
    const active = container.querySelectorAll('[data-h2h-mini-cell="true"][data-active-in-battlefield="true"]');
    expect(active.length).toBe(2);
    expect(active[0].getAttribute("data-card-id")).toBe("s-2");
    expect(active[1].getAttribute("data-card-id")).toBe("r-2");
  });

  it("phase 3: TeamScore displays the running total (displayTotal), not the final total", () => {
    const sender = makeHand({ totalFp: 178.4 });
    const recipient = makeHand({ totalFp: 182.4 });
    const reveal = {
      phase: "revealing" as const,
      matchupIndex: 0,
      matchupCount: 6,
      visibleFpMap: new Map(),
      // Running totals mid-arc, BELOW the finals.
      senderRunningTotal: 42.3,
      recipientRunningTotal: 51.7,
      activeMatchup: { sender: sender.cards[0], recipient: recipient.cards[0] },
      senderRevealOrder: sender.cards,
      recipientRevealOrder: recipient.cards,
      entranceStages: new Array(6).fill("settled" as const),
      entranceSettledCount: 6,
      pulseActive: false,
      play: () => {},
      skipToEnd: () => {},
    };
    render(
      <H2HRevealScreen
        sender={sender}
        recipient={recipient}
        renderCard={makeStub()}
        reveal={reveal}
      />
    );
    // Running totals visible — finals are NOT (would conflict mid-arc).
    expect(screen.getByText("42.3")).toBeTruthy();
    expect(screen.getByText("51.7")).toBeTruthy();
    expect(screen.queryByText("178.4")).toBeNull();
    expect(screen.queryByText("182.4")).toBeNull();
  });

  it("phase 3: when reveal.activeMatchup is {null,null} (idle), battlefield is empty", () => {
    const sender = makeHand();
    const recipient = makeHand();
    const reveal = {
      phase: "idle" as const,
      matchupIndex: -1,
      matchupCount: 6,
      visibleFpMap: new Map(),
      senderRunningTotal: 0,
      recipientRunningTotal: 0,
      activeMatchup: { sender: null, recipient: null },
      senderRevealOrder: sender.cards,
      recipientRevealOrder: recipient.cards,
      entranceStages: new Array(6).fill("settled" as const),
      entranceSettledCount: 6,
      pulseActive: false,
      play: () => {},
      skipToEnd: () => {},
    };
    const { container } = render(
      <H2HRevealScreen
        sender={sender}
        recipient={recipient}
        renderCard={makeStub()}
        reveal={reveal}
      />
    );
    const battleCells = container.querySelectorAll('[data-h2h-battlefield-card="true"]');
    expect(battleCells.length).toBe(0);
    // No mini-cell should be active either (no card in battle).
    const active = container.querySelectorAll('[data-h2h-mini-cell="true"][data-active-in-battlefield="true"]');
    expect(active.length).toBe(0);
  });

  it("phase 3 entrance: both sides lay leftmost-first by reveal order", () => {
    // Phase 3.9 update: both strips now lay in the SAME direction
    // (cheapest first by reveal order, mapped by cardId). For the
    // mock fixture's slotIndex-ordered revealOrder, stage_index N
    // corresponds to displayPos N on BOTH strips. So with stages
    // = ["settled","settled","settled","travel","pre","pre"]:
    //   recipient (bottom): displayPos 0/1/2 settled, 3 traveling, 4/5 pre.
    //   sender (top):       displayPos 0/1/2 settled, 3 traveling, 4/5 pre.
    // Both sides' card 1 (cheapest) settles together, etc.
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
    const reveal = {
      phase: "entering" as const,
      matchupIndex: -1,
      matchupCount: 6,
      visibleFpMap: new Map(),
      senderRunningTotal: 0,
      recipientRunningTotal: 0,
      activeMatchup: { sender: null, recipient: null },
      senderRevealOrder: sender.cards,
      recipientRevealOrder: recipient.cards,
      entranceStages: ["settled", "settled", "settled", "travel", "pre", "pre"] as import("../useH2HReveal").EntranceStage[],
      entranceSettledCount: 3,
      pulseActive: false,
      play: () => {},
      skipToEnd: () => {},
    };
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal} />
    );
    // Recipient strip — displayPos = stage_index.
    const recipientStrip = container.querySelector('[data-h2h-hand-strip="true"][data-side="recipient"]');
    const recipientCells = recipientStrip?.querySelectorAll('[data-h2h-mini-cell="true"]') ?? [];
    expect(recipientCells.length).toBe(6);
    expect(recipientCells[0].getAttribute("data-h2h-cell-stage")).toBe("settled");
    expect(recipientCells[2].getAttribute("data-h2h-cell-stage")).toBe("settled");
    expect(recipientCells[3].getAttribute("data-h2h-cell-stage")).toBe("travel");
    expect(recipientCells[5].getAttribute("data-h2h-cell-stage")).toBe("pre");
    // Sender strip — displayPos = stage_index (same direction as recipient).
    const senderStrip = container.querySelector('[data-h2h-hand-strip="true"][data-side="sender"]');
    const senderCells = senderStrip?.querySelectorAll('[data-h2h-mini-cell="true"]') ?? [];
    expect(senderCells.length).toBe(6);
    expect(senderCells[0].getAttribute("data-h2h-cell-stage")).toBe("settled");
    expect(senderCells[2].getAttribute("data-h2h-cell-stage")).toBe("settled");
    expect(senderCells[3].getAttribute("data-h2h-cell-stage")).toBe("travel");
    expect(senderCells[5].getAttribute("data-h2h-cell-stage")).toBe("pre");
    // Battlefield is empty during entering phase.
    const battleCells = container.querySelectorAll('[data-h2h-battlefield-card="true"]');
    expect(battleCells.length).toBe(0);
  });

  it("phase 3 entrance: placeholder slots are visible before cards land, hidden after", () => {
    // Mid-entrance synthetic state: only the first 2 cards have landed
    // on each side. The remaining 4 cells should expose their dim
    // placeholder layer (data-h2h-mini-placeholder="true" with non-zero
    // opacity) so the user sees "empty slots waiting for cards" rather
    // than "cards appearing in the middle of the screen."
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
    const reveal = {
      phase: "entering" as const,
      matchupIndex: -1,
      matchupCount: 6,
      visibleFpMap: new Map(),
      senderRunningTotal: 0,
      recipientRunningTotal: 0,
      activeMatchup: { sender: null, recipient: null },
      senderRevealOrder: sender.cards,
      recipientRevealOrder: recipient.cards,
      entranceStages: ["settled", "settled", "pre", "pre", "pre", "pre"] as import("../useH2HReveal").EntranceStage[],
      entranceSettledCount: 2,
      pulseActive: false,
      play: () => {},
      skipToEnd: () => {},
    };
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal} />
    );
    // Every cell renders a placeholder div.
    const placeholders = container.querySelectorAll('[data-h2h-mini-placeholder="true"]');
    expect(placeholders.length).toBe(12);
    // Cells in "settled" stage: placeholder opacity 0 (hidden);
    // cells in pre/lay/beat/travel: placeholder opacity 1 (visible).
    const cells = container.querySelectorAll('[data-h2h-mini-cell="true"]');
    let visibleCount = 0;
    let hiddenCount = 0;
    for (const cell of Array.from(cells)) {
      const stage = cell.getAttribute("data-h2h-cell-stage");
      const placeholder = cell.querySelector('[data-h2h-mini-placeholder="true"]') as HTMLElement | null;
      const style = placeholder?.getAttribute("style") ?? "";
      if (stage === "settled") {
        expect(style).toMatch(/opacity:\s*0\b/);
        hiddenCount++;
      } else {
        expect(style).toMatch(/opacity:\s*1\b/);
        visibleCount++;
      }
    }
    // 2 settled on each side = 4 hidden placeholders; rest = 8 visible.
    expect(hiddenCount).toBe(4);
    expect(visibleCount).toBe(8);
  });

  it("phase 3 anticipation pulse: pulseActive=true applies tier-colored pulse animation to all cells", () => {
    const sender = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `s-${i}`, tier: i === 0 ? "GREEN" : i === 5 ? "RED" : "PURPLE" })
      ),
    });
    const recipient = makeHand({
      cards: Array.from({ length: 6 }, (_, i) =>
        makeCard({ slotIndex: i, cardId: `r-${i}`, tier: i === 0 ? "GREEN" : i === 5 ? "RED" : "PURPLE" })
      ),
    });
    const reveal = {
      phase: "anticipating" as const,
      matchupIndex: -1,
      matchupCount: 6,
      visibleFpMap: new Map(),
      senderRunningTotal: 0,
      recipientRunningTotal: 0,
      activeMatchup: { sender: null, recipient: null },
      senderRevealOrder: sender.cards,
      recipientRevealOrder: recipient.cards,
      entranceStages: new Array(6).fill("settled" as const) as import("../useH2HReveal").EntranceStage[],
      entranceSettledCount: 6,
      pulseActive: true,
      play: () => {},
      skipToEnd: () => {},
    };
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal} />
    );
    const cells = container.querySelectorAll('[data-h2h-mini-cell="true"]');
    expect(cells.length).toBe(12);
    // All 12 cells should have data-h2h-pulse="true" + an animation
    // applied via inline style.
    for (const cell of Array.from(cells)) {
      expect(cell.getAttribute("data-h2h-pulse")).toBe("true");
      const style = (cell as HTMLElement).getAttribute("style") ?? "";
      expect(style).toMatch(/animation:\s*h2h-card-pulse/);
      // Tier color is piped via --h2h-pulse-color CSS variable.
      expect(style).toMatch(/--h2h-pulse-color/);
    }
  });

  it("phase 3 anticipation pulse: pulseActive=false does NOT apply pulse animation", () => {
    const sender = makeHand();
    const recipient = makeHand();
    const reveal = {
      phase: "anticipating" as const,
      matchupIndex: -1,
      matchupCount: 6,
      visibleFpMap: new Map(),
      senderRunningTotal: 0,
      recipientRunningTotal: 0,
      activeMatchup: { sender: null, recipient: null },
      senderRevealOrder: sender.cards,
      recipientRevealOrder: recipient.cards,
      entranceStages: new Array(6).fill("settled" as const) as import("../useH2HReveal").EntranceStage[],
      entranceSettledCount: 6,
      pulseActive: false,
      play: () => {},
      skipToEnd: () => {},
    };
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal} />
    );
    const cells = container.querySelectorAll('[data-h2h-mini-cell="true"]');
    for (const cell of Array.from(cells)) {
      expect(cell.getAttribute("data-h2h-pulse")).toBe("false");
      const style = (cell as HTMLElement).getAttribute("style") ?? "";
      expect(style).toMatch(/animation:\s*none/);
    }
  });

  it("phase 3 entrance: when reveal omits entranceStages (static), all cells render settled", () => {
    // Static phase 2 path: no reveal prop → HandStrip's entranceStages
    // is undefined → all cells treated as "settled".
    const sender = makeHand();
    const recipient = makeHand();
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} />
    );
    const cells = container.querySelectorAll('[data-h2h-mini-cell="true"]');
    expect(cells.length).toBe(12);
    for (const cell of Array.from(cells)) {
      expect(cell.getAttribute("data-h2h-cell-stage")).toBe("settled");
    }
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

  // #4 contract lock (2026-05-30, INVERTS amend1's spatial assertion):
  // HandStrip LAYOUT is `slotIndex`-only on every strip — even when a
  // `revealOrder` is provided. `revealOrder` is the TEMPORAL contract
  // (consumed by buildMatchups / activeMatchup / revealedCardIds /
  // stageIndexByCardId for entrance), never the spatial one. See
  // docs/h2h-reveal-arc-design.md "Locked invariant — strip-component
  // sort contract" EDIT 2026-05-30 (axis split).
  //
  // Held cards stay in their slotIndex positions S1 → S4 (the S5
  // invariant); the prior amend1 collapse dragged held cells to the
  // rightmost slots and broke S5. This test fixture intentionally
  // misaligns slotIndex against revealOrder so a regression back to
  // spatial revealOrder fails loudly.
  it("HandStrip displays cards in slotIndex order regardless of revealOrder", () => {
    const senderCards: H2HCard[] = [
      makeCard({ cardId: "card-A", name: "A held $57", basePlayerId: "pA", wasHeld: true,  salary: 57, slotIndex: 0 }),
      makeCard({ cardId: "card-B", name: "B swap $29", basePlayerId: "pB", wasHeld: false, salary: 29, slotIndex: 5 }),
      makeCard({ cardId: "card-C", name: "C swap $34", basePlayerId: "pC", wasHeld: false, salary: 34, slotIndex: 1 }),
      makeCard({ cardId: "card-D", name: "D swap $52", basePlayerId: "pD", wasHeld: false, salary: 52, slotIndex: 2 }),
      makeCard({ cardId: "card-E", name: "E held $40", basePlayerId: "pE", wasHeld: true,  salary: 40, slotIndex: 3 }),
      makeCard({ cardId: "card-F", name: "F swap $37", basePlayerId: "pF", wasHeld: false, salary: 37, slotIndex: 4 }),
    ];
    const sender = makeHand({ cards: senderCards });
    const recipient = makeHand();
    // revealOrder follows the canonical (wasHeld ASC, salary ASC) rule.
    // Held cards (A, E) are last in TIME, but their SPATIAL position is
    // still their slotIndex (A at slot 0 = leftmost; E at slot 3).
    const revealOrder = [
      senderCards[1], senderCards[2], senderCards[5], senderCards[3], senderCards[4], senderCards[0],
    ];
    const reveal = {
      phase: "done" as const,
      matchupIndex: 5,
      matchupCount: 6,
      visibleFpMap: new Map(),
      senderRunningTotal: 0,
      recipientRunningTotal: 0,
      activeMatchup: { sender: null, recipient: null },
      senderRevealOrder: revealOrder,
      recipientRevealOrder: recipient.cards,
      entranceStages: new Array(6).fill("settled") as import("../useH2HReveal").EntranceStage[],
      entranceSettledCount: 6,
      pulseActive: false,
      play: () => {},
      skipToEnd: () => {},
    };
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal as any} />
    );
    const senderStrip = container.querySelector('[data-h2h-hand-strip="true"][data-side="sender"]');
    const senderCells = senderStrip?.querySelectorAll('[data-h2h-mini-cell="true"]') ?? [];
    expect(senderCells.length).toBe(6);
    // slotIndex order: A (0), C (1), D (2), E (3), F (4), B (5).
    expect(senderCells[0].getAttribute("data-card-id")).toBe("card-A"); // slot 0 — held stays leftmost
    expect(senderCells[1].getAttribute("data-card-id")).toBe("card-C"); // slot 1
    expect(senderCells[2].getAttribute("data-card-id")).toBe("card-D"); // slot 2
    expect(senderCells[3].getAttribute("data-card-id")).toBe("card-E"); // slot 3 — held stays mid-strip
    expect(senderCells[4].getAttribute("data-card-id")).toBe("card-F"); // slot 4
    expect(senderCells[5].getAttribute("data-card-id")).toBe("card-B"); // slot 5
  });
});

describe("H2HRevealScreen — Phase 3 anchor-moment frame", () => {
  // The anchor frame is gated by THREE conditions that must all hold:
  //   1. phase === "paused"
  //   2. matchupIndex === matchupCount - 2 (the second-to-last set
  //      just resolved; the next set is the final).
  //   3. isFinalSetDecisive returns decisive: true on the running
  //      totals + final pair's actualFp.
  //
  // These tests construct a reveal mock at exactly that boundary with
  // controlled running totals + final-pair actualFp so the helper's
  // decisiveness can be deliberately alive or sealed.

  /** Build a 6-set reveal mock at the penultimate paused boundary.
   *  Caller controls the entering running totals + final pair's
   *  actualFp; intermediate sets' actualFp values don't matter for the
   *  frame's gate (only the FINAL pair feeds the decisiveness math). */
  function buildPenultimatePaused(args: {
    senderRunningTotal: number;
    recipientRunningTotal: number;
    finalSenderActualFp: number;
    finalRecipientActualFp: number;
    finalRecipientName?: string;
  }) {
    const senderCards = Array.from({ length: 6 }, (_, i) =>
      makeCard({
        slotIndex: i,
        cardId: `s-${i}`,
        name: `Sender Player ${i}`,
        actualFp: i === 5 ? args.finalSenderActualFp : 10,
      })
    );
    const recipientCards = Array.from({ length: 6 }, (_, i) =>
      makeCard({
        slotIndex: i,
        cardId: `r-${i}`,
        name: i === 5 ? (args.finalRecipientName ?? "Bruce Brown") : `Recipient Player ${i}`,
        actualFp: i === 5 ? args.finalRecipientActualFp : 10,
      })
    );
    const sender = makeHand({ cards: senderCards });
    const recipient = makeHand({ cards: recipientCards });
    // The reveal-order is what the hook publishes (post buildRevealOrder).
    // For these tests it's fine to use the raw cards (all unheld, same
    // salary → ordering doesn't matter; what matters is that index 5
    // is the FINAL pair).
    const reveal = {
      phase: "paused" as const,
      matchupIndex: 4, // matchupCount - 2 = 4 (the set N-2 just resolved)
      matchupCount: 6,
      visibleFpMap: new Map(),
      senderRunningTotal: args.senderRunningTotal,
      recipientRunningTotal: args.recipientRunningTotal,
      deltaRunning: 0,
      activeMatchup: { sender: senderCards[4], recipient: recipientCards[4] },
      senderRevealOrder: senderCards,
      recipientRevealOrder: recipientCards,
      entranceStages: new Array(6).fill("settled" as const),
      entranceSettledCount: 6,
      pulseActive: false,
      senderShakeInfo: null,
      recipientShakeInfo: null,
      senderGlowState: null,
      recipientGlowState: null,
      revealedCardIds: new Set<string>(),
      play: () => {},
      skipToEnd: () => {},
    };
    return { sender, recipient, reveal };
  }

  it("MOUNTS when game is still alive (trailing but catchable) — pre-fix-fail expected", () => {
    // Recipient trailing by 10; final swing +15 → recipient overtakes.
    const { sender, recipient, reveal } = buildPenultimatePaused({
      senderRunningTotal: 100,
      recipientRunningTotal: 90,
      finalSenderActualFp: 5,
      finalRecipientActualFp: 20,
      finalRecipientName: "Bruce Brown",
    });
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal as any} />
    );
    const anchor = container.querySelector("[data-h2h-anchor-frame]");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("data-h2h-anchor-framing")).toBe("overtake");
    const name = container.querySelector("[data-h2h-anchor-name]")?.textContent;
    expect(name).toContain("Bruce Brown");
    const stat = container.querySelector("[data-h2h-anchor-stat-line]")?.textContent;
    expect(stat).toContain("Need");
    expect(stat).toContain("10.0");
  });

  it("MOUNTS in 'hold' framing when leading but vulnerable", () => {
    // Recipient leading by 5; final swing -20 → recipient loses lead.
    const { sender, recipient, reveal } = buildPenultimatePaused({
      senderRunningTotal: 100,
      recipientRunningTotal: 105,
      finalSenderActualFp: 25,
      finalRecipientActualFp: 5,
    });
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal as any} />
    );
    const anchor = container.querySelector("[data-h2h-anchor-frame]");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("data-h2h-anchor-framing")).toBe("hold");
    expect(container.querySelector("[data-h2h-anchor-stat-line]")?.textContent).toContain("Hold");
  });

  it("MOUNTS in 'tie' framing when entering tied", () => {
    const { sender, recipient, reveal } = buildPenultimatePaused({
      senderRunningTotal: 100,
      recipientRunningTotal: 100,
      finalSenderActualFp: 15,
      finalRecipientActualFp: 20,
    });
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal as any} />
    );
    const anchor = container.querySelector("[data-h2h-anchor-frame]");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("data-h2h-anchor-framing")).toBe("tie");
    expect(container.querySelector("[data-h2h-anchor-stat-line]")?.textContent).toContain("TIED");
  });

  it("SUPPRESSED on a sealed/blowout game — trailing beyond reach", () => {
    // Recipient down by 50; final swing only +10 → still loses.
    const { sender, recipient, reveal } = buildPenultimatePaused({
      senderRunningTotal: 150,
      recipientRunningTotal: 100,
      finalSenderActualFp: 5,
      finalRecipientActualFp: 15,
    });
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal as any} />
    );
    expect(container.querySelector("[data-h2h-anchor-frame]")).toBeNull();
  });

  it("SUPPRESSED on a sealed/blowout game — leading insurmountably", () => {
    const { sender, recipient, reveal } = buildPenultimatePaused({
      senderRunningTotal: 100,
      recipientRunningTotal: 150,
      finalSenderActualFp: 30,
      finalRecipientActualFp: 5,
    });
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={reveal as any} />
    );
    expect(container.querySelector("[data-h2h-anchor-frame]")).toBeNull();
  });

  it("SUPPRESSED on non-penultimate paused (gate's matchupIndex check)", () => {
    // Even on an alive game state, mounting at matchupIndex=2 (NOT
    // matchupCount-2=4) should not show the anchor.
    const { sender, recipient, reveal } = buildPenultimatePaused({
      senderRunningTotal: 100,
      recipientRunningTotal: 90,
      finalSenderActualFp: 5,
      finalRecipientActualFp: 20,
    });
    const altered = { ...reveal, matchupIndex: 2 };
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={altered as any} />
    );
    expect(container.querySelector("[data-h2h-anchor-frame]")).toBeNull();
  });

  it("SUPPRESSED outside paused phase (gate's phase check)", () => {
    // Same alive state but phase still "revealing" → frame doesn't mount.
    const { sender, recipient, reveal } = buildPenultimatePaused({
      senderRunningTotal: 100,
      recipientRunningTotal: 90,
      finalSenderActualFp: 5,
      finalRecipientActualFp: 20,
    });
    const altered = { ...reveal, phase: "revealing" as const };
    const { container } = render(
      <H2HRevealScreen sender={sender} recipient={recipient} renderCard={makeStub()} reveal={altered as any} />
    );
    expect(container.querySelector("[data-h2h-anchor-frame]")).toBeNull();
  });
});
