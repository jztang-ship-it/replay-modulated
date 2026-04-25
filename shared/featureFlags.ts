// shared/featureFlags.ts
/**
 * Runtime feature flags. Default OFF in production. Flip on via env var.
 */
export const featureFlags = {
  topGames:
    (typeof import.meta !== "undefined" &&
      (import.meta as any).env?.VITE_FEATURE_TOP_GAMES === "true") || false,
};
