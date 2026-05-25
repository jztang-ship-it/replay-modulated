import { describe, it, expect } from "vitest";
import { resolveCards } from "../resolveEngine";
import type { GeneratedCard, RawLog, TierColor } from "../../types";

// Contract: premium tiers (RED/ORANGE/PURPLE) sample from all min > 0 games.
// Non-premium tiers (BLUE/GREEN/WHITE) sample from min >= configured floor
// (10 for basketball) only.

const ADAPTER = {
  // FP formula: pts*1 + reb*1.2 + ast*1.5 + stl*2 + blk*2 - turnovers*1
  computeFantasyPoints(stats: Record<string, any>): number {
    const g = (k: string) => Number(stats[k] ?? 0);
    return g("pts") * 1.0 + g("reb") * 1.2 + g("ast") * 1.5
         + g("stl") * 2.0 + g("blk") * 2.0 + g("turnovers") * -1.0;
  },
  computeBadges(_stats: Record<string, any>) {
    return [] as any[];
  },
};

// Build a card with a specific tier — only fields the resolver reads matter.
function makeCard(tier: TierColor, basePlayerId = "TEST_001", season = "2425"): GeneratedCard {
  return {
    id: basePlayerId + "_" + season,
    basePlayerId,
    personKey: basePlayerId,
    cardId: basePlayerId + "_card",
    name: "Test Player",
    team: "TST",
    season,
    position: "PG",
    photoCode: "0",
    projectedFp: 30,
    salary: 50,
    tier,
    slotIndex: 0,
    wasHeld: false,
    actualFp: 0,
    fpDelta: 0,
    gameInfo: { date: "", opponent: "", homeAway: "" },
    statLine: {},
    achievements: [],
  };
}

function makeLogs(): Map<string, RawLog[]> {
  // Two logs for the same player. The low-min log has different FP than the
  // normal-min log so we can tell which one was sampled by inspecting actualFp.
  const lowMin: RawLog = {
    basePlayerId: "TEST_001",
    date: "2024-12-01",
    season: "2425",
    opponent: "OPP",
    stats: { pts: 2, reb: 1, ast: 0, stl: 0, blk: 0, turnovers: 0, min: 4 },
    // 2*1 + 1*1.2 = 3.2 FP
  };
  const normalMin: RawLog = {
    basePlayerId: "TEST_001",
    date: "2024-12-02",
    season: "2425",
    opponent: "OPP",
    stats: { pts: 30, reb: 10, ast: 5, stl: 2, blk: 1, turnovers: 1, min: 35 },
    // 30 + 12 + 7.5 + 4 + 2 - 1 = 54.5 FP
  };
  return new Map([
    ["TEST_001|2425", [lowMin, normalMin]],
    ["TEST_001", [lowMin, normalMin]],  // fallback key
  ]);
}

// Seeded deterministic RNG so the test is stable.
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function sampleResolvedFps(tier: TierColor, iterations: number): number[] {
  const fps: number[] = [];
  const logs = makeLogs();
  // Use distinct seeds across iterations so we actually exercise both logs
  // for tiers where both are eligible.
  for (let i = 0; i < iterations; i++) {
    const { resolved } = resolveCards(
      [makeCard(tier)],
      logs,
      { fpScale: 1, minMinutes: 10 },
      ADAPTER as any,
      makeRng(1000 + i * 7919),
    );
    fps.push(resolved[0].actualFp);
  }
  return fps;
}

describe("resolveEngine — tier-aware minutes filter", () => {
  it("PURPLE: sub-10-min log appears in resolve pool", () => {
    const fps = sampleResolvedFps("PURPLE", 200);
    const sawLowMin = fps.some(fp => Math.abs(fp - 3.2) < 0.01);
    const sawNormalMin = fps.some(fp => Math.abs(fp - 54.5) < 0.01);
    expect(sawLowMin).toBe(true);
    expect(sawNormalMin).toBe(true);
  });

  it("ORANGE: sub-10-min log appears in resolve pool", () => {
    const fps = sampleResolvedFps("ORANGE", 200);
    expect(fps.some(fp => Math.abs(fp - 3.2) < 0.01)).toBe(true);
    expect(fps.some(fp => Math.abs(fp - 54.5) < 0.01)).toBe(true);
  });

  it("RED: sub-10-min log appears in resolve pool", () => {
    const fps = sampleResolvedFps("RED", 200);
    expect(fps.some(fp => Math.abs(fp - 3.2) < 0.01)).toBe(true);
    expect(fps.some(fp => Math.abs(fp - 54.5) < 0.01)).toBe(true);
  });

  it("BLUE: sub-10-min log is excluded; only normal-min log sampled", () => {
    const fps = sampleResolvedFps("BLUE", 200);
    expect(fps.some(fp => Math.abs(fp - 3.2) < 0.01)).toBe(false);
    expect(fps.every(fp => Math.abs(fp - 54.5) < 0.01)).toBe(true);
  });

  it("GREEN: sub-10-min log is excluded", () => {
    const fps = sampleResolvedFps("GREEN", 200);
    expect(fps.some(fp => Math.abs(fp - 3.2) < 0.01)).toBe(false);
  });

  it("WHITE: sub-10-min log is excluded", () => {
    const fps = sampleResolvedFps("WHITE", 200);
    expect(fps.some(fp => Math.abs(fp - 3.2) < 0.01)).toBe(false);
  });

  it("PURPLE: sampling is roughly uniform across both logs (no bias toward low-min)", () => {
    const fps = sampleResolvedFps("PURPLE", 1000);
    const lowMinCount = fps.filter(fp => Math.abs(fp - 3.2) < 0.01).length;
    const normalMinCount = fps.filter(fp => Math.abs(fp - 54.5) < 0.01).length;
    // Two logs, uniform sampling → expect ~50/50 with binomial noise.
    // Allow generous margin (40-60%) so the test isn't seed-sensitive.
    expect(lowMinCount).toBeGreaterThan(400);
    expect(lowMinCount).toBeLessThan(600);
    expect(normalMinCount).toBeGreaterThan(400);
    expect(normalMinCount).toBeLessThan(600);
  });
});
