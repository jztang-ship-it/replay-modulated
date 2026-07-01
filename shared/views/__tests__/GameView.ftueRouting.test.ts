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
  it("ftueActive requires first-run ref AND !challengeCtx AND adapter.ftueScriptedHand", () => {
    expect(GAME_VIEW).toMatch(
      /const ftueActive = soloFtueActiveRef\.current && !challengeCtx && !!adapter\.ftueScriptedHand;/,
    );
  });
  it("first-run is read once from localStorage (anon-safe), NOT profile ftueCompleted", () => {
    expect(GAME_VIEW).toMatch(/localStorage\.getItem\("rm_solo_ftue_done"\) === "1"/);
    expect(GAME_VIEW).toMatch(/localStorage\.getItem\("replaymod_hand_count"\)/);
    // the gate must not be sourced from the profile-backed flag
    expect(GAME_VIEW).not.toMatch(/const ftueActive =[^\n]*ftueCompleted/);
  });
});

describe("scripted FTUE — ftueActive=false routes every site to the ADAPTER", () => {
  it("deal: non-FTUE branch calls adapter.dealInitialRoster()", () => {
    expect(GAME_VIEW).toMatch(
      /res = ftueActive \? await adapter\.ftueScriptedHand!\.deal\(\) : await dealInitialRoster\(\);/,
    );
  });
  it("redraw: non-FTUE branch calls adapter.redrawRoster({ currentCards, lockedCardIds })", () => {
    expect(GAME_VIEW).toMatch(
      /drawRes = ftueActive \? await adapter\.ftueScriptedHand!\.redraw\(\{ currentCards: markedRoster, roundsUsed \}\) : await redrawRoster\(\{ currentCards: markedRoster, lockedCardIds \}\);/,
    );
  });
  it("resolve (both call sites): non-FTUE branch calls adapter.resolveRoster(...)", () => {
    const resolveTernaries = GAME_VIEW.match(
      /resolveRes = ftueActive \? await adapter\.ftueScriptedHand!\.resolve\([^)]*\) : await resolveRoster\([^)]*\);/g,
    );
    expect(resolveTernaries?.length).toBe(2);
  });
  it("early-lock is disabled ONLY under FTUE (&& !ftueActive) — normal play unchanged", () => {
    expect(GAME_VIEW).toMatch(/const earlyLock = allHeld && maxRounds > 1 && !ftueActive;/);
  });
});
