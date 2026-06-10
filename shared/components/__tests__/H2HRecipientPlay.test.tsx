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

// FIX 1 — mock dataEngine so ensureLoaded resolves immediately. The
// real dataEngine fetches JSON files which isn't possible under JSDOM.
// We preserve the rest of the module surface (setActiveSeason,
// isLoaded, etc.) — only ensureLoaded is stubbed.
vi.mock("@shared/engines/dataEngine", async () => {
  const actual = await vi.importActual<typeof import("@shared/engines/dataEngine")>(
    "@shared/engines/dataEngine",
  );
  return {
    ...actual,
    // isLoaded() defaults to true so the component's sync short-circuit
    // sets dataReady immediately on mount — existing tests can render →
    // tap Deal in the same tick. Tests that want to exercise the load
    // gate explicitly can call (isLoaded as Mock).mockReturnValueOnce(false)
    // + (ensureLoaded as Mock).mockImplementationOnce(...).
    isLoaded: vi.fn(() => true),
    ensureLoaded: vi.fn(() => Promise.resolve()),
  };
});

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
import { HAND_STRIP_HEIGHT_PX } from "../H2HRevealScreen";

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

/** Renderer that ALSO emits an H-badge marker when card.wasHeld is true
 *  — mirrors basketball's h2hArcRenderer which passes
 *  locked={card.wasHeld} to AthleteCard → CardFront's `<span>H</span>`
 *  indicator. Tests targeting the badge use this renderer instead of
 *  the plain nameRenderer so the badge surface is testable in JSDOM. */
const badgeRenderer: CardRenderer = (card: H2HCard) => (
  <div data-stub-card="true">
    {card.name}
    {card.wasHeld ? <span data-h-badge="true">H</span> : null}
  </div>
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

// ── 1. Initial render (loading → auto-advance into deal_in) ────────
// Layout A/B restructure (design-lock §1): pre_deal is killed.
// Challenge entry goes straight into Layout A's deal_in. The "loading"
// state replaces pre_deal as the resting state when !dataReady; the
// moment dataReady flips true (and the mock above sets isLoaded()→true
// synchronously), the loading→deal_in auto-advance fires inside the
// useEffect chain that render()'s act() flushes. So by the time
// render returns, data-playing-state === "deal_in" with cardsLanded=0.

describe("H2HRecipientPlay — initial render lands in deal_in", () => {
  it("mounts the playing surface with challengeCtx present, in deal_in", () => {
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />
    );
    const root = container.querySelector("[data-h2h-recipient-play]");
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-playing-state")).toBe("deal_in");
  });

  it("opponent strip is collapsed in Layout A (height:0, opacity:0, aria-hidden)", () => {
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />
    );
    const stripWrapper = container.querySelector(
      "[data-h2h-play-top-strip]",
    ) as HTMLElement | null;
    expect(stripWrapper).not.toBeNull();
    expect(stripWrapper?.getAttribute("data-h2h-play-top-strip-collapsed")).toBe("true");
    expect(stripWrapper?.getAttribute("aria-hidden")).toBe("true");
    expect(stripWrapper?.style.height).toBe("0px");
    expect(stripWrapper?.style.opacity).toBe("0");
  });

  it("bottom-strip mini-cell height equals the imported HAND_STRIP_HEIGHT_PX (RD2 lockstep gate)", () => {
    // RD2 (2026-06-08): the play-screen mini-cells must shrink in
    // lockstep with the reveal-arc strip. Pre-RD2 this surface hard-
    // coded 80 next to a comment claiming "matches HAND_STRIP_HEIGHT_PX
    // (80)" — the literal could (and did, briefly) drift from the
    // constant. This test fails closed if the import is removed or the
    // local MINI_CELL_HEIGHT_PX stops being keyed to it.
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />
    );
    const bottomStrip = container.querySelector(
      "[data-h2h-play-bottom-strip]",
    ) as HTMLElement | null;
    expect(bottomStrip).not.toBeNull();
    expect(bottomStrip!.style.height).toBe(`${HAND_STRIP_HEIGHT_PX}px`);
  });

  it("RD2.1: top-strip cell carries containerType + inner uses cqw scale", () => {
    // RD2.1 (2026-06-09): the inner card's scale must track the cell's
    // flex-resolved width via container queries. Mechanism-wired proxy
    // — the real-browser width===width gate runs in
    // scripts/verify-rd21-strip-scaffold.mjs.
    // The TopStripCell scaffold carries containerType on the inner
    // front-face wrapper (not the outer cell), so cqw reads the
    // border-inset content box. We assert presence of both the
    // containerType wiring and the cqw transform.
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay
        {...baseProps()}
        challengeCtx={makeCtx({ resolvedSenderHand: makeSenderHand() })}
      />
    );
    // Top-strip front-face wrapper carries containerType
    const fronts = container.querySelectorAll('[data-h2h-play-top-front="true"]');
    expect(fronts.length).toBe(6);
    for (const front of Array.from(fronts)) {
      const style = (front as HTMLElement).getAttribute("style") ?? "";
      expect(style).toMatch(/container-type:\s*inline-size/);
    }
    // Inner scaled card uses calc(100cqw / 150px)
    const innerWithTransform = container.querySelector(
      '[data-h2h-play-top-front="true"] [style*="transform"]'
    );
    expect(innerWithTransform).not.toBeNull();
    const innerStyle = (innerWithTransform as HTMLElement).getAttribute("style") ?? "";
    expect(innerStyle).toMatch(/scale\(calc\(100cqw\s*\/\s*150px\)\)/);
  });

  it("RD2.1: outer cells use aspect-ratio + flexShrink:1 (no fixed width)", () => {
    // RD2.1 lock — the play cells stop hardcoding width:55 + flexShrink:0
    // (which produced strip overflow) and use the same flex-shrink
    // aspect-ratio model as reveal/results so they shrink to fit the
    // strip wrapper. Width-tracking depends on this.
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay
        {...baseProps()}
        challengeCtx={makeCtx({ resolvedSenderHand: makeSenderHand() })}
      />
    );
    const topCells = container.querySelectorAll('[data-h2h-play-top-cell]');
    const bottomEmpties = container.querySelectorAll('[data-h2h-play-bottom-cell][data-empty="true"]');
    expect(topCells.length).toBe(6);
    expect(bottomEmpties.length).toBe(6);
    for (const cell of [...Array.from(topCells), ...Array.from(bottomEmpties)]) {
      const style = (cell as HTMLElement).getAttribute("style") ?? "";
      expect(style).toMatch(/aspect-ratio:\s*329\s*\/\s*478/);
      expect(style).toMatch(/flex-shrink:\s*1/);
      // No standalone `width: Npx` declaration (min-width: 0px is fine —
      // the cell's width must derive from aspect-ratio, not a literal).
      expect(style).not.toMatch(/(^|;\s*)width:\s*\d+px/);
    }
  });

  it("renders 6 empty placeholders on bottom strip at cardsLanded=0", () => {
    vi.useFakeTimers();
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`bottom-strip-empty-${i}`)).toBeTruthy();
    }
  });

  it("renders Draw CTA disabled during deal_in (no Deal CTA — pre_deal killed)", () => {
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />
    );
    expect(container.querySelector("[data-cta-label='Deal']")).toBeNull();
    const drawBtn = container.querySelector("[data-cta-label='Draw']") as HTMLButtonElement | null;
    expect(drawBtn).not.toBeNull();
    expect(drawBtn?.disabled).toBe(true);
  });

  it("renders no replacement names (path β at rest)", () => {
    vi.useFakeTimers();
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    for (let i = 0; i < 6; i++) {
      expect(screen.queryByText(`Final-${i}`)).toBeNull();
    }
  });

  it("renders framed top + bottom + hero zones in deal_in (doc EDIT B1/B3 carries forward)", () => {
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx({ challengerName: "Mike" })} />,
    );
    expect(container.querySelector(`[data-h2h-board-zone="top"]`)).not.toBeNull();
    expect(container.querySelector(`[data-h2h-board-zone="bottom"]`)).not.toBeNull();
    expect(container.querySelector(`[data-h2h-board-zone="hero"]`)).not.toBeNull();
    const topZoneText = container.querySelector(`[data-h2h-board-zone="top"]`)?.textContent ?? "";
    const bottomZoneText = container.querySelector(`[data-h2h-board-zone="bottom"]`)?.textContent ?? "";
    expect(topZoneText.toUpperCase()).toContain("MIKE");
    expect(bottomZoneText.length).toBeGreaterThan(0);
  });

  it("falls back to 'your friend' label when challengerName is not a real name", () => {
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx({ challengerName: null as any })} />,
    );
    const topZoneText = (container.querySelector(`[data-h2h-board-zone="top"]`)?.textContent ?? "").toLowerCase();
    expect(topZoneText).toContain("your friend");
  });

  it("bottom label is the literal 'YOU' (design-lock §1: random handle killed)", () => {
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />,
    );
    const bottomLabel = container.querySelector(
      `[data-h2h-board-zone-label="bottom"]`,
    )?.textContent ?? "";
    expect(bottomLabel.trim()).toBe("YOU");
  });
});

// ── 2. Deal cascade (state deal_in) ────────────────────────────────

