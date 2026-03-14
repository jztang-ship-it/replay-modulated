/**
 * basketball/src/hooks/useEmotionalReveal.ts
 * Re-exports shared hook with basketball-tuned RevealConfig.
 *
 * Basketball thresholds:
 *   Smoking Hot:  actual >= 1.6x projected  (elite performance)
 *   On Fire:      actual >= 1.4x projected  (great game)
 *   Ice Cold:     actual <= 0.8x projected  (below expectations)
 *   Freezing:     actual <= 0.6x projected  (bust game)
 */
export * from "@shared/hooks/useEmotionalReveal";
export { DEFAULT_REVEAL_CONFIG as BASKETBALL_REVEAL_CONFIG } from "@shared/hooks/useEmotionalReveal";
import type { RevealConfig } from "@shared/hooks/useEmotionalReveal";

export const REVEAL_CONFIG: RevealConfig = {
  smokingHotRatio:  1.6,   // SMOKING HOT  — elite performance
  onFireRatio:      1.4,   // ON FIRE      — great game
  iceColdRatio:     0.80,  // ICE COLD     — below expectations
  freezingRatio:    0.60,  // FREEZING     — bust game
};