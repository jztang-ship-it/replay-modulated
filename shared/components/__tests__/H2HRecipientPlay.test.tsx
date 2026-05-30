// @vitest-environment jsdom
/**
 * shared/components/__tests__/H2HRecipientPlay.test.tsx
 *
 * Phase 5b piece 2 — playing-mode layout rework (locked 2026-05-30,
 * commits 18f6376 + 63fcd8d). Coverage:
 *   - state-1 pre_deal render (face-down top, empty bottom, Deal CTA)
 *   - state-2 deal_in cascade lands 6 face-up positional from
 *     challengeCtx.initialRoster (NOT a redraw, NOT a deterministic
 *     engine call — the snapshot read corrected in 63fcd8d)
 *   - hold tap toggles
 *   - Draw fires redrawRoster ONCE with correct heldset
 *   - state-3 column-flip pass: held column flips top only,
 *     replacement column flips top + bottom in unison, LEFT→RIGHT
 *   - S5 held-card position invariant (held slot at i stays at i
 *     through all states)
 *   - path-β no-flicker: replacement front-faces are NOT in the DOM
 *     during redraw_running OR before that slot's column-flip stage
 *   - column ordering: col N+1 begins only after col N completes
 *   - handoff fires resolveRoster ONCE with POST-redraw finalRoster
 *     (NOT initialRoster), mounts H2HRecipientReveal with
 *     bypassGameStateGate
 *   - anonymous path (P5): no auth UI mounted
 *
 * Renderer is a name-printing stub so DOM assertions can locate
 * specific cards by name (held vs replacement, path-β content).
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import {
  H2HRecipientPlay,
  PRE_REVEAL_HOLD_MS,
  DEAL_CASCADE_INTERVAL_MS,
  COLUMN_FLIP_DURATION_MS,
  COLUMN_FLIP_INTERSTITIAL_MS,
} from "../H2HRecipientPlay";
import type { ChallengeCtx, SenderHand } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types";
import type { CardRenderer, H2HCard } from "../H2HRevealScreen";

beforeAll(() => {
  // @ts-expect-error global fetch stub — the inner H2HRecipientReveal's
  // useChallengeAttempt fires a POST on handoff mount.
  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      attempt_id: "test-attempt",
      attempt_count: 1,
      winner_count: 0,
      best_score: null,
      best_user_name: null,
      is_best: false,
      is_window_open: true,
      window_closes_at_ms: Date.now() + 3600_000,
    }),
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

function makeCard(over: Partial<GeneratedCard> = {}, i = 0): GeneratedCard {
  return {
    id: `p${i}`, basePlayerId: `p${i}`, personKey: `p${i}`, cardId: `c-${i}`,
    name: `Init-${i}`, team: "ABC", season: "2425", position: "PG",
    photoCode: "playte01", salary: 50, tier: "PURPLE", projectedFp: 30,
    slotIndex: i, wasHeld: false, actualFp: 25, fpDelta: -5,
    gameInfo: { date: "2025-01-01", opponent: "XYZ" },
    statLine: { pts: 20 },
    achievements: [],
    ...over,
  } as GeneratedCard;
}

/** Initial roster cards named "Init-0".."Init-5" — assertion-friendly. */
function makeRoster(): GeneratedCard[] {
  return Array.from({ length: 6 }, (_, i) =>
    makeCard({ name: `Init-${i}`, cardId: `init-${i}`, actualFp: 30 + i }, i),
  );
}

/** Distinct roster for redrawRoster return — cards named "Final-0".."Final-5"
 *  so path-β tests can check whether a replacement name has hit the DOM. */
function makeFinalRoster(initial: GeneratedCard[], heldSlots: Set<number>): GeneratedCard[] {
  return initial.map((card, i) => {
    if (heldSlots.has(i)) return { ...card, wasHeld: true };
    return {
      ...card,
      name: `Final-${i}`,
      cardId: `final-${i}`,
      actualFp: 50 + i,
      wasHeld: false,
    };
  });
}