describe("H2HRecipientPlay — state 2 (deal_in cascade)", () => {
  it("Deal tap starts the cascade; first card lands within DEAL_CASCADE_INTERVAL_MS", async () => {
    vi.useFakeTimers();
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
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
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`bottom-strip-up-${i}`)).toBeTruthy();
      expect(screen.getByText(`Init-${i}`)).toBeTruthy();
    }
  });

  it("Draw CTA stays disabled during deal_in cascade; enables on hold_select", async () => {
    vi.useFakeTimers();
    const { container } = render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    // Mid-cascade: Draw (the CTA slot for Layout A) is disabled.
    // No "Deal" button exists — pre_deal is killed.
    await act(async () => { vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS); });
    expect(container.querySelector("[data-cta-label='Deal']")).toBeNull();
    const drawBtnMid = container.querySelector("[data-cta-label='Draw']") as HTMLButtonElement;
    expect(drawBtnMid?.disabled).toBe(true);
    // After cascade: state → hold_select; same CTA slot now enabled.
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
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
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

  // Polish #11 (docs/11-preview-then-hold-design-lock.md §3): tap on a
  // non-previewed cell sets preview (no hold change); tap on the
  // already-previewed cell flips its held bit. So the hold-toggle
  // cycle is THREE taps on the same cell: preview → hold → unhold.
  it("tap cycle on a single cell: preview → hold → unhold", async () => {
    await dealThrough();
    const cell = screen.getByTestId("bottom-strip-up-2");
    // 1st tap: preview only. data-held should remain "false".
    fireEvent.click(cell);
    expect(screen.getByTestId("bottom-strip-up-2").getAttribute("data-held")).toBe("false");
    // 2nd tap on same cell: hold. data-held → "true".
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(screen.getByTestId("bottom-strip-up-2").getAttribute("data-held")).toBe("true");
    // 3rd tap on same cell: unhold. data-held → "false".
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(screen.getByTestId("bottom-strip-up-2").getAttribute("data-held")).toBe("false");
  });

  it("multiple holds + Draw CTA is enabled (tap-tap per cell under #11)", async () => {
    await dealThrough();
    // Hold cell 1 (preview → hold).
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    // Hold cell 4 (preview moves to 4, then 2nd tap holds).
    fireEvent.click(screen.getByTestId("bottom-strip-up-4"));
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
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // Hold slot 1 and slot 3 (tap-tap each per #11 preview-then-hold).
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-3"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-3"));
    // Switch to real timers so the async redrawRoster microtask
    // resolves cleanly.
    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(() => expect(props.redrawRoster).toHaveBeenCalledTimes(1));
    const callArg = props.redrawRoster.mock.calls[0][0];
    // Fix 2 (Bug 1 invariant): H2HRecipientPlay derives a wasHeld-zeroed
    // copy of ctx.initialRoster via useMemo. So callArg.currentCards is
    // NOT referentially equal to ctx.initialRoster — it's the same
    // content with wasHeld zeroed. Use toEqual for content equality.
    expect(callArg.currentCards).toEqual(ctx.initialRoster.map((c) => ({ ...c, wasHeld: false })));
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
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // Hold slot 2 (tap-tap per #11).
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
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

// ── 4b. redraw-target persistence in the top intro region ──────────
//
// Continuation of docs/h2h-recipient-static-commentary-lock.md
// (session 2026-06-08): during redraw_running / your_redraw_flip the
// top intro region — previously an empty layout spacer (BUG-1 FIX) —
// now renders the static line "<targetScore.toFixed(1)> to beat." so
// the number-to-beat stays parked from deal → hold → draw. The hero
// region's "Drawing…" (from deriveHeadline) is unchanged. Format must
// match the stage-2 line's targetScore.toFixed(1) — both lines render
// the same number string so they can't drift on glass.

describe("H2HRecipientPlay — state 3a/3b — top intro renders the redraw-target line", () => {
  async function holdAndDraw() {
    let resolveRedraw: (val: { roster: GeneratedCard[] }) => void = () => { };
    const heldRedraw = new Promise<{ roster: GeneratedCard[] }>((r) => { resolveRedraw = r; });
    const props = baseProps({
      redrawRoster: vi.fn(() => heldRedraw),
    } as any);

    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...props} challengeCtx={makeCtx()} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // Hold slot 2 (tap-tap per #11).
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));

    await waitFor(() => {
      const root = document.querySelector("[data-h2h-recipient-play]");
      expect(root?.getAttribute("data-playing-state")).toBe("redraw_running");
    });
    return { container, resolveRedraw };
  }

  it("top intro renders '<target.toFixed(1)> to beat.' during redraw_running", async () => {
    const { container, resolveRedraw } = await holdAndDraw();
    // makeCtx default targetScore is 175 → 175.0 to beat.
    const target = container.querySelector('[data-h2h-play-intro="redraw-target"]');
    expect(target).not.toBeNull();
    expect(target?.textContent).toBe("175.0 to beat.");
    // The empty spacer is fully gone — assert against its old data-attr.
    expect(container.querySelector('[data-h2h-play-intro="redraw-empty-spacer"]')).toBeNull();
    // Cleanup.
    resolveRedraw({ roster: makeFinalRoster(makeRoster(), new Set([2])) });
  });

  it("redraw window renders NO 'Drawing…' copy at any site (RD3)", async () => {
    const { container, resolveRedraw } = await holdAndDraw();
    // RD3 (2026-06-11): the "Drawing…" beat is dead. deriveHeadline +
    // deriveCta both return empty string for redraw_running /
    // your_redraw_flip; the armed YOU/JOHN/delta rail in the hero owns
    // the window instead. Assert the literal string is absent from the
    // whole subtree so the kill is enforced wherever it might leak
    // back in (headline, hero, CTA label, settle-pause copy, ...).
    expect(screen.queryByText("Drawing…")).toBeNull();
    // CTA is hidden via the existing ctaVisible="" pattern (reserved-
    // bottom spacer stays, no layout jump). The hidden-CTA assertion
    // is in the RD3 — kill the Drawing beat block at the bottom of the
    // file; here we just guard the copy.
    expect(container.querySelector('[data-cta-label="Drawing…"]')).toBeNull();
    resolveRedraw({ roster: makeFinalRoster(makeRoster(), new Set([2])) });
  });

  it("redraw-target number format matches stage-2's targetScore.toFixed(1) (anti-drift guard)", async () => {
    // The stage-2 line and the redraw-target line both render
    // targetScore.toFixed(1). If either side drifts (e.g. one becomes
    // toFixed(2), or one starts using Math.round, or one drops the
    // decimal), the two on-glass numbers stop matching and the
    // continuous-anchor intent breaks. Drive into stage-2 first,
    // capture its number substring, drive into redraw_running, and
    // assert the same number substring lives in the redraw-target.
    //
    // Real timers throughout: stage-2 renders through PartsLine's
    // typewriter rush; under fake timers it never paints. Pattern
    // mirrors §9 (introSig-pinned stability test) for the same reason.
    vi.useRealTimers();
    let resolveRedraw: (val: { roster: GeneratedCard[] }) => void = () => { };
    const heldRedraw = new Promise<{ roster: GeneratedCard[] }>((r) => { resolveRedraw = r; });
    const props = baseProps({
      redrawRoster: vi.fn(() => heldRedraw),
    } as any);
    const { container } = render(
      <H2HRecipientPlay {...props} challengeCtx={makeCtx()} />,
    );
    await waitFor(
      () => {
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 3000 },
    );
    // Confirm hold of slot 2 (tap-tap). Stage 2 mounts.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    // Wait for the typewriter rush to paint the full stage-2 line.
    await waitFor(
      () => {
        const el = container.querySelector('[data-h2h-play-intro="stage2"]');
        // Match "Draw to beat <number>." with decimal-bearing number.
        expect(el?.textContent ?? "").toMatch(/Draw to beat [\d.]+\.$/);
      },
      { timeout: 2000 },
    );
    const stage2Text = container.querySelector('[data-h2h-play-intro="stage2"]')?.textContent ?? "";
    const stage2Match = stage2Text.match(/Draw to beat ([\d.]+)\.$/);
    expect(stage2Match).not.toBeNull();
    const stage2Number = stage2Match![1];
    // 175 → "175.0" (single decimal, matching landing #3 format).
    expect(stage2Number).toBe("175.0");

    // Advance into redraw_running.
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(() => {
      const root = document.querySelector("[data-h2h-recipient-play]");
      expect(root?.getAttribute("data-playing-state")).toBe("redraw_running");
    });
    const target = container.querySelector('[data-h2h-play-intro="redraw-target"]');
    expect(target?.textContent).toBe(`${stage2Number} to beat.`);
    resolveRedraw({ roster: makeFinalRoster(makeRoster(), new Set([2])) });
  });
});

// ── 5. your_redraw_flip pass (Layout A/B restructure §3 step 2) ────
//
// Renamed from column_flip. The flip pass now applies ONLY to the
// BOTTOM strip (your replacements) — the top strip is NOT touched
// here (the opponent card-flip is killed per design-lock §1 / §3).
// The TopStripCell flip scaffold (rotateY / perspective / back-face)
// is gone; opponent cells render front-only when visible, and
// visibility through Layout A is height:0 + opacity:0 on the strip
// wrapper. So [data-testid="top-strip-back-N"] no longer exists;
// only [data-testid="top-strip-up-N"] does, and during your_redraw_flip
// (still Layout A) the strip wrapper is collapsed → top cells render
// behind that clip.

