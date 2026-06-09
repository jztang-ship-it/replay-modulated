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
import {
  H2HResultsOverlay,
  selectHeadline,
  formatFpHero,
  selectOutcomeColor,
} from "../H2HResultsOverlay";
import type { H2HHand, H2HCard, CardRenderer } from "../H2HRevealScreen";
import { HAND_STRIP_HEIGHT_PX } from "../H2HRevealScreen";

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

describe("H2HResultsOverlay — commentary block (step 3 middle-band redesign)", () => {
  it("headline + resolution render inside the commentary container; left-rail wrapper is gone", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    // Step 3: the [data-h2h-overlay-rail="left"] wrapper was deleted —
    // its headline role moved into the new commentary container in the
    // freed row-1 center span.
    expect(container.querySelector('[data-h2h-overlay-rail="left"]')).toBeNull();
    const commentary = container.querySelector('[data-h2h-overlay-commentary="true"]') as HTMLElement;
    expect(commentary).toBeTruthy();
    const headline = commentary.querySelector('[data-h2h-overlay-headline="true"]');
    expect(headline).toBeTruthy();
    expect((headline?.textContent ?? "").length).toBeGreaterThan(0);
    const resolution = commentary.querySelector('[data-h2h-overlay-resolution="true"]');
    expect(resolution).toBeTruthy();
    expect((resolution?.textContent ?? "").length).toBeGreaterThan(0);
    // Trash-talk block was retired in the relay-tension Phase 1 collapse
    // and stays retired; the resolution line replaces it as the second
    // commentary block.
    expect(container.querySelector('[data-h2h-overlay-trash-talk="true"]')).toBeNull();
  });

  it("RD1: sub-1-FP win renders 'YOU BEAT {NAME}' (no longer 'Photo finish')", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 100.0)}
        recipient={makeHand("You", 100.7)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const overlay = container.querySelector('[data-h2h-results-overlay="true"]') as HTMLElement;
    // bucket attr still set (trashTalkBucket survives for downstream
    // consumers); it just no longer drives headline copy.
    expect(overlay.getAttribute("data-h2h-overlay-bucket")).toBe("photo_finish");
    const headline = container.querySelector('[data-h2h-overlay-headline="true"]')?.textContent ?? "";
    expect(headline).toBe("YOU BEAT Mike");
    expect(headline).not.toMatch(/Photo finish/i);
    // RD1 — outcome carries no numeric; the delta lives only in the hero.
    expect(headline).not.toMatch(/\d/);
    const hero = container.querySelector('[data-h2h-overlay-fphero="true"]')?.textContent ?? "";
    expect(hero).toBe("+0.7 FP");
  });

  it("RD1: large win renders 'YOU BEAT {NAME}' + signed hero; no number in the headline", () => {
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
    expect(headline).toBe("YOU BEAT Mike");
    expect(headline).not.toMatch(/\d/);
    const hero = container.querySelector('[data-h2h-overlay-fphero="true"]')?.textContent ?? "";
    expect(hero).toBe("+25.0 FP");
  });
});

// ── RD1 — outcome-first headline + FP hero + outcome color ──────────────
//
// Spec: docs/replaymod-design-decisions.md §"RD1 — rivalry results: spec".
// The headline copy is keyed off the SIGN of delta (with a tie threshold
// of |delta| < 0.05), NOT off trashTalkBucket. The margin number lives
// only in the stacked FP hero; the headline string carries no numeric.

