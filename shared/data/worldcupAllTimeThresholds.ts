// shared/data/worldcupAllTimeThresholds.ts
/**
 * World Cup (soccer) single-match all-time thresholds. Seed only.
 */

import type { AllTimeThreshold } from "./nbaAllTimeThresholds";

export const WORLDCUP_ALL_TIME_THRESHOLDS: AllTimeThreshold[] = [
  { category: "goals",   min: 4, label: "4+ goal match",   priority: 60 },
  { category: "assists", min: 3, label: "3+ assist match", priority: 50 },
];
