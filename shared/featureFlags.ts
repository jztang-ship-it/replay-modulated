// shared/featureFlags.ts
/**
 * Runtime feature flags. Default OFF in production. Flip on via env var.
 */
export const featureFlags = {
  topGames:
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_FEATURE_TOP_GAMES === "true") || false,
  // RD7.12 — LLM-authored resolution Flavor. Default OFF: when off, the RD7.11
  // deterministic line is the only line (no model call). Flip in Vercel after
  // prod glass. The never-block design means flipping it on can only IMPROVE
  // the line; any failure still falls back to the deterministic floor.
  llmFlavor:
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_FEATURE_LLM_FLAVOR === "true") || false,
};

/**
 * Slate v2: per-sport feature flag.
 *
 * Reads VITE_FEATURE_SLATE_V2_<SPORTKEY> at runtime.
 * Default OFF for any sport whose env var is unset or not exactly "true".
 *
 * Extensible: adding a new sport (e.g. football) requires only a new
 * env var; no code change here.
 *
 * Examples:
 *   VITE_FEATURE_SLATE_V2_BASKETBALL=true
 *   VITE_FEATURE_SLATE_V2_BASEBALL=false
 *   VITE_FEATURE_SLATE_V2_FOOTBALL=false
 *
 * Reads import.meta.env (Vite-inlined at build time for SPA bundles)
 * with a process.env fallback so the flag also works in Node contexts
 * (Vercel serverless functions, vitest in node mode where vi.stubEnv
 * mutates process.env).
 */
export function isSlateV2Enabled(sportKey: string): boolean {
  const envKey = `VITE_FEATURE_SLATE_V2_${sportKey.toUpperCase()}`;
  const fromImportMeta =
    typeof import.meta !== "undefined"
      ? (import.meta as any).env?.[envKey]
      : undefined;
  if (fromImportMeta !== undefined) return fromImportMeta === "true";
  if (typeof process !== "undefined") {
    return process.env?.[envKey] === "true";
  }
  return false;
}
