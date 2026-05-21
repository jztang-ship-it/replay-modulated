import { describe, it, expect } from "vitest";
import type { RawLog } from "../types";

// Schema contract: when ingestion doesn't populate injured / ejected, the
// reader must treat the absence as `false` without coercion or error. This
// test pins that contract so future ingestion changes (or schema migrations)
// can't silently flip the default.

describe("RawLog injured / ejected default behavior", () => {
  it("treats missing injured field as falsy without throwing", () => {
    const log: RawLog = {
      basePlayerId: "203999",
      date: "2024-10-22",
      season: "2425",
      opponent: "NYK",
      stats: { pts: 11, reb: 3, ast: 5, min: 26 },
    };
    expect(log.injured).toBeUndefined();
    expect(Boolean(log.injured)).toBe(false);
    expect(log.injured === true).toBe(false);
  });

  it("treats missing ejected field as falsy without throwing", () => {
    const log: RawLog = {
      basePlayerId: "203999",
      date: "2024-10-22",
      season: "2425",
      opponent: "NYK",
      stats: { pts: 11, reb: 3, ast: 5, min: 26 },
    };
    expect(log.ejected).toBeUndefined();
    expect(Boolean(log.ejected)).toBe(false);
    expect(log.ejected === true).toBe(false);
  });

  it("accepts explicit injured: true on the log", () => {
    const log: RawLog = {
      basePlayerId: "203999",
      date: "2024-10-22",
      season: "2425",
      opponent: "NYK",
      stats: { pts: 0, reb: 0, ast: 0, min: 4 },
      injured: true,
    };
    expect(log.injured).toBe(true);
    expect(log.ejected).toBeUndefined();
  });

  it("accepts explicit ejected: true on the log", () => {
    const log: RawLog = {
      basePlayerId: "203999",
      date: "2024-10-22",
      season: "2425",
      opponent: "NYK",
      stats: { pts: 2, reb: 1, ast: 0, min: 7 },
      ejected: true,
    };
    expect(log.ejected).toBe(true);
    expect(log.injured).toBeUndefined();
  });

  it("parses production-shaped logs (no injured/ejected fields) without error", () => {
    // Verbatim shape from basketball/public/data/seasons/2425/gamelogs.json
    const productionLog = JSON.parse(`{
      "basePlayerId": "201143",
      "date": "2024-10-22",
      "matchDate": "2024-10-22",
      "season": "2425",
      "opponent": "NYK",
      "homeAway": "H",
      "stats": {
        "pts": 11, "reb": 3, "ast": 5, "stl": 1, "blk": 1,
        "turnovers": 0, "min": 26, "fg_pct": 0.571, "fg3m": 3, "fga": 7
      }
    }`) as RawLog;
    expect(productionLog.injured).toBeUndefined();
    expect(productionLog.ejected).toBeUndefined();
    expect(productionLog.stats.min).toBe(26);
  });
});
