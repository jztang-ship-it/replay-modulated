import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectTopGame, __setTopGameLookups } from "../recordDetector";

describe("detectTopGame — T1 all-time", () => {
  it("detects composite td_30_20_20 (Jokic 31/21/22)", () => {
    const r = detectTopGame(
      { pts: 31, reb: 21, ast: 22 },
      "203999", "2025-02-10", "ORANGE", "basketball"
    );
    expect(r.tier).toBe("all_time");
    expect(r.primaryReason?.category).toBe("td_30_20_20");
  });

  it("detects simple pts threshold (Luka 73)", () => {
    const r = detectTopGame(
      { pts: 73, reb: 8, ast: 5 },
      "1629029", "2025-01-26", "ORANGE", "basketball"
    );
    expect(r.tier).toBe("all_time");
    // 73 pts hits both fifty_plus_game (priority 60) AND pts >= 70 (priority 50).
    // Composite beats single by priority.
    expect(r.primaryReason?.category).toBe("fifty_plus_game");
    expect(r.allReasons.map(r => r.category)).toContain("pts");
  });

  it("primaryReason sort — composite outranks single", () => {
    const r = detectTopGame(
      { pts: 80, reb: 21, ast: 22, stl: 1, blk: 1 },
      "203999", "2025-03-01", "ORANGE", "basketball"
    );
    // 80/21/22 matches td_60_10_10 (p95), td_40_20_20 (p90), td_30_20_20 (p85),
    // fifty_plus_game (p60), and pts>=70 (p50). Highest-priority composite wins.
    expect(r.primaryReason?.category).toBe("td_60_10_10"); // priority 95
    expect(r.allReasons[0].category).toBe("td_60_10_10");
    // Composite still outranks the single pts match.
    const singleIdx = r.allReasons.findIndex(x => x.category === "pts");
    const compositeIdx = r.allReasons.findIndex(x => x.category === "td_60_10_10");
    expect(compositeIdx).toBeLessThan(singleIdx);
  });

  it("returns null when nothing qualifies", () => {
    const r = detectTopGame(
      { pts: 28, reb: 10, ast: 8 },
      "203999", "2025-02-10", "ORANGE", "basketball"
    );
    expect(r.tier).toBe(null);
    expect(r.primaryReason).toBe(null);
    expect(r.allReasons).toEqual([]);
  });

  it("delta tiebreak — among same-priority singles, larger proportional excess wins", () => {
    // Craft stats that hit pts(50, priority 50) and ast(40, priority 40) — different priorities, pts wins by priority alone.
    // To test delta tiebreak, we need two matches with SAME priority.
    // reb >= 30 (p40) AND ast >= 20 (p40). 31 reb (delta (31-30)/30 = 0.033) vs 35 ast (delta (35-20)/20 = 0.75).
    // ast delta is larger → ast wins.
    const r = detectTopGame(
      { pts: 10, reb: 31, ast: 35 },
      "x", "2025-01-01", "ORANGE", "basketball"
    );
    expect(r.tier).toBe("all_time");
    expect(r.primaryReason?.category).toBe("ast");
  });

  it("does not throw on malformed stat line", () => {
    expect(() => detectTopGame({} as any, "x", "2025-01-01", "ORANGE", "basketball")).not.toThrow();
    const r = detectTopGame({} as any, "x", "2025-01-01", "ORANGE", "basketball");
    expect(r.tier).toBe(null);
  });
});

describe("detectTopGame — T2 season", () => {
  beforeEach(() => {
    __setTopGameLookups({
      basketball: {
        topGames: {
          "1629029|2025-01-05": {
            reasons: [{ category: "pts", label: "Top-10 scoring game of the season", value: 58 }],
          },
        },
        careerHighs: {},
      },
    });
  });

  afterEach(() => {
    __setTopGameLookups(null);
  });

  it("returns 'season' when {playerId}|{date} is present in lookup", () => {
    // pts=42 misses all T1 thresholds (below 50-pt composite + 70-pt single), so T2 lookup is consulted.
    const r = detectTopGame(
      { pts: 42, reb: 7, ast: 9 },
      "1629029", "2025-01-05", "PURPLE", "basketball"
    );
    expect(r.tier).toBe("season");
    expect(r.primaryReason?.category).toBe("pts");
  });

  it("returns null when player played that date but no lookup entry", () => {
    const r = detectTopGame(
      { pts: 22, reb: 7, ast: 9 },
      "1629029", "2025-02-02", "PURPLE", "basketball"
    );
    expect(r.tier).toBe(null);
  });

  it("T1 still wins over T2 when both would match", () => {
    __setTopGameLookups({
      basketball: {
        topGames: { "x|2025-01-01": { reasons: [{ category: "pts", label: "top-10", value: 55 }] } },
        careerHighs: {},
      },
    });
    const r = detectTopGame(
      { pts: 73, reb: 8, ast: 5 },
      "x", "2025-01-01", "PURPLE", "basketball"
    );
    expect(r.tier).toBe("all_time");
  });
});
