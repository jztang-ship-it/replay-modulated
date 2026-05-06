/**
 * football/src/hooks/useEmotionalReveal.ts
 * Re-exports shared hook with football-tuned RevealConfig.
 *
 * Football thresholds:
 *   Career Night: actual >= 1.4x projected  (closer range — football scoring tighter)
 *   Hot:          no separate hot bucket     (same as career night threshold)
 *   Cold:         actual <= 0.60x projected  (stricter cold threshold)
 */
export * from "@shared/hooks/useEmotionalReveal";
import type { RevealConfig } from "@shared/hooks/useEmotionalReveal";

export const REVEAL_CONFIG: RevealConfig = {
  careerNightRatio: 1.4,
  hotRatio:         1.4,  // same as careerNight — no separate "hot" bucket
  coldRatio:        0.60,
};