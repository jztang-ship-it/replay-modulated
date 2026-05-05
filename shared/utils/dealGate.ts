/**
 * shared/utils/dealGate.ts
 *
 * Slate-aware filter on the player pool used by the normal deal path.
 * Feature-flag-aware: when slate v2 is OFF for the sport, returns the
 * input pool unchanged. When ON, returns the slate ∩ pool intersection.
 * Top Games / extreme hands explicitly bypass via { bypassSlate: true }.
 */

import { isSlateV2Enabled } from "../featureFlags";
import { getCachedSlate } from "./slateSelector";

type DealGateAdapter = Parameters<typeof getCachedSlate>[0];

export type DealOptions = {
  bypassSlate?: boolean;
  date?: Date;
  themeKey?: string;
};

export function getDealPool<T extends { basePlayerId: string }>(
  adapter: DealGateAdapter,
  fullPool: T[],
  options: DealOptions = {},
): T[] {
  if (!isSlateV2Enabled(adapter.sportKey)) return fullPool;
  if (options.bypassSlate) return fullPool;
  const slateIds = getCachedSlate(adapter, options.date ?? new Date(), options.themeKey);
  const slateSet = new Set(slateIds);
  return fullPool.filter(p => slateSet.has(p.basePlayerId));
}
