// shared/views/__tests__/GameView.earlyLock.test.ts
//
// Build-phase B2a: the early-lock head of onPrimaryAction's HOLD branch. Pins the
// contract "lock what I see, once, no redraw" so a future refactor can't quietly
// re-route early-lock back through the mandatory redraw (the exact trap the spec
// called out: flipping userTappedReveal alone locks an INVOLUNTARY redrawn lineup).
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
const GAME_BAR = read("../../components/GameBar.tsx");

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

describe("B2a — onPrimaryAction takes the early-lock opt", () => {
  it("the signature accepts an optional { earlyLock } param", () => {
    expect(GAME_VIEW).toMatch(/async function onPrimaryAction\(opts\?: \{ earlyLock\?: boolean \}\)/);
    expect(GAME_VIEW).toMatch(/const earlyLock = !!opts\?\.earlyLock;/);
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

describe("B2a — UI trigger wiring (GameView → GameBar)", () => {
  it("GameView wires onEarlyLock to onPrimaryAction({ earlyLock: true }) — distinct from onAction", () => {
    expect(GAME_VIEW).toMatch(/onEarlyLock=\{\(\) => onPrimaryAction\(\{ earlyLock: true \}\)\}/);
  });
  it("GameView gates the control on maxRounds > 1 (single-shot sports never see it)", () => {
    expect(GAME_VIEW).toMatch(/showEarlyLock=\{maxRounds > 1\}/);
  });
  it("GameBar renders the early-lock button in HOLD, gated on showEarlyLock + onEarlyLock", () => {
    expect(GAME_BAR).toMatch(/gameState === "HOLD" && showEarlyLock && onEarlyLock/);
    expect(GAME_BAR).toMatch(/data-action="early-lock"/);
    expect(GAME_BAR).toMatch(/onClick=\{onEarlyLock\}/);
  });
  it("showEarlyLock defaults false (a caller that omits it gets no control)", () => {
    expect(GAME_BAR).toMatch(/showEarlyLock = false/);
  });
});
