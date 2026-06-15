// shared/explanation/poolStatsProvider.ts
//
// RD7.2 wiring — sport-injection registry for per-player pool stats, in the
// same pattern as setSoundPack / registerRecordSources. The pool-stats DATA
// is sport-specific (per-season JSON); the sport registers a provider at
// module load. Shared consumers (the H2H explanation wiring) read through
// getPoolStats and never import sport data directly.
//
// Async note: a sport's provider may lazily fetch its season file and return
// null until it lands. When the data arrives the sport calls bumpPoolStats(),
// and subscribed consumers recompute. Keeps the engine pure + sync.

import type { PoolStats } from "./poolStats";

type Provider = (basePlayerId: string, season: string) => PoolStats | null;

let _provider: Provider | null = null;
const _subs = new Set<() => void>();

export function registerPoolStatsProvider(fn: Provider): void {
  _provider = fn;
}

export function getPoolStats(basePlayerId: string, season: string): PoolStats | null {
  return _provider ? _provider(basePlayerId, season) : null;
}

/** Sport calls this once its season pool-stats data has loaded so that any
 *  already-rendered consumer recomputes with real percentiles. */
export function bumpPoolStats(): void {
  for (const cb of _subs) cb();
}

export function subscribePoolStats(cb: () => void): () => void {
  _subs.add(cb);
  return () => { _subs.delete(cb); };
}
