// shared/views/__tests__/_useReveal.allHeldReveal.test.ts
//
// B2a regression: early-lock with EVERY card held must reveal to completion, not
// hang in REVEALING. Root cause was onAnchorFpComplete's skip-first-anchor guard:
// in tap mode with held cards it skipped the FIRST anchor-complete call, assuming
// an unheld sequence's anchor fires first and the held anchor fires second. In the
// all-held case useEmotionalReveal runs revealHeldCards with NO unheld sequence, so
// onAnchorFpComplete fires ONCE (the held anchor) — swallowing it left the spring
// unfired and the hand stuck in REVEALING. The fix gates the skip on hasUnheldCards
// so the lone held-anchor call drives the spring when there are zero unheld cards.
//
// Static-source (the reveal hook has no render harness here — same precedent as
// betOncePerHand, which also reads _useReveal.ts as text). Runtime completion is a
// device-glass item; this test pins the guard so the gate can't be silently dropped.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const USE_REVEAL = read("../_useReveal.ts");

// Scope every assertion to the onAnchorFpComplete callback body so a like-named
// pattern elsewhere can't satisfy (or break) the guard checks.
const onAnchorFpComplete = (() => {
  const m = /const onAnchorFpComplete = useCallback\(\(_hookTotal: number\) => \{([\s\S]*?)\n  \}, \[/.exec(USE_REVEAL);
  expect(m, "onAnchorFpComplete callback must be locatable").not.toBeNull();
  return m![1];
})();

describe("B2a — all-held reveal completes (onAnchorFpComplete skip-first guard)", () => {
  it("computes hasUnheldCards from the resolved roster (any card NOT held)", () => {
    expect(onAnchorFpComplete).toMatch(/const hasUnheldCards = rosterRef\.current\.some\(\(c: any\) => !c\.wasHeld\);/);
  });

  it("still computes hasHeldCards (unchanged) — the two-anchor case is preserved", () => {
    expect(onAnchorFpComplete).toMatch(/const hasHeldCards = rosterRef\.current\.some\(\(c: any\) => c\.wasHeld\);/);
  });

  it("skips the first anchor-complete ONLY when BOTH held and unheld cards exist", () => {
    // The gate must require hasUnheldCards — this is what lets the all-held case
    // (no unheld sequence, one anchor call) fall through and fire the spring.
    expect(onAnchorFpComplete).toMatch(
      /if \(hasHeldCards && hasUnheldCards && anchorFpCallCountRef\.current === 0 && !isSkipping\) \{/,
    );
  });

  it("does NOT use the old ungated guard (hasHeldCards without hasUnheldCards) — the hang regression", () => {
    // The pre-fix guard. Its return swallowed the lone held-anchor call in the
    // all-held case. Asserting its absence catches a silent revert of the gate.
    expect(onAnchorFpComplete).not.toMatch(
      /if \(hasHeldCards && anchorFpCallCountRef\.current === 0 && !isSkipping\) \{/,
    );
  });
});
