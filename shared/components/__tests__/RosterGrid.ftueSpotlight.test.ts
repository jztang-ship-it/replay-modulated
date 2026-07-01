// shared/components/__tests__/RosterGrid.ftueSpotlight.test.ts
//
// FTUE polish #1 — the RECOVERED spotlight pulse + deeper dim. Static-source
// guard (same precedent as the GameView FTUE guards). Pins the pulse to the
// EXACT recovered spec (CardBackGeneric@21706b1e ftueCardPulse) so a refactor
// can't silently drop it or re-approximate a new one, and pins the FTUE gating
// so normal play stays byte-identical.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRID = readFileSync(resolve(__dirname, "../RosterGrid.tsx"), "utf8");

describe("FTUE spotlight — recovered pulse spec (not an approximation)", () => {
  it("ftueCardPulse keyframes are the recovered gold-ring pulse, verbatim", () => {
    // rest (0/100%): 2px gold ring @ 0.5 ; peak (50%): 3px @ full + 18px glow.
    expect(GRID).toMatch(/@keyframes ftueCardPulse \{/);
    expect(GRID).toMatch(/0%,100% \{ box-shadow: 0 8px 24px rgba\(0,0,0,0\.4\), 0 0 0 2px rgba\(255,177,74,0\.5\); \}/);
    expect(GRID).toMatch(/50%\s+\{ box-shadow: 0 8px 24px rgba\(0,0,0,0\.4\), 0 0 0 3px rgba\(255,177,74,1\), 0 0 18px rgba\(255,177,74,0\.5\); \}/);
  });
  it("applied to the lit card with the recovered timing (1.4s ease-in-out infinite)", () => {
    expect(GRID).toMatch(/animation: "ftueCardPulse 1\.4s ease-in-out infinite"/);
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
