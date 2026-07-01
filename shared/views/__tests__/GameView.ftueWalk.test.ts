// shared/views/__tests__/GameView.ftueWalk.test.ts
//
// feat/ftue-scripted-hand Pass A — regression guard for the REVEAL WALK.
// The walk is a tap-advance sequence over the five beats (Tobias → Zion →
// Draymond → Edwards → Giannis) where each card's FP + fire/ice rolls up ON
// its beat (walk-drives-the-reveal). The #1 risk is the per-beat held-rollup
// gating regressing NORMAL play, so every walk seam is ftueActive-gated and the
// engine gate (onBeforeEachHeld) defaults OFF → byte-identical.
//
// Static-source (project does not render GameView — same precedent as
// GameView.ftueRouting / earlyLock / betOncePerHand).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAME_VIEW = readFileSync(resolve(__dirname, "../GameView.tsx"), "utf8");
const REVEAL = readFileSync(resolve(__dirname, "../../hooks/useEmotionalReveal.ts"), "utf8");
const GAME_BAR = readFileSync(resolve(__dirname, "../../components/GameBar.tsx"), "utf8");

describe("FTUE reveal walk — the engine held-rollup gate defaults OFF (byte-identical)", () => {
  it("onBeforeEachHeld is an optional param; absent → auto-chain + full pre-pause", () => {
    expect(REVEAL).toMatch(/onBeforeEachHeld\?:\s*\(index: number, reveal: \(\) => void\) => void;/);
    // gated: gate each held card, else run immediately (today's auto-chain)
    expect(REVEAL).toMatch(/if \(params\.onBeforeEachHeld\) params\.onBeforeEachHeld\(idx, runIt\);\s*\n\s*else runIt\(\);/);
    // suspense pre-pause skipped ONLY when the walk owns the pace
    expect(REVEAL).toMatch(/params\.onBeforeEachHeld \? 0 : PRE_PAUSE_MS/);
    // non-FTUE fast-roll of non-anchor held cards is preserved (auto-chain only)
    expect(REVEAL).toMatch(/const fastRoll = !params\.onBeforeEachHeld && hc\.cardId !== anchorId;/);
  });

  it("GameView only arms the held gate when ftueActive (else undefined → auto-chain)", () => {
    expect(GAME_VIEW).toMatch(/onBeforeEachHeld: ftueActive/);
    expect(GAME_VIEW).toMatch(/pendingHeldRevealRef\.current = reveal;/);
    expect(GAME_VIEW).toMatch(/ftueWalkBusyRef\.current = false;/);
  });
});

describe("FTUE reveal walk — tap-advance owns the beat (no skip)", () => {
  it("advanceFtueWalk reveals the next unrevealed walk card and latches busy mid-beat", () => {
    expect(GAME_VIEW).toMatch(/function advanceFtueWalk\(\)/);
    expect(GAME_VIEW).toMatch(/if \(ftueWalkBusyRef\.current\) return;/);
    // next = first walk-order id not yet revealed (tapped ∪ heldRevealed)
    expect(GAME_VIEW).toMatch(/const next = ftueWalkOrder\.find\(\(id\) => !revealed\.has\(id\)\);/);
    // held → fire the armed reveal; unheld → tapRevealCard
    expect(GAME_VIEW).toMatch(/const fn = pendingHeldRevealRef\.current;/);
    expect(GAME_VIEW).toMatch(/tapRevealCard\(next\);/);
  });

  it("all three advance routes are ftueActive-gated (GAME TIME, stage tap, card tap)", () => {
    // GAME TIME primary CTA
    expect(GAME_VIEW).toMatch(/if \(ftueActive\) \{ advanceFtueWalk\(\); return; \}/);
    // card-stage tap
    expect(GAME_VIEW).toMatch(/ftueActive && gameState === "REVEALING"\s*\n?\s*\?\s*advanceFtueWalk/);
    // card tap routes through RosterGrid's onFtueWalkAdvance only during the walk
    expect(GAME_VIEW).toMatch(/onFtueWalkAdvance=\{ftueActive && gameState === "REVEALING" \? advanceFtueWalk : undefined\}/);
  });
});

describe("FTUE reveal walk — Pass A finale + completion", () => {
  it("the placeholder result-sequence is SUPPRESSED; completion flag fires at the win screen", () => {
    // no result override is set anymore — just the set-once done flag
    expect(GAME_VIEW).toMatch(/localStorage\.setItem\("rm_solo_ftue_done", "1"\)/);
    expect(GAME_VIEW).not.toMatch(/ftueCopy\.resultBaseline, ftueCopy\.resultThesis/);
  });
  it("the R3-entry intro beat fires once at REVEALING", () => {
    expect(GAME_VIEW).toMatch(/if \(ftueIntroShownRef\.current\) return;/);
    expect(GAME_VIEW).toMatch(/ftueCopy\.revealIntro/);
  });
});

describe("FTUE reveal walk — GameBar relabels AUTO → GAME TIME (FTUE only)", () => {
  it("REVEALING label is GAME TIME under ftue, AUTO otherwise", () => {
    expect(GAME_BAR).toMatch(/if \(state === "REVEALING"\) return ftue \? "GAME TIME" : "AUTO";/);
  });
  it("the primary-CTA blink OR-s ftuePrimaryPulse into the existing replay pulse", () => {
    expect(GAME_BAR).toMatch(/\(replayPulse \|\| ftuePrimaryPulse\) \? "replayPulse 1\.2s ease-in-out infinite" : "none"/);
    expect(GAME_BAR).toMatch(/ftueActive = false,/);
    expect(GAME_BAR).toMatch(/ftuePrimaryPulse = false,/);
  });
});
