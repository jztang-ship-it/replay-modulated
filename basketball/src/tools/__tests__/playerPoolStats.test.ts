// RD7.2 Phase 1 — percentile precompute build + unit test.
//
// This test (a) builds the per-season playerPoolStats.v1.json from the real
// 2425 gamelogs and writes it, and (b) verifies a known pull resolves to the
// expected percentile against the CORRECTLY-FILTERED population.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildPoolStatsForSeason,
  buildFilteredPool,
  logPassesFilter,
  fpForLog,
  percentileFromStats,
  POOL_STATS_VERSION,
} from "../playerPoolStats";

const SEASON = "2425";
const seasonDir = fileURLToPath(new URL(`../../../public/data/seasons/${SEASON}`, import.meta.url));
const logsPath = `${seasonDir}/gamelogs.json`;
const playersPath = `${seasonDir}/players.json`;
const outPath = `${seasonDir}/playerPoolStats.${POOL_STATS_VERSION}.json`;

const logs = JSON.parse(fs.readFileSync(logsPath, "utf8"));
const players = JSON.parse(fs.readFileSync(playersPath, "utf8"));

describe("RD7.2 Phase 1 — player pool stats precompute", () => {
  it("builds + writes the per-season pool-stats file", () => {
    const file = buildPoolStatsForSeason(SEASON, logs, players);
    fs.writeFileSync(outPath, JSON.stringify(file));
    expect(file.version).toBe(POOL_STATS_VERSION);
    expect(file.minMinutes).toBe(10);
    expect(file.premiumSalaryFloor).toBe(44);
    const keys = Object.keys(file.players);
    expect(keys.length).toBeGreaterThan(100); // a real season has hundreds of players
    // Every player's stats are internally consistent + season-keyed.
    for (const k of keys) {
      const s = file.players[k];
      expect(k.endsWith(`|${SEASON}`)).toBe(true);
      expect(s.n).toBeGreaterThan(0);
      expect(s.min).toBeLessThanOrEqual(s.p10 + 1e-6);
      expect(s.p10).toBeLessThanOrEqual(s.p50 + 1e-6);
      expect(s.p50).toBeLessThanOrEqual(s.p90 + 1e-6);
      expect(s.p90).toBeLessThanOrEqual(s.max + 1e-6);
    }
    // eslint-disable-next-line no-console
    console.log(`[Phase1] wrote ${keys.length} players → ${outPath} (${(fs.statSync(outPath).size/1024).toFixed(1)} KB)`);
  });

  it("filter matches pickBiasedLog rules (hasPositive + tier-aware minutes)", () => {
    const good = { pts: 20, reb: 5, min: 28 };
    const dnpZero = { pts: 0, reb: 0, ast: 0, min: 0 };
    const shortNonPremium = { pts: 8, reb: 2, min: 6 };
    expect(logPassesFilter(good, false)).toBe(true);
    expect(logPassesFilter(dnpZero, false)).toBe(false);     // all-zero rejected
    expect(logPassesFilter(dnpZero, true)).toBe(false);
    expect(logPassesFilter(shortNonPremium, false)).toBe(false); // <10 min, non-premium → rejected
    expect(logPassesFilter(shortNonPremium, true)).toBe(true);   // premium → any positive minutes count
    const noMinField = { pts: 12, reb: 4 };
    expect(logPassesFilter(noMinField, false)).toBe(true);   // no minutes field → trust it
  });

  it("known pull resolves to the expected percentile vs the correct population", () => {
    // Pick a high-volume player present in 2425 with many eligible games.
    const candidate = players
      .map((p: any) => ({ p, n: logs.filter((l: any) => String(l.basePlayerId) === String(p.basePlayerId)).length }))
      .filter((x: any) => x.n >= 30)
      .sort((a: any, b: any) => b.n - a.n)[0];
    expect(candidate).toBeTruthy();
    const { p } = candidate;
    const playerLogs = logs.filter((l: any) => String(l.basePlayerId) === String(p.basePlayerId));
    const pool = buildFilteredPool(playerLogs, Number(p.salary ?? 0), String(p.position ?? ""));
    expect(pool.length).toBeGreaterThan(10);

    // Independent percentile from the FULL filtered pool (the correct population).
    const exactPctile = (v: number) => (pool.filter(x => x <= v).length / pool.length) * 100;

    const maxFp = pool[pool.length - 1];
    const minFp = pool[0];
    const medFp = pool[Math.floor(pool.length / 2)];

    // Stored-quantile percentile must agree with the pool at the anchors.
    const file = buildPoolStatsForSeason(SEASON, logs, players);
    const s = file.players[`${p.basePlayerId}|${SEASON}`];
    expect(s).toBeTruthy();

    expect(percentileFromStats(maxFp, s)).toBe(100);          // best pull = lucky ceiling
    expect(percentileFromStats(minFp, s)).toBe(0);            // worst pull = unlucky floor
    // Median pull lands mid-pack by both measures (tolerant — quantile interpolation).
    expect(Math.abs(exactPctile(medFp) - 50)).toBeLessThanOrEqual(12);
    expect(Math.abs(percentileFromStats(medFp, s) - 50)).toBeLessThanOrEqual(15);

    // Stored p50 equals the pool's own median FP (population fidelity).
    const directMedian = pool.length % 2
      ? pool[(pool.length - 1) / 2]
      : (pool[pool.length / 2 - 1] + pool[pool.length / 2]) / 2;
    expect(Math.abs(s.p50 - directMedian)).toBeLessThanOrEqual(0.6); // rounding to 0.1 + interpolation
    // eslint-disable-next-line no-console
    console.log(`[Phase1] ${p.name} (${p.basePlayerId}, $${p.salary}): n=${s.n} min=${s.min} p10=${s.p10} p50=${s.p50} p90=${s.p90} max=${s.max}`);
  });
});
