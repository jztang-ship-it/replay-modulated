import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { detectTopGame, __setTopGameLookups, __setRecordSources } from "../recordDetector";

const BASKETBALL_RECORDS = {
  singleGameRecords: [{ stat: "pts", record: 100, holder: "Wilt Chamberlain", nearRecordPct: 0.75 }],
  statAliases: {},
  careerCategories: [
    { key: "pts", label: (v: number) => `career-high ${v} pts` },
    { key: "reb", label: (v: number) => `career-high ${v} reb` },
    { key: "ast", label: (v: number) => `career-high ${v} ast` },
    { key: "threes", label: (v: number) => `career-high ${v} 3PM` },
  ],
  topGames: {},
  careerHighs: {},
};

const BASEBALL_RECORDS = {
  singleGameRecords: [{ stat: "hr", record: 4, holder: "Multiple", nearRecordPct: 0.75 }],
  statAliases: {},
  careerCategories: [],
  topGames: {},
  careerHighs: {},
};

describe("detectTopGame — T0 record", () => {
  beforeEach(() => __setRecordSources({ basketball: BASKETBALL_RECORDS, baseball: BASEBALL_RECORDS }));
  afterEach(() => __setRecordSources(null));

  it("fires for a 100-point game (matches Wilt's record)", () => {
    const r = detectTopGame(
      { pts: 100, reb: 8, ast: 5 },
      "x", "2025-01-26", "ORANGE", "basketball"
    );
    expect(r.tier).toBe("record");
    expect(r.primaryReason?.category).toBe("pts");
  });

  it("fires when a record is broken (>= record value)", () => {
    const r = detectTopGame(
      { pts: 105 },
      "x", "2025-01-01", "ORANGE", "basketball"
    );
    expect(r.tier).toBe("record");
    expect(r.primaryReason?.value).toBe(105);
  });

  it("does NOT fire for a near-record (e.g. 75 pts)", () => {
    const r = detectTopGame(
      { pts: 75, reb: 5, ast: 3 },
      "x", "2025-01-01", "ORANGE", "basketball"
    );
    expect(r.tier).not.toBe("record");
  });

  it("baseball — 4 HR ties Multiple's all-time record", () => {
    const r = detectTopGame(
      { hr: 4, h: 5, rbi: 8 },
      "x", "2025-04-01", "RED", "baseball"
    );
    expect(r.tier).toBe("record");
    expect(r.primaryReason?.category).toBe("hr");
  });

  it("does not throw on malformed stat line", () => {
    expect(() => detectTopGame({} as any, "x", "2025-01-01", "ORANGE", "basketball")).not.toThrow();
    expect(detectTopGame({} as any, "x", "2025-01-01", "ORANGE", "basketball").tier).toBe(null);
  });
});

describe("detectTopGame — T1 career", () => {
  beforeEach(() => {
    __setRecordSources({ basketball: BASKETBALL_RECORDS });
    __setTopGameLookups({
      basketball: {
        topGames: {},
        careerHighs: {
          "203999": { pts: 48, reb: 19, ast: 15, threes: 6 },
          "1629029": { pts: 73, reb: 15, ast: 17, threes: 9 },
        },
      },
    });
  });
  afterEach(() => { __setTopGameLookups(null); __setRecordSources(null); });

  it("returns 'career' when stat equals player's career-high", () => {
    const r = detectTopGame(
      { pts: 48, reb: 12, ast: 8 },
      "203999", "2025-03-01", "ORANGE", "basketball"
    );
    expect(r.tier).toBe("career");
    expect(r.primaryReason?.category).toBe("pts");
  });

  it("returns 'career' with multiple matches — first by category-list priority wins primary", () => {
    const r = detectTopGame(
      { pts: 48, reb: 12, ast: 15 },
      "203999", "2025-03-01", "ORANGE", "basketball"
    );
    expect(r.tier).toBe("career");
    expect(r.primaryReason?.category).toBe("pts");
    expect(r.allReasons.map(r => r.category)).toContain("ast");
  });

  it("does not fire for non-star players (e.g. BLUE)", () => {
    const r = detectTopGame(
      { pts: 48, reb: 12, ast: 8 },
      "203999", "2025-03-01", "BLUE", "basketball"
    );
    expect(r.tier).toBe(null);
  });

  it("does not fire when player not in careerHighs map", () => {
    const r = detectTopGame(
      { pts: 48, reb: 12, ast: 8 },
      "unknown", "2025-03-01", "ORANGE", "basketball"
    );
    expect(r.tier).toBe(null);
  });

  it("does not fire when stat below stored career-high", () => {
    const r = detectTopGame(
      { pts: 47, reb: 12, ast: 8 }, // career-high is 48
      "203999", "2025-03-01", "ORANGE", "basketball"
    );
    expect(r.tier).toBe(null);
  });

  it("T0 record beats T1 career", () => {
    const r = detectTopGame(
      { pts: 100 },
      "1629029", "2025-01-26", "ORANGE", "basketball"
    );
    expect(r.tier).toBe("record");
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
  afterEach(() => __setTopGameLookups(null));

  it("returns 'season' when {playerId}|{date} is present in lookup", () => {
    const r = detectTopGame(
      { pts: 58, reb: 7, ast: 9 },
      "1629029", "2025-01-05", "PURPLE", "basketball"
    );
    expect(r.tier).toBe("season");
    expect(r.primaryReason?.category).toBe("pts");
  });

  it("returns null when no lookup entry for that player+date", () => {
    const r = detectTopGame(
      { pts: 22, reb: 7, ast: 9 },
      "1629029", "2025-02-02", "PURPLE", "basketball"
    );
    expect(r.tier).toBe(null);
  });

  it("T1 career beats T2 season when both would match", () => {
    __setRecordSources({ basketball: BASKETBALL_RECORDS });
    __setTopGameLookups({
      basketball: {
        topGames: { "203999|2025-01-01": { reasons: [{ category: "pts", label: "top-10", value: 48 }] } },
        careerHighs: { "203999": { pts: 48 } },
      },
    });
    const r = detectTopGame(
      { pts: 48 },
      "203999", "2025-01-01", "ORANGE", "basketball"
    );
    expect(r.tier).toBe("career");
    __setRecordSources(null);
  });
});
