/**
 * shared/lib/chDebug.ts
 *
 * Single-file [ch-debug] instrumentation helper for the ripe-challenge
 * "drops to a fresh deal" investigation. Removal = revert this file +
 * the commit's call sites. Single point of removal by design.
 *
 * Contract:
 *   - console.info only — never warn/error. Must not feed Sentry's
 *     console-level breadcrumb pipeline as an error.
 *   - Prefix "[ch-debug]" on every log so it's greppable in DevTools.
 *   - Always enriches the payload with path (window.location.pathname)
 *     and t (Date.now()) so the log can be correlated to a route and
 *     ordered across files.
 *   - Gate: emits unless window.__CH_DEBUG__ === false. On by default
 *     (any value other than literal false, including undefined, emits).
 *   - SSR-safe: no-op when window is undefined.
 */

export function chDebug(label: string, payload?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __CH_DEBUG__?: unknown }).__CH_DEBUG__ === false) return;
  // eslint-disable-next-line no-console
  console.info("[ch-debug]", label, {
    path: window.location.pathname,
    t: Date.now(),
    ...payload,
  });
}
