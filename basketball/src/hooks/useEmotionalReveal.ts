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
  legendaryRatio:   1.6,   // LEGENDARY   — historic performance
  careerNightRatio: 1.4,   // CAREER NIGHT — great game
  hotRatio:         1.2,   // ON FIRE      — above average
  coldRatio:        0.60,  // BRICK CITY   — below expectations
  frozenRatio:      0.40,  // ICE COLD     — bust game
};