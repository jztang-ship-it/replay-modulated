import { describe, it, expect, beforeAll } from "vitest";
import { evaluateAchievements, registerAchievements } from "../registry";
import type { AchievementContext, CardScore } from "../types";
// Importing predicates registers them in the global registry (side-effect).
import { BASKETBALL_ACHIEVEMENTS } from "../../../basketball/src/achievements/predicates";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<CardScore> = {}): CardScore {
  return {
    fp: 25,
    stats: {},
    position: "SG",
    name: "Test Player",
    team: "LAL",
    tier: "BLUE",
    season: "2021",
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AchievementContext> = {}): AchievementContext {
  return {
    sport: "basketball",
    season: "2122",
    handId: "hand-001",
    totalFp: 180,
    fpTier: "STARTER",
    isWin: true,
    rosterIds: ["p1", "p2", "p3", "p4", "p5"],
    cards: [
      makeCard({ fp: 36 }),
      makeCard({ fp: 36 }),
      makeCard({ fp: 36 }),
      makeCard({ fp: 36 }),
      makeCard({ fp: 36 }),
    ],
    streak: 1,
    handsPlayed: 1,
    existingAchievementIds: [],
    ...overrides,
  };
}

function pred(id: string) {
  const def = BASKETBALL_ACHIEVEMENTS.find(d => d.id === id);
  if (!def) throw new Error(`No predicate for id: ${id}`);
  return def.predicate;
}

// ── Predicate unit tests ──────────────────────────────────────────────────────

describe("bball_first_win", () => {
  it("awards on first win", () => expect(pred("bball_first_win")(makeCtx())).toBe(true));
  it("does not award on bust", () => expect(pred("bball_first_win")(makeCtx({ isWin: false }))).toBe(false));
});

describe("bball_legend_status", () => {
  it("awards on LEGEND tier", () => expect(pred("bball_legend_status")(makeCtx({ fpTier: "LEGEND" }))).toBe(true));
  it("does not award on MVP", () => expect(pred("bball_legend_status")(makeCtx({ fpTier: "MVP" }))).toBe(false));
});

describe("bball_century_club", () => {
  it("awards at 100 FP", () => expect(pred("bball_century_club")(makeCtx({ totalFp: 100 }))).toBe(true));
  it("awards above 100 FP", () => expect(pred("bball_century_club")(makeCtx({ totalFp: 250 }))).toBe(true));
  it("does not award below 100 FP", () => expect(pred("bball_century_club")(makeCtx({ totalFp: 99 }))).toBe(false));
});

describe("bball_double_century", () => {
  it("awards at 200 FP", () => expect(pred("bball_double_century")(makeCtx({ totalFp: 200 }))).toBe(true));
  it("does not award at 199 FP", () => expect(pred("bball_double_century")(makeCtx({ totalFp: 199 }))).toBe(false));
});

describe("bball_carry_king", () => {
  it("awards when any card hits 50+", () => {
    const ctx = makeCtx({ cards: [makeCard({ fp: 50 }), makeCard(), makeCard(), makeCard(), makeCard()] });
    expect(pred("bball_carry_king")(ctx)).toBe(true);
  });
  it("does not award when max is 49", () => {
    const ctx = makeCtx({ cards: [makeCard({ fp: 49 }), ...Array(4).fill(makeCard())] });
    expect(pred("bball_carry_king")(ctx)).toBe(false);
  });
});

describe("bball_transcendent", () => {
  it("awards when any card hits 70+", () => {
    const ctx = makeCtx({ cards: [makeCard({ fp: 70 }), makeCard(), makeCard(), makeCard(), makeCard()] });
    expect(pred("bball_transcendent")(ctx)).toBe(true);
  });
});

describe("bball_all_stars_five", () => {
  it("awards when all 5 score 20+", () => {
    const ctx = makeCtx({ cards: Array(5).fill(null).map(() => makeCard({ fp: 20 })) });
    expect(pred("bball_all_stars_five")(ctx)).toBe(true);
  });
  it("fails if one card is below 20", () => {
    const ctx = makeCtx({ cards: [makeCard({ fp: 19 }), ...Array(4).fill(null).map(() => makeCard({ fp: 25 }))] });
    expect(pred("bball_all_stars_five")(ctx)).toBe(false);
  });
});

describe("bball_dynasty_lineup", () => {
  it("awards when all 5 score 40+", () => {
    const ctx = makeCtx({ cards: Array(5).fill(null).map(() => makeCard({ fp: 40 })) });
    expect(pred("bball_dynasty_lineup")(ctx)).toBe(true);
  });
});

describe("bball_big_three", () => {
  it("awards when 3+ cards hit 35+", () => {
    const ctx = makeCtx({ cards: [makeCard({ fp: 35 }), makeCard({ fp: 35 }), makeCard({ fp: 35 }), makeCard({ fp: 10 }), makeCard({ fp: 10 })] });
    expect(pred("bball_big_three")(ctx)).toBe(true);
  });
  it("fails with only 2 at 35+", () => {
    const ctx = makeCtx({ cards: [makeCard({ fp: 35 }), makeCard({ fp: 35 }), makeCard({ fp: 10 }), makeCard({ fp: 10 }), makeCard({ fp: 10 })] });
    expect(pred("bball_big_three")(ctx)).toBe(false);
  });
});

describe("bball_balanced_attack", () => {
  it("awards when spread is ≤ 12", () => {
    const ctx = makeCtx({ cards: [makeCard({ fp: 30 }), makeCard({ fp: 32 }), makeCard({ fp: 38 }), makeCard({ fp: 40 }), makeCard({ fp: 42 })] });
    expect(pred("bball_balanced_attack")(ctx)).toBe(true);
  });
  it("fails when spread exceeds 12", () => {
    const ctx = makeCtx({ cards: [makeCard({ fp: 10 }), makeCard({ fp: 23 }), makeCard({ fp: 30 }), makeCard({ fp: 30 }), makeCard({ fp: 30 })] });
    expect(pred("bball_balanced_attack")(ctx)).toBe(false);
  });
});

describe("bball_high_roller", () => {
  it("awards on win with 200+ FP", () => expect(pred("bball_high_roller")(makeCtx({ isWin: true, totalFp: 200 }))).toBe(true));
  it("does not award on loss even with 200+ FP", () => expect(pred("bball_high_roller")(makeCtx({ isWin: false, totalFp: 250 }))).toBe(false));
  it("does not award on win with 199 FP", () => expect(pred("bball_high_roller")(makeCtx({ isWin: true, totalFp: 199 }))).toBe(false));
});

describe("grinder milestones", () => {
  it("bball_played_10 awards at 10 hands", () => expect(pred("bball_played_10")(makeCtx({ handsPlayed: 10 }))).toBe(true));
  it("bball_played_10 does not award at 9 hands", () => expect(pred("bball_played_10")(makeCtx({ handsPlayed: 9 }))).toBe(false));
  it("bball_played_50 awards at 50 hands", () => expect(pred("bball_played_50")(makeCtx({ handsPlayed: 50 }))).toBe(true));
  it("bball_played_100 awards at 100 hands", () => expect(pred("bball_played_100")(makeCtx({ handsPlayed: 100 }))).toBe(true));
});

describe("streak milestones", () => {
  it("bball_hot_streak_3 awards at streak 3", () => expect(pred("bball_hot_streak_3")(makeCtx({ streak: 3 }))).toBe(true));
  it("bball_hot_streak_3 does not award at streak 2", () => expect(pred("bball_hot_streak_3")(makeCtx({ streak: 2 }))).toBe(false));
  it("bball_hot_streak_10 awards at streak 10", () => expect(pred("bball_hot_streak_10")(makeCtx({ streak: 10 }))).toBe(true));
  it("bball_hot_streak_20 does not award at streak 19", () => expect(pred("bball_hot_streak_20")(makeCtx({ streak: 19 }))).toBe(false));
});

describe("positional achievements", () => {
  it("bball_point_god awards when PG scores 50+", () => {
    const ctx = makeCtx({ cards: [makeCard({ position: "PG", fp: 50 }), ...Array(4).fill(null).map(() => makeCard())] });
    expect(pred("bball_point_god")(ctx)).toBe(true);
  });
  it("bball_point_god does not award when PG scores 49", () => {
    const ctx = makeCtx({ cards: [makeCard({ position: "PG", fp: 49 }), ...Array(4).fill(null).map(() => makeCard())] });
    expect(pred("bball_point_god")(ctx)).toBe(false);
  });
  it("bball_big_man_era awards when C scores 60+", () => {
    const ctx = makeCtx({ cards: [makeCard({ position: "C", fp: 60 }), ...Array(4).fill(null).map(() => makeCard())] });
    expect(pred("bball_big_man_era")(ctx)).toBe(true);
  });
  it("bball_wing_takeover awards when SF scores 55+", () => {
    const ctx = makeCtx({ cards: [makeCard({ position: "SF", fp: 55 }), ...Array(4).fill(null).map(() => makeCard())] });
    expect(pred("bball_wing_takeover")(ctx)).toBe(true);
  });
});

describe("bball_squad_goals", () => {
  it("awards when all from same team", () => {
    const ctx = makeCtx({ cards: Array(5).fill(null).map(() => makeCard({ team: "GSW" })) });
    expect(pred("bball_squad_goals")(ctx)).toBe(true);
  });
  it("does not award with mixed teams", () => {
    const ctx = makeCtx({ cards: [makeCard({ team: "GSW" }), makeCard({ team: "LAL" }), ...Array(3).fill(null).map(() => makeCard({ team: "GSW" }))] });
    expect(pred("bball_squad_goals")(ctx)).toBe(false);
  });
});

describe("bball_legend_card", () => {
  it("awards when any card is RED tier", () => {
    const ctx = makeCtx({ cards: [makeCard({ tier: "RED" }), ...Array(4).fill(null).map(() => makeCard())] });
    expect(pred("bball_legend_card")(ctx)).toBe(true);
  });
  it("does not award with no RED cards", () => {
    const ctx = makeCtx({ cards: Array(5).fill(null).map(() => makeCard({ tier: "ORANGE" })) });
    expect(pred("bball_legend_card")(ctx)).toBe(false);
  });
});

describe("era achievements", () => {
  it("bball_old_school awards for pre-1980 season", () => expect(pred("bball_old_school")(makeCtx({ season: "7374" }))).toBe(true));
  it("bball_old_school does not award for 1980", () => expect(pred("bball_old_school")(makeCtx({ season: "8081" }))).toBe(false));
  it("bball_showtime awards for 1980s season", () => expect(pred("bball_showtime")(makeCtx({ season: "8788" }))).toBe(true));
  it("bball_showtime does not award for 1990s", () => expect(pred("bball_showtime")(makeCtx({ season: "9192" }))).toBe(false));
  it("bball_jordan_era awards for 1990s season", () => expect(pred("bball_jordan_era")(makeCtx({ season: "9596" }))).toBe(true));
  it("bball_jordan_era does not award for 2000s", () => expect(pred("bball_jordan_era")(makeCtx({ season: "0001" }))).toBe(false));
  it("bball_kobe_era awards for 2000s season", () => expect(pred("bball_kobe_era")(makeCtx({ season: "0607" }))).toBe(true));
  it("bball_kobe_era does not award for 2010s", () => expect(pred("bball_kobe_era")(makeCtx({ season: "1112" }))).toBe(false));
  it("bball_curry_era awards for 2015+ season", () => expect(pred("bball_curry_era")(makeCtx({ season: "1516" }))).toBe(true));
  it("bball_curry_era does not award for 2014", () => expect(pred("bball_curry_era")(makeCtx({ season: "1415" }))).toBe(false));
  it("bball_modern_game awards for 2010+ season", () => expect(pred("bball_modern_game")(makeCtx({ season: "1011" }))).toBe(true));
});

// ── evaluateAchievements integration ─────────────────────────────────────────

describe("evaluateAchievements", () => {
  it("returns multiple achievements for a standout hand", () => {
    const ctx = makeCtx({
      totalFp: 210,
      fpTier: "LEGEND",
      isWin: true,
      streak: 3,
      handsPlayed: 1,
      cards: Array(5).fill(null).map(() => makeCard({ fp: 42 })),
    });
    const results = evaluateAchievements(ctx);
    const ids = results.map(r => r.achievementId);
    expect(ids).toContain("bball_first_win");
    expect(ids).toContain("bball_legend_status");
    expect(ids).toContain("bball_century_club");
    expect(ids).toContain("bball_double_century");
    expect(ids).toContain("bball_high_roller");
    expect(ids).toContain("bball_dynasty_lineup");
    expect(ids).toContain("bball_hot_streak_3");
  });

  it("skips achievements in existingAchievementIds", () => {
    const ctx = makeCtx({
      fpTier: "LEGEND",
      isWin: true,
      existingAchievementIds: ["bball_first_win", "bball_legend_status"],
    });
    const results = evaluateAchievements(ctx);
    const ids = results.map(r => r.achievementId);
    expect(ids).not.toContain("bball_first_win");
    expect(ids).not.toContain("bball_legend_status");
  });

  it("filters out non-basketball achievements from a basketball context", () => {
    // Register a baseball-only achievement temporarily
    registerAchievements([{
      id: "baseball_test_only",
      tier: "bronze",
      sport: "baseball",
      title: "Test",
      description: "Test",
      predicate: () => true,
    }]);
    const ctx = makeCtx({ sport: "basketball" });
    const results = evaluateAchievements(ctx);
    const ids = results.map(r => r.achievementId);
    expect(ids).not.toContain("baseball_test_only");
  });

  it("returns empty array for a bust hand with no milestones met", () => {
    const ctx = makeCtx({
      fpTier: "BUST",
      isWin: false,
      totalFp: 50,
      streak: 0,
      handsPlayed: 1,
      cards: Array(5).fill(null).map(() => makeCard({ fp: 10 })),
      existingAchievementIds: BASKETBALL_ACHIEVEMENTS.map(d => d.id),
    });
    expect(evaluateAchievements(ctx)).toHaveLength(0);
  });

  it("catches predicate errors without throwing", () => {
    registerAchievements([{
      id: "bad_predicate_test",
      tier: "bronze",
      sport: "basketball",
      title: "Bad",
      description: "Bad",
      predicate: () => { throw new Error("boom"); },
    }]);
    const ctx = makeCtx();
    expect(() => evaluateAchievements(ctx)).not.toThrow();
  });
});
