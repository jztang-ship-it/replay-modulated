/**
 * shared/lib/chunkReload.ts
 *
 * Stale-chunk recovery. When a new build replaces the chunks that the
 * already-loaded index.html references, the next dynamic import() (or
 * Vite's `<link rel=modulepreload>`) requests a hashed JS path that no
 * longer exists. Vercel's SPA fallback then serves index.html (HTML) for
 * the missing file, and the browser raises:
 *
 *   "'text/html' is not a valid JavaScript MIME type"
 *
 * This can land either as a React render error (caught by ErrorBoundary)
 * or as an unhandled promise rejection / window error event (NOT caught
 * by ErrorBoundary because it never reaches the React tree).
 *
 * We install global listeners that detect that pattern and force a single
 * reload, guarded by sessionStorage so a genuinely persistent error
 * doesn't reload-loop.
 *
 * The vercel.json rewrite update (excluding /assets/ from the SPA fallback)
 * prevents the situation going forward — this is the runtime safety net
 * for users who still have the old index.html cached when they next visit.
 */

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Failed to load module script/i,
  /'text\/html' is not a valid JavaScript MIME type/i,
  /Importing a module script failed/i,
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/i,
];
const RELOAD_GUARD_KEY = "rm_chunk_reload_guard";
const GUARD_TTL_MS = 30_000;

export function isChunkLoadError(input: unknown): boolean {
  const msg = String((input as any)?.message ?? (input as any)?.reason ?? input ?? "");
  return CHUNK_ERROR_PATTERNS.some(rx => rx.test(msg));
}

/** Returns true if a reload was scheduled (caller should stop further work). */
export function tryAutoReload(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const prev = sessionStorage.getItem(RELOAD_GUARD_KEY);
    if (prev) {
      // Only suppress if recent — a stale guard from a previous session
      // shouldn't block recovery.
      const ts = Number(prev);
      if (Number.isFinite(ts) && Date.now() - ts < GUARD_TTL_MS) return false;
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

let installed = false;
export function installChunkReloadHandler(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("unhandledrejection", (e) => {
    if (isChunkLoadError(e.reason)) {
      tryAutoReload();
    }
  });

  window.addEventListener("error", (e) => {
    if (isChunkLoadError(e.error) || isChunkLoadError(e.message)) {
      tryAutoReload();
    }
  });
}
