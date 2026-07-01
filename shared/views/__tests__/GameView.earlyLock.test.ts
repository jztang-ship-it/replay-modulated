// shared/views/__tests__/GameView.earlyLock.test.ts
//
// Build-phase B2a (retriggered): early-lock fires when the player taps the primary
// CTA in HOLD with EVERY card held — no button. Pins the contract "lock what I see,
// once, no redraw" so a future refactor can't quietly re-route early-lock back
// through the mandatory redraw (the trap: flipping userTappedReveal alone locks an
// INVOLUNTARY redrawn lineup). Also pins the GATED token — userTappedReveal is
// `earlyLock = allHeld && maxRounds > 1`, NOT raw allHeld, so a single-shot sport
// (maxRounds 1) stays byte-identical to today (redraw head + userTappedReveal:false).
//
// Static-source (project does not render GameView — same precedent as
// betOncePerHand / entryFeeCollapse). The HOLD branch extraction reuses those
// files' anchors; the early-lock head keys off the unique `if (earlyLock) {` /
// `// ── REDRAW HEAD` markers.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const GAME_VIEW = read("../GameView.tsx");

const holdBranch = (() => {
  const m = /\n\s*if \(gameState === "HOLD"\) \{([\s\S]*?)\n\s*if \(gameState === "RESULTS" \|\| gameState === "WIN_CELEBRATION"\) \{/.exec(GAME_VIEW);
  expect(m, "HOLD branch must be locatable").not.toBeNull();
  return m![1];
})();
// The early-lock head: from `if (earlyLock) {` to the REDRAW HEAD else marker.
const earlyLockHead = (() => {
  const m = /if \(earlyLock\) \{([\s\S]*?)\n\s*\} else \{\n\s*\/\/ ── REDRAW HEAD/.exec(holdBranch);
  expect(m, "early-lock head must be locatable (if (earlyLock) { … } else { // ── REDRAW HEAD)").not.toBeNull();
  return m![1];
})();
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("B2a — onPrimaryAction derives the trigger from hold count (no param)", () => {
  it("onPrimaryAction takes no args (the early-lock opts param is gone)", () => {
    expect(GAME_VIEW).toMatch(/async function onPrimaryAction\(\) \{/);
    expect(GAME_VIEW).not.toMatch(/opts\?\.earlyLock/);
  });
  it("earlyLock is computed from allHeld (every card held) gated by maxRounds > 1", () => {
    expect(GAME_VIEW).toMatch(/const allHeld = markedRoster\.length > 0 && markedRoster\.every\(c => \(c as any\)\.wasHeld\);/);
    expect(GAME_VIEW).toMatch(/const earlyLock = allHeld && maxRounds > 1 && !ftueActiveNow;/);
  });
});

describe("B2a — early-lock locks the CURRENT lineup, no redraw", () => {
  // (a) The early-lock head must NOT redraw. redrawRoster exists exactly once in
  //     the whole HOLD branch, and it lives in the REDRAW (else) head — never here.
  it("the early-lock head does NOT call redrawRoster", () => {
    expect(earlyLockHead).not.toMatch(/redrawRoster\(/);
  });
  it("redrawRoster appears exactly once in the HOLD branch (only the redraw head)", () => {
    expect(count(holdBranch, /redrawRoster\(/g)).toBe(1);
  });
  it("the early-lock head does NOT enter DRAWING (no redraw choreography)", () => {
    expect(earlyLockHead).not.toMatch(/setGameState\("DRAWING"\)/);
    expect(earlyLockHead).not.toMatch(/beginDraw\(/);
  });

  // (c) On roundsUsed === 1 (freshly dealt, never redrawn) the head resolves the
  //     current roster BEFORE locking; on roundsUsed >= 2 it reuses as-is.
  it("on roundsUsed === 1 it resolves the current (marked) roster first", () => {
    expect(earlyLockHead).toMatch(/if \(roundsUsed === 1\)[\s\S]*?resolveRoster\(\{ finalCards: markedRoster \}\)/);
  });
  it("on roundsUsed >= 2 it reuses the already-resolved roster (no re-resolve)", () => {
    expect(earlyLockHead).toMatch(/\} else \{\s*\n\s*finalRoster = markedRoster;/);
    // resolveRoster is gated inside the roundsUsed===1 arm only — at most one call.
    expect(count(earlyLockHead, /resolveRoster\(/g)).toBe(1);
  });
  it("finalRoster derives from the current (marked) roster, never from a draw", () => {
    expect(earlyLockHead).not.toMatch(/drawnRoster/);
    expect(earlyLockHead).toMatch(/finalRoster = \(resolveRes\?\.roster \?\? resolveRes\?\.cards \?\? markedRoster\)/);
  });
});

describe("B2a — the shared tail locks on the current roster with userTappedReveal", () => {
  // (b) commitRound is fed userTappedReveal: earlyLock (true when the control
  //     fired) and resolvedRoster: finalRoster (the current roster, not a redraw).
  it("commitRound carries userTappedReveal: earlyLock (no longer hardcoded false)", () => {
    expect(holdBranch).toMatch(/userTappedReveal: earlyLock,/);
    expect(holdBranch).not.toMatch(/userTappedReveal: false/);
  });
  it("commitRound's resolvedRoster is finalRoster (the locked-as-seen lineup)", () => {
    expect(holdBranch).toMatch(/resolvedRoster: finalRoster,/);
  });
  it("there is still exactly ONE commitRound call (one shared tail for both heads)", () => {
    expect(count(holdBranch, /commitRound\(/g)).toBe(1);
  });
});

describe("B2a — the token is the GATED earlyLock, not raw allHeld (single-shot byte-identical)", () => {
  it("userTappedReveal is fed earlyLock, and earlyLock carries the maxRounds > 1 gate", () => {
    expect(holdBranch).toMatch(/const earlyLock = allHeld && maxRounds > 1 && !ftueActiveNow;/);
    expect(holdBranch).toMatch(/userTappedReveal: earlyLock,/);
  });
  it("the gate is NOT bypassed — raw allHeld never reaches userTappedReveal or the head", () => {
    // A single-shot sport (maxRounds 1) holding all cards must NOT early-lock:
    // userTappedReveal: allHeld would pass `true` through the redraw head — not today.
    expect(holdBranch).not.toMatch(/userTappedReveal: allHeld/);
    expect(holdBranch).not.toMatch(/if \(allHeld\) \{/);
  });
});

describe("B2a — the trigger reads holds as they are NOW (fresh mark, roster-size-agnostic)", () => {
  it("markedRoster is freshly marked from the CURRENT lockedCardIds at tap time", () => {
    expect(holdBranch).toMatch(/const markedRoster = roster\.map\(c => \(\{ \.\.\.c, wasHeld: lockedCardIds\.has\(cardId\(c\)\) \}\)\);/);
  });
  it("allHeld is computed from markedRoster AFTER the mark and BEFORE head selection", () => {
    const markIdx = holdBranch.indexOf("const markedRoster =");
    const allHeldIdx = holdBranch.indexOf("const allHeld =");
    const headIdx = holdBranch.indexOf("if (earlyLock) {");
    expect(markIdx).toBeGreaterThan(-1);
    expect(allHeldIdx).toBeGreaterThan(markIdx); // mark first, then read holds
    expect(headIdx).toBeGreaterThan(allHeldIdx); // trigger computed before the branch
  });
  it("the all-held guard is length > 0 + every() — no hardcoded roster size (e.g. === 5)", () => {
    expect(holdBranch).toMatch(/markedRoster\.length > 0 && markedRoster\.every\(c => \(c as any\)\.wasHeld\)/);
    // Regression guard: the trigger must never compare the roster to a literal
    // count (markedRoster.length === N). (Scoped to markedRoster so the unrelated
    // heldList.length === 0 seed in the reveal-prep tail is not caught.)
    expect(holdBranch).not.toMatch(/markedRoster\.length === /);
  });
});
