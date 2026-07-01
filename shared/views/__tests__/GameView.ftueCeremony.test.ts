// shared/views/__tests__/GameView.ftueCeremony.test.ts
//
// feat/ftue-scripted-hand — the FTUE opening ceremony wall. Static-source guard
// (project does not render GameView — same precedent as GameView.ftueRouting).
// Pins the wiring so a refactor can't quietly:
//   (a) drop the ftueActive + dataReady gate (ceremony leaking into normal play),
//   (b) let a primary action deal WHILE the wall is showing/flipping,
//   (c) route the deal off a timer instead of the real flip-complete event,
//   (d) break the tap-through → flip → deal chain.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAME_VIEW = readFileSync(resolve(__dirname, "../GameView.tsx"), "utf8");

describe("FTUE ceremony — the show-wall effect is FTUE + pool-ready gated (once)", () => {
  it("only runs for ftueActive, in IDLE, once the pool is ready (dataReady)", () => {
    expect(GAME_VIEW).toMatch(/if \(!ftueActive \|\| gameState !== "IDLE" \|\| !dataReady\) return;/);
    // once-guard so the wall shows a single time per FTUE
    expect(GAME_VIEW).toMatch(/if \(ceremonyStartedRef\.current\) return;/);
    expect(GAME_VIEW).toMatch(/ceremonyStartedRef\.current = true;/);
  });
  it("pulls the five real cards from the adapter (sport-specific data off shared)", () => {
    expect(GAME_VIEW).toMatch(/adapter\.ftueScriptedHand\?\.ceremony/);
    expect(GAME_VIEW).toMatch(/if \(!cards\.length\) return;/); // empty → skip, normal deal
    // settle face-up via the existing flip machinery (no bespoke flip state)
    expect(GAME_VIEW).toMatch(/flipState\.initCards\(ids\);/);
    expect(GAME_VIEW).toMatch(/for \(const id of ids\) flipState\.completeReveal\(id\);/);
    // verbatim line pushed through the commentary override, sticky:false so the
    // tap-through fires onCommentaryOverrideDone (sticky:true would swallow it)
    expect(GAME_VIEW).toMatch(/adapter\.ftueScriptedHand\?\.ceremonyLine/);
    expect(GAME_VIEW).toMatch(/setFtueCommentaryOverride\(\{ parts: \[line\], sticky: false \}\)/);
  });
});

describe("FTUE ceremony — a primary action cannot deal while the wall is up", () => {
  it("the IDLE branch bails during the ceremony (cards/flipping), not when done", () => {
    expect(GAME_VIEW).toMatch(
      /if \(ftueActiveNow && \(ceremonyPhaseRef\.current === "cards" \|\| ceremonyPhaseRef\.current === "flipping"\)\) return;/,
    );
  });
});

describe("FTUE ceremony — tap → flip → deal chains off the REAL flip-complete event", () => {
  it("the commentary tap-through triggers the flip (cards phase only)", () => {
    expect(GAME_VIEW).toMatch(/if \(ceremonyPhaseRef\.current === "cards"\) \{ runCeremonyFlipThenDeal\(\); return; \}/);
  });
  it("the deal fires off transitionend(transform) of the last card — NOT a timer", () => {
    // event-driven: a transitionend listener filtered to transform + the last
    // card's data-cardid; the setTimeouts stagger the flip STARTS only.
    expect(GAME_VIEW).toMatch(/addEventListener\("transitionend", onEnd, true\)/);
    expect(GAME_VIEW).toMatch(/e\.propertyName !== "transform"/);
    expect(GAME_VIEW).toMatch(/host\.getAttribute\("data-cardid"\) !== lastId/);
    // the deal re-enters via onPrimaryActionRef (fresh closure), after phase→done
    expect(GAME_VIEW).toMatch(/ceremonyPhaseRef\.current = "done";\s*\n\s*onPrimaryActionRef\.current\(\);/);
    // staggered flip STARTS use beginDraw per card (front→back), L→R
    expect(GAME_VIEW).toMatch(/ids\.forEach\(\(id, i\) => setTimeout\(\(\) => flipState\.beginDraw\(\[id\]\), i \* 120\)\);/);
  });
});
