// shared/data/mlbAllTimeThresholds.ts
/**
 * MLB single-game all-time thresholds. Seed only — expand as baseball matures.
 */

import type { AllTimeThreshold } from "./nbaAllTimeThresholds";

export const MLB_ALL_TIME_THRESHOLDS: AllTimeThreshold[] = [
  { category: "h",   min: 6, label: "6+ hit game",         priority: 50 },
  { category: "hr",  min: 4, label: "4 home run game",     priority: 60 },
  { category: "rbi", min: 10, label: "10+ RBI game",       priority: 55 },
  { category: "k",   min: 18, label: "18+ strikeout game", priority: 50 },
];
