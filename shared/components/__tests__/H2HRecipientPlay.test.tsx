// @vitest-environment jsdom
/**
 * shared/components/__tests__/H2HRecipientPlay.test.tsx
 *
 * Phase 5b piece 2b+2c (2026-05-30): playing-mode surface tests.
 * Covers the rendering decisions H2HRecipientPlay owns:
 *   - top strip face-down (P6)
 *   - bottom strip empty placeholders → progressive fill (P3, P4)
 *   - Draw button advances drawnCount one card per tap (P4)
 *   - slot-6 fill → PRE_REVEAL_HOLD_MS pause → resolveRoster
 *     → handoff to H2HRecipientReveal (P9)
 *   - no auth gate during play (P5)
 *
 * Renderer props are stubbed (sport-agnostic test). resolveRoster +
 * calculateWinTier are vi.fn mocks.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { H2HRecipientPlay, PRE_REVEAL_HOLD_MS } from "../H2HRecipientPlay";
import type { ChallengeCtx, SenderHand } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types";
import type { CardRenderer } from "../H2HRevealScreen";

// Stub fetch globally — the inner H2HRecipientReveal's
// useChallengeAttempt fires a POST on handoff mount. Mirror the
// H2HRecipientReveal test pattern.
beforeAll(() => {
  // @ts-expect-error global fetch stub
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
    name: `Player ${i}`, team: "ABC", season: "2425", position: "PG",
    photoCode: "playte01", salary: 50, tier: "PURPLE", projectedFp: 30,
    slotIndex: i, wasHeld: false, actualFp: 25, fpDelta: -5,
    gameInfo: { date: "2025-01-01", opponent: "XYZ" },
    statLine: { pts: 20 },
    achievements: [],
    ...over,
  } as GeneratedCard;
}

function makeRoster(): GeneratedCard[] {
  return Array.from({ length: 6 }, (_, i) =>
    makeCard({ name: `Player ${i}`, actualFp: 30 + i }, i),
  );
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
      makeCard({ slotIndex: i, cardId: `s-${i}` }, i),
    ),
  };
}

const stubRenderer: CardRenderer = (_card) => <div data-stub-card="true" />;

const baseProps = {
  sport: "basketball",
  resolveRoster: vi.fn(async ({ finalCards }: { finalCards: GeneratedCard[] }) => ({
    roster: finalCards,
  })),
  calculateWinTier: vi.fn((_fp: number) => "ROOKIE"),
  renderBattlefieldCard: stubRenderer,
  renderOverlayCard: stubRenderer,
  onSendItBack: vi.fn(),
  onTryAgain: vi.fn(),
  onPlayOwnHand: vi.fn(),
  onDismiss: vi.fn(),
};

describe("H2HRecipientPlay — initial render", () => {
  it("mounts the playing surface with challengeCtx present", () => {
    const { container } = render(
      <H2HRecipientPlay {...baseProps} challengeCtx={makeCtx()} />
    );
    expect(container.querySelector("[data-h2h-recipient-play]")).not.toBeNull();
  });

  it("renders 6 face-down cells on top strip (P6)", () => {
    render(<H2HRecipientPlay {...baseProps} challengeCtx={makeCtx()} />);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`top-strip-back-${i}`)).toBeTruthy();
    }
  });

  it("renders 6 empty placeholders on bottom strip when drawnCount=0 (P3)", () => {
    render(<H2HRecipientPlay {...baseProps} challengeCtx={makeCtx()} />);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`bottom-strip-empty-${i}`)).toBeTruthy();
    }
  });

  it("renders Draw button in CTA slot", () => {
    render(<H2HRecipientPlay {...baseProps} challengeCtx={makeCtx()} />);
    const btn = screen.getByText("Draw");
    expect(btn).toBeTruthy();
  });

  it("uses challengerName in headline when name is real", () => {
    render(<H2HRecipientPlay {...baseProps} challengeCtx={makeCtx({ challengerName: "Mike" })} />);
    const headline = screen.getByText(/Mike/);
    expect(headline).toBeTruthy();
  });
});

describe("H2HRecipientPlay — drawing mechanic (P4)", () => {
  it("Draw tap fills slot 0 (left-to-right per P3)", () => {
    render(<H2HRecipientPlay {...baseProps} challengeCtx={makeCtx()} />);
    fireEvent.click(screen.getByText("Draw"));
    expect(screen.getByTestId("bottom-strip-drawn-0")).toBeTruthy();
    // Slot 1 remains empty
    expect(screen.getByTestId("bottom-strip-empty-1")).toBeTruthy();
  });

  it("six Draw taps fill all six bottom-strip slots", () => {
    render(<H2HRecipientPlay {...baseProps} challengeCtx={makeCtx()} />);
    const drawBtn = screen.getByText("Draw");
    for (let i = 0; i < 6; i++) fireEvent.click(drawBtn);
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`bottom-strip-drawn-${i}`)).toBeTruthy();
    }
  });

  it("Draw button disables and changes label after slot 6", () => {
    render(<H2HRecipientPlay {...baseProps} challengeCtx={makeCtx()} />);
    const drawBtn = screen.getByText("Draw") as HTMLButtonElement;
    for (let i = 0; i < 6; i++) fireEvent.click(drawBtn);
    // Label flips to "Revealing…"
    const revealingBtn = screen.getByText("Revealing…") as HTMLButtonElement;
    expect(revealingBtn.disabled).toBe(true);
  });

  it("draw stops accepting clicks after slot 6 (no over-draw)", () => {
    render(<H2HRecipientPlay {...baseProps} challengeCtx={makeCtx()} />);
    const drawBtn = screen.getByText("Draw");
    for (let i = 0; i < 8; i++) fireEvent.click(drawBtn); // 2 extra
    // Still exactly 6 drawn cells
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`bottom-strip-drawn-${i}`)).toBeTruthy();
    }
  });
});

describe("H2HRecipientPlay — slot-6 handoff (P9)", () => {
  it("calls resolveRoster after PRE_REVEAL_HOLD_MS once slot 6 fills", async () => {
    vi.useFakeTimers();
    const resolveRoster = vi.fn(async ({ finalCards }: { finalCards: GeneratedCard[] }) => ({
      roster: finalCards,
    }));
    render(
      <H2HRecipientPlay
        {...baseProps}
        resolveRoster={resolveRoster}
        challengeCtx={makeCtx()}
      />
    );
    const drawBtn = screen.getByText("Draw");
    for (let i = 0; i < 6; i++) fireEvent.click(drawBtn);
    // Before the hold elapses, resolveRoster is not called
    expect(resolveRoster).toHaveBeenCalledTimes(0);
    await act(async () => { vi.advanceTimersByTime(PRE_REVEAL_HOLD_MS); });
    expect(resolveRoster).toHaveBeenCalledTimes(1);
    expect(resolveRoster.mock.calls[0][0].finalCards.length).toBe(6);
  });

  // The two handoff tests below use REAL timers — vitest's waitFor +
  // fake timers are mutually incompatible (waitFor polls via real
  // setTimeout under the hood). The 800ms real wait is acceptable in
  // test runtime. The hold constant lives on the component for
  // production tuning; tests just use it as the polling deadline.
  it("hands off to H2HRecipientReveal after resolve (when senderResolved present)", async () => {
    const senderHand = makeSenderHand();
    const ctx = makeCtx({ resolvedSenderHand: senderHand });
    const { container } = render(<H2HRecipientPlay {...baseProps} challengeCtx={ctx} />);
    const drawBtn = screen.getByText("Draw");
    for (let i = 0; i < 6; i++) fireEvent.click(drawBtn);
    expect(container.querySelector("[data-h2h-recipient-play]")).not.toBeNull();
    expect(container.querySelector("[data-h2h-recipient-reveal]")).toBeNull();
    await waitFor(
      () => expect(container.querySelector("[data-h2h-recipient-reveal]")).not.toBeNull(),
      { timeout: PRE_REVEAL_HOLD_MS + 1500 },
    );
    expect(container.querySelector("[data-h2h-recipient-play]")).toBeNull();
  });

  it("handoff falls back to initialRoster when resolveRoster throws", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
    const resolveRoster = vi.fn(async () => { throw new Error("boom"); });
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientPlay
        {...baseProps}
        resolveRoster={resolveRoster}
        challengeCtx={ctx}
      />
    );
    const drawBtn = screen.getByText("Draw");
    for (let i = 0; i < 6; i++) fireEvent.click(drawBtn);
    await waitFor(
      () => expect(container.querySelector("[data-h2h-recipient-reveal]")).not.toBeNull(),
      { timeout: PRE_REVEAL_HOLD_MS + 1500 },
    );
    consoleSpy.mockRestore();
  });
});

describe("H2HRecipientPlay — anonymous path (P5)", () => {
  it("does not render any auth prompt during playing", () => {
    const { container } = render(
      <H2HRecipientPlay {...baseProps} challengeCtx={makeCtx()} />
    );
    // No RegisterModal-style elements; the playing surface owns its own
    // root and does not delegate any auth UI.
    expect(container.querySelector("[data-register-modal]")).toBeNull();
    expect(container.querySelector("[data-h2h-recipient-play]")).not.toBeNull();
  });
});
