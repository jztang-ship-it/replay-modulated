import perSeasonThresholds from "../data/winThresholds.json" with { type: "json" };
import type { WinTierKey } from "../../../shared/utils/scoreTiers.js";
type SeasonThresholds = Record<Exclude<WinTierKey, "BUST">, number>;
const FALLBACK_MIN_FP: SeasonThresholds = {
  LEGEND: 246, MVP: 224, ALL_STAR: 207, STARTER: 185, ROOKIE: 0,
};
const SEASON_TABLE = perSeasonThresholds as Record<string, SeasonThresholds>;
// Shared by the display and authoritative settlement; preserve existing defaults.
export function getSeasonThresholds(season?: string | null): SeasonThresholds {
  return season && Object.hasOwn(SEASON_TABLE, season) ? SEASON_TABLE[season] : FALLBACK_MIN_FP;
}
