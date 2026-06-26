// @vitest-environment jsdom
//
// BossScreen returning-player win-state. Pins the GATE (getBossResult) and the
// copy/CTA branch — NOT animation/pixels. The leaderboard + rank bar are a
// separate signal and are not asserted here.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BossScreen } from "../BossScreen";

const BOSS_ID = "boss_ch_1";

// Route the two fetches BossScreen makes: leaderboard (board=boss) + challenge GET.
function stubFetch() {
  // @ts-expect-error global fetch stub
  globalThis.fetch = vi.fn((url: string) => {
    if (String(url).includes("/api/leaderboard")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ entries: [{ uid: "u_me", nickname: "YOU", score: 184.2, session_id: null }] }),
      });
    }
    // /api/challenge/{id} — boss identity + lineup + target.
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        challenge_id: BOSS_ID,
        challenger_name: "Jokic's Crown",
        boss_identity_id: "DEN-2223",
        target_score: 145.2,
        share_headline: "the crown stays in Denver",
        initial_roster: { cards: [{ name: "Jokic", pos: "C", salary: 80, tier: "PURPLE", basePlayerId: "1" }] },
      }),
    });
  });
}

function renderBoss() {
  return render(
    <BossScreen
      sport="basketball"
      currentUid="u_me"
      bossChallengeId={BOSS_ID}
      bossPlayerCount={100}
      headshotUrl={() => ""}
      onClose={() => {}}
    />
  );
}

beforeEach(() => {
  stubFetch();
  try { localStorage.clear(); } catch { /* jsdom */ }
});

describe("BossScreen — returning-player win-state (gate + copy/CTA)", () => {
  it("first-timer (no result): CTA reads 'Take the Boss', shows the target line, NO verdict", async () => {
    const { container } = renderBoss();
    await waitFor(() => expect(screen.getByText(/Target to beat: 145\.2/)).toBeTruthy());
    expect(screen.getByTestId("boss-take-cta").textContent).toBe("Take the Boss");
    expect(container.querySelector('[data-testid="boss-verdict"]')).toBeNull();
  });

  it("returning WINNER: target line + verdict 'YOU BEAT TODAY'S BOSS · 184.2' below it; CTA 'Play Again'", async () => {
    const { recordBossResult } = await import("@shared/utils/bossResultMemory");
    recordBossResult(BOSS_ID, { score: 184.2, won: true });
    renderBoss();
    await waitFor(() => expect(screen.getByTestId("boss-verdict")).toBeTruthy());
    const verdict = screen.getByTestId("boss-verdict");
    expect(verdict.getAttribute("data-won")).toBe("true");
    expect(verdict.textContent).toMatch(/YOU BEAT TODAY'S BOSS · 184\.2/);
    // CTA flips to Play Again (don't tell a winner to "take" a boss they beat).
    expect(screen.getByTestId("boss-take-cta").textContent).toBe("Play Again");
    // Standalone target line stays, above the verdict (restored).
    expect(screen.getByText(/Target to beat: 145\.2/)).toBeTruthy();
  });

  it("returning LOSER: target line + verdict 'TODAY'S BOSS GOT YOU · 130.0' below it; CTA 'Play Again'", async () => {
    const { recordBossResult } = await import("@shared/utils/bossResultMemory");
    recordBossResult(BOSS_ID, { score: 130.0, won: false });
    renderBoss();
    await waitFor(() => expect(screen.getByTestId("boss-verdict")).toBeTruthy());
    const verdict = screen.getByTestId("boss-verdict");
    expect(verdict.getAttribute("data-won")).toBe("false");
    expect(verdict.textContent).toMatch(/TODAY'S BOSS GOT YOU · 130\.0/);
    // Target line stays above the loss verdict (same structure as the win case).
    expect(screen.getByText(/Target to beat: 145\.2/)).toBeTruthy();
    expect(screen.getByTestId("boss-take-cta").textContent).toBe("Play Again");
  });
});