function makeCtx(over: Partial<ChallengeCtx> = {}): ChallengeCtx {
  return {
    challengeId: "test-challenge-id",
    initialRoster: makeRoster(),
    targetScore: 175,
    challengerName: "Mike",
    sport: "basketball",
    season: "2425",
    ...over,
  };
}

function makeSenderHand(): SenderHand {
  return {
    handId: "sender-hand-1",
    totalFp: 178.4,
    tier: "ROOKIE",
    cards: Array.from({ length: 6 }, (_, i) =>
      makeCard({ slotIndex: i, cardId: `s-${i}`, name: `Sender-${i}` }, i),
    ),
  };
}

/** Renderer that prints the card's name so tests can assert by content. */
const nameRenderer: CardRenderer = (card: H2HCard) => (
  <div data-stub-card="true">{card.name}</div>
);

function baseProps(overrides: Partial<React.ComponentProps<typeof H2HRecipientPlay>> = {}) {
  return {
    sport: "basketball",
    redrawRoster: vi.fn(async ({ currentCards, lockedCardIds }: {
      currentCards: GeneratedCard[];
      lockedCardIds: Set<string>;
    }) => {
      const held = new Set<number>();
      currentCards.forEach((c, i) => {
        const id = String((c as any).cardId ?? "");
        if (lockedCardIds.has(id)) held.add(i);
      });
      return { roster: makeFinalRoster(currentCards, held) };
    }),
    resolveRoster: vi.fn(async ({ finalCards }: { finalCards: GeneratedCard[] }) => ({
      roster: finalCards,
    })),
    calculateWinTier: vi.fn((_fp: number) => "ROOKIE"),
    renderPlayingStripCard: nameRenderer,
    renderBattlefieldCard: nameRenderer,
    renderOverlayCard: nameRenderer,
    onSendItBack: vi.fn(),
    onTryAgain: vi.fn(),
    onPlayOwnHand: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

// ── 1. Initial render (state pre_deal) ──────────────────────────────

describe("H2HRecipientPlay — state 1 (pre_deal)", () => {
  it("mounts the playing surface with challengeCtx present", () => {
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />
    );
    const root = container.querySelector("[data-h2h-recipient-play]");
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-playing-state")).toBe("pre_deal");
  });

  it("renders 6 face-down cells on top strip", () => {
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`top-strip-back-${i}`)).toBeTruthy();
    }
  });

  it("renders 6 empty placeholders on bottom strip", () => {
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`bottom-strip-empty-${i}`)).toBeTruthy();
    }
  });

  it("renders Deal CTA enabled", () => {
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    const btn = screen.getByText("Deal") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
  });

  it("guidance copy in hero zone references opener invitation", () => {
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    const headline = screen.getByText(/Hit deal/i);
    expect(headline).toBeTruthy();
  });

  it("renders no replacement names (path β at rest)", () => {
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    for (let i = 0; i < 6; i++) {
      expect(screen.queryByText(`Final-${i}`)).toBeNull();
    }
  });
});

// ── 2. Deal cascade (state deal_in) ────────────────────────────────