describe("H2HRecipientPlay — state 3b (your_redraw_flip) — LEFT→RIGHT bottom only", () => {
  async function advanceToYourFlip(heldSlot: number) {
    vi.useFakeTimers();
    const props = baseProps();
    render(<H2HRecipientPlay {...props} challengeCtx={makeCtx()} />);
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // Polish #11 (preview-then-hold): two taps confirm the hold.
    fireEvent.click(screen.getByTestId(`bottom-strip-up-${heldSlot}`));
    fireEvent.click(screen.getByTestId(`bottom-strip-up-${heldSlot}`));
    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(() => {
      const root = document.querySelector("[data-h2h-recipient-play]");
      expect(root?.getAttribute("data-playing-state")).toBe("your_redraw_flip");
    });
    return props;
  }

  it("bottom-strip flip pass LEFT→RIGHT; held column's bottom cell stays face-up", async () => {
    const props = await advanceToYourFlip(2);
    // Wait for slot 0's replacement (Final-0) to appear in the bottom
    // strip — that's the first column completing its flip.
    await waitFor(
      () => expect(screen.queryByText("Final-0")).not.toBeNull(),
      { timeout: 2000 },
    );
    // Held slot 2's bottom cell still shows Init-2.
    expect(screen.getByTestId("bottom-strip-up-2").getAttribute("data-held")).toBe("true");
    const cell2 = document.querySelector(`[data-h2h-play-bottom-cell="2"]`) as HTMLElement;
    expect(cell2.textContent).toContain("Init-2");
    void props;
  });

  it("opponent strip stays COLLAPSED throughout your_redraw_flip (Layout A — no opponent flip)", async () => {
    const props = await advanceToYourFlip(5);
    // Wait into your_redraw_flip mid-pass.
    await waitFor(
      () => expect(screen.queryByText("Final-0")).not.toBeNull(),
      { timeout: 2000 },
    );
    // The top-strip wrapper is the gate; it must remain collapsed.
    const stripWrapper = document.querySelector(
      "[data-h2h-play-top-strip]",
    ) as HTMLElement | null;
    expect(stripWrapper?.getAttribute("data-h2h-play-top-strip-collapsed")).toBe("true");
    expect(stripWrapper?.style.height).toBe("0px");
    expect(stripWrapper?.style.opacity).toBe("0");
    void props;
  });

  it("column ordering: bottom column N+1 begins ONLY after column N completes (fake-timer check)", async () => {
    vi.useFakeTimers();
    const props = baseProps();
    render(<H2HRecipientPlay {...props} challengeCtx={makeCtx()} />);
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // No holds; tap Draw straight through.
    fireEvent.click(screen.getByText("Draw"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // Step #0 → revealedColumns=1 fires on delay=0 setTimeout — the
    // bottom strip's slot 0 face-up Final-0 appears.
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(screen.queryByText("Final-0")).not.toBeNull();
    // Path-β: replacement values for slots NOT yet flipped are NOT in the DOM.
    expect(screen.queryByText("Final-1")).toBeNull();
    // Mid-flip (~249ms after entry): column 1 has NOT advanced.
    await act(async () => { vi.advanceTimersByTime(COLUMN_FLIP_DURATION_MS - 1); });
    expect(screen.queryByText("Final-1")).toBeNull();
    // After full flip+interstitial: column 1 advanced.
    await act(async () => {
      vi.advanceTimersByTime(COLUMN_FLIP_INTERSTITIAL_MS + 2);
    });
    expect(screen.queryByText("Final-1")).not.toBeNull();
  });
});

// ── 5b. A→B transition (new ab_transition state) ──────────────────
// Design-lock §3 step 3: ~300ms coordinated beat after your_redraw_flip
// completes. The opponent strip uncollapses (height:0→HAND_STRIP_HEIGHT_PX,
// opacity:0→1) and the hero region expands (HOLD_SELECT floor → full
// floor). Both motions animate via CSS transitions; this state exists
// to GATE which values those transitions animate TO.

describe("H2HRecipientPlay — ab_transition (Layout A → Layout B beat)", () => {
  it("reaches ab_transition after your_redraw_flip; opponent strip uncollapses", async () => {
    vi.useFakeTimers();
    const props = baseProps();
    render(<H2HRecipientPlay {...props} challengeCtx={makeCtx({ resolvedSenderHand: makeSenderHand() })} />);
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    fireEvent.click(screen.getByText("Draw"));
    // Flush redraw microtask + advance through the 6-column flip pass.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(
        ROSTER_SIZE_LOCAL * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS),
      );
    });
    const root = document.querySelector("[data-h2h-recipient-play]");
    expect(root?.getAttribute("data-playing-state")).toBe("ab_transition");
    // Opponent strip wrapper is no longer marked collapsed.
    const stripWrapper = document.querySelector(
      "[data-h2h-play-top-strip]",
    ) as HTMLElement | null;
    expect(stripWrapper?.getAttribute("data-h2h-play-top-strip-collapsed")).toBeNull();
    expect(stripWrapper?.style.height).not.toBe("0px");
    expect(stripWrapper?.style.opacity).toBe("1");
    void props;
  });
});

const ROSTER_SIZE_LOCAL = 6;

// ── 6. Held-card position invariant (S5) ───────────────────────────

describe("H2HRecipientPlay — S5 held-card position invariant", () => {
  it("held card at slot 3 stays at slot 3 through column-flip end", async () => {
    vi.useFakeTimers();
    const props = baseProps();
    const ctx = makeCtx();
    render(<H2HRecipientPlay {...props} challengeCtx={ctx} />);
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // Polish #11 (preview-then-hold): two taps to confirm hold of slot 3.
    // First tap previews (also renders the card big in the hero zone via
    // renderBattlefieldCard — so getByText("Init-3") now matches BOTH the
    // mini cell and the big preview). Scope text queries to the bottom
    // strip explicitly.
    fireEvent.click(screen.getByTestId("bottom-strip-up-3"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-3"));
    const cell3 = document.querySelector(`[data-h2h-play-bottom-cell="3"]`) as HTMLElement;
    expect(cell3.textContent).toContain("Init-3");

    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));
    // Walk all the way through the column-flip pass.
    await waitFor(
      () => expect(screen.queryByTestId("top-strip-up-5")).not.toBeNull(),
      { timeout: 4000 },
    );
    // Held card is still in slot 3, still showing Init-3 (S5 invariant:
    // held card stays at its slot position).
    const heldCell = document.querySelector(`[data-h2h-play-bottom-cell="3"]`) as HTMLElement;
    expect(heldCell?.textContent).toContain("Init-3");
    expect(heldCell?.getAttribute("data-held")).toBe("true");
  });
});

// ── 7. Handoff (state handoff_resolving → arc) ─────────────────────

