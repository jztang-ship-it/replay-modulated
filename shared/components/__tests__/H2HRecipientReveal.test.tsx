// @vitest-environment jsdom
/**
 * shared/components/__tests__/H2HRecipientReveal.test.tsx
 *
 * Phase 5a commit 3 (2026-05-27): wrapper mount-gate + composition
 * tests. Focuses on the rendering decision the wrapper owns —
 * NOT the inner H2H components, NOT the useChallengeAttempt hook
 * (both are tested separately and treated as integration surfaces).
 *
 * Renderer props are stubbed (sport-agnostic test).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { H2HRecipientReveal } from "../H2HRecipientReveal";
import type { ChallengeCtx, SenderHand } from "@shared/adapters/challengeTypes";
import type { GeneratedCard } from "@shared/types";
import type { CardRenderer } from "../H2HRevealScreen";

// Stub fetch globally — the wrapper's useChallengeAttempt fires a POST
// on mount. Tests don't care about the request shape, just that it
// doesn't throw or block rendering.
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

function makeCard(over: Partial<GeneratedCard> = {}): GeneratedCard {
  return {
    id: "p1", basePlayerId: "p1", personKey: "p1", cardId: `c-${Math.random()}`,
    name: "Test Player", team: "ABC", season: "2425", position: "PG",
    photoCode: "playte01", salary: 50, tier: "PURPLE", projectedFp: 30,
    slotIndex: 0, wasHeld: false, actualFp: 25, fpDelta: -5,
    gameInfo: { date: "2025-01-01", opponent: "XYZ" },
    statLine: { pts: 20 },
    achievements: [],
    ...over,
  } as GeneratedCard;
}

function makeSenderHand(over: Partial<SenderHand> = {}): SenderHand {
  return {
    handId: "sender-hand-1",
    totalFp: 178.4,
    tier: "ROOKIE",
    cards: Array.from({ length: 6 }, (_, i) => makeCard({ slotIndex: i, cardId: `s-${i}` })),
    ...over,
  };
}

function makeCtx(over: Partial<ChallengeCtx> = {}): ChallengeCtx {
  return {
    challengeId: "test-challenge-id",
    initialRoster: [],
    targetScore: 175,
    challengerName: "Test Challenger",
    sport: "basketball",
    season: "2425",
    ...over,
  };
}

const stubRenderer: CardRenderer = (_card) => <div data-stub-card="true" />;

const baseProps = {
  myScore: 182.4,
  myRoster: Array.from({ length: 6 }, (_, i) => makeCard({ slotIndex: i, cardId: `r-${i}` })),
  myWinTier: "ROOKIE",
  sport: "basketball",
  renderBattlefieldCard: stubRenderer,
  renderOverlayCard: stubRenderer,
  onSendItBack: vi.fn(),
  onTryAgain: vi.fn(),
  onPlayOwnHand: vi.fn(),
  onDismiss: vi.fn(),
};

describe("H2HRecipientReveal — mount gate", () => {
  it("returns null when resolvedSenderHand is absent", () => {
    const { container } = render(
      <H2HRecipientReveal
        {...baseProps}
        challengeCtx={makeCtx()}  // no resolvedSenderHand
        gameState="REVEALING"
      />
    );
    expect(container.querySelector("[data-h2h-recipient-reveal]")).toBeNull();
  });

  it("returns null when gameState is not REVEALING or RESULTS", () => {
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    for (const gs of ["IDLE", "DEALING", "HOLD", "DRAWING", "WIN_CELEBRATION"] as const) {
      const { container } = render(
        <H2HRecipientReveal {...baseProps} challengeCtx={ctx} gameState={gs} />
      );
      expect(container.querySelector("[data-h2h-recipient-reveal]")).toBeNull();
    }
  });

  it("mounts when all three gates pass (REVEALING + resolvedSenderHand)", () => {
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientReveal {...baseProps} challengeCtx={ctx} gameState="REVEALING" />
    );
    expect(container.querySelector("[data-h2h-recipient-reveal]")).not.toBeNull();
  });

  it("mounts when all three gates pass (RESULTS + resolvedSenderHand)", () => {
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientReveal {...baseProps} challengeCtx={ctx} gameState="RESULTS" />
    );
    expect(container.querySelector("[data-h2h-recipient-reveal]")).not.toBeNull();
  });
});

describe("H2HRecipientReveal — composition", () => {
  it("forwards challengerName through to the sender zone header", () => {
    const ctx = makeCtx({
      challengerName: "Sender Bob",
      resolvedSenderHand: makeSenderHand(),
    });
    render(
      <H2HRecipientReveal {...baseProps} challengeCtx={ctx} gameState="REVEALING" />
    );
    // Sender's displayName from challengerName (passes isRealName).
    // May appear multiple times in the rendered tree (zone header +
    // score rail). getAllByText forgives that; inner H2HRevealScreen
    // tests cover the exact placements.
    expect(screen.getAllByText("Sender Bob").length).toBeGreaterThan(0);
  });

  it("renders the wrapper at z-index 9000 (above GameView surface)", () => {
    const ctx = makeCtx({ resolvedSenderHand: makeSenderHand() });
    const { container } = render(
      <H2HRecipientReveal {...baseProps} challengeCtx={ctx} gameState="REVEALING" />
    );
    const root = container.querySelector("[data-h2h-recipient-reveal]") as HTMLElement;
    expect(root.style.zIndex).toBe("9000");
    expect(root.style.position).toBe("fixed");
  });
});
