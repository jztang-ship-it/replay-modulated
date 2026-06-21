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

  it("fresh LOSS: enemy-referential, never self-referential", async () => {
    render(<BossOutwardEnding sport="basketball" bossChallengeId={BOSS_ID} freshResult={{ score: 180, won: false }} onPlayAgain={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("boss-outward-ending")).toBeTruthy());
    expect(screen.getByTestId("boss-outward-ending").getAttribute("data-won")).toBe("false");
    expect(screen.getByText(/TODAY'S BOSS GOT YOU/)).toBeTruthy();
    expect(screen.getByText(/Think you survive them\?/)).toBeTruthy();
    // No self-referential "beat my score" framing.
    expect(screen.queryByText(/beat my score/i)).toBeNull();
  });

  // Phase 2-mount Step 4 — two-tier framing. A MARQUEE boss loss uses
  // margin-based copy (the near-miss is the draw), referencing the boss by
  // name + the margin — NOT the generic beatable enemy line.
  it("marquee LOSS: margin-based copy referencing the boss + the margin", async () => {
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
    // margin = round(200 - 182) = 18, boss referenced by name.
    expect(screen.getByText(/within 18 of the '15-16 Warriors/)).toBeTruthy();
    // NOT the generic beatable enemy line.
    expect(screen.queryByText(/Think you survive them\?/)).toBeNull();
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

  it("Play Again fires onPlayAgain (never alone, but present)", async () => {
    const onPlayAgain = vi.fn();
    render(<BossOutwardEnding sport="basketball" bossChallengeId={BOSS_ID} freshResult={{ score: 100, won: false }} onPlayAgain={onPlayAgain} />);
    await waitFor(() => expect(screen.getByTestId("boss-play-again")).toBeTruthy());
    fireEvent.click(screen.getByTestId("boss-play-again"));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it("Copy Link writes the boss URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<BossOutwardEnding sport="basketball" bossChallengeId={BOSS_ID} freshResult={{ score: 100, won: false }} onPlayAgain={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("boss-copy-link")).toBeTruthy());
    fireEvent.click(screen.getByTestId("boss-copy-link"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(`/basketball/challenge/${BOSS_ID}`));
  });

  it("recordBossResult keeps best score + sticky win (attempted-not-per-play)", () => {
    recordBossResult(BOSS_ID, { score: 200, won: false });
    recordBossResult(BOSS_ID, { score: 150, won: true }); // worse score, but a win
    expect(getBossResult(BOSS_ID)).toEqual({ score: 200, won: true }); // best score, sticky win
  });
});
