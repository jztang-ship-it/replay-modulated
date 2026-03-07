/**
 * shared/engines/economyEngine.ts — Layer 1 (sport-agnostic)
 *
 * Pure functions for salary calculation, tier assignment, and cap enforcement.
 * No sport-specific numbers live here. All thresholds come in via EconomyConfig.
 *
 * Layer 2 (sport-specific) sets EconomyConfig values in its config file.
 */

import type { TierColor, EconomyConfig, TierThreshold } from "../types";

export type { TierColor, EconomyConfig, TierThreshold };

/** Default economy config — overridden per sport via SportAdapter */
export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  capMax: 180,
  salaryMin: 5,
  salaryMax: 65,
  tierThresholds: [
    { tier: "ORANGE", minSalary: 56 },
    { tier: "PURPLE", minSalary: 43 },
    { tier: "BLUE",   minSalary: 28 },
    { tier: "GREEN",  minSalary: 16 },
    { tier: "WHITE",  minSalary: 0  },
  ],
  salaryRatioCeiling: 2.0,
  salaryRatioFloor: 0.3,
};

export function tierFromSalary(salary: number, config: EconomyConfig): TierColor {
  for (const t of config.tierThresholds) {
    if (salary >= t.minSalary) return t.tier;
  }
  return "WHITE";
}

export function salaryFromProjection(
  projectedFp: number,
  positionMean: number,
  config: EconomyConfig
): number {
  const mean = positionMean > 0 ? positionMean : 1;
  const ratio = projectedFp / mean;
  const t = Math.max(
    0,
    Math.min(
      1,
      (ratio - config.salaryRatioFloor) /
        (config.salaryRatioCeiling - config.salaryRatioFloor)
    )
  );
  const raw = config.salaryMin + t * (config.salaryMax - config.salaryMin);
  return clampInt(raw, config.salaryMin, config.salaryMax);
}

export function totalSalary(salaries: number[]): number {
  return salaries.reduce((s, v) => s + v, 0);
}

export function isUnderCap(salaries: number[], config: EconomyConfig): boolean {
  return totalSalary(salaries) <= config.capMax;
}

export function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
