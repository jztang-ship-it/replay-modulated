// basketball/src/components/__tests__/DailySeasonReelGate.ftueExitReel.test.ts
//
// feat/ftue-scripted-hand — regression guard for the FTUE-EXIT one-shot day-reel.
// The critical scoping: the one-shot fires on FTUE completion, re-resolves TODAY'S
// real season, and must NOT stamp/consume the daily day-key
// (replaymod_todays_season_pick_basketball) — otherwise it would suppress the
// user's genuine entry-of-day reel, the opposite of intended. The normal
// entry-of-day path (which DOES stamp) must be untouched.
//
// Static-source guard (same precedent as the other FTUE guards).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE = readFileSync(resolve(__dirname, "../DailySeasonReelGate.tsx"), "utf8");
const GAME_VIEW = readFileSync(resolve(__dirname, "../../../../shared/views/GameView.tsx"), "utf8");

describe("FTUE-exit reel — armed on the FTUE-completion REPLAY (ftueActive-gated)", () => {
  it("GameView sets the durable flag + dispatches the event only when ftueActive", () => {
    expect(GAME_VIEW).toMatch(/if \(ftueActive\) \{[\s\S]*?localStorage\.setItem\("rm_ftue_exit_reel_pending", "1"\)/);
    expect(GAME_VIEW).toMatch(/dispatchEvent\(new Event\("replaymod:ftue-exit-reel"\)\)/);
  });
});

describe("FTUE-exit reel — the gate consumes it once, re-resolving today's REAL season", () => {
  it("arms on the durable flag + the exit event, re-resolves via pickBossSeason + setActiveSeason", () => {
    expect(GATE).toMatch(/localStorage\.getItem\("rm_ftue_exit_reel_pending"\) !== "1"/);
    expect(GATE).toMatch(/addEventListener\("replaymod:ftue-exit-reel"/);
    expect(GATE).toMatch(/pickBossSeason\(today, m\) \?\? pickTodaysSeason\("basketball", today, m\)/);
    expect(GATE).toMatch(/setActiveSeason\(pick\.key\)/);
    expect(GATE).toMatch(/setFtueExitReelPick\(pick\)/);
  });
  it("clears the flag on reel complete (consumed-once, reload-durable until then)", () => {
    expect(GATE).toMatch(/localStorage\.removeItem\("rm_ftue_exit_reel_pending"\)/);
    expect(GATE).toMatch(/setFtueExitReelPick\(null\)/);
  });
  it("consumes the durable flag AT ARM-TIME (before the async manifest load) so a re-mount can't double-fire", () => {
    // Fire-once guard: between the flag read and the awaited loadSeasonsManifest, the
    // flag must already be removed — otherwise a navigation/login re-mount re-reads "1"
    // and re-fires the reel (the pre-existing double-fire). Goes red if the consume is
    // moved back to post-play only.
    const readPos = GATE.indexOf('rm_ftue_exit_reel_pending") !== "1"');
    const manifestPos = GATE.indexOf("loadSeasonsManifest(MANIFEST_URL)", readPos);
    const armSlice = GATE.slice(readPos, manifestPos);
    expect(armSlice).toMatch(/removeItem\("rm_ftue_exit_reel_pending"\)/);
  });
});

describe("FTUE-exit reel — NON-stamping; normal entry-of-day path untouched", () => {
  it("writeStored is called on exactly ONE path — the normal daily gate (one-shot never stamps)", () => {
    const calls = GATE.match(/writeStored\(\{/g) ?? [];
    expect(calls.length).toBe(1);
  });
  it("the normal path still stamps the daily key when !skipReel", () => {
    expect(GATE).toMatch(/if \(!skipReel\) \{\s*\n\s*writeStored\(\{ dateKey, seasonKey: todaysPick\.key/);
  });
  it("the daily day-key constant is unchanged", () => {
    expect(GATE).toMatch(/TODAYS_PICK_KEY = "replaymod_todays_season_pick_basketball"/);
  });
});
