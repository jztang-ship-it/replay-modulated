import { describe, it, expect } from "vitest";
import { resolveCards } from "../engines/resolveEngine";
import { BasketballSportConfig } from "../../basketball/src/adapters/basketballConfig";
import type { GeneratedCard, RawLog, TierColor } from "../types";

// Contract verification:
//  - INJURED badge fires when log.injured === true.
//  - EJECTED badge fires when log.ejected === true.
//  - When neither flag is set, neither badge fires (today's default state).
//  - Both badges appear FIRST in the achievements array, ahead of any
//    stat-driven achievement badges.

// Minimal ResolveAdapter wired to basketball's actual badge list. Using the
// real BasketballSportConfig.badges so the test catches any registration
// drift (wrong field name, wrong test predicate, off-by-one ordering).
const BB_ADAPTER = {
  computeFantasyPoints(stats: Record<string, any>): number {
    const g = (k: string) => Number(stats[k] ?? 0);
    return g("pts") * 1.0 + g("reb") * 1.2 + g("ast") * 1.5
         + g("stl") * 2.0 + g("blk") * 2.0 + g("turnovers") * -1.0;
  },
  computeBadges(stats: Record<string, any>) {
    const out: Array<{ id: string; icon: string; label: string; fp: number }> = [];
    for (const badge of (BasketballSportConfig.badges ?? [])) {
      if (badge.test && badge.test(stats)) {
        out.push({ id: badge.id, icon: badge.icon, label: badge.label, fp: badge.fp });
      }
    }
    return out;
  },
};

function makeCard(tier: TierColor): GeneratedCard {
  return {
    id: "TEST_001_2425", basePlayerId: "TEST_001", personKey: "TEST_001",
    cardId: "TEST_001_card", name: "Test Player", team: "TST",
    season: "2425", position: "PG", photoCode: "0",
    projectedFp: 30, salary: 50, tier,
    slotIndex: 0, wasHeld: false, actualFp: 0, fpDelta: 0,
    gameInfo: { date: "", opponent: "", homeAway: "" },
    statLine: {}, achievements: [],
  };
}

function makeLogsMap(log: RawLog): Map<string, RawLog[]> {
  return new Map([
    ["TEST_001|2425", [log]],
    ["TEST_001", [log]],
  ]);
}

function makeRng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function resolveOne(log: RawLog, tier: TierColor = "PURPLE") {
  return resolveCards(
    [makeCard(tier)],
    makeLogsMap(log),
    { fpScale: 1, minMinutes: 10 },
    BB_ADAPTER as any,
    makeRng(42),
  );
}

describe("injured/ejected badge wiring", () => {
  it("dormant default: neither badge fires when both flags absent (current ingestion state)", () => {
    const log: RawLog = {
      basePlayerId: "TEST_001", date: "2024-12-01", season: "2425", opponent: "OPP",
      stats: { pts: 4, reb: 1, ast: 0, stl: 0, blk: 0, turnovers: 0, min: 7 },
    };
    const { resolved } = resolveOne(log);
    const badgeIds = resolved[0].achievements.map((b: any) => b.id);
    expect(badgeIds).not.toContain("INJURED");
    expect(badgeIds).not.toContain("EJECTED");
  });

  it("dormant default: neither badge fires for a normal game on a non-low-min log", () => {
    const log: RawLog = {
      basePlayerId: "TEST_001", date: "2024-12-02", season: "2425", opponent: "OPP",
      stats: { pts: 30, reb: 10, ast: 5, stl: 2, blk: 1, turnovers: 1, min: 35 },
    };
    const { resolved } = resolveOne(log);
    const badgeIds = resolved[0].achievements.map((b: any) => b.id);
    expect(badgeIds).not.toContain("INJURED");
    expect(badgeIds).not.toContain("EJECTED");
  });

  it("INJURED fires when log.injured === true", () => {
    const log: RawLog = {
      basePlayerId: "TEST_001", date: "2024-12-03", season: "2425", opponent: "OPP",
      stats: { pts: 2, reb: 0, ast: 0, stl: 0, blk: 0, turnovers: 0, min: 4 },
      injured: true,
    };
    const { resolved } = resolveOne(log);
    const badgeIds = resolved[0].achievements.map((b: any) => b.id);
    expect(badgeIds).toContain("INJURED");
    expect(badgeIds[0]).toBe("INJURED"); // first in list
  });

  it("EJECTED fires when log.ejected === true", () => {
    const log: RawLog = {
      basePlayerId: "TEST_001", date: "2024-12-04", season: "2425", opponent: "OPP",
      stats: { pts: 7, reb: 2, ast: 1, stl: 0, blk: 0, turnovers: 1, min: 11 },
      ejected: true,
    };
    const { resolved } = resolveOne(log);
    const badgeIds = resolved[0].achievements.map((b: any) => b.id);
    expect(badgeIds).toContain("EJECTED");
    expect(badgeIds[0]).toBe("EJECTED"); // first in list (no INJURED competing)
  });

  it("both status badges precede stat-driven badges in the list", () => {
    // Construct a log that ALSO triggers stat-driven badges (TRIPLE_DBL, etc.)
    // alongside the status flags. Status badges must come first.
    const log: RawLog = {
      basePlayerId: "TEST_001", date: "2024-12-05", season: "2425", opponent: "OPP",
      stats: { pts: 32, reb: 11, ast: 10, stl: 2, blk: 1, turnovers: 1, min: 38 },
      injured: true,
      ejected: true,
    };
    const { resolved } = resolveOne(log);
    const badgeIds = resolved[0].achievements.map((b: any) => b.id);
    // First two entries must be INJURED then EJECTED (registration order).
    expect(badgeIds[0]).toBe("INJURED");
    expect(badgeIds[1]).toBe("EJECTED");
    // Stat-driven badges still appear, just after the status ones.
    expect(badgeIds).toContain("TRIPLE_DBL");
    expect(badgeIds.indexOf("TRIPLE_DBL")).toBeGreaterThan(1);
  });

  it("status badges contribute 0 FP", () => {
    const log: RawLog = {
      basePlayerId: "TEST_001", date: "2024-12-06", season: "2425", opponent: "OPP",
      stats: { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, turnovers: 0, min: 2 },
      injured: true,
    };
    const { resolved } = resolveOne(log);
    const injuredBadge = resolved[0].achievements.find((b: any) => b.id === "INJURED");
    expect(injuredBadge?.fp).toBe(0);
  });
});