describe("RD1 — selectHeadline (outcome + rival, no number in string)", () => {
  it("win → YOU BEAT {NAME}", () => {
    expect(selectHeadline({ delta: 25.0, challengerName: "Mike" })).toBe("YOU BEAT Mike");
  });
  it("loss → YOU LOST TO {NAME}", () => {
    expect(selectHeadline({ delta: -25.0, challengerName: "Mike" })).toBe("YOU LOST TO Mike");
  });
  it("tie (|delta| < 0.05) → YOU TIED {NAME}", () => {
    expect(selectHeadline({ delta: 0.0, challengerName: "Mike" })).toBe("YOU TIED Mike");
    expect(selectHeadline({ delta: 0.04, challengerName: "Mike" })).toBe("YOU TIED Mike");
    expect(selectHeadline({ delta: -0.04, challengerName: "Mike" })).toBe("YOU TIED Mike");
  });

  it("no-name fallback: win → YOU WON / loss → YOU LOST / tie → YOU TIED", () => {
    expect(selectHeadline({ delta: 25.0, challengerName: null })).toBe("YOU WON");
    expect(selectHeadline({ delta: -25.0, challengerName: null })).toBe("YOU LOST");
    expect(selectHeadline({ delta: 0.0, challengerName: null })).toBe("YOU TIED");
  });

  it("headline string contains NO numeric (delta lives only in the hero)", () => {
    const samples = [
      selectHeadline({ delta: 25.0, challengerName: "Mike" }),
      selectHeadline({ delta: -25.0, challengerName: "Mike" }),
      selectHeadline({ delta: 0.0, challengerName: "Mike" }),
      selectHeadline({ delta: 0.7, challengerName: "Mike" }),
      selectHeadline({ delta: -0.7, challengerName: "Mike" }),
      selectHeadline({ delta: 0.7, challengerName: null }),
    ];
    for (const s of samples) {
      expect(s).not.toMatch(/\d/);
    }
  });

  it("sub-1-FP loss renders as YOU LOST TO {NAME} (not 'photo finish' / soft-pedal)", () => {
    // Spec: the photo_finish bucket no longer produces a special headline;
    // a sub-1-FP loss is still a loss, because soft-pedaling it buries
    // the outcome — counter to "impossible to miss."
    expect(selectHeadline({ delta: -0.7, challengerName: "Mike" })).toBe("YOU LOST TO Mike");
    expect(selectHeadline({ delta: -0.6, challengerName: "Mike" })).toBe("YOU LOST TO Mike");
    expect(selectHeadline({ delta: -0.05, challengerName: "Mike" })).toBe("YOU LOST TO Mike");
  });
});

describe("RD1 — formatFpHero (signed magnitude only)", () => {
  it("win → +X.X FP", () => {
    expect(formatFpHero(20.1)).toBe("+20.1 FP");
    expect(formatFpHero(0.7)).toBe("+0.7 FP");
  });
  it("loss → −X.X FP (U+2212 minus, not hyphen)", () => {
    expect(formatFpHero(-20.1)).toBe("−20.1 FP");
    expect(formatFpHero(-0.7)).toBe("−0.7 FP");
    // The minus is U+2212 specifically so the hero reads as a typographic
    // minus at fontWeight 950, not a thin hyphen.
    expect(formatFpHero(-20.1).charCodeAt(0)).toBe(0x2212);
  });
  it("tie (|delta| < 0.05) → literal '0.0 FP' (no sign prefix)", () => {
    expect(formatFpHero(0.0)).toBe("0.0 FP");
    expect(formatFpHero(0.04)).toBe("0.0 FP");
    expect(formatFpHero(-0.04)).toBe("0.0 FP");
  });
});

describe("RD1 — selectOutcomeColor (driven by outcome, not bucket)", () => {
  it("win → WINNING_COLOR (green)", () => {
    // We assert the value via stable hex/known-symbol checks below; the
    // exact import-time value is exercised in the JSX wiring test.
    expect(selectOutcomeColor(25.0)).toBe(selectOutcomeColor(0.7));
    expect(selectOutcomeColor(25.0)).not.toBe("#EF4444");
    expect(selectOutcomeColor(25.0)).not.toBe("#FFB14A");
  });
  it("loss → #EF4444 (red)", () => {
    expect(selectOutcomeColor(-25.0)).toBe("#EF4444");
    expect(selectOutcomeColor(-0.7)).toBe("#EF4444");
    expect(selectOutcomeColor(-0.05)).toBe("#EF4444");
  });
  it("tie (|delta| < 0.05) → #FFB14A (amber)", () => {
    expect(selectOutcomeColor(0.0)).toBe("#FFB14A");
    expect(selectOutcomeColor(0.04)).toBe("#FFB14A");
    expect(selectOutcomeColor(-0.04)).toBe("#FFB14A");
  });
});

