/**
 * baseball/src/hooks/useEmotionalReveal.ts
 * Baseball-tuned performance thresholds.
 * Slightly more lenient than basketball — baseball variance is higher.
 */
export * from "@shared/hooks/useEmotionalReveal";
export type { ShakeType } from "@shared/hooks/useEmotionalReveal";
import type { RevealConfig } from "@shared/hooks/useEmotionalReveal";

export const REVEAL_CONFIG: RevealConfig = {
  smokingHotRatio: 1.7,  // SMOKING HOT — elite game
  onFireRatio:     1.4,  // ON FIRE     — great game
  iceColdRatio:    0.75, // ICE COLD    — below expectations
  freezingRatio:   0.55, // FREEZING    — bust
};