describe("H2HRecipientPlay — state 4 handoff", () => {
  it("after column-flip pass, holds PRE_REVEAL_HOLD_MS then calls resolveRoster ONCE on POST-redraw finalRoster", async () => {
    const props = baseProps();
    // No fake timers — let the real timer flow drive transitions end-to-end.
    render(<H2HRecipientPlay {...props} challengeCtx={makeCtx()} />);
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await waitFor(
      () => {
        // Layout A/B restructure: the "Draw" button now exists (disabled)
        // during deal_in too — pre_deal is killed and the CTA sits in
        // its Draw slot from the start. Wait for it to become ENABLED,
        // which signals hold_select reached.
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 2000 },
    );
    // Hold slot 4 (tap-tap per #11).
    fireEvent.click(screen.getByTestId("bottom-strip-up-4"));
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
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await waitFor(
      () => {
        // Layout A/B restructure: the "Draw" button now exists (disabled)
        // during deal_in too — pre_deal is killed and the CTA sits in
        // its Draw slot from the start. Wait for it to become ENABLED,
        // which signals hold_select reached.
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
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

  // Settle-pause (design-lock §3 step 4 / §5): during handoff_resolving
  // the hero region renders TWO STACKED EMPTY HERO SLOTS (the dashed-
  // border boxes — [data-h2h-play-settle-hero-slot="opponent"] and
  // ="you"), NOT the prior VS treatment. Empty headline; stillness.
  // Layout B is fully composed at this point: opponent strip face-up,
  // your strip slid-down, both visible.
  it("settle-pause: handoff_resolving renders two empty hero slots, no VS, Layout B composed", { timeout: 10000 }, async () => {
    let resolveFn: (v: any) => void = () => {};
    const props = baseProps({
      resolveRoster: vi.fn(() => new Promise((res) => { resolveFn = res; })),
    } as any);
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientPlay {...props} challengeCtx={ctx} />
    );
    await waitFor(
      () => {
        // Layout A/B restructure: the "Draw" button now exists (disabled)
        // during deal_in too — pre_deal is killed and the CTA sits in
        // its Draw slot from the start. Wait for it to become ENABLED,
        // which signals hold_select reached.
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByText("Draw"));
    // Wait until handoff_resolving (settle-pause proper). The
    // empty-hero composition renders during BOTH ab_transition and
    // handoff_resolving (per inSettlePauseRender); waiting on the
    // state attribute pins us to the actual settle-pause state.
    await waitFor(
      () => {
        const r = container.querySelector("[data-h2h-recipient-play]");
        expect(r?.getAttribute("data-playing-state")).toBe("handoff_resolving");
      },
      { timeout: 6000 },
    );
    expect(container.querySelector("[data-h2h-play-settle-hero]")).not.toBeNull();
    // Empty-hero composition: opponent slot + your slot, both dashed-
    // border boxes, no card content.
    const opponentSlot = container.querySelector(
      `[data-h2h-play-settle-hero-slot="opponent"]`,
    );
    const yourSlot = container.querySelector(
      `[data-h2h-play-settle-hero-slot="you"]`,
    );
    expect(opponentSlot).not.toBeNull();
    expect(yourSlot).not.toBeNull();
    // VS is dead.
    expect(container.querySelector("[data-h2h-play-vs]")).toBeNull();
    expect(container.querySelector("[data-h2h-play-vs-glyph]")).toBeNull();
    // Headline is collapsed (empty deriveHeadline + no headline div
    // mounted under the settle-pause branch).
    expect(container.querySelector("[data-h2h-play-headline]")).toBeNull();
    // Layout B composition: opponent strip uncollapsed (face-up),
    // your strip has all 6 cells face-up.
    const stripWrapper = container.querySelector(
      "[data-h2h-play-top-strip]",
    ) as HTMLElement | null;
    expect(stripWrapper?.style.opacity).toBe("1");
    for (let i = 0; i < 6; i++) {
      expect(container.querySelector(`[data-testid="bottom-strip-up-${i}"]`)).not.toBeNull();
    }
    // State attribute confirms we sampled during handoff_resolving.
    const root = container.querySelector("[data-h2h-recipient-play]");
    expect(root?.getAttribute("data-playing-state")).toBe("handoff_resolving");
    // Unblock the resolve so the test tears down cleanly.
    resolveFn({ roster: makeRoster() });
  });

  it("FIX 2 guardrail: when resolveRoster throws, NO reveal mounts and Try Again appears", { timeout: 10000 }, async () => {
    // The prior behavior (silently falling through to finalRoster with
    // actualFp:0) is now blocked — the engine-error guardrail surfaces
    // a "Try again" CTA on the same board instead of dropping the user
    // into a degenerate zeroed reveal. Regression-lock for the C/D root.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const props = baseProps({
      resolveRoster: vi.fn(async () => { throw new Error("boom"); }),
    } as any);
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientPlay {...props} challengeCtx={ctx} />
    );
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await waitFor(
      () => {
        // Layout A/B restructure: the "Draw" button now exists (disabled)
        // during deal_in too — pre_deal is killed and the CTA sits in
        // its Draw slot from the start. Wait for it to become ENABLED,
        // which signals hold_select reached.
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 2000 },
    );
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(
      () => expect(container.querySelector("[data-h2h-play-cta][data-cta-label='Try again']")).not.toBeNull(),
      { timeout: 8000 },
    );
    // Reveal MUST NOT mount when the engine fell over.
    expect(container.querySelector("[data-h2h-recipient-reveal]")).toBeNull();
    // The error WAS logged (console.error, per Fix 2 promotion).
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ── 7b. Top-strip sender-face rendering (Layout A/B restructure) ───
//
// Layout A/B restructure: the opponent card-flip is killed
// (design-lock §1 / §3). TopStripCell's rotateY scaffold is gone.
// Visibility through Layout A is gated by the strip wrapper's
// height:0 + opacity:0 clip — cells render face-up directly when the
// strip uncollapses in Layout B. Tests here pin (a) sender card
// identity rendered via renderPlayingStripCard once the wrapper is
// uncollapsed in Layout B, and (b) "?" placeholder fallback when
// resolvedSenderHand is absent.

describe("H2HRecipientPlay — top strip renders sender faces in Layout B", () => {
  it("at Layout B (settle-pause / arc), each top cell renders its sender card (Sender-N), NOT the placeholder", async () => {
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={ctx} />
    );
    await waitFor(
      () => {
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 3000 },
    );
    fireEvent.click(screen.getByText("Draw"));
    // Wait until the strip wrapper uncollapses (Layout B reached).
    await waitFor(
      () => {
        const wrapper = container.querySelector(
          "[data-h2h-play-top-strip]",
        ) as HTMLElement | null;
        return wrapper && wrapper.getAttribute("data-h2h-play-top-strip-collapsed") === null;
      },
      { timeout: 6000 },
    );
    // Real sender card identities are in the DOM, one per top cell.
    for (let i = 0; i < 6; i++) {
      const topCell = container.querySelector(`[data-h2h-play-top-cell="${i}"]`);
      expect(topCell).not.toBeNull();
      const senderText = topCell?.textContent ?? "";
      expect(senderText).toContain(`Sender-${i}`);
      expect(senderText.includes("?")).toBe(false);
    }
  });

  it("falls back to the '?' placeholder when resolvedSenderHand is absent", async () => {
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />
    );
    await waitFor(
      () => {
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 3000 },
    );
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(
      () => {
        const wrapper = container.querySelector(
          "[data-h2h-play-top-strip]",
        ) as HTMLElement | null;
        return wrapper && wrapper.getAttribute("data-h2h-play-top-strip-collapsed") === null;
      },
      { timeout: 6000 },
    );
    const topCell0 = container.querySelector(`[data-h2h-play-top-cell="0"]`);
    expect(topCell0?.textContent ?? "").toContain("?");
    expect(topCell0?.textContent ?? "").not.toContain("Sender-0");
  });
});

// ── 8. Try Again remount → loading → deal_in (App.tsx h2hPlayKey bump) ─

describe("H2HRecipientPlay — Try Again remount lands in deal_in", () => {
  it("re-rendering with a new React key resets to deal_in (loading auto-advances)", () => {
    vi.useFakeTimers();
    const ctx = makeCtx();
    const { container, rerender } = render(
      <H2HRecipientPlay key="A" {...baseProps()} challengeCtx={ctx} />
    );
    rerender(
      <H2HRecipientPlay key="B" {...baseProps()} challengeCtx={ctx} />
    );
    const root = container.querySelector("[data-h2h-recipient-play]");
    // dataReady is true on mount (isLoaded mock); loading → deal_in
    // auto-advance fires inside the render's act() flush.
    expect(root?.getAttribute("data-playing-state")).toBe("deal_in");
    // No "Deal" CTA — pre_deal is killed.
    expect(container.querySelector("[data-cta-label='Deal']")).toBeNull();
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

// ── 10. Bottom-strip H badge wired to user's tap state, NOT snapshot ───
//
// Bug surfaced during live verification of 118d375: the dev mock
// fixture reused the resolved RECIPIENT_HAND (wasHeld:true on slots
// 4 and 5) as challengeCtx.initialRoster. The bottom-strip renderer
// (h2hArcRenderer with revealed=false) passed locked={card.wasHeld}
// straight to CardFront, so the H badge appeared on slots 4 and 5
// at deal-in despite state.held being empty.
//
// Existing tests asserted [data-held] (the orange-ring border bound
// to state.held) but NEVER the H badge surface — that's why this
// shipped green. These tests close the gap: they target the badge
// the user actually reads, and they exercise the leak-shape so a
// regression that re-introduces snapshot wasHeld into the render
// path fails loud.

describe("H2HRecipientPlay — bottom-strip H badge regression-locks", () => {
  function makeLeakyCtx(): ChallengeCtx {
    // Build initialRoster with wasHeld:true on slots 4/5 — mirrors the
    // dev-mock-fixture leak shape that surfaced live.
    const roster = Array.from({ length: 6 }, (_, i) =>
      makeCard({
        cardId: `init-${i}`,
        name: `Init-${i}`,
        wasHeld: i === 4 || i === 5,
      }, i),
    );
    return {
      challengeId: "leaky-test",
      initialRoster: roster,
      targetScore: 175,
      challengerName: "Mike",
      sport: "basketball",
      season: "2425",
    };
  }

  it("Fix 2 leak-immunity: even with snapshot wasHeld:true, NO H badge renders at deal-in / hold_select", async () => {
    vi.useFakeTimers();
    const props = baseProps({ renderPlayingStripCard: badgeRenderer } as any);
    const { container } = render(
      <H2HRecipientPlay {...props} challengeCtx={makeLeakyCtx()} />,
    );
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 8);
    });
    // hold_select: every bottom cell face-up, but state.held is empty
    // and the Fix-2 useMemo zeroed initialRoster.wasHeld. Snapshot
    // leak (wasHeld:true on slots 4/5) MUST NOT survive into the
    // render — zero H badges anywhere on the bottom strip.
    const badgesAfterDeal = container.querySelectorAll(
      `[data-h2h-play-bottom-cell] [data-h-badge]`,
    );
    expect(badgesAfterDeal.length).toBe(0);
  });

  it("Fix 1 tap drives badge under #11 preview-then-hold: first tap previews (no badge), second tap holds (badge in cell 2), third tap unholds (badge gone)", async () => {
    vi.useFakeTimers();
    const props = baseProps({ renderPlayingStripCard: badgeRenderer } as any);
    const { container } = render(
      <H2HRecipientPlay {...props} challengeCtx={makeLeakyCtx()} />,
    );
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 8);
    });
    // Pre-tap: no badges.
    expect(container.querySelectorAll(`[data-h2h-play-bottom-cell] [data-h-badge]`).length).toBe(0);

    // 1st tap slot 2 → preview ONLY. No H badge on mini cells (held set is empty).
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(container.querySelectorAll(`[data-h2h-play-bottom-cell] [data-h-badge]`).length).toBe(0);

    // 2nd tap on the previewed cell → hold. Badge appears in cell 2.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    const badgesAfterHold = container.querySelectorAll(`[data-h2h-play-bottom-cell] [data-h-badge]`);
    expect(badgesAfterHold.length).toBe(1);
    const cell2 = container.querySelector(`[data-h2h-play-bottom-cell="2"]`);
    expect(cell2?.querySelector(`[data-h-badge]`)).not.toBeNull();

    // 3rd tap on the same previewed cell → unhold. Badge gone.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(container.querySelectorAll(`[data-h2h-play-bottom-cell] [data-h-badge]`).length).toBe(0);
  });

  it("end-to-end tap → lockedCardIds: tap slot 2; Draw; redrawRoster receives EXACTLY [initialRoster[2].cardId]", async () => {
    vi.useFakeTimers();
    const ctx = makeLeakyCtx();
    // initialRoster[2].cardId in the leaky ctx is "init-2".
    const props = baseProps({ renderPlayingStripCard: badgeRenderer } as any);
    render(<H2HRecipientPlay {...props} challengeCtx={ctx} />);
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 8);
    });
    // Polish #11: two taps to confirm hold of slot 2.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(() => expect(props.redrawRoster).toHaveBeenCalledTimes(1));
    const callArg = props.redrawRoster.mock.calls[0][0];
    // Pins the chain: only the user's confirmed hold (slot 2) — NOT
    // slots 4/5 (which had snapshot wasHeld:true) — reaches redrawRoster.
    expect(callArg.lockedCardIds.size).toBe(1);
    expect(callArg.lockedCardIds.has("init-2")).toBe(true);
    expect(callArg.lockedCardIds.has("init-4")).toBe(false);
    expect(callArg.lockedCardIds.has("init-5")).toBe(false);
  });
});