describe("RD1 — overlay render wires the new outcome shape", () => {
  it("LOSS_OPEN sub-1-FP loss → 'YOU LOST TO Mike' + '−0.7 FP' + red color", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 100.7)}
        recipient={makeHand("You", 100.0)}
        renderCard={stubRender()}
        state="LOSS_OPEN"
      />
    );
    const headline = container.querySelector('[data-h2h-overlay-headline="true"]') as HTMLElement;
    const hero = container.querySelector('[data-h2h-overlay-fphero="true"]') as HTMLElement;
    expect(headline?.textContent).toBe("YOU LOST TO Mike");
    expect(headline?.textContent).not.toMatch(/Photo finish/i);
    expect(hero?.textContent).toBe("−0.7 FP");
    // Outcome color drives both headline and hero — red on loss.
    expect(headline.style.color).toBe("rgb(239, 68, 68)");
    expect(hero.style.color).toBe("rgb(239, 68, 68)");
  });

  it("tie → 'YOU TIED Mike' + '0.0 FP' + amber color", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 100.0)}
        recipient={makeHand("You", 100.0)}
        renderCard={stubRender()}
        // A 0-delta hand is unusual on LOSS_OPEN, but the headline copy +
        // color are driven by delta, not the legacy state machine.
        state="LOSS_OPEN"
      />
    );
    const headline = container.querySelector('[data-h2h-overlay-headline="true"]') as HTMLElement;
    const hero = container.querySelector('[data-h2h-overlay-fphero="true"]') as HTMLElement;
    expect(headline?.textContent).toBe("YOU TIED Mike");
    expect(hero?.textContent).toBe("0.0 FP");
    expect(headline.style.color).toBe("rgb(255, 177, 74)");
  });

  it("LOSS_CLOSED loss → headline is red (state no longer overrides outcome color)", () => {
    // Pre-RD1 a LOSS_CLOSED headline rendered off-white; RD1 keys color
    // off the SIGN of delta so a closed-window loss is still red.
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 125.0)}
        recipient={makeHand("You", 100.0)}
        renderCard={stubRender()}
        state="LOSS_CLOSED"
      />
    );
    const headline = container.querySelector('[data-h2h-overlay-headline="true"]') as HTMLElement;
    expect(headline?.textContent).toBe("YOU LOST TO Mike");
    expect(headline.style.color).toBe("rgb(239, 68, 68)");
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

