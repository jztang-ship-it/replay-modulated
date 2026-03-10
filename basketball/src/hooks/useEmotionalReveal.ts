/**
 * basketball/src/hooks/useEmotionalReveal.ts
 * Re-exports shared hook with basketball-tuned RevealConfig.
 *
 * Basketball thresholds:
 *   Career Night: actual >= 1.6x projected  (legendary performance)
 *   Hot:          actual >= 1.4x projected  (on fire)
 *   Cold:         actual <= 0.75x projected (cold game)
 */
export * from "@shared/hooks/useEmotionalReveal";
export { DEFAULT_REVEAL_CONFIG as BASKETBALL_REVEAL_CONFIG } from "@shared/hooks/useEmotionalReveal";
import type { RevealConfig } from "@shared/hooks/useEmotionalReveal";

export const REVEAL_CONFIG: RevealConfig = {
  careerNightRatio: 1.6,
  hotRatio:         1.4,
  coldRatio:        0.75,
};