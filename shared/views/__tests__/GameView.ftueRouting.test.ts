// shared/views/__tests__/GameView.ftueRouting.test.ts
//
// feat/ftue-scripted-hand — regression guard for the scripted-FTUE injection.
// The #1 risk is the FTUE wire regressing NORMAL play. Injection is a pure
// ternary `ftueActive ? adapter.ftueScriptedHand!.X(...) : adapter.X(...)`, so
// when ftueActive is false EVERY site takes the byte-identical non-FTUE path.
// This pins: (a) the gate is basketball-only + solo-only + first-run, and
// (b) each of the 4 sites keeps the adapter call on the `:` (non-FTUE) branch.
//
// Static-source (project does not render GameView — same precedent as
// GameView.earlyLock / betOncePerHand).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAME_VIEW = readFileSync(resolve(__dirname, "../GameView.tsx"), "utf8");

describe("scripted FTUE — gate is structural (basketball + solo + first-run only)", () => {
  it("ftueActive requires first-run ref AND !challengeCtx AND adapter.ftueScriptedHand AND not-signed-in", () => {
    expect(GAME_VIEW).toMatch(
      /const ftueActive = soloFtueFirstRunRef\.current && !challengeCtx && !!adapter\.ftueScriptedHand/,
    );
    // NEW A + glass-round-2 truth table: gate requires RESOLVED-anonymous —
    // authReady (INITIAL_SESSION handled, isAnonymous trustworthy) + isAnonymous.
    // TRUE only for a settled anon (incl. localStorage-only user=null); FALSE for
    // signed-in AND the loading window (authReady=false).
    expect(GAME_VIEW).toMatch(/&& authReady && isAnonymous;/);
    // ...and the first-run ref is re-evaluated at each new-hand deal (termination),
    // with a FRESH ftueActiveNow gate used for the deal/round injections (no
    // one-deal-late double-deal).
    expect(GAME_VIEW).toMatch(/soloFtueFirstRunRef\.current = isSoloFtueFirstRun\(\);/);
    expect(GAME_VIEW).toMatch(/const ftueActiveNow = soloFtueFirstRunRef\.current && !challengeCtx && !!adapter\.ftueScriptedHand/);
  });
  it("first-run comes from the shared isSoloFtueFirstRun() helper (anon-safe), NOT profile ftueCompleted", () => {
    expect(GAME_VIEW).toMatch(/useRef<boolean>\(isSoloFtueFirstRun\(\)\)/);
    expect(GAME_VIEW).not.toMatch(/const ftueActive =[^\n]*ftueCompleted/);
    // the helper (single source, shared with App's reel-skip) owns the localStorage read
    const HELPER = readFileSync(resolve(__dirname, "../../utils/soloFtue.ts"), "utf8");
    expect(HELPER).toMatch(/localStorage\.getItem\("rm_solo_ftue_done"\)/);
    expect(HELPER).toMatch(/localStorage\.getItem\("replaymod_hand_count"\)/);
  });
});

describe("scripted FTUE — ftueActive=false routes every site to the ADAPTER", () => {
  it("deal: non-FTUE branch calls adapter.dealInitialRoster()", () => {
    expect(GAME_VIEW).toMatch(
      /res = ftueActiveNow \? await adapter\.ftueScriptedHand!\.deal\(\) : await dealInitialRoster\(\);/,
    );
  });
  it("redraw: non-FTUE branch calls adapter.redrawRoster({ currentCards, lockedCardIds })", () => {
    expect(GAME_VIEW).toMatch(
      /drawRes = ftueActiveNow \? await adapter\.ftueScriptedHand!\.redraw\(\{ currentCards: markedRoster, roundsUsed \}\) : await redrawRoster\(\{ currentCards: markedRoster, lockedCardIds \}\);/,
    );
  });
  it("resolve (both call sites): non-FTUE branch calls adapter.resolveRoster(...)", () => {
    const resolveTernaries = GAME_VIEW.match(
      /resolveRes = ftueActiveNow \? await adapter\.ftueScriptedHand!\.resolve\([^)]*\) : await resolveRoster\([^)]*\);/g,
    );
    expect(resolveTernaries?.length).toBe(2);
  });
  it("early-lock is disabled ONLY under FTUE (&& !ftueActiveNow) — normal play unchanged", () => {
    expect(GAME_VIEW).toMatch(/const earlyLock = allHeld && maxRounds > 1 && !ftueActiveNow;/);
  });
});
