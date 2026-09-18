import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const GAME_VIEW = readFileSync(new URL("../GameView.tsx", import.meta.url), "utf8");

describe("controlled basketball beta scope", () => {
  it("parks the boss entry point and its backing read", () => {
    expect(GAME_VIEW).toContain("const BOSS_BETA_ENABLED = false");
    expect(GAME_VIEW).toContain('useBossEntry(BOSS_BETA_ENABLED ? sportKey : "")');
    expect(GAME_VIEW).toContain("BOSS_BETA_ENABLED && showBoss && (");
  });

  it("uses the free-play commentary bank without an economy switch", () => {
    expect(GAME_VIEW).toContain('chadMessage("welcome", true)');
    expect(GAME_VIEW).toContain('chadMessage("rookie_first_win", true)');
  });
});
