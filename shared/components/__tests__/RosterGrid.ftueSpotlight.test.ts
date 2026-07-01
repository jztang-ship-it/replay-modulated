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
  it("applied to the lit SLOT (compounds with the card scale) at 1.4s ease-in-out infinite", () => {
    expect(GRID).toMatch(/ftueHold && isSpotlight\s*\?\s*\{ transformOrigin: "center", animation: "ftueSpotlightBreath 1\.4s ease-in-out infinite"/);
  });
});

describe("FTUE spotlight — gating keeps normal play byte-identical", () => {
  it("isFTUE defaults false", () => {
    expect(GRID).toMatch(/isFTUE = false,/);
  });
  it("the treatment is confined to FTUE + the HOLD phase", () => {
    expect(GRID).toMatch(/const ftueHold = isFTUE && phase === "HOLD";/);
    // pulse only on the lit card during ftueHold
    expect(GRID).toMatch(/ftueHold && isSpotlight/);
    // keyframes only injected under ftueHold (normal-play DOM unchanged)
    expect(GRID).toMatch(/\{ftueHold && \(\s*<style>/);
  });
  it("the dim deepens to 0.72 only under ftueHold, else the original 0.45", () => {
    expect(GRID).toMatch(/rgba\(4,8,16,\$\{ftueHold \? 0\.72 : 0\.45\}\)/);
  });
});
