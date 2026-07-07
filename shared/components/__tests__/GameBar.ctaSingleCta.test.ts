// shared/components/__tests__/GameBar.ctaSingleCta.test.ts
//
// CTA-row single-CTA model guard. REPLAY and CHALLENGE are NEVER co-present in the
// results CTA row: CHALLENGE is the sole dominant CTA on a hot/undismissed hand, else
// REPLAY is the lone centered CTA. This removes the old two-button displacement (REPLAY
// shrunk to 120px + de-centered) at its root. Goes red if a future edit lets them
// co-render or reintroduces the shrink/de-center branches.
//
// Static-source guard (same precedent as GameView.ftueRouting / GameBar has no render harness).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAME_BAR = readFileSync(resolve(__dirname, "../GameBar.tsx"), "utf8");
const GAME_VIEW = readFileSync(resolve(__dirname, "../../views/GameView.tsx"), "utf8");

describe("CTA row — REPLAY and CHALLENGE are mutually exclusive (single-CTA)", () => {
  it("REPLAY is gated on !challengeAvailable at BOTH render sites (normal + WIN_CELEBRATION)", () => {
    const gates = GAME_BAR.match(/\{!challengeAvailable && \(/g) ?? [];
    expect(gates.length).toBe(2);
  });

  it("the REPLAY challenge-shrink branch is GONE (no width: challengeAvailable ? 120)", () => {
    expect(GAME_BAR).not.toMatch(/challengeAvailable \? 120/);
  });

  it("the row no longer switches layout when challenge is present (gap / marginLeft branches removed)", () => {
    // Container stays justifyContent:center; icons stay absolute-right — REPLAY never
    // de-centers because it simply isn't rendered when CHALLENGE owns the slot.
    expect(GAME_BAR).not.toMatch(/challengeAvailable \? \{ gap: 8 \}/);
    expect(GAME_BAR).not.toMatch(/challengeAvailable \? \{ marginLeft/);
  });

  it("the dominant CHALLENGE CTA and its in-flow 'not this one' dismiss both exist", () => {
    expect(GAME_BAR).toMatch(/data-action="challenge"/);
    expect(GAME_BAR).toMatch(/data-action="challenge-dismiss"/);
    expect(GAME_BAR).toMatch(/not this one/);
  });
});

describe("CTA row — closing the share overlay does NOT collapse the challenge", () => {
  it("the ChallengeSharePrompt mount handlers (onDismiss/onConsumed) never clear the trigger", () => {
    // Single-CTA regression pin: setChallengeTrigger(null) in these handlers would flip
    // challengeAvailable false and swap CHALLENGE for REPLAY on one sheet-close mis-tap.
    // Only "not this one" (setChallengeDismissed) may collapse. Goes red if a future edit
    // re-adds the trigger clear to the mount handlers.
    const start = GAME_VIEW.indexOf("<ChallengeSharePrompt");
    const end = GAME_VIEW.indexOf("</Suspense>", start);
    const mount = GAME_VIEW.slice(start, end);
    expect(mount).toMatch(/onConsumed=/); // sanity: correct block
    expect(mount).not.toMatch(/setChallengeTrigger\(null\)/);
  });
});