describe("H2HRecipientPlay — state 2 (deal_in cascade)", () => {
  it("Deal tap starts the cascade; first card lands within DEAL_CASCADE_INTERVAL_MS", async () => {
    vi.useFakeTimers();
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    fireEvent.click(screen.getByText("Deal"));
    // After first tick, slot 0 should be face-up with the initial roster card.
    await act(async () => { vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS); });
    expect(screen.getByTestId("bottom-strip-up-0")).toBeTruthy();
    expect(screen.getByText("Init-0")).toBeTruthy();
    // Slot 1 still empty pre-next-tick.
    expect(screen.getByTestId("bottom-strip-empty-1")).toBeTruthy();
  });

  it("cascade lands 6 face-up cells in positional order from initialRoster", async () => {
    vi.useFakeTimers();
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    fireEvent.click(screen.getByText("Deal"));
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`bottom-strip-up-${i}`)).toBeTruthy();
      expect(screen.getByText(`Init-${i}`)).toBeTruthy();
    }
  });

  it("Deal CTA is disabled during cascade and replaced by Draw on completion", async () => {
    vi.useFakeTimers();
    const { container } = render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    fireEvent.click(screen.getByText("Deal"));
    // Mid-cascade: Deal exists but is disabled.
    await act(async () => { vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS); });
    const dealBtn = container.querySelector("[data-cta-label='Deal']") as HTMLButtonElement;
    expect(dealBtn?.disabled).toBe(true);
    // After cascade: state → hold_select; CTA flips to Draw.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    const drawBtn = screen.getByText("Draw") as HTMLButtonElement;
    expect(drawBtn.disabled).toBe(false);
  });
});

// ── 3. Hold/unhold (state hold_select) ─────────────────────────────

describe("H2HRecipientPlay — state 2 → hold_select (P7 MVP functional tap)", () => {
  async function dealThrough(initialCtx = makeCtx(), overrides = {}) {
    vi.useFakeTimers();
    const utils = render(
      <H2HRecipientPlay {...baseProps(overrides)} challengeCtx={initialCtx} />
    );
    fireEvent.click(screen.getByText("Deal"));
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    return utils;
  }

  it("hold_select has all 6 cells face-up tappable", async () => {
    await dealThrough();
    for (let i = 0; i < 6; i++) {
      const cell = screen.getByTestId(`bottom-strip-up-${i}`);
      expect(cell.getAttribute("data-held")).toBe("false");
    }
  });

  it("tapping a face-up cell toggles its held attribute", async () => {
    await dealThrough();
    const cell = screen.getByTestId("bottom-strip-up-2");
    fireEvent.click(cell);
    expect(screen.getByTestId("bottom-strip-up-2").getAttribute("data-held")).toBe("true");
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(screen.getByTestId("bottom-strip-up-2").getAttribute("data-held")).toBe("false");
  });

  it("multiple holds + Draw CTA is enabled", async () => {
    await dealThrough();
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-4"));
    expect(screen.getByTestId("bottom-strip-up-1").getAttribute("data-held")).toBe("true");
    expect(screen.getByTestId("bottom-strip-up-4").getAttribute("data-held")).toBe("true");
    const drawBtn = screen.getByText("Draw") as HTMLButtonElement;
    expect(drawBtn.disabled).toBe(false);
  });
});

// ── 4. redrawRoster firing + path β no-flicker (state redraw_running) ─

