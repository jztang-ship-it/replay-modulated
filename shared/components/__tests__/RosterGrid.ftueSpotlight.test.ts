// shared/components/__tests__/RosterGrid.ftueSpotlight.test.ts
//
// FTUE spotlight — BREATH-ONLY final state. Static-source guard (same precedent
// as the GameView FTUE guards). Pins the scale breath + the FTUE gating, and pins
// that the old gold ring (ftueCardPulse + its z-130 overlay) is fully GONE — so it
// can't regress back to the two-effect distraction.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRID = readFileSync(resolve(__dirname, "../RosterGrid.tsx"), "utf8");

describe("FTUE spotlight — the gold ring is fully removed (breath-only)", () => {
  it("no ftueCardPulse keyframe, animation, or ring overlay remains", () => {
    expect(GRID).not.toMatch(/ftueCardPulse/);
    // no leftover z-130 gold ring overlay
    expect(GRID).not.toMatch(/rgba\(255,177,74/);
  });
});

describe("FTUE spotlight — the card BREATHES by scaling (John's priority)", () => {
  it("ftueSpotlightBreath is a ±2.8% scale oscillation (compounds with the rest-pop)", () => {
    // built fresh (old FTUE had no scale pulse). Slot scale 0.972 <-> 1.028 ×
    // the card's static pop (e.g. 1.08) => ~1.05<->1.11, oscillating around rest.
    expect(GRID).toMatch(/@keyframes ftueSpotlightBreath \{/);
    expect(GRID).toMatch(/0%,100% \{ transform: scale\(0\.972\); \}/);
    expect(GRID).toMatch(/50%\s+\{ transform: scale\(1\.028\); \}/);
  });
  it("the lit-card breath applies to the SLOT at 1.4s ease-in-out infinite", () => {
    // The spotlight breath now fires in HOLD *and* the REVEALING walk (one card
    // at a time) via ftueSpotlightBreath; the exact application line is asserted
    // in the walk/ceremony block below.
    expect(GRID).toMatch(/animation: "ftueSpotlightBreath 1\.4s ease-in-out infinite"/);
  });
});

describe("FTUE breath — extended to the ceremony wall + the reveal walk (Pass A)", () => {
  it("ftueWalk = REVEALING; ftueSpotlightBreath = HOLD or walk (one lit card)", () => {
    expect(GRID).toMatch(/const ftueHold = isFTUE && phase === "HOLD";/);
    expect(GRID).toMatch(/const ftueWalk = isFTUE && isRevealingPhase;/);
    // Pass B folds the RESULTS history beat into the same single-card breath.
    expect(GRID).toMatch(/const ftueSpotlightBreath = ftueHold \|\| ftueWalk \|\| ftueHistory;/);
    expect(GRID).toMatch(/const ftueBreathActive = ftueSpotlightBreath \|\| ftueCeremonyBlink;/);
  });
  it("keyframes inject under ftueBreathActive (HOLD/walk/ceremony), else normal-play DOM is unchanged", () => {
    expect(GRID).toMatch(/\{ftueBreathActive && \(\s*<style>/);
  });
  it("ceremony breathes EVERY card (staggered); HOLD/walk breathe only the spotlight card", () => {
    expect(GRID).toMatch(/ftueCeremonyBlink/);
    expect(GRID).toMatch(/animationDelay: `\$\{\(card\.slotIndex \?\? 0\) \* 0\.12\}s`/);
    expect(GRID).toMatch(/ftueSpotlightBreath && isSpotlight/);
  });
  it("a tap during the walk advances the beat (onFtueWalkAdvance), not lock/flip/reveal", () => {
    expect(GRID).toMatch(/if \(ftueWalk && onFtueWalkAdvance\) \{ onFtueWalkAdvance\(\); return; \}/);
  });
});

describe("FTUE spotlight — gating keeps normal play byte-identical", () => {
  it("isFTUE defaults false; ftueCeremonyBlink defaults false", () => {
    expect(GRID).toMatch(/isFTUE = false,/);
    expect(GRID).toMatch(/ftueCeremonyBlink = false,/);
  });
  it("the dim deepens to 0.72 only under the spotlight breath (HOLD/walk), else the original 0.45", () => {
    expect(GRID).toMatch(/rgba\(4,8,16,\$\{ftueSpotlightBreath \? 0\.72 : 0\.45\}\)/);
  });
});
