// @vitest-environment jsdom
/**
 * shared/components/__tests__/H2HResultsOverlay.test.tsx
 *
 * Phase 4 tests for the results overlay. The overlay uses the H2H
 * layout as its frame (top strip / hero zone / bottom strip + L/R
 * rails), with the headline + trash-talk in the left rail and tap-
 * to-flip landing at the matching hero position.
 *
 * Phase 4 fix 3 (2026-05-27) — restructured for per-strip flip:
 *   - Each strip has its OWN selection. Both can be filled at the
 *     same time for 1v1 comparison.
 *   - Right rail holds just two FP totals (no delta pill).
 *   - Single primary CTA below the bottom strip; Dismiss CTA removed
 *     (× close button is the only dismiss path).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { H2HResultsOverlay } from "../H2HResultsOverlay";
import type { H2HHand, H2HCard, CardRenderer } from "../H2HRevealScreen";

function makeCard(over: Partial<H2HCard> = {}): H2HCard {
  return {
    id: "p1", basePlayerId: "p1", personKey: "p1", cardId: `c-${Math.random()}`,
    name: "Player", team: "ABC", season: "2425", position: "PG",
    photoCode: null, salary: 50, tier: "PURPLE", projectedFp: 30,
    slotIndex: 0, wasHeld: false, actualFp: 25, fpDelta: -5,
    gameInfo: { date: "2025-01-01", opponent: "XYZ" },
    statLine: { pts: 20 },
    achievements: [],
    ...over,
  };
}

function makeHand(displayName: string, totalFp: number, overrides: Partial<H2HHand> = {}): H2HHand {
  const cards = overrides.cards ?? Array.from({ length: 6 }, (_, i) =>
    makeCard({ slotIndex: i, cardId: `${displayName}-${i}`, name: `${displayName} ${i}` })
  );
  return {
    handId: `h-${displayName}`,
    totalFp,
    tier: "ROOKIE",
    cards,
    displayName,
    ...overrides,
  };
}

function stubRender(): CardRenderer {
  return vi.fn<CardRenderer>((card: H2HCard, options) => (
    <div
      data-card-stub="true"
      data-card-id={card.cardId}
      data-card-flipped-arg={options?.flipped ? "true" : "false"}
    >
      {card.name}
    </div>
  ));
}

describe("H2HResultsOverlay — state machine + CTAs", () => {
  it("WIN variant → 'Send It Back' primary CTA", () => {
    render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    expect(screen.getByRole("button", { name: "Send It Back" })).toBeTruthy();
  });

  it("LOSS_OPEN variant → 'Try Again' + countdown pill", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 182.4)}
        recipient={makeHand("You", 178.4)}
        renderCard={stubRender()}
        state="LOSS_OPEN"
        windowClosesAtMs={Date.now() + 30 * 60_000}
      />
    );
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
    expect(container.querySelector('[data-h2h-overlay-countdown="true"]')).toBeTruthy();
  });

  it("LOSS_CLOSED variant → 'Play your own hand' + no countdown", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 182.4)}
        recipient={makeHand("You", 178.4)}
        renderCard={stubRender()}
        state="LOSS_CLOSED"
      />
    );
    expect(screen.getByRole("button", { name: "Play your own hand" })).toBeTruthy();
    expect(container.querySelector('[data-h2h-overlay-countdown="true"]')).toBeNull();
  });

  it("× close fires onDismiss; no Dismiss CTA renders", () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
        onDismiss={onDismiss}
      />
    );
    // Dismiss CTA was removed in phase 4 fix 3 (2026-05-27).
    expect(container.querySelector('[data-h2h-overlay-dismiss="true"]')).toBeNull();
    fireEvent.click(container.querySelector('[data-h2h-overlay-close="true"]') as HTMLElement);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("primary CTA fires the matching handler", () => {
    const onSendItBack = vi.fn();
    const onTryAgain = vi.fn();
    const onPlayOwnHand = vi.fn();
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);

    const { rerender } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
        onSendItBack={onSendItBack}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Send It Back" }));
    expect(onSendItBack).toHaveBeenCalledTimes(1);

    rerender(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="LOSS_OPEN"
        windowClosesAtMs={Date.now() + 30 * 60_000}
        onTryAgain={onTryAgain}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);

    rerender(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="LOSS_CLOSED"
        onPlayOwnHand={onPlayOwnHand}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Play your own hand" }));
    expect(onPlayOwnHand).toHaveBeenCalledTimes(1);
  });
});

describe("H2HResultsOverlay — headline + trash-talk in left rail", () => {
  it("headline + trash-talk render in the left rail", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const leftRail = container.querySelector('[data-h2h-overlay-rail="left"]') as HTMLElement;
    expect(leftRail).toBeTruthy();
    const headline = leftRail.querySelector('[data-h2h-overlay-headline="true"]');
    const trash = leftRail.querySelector('[data-h2h-overlay-trash-talk="true"]');
    expect(headline).toBeTruthy();
    expect(trash).toBeTruthy();
    expect((trash?.textContent ?? "").length).toBeGreaterThan(0);
  });

  it("photo_finish margin bucket headline reads 'Photo finish'", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 100.0)}
        recipient={makeHand("You", 100.7)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const overlay = container.querySelector('[data-h2h-results-overlay="true"]') as HTMLElement;
    expect(overlay.getAttribute("data-h2h-overlay-bucket")).toBe("photo_finish");
    expect(
      container.querySelector('[data-h2h-overlay-headline="true"]')?.textContent
    ).toMatch(/Photo finish/i);
  });

  it("win_big bucket headline includes opponent name + delta", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 100.0)}
        recipient={makeHand("You", 125.0)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    expect(
      container.querySelector('[data-h2h-results-overlay="true"]')?.getAttribute("data-h2h-overlay-bucket")
    ).toBe("win_big");
    const headline = container.querySelector('[data-h2h-overlay-headline="true"]')?.textContent ?? "";
    expect(headline).toMatch(/Mike/);
    expect(headline).toMatch(/25/);
  });
});

describe("H2HResultsOverlay — per-strip flip", () => {
  it("tapping a top-strip card sets ONLY the top selection", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const opponentStripCells = container.querySelectorAll(
      '[data-h2h-overlay-zone="opponent"] [data-h2h-overlay-cell="true"]'
    );
    const firstCell = opponentStripCells[0] as HTMLElement;
    const firstCardId = firstCell.getAttribute("data-card-id")!;

    // Initial: nothing selected on either strip.
    const overlay = container.querySelector('[data-h2h-results-overlay="true"]');
    expect(overlay?.getAttribute("data-h2h-overlay-selected-top")).toBe("");
    expect(overlay?.getAttribute("data-h2h-overlay-selected-bottom")).toBe("");

    // Tap top → top selected, bottom still empty.
    fireEvent.click(firstCell);
    expect(overlay?.getAttribute("data-h2h-overlay-selected-top")).toBe(firstCardId);
    expect(overlay?.getAttribute("data-h2h-overlay-selected-bottom")).toBe("");
    expect(firstCell.getAttribute("data-card-selected")).toBe("true");

    // Tap top again → top cleared.
    fireEvent.click(firstCell);
    expect(overlay?.getAttribute("data-h2h-overlay-selected-top")).toBe("");
    expect(firstCell.getAttribute("data-card-selected")).toBe("false");
  });

  it("top and bottom strip selections are independent (both can be filled)", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const opponentCells = container.querySelectorAll(
      '[data-h2h-overlay-zone="opponent"] [data-h2h-overlay-cell="true"]'
    );
    const userCells = container.querySelectorAll(
      '[data-h2h-overlay-zone="user"] [data-h2h-overlay-cell="true"]'
    );
    const opponentFirst = opponentCells[0] as HTMLElement;
    const userFirst = userCells[0] as HTMLElement;
    const opponentFirstId = opponentFirst.getAttribute("data-card-id")!;
    const userFirstId = userFirst.getAttribute("data-card-id")!;

    // Tap top + tap bottom — both selected simultaneously.
    fireEvent.click(opponentFirst);
    fireEvent.click(userFirst);

    const overlay = container.querySelector('[data-h2h-results-overlay="true"]');
    expect(overlay?.getAttribute("data-h2h-overlay-selected-top")).toBe(opponentFirstId);
    expect(overlay?.getAttribute("data-h2h-overlay-selected-bottom")).toBe(userFirstId);
    expect(opponentFirst.getAttribute("data-card-selected")).toBe("true");
    expect(userFirst.getAttribute("data-card-selected")).toBe("true");

    // Tap a different bottom card — bottom swaps, top unaffected.
    const userSecond = userCells[1] as HTMLElement;
    fireEvent.click(userSecond);
    expect(opponentFirst.getAttribute("data-card-selected")).toBe("true");
    expect(userFirst.getAttribute("data-card-selected")).toBe("false");
    expect(userSecond.getAttribute("data-card-selected")).toBe("true");
  });

  it("tapping a different card within the same strip swaps that strip's selection", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const opponentCells = container.querySelectorAll(
      '[data-h2h-overlay-zone="opponent"] [data-h2h-overlay-cell="true"]'
    );
    const first = opponentCells[0] as HTMLElement;
    const second = opponentCells[1] as HTMLElement;
    const firstId = first.getAttribute("data-card-id")!;
    const secondId = second.getAttribute("data-card-id")!;
    expect(firstId).not.toBe(secondId);

    fireEvent.click(first);
    fireEvent.click(second);

    expect(first.getAttribute("data-card-selected")).toBe("false");
    expect(second.getAttribute("data-card-selected")).toBe("true");
  });
});

describe("H2HResultsOverlay — hero zone rendering", () => {
  it("default state: hero zone has 2 cells, both unoccupied", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const heroCells = container.querySelectorAll('[data-h2h-overlay-hero-cell="true"]');
    expect(heroCells.length).toBe(2);
    for (const cell of Array.from(heroCells)) {
      expect(cell.getAttribute("data-occupied")).toBe("false");
    }
  });

  it("selecting a sender card occupies the TOP hero cell only", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const senderCell = container.querySelector(
      `[data-h2h-overlay-zone="opponent"] [data-card-id="${sender.cards[3].cardId}"]`
    ) as HTMLElement;
    fireEvent.click(senderCell);
    const heroCells = container.querySelectorAll('[data-h2h-overlay-hero-cell="true"]');
    expect(heroCells[0].getAttribute("data-occupied")).toBe("true");
    expect(heroCells[1].getAttribute("data-occupied")).toBe("false");
  });

  it("selecting a recipient card occupies the BOTTOM hero cell only", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const recipientCell = container.querySelector(
      `[data-h2h-overlay-zone="user"] [data-card-id="${recipient.cards[2].cardId}"]`
    ) as HTMLElement;
    fireEvent.click(recipientCell);
    const heroCells = container.querySelectorAll('[data-h2h-overlay-hero-cell="true"]');
    expect(heroCells[0].getAttribute("data-occupied")).toBe("false");
    expect(heroCells[1].getAttribute("data-occupied")).toBe("true");
  });

  it("hero card renderer receives `flipped: true`; strip cards receive `flipped: false`", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const calls: Array<{ cardId: string; flipped: boolean }> = [];
    const renderCard: CardRenderer = vi.fn<CardRenderer>((card, options) => {
      calls.push({ cardId: card.cardId, flipped: options?.flipped ?? false });
      return <div data-card-stub="true" data-card-id={card.cardId} />;
    });
    const targetId = sender.cards[1].cardId;
    render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={renderCard}
        state="WIN"
        initialTopFlippedCardId={targetId}
      />
    );
    const targetCalls = calls.filter(c => c.cardId === targetId);
    expect(targetCalls.some(c => c.flipped === true)).toBe(true);
    expect(targetCalls.some(c => c.flipped === false)).toBe(true);
  });

  it("initialTopFlippedCardId + initialBottomFlippedCardId seed both selections", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const topId = sender.cards[4].cardId;
    const bottomId = recipient.cards[2].cardId;
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
        initialTopFlippedCardId={topId}
        initialBottomFlippedCardId={bottomId}
      />
    );
    const overlay = container.querySelector('[data-h2h-results-overlay="true"]');
    expect(overlay?.getAttribute("data-h2h-overlay-selected-top")).toBe(topId);
    expect(overlay?.getAttribute("data-h2h-overlay-selected-bottom")).toBe(bottomId);
    // Both hero cells occupied.
    const heroCells = container.querySelectorAll('[data-h2h-overlay-hero-cell="true"]');
    expect(heroCells[0].getAttribute("data-occupied")).toBe("true");
    expect(heroCells[1].getAttribute("data-occupied")).toBe("true");
  });
});

describe("H2HResultsOverlay — strip + right-rail rendering", () => {
  it("renders 6 cells in each strip (= 12 total)", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const opponentCells = container.querySelectorAll('[data-h2h-overlay-zone="opponent"] [data-h2h-overlay-cell="true"]');
    const userCells = container.querySelectorAll('[data-h2h-overlay-zone="user"] [data-h2h-overlay-cell="true"]');
    expect(opponentCells.length).toBe(6);
    expect(userCells.length).toBe(6);
  });

  it("both team totals render in the right rail (winner accent + loser muted)", () => {
    render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    expect(screen.getByText("178.4")).toBeTruthy();
    expect(screen.getByText("182.4")).toBeTruthy();
  });

  it("no margin pill renders (phase 4 fix 3 removed it from row 2 center)", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    expect(container.querySelector('[data-h2h-overlay-margin="true"]')).toBeNull();
  });
});

describe("H2HResultsOverlay — crossfade visibility", () => {
  it("visible=false → opacity 0 + pointer-events none", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
        visible={false}
      />
    );
    const overlay = container.querySelector('[data-h2h-results-overlay="true"]') as HTMLElement;
    const style = overlay.getAttribute("style") ?? "";
    expect(style).toMatch(/opacity:\s*0\b/);
    expect(style).toMatch(/pointer-events:\s*none/);
  });

  it("visible=true (default) → opaque + interactive", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
        visible={true}
      />
    );
    const overlay = container.querySelector('[data-h2h-results-overlay="true"]') as HTMLElement;
    const style = overlay.getAttribute("style") ?? "";
    expect(style).toMatch(/opacity:\s*1\b/);
    expect(style).toMatch(/pointer-events:\s*auto/);
  });
});