describe("H2HRecipientPlay — state 3a (redraw_running) — path β", () => {
  it("Draw tap fires redrawRoster ONCE with correct lockedCardIds", async () => {
    vi.useFakeTimers();
    const ctx = makeCtx();
    const props = baseProps();
    render(<H2HRecipientPlay {...props} challengeCtx={ctx} />);
    fireEvent.click(screen.getByText("Deal"));
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // Hold slot 1 and slot 3.
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-3"));
    // Switch to real timers so the async redrawRoster microtask
    // resolves cleanly.
    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(() => expect(props.redrawRoster).toHaveBeenCalledTimes(1));
    const callArg = props.redrawRoster.mock.calls[0][0];
    expect(callArg.currentCards).toBe(ctx.initialRoster);
    // lockedCardIds is the cardId-set of held slots only.
    expect(callArg.lockedCardIds).toBeInstanceOf(Set);
    expect(callArg.lockedCardIds.size).toBe(2);
    expect(callArg.lockedCardIds.has("init-1")).toBe(true);
    expect(callArg.lockedCardIds.has("init-3")).toBe(true);
  });

  it("path β: replacement values (Final-N for unheld N) are NOT in the DOM during redraw_running", async () => {
    // Hold redrawRoster's promise so the test can observe the
    // redraw_running state mid-flight.
    let resolveRedraw: (val: { roster: GeneratedCard[] }) => void = () => { };
    const heldRedraw = new Promise<{ roster: GeneratedCard[] }>((r) => { resolveRedraw = r; });
    const props = baseProps({
      redrawRoster: vi.fn(() => heldRedraw),
    } as any);

    vi.useFakeTimers();
    render(<H2HRecipientPlay {...props} challengeCtx={makeCtx()} />);
    fireEvent.click(screen.getByText("Deal"));
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // Hold slot 2.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));

    // At redraw_running: slot 2 is held face-up, slots 0/1/3/4/5 are face-down.
    await waitFor(() => {
      const root = document.querySelector("[data-h2h-recipient-play]");
      expect(root?.getAttribute("data-playing-state")).toBe("redraw_running");
    });
    // Held slot still shows its initial card name.
    expect(screen.getByText("Init-2")).toBeTruthy();
    // Unheld slots have NO replacement value mounted.
    for (const i of [0, 1, 3, 4, 5]) {
      expect(screen.queryByText(`Final-${i}`)).toBeNull();
      expect(screen.getByTestId(`bottom-strip-down-${i}`)).toBeTruthy();
    }

    // Cleanup: let the redraw resolve so the component can quiesce.
    resolveRedraw({ roster: makeFinalRoster(makeRoster(), new Set([2])) });
  });
});

// ── 5. Column-flip pass (state column_flip) ────────────────────────

describe("H2HRecipientPlay — state 3b (column_flip) — LEFT→RIGHT", () => {
  async function advanceToColumnFlip(heldSlot: number) {
    vi.useFakeTimers();
    const props = baseProps();
    render(<H2HRecipientPlay {...props} challengeCtx={makeCtx()} />);
    fireEvent.click(screen.getByText("Deal"));
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    fireEvent.click(screen.getByTestId(`bottom-strip-up-${heldSlot}`));
    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(() => {
      const root = document.querySelector("[data-h2h-recipient-play]");
      expect(root?.getAttribute("data-playing-state")).toBe("column_flip");
    });
    return props;
  }

  it("revealed columns flip LEFT→RIGHT; held column flips top only", async () => {
    const props = await advanceToColumnFlip(2);
    // Walk to column 2 (the held one). Real timers; just wait for the
    // top-strip-up-2 cell to appear.
    await waitFor(
      () => expect(screen.queryByTestId("top-strip-up-0")).not.toBeNull(),
      { timeout: 2000 },
    );
    await waitFor(
      () => expect(screen.queryByTestId("top-strip-up-2")).not.toBeNull(),
      { timeout: 2000 },
    );
    // After column 2's flip stage:
    //   - top-strip-up-2 exists (sender's card flipped)
    //   - bottom slot 2 is still held face-up (no second flip)
    expect(screen.getByTestId("bottom-strip-up-2").getAttribute("data-held")).toBe("true");
    expect(screen.getByText("Init-2")).toBeTruthy();
    // Replacement names for OTHER (unheld) revealed columns appear by name.
    await waitFor(
      () => expect(screen.queryByText("Final-0")).not.toBeNull(),
      { timeout: 2000 },
    );
    void props;
  });

  it("replacement column flips top + bottom in unison (replacement name appears)", async () => {
    const props = await advanceToColumnFlip(5); // hold slot 5; slot 0 is replacement
    await waitFor(
      () => expect(screen.queryByTestId("top-strip-up-0")).not.toBeNull(),
      { timeout: 2000 },
    );
    // Slot 0's replacement name should now be in the DOM (bottom face-up).
    expect(screen.queryByTestId("bottom-strip-up-0")).not.toBeNull();
    expect(screen.getByText("Final-0")).toBeTruthy();
    void props;
  });

  it("column ordering: column N+1 begins ONLY after column N completes (fake-timer check)", async () => {
    // Use the resolved-immediately redrawRoster mock so we land in
    // column_flip quickly under fake timers.
    vi.useFakeTimers();
    const props = baseProps();
    render(<H2HRecipientPlay {...props} challengeCtx={makeCtx()} />);
    fireEvent.click(screen.getByText("Deal"));
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // No holds; tap Draw straight through.
    fireEvent.click(screen.getByText("Draw"));
    // The redraw async promise resolves on a microtask; flush.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Step #0 → revealedColumns=1 fires on delay=0 setTimeout.
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(screen.queryByTestId("top-strip-up-0")).not.toBeNull();
    expect(screen.queryByTestId("top-strip-back-1")).not.toBeNull();
    // Mid-flip (250ms - 1ms after entry): column 1 has NOT advanced.
    await act(async () => { vi.advanceTimersByTime(COLUMN_FLIP_DURATION_MS - 1); });
    expect(screen.queryByTestId("top-strip-up-1")).toBeNull();
    expect(screen.queryByTestId("top-strip-back-1")).not.toBeNull();
    // After full flip+interstitial: column 1 advanced.
    await act(async () => {
      vi.advanceTimersByTime(COLUMN_FLIP_INTERSTITIAL_MS + 2);
    });
    expect(screen.queryByTestId("top-strip-up-1")).not.toBeNull();
  });
});

