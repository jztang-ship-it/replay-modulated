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

describe("FTUE ceremony — the show-wall effect is FTUE + players-ready gated (once)", () => {
  it("mounts on PLAYERS-loaded (not dataReady/gamelogs) — closes the load-race", () => {
    // Gate is ftuePlayersReady (players.json ~176 KB), NOT dataReady (waits for
    // the 9.5 MB gamelogs). The players-only fast path feeds it.
    expect(GAME_VIEW).toMatch(/if \(!ftueActive \|\| gameState !== "IDLE" \|\| !ftuePlayersReady\) return;/);
    expect(GAME_VIEW).toMatch(/ensurePlayersLoaded\(\)\s*\.then\(\(\) => \{ if \(!cancelled && arePlayersLoaded\(\)\) setFtuePlayersReady\(true\); \}\)/);
    // once-guard so the wall shows a single time per FTUE
    expect(GAME_VIEW).toMatch(/if \(ceremonyStartedRef\.current\) return;/);
    expect(GAME_VIEW).toMatch(/ceremonyStartedRef\.current = true;/);
  });
  it("the FTUE deal is gated until players are ready (a load-window tap can't skip the wall)", () => {
    expect(GAME_VIEW).toMatch(/if \(ftueActiveNow && !ftuePlayersReadyRef\.current\) return;/);
  });
  it("pulls the five real cards from the adapter (sport-specific data off shared)", () => {
    expect(GAME_VIEW).toMatch(/adapter\.ftueScriptedHand\?\.ceremony/);
    expect(GAME_VIEW).toMatch(/if \(!cards\.length\) return;/); // empty → skip, normal deal
    // settle face-up via the existing flip machinery (no bespoke flip state)
    expect(GAME_VIEW).toMatch(/flipState\.initCards\(ids\);/);
    expect(GAME_VIEW).toMatch(/for \(const id of ids\) flipState\.completeReveal\(id\);/);
    // verbatim line pushed through the commentary override, sticky:true so
    // tapping the line is inert — DEAL is the only advance gesture.
    expect(GAME_VIEW).toMatch(/adapter\.ftueScriptedHand\?\.ceremonyLine/);
    expect(GAME_VIEW).toMatch(/setFtueCommentaryOverride\(\{ parts: \[line\], sticky: true \}\)/);
  });
});

describe("FTUE ceremony — DEAL-to-dismiss (DEAL is the only gesture)", () => {
  it("pressing DEAL in the cards phase runs the flip (not a block, not a tap)", () => {
    // In the IDLE branch of onPrimaryAction — the DEAL press owns the transition.
    expect(GAME_VIEW).toMatch(/if \(ftueActiveNow && ceremonyPhaseRef\.current === "cards"\) \{ runCeremonyFlipThenDeal\(\); return; \}/);
    // a re-press during the flip is ignored (the event owns the deal)
    expect(GAME_VIEW).toMatch(/if \(ftueActiveNow && ceremonyPhaseRef\.current === "flipping"\) return;/);
  });
  it("the tap-to-flip via onCommentaryOverrideDone is GONE (no intermediate tap)", () => {
    // the ceremony-advance line must NOT live in the commentary-done handler anymore
    const doneHandler = /onCommentaryOverrideDone=\{\(\) => \{([\s\S]*?)\n\s*\}\}/.exec(GAME_VIEW)?.[1] ?? "";
    expect(doneHandler).not.toMatch(/runCeremonyFlipThenDeal/);
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
