// @vitest-environment jsdom
//
// BossScreen first-view reveal — pins the GATE (once-per-boss arming) + the
// load-bearing INVARIANT (the count-up snaps to the baked target == Σ five) +
// the settle-to-LineupTile handoff. NOT animation pixels (glass feel item).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BossScreen } from "../BossScreen";

// Σ fp = 35 + 30 + 30 + 25.2 + 25 = 145.2 == target_score (the seam invariant).
const TARGET = 145.2;
const FIVE = [
  { basePlayerId: "1", name: "Alpha", pos: "PG", salary: 50, tier: "PURPLE", fp: 35.0 },
  { basePlayerId: "2", name: "Bravo", pos: "SF", salary: 50, tier: "BLUE", fp: 30.0 },
  { basePlayerId: "3", name: "Charlie", pos: "C", salary: 50, tier: "BLUE", fp: 30.0 },
  { basePlayerId: "4", name: "Delta", pos: "PF", salary: 50, tier: "GREEN", fp: 25.2 },
  { basePlayerId: "5", name: "Echo", pos: "SG", salary: 50, tier: "GREEN", fp: 25.0 },
];

function bossChallenge() {
  return {
    challenge_id: "fixture-boss", sender_kind: "boss", created_by: null,
    challenger_name: "Test Boss", share_headline: "flavor", target_score: TARGET,
    boss_identity_id: "DEN-2223", tough_day: false, sport: "basketball", season: "2223",
    initial_roster: { v: 1, sport: "basketball", marquee: false, cards: FIVE },
  };
}
function stubFetch() {
  // @ts-expect-error global fetch stub
  globalThis.fetch = vi.fn((url: string) => {
    if (String(url).includes("/api/leaderboard")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [{ uid: "u_me", nickname: "YOU", score: 184.2, session_id: null }] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(bossChallenge()) });
  });
}
const stubRenderBossCard = (card: any, opts: any) => (
  <div data-testid="boss-real-card" data-vfp={opts?.visibleFp ?? ""}>{card?.name}</div>
);
function renderBoss(bossChallengeId: string) {
  return render(
    <BossScreen
      sport="basketball" currentUid="u_me" bossChallengeId={bossChallengeId} bossPlayerCount={100}
      headshotUrl={() => null} renderBossCard={stubRenderBossCard as any} onClose={() => {}}
    />
  );
}

beforeEach(() => {
  stubFetch();
  try { localStorage.clear(); } catch { /* jsdom */ }
});

describe("BossScreen — first-view reveal gate + invariant", () => {
  it("first-timer ARMS the reveal (real cards) and sets the once-per-boss flag", async () => {
    const { hasSeenBossReveal } = await import("@shared/utils/bossResultMemory");
    expect(hasSeenBossReveal("ch_hub_1")).toBe(false);
    const { container } = renderBoss("ch_hub_1");
    await waitFor(() => expect(container.querySelector('[data-testid="boss-lineup"][data-revealing="true"]')).not.toBeNull());
    expect(screen.getAllByTestId("boss-real-card").length).toBe(5); // real cards, not LineupTile
    expect(hasSeenBossReveal("ch_hub_1")).toBe(true);
  });

  it("INVARIANT — the count-up snaps to the baked target (== Σ five) after the roll window", async () => {
    renderBoss("ch_hub_invariant");
    await waitFor(
      () => expect(screen.getByTestId("boss-target").textContent).toBe(`Target to beat: ${TARGET.toFixed(1)}`),
      { timeout: 3500 },
    );
  });

  it("returning player (prior result) does NOT arm — same real cards, static (ONE state)", async () => {
    const { recordBossResult } = await import("@shared/utils/bossResultMemory");
    recordBossResult("ch_hub_revisit", { score: 200, won: true });
    const { container } = renderBoss("ch_hub_revisit");
    await waitFor(() => expect(screen.getByTestId("boss-lineup")).toBeTruthy());
    expect(container.querySelector('[data-testid="boss-lineup"][data-revealing="true"]')).toBeNull(); // not revealing
    expect(screen.getAllByTestId("boss-real-card").length).toBe(5); // SAME real cards, static (NOT LineupTile)
    expect(screen.getByTestId("boss-verdict")).toBeTruthy();        // the kept win-state verdict
  });

  it("once-per-boss: a second view of the same boss does NOT re-arm", async () => {
    const first = renderBoss("ch_hub_once");
    await waitFor(() => expect(first.container.querySelector('[data-revealing="true"]')).not.toBeNull());
    first.unmount();
    const second = renderBoss("ch_hub_once"); // same boss id → seen flag set
    await waitFor(() => expect(screen.getByTestId("boss-lineup")).toBeTruthy());
    expect(second.container.querySelector('[data-testid="boss-lineup"][data-revealing="true"]')).toBeNull();
  });
});

describe("boss-hub reveal seen-flag — set-once util", () => {
  it("hasSeenBossReveal flips false→true; distinct ids independent; null-safe", async () => {
    const { hasSeenBossReveal, markBossRevealSeen } = await import("@shared/utils/bossResultMemory");
    expect(hasSeenBossReveal("a")).toBe(false);
    markBossRevealSeen("a");
    expect(hasSeenBossReveal("a")).toBe(true);
    expect(hasSeenBossReveal("b")).toBe(false);
    expect(hasSeenBossReveal(null)).toBe(false);
    markBossRevealSeen(undefined);
  });
});
