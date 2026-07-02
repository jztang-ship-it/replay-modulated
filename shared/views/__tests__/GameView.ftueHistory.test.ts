// shared/views/__tests__/GameView.ftueHistory.test.ts
//
// feat/ftue-scripted-hand Pass B — regression guard for the historical-flip
// finale (the "tap Ant to see the real game" beat). The #1 risk is the lock-
// state leaking into a non-FTUE resolve, so every seam is ftueActive-gated:
// toggleStatsFlip, the Replay lock, the spotlight, and the back-string render
// all keep their normal-play path when ftueActive is false.
//
// Static-source (project does not render GameView — same precedent as the other
// FTUE guards).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAME_VIEW = readFileSync(resolve(__dirname, "../GameView.tsx"), "utf8");
const GAME_BAR = readFileSync(resolve(__dirname, "../../components/GameBar.tsx"), "utf8");
const ROSTER = readFileSync(resolve(__dirname, "../../components/RosterGrid.tsx"), "utf8");
const ATHLETE = readFileSync(resolve(__dirname, "../../../basketball/src/components/AthleteCard.tsx"), "utf8");

describe("Pass B — the lock-state is ftueActive-gated (no leak into normal play)", () => {
  it("toggleStatsFlip freezes the board only for FTUE at RESULTS; normal flip untouched", () => {
    // idle dwell → whole board frozen (FTUE only)
    expect(GAME_VIEW).toMatch(/if \(ftueActive && gameState === "RESULTS" && ftueHistoryBeat === "idle"\) return;/);
    // prompt → only the hero (Ant) flips
    expect(GAME_VIEW).toMatch(/if \(ftueActive && ftueHistoryBeat === "prompt" && cardKey !== ftueHistoryCardId\) return;/);
    // the pre-existing RESULTS/WIN_CELEBRATION guard is still first (byte-identical for non-FTUE)
    expect(GAME_VIEW).toMatch(/if \(gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION"\) return;\s*\n\s*\/\/ FTUE Pass B/);
  });
  it("Ant's flip during the prompt advances idle→prompt→flipped", () => {
    expect(GAME_VIEW).toMatch(/setFtueHistoryBeat\("flipped"\)/);
    expect(GAME_VIEW).toMatch(/ftueCopy\.historyDone/);
  });
  it("history-beat commentary is driven by the beat STATE, not the transient dwell timer / flip handler", () => {
    // the blank-prompt fix: prompt + closer lines are set from a dedicated effect
    // keyed on ftueHistoryBeat, so they survive the WIN_CELEBRATION→RESULTS handoff
    // and the sticky Giannis override (no longer set inside a detached setTimeout).
    expect(GAME_VIEW).toMatch(/if \(ftueHistoryBeat === "prompt" && ftueCopy\.historyPrompt\) \{\s*\n\s*setFtueCommentaryOverride\(\{ parts: \[ftueCopy\.historyPrompt\], sticky: true \}\);/);
    expect(GAME_VIEW).toMatch(/else if \(ftueHistoryBeat === "flipped" && ftueCopy\.historyDone\) \{\s*\n\s*setFtueCommentaryOverride\(\{ parts: \[ftueCopy\.historyDone\], sticky: true \}\);/);
    // the dwell timer now advances STATE ONLY (no commentary set inside it)
    expect(GAME_VIEW).toMatch(/const t = window\.setTimeout\(\(\) => setFtueHistoryBeat\("prompt"\), FTUE_HISTORY_DWELL_MS\);/);
  });
  it("the hero card is derived from cardRole (can't drift from the scripted hand)", () => {
    expect(GAME_VIEW).toMatch(/cr\[id\] === "hero"/);
  });
  it("the history commentary effect is RESULTS-phase-gated (can't re-set after the IDLE handoff)", () => {
    // gating on gameState==="RESULTS" stops the effect re-setting the closer when
    // the exit reel's setActiveSeason rebuilds the adapter (fresh ftueCopy ref).
    expect(GAME_VIEW).toMatch(/if \(!ftueActive \|\| !ftueCopy \|\| gameState !== "RESULTS"\) return;/);
  });
});

describe("FTUE→normal handoff — the FTUE commentary override is cleared (no bleed)", () => {
  it("the FTUE-exit REPLAY clears the override so no FTUE line leaks into normal-game commentary", () => {
    // in the RESULTS→IDLE branch's ftueActive block (alongside arming the exit reel)
    expect(GAME_VIEW).toMatch(/window\.dispatchEvent\(new Event\("replaymod:ftue-exit-reel"\)\);\s*\n[\s\S]*?setFtueCommentaryOverride\(null\);\s*\n\s*\}/);
  });
});

describe("Pass B — dwell, spotlight, and Replay lock scope to the right stages", () => {
  it("a tunable dwell lets the Giannis STARTER line land before the prompt", () => {
    expect(GAME_VIEW).toMatch(/const FTUE_HISTORY_DWELL_MS = \d+;/);
    expect(GAME_VIEW).toMatch(/setFtueHistoryBeat\("prompt"\)/);
    expect(GAME_VIEW).toMatch(/ftueCopy\.historyPrompt/);
  });
  it("spotlight + Replay-lock engage only in the PROMPT stage (dwell reads normal)", () => {
    expect(GAME_VIEW).toMatch(/const ftuePrimaryLocked = ftueActive && gameState === "RESULTS"\s*\n\s*&& ftueHistoryBeat === "prompt";/);
    expect(GAME_VIEW).toMatch(/const ftueHistoryActive = ftueActive && gameState === "RESULTS"\s*\n\s*&& ftueHistoryBeat === "prompt";/);
  });
  it("REPLAY blinks only after the flip (flipped stage)", () => {
    expect(GAME_VIEW).toMatch(/\|\| \(gameState === "RESULTS" && ftueHistoryBeat === "flipped"\)/);
  });
});

describe("Pass B — rm_solo_ftue_done stays at WIN_CELEBRATION (abandon-resilient)", () => {
  it("completion fires at the win, NOT after the history flip", () => {
    // the set-once flag is inside the WIN_CELEBRATION/RESULTS result effect, not
    // the flipped transition
    expect(GAME_VIEW).toMatch(/if \(gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION"\) return;\s*\n\s*ftueResultRef\.current = true;/);
    expect(GAME_VIEW).toMatch(/rm_solo_ftue_done fires HERE \(the win\)/);
  });
});

describe("Pass B — the card-back override is GONE; Ant's back is a normal box-score flip", () => {
  it("no backStringOverride / map / historyBackString anywhere (spec error removed)", () => {
    expect(ATHLETE).not.toMatch(/backStringOverride/);
    expect(ROSTER).not.toMatch(/backStringOverride/);
    expect(GAME_VIEW).not.toMatch(/backStringOverride/);
    expect(GAME_VIEW).not.toMatch(/ftueBackStringMap/);
    expect(GAME_VIEW).not.toMatch(/historyBackString/);
  });
  it("both history lines route through the STANDARD commentary channel (state-keyed effect)", () => {
    expect(GAME_VIEW).toMatch(/if \(ftueHistoryBeat === "prompt" && ftueCopy\.historyPrompt\) \{\s*\n\s*setFtueCommentaryOverride\(\{ parts: \[ftueCopy\.historyPrompt\], sticky: true \}\);/);
    expect(GAME_VIEW).toMatch(/else if \(ftueHistoryBeat === "flipped" && ftueCopy\.historyDone\) \{\s*\n\s*setFtueCommentaryOverride\(\{ parts: \[ftueCopy\.historyDone\], sticky: true \}\);/);
  });
});

describe("Pass B — FTUE finale auto-advances to RESULTS after the slam (the prompt-blank root)", () => {
  it("ftueActive-gated WIN_CELEBRATION→RESULTS auto-advance via onWinCelebrationComplete", () => {
    expect(GAME_VIEW).toMatch(/if \(!ftueActive \|\| gameState !== "WIN_CELEBRATION"\) return;/);
    expect(GAME_VIEW).toMatch(/window\.setTimeout\(\(\) => onWinCelebrationComplete\(\), FTUE_SLAM_HOLD_MS\)/);
    // guarded once so it can't re-fire
    expect(GAME_VIEW).toMatch(/if \(ftueFinaleAdvancedRef\.current\) return;/);
  });
});

describe("Pass B — GameBar Replay dim reuses the existing disabled treatment", () => {
  it("ftuePrimaryLocked ORs into primaryDisabled (superset of isDisabled → non-FTUE unchanged)", () => {
    expect(GAME_BAR).toMatch(/const primaryDisabled = isDisabled\(gameState\) \|\| ftuePrimaryLocked;/);
    expect(GAME_BAR).toMatch(/ftuePrimaryLocked = false,/);
  });
});

describe("Pass B — RosterGrid history spotlight is breath/dim only (no walk tap-routing)", () => {
  it("ftueHistory folds into the spotlight breath but NOT the walk advance", () => {
    expect(ROSTER).toMatch(/const ftueHistory = isFTUE && ftueHistoryActive;/);
    expect(ROSTER).toMatch(/const ftueSpotlightBreath = ftueHold \|\| ftueWalk \|\| ftueHistory;/);
    // tap routing still keys on ftueWalk only
    expect(ROSTER).toMatch(/if \(ftueWalk && onFtueWalkAdvance\)/);
  });
});