describe("H2HResultsOverlay — hero zone rendering (step 3: opponent hero removed)", () => {
  it("default state: hero zone has 1 cell (user/bottom only), unoccupied", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    // Step 3: the opponent (top) HeroCell was removed; only the user
    // (bottom) hero cell remains. Step 4 docks the scores from the
    // right rail into the ZoneHeaders.
    const heroCells = container.querySelectorAll('[data-h2h-overlay-hero-cell="true"]');
    expect(heroCells.length).toBe(1);
    expect(heroCells[0].getAttribute("data-occupied")).toBe("false");
  });

  it("tapping a sender strip card sets data-h2h-overlay-selected-top but renders no top hero cell (top hero removed in step 3)", () => {
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
    const overlay = container.querySelector('[data-h2h-results-overlay="true"]');
    expect(overlay?.getAttribute("data-h2h-overlay-selected-top")).toBe(sender.cards[3].cardId);
    // No top hero cell to occupy — the single remaining hero cell is
    // the user (bottom) hero, which the sender tap doesn't affect.
    const heroCells = container.querySelectorAll('[data-h2h-overlay-hero-cell="true"]');
    expect(heroCells.length).toBe(1);
    expect(heroCells[0].getAttribute("data-occupied")).toBe("false");
  });

  it("selecting a recipient card occupies the BOTTOM hero cell (the only hero cell)", () => {
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
    expect(heroCells.length).toBe(1);
    expect(heroCells[0].getAttribute("data-occupied")).toBe("true");
  });

  // #7 (2026-06-08): preview-then-flip. The hero shows the card FRONT
  // on selection; the back appears only after a deliberate flip tap.
  // (Supersedes the prior "hero renders flipped: true on mount" test,
  // which encoded the now-removed back-first behavior.)
  it("#7: a seeded bottom hero previews FRONT on mount, not the back", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const targetId = recipient.cards[1].cardId;
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
        initialBottomFlippedCardId={targetId}
      />
    );
    const hero = container.querySelector("[data-h2h-overlay-hero-flipped]");
    expect(hero).toBeTruthy();
    // Occupied, but front-side (flipped === false).
    expect(hero?.getAttribute("data-h2h-overlay-hero-flipped")).toBe("false");
  });

  it("#7: tapping the hero card flips it front→back→front", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const targetId = recipient.cards[2].cardId;
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    // Select → front preview.
    fireEvent.click(container.querySelector(
      `[data-h2h-overlay-zone="user"] [data-card-id="${targetId}"]`
    ) as HTMLElement);
    const heroSel = "[data-h2h-overlay-hero-flipped]";
    expect(container.querySelector(heroSel)?.getAttribute("data-h2h-overlay-hero-flipped")).toBe("false");
    // Tap the hero card itself → back.
    fireEvent.click(container.querySelector(heroSel) as HTMLElement);
    expect(container.querySelector(heroSel)?.getAttribute("data-h2h-overlay-hero-flipped")).toBe("true");
    // Tap again → back to front.
    fireEvent.click(container.querySelector(heroSel) as HTMLElement);
    expect(container.querySelector(heroSel)?.getAttribute("data-h2h-overlay-hero-flipped")).toBe("false");
  });

  it("#7: re-tapping the active mini card flips; switching cards resets to front", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const idA = recipient.cards[1].cardId;
    const idB = recipient.cards[3].cardId;
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const heroSel = "[data-h2h-overlay-hero-flipped]";
    const cell = (id: string) => container.querySelector(
      `[data-h2h-overlay-zone="user"] [data-card-id="${id}"]`
    ) as HTMLElement;
    const occupantId = () =>
      container.querySelector(`${heroSel} [data-card-id]`)?.getAttribute("data-card-id");

    fireEvent.click(cell(idA));              // select A → front
    expect(occupantId()).toBe(idA);
    expect(container.querySelector(heroSel)?.getAttribute("data-h2h-overlay-hero-flipped")).toBe("false");

    fireEvent.click(cell(idA));              // re-tap A → flip to back
    expect(container.querySelector(heroSel)?.getAttribute("data-h2h-overlay-hero-flipped")).toBe("true");

    fireEvent.click(cell(idB));              // switch to B → MUST reset to front
    expect(occupantId()).toBe(idB);
    expect(container.querySelector(heroSel)?.getAttribute("data-h2h-overlay-hero-flipped")).toBe("false");
  });

  it("#7 req 1: the empty bottom hero cell shows a dashed border before any tap", () => {
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
    const heroCell = container.querySelector('[data-h2h-overlay-hero-cell="true"]');
    expect(heroCell?.getAttribute("data-occupied")).toBe("false");
    const innerBox = heroCell?.querySelector("div") as HTMLElement | null;
    expect(innerBox?.style.border).toContain("dashed");
  });

  it("#7: flip-discoverability caption tracks hero state (empty → front → hidden on back)", () => {
    const sender = makeHand("Mike", 178.4);
    const recipient = makeHand("You", 182.4);
    const targetId = recipient.cards[2].cardId;
    const { container } = render(
      <H2HResultsOverlay
        sender={sender}
        recipient={recipient}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const hint = () => container.querySelector("[data-h2h-overlay-hero-hint]");
    // Empty → invite the first tap.
    expect(hint()?.getAttribute("data-h2h-overlay-hero-hint")).toBe("empty");
    expect(hint()?.textContent).toContain("game logs");
    // Select → front preview → invite the flip.
    fireEvent.click(container.querySelector(
      `[data-h2h-overlay-zone="user"] [data-card-id="${targetId}"]`
    ) as HTMLElement);
    expect(hint()?.getAttribute("data-h2h-overlay-hero-hint")).toBe("front");
    expect(hint()?.textContent).toContain("back");
    // Flip to back → caption hidden (card's own hint takes over).
    fireEvent.click(container.querySelector("[data-h2h-overlay-hero-flipped]") as HTMLElement);
    expect(hint()).toBeNull();
  });

  it("initialTopFlippedCardId + initialBottomFlippedCardId both seed selection state; only bottom hero renders", () => {
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
    // Selection state still tracks both strips so the props remain a
    // stable contract for callers (e.g. smoke captures, future glide
    // animations in step 4).
    expect(overlay?.getAttribute("data-h2h-overlay-selected-top")).toBe(topId);
    expect(overlay?.getAttribute("data-h2h-overlay-selected-bottom")).toBe(bottomId);
    // Only the bottom hero cell renders in step 3; it's occupied by
    // the bottom seed.
    const heroCells = container.querySelectorAll('[data-h2h-overlay-hero-cell="true"]');
    expect(heroCells.length).toBe(1);
    expect(heroCells[0].getAttribute("data-occupied")).toBe("true");
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

// #4 contract lock (2026-05-30, INVERTS amend2's spatial assertion):
// ResultsStrip LAYOUT is `slotIndex`-only — `revealOrder` is the
// TEMPORAL contract, never spatial. Mirrors the HandStrip inversion
// (S5 invariant: held cards stay in their slotIndex positions through
// reveal → results). See docs/h2h-reveal-arc-design.md "Locked
// invariant — strip-component sort contract" EDIT 2026-05-30
// (axis split).
describe("H2HResultsOverlay — strip layout contract", () => {
  it("ResultsStrip displays cards in slotIndex order regardless of revealOrder", () => {
    const senderCards: H2HCard[] = [
      makeCard({ cardId: "card-A", name: "A held $57", basePlayerId: "pA", wasHeld: true,  salary: 57, slotIndex: 0 }),
      makeCard({ cardId: "card-B", name: "B swap $29", basePlayerId: "pB", wasHeld: false, salary: 29, slotIndex: 5 }),
      makeCard({ cardId: "card-C", name: "C swap $34", basePlayerId: "pC", wasHeld: false, salary: 34, slotIndex: 1 }),
      makeCard({ cardId: "card-D", name: "D swap $52", basePlayerId: "pD", wasHeld: false, salary: 52, slotIndex: 2 }),
      makeCard({ cardId: "card-E", name: "E held $40", basePlayerId: "pE", wasHeld: true,  salary: 40, slotIndex: 3 }),
      makeCard({ cardId: "card-F", name: "F swap $37", basePlayerId: "pF", wasHeld: false, salary: 37, slotIndex: 4 }),
    ];
    // revealOrder follows the canonical temporal rule (wasHeld ASC,
    // salary ASC); the strip MUST ignore it for SPATIAL layout and
    // render in slotIndex order.
    const senderRevealOrder = [
      senderCards[1], senderCards[2], senderCards[5], senderCards[3], senderCards[4], senderCards[0],
    ];
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4, { cards: senderCards })}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
        senderRevealOrder={senderRevealOrder}
      />
    );
    const opponentCells = container.querySelectorAll(
      '[data-h2h-overlay-zone="opponent"] [data-h2h-overlay-cell="true"]'
    );
    expect(opponentCells.length).toBe(6);
    // slotIndex order: A (0), C (1), D (2), E (3), F (4), B (5).
    expect(opponentCells[0].getAttribute("data-card-id")).toBe("card-A"); // slot 0 — held stays leftmost
    expect(opponentCells[1].getAttribute("data-card-id")).toBe("card-C"); // slot 1
    expect(opponentCells[2].getAttribute("data-card-id")).toBe("card-D"); // slot 2
    expect(opponentCells[3].getAttribute("data-card-id")).toBe("card-E"); // slot 3 — held stays mid-strip
    expect(opponentCells[4].getAttribute("data-card-id")).toBe("card-F"); // slot 4
    expect(opponentCells[5].getAttribute("data-card-id")).toBe("card-B"); // slot 5
  });
});

