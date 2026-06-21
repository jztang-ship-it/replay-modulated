// shared/lib/retryWithBackoff.ts
//
// Small bounded retry-with-backoff helper. Introduced for the H2H sender-hand
// fetch's TRANSIENT failure path (docs/replaymod-design-decisions.md →
// "Missing opponent hand: fail-open floor"): transient failures (network /
// 4xx / 5xx) retry a small bounded number of times before degrading to the
// fail-open floor. Legacy failures (sender_resolved:false) do NOT throw, so
// they resolve on the first attempt and skip retry entirely.
//
// `sleep` is injectable so tests don't wall-clock wait.

export interface RetryOptions {
  /** Total attempts including the first try (>= 1). */
  attempts: number;
  /** Delay before each RETRY, indexed by retry number (attempt-1). If fewer
   *  entries than retries, the last entry is reused. */
  backoffMs: number[];
  /** Injectable delay — defaults to setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

/** Calls `fn(attempt)` for attempt = 1..attempts. Resolves with the first
 *  successful result. On a thrown error, sleeps backoffMs[attempt-1] then
 *  retries; after the final attempt the last error is rethrown. A resolved
 *  value (even a "sentinel" like a legacy marker) short-circuits — only THROWS
 *  trigger retry. */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const { attempts, backoffMs, sleep = defaultSleep } = opts;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts) break;
      const delay = backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 0;
      await sleep(delay);
    }
  }
  throw lastErr;
}
