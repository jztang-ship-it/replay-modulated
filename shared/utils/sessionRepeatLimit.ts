/**
 * shared/utils/sessionRepeatLimit.ts
 *
 * Sliding-window soft repeat limiter for the slate deal flow. Tracks the
 * last N hand draws and excludes players whose appearance count meets or
 * exceeds the threshold. Relaxation: if filtering would shrink the pool
 * below `minPoolFloor`, returns the pre-filter pool (limit is a soft
 * preference, never crashes the deal).
 *
 * INVISIBLE TO USERS. No user-facing copy mentions a "limit" or "cap."
 * The repeat_limit_relaxed analytics event is internal-only.
 */

export type RepeatLimitConfig = {
  windowSize: number;
  maxAppearances: number;
  minPoolFloor: number;
};

export const DEFAULT_REPEAT_LIMIT: RepeatLimitConfig = {
  windowSize: 10,
  maxAppearances: 3,
  minPoolFloor: 12,
};

export class SessionRepeatLimit {
  private recentHands: string[][] = [];

  /**
   * @param onRelaxed Optional callback invoked whenever filtering would shrink
   * the pool below `minPoolFloor` and we fall back to the pre-filter pool.
   * Wired by sport gameAdapters to fire the internal-only
   * `repeat_limit_relaxed` analytics event (signals tuning need).
   * Kept as a callback to keep this class sport-agnostic and decoupled from
   * the analytics module.
   */
  constructor(private onRelaxed?: () => void) {}

  filter<T extends { basePlayerId: string }>(
    pool: T[],
    config: RepeatLimitConfig,
  ): T[] {
    if (this.recentHands.length === 0) return pool;
    const counts = new Map<string, number>();
    for (const hand of this.recentHands) {
      for (const id of hand) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const saturated = new Set<string>();
    for (const [id, n] of counts) {
      if (n >= config.maxAppearances) saturated.add(id);
    }
    const filtered = pool.filter(p => !saturated.has(p.basePlayerId));
    if (filtered.length < config.minPoolFloor) {
      this.onRelaxed?.();
      return pool;
    }
    return filtered;
  }

  record(
    playerIds: string[],
    config: RepeatLimitConfig = DEFAULT_REPEAT_LIMIT,
  ): void {
    this.recentHands.push([...playerIds]);
    while (this.recentHands.length > config.windowSize) this.recentHands.shift();
  }

  reset(): void {
    this.recentHands = [];
  }
}