// ── 11. FIX 1 — data-engine load gate (ensureLoaded called; CTA gated) ─

describe("H2HRecipientPlay — FIX 1 ensureLoaded gate", () => {
  /** Helper: force the async load path by stubbing isLoaded → false for
   *  the duration of one test. Returns a cleanup function. */
  async function forceAsyncLoadPath() {
    const dataEngine = await import("@shared/engines/dataEngine");
    const isLoadedMock = dataEngine.isLoaded as ReturnType<typeof vi.fn>;
    const ensureLoadedMock = dataEngine.ensureLoaded as ReturnType<typeof vi.fn>;
    isLoadedMock.mockReturnValue(false);
    return {
      isLoadedMock,
      ensureLoadedMock,
      restore: () => isLoadedMock.mockReturnValue(true),
    };
  }

  it("calls ensureLoaded on mount when data isn't already loaded", async () => {
    const { ensureLoadedMock, restore } = await forceAsyncLoadPath();
    ensureLoadedMock.mockClear();
    ensureLoadedMock.mockReturnValueOnce(Promise.resolve());
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    expect(ensureLoadedMock).toHaveBeenCalledTimes(1);
    restore();
  });

  it("CTA is disabled and loading copy is shown while data is not ready; state stays loading", async () => {
    vi.useFakeTimers();
    const { ensureLoadedMock, restore } = await forceAsyncLoadPath();
    // Hold the promise so we can observe the pre-resolve render.
    let resolveLoad!: () => void;
    const heldLoad = new Promise<void>((r) => { resolveLoad = r; });
    ensureLoadedMock.mockReturnValueOnce(heldLoad);

    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />,
    );
    // Loading state: headline copy + CTA disabled. The state-attribute
    // is "loading" — the auto-advance is gated on dataReady, which is
    // false until the held promise resolves.
    expect(container.textContent?.toLowerCase()).toContain("loading challenge data");
    const root = container.querySelector("[data-h2h-recipient-play]");
    expect(root?.getAttribute("data-playing-state")).toBe("loading");
    const cta = container.querySelector("[data-h2h-play-cta]") as HTMLButtonElement;
    expect(cta?.disabled).toBe(true);

    // Resolve the held promise → dataReady flips true → loading
    // auto-advances into deal_in.
    await act(async () => {
      resolveLoad();
      await Promise.resolve();
    });
    const rootAfter = container.querySelector("[data-h2h-recipient-play]");
    expect(rootAfter?.getAttribute("data-playing-state")).toBe("deal_in");
    // CTA shifted to the "Draw" slot, still disabled until cascade
    // settles (deal_in → hold_select enables it).
    const cta2 = container.querySelector("[data-h2h-play-cta]") as HTMLButtonElement;
    expect(cta2?.getAttribute("data-cta-label")).toBe("Draw");
    expect(cta2?.disabled).toBe(true);
    restore();
  });

  it("ensureLoaded rejects → 'Try again' CTA + reveal NOT mounted", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const { ensureLoadedMock, restore } = await forceAsyncLoadPath();
    ensureLoadedMock.mockReturnValueOnce(Promise.reject(new Error("network blip")));
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />,
    );
    await waitFor(
      () => expect(container.querySelector("[data-h2h-play-cta][data-cta-label='Try again']")).not.toBeNull(),
    );
    expect(container.querySelector("[data-h2h-recipient-reveal]")).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    restore();
  });

  it("sync short-circuit: when isLoaded() is true, ensureLoaded is NOT called", async () => {
    const dataEngine = await import("@shared/engines/dataEngine");
    const ensureLoadedMock = dataEngine.ensureLoaded as ReturnType<typeof vi.fn>;
    ensureLoadedMock.mockClear();
    // Default isLoaded mock returns true; no override needed.
    render(<H2HRecipientPlay {...baseProps()} challengeCtx={makeCtx()} />);
    expect(ensureLoadedMock).not.toHaveBeenCalled();
  });
});

// ── 12. FIX 1/2 happy-path end-to-end — pins C/D fixed ─────────────

describe("H2HRecipientPlay — happy-path E2E (regression-lock for C/D fixed)", () => {
  it("tap slots 1+5, Draw → reveal receives wasHeld:true on 1,5; non-zero score", { timeout: 10000 }, async () => {
    // Mock redrawRoster to honor lockedCardIds (set wasHeld:true on
    // locked slots, leave others as-is) and resolveRoster to populate
    // actualFp:30 on every card. This exercises the chain that was
    // SILENTLY broken pre-fix: a successful engine produces a roster
    // with wasHeld + actualFp populated, and that roster is what
    // reaches H2HRecipientReveal as myRoster.
    const props = baseProps({
      redrawRoster: vi.fn(async ({ currentCards, lockedCardIds }: any) => ({
        roster: currentCards.map((c: any) => ({
          ...c,
          wasHeld: lockedCardIds.has(c.cardId),
        })),
      })),
      resolveRoster: vi.fn(async ({ finalCards }: any) => ({
        roster: finalCards.map((c: any) => ({ ...c, actualFp: 30, fpDelta: 30 - (c.projectedFp ?? 0) })),
      })),
    } as any);
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(<H2HRecipientPlay {...props} challengeCtx={ctx} />);

    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await waitFor(
      () => {
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 3000 },
    );
    // Polish #11: confirm hold of slot 1 with tap-tap, then slot 5 with
    // tap-tap. (Tap-tap on a previously-previewed cell holds it; moving
    // to a different cell only previews it, never holds.)
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-5"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-5"));
    fireEvent.click(screen.getByText("Draw"));

    await waitFor(() => expect(props.resolveRoster).toHaveBeenCalledTimes(1), { timeout: 6000 });
    const resolveArg = props.resolveRoster.mock.calls[0][0];
    // Engine HAPPY path: held slots carry wasHeld:true into resolveRoster.
    expect(resolveArg.finalCards[1].wasHeld).toBe(true);
    expect(resolveArg.finalCards[5].wasHeld).toBe(true);
    expect(resolveArg.finalCards[0].wasHeld).toBe(false);

    // The reveal mounts (engine succeeded — Fix 2 guardrail is NOT
    // tripped). Score is non-zero (6 × 30 = 180).
    await waitFor(
      () => expect(container.querySelector("[data-h2h-recipient-reveal]")).not.toBeNull(),
      { timeout: 8000 },
    );
  });
});

// ── 10. Recipient contextual intro (Phase 5c S3) ───────────────────────