// ── 6. Held-card position invariant (S5) ───────────────────────────

describe("H2HRecipientPlay — S5 held-card position invariant", () => {
  it("held card at slot 3 stays at slot 3 through column-flip end", async () => {
    vi.useFakeTimers();
    const props = baseProps();
    const ctx = makeCtx();
    render(<H2HRecipientPlay {...props} challengeCtx={ctx} />);
    fireEvent.click(screen.getByText("Deal"));
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    fireEvent.click(screen.getByTestId("bottom-strip-up-3"));
    expect(screen.getByText("Init-3").closest("[data-h2h-play-bottom-cell]")?.getAttribute("data-h2h-play-bottom-cell")).toBe("3");

    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));
    // Walk all the way through the column-flip pass.
    await waitFor(
      () => expect(screen.queryByTestId("top-strip-up-5")).not.toBeNull(),
      { timeout: 4000 },
    );
    // Held card is still in slot 3, still showing Init-3.
    const heldCell = screen.getByText("Init-3").closest("[data-h2h-play-bottom-cell]");
    expect(heldCell?.getAttribute("data-h2h-play-bottom-cell")).toBe("3");
    expect(heldCell?.getAttribute("data-held")).toBe("true");
  });
});

// ── 7. Handoff (state handoff_resolving → arc) ─────────────────────

