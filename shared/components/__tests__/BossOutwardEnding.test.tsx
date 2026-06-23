// @vitest-environment jsdom
/**
 * shared/components/__tests__/BossOutwardEnding.test.tsx
 *
 * Phase 2-mount Step 5 — the outward ending (the invariant's seat).
 *   - fresh win → records, win headline + score, Challenge/Copy above, Play Again below
 *   - fresh loss → loss headline + enemy-referential sub (never self-referential)
 *   - revisit (no freshResult, memory seeded) → byte-identical render to fresh
 *   - Play Again fires onPlayAgain; Copy Link writes the boss URL
 *   - recordBossResult keeps best score (attempted-not-per-play, no regress)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BossOutwardEnding } from "../BossOutwardEnding";
import { getBossResult, recordBossResult } from "@shared/utils/bossResultMemory";

const BOSS_ID = "boss-uuid-step5";

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("BossOutwardEnding", () => {
  it("fresh WIN: records + win headline + score + outward branch + Play Again", async () => {
    render(<BossOutwardEnding sport="basketball" bossChallengeId={BOSS_ID} freshResult={{ score: 233.5, won: true }} onPlayAgain={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("boss-outward-ending")).toBeTruthy());
    expect(screen.getByTestId("boss-outward-ending").getAttribute("data-won")).toBe("true");
    expect(screen.getByText(/YOU BEAT TODAY'S BOSS/)).toBeTruthy();
    expect(screen.getByTestId("boss-outward-score").textContent).toMatch(/You scored 233\.5/);
    // Outward branch present + Play Again present.
    expect(screen.getByTestId("boss-challenge-someone")).toBeTruthy();
    expect(screen.getByTestId("boss-copy-link")).toBeTruthy();
    expect(screen.getByTestId("boss-play-again")).toBeTruthy();
    // Recorded.
    expect(getBossResult(BOSS_ID)).toEqual({ score: 233.5, won: true });
  });

  it("fresh LOSS (no target → far): run-it-back framing, no forward, never self-referential", async () => {
    render(<BossOutwardEnding sport="basketball" bossChallengeId={BOSS_ID} freshResult={{ score: 180, won: false }} onPlayAgain={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("boss-outward-ending")).toBeTruthy());
    expect(screen.getByTestId("boss-outward-ending").getAttribute("data-won")).toBe("false");
    expect(screen.getByText(/TODAY'S BOSS GOT YOU/)).toBeTruthy();
    // delta-a: no targetScore → margin unknown → far-loss sub, NOT the
    // pre-delta-a "Think you survive them?" enemy-referential share line.
    expect(screen.getByText(/The boss held\./)).toBeTruthy();
    expect(screen.queryByText(/Think you survive them\?/)).toBeNull();
    // delta-a: a loss never forwards (beat-to-send is win-only).
    expect(screen.queryByTestId("boss-challenge-someone")).toBeNull();
    expect(screen.queryByTestId("boss-copy-link")).toBeNull();
    // No self-referential "beat my score" framing.
    expect(screen.queryByText(/beat my score/i)).toBeNull();
  });

  // delta-a: MARQUEE no longer drives loss copy. A marquee loss at margin >
  // NEAR_MISS_MARGIN (5) reads as a far loss ("The boss held."), NOT the
  // pre-delta-a margin-based marquee share line.
  it("marquee LOSS (margin > near-miss): far-loss copy; marquee no longer drives loss share", async () => {
    render(
      <BossOutwardEnding
        sport="basketball"
        bossChallengeId={BOSS_ID}
        freshResult={{ score: 182, won: false }}
        marquee
        targetScore={200}
        bossName="the '15-16 Warriors"
        onPlayAgain={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("boss-outward-ending")).toBeTruthy());
    // margin = round(200 - 182) = 18 > 5 → far loss.
    expect(screen.getByText(/The boss held\./)).toBeTruthy();
    // The pre-delta-a marquee margin share line is gone.
    expect(screen.queryByText(/within 18 of the '15-16 Warriors/)).toBeNull();
    expect(screen.queryByText(/Think you survive them\?/)).toBeNull();
    // Loss → no forward.
    expect(screen.queryByTestId("boss-challenge-someone")).toBeNull();
  });

  it("marquee WIN still terminates outward (outward branch + Play Again present)", async () => {
    render(
      <BossOutwardEnding
        sport="basketball"
        bossChallengeId={BOSS_ID}
        freshResult={{ score: 210, won: true }}
        marquee
        targetScore={200}
        bossName="the '15-16 Warriors"
        onPlayAgain={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("boss-outward-ending")).toBeTruthy());
    expect(screen.getByTestId("boss-challenge-someone")).toBeTruthy();
    expect(screen.getByTestId("boss-copy-link")).toBeTruthy();
    expect(screen.getByTestId("boss-play-again")).toBeTruthy();
  });

  it("revisit (no freshResult, memory seeded) renders identically from the same source", async () => {
    recordBossResult(BOSS_ID, { score: 233.5, won: true });
    render(<BossOutwardEnding sport="basketball" bossChallengeId={BOSS_ID} onPlayAgain={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("boss-outward-ending")).toBeTruthy());
    expect(screen.getByText(/YOU BEAT TODAY'S BOSS/)).toBeTruthy();
    expect(screen.getByTestId("boss-outward-score").textContent).toMatch(/You scored 233\.5/);
  });

  it("loss: Run it back fires onPlayAgain; Play Again is win-only (absent on loss)", async () => {
    const onPlayAgain = vi.fn();
    render(<BossOutwardEnding sport="basketball" bossChallengeId={BOSS_ID} freshResult={{ score: 100, won: false }} onPlayAgain={onPlayAgain} />);
    // delta-a: the loss CTA is run-it-back (replays the boss via onPlayAgain);
    // the below-line "Play Again" is win-only, so it's absent on a loss.
    await waitFor(() => expect(screen.getByTestId("boss-run-it-back")).toBeTruthy());
    expect(screen.queryByTestId("boss-play-again")).toBeNull();
    fireEvent.click(screen.getByTestId("boss-run-it-back"));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it("Copy Link (win) writes the forward URL with ?ref; absent on loss", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    // Win: Copy Link present, writes the boss URL — now with the delta-b ?ref
    // token appended BESIDE the single boss id.
    const win = render(<BossOutwardEnding sport="basketball" bossChallengeId={BOSS_ID} freshResult={{ score: 233.5, won: true }} onPlayAgain={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("boss-copy-link")).toBeTruthy());
    fireEvent.click(screen.getByTestId("boss-copy-link"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`/basketball/challenge/${BOSS_ID}`));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("?ref="));
    win.unmount();
    // Loss: forward is win-only → Copy Link absent. Fresh id so the sticky-win
    // memory from the win render above doesn't bleed in and re-show the forward.
    localStorage.clear();
    render(<BossOutwardEnding sport="basketball" bossChallengeId={`${BOSS_ID}-loss`} freshResult={{ score: 100, won: false }} onPlayAgain={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("boss-outward-ending")).toBeTruthy());
    expect(screen.queryByTestId("boss-copy-link")).toBeNull();
  });

  it("variant='cta-only' (results-overlay slot): drops headline/score/sub, keeps the CTAs", async () => {
    // 2026-06-23 boss-result unification. In the unified results overlay the
    // human board carries the verdict (center line) + both totals (ZoneHeaders),
    // so the slot drops the headline/score/sub to avoid duplicating it. The
    // share/replay CTAs (and their machinery) stay.
    render(
      <BossOutwardEnding
        variant="cta-only"
        sport="basketball"
        bossChallengeId={BOSS_ID}
        freshResult={{ score: 233.5, won: true }}
        onPlayAgain={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("boss-outward-ending")).toBeTruthy());
    // Verdict chrome dropped — the board provides it now.
    expect(screen.queryByText(/YOU BEAT TODAY'S BOSS/)).toBeNull();
    expect(screen.queryByTestId("boss-outward-score")).toBeNull();
    // CTAs (+ result memory) intact.
    expect(screen.getByTestId("boss-challenge-someone")).toBeTruthy();
    expect(screen.getByTestId("boss-copy-link")).toBeTruthy();
    expect(screen.getByTestId("boss-play-again")).toBeTruthy();
    expect(getBossResult(BOSS_ID)).toEqual({ score: 233.5, won: true });
  });

  it("variant='cta-only' loss: drops verdict chrome, keeps run-it-back", async () => {
    render(
      <BossOutwardEnding
        variant="cta-only"
        sport="basketball"
        bossChallengeId={`${BOSS_ID}-cta-loss`}
        freshResult={{ score: 100, won: false }}
        onPlayAgain={() => {}}
      />
    );
    await waitFor(() => expect(screen.getByTestId("boss-run-it-back")).toBeTruthy());
    expect(screen.queryByText(/TODAY'S BOSS GOT YOU/)).toBeNull();
    expect(screen.queryByTestId("boss-outward-score")).toBeNull();
    expect(screen.queryByTestId("boss-challenge-someone")).toBeNull();
  });

  it("recordBossResult keeps best score + sticky win (attempted-not-per-play)", () => {
    recordBossResult(BOSS_ID, { score: 200, won: false });
    recordBossResult(BOSS_ID, { score: 150, won: true }); // worse score, but a win
    expect(getBossResult(BOSS_ID)).toEqual({ score: 200, won: true }); // best score, sticky win
  });
});