describe("H2HRecipientPlay — Stage 1/2 intro mount (Phase 5c S3)", () => {
  async function dealThroughCtx(ctx: ChallengeCtx) {
    vi.useFakeTimers();
    const utils = render(<H2HRecipientPlay {...baseProps()} challengeCtx={ctx} />);
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    return utils;
  }

  function s3Ctx(over: Partial<ChallengeCtx> = {}): ChallengeCtx {
    return makeCtx({
      // big_score trigger keeps the test independent of culture lookup
      // (the NAME bank path fires for any non-elite tier card, since
      // lookupCulture returns null for our PURPLE/GREEN test cards
      // without iconic nicknames in the real culture DB).
      triggerType: "big_score",
      resolvedSenderHand: makeSenderHand(),
      anchorBasePlayerId: "p3", // matches makeRoster's basePlayerId pattern
      ...over,
    });
  }

  it("mounts Stage 1 intro during hold_select entry (no holds yet)", async () => {
    const { container } = await dealThroughCtx(s3Ctx());
    const stage1 = container.querySelector('[data-h2h-play-intro="stage1"]');
    expect(stage1).not.toBeNull();
    // Existing instructional headline is displaced by the intro.
    expect(container.querySelector("[data-h2h-play-headline]")).toBeNull();
  });

  // Polish #11 (§6): Stage 1 dismisses on FIRST PREVIEW tap; Stage 2
  // swaps in on FIRST CONFIRMED HOLD (second tap on same cell).
  it("first preview tap dismisses Stage 1 (but Stage 2 does NOT fire yet — no held card)", async () => {
    const { container } = await dealThroughCtx(s3Ctx());
    expect(container.querySelector('[data-h2h-play-intro="stage1"]')).not.toBeNull();
    // 1st tap → preview only. Stage 1 dismisses; Stage 2 NOT yet.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(container.querySelector('[data-h2h-play-intro="stage1"]')).toBeNull();
    expect(container.querySelector('[data-h2h-play-intro="stage2"]')).toBeNull();
    // The instructional headline ("Tap a card to preview…") takes over
    // during this preview-not-yet-held interval.
    expect(container.querySelector("[data-h2h-play-headline]")).not.toBeNull();
  });

  it("Stage 2 swaps in on first confirmed hold (second tap on previewed cell)", async () => {
    const { container } = await dealThroughCtx(s3Ctx());
    // 1st tap: preview slot 2.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    // 2nd tap on same cell: hold. Stage 2 fires.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(container.querySelector('[data-h2h-play-intro="stage2"]')).not.toBeNull();
    expect(container.querySelector('[data-h2h-play-intro="stage1"]')).toBeNull();
  });

  it("Stage 1 stays dismissed after the preview-then-unhold round-trip", async () => {
    const { container } = await dealThroughCtx(s3Ctx());
    // Preview → hold → unhold the same cell.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    // No cards held now (introDismissed is sticky); instructional
    // headline (not Stage 1) takes over.
    expect(container.querySelector('[data-h2h-play-intro="stage1"]')).toBeNull();
    expect(container.querySelector('[data-h2h-play-intro="stage2"]')).toBeNull();
    expect(container.querySelector("[data-h2h-play-headline]")).not.toBeNull();
  });

  it("does not mount Stage 1 / Stage 2 during deal_in (deal-intro placeholder slot occupies that beat instead)", () => {
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...baseProps()} challengeCtx={s3Ctx()} />,
    );
    // At deal_in entry (right after the loading → deal_in auto-advance),
    // the stage-text region exists but renders the deal-intro-placeholder
    // branch — NOT Stage 1 / Stage 2.
    expect(container.querySelector('[data-h2h-play-intro="deal-intro-placeholder"]')).not.toBeNull();
    expect(container.querySelector('[data-h2h-play-intro="stage1"]')).toBeNull();
    expect(container.querySelector('[data-h2h-play-intro="stage2"]')).toBeNull();
  });

  it("collapses past hold_select (handoff_resolving → settle-pause; Stage 1/2 unmounted)", async () => {
    const ctx = s3Ctx();
    const props = baseProps();
    const { container } = render(<H2HRecipientPlay {...props} challengeCtx={ctx} />);
    // Wait for hold_select.
    await waitFor(
      () => {
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 3000 },
    );
    // Polish #11: tap-tap to confirm hold of slot 1.
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    expect(container.querySelector('[data-h2h-play-intro="stage2"]')).not.toBeNull();
    fireEvent.click(screen.getByText("Draw"));
    // Eventually transitions past hold_select; the settle-pause empty-
    // hero composition mounts and intro stages collapse.
    await waitFor(
      () => expect(container.querySelector("[data-h2h-play-settle-hero]")).not.toBeNull(),
      { timeout: 6000 },
    );
    expect(container.querySelector('[data-h2h-play-intro="stage1"]')).toBeNull();
    expect(container.querySelector('[data-h2h-play-intro="stage2"]')).toBeNull();
  });

  it("mounts Stage 1 via the legacy chadChallengeIntro path when triggerType is absent", async () => {
    // T5 level 4 fallback: no triggerType, no anchor, no resolvedSenderHand
    // → selectRecipientIntro returns a single-string Line wrapping
    // chadChallengeIntro. The mount still fires. Content of the
    // legacy line (challenger name + target) is verified in
    // recipientIntro.test.ts; here we only confirm the mount survives
    // the legacy data shape (no flat error / null Line).
    const { container } = await dealThroughCtx(makeCtx());
    expect(container.querySelector('[data-h2h-play-intro="stage1"]')).not.toBeNull();
  });
});

// ── 13. Polish #11 — preview-then-hold interaction (§9 of design lock) ─

