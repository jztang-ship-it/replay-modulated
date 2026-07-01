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
  it("the hero card is derived from cardRole (can't drift from the scripted hand)", () => {
    expect(GAME_VIEW).toMatch(/cr\[id\] === "hero"/);
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

describe("Pass B — the card-back render is card-sourced + default-off", () => {
  it("GameView builds the hero-only back-string map from the copy slot", () => {
    expect(GAME_VIEW).toMatch(/ftueCopy\?\.historyBackString/);
    expect(GAME_VIEW).toMatch(/new Map<string, string>\(\[\[ftueHistoryCardId, line\]\]\)/);
  });
  it("BackBStats renders the sentence (fantasy tiles stripped) only when overridden; {pts}/{date} from the card", () => {
    expect(ATHLETE).toMatch(/if \(backStringOverride\) \{/);
    expect(ATHLETE).toMatch(/\.replace\("\{pts\}", String\(Number\(sl\.pts \?\? 0\)\)\)/);
    expect(ATHLETE).toMatch(/\.replace\("\{date\}", dateStr \|\| ""\)/);
  });
  it("backStringOverride defaults undefined → normal back byte-identical", () => {
    expect(ATHLETE).toMatch(/backStringOverride\?: string/);
    expect(ROSTER).toMatch(/backStringOverride=\{backStringOverrideMap\?\.get\(id\)\}/);
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
