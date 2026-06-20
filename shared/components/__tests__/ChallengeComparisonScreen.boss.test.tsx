// @vitest-environment jsdom
/**
 * shared/components/__tests__/ChallengeComparisonScreen.boss.test.tsx
 *
 * Phase 2-mount Step 5 — the boss fork is a delegation, not an interleaving.
 * On senderKind==='boss', ChallengeComparisonScreen returns the boss outward
 * ending and the human rivalry sheet (WIN/LOSS_OPEN/LOSS_CLOSED + Send It Back
 * / Try Again) is PROVABLY UNENTERED.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ChallengeComparisonScreen } from "../ChallengeComparisonScreen";
import type { ChallengeCtx } from "@shared/adapters/challengeTypes";

const realFetch = globalThis.fetch;
beforeEach(() => {
  localStorage.clear();
  // useChallengeAttempt POSTs on mount — stub it so the boss branch renders cleanly.
  // @ts-expect-error test stub
  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ attempt_id: "a1", attempt_count: 1, winner_count: 0, best_score: null, best_user_name: null, is_practice: false, first_attempt_at_ms: Date.now(), window_closes_at_ms: Date.now() + 3600000, is_window_open: true }),
  }));
});
afterEach(() => { globalThis.fetch = realFetch; });

function bossCtx(over: Partial<ChallengeCtx> = {}): ChallengeCtx {
  return {
    challengeId: "11111111-1111-4111-8111-111111111111",
    initialRoster: [],
    targetScore: 228,
    challengerName: "Banner 18",
    sport: "basketball",
    season: "2324",
    senderKind: "boss",
    ...over,
  } as ChallengeCtx;
}

describe("ChallengeComparisonScreen — boss fork (delegation)", () => {
  it("boss WIN (myScore >= target): boss sheet + outward ending, NO human rivalry CTAs", async () => {
    render(
      <ChallengeComparisonScreen
        challengeCtx={bossCtx()}
        myScore={250}
        myRoster={[]}
        myWinTier="MVP"
        sport="basketball"
        onCollapse={() => {}}
        onSendItBack={() => {}}
        onTryAgain={() => {}}
        onPlayAgain={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("boss-result-sheet")).toBeTruthy());
    expect(screen.getByTestId("boss-outward-ending")).toBeTruthy();
    expect(screen.getByText(/YOU BEAT TODAY'S BOSS/)).toBeTruthy();
    // Human rivalry sheet provably unentered.
    expect(screen.queryByText("Send It Back")).toBeNull();
    expect(screen.queryByText("Try Again")).toBeNull();
  });

  it("boss LOSS (myScore < target): loss outward ending, still no human CTAs", async () => {
    render(
      <ChallengeComparisonScreen
        challengeCtx={bossCtx()}
        myScore={190}
        myRoster={[]}
        myWinTier="STARTER"
        sport="basketball"
        onCollapse={() => {}}
        onSendItBack={() => {}}
        onTryAgain={() => {}}
        onPlayAgain={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("boss-result-sheet")).toBeTruthy());
    expect(screen.getByTestId("boss-outward-ending").getAttribute("data-won")).toBe("false");
    expect(screen.getByText(/TODAY'S BOSS GOT YOU/)).toBeTruthy();
    expect(screen.queryByText("Send It Back")).toBeNull();
  });
});
