/**
 * basketball/src/engines/dataEngine.ts
 *
 * Configures the shared engine in per-season mode. The active season is
 * pinned at game-entry time by DailySeasonReelGate (it picks today's
 * season and calls setActiveSeason). Vite base is "/basketball/" so
 * public/ files are served at /basketball/data/seasons/{key}/.
 */
import { configurePerSeason } from "@shared/engines/dataEngine";
import { registerPoolStatsProvider, bumpPoolStats } from "@shared/explanation/poolStatsProvider";
import type { PoolStats } from "@shared/explanation/poolStats";

configurePerSeason({
  seasonsBaseUrl: "/basketball/data/seasons",
});

// RD7.2 — per-season pool stats for the Resolution Engine. Lazily fetched
// (cached per season) on first need; once loaded, bumpPoolStats() makes any
// already-rendered results recompute with real percentiles. The file is the
// build artifact at /basketball/data/seasons/{key}/playerPoolStats.v1.json.
const _poolCache = new Map<string, Record<string, PoolStats>>();
const _poolLoading = new Set<string>();
function loadPoolStats(season: string): void {
  if (!season || _poolCache.has(season) || _poolLoading.has(season)) return;
  _poolLoading.add(season);
  fetch(`/basketball/data/seasons/${season}/playerPoolStats.v1.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((f: { players?: Record<string, PoolStats> } | null) => {
      _poolCache.set(season, (f && f.players) || {});
      bumpPoolStats();
    })
    .catch(() => { _poolCache.set(season, {}); })
    .finally(() => { _poolLoading.delete(season); });
}
registerPoolStatsProvider((basePlayerId, season) => {
  const m = _poolCache.get(season);
  if (!m) { loadPoolStats(season); return null; }
  return m[`${basePlayerId}|${season}`] ?? null;
});

export * from "@shared/engines/dataEngine";