describe("H2HRecipientPlay — state 4 handoff", () => {
  it("after column-flip pass, holds PRE_REVEAL_HOLD_MS then calls resolveRoster ONCE on POST-redraw finalRoster", async () => {
    const props = baseProps();
    // No fake timers — let the real timer flow drive transitions end-to-end.
    render(<H2HRecipientPlay {...props} challengeCtx={makeCtx()} />);
    fireEvent.click(screen.getByText("Deal"));
    await waitFor(
      () => expect(screen.queryByText("Draw")).not.toBeNull(),
      { timeout: 2000 },
    );
    // Hold slot 4.
    fireEvent.click(screen.getByTestId("bottom-strip-up-4"));
    fireEvent.click(screen.getByText("Draw"));

    await waitFor(
      () => expect(props.resolveRoster).toHaveBeenCalledTimes(1),
      { timeout: 6000 },
    );
    const arg = props.resolveRoster.mock.calls[0][0];
    // finalCards must be the POST-redraw roster, NOT initialRoster.
    expect(arg.finalCards[4].cardId).toBe("init-4"); // held slot survives
    expect(arg.finalCards[0].cardId).toBe("final-0"); // replacements
    expect(arg.finalCards[0].name).toBe("Final-0");
  });

  it("mounts H2HRecipientReveal INSIDE the still-mounted playing canvas (Fix C2 single-canvas continuity)", async () => {
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={ctx} />
    );
    fireEvent.click(screen.getByText("Deal"));
    await waitFor(
      () => expect(screen.queryByText("Draw")).not.toBeNull(),
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByText("Draw"));
    // Wait for H2HRecipientReveal to mount. resolvedSenderHand is
    // present, so the gate inside H2HRecipientReveal passes and the
    // wrapper renders.
    await waitFor(
      () => expect(container.querySelector("[data-h2h-recipient-reveal]")).not.toBeNull(),
      { timeout: 8000 },
    );
    // Fix C2: the playing canvas root STAYS mounted; the reveal
    // composites inside it. This is the locked-in contract that
    // produces "one coherent surface" — verifying both ways here so
    // a regression that reintroduces the unmount-and-swap fails loud.
    const playingRoot = container.querySelector("[data-h2h-recipient-play]");
    const revealRoot = container.querySelector("[data-h2h-recipient-reveal]");
    expect(playingRoot).not.toBeNull();
    expect(revealRoot).not.toBeNull();
    // Stacking: reveal is a DESCENDANT of the playing root (compose,
    // don't swap).
    expect(playingRoot?.contains(revealRoot)).toBe(true);
    // State attribute reflects arc.
    expect(playingRoot?.getAttribute("data-playing-state")).toBe("arc");
    // Playing-inner subtree is faded out (opacity 0). Tests against
    // the inline style attribute since JSDOM doesn't compute style
    // but does preserve the inline declaration.
    const inner = container.querySelector("[data-h2h-play-inner]") as HTMLElement;
    expect(inner?.style.opacity).toBe("0");
    expect(inner?.style.pointerEvents).toBe("none");
  });

  it("handoff still occurs when resolveRoster throws (falls through to finalRoster)", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
    const props = baseProps({
      resolveRoster: vi.fn(async () => { throw new Error("boom"); }),
    } as any);
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientPlay {...props} challengeCtx={ctx} />
    );
    fireEvent.click(screen.getByText("Deal"));
    await waitFor(
      () => expect(screen.queryByText("Draw")).not.toBeNull(),
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(
      () => expect(container.querySelector("[data-h2h-recipient-reveal]")).not.toBeNull(),
      { timeout: 8000 },
    );
    consoleSpy.mockRestore();
  });
});

// ── 7b. Top-strip sender-face pre-reveal (additive fix) ────────────
//
// The arc's "both lineups face-up, pre-reveal" state requires the top
// strip to show the SENDER'S real cards at pre-reveal scale once the
// column-flip pass exposes them — not a generic "?" placeholder. Tests
// here pin (a) face-down before each column's flip stage, and (b) real
// sender card identity rendered via renderPlayingStripCard at column
// pass end. Path-β assertions on the BOTTOM replacement cells are
// independent of this fix and are covered earlier in the suite.