describe("H2HResultsOverlay — RD2 unified-80 lock", () => {
  // The unified-80 amendment (2026-06-08, supersedes the same-day 40
  // shrink) locks ONE mini-slot geometry across all four states of the
  // H2H surface: hold/draw → play → reveal → results. This file used to
  // declare its own `const STRIP_HEIGHT_PX = 80`; that local literal is
  // retired in favor of importing HAND_STRIP_HEIGHT_PX from
  // H2HRevealScreen. This test pins the overlay's strip height to the
  // imported value — paired with the H2HRevealScreen and H2HRecipientPlay
  // coupling tests, it proves all three surfaces are unified through one
  // constant. Drift between them is impossible without removing an
  // import (which would fail tsc).
  it("overlay strip inline height equals the imported HAND_STRIP_HEIGHT_PX", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const strips = container.querySelectorAll('[data-h2h-overlay-strip="true"]');
    // Two strips (opponent zone + user zone), both must read the constant.
    expect(strips.length).toBe(2);
    for (const strip of Array.from(strips)) {
      const style = (strip as HTMLElement).getAttribute("style") || "";
      const m = style.match(/height:\s*(\d+)px/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBe(HAND_STRIP_HEIGHT_PX);
    }
  });
});

describe("H2HResultsOverlay — RD2.1 scale-tracks-cell lock", () => {
  // RD2.1 (2026-06-09): the inner card's scale is container-query
  // derived (calc(100cqw / 150px)) so it tracks the flex-resolved cell
  // width exactly — no 3px overhang, no card-back FP clip. Mechanism-
  // wired proxy test (JSDOM doesn't compute layout, so the actual
  // width===width assertion runs in scripts/verify-rd21-strip-scaffold
  // .mjs against real Chromium + WebKit).
  it("overlay cell carries containerType:inline-size + inner uses cqw scale", () => {
    const { container } = render(
      <H2HResultsOverlay
        sender={makeHand("Mike", 178.4)}
        recipient={makeHand("You", 182.4)}
        renderCard={stubRender()}
        state="WIN"
      />
    );
    const cells = container.querySelectorAll('[data-h2h-overlay-cell="true"]');
    expect(cells.length).toBe(12); // 6 opponent + 6 user
    for (const cell of Array.from(cells)) {
      const style = (cell as HTMLElement).getAttribute("style") ?? "";
      expect(style).toMatch(/container-type:\s*inline-size/);
    }
    const innerWithTransform = container.querySelector(
      '[data-h2h-overlay-cell="true"] [style*="transform"]'
    );
    expect(innerWithTransform).not.toBeNull();
    const innerStyle = (innerWithTransform as HTMLElement).getAttribute("style") ?? "";
    expect(innerStyle).toMatch(/scale\(calc\(100cqw\s*\/\s*150px\)\)/);
  });
});