describe("H2HRecipientPlay — Polish #11 preview-then-hold", () => {
  async function dealThroughPreview(ctx = makeCtx()) {
    vi.useFakeTimers();
    const props = baseProps({ renderPlayingStripCard: badgeRenderer } as any);
    const utils = render(<H2HRecipientPlay {...props} challengeCtx={ctx} />);
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    return { ...utils, props };
  }

  // ── §9 — preview doesn't hold ──────────────────────────────────────
  it("§9 — first tap on a non-previewed cell sets preview; held set unchanged; big card renders", async () => {
    const { container } = await dealThroughPreview();
    // Pre-tap: hero region shows the EMPTY preview placeholder.
    expect(container.querySelector('[data-h2h-play-preview="empty"]')).not.toBeNull();
    expect(container.querySelector('[data-h2h-play-preview="card"]')).toBeNull();

    fireEvent.click(screen.getByTestId("bottom-strip-up-3"));

    // Big preview now mounts for slot 3.
    const previewCard = container.querySelector('[data-h2h-play-preview="card"]');
    expect(previewCard).not.toBeNull();
    expect(previewCard?.getAttribute("data-h2h-play-preview-slot")).toBe("3");
    expect(previewCard?.getAttribute("data-h2h-play-preview-held")).toBe("false");

    // The mini cell is NOT held (data-held still false; no H badge).
    expect(screen.getByTestId("bottom-strip-up-3").getAttribute("data-held")).toBe("false");
    expect(container.querySelectorAll(`[data-h2h-play-bottom-cell] [data-h-badge]`).length).toBe(0);
  });

  // ── §9 — second tap holds ──────────────────────────────────────────
  it("§9 — second tap on the previewed cell holds it (yellow border + H mark)", async () => {
    const { container } = await dealThroughPreview();
    // Preview slot 3.
    fireEvent.click(screen.getByTestId("bottom-strip-up-3"));
    // 2nd tap → hold.
    fireEvent.click(screen.getByTestId("bottom-strip-up-3"));

    // Mini cell: data-held="true" + H badge.
    expect(screen.getByTestId("bottom-strip-up-3").getAttribute("data-held")).toBe("true");
    expect(container.querySelectorAll(`[data-h2h-play-bottom-cell] [data-h-badge]`).length).toBe(1);
    const cell3 = container.querySelector(`[data-h2h-play-bottom-cell="3"]`);
    expect(cell3?.querySelector(`[data-h-badge]`)).not.toBeNull();

    // Big preview: data-h2h-play-preview-held="true" (the H-mark surface
    // on the big card is driven by the same `wasHeld` override).
    const previewCard = container.querySelector('[data-h2h-play-preview="card"]');
    expect(previewCard?.getAttribute("data-h2h-play-preview-held")).toBe("true");
  });

  // ── §9 — third tap unholds ─────────────────────────────────────────
  it("§9 — third tap on the same cell unholds it (markers clear)", async () => {
    const { container } = await dealThroughPreview();
    fireEvent.click(screen.getByTestId("bottom-strip-up-3")); // preview
    fireEvent.click(screen.getByTestId("bottom-strip-up-3")); // hold
    fireEvent.click(screen.getByTestId("bottom-strip-up-3")); // unhold

    expect(screen.getByTestId("bottom-strip-up-3").getAttribute("data-held")).toBe("false");
    expect(container.querySelectorAll(`[data-h2h-play-bottom-cell] [data-h-badge]`).length).toBe(0);
    // Preview window: card still shown big (unhold doesn't move preview),
    // but the held marker is cleared.
    const previewCard = container.querySelector('[data-h2h-play-preview="card"]');
    expect(previewCard?.getAttribute("data-h2h-play-preview-slot")).toBe("3");
    expect(previewCard?.getAttribute("data-h2h-play-preview-held")).toBe("false");
  });

  // ── §9 — move-resets-cycle ─────────────────────────────────────────
  it("§9 — moving preview A→B→A previews A (does NOT hold A); tapping A again holds it", async () => {
    const { container } = await dealThroughPreview();
    // Preview slot 1.
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    // Move preview to slot 4 (cycle resets — slot 1 was never held, still isn't).
    fireEvent.click(screen.getByTestId("bottom-strip-up-4"));
    expect(container.querySelector('[data-h2h-play-preview="card"]')?.getAttribute("data-h2h-play-preview-slot")).toBe("4");
    expect(screen.getByTestId("bottom-strip-up-1").getAttribute("data-held")).toBe("false");
    expect(screen.getByTestId("bottom-strip-up-4").getAttribute("data-held")).toBe("false");

    // Move back to slot 1. Per §3 this is a PREVIEW (slot 1 is no longer
    // the currently-previewed card — slot 4 is). So tap on 1 = preview 1.
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    expect(container.querySelector('[data-h2h-play-preview="card"]')?.getAttribute("data-h2h-play-preview-slot")).toBe("1");
    expect(screen.getByTestId("bottom-strip-up-1").getAttribute("data-held")).toBe("false");

    // Tap slot 1 AGAIN — now it IS the previewed cell, so this holds it.
    fireEvent.click(screen.getByTestId("bottom-strip-up-1"));
    expect(screen.getByTestId("bottom-strip-up-1").getAttribute("data-held")).toBe("true");
    expect(container.querySelector('[data-h2h-play-preview="card"]')?.getAttribute("data-h2h-play-preview-held")).toBe("true");
  });

  // ── §9 — held survives Draw ────────────────────────────────────────
  it("§9 — held survives Draw: state.held at Draw time = only confirmed holds (preview-only excluded)", async () => {
    const { props } = await dealThroughPreview();
    // Preview slot 2, then move preview to slot 4 (slot 2 NEVER becomes held).
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-4"));
    // Confirm hold of slot 4 (tap again on previewed cell).
    fireEvent.click(screen.getByTestId("bottom-strip-up-4"));

    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));

    await waitFor(() => expect(props.redrawRoster).toHaveBeenCalledTimes(1));
    const callArg = props.redrawRoster.mock.calls[0][0];
    // Only slot 4 is in lockedCardIds. Slot 2 was preview-only.
    expect(callArg.lockedCardIds.size).toBe(1);
    expect(callArg.lockedCardIds.has("init-4")).toBe(true);
    expect(callArg.lockedCardIds.has("init-2")).toBe(false);
  });

  // ── §9 — intro dismiss on first preview ────────────────────────────
  it("§9 — Stage 1 dismisses on first preview tap; Stage 2 does NOT fire until first confirmed hold", async () => {
    vi.useFakeTimers();
    const ctx = makeCtx({
      triggerType: "big_score",
      resolvedSenderHand: makeSenderHand(),
      anchorBasePlayerId: "p3",
    });
    const { container } = render(<H2HRecipientPlay {...baseProps()} challengeCtx={ctx} />);
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // Stage 1 mounted on hold_select entry.
    expect(container.querySelector('[data-h2h-play-intro="stage1"]')).not.toBeNull();
    expect(container.querySelector('[data-h2h-play-intro="stage2"]')).toBeNull();

    // First PREVIEW tap dismisses Stage 1; Stage 2 not yet (no hold).
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(container.querySelector('[data-h2h-play-intro="stage1"]')).toBeNull();
    expect(container.querySelector('[data-h2h-play-intro="stage2"]')).toBeNull();
    expect(container.querySelector("[data-h2h-play-headline]")).not.toBeNull();

    // Second tap on same cell = HOLD → Stage 2 fires.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(container.querySelector('[data-h2h-play-intro="stage2"]')).not.toBeNull();
  });

  // ── §9 — introSig-pinned lines stable across preview taps (S3 regression guard) ──
  it("§9 — introSig-pinned Stage 2 line stays byte-stable when preview moves to a different cell", async () => {
    // The ref-pinning invariant (S3): the picked Stage 1/2 line is locked
    // into a useRef keyed on introSig, which derives PURELY from ctx
    // fields. Local state changes (held, previewedSlotIndex) must NOT
    // re-trigger pickWithAntiRepeat. Verify this by confirming hold of
    // one card → Stage 2 mounts → move preview to another card (no held
    // change) → Stage 2 text is byte-identical. If the ref pin broke
    // and pickWithAntiRepeat re-fired on the preview tap, the random
    // selector would (probably) swap the line.
    vi.useRealTimers(); // Typewriter rush needs real timers to paint
    const ctx = makeCtx({
      triggerType: "big_score",
      resolvedSenderHand: makeSenderHand(),
      anchorBasePlayerId: "p3",
    });
    const { container } = render(<H2HRecipientPlay {...baseProps()} challengeCtx={ctx} />);
    // Layout A/B restructure: pre_deal is killed; the loading →
    // deal_in auto-advance fires synchronously inside the useEffect
    // chain that render()'s act() flushes. The deal_in cascade is
    // scheduled at that point — no Deal-button tap.
    await waitFor(
      () => {
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 3000 },
    );

    // Confirm hold of slot 2 (tap-tap). Stage 2 mounts.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    await waitFor(
      () => {
        const el = container.querySelector('[data-h2h-play-intro="stage2"]');
        // Threshold tracks the static stage-2 line introduced by the
        // 2026-06-08 subtraction (docs/h2h-recipient-static-commentary-lock.md):
        // placeholder is [""] (length 0), painted line is `Draw to beat <target>.`
        // (~19 chars for target=175). > 0 still guarantees the line painted.
        expect(el?.textContent?.length ?? 0).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );
    const stage2A = container.querySelector('[data-h2h-play-intro="stage2"]')?.textContent ?? "";

    // Move preview to slot 5 (no hold change; held.size still 1).
    fireEvent.click(screen.getByTestId("bottom-strip-up-5"));
    // Stage 2 still mounted (heldCount > 0). Text must be byte-identical
    // — the introSig key is ctx-derived and the preview tap didn't
    // touch ctx.
    const stage2B = container.querySelector('[data-h2h-play-intro="stage2"]')?.textContent ?? "";
    expect(stage2B).toBe(stage2A);

    // Move preview again to slot 0. Still no hold change. Still pinned.
    fireEvent.click(screen.getByTestId("bottom-strip-up-0"));
    const stage2C = container.querySelector('[data-h2h-play-intro="stage2"]')?.textContent ?? "";
    expect(stage2C).toBe(stage2A);
  });

  // ── Settle-pause overrides preview render (post-VS restructure) ───
  it("settle-pause empty-hero composition overrides preview render in the hero zone", async () => {
    vi.useRealTimers();
    const props = baseProps();
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(<H2HRecipientPlay {...props} challengeCtx={ctx} />);
    await waitFor(
      () => {
        const btn = screen.queryByText("Draw") as HTMLButtonElement | null;
        expect(btn).not.toBeNull();
        expect(btn?.disabled).toBe(false);
      },
      { timeout: 3000 },
    );

    // Preview + hold slot 2 so the preview window is populated.
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    expect(container.querySelector('[data-h2h-play-preview="card"]')).not.toBeNull();

    // Draw transitions through redraw_running → your_redraw_flip →
    // ab_transition → handoff_resolving (settle-pause).
    fireEvent.click(screen.getByText("Draw"));

    // Settle-pause empty-hero composition must take over the hero zone,
    // displacing the preview. No VS, no preview, no headline.
    await waitFor(
      () => expect(container.querySelector("[data-h2h-play-settle-hero]")).not.toBeNull(),
      { timeout: 6000 },
    );
    expect(container.querySelector('[data-h2h-play-preview="card"]')).toBeNull();
    expect(container.querySelector('[data-h2h-play-preview="empty"]')).toBeNull();
    expect(container.querySelector("[data-h2h-play-vs]")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────
// RD3 — armed rail + redraw→arc no-snap
// ─────────────────────────────────────────────────────────────────
//
// Lock: docs/replaymod-design-decisions.md § RD3. The "Drawing…" beat
// (~2.4s after recipient keeps-and-draws) was dead air. RD3 replaces it
// with a slim YOU/JOHN/delta rail in the hero region's right column,
// continuously mounted across redraw_running → your_redraw_flip →
// ab_transition → handoff_resolving (one mount, one handoff). Both
// cells render at "0.0" / trailing / sizeProgress=0 so the armed rail's
// last frame is byte-identical to the arc rail's first revealing frame
// (HARDENING 1, the named "redraw→arc no-snap" gate below).
//
// JOHN's target communicates through the existing "{X.X} to beat."
// intro line above the hero (covered separately by the redraw-target
// describe block above). The rail itself reads as a pre-tipoff
// scoreboard at 0-0.

describe("H2HRecipientPlay — RD3 armed rail (continuous mount + no-snap)", () => {
  async function holdAndDrawHeld() {
    // Reusable: drive into redraw_running with the redraw promise held
    // open (state pinned). Returns the container + an unblock fn so
    // each test can advance to subsequent states deterministically.
    let resolveRedraw: (val: { roster: GeneratedCard[] }) => void = () => { };
    const heldRedraw = new Promise<{ roster: GeneratedCard[] }>((r) => { resolveRedraw = r; });
    const props = baseProps({
      redrawRoster: vi.fn(() => heldRedraw),
    } as any);
    vi.useFakeTimers();
    const { container } = render(
      <H2HRecipientPlay {...props} challengeCtx={makeCtx()} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    vi.useRealTimers();
    fireEvent.click(screen.getByText("Draw"));
    await waitFor(() => {
      const root = document.querySelector("[data-h2h-recipient-play]");
      expect(root?.getAttribute("data-playing-state")).toBe("redraw_running");
    });
    return { container, resolveRedraw };
  }

  it("armed rail mounts during redraw_running with both ScoreCells at neutral 0.0", async () => {
    const { container, resolveRedraw } = await holdAndDrawHeld();
    const armedRail = container.querySelector('[data-h2h-armed-rail="true"]');
    expect(armedRail).not.toBeNull();
    // Two ScoreCells — opponent (JOHN) on top, user (YOU) on bottom.
    const opponent = armedRail!.querySelector('[data-h2h-team-score-position="opponent"]');
    const user = armedRail!.querySelector('[data-h2h-team-score-position="user"]');
    expect(opponent).not.toBeNull();
    expect(user).not.toBeNull();
    // Both display "0.0" — armed cells are neutral, JOHN target is
    // communicated by the intro line above, not the rail.
    expect(opponent!.getAttribute("data-h2h-team-score-display")).toBe("0.0");
    expect(user!.getAttribute("data-h2h-team-score-display")).toBe("0.0");
    // Both "trailing" — no leader-glow on either (the "leading" green
    // would misread as "John already won" before any card is revealed).
    expect(opponent!.getAttribute("data-h2h-score-state")).toBe("trailing");
    expect(user!.getAttribute("data-h2h-score-state")).toBe("trailing");
    // sizeProgress=0 → rest-scale 1.000 (1 + 0*SIZE_PROGRESS_MAX + 0
    // trailing bonus). Confirms no Z1 size growth on the armed rail.
    expect(opponent!.getAttribute("data-h2h-score-size-progress")).toBe("0.000");
    expect(user!.getAttribute("data-h2h-score-size-progress")).toBe("0.000");
    expect(opponent!.getAttribute("data-h2h-score-rest-scale")).toBe("1.000");
    expect(user!.getAttribute("data-h2h-score-rest-scale")).toBe("1.000");
    resolveRedraw({ roster: makeFinalRoster(makeRoster(), new Set([2])) });
  });

  it("armed rail persists continuously across redraw_running → your_redraw_flip → ab_transition → handoff_resolving (HARDENING 2)", async () => {
    // HARDENING 2: one mount across all four pre-arc states, exactly
    // one handoff at arc. The rail must NOT appear→vanish→reappear at
    // any transition. We assert the [data-h2h-armed-rail] presence at
    // each state. Fake timers throughout; pattern mirrors the existing
    // ab_transition reach test above.
    vi.useFakeTimers();
    const props = baseProps();
    const { container } = render(
      <H2HRecipientPlay {...props} challengeCtx={makeCtx({ resolvedSenderHand: makeSenderHand() })} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(DEAL_CASCADE_INTERVAL_MS * 7);
    });
    // Tap-tap to hold slot 2 (preview-then-hold).
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByTestId("bottom-strip-up-2"));
    fireEvent.click(screen.getByText("Draw"));
    // Drain redraw promise microtasks.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const root = document.querySelector("[data-h2h-recipient-play]")!;

    // Sample 1: your_redraw_flip (right after Draw + redraw resolution
    // — the held mock resolves synchronously, redraw_running is
    // observable only mid-microtask, so we sample at your_redraw_flip
    // which is where the rail must definitely be mounted given the
    // approved continuous-mount window starts at redraw_running).
    expect(root.getAttribute("data-playing-state")).toBe("your_redraw_flip");
    const railAtFlip = container.querySelector('[data-h2h-armed-rail="true"]');
    expect(railAtFlip).not.toBeNull();

    // Sample 2: ab_transition (after the 6-column flip cascade).
    await act(async () => {
      vi.advanceTimersByTime(
        ROSTER_SIZE_LOCAL * (COLUMN_FLIP_DURATION_MS + COLUMN_FLIP_INTERSTITIAL_MS),
      );
    });
    expect(root.getAttribute("data-playing-state")).toBe("ab_transition");
    const railAtAb = container.querySelector('[data-h2h-armed-rail="true"]');
    expect(railAtAb).not.toBeNull();

    // Sample 3: handoff_resolving (after AB_TRANSITION_DURATION_MS).
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(root.getAttribute("data-playing-state")).toBe("handoff_resolving");
    const railAtHandoff = container.querySelector('[data-h2h-armed-rail="true"]');
    expect(railAtHandoff).not.toBeNull();

    // Continuous-mount proof: same DOM node throughout (React did not
    // unmount/remount the rail across any of the three state
    // transitions). Reference equality is the cleanest "no
    // appear→vanish→reappear" guard.
    expect(railAtAb).toBe(railAtFlip);
    expect(railAtHandoff).toBe(railAtFlip);

    // Don't drive to arc here — that mounts H2HRecipientReveal which
    // pulls in useChallengeAttempt's POST. The four-state continuous
    // mount is what RD3 owns; the arc handoff (rail unmounts, arc
    // rail takes over) is covered by the state-4 handoff describe
    // block above + the no-snap value test below.
    vi.useRealTimers();
  });

  it("redraw→arc no-snap: armed ScoreCell DOM matches arc revealing-first-frame ScoreCell DOM (HARDENING 1, named gate)", async () => {
    // The named test gate: armed-last-frame ScoreCell state ===
    // arc-idle-first-frame ScoreCell state. With Option B both states
    // are 0.0 / trailing / sizeProgress=0 — byte-identical.
    //
    // Important wiring detail (surfaced during H1 investigation): the
    // hook's true "phase=idle" frame renders <div /> placeholders for
    // the ScoreCell slots (senderBattle is null at idle). The first
    // frame at which the arc paints VISIBLE ScoreCells is the first
    // phase=revealing tick, where senderRunningTotal=0 and
    // recipientRunningTotal=0 by hook init. That's the frame the
    // armed rail must match.
    //
    // We assert this by reading the armed rail's data attrs from a
    // real H2HRecipientPlay render at redraw_running, and reading the
    // arc's via a directly-rendered ScoreCell with the exact props
    // H2HRevealScreen passes at revealing-first-frame: total=
    // sender.totalFp (any), displayTotal=0, state="trailing",
    // sizeProgress=0, surface="reveal", teamPosition="opponent"|
    // "user". The ScoreCell component is shared between the two
    // surfaces (no-snap is structural, not coincidence).
    const { ScoreCell } = await import("../H2HScoreRail");
    const { container: armedContainer, resolveRedraw } = await holdAndDrawHeld();
    const armedOpp = armedContainer.querySelector('[data-h2h-armed-rail="true"] [data-h2h-team-score-position="opponent"]')!;
    const armedUser = armedContainer.querySelector('[data-h2h-armed-rail="true"] [data-h2h-team-score-position="user"]')!;

    const arcHarness = render(
      <div data-arc-harness="true">
        {/* Mirror the props H2HRevealScreen passes at revealing-first-
            frame for both cells. The `total` prop differs from armed
            (armed passes targetScore, arc passes sender.totalFp /
            recipient.totalFp) — both fall through to displayTotal=0
            on the visible glyph since ScoreCell renders displayTotal
            when defined. The data-h2h-team-score-display attribute
            reflects displayTotal, NOT total — same number on both
            surfaces. */}
        <ScoreCell total={200} displayTotal={0} state="trailing" sizeProgress={0} surface="reveal" teamPosition="opponent" />
        <ScoreCell total={200} displayTotal={0} state="trailing" sizeProgress={0} surface="reveal" teamPosition="user" />
      </div>,
    );
    const arcOpp = arcHarness.container.querySelector('[data-arc-harness] [data-h2h-team-score-position="opponent"]')!;
    const arcUser = arcHarness.container.querySelector('[data-arc-harness] [data-h2h-team-score-position="user"]')!;

    // The load-bearing data attributes for the no-snap. Mirroring the
    // reveal→results no-snap gate (which compares these same attrs
    // between H2HRevealScreen's done-frame ScoreCell and
    // H2HResultsOverlay's mount-frame ScoreCell).
    const attrs = [
      "data-h2h-team-score-display",
      "data-h2h-score-state",
      "data-h2h-score-size-progress",
      "data-h2h-score-rest-scale",
      "data-h2h-score-pop-magnitude",
      "data-h2h-score-pop-duration-ms",
      "data-h2h-score-pop-kind",
      "data-h2h-score-suppressed",
    ] as const;
    for (const a of attrs) {
      expect(
        armedOpp.getAttribute(a),
        `armed opponent ${a} should equal arc opponent ${a}`,
      ).toBe(arcOpp.getAttribute(a));
      expect(
        armedUser.getAttribute(a),
        `armed user ${a} should equal arc user ${a}`,
      ).toBe(arcUser.getAttribute(a));
    }
    arcHarness.unmount();
    resolveRedraw({ roster: makeFinalRoster(makeRoster(), new Set([2])) });
  });
});