describe("H2HRecipientPlay — top strip renders sender faces pre-reveal", () => {
  it("at column-pass end, each top cell renders its sender card (Sender-N), NOT the placeholder", async () => {
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={ctx} />
    );
    fireEvent.click(screen.getByText("Deal"));
    await waitFor(() => expect(screen.queryByText("Draw")).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(screen.getByText("Draw"));
    // Walk to column-pass end (last top-strip-up appears).
    await waitFor(
      () => expect(screen.queryByTestId("top-strip-up-5")).not.toBeNull(),
      { timeout: 4000 },
    );
    // Real sender card identities are in the DOM, one per top cell.
    for (let i = 0; i < 6; i++) {
      const topCell = container.querySelector(`[data-h2h-play-top-cell="${i}"]`);
      expect(topCell).not.toBeNull();
      // Sender card identity rendered inside this specific top cell.
      const senderText = topCell?.textContent ?? "";
      expect(senderText).toContain(`Sender-${i}`);
      // Placeholder "?" is NOT in this cell (it's only the fallback).
      expect(senderText.includes("?")).toBe(false);
    }
  });

  it("top cell N is face-DOWN before column N's flip, face-UP after — sender face appears at the flip", async () => {
    // Use fake timers so we can observe specific column boundaries.
    vi.useFakeTimers();
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={ctx} />
    );
    fireEvent.click(screen.getByText("Deal"));
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 8);
    });
    // No holds, tap Draw straight through.
    fireEvent.click(screen.getByText("Draw"));
    // Redraw resolves on a microtask.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // First column kicks off at delay=0 → revealedColumns=1.
    await act(async () => { vi.advanceTimersByTime(0); });
    // Slot 0 has flipped face-up; slot 0 should show Sender-0.
    expect(screen.queryByTestId("top-strip-up-0")).not.toBeNull();
    const topCell0 = container.querySelector(`[data-h2h-play-top-cell="0"]`);
    expect(topCell0?.textContent ?? "").toContain("Sender-0");
    // Slots 1..5 still face-DOWN; their sender names not in DOM yet
    // (front face only mounts when face-up).
    for (let i = 1; i < 6; i++) {
      expect(screen.queryByTestId(`top-strip-back-${i}`)).not.toBeNull();
      const cell = container.querySelector(`[data-h2h-play-top-cell="${i}"]`);
      expect(cell?.textContent ?? "").not.toContain(`Sender-${i}`);
    }
    // Advance through column 1's flip.
    await act(async () => {
      vi.advanceTimersByTime(COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS + 1);
    });
    expect(screen.queryByTestId("top-strip-up-1")).not.toBeNull();
    const topCell1 = container.querySelector(`[data-h2h-play-top-cell="1"]`);
    expect(topCell1?.textContent ?? "").toContain("Sender-1");
    // Slot 2 still face-down at this point.
    expect(screen.queryByTestId("top-strip-back-2")).not.toBeNull();
  });

  it("falls back to the '?' placeholder when resolvedSenderHand is absent", async () => {
    // ctx has NO resolvedSenderHand — top cells should land in their
    // flipped-up state with the placeholder content, not crash.
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />
    );
    fireEvent.click(screen.getByText("Deal"));
    await waitFor(() => expect(screen.queryByText("Draw")).not.toBeNull(), { timeout: 2000 });
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(
      () => expect(screen.queryByTestId("top-strip-up-0")).not.toBeNull(),
      { timeout: 4000 },
    );
    const topCell0 = container.querySelector(`[data-h2h-play-top-cell="0"]`);
    // Placeholder character present; no sender name present.
    expect(topCell0?.textContent ?? "").toContain("?");
    expect(topCell0?.textContent ?? "").not.toContain("Sender-0");
  });
});

// ── 8. Try Again remount → pre_deal (App.tsx h2hPlayKey bump) ───────

describe("H2HRecipientPlay — Try Again remount lands in pre_deal", () => {
  it("re-rendering with a new React key resets to pre_deal", () => {
    const ctx = makeCtx();
    const { container, rerender } = render(
      <H2HRecipientPlay key="A" {...baseProps()} challengeCtx={ctx} />
    );
    fireEvent.click(screen.getByText("Deal"));
    rerender(
      <H2HRecipientPlay key="B" {...baseProps()} challengeCtx={ctx} />
    );
    const root = container.querySelector("[data-h2h-recipient-play]");
    expect(root?.getAttribute("data-playing-state")).toBe("pre_deal");
    expect(screen.getByText("Deal")).toBeTruthy();
  });
});

// ── 9. Anonymous path (P5 — retained from 2b+2c) ───────────────────

describe("H2HRecipientPlay — anonymous path (P5)", () => {
  it("does not render any auth prompt during playing", () => {
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />
    );
    expect(container.querySelector("[data-register-modal]")).toBeNull();
    expect(container.querySelector("[data-h2h-recipient-play]")).not.toBeNull();
  });
});
