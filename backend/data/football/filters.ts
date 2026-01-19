/**
 * Football Data Filters Configuration
 * Configurable filters for processing football/soccer data
 */

export interface FootballDataFilters {
  minMinutesPlayed: number;
  minMatchesPlayed: number;
  seasonsIncluded: number[];
  competitionsIncluded: string[];
  tierCutoffs: {
    orange: number;
    purple: number;
    blue: number;
    green: number;
  };
}

export const DEFAULT_FOOTBALL_FILTERS: FootballDataFilters = {
  minMinutesPlayed: 180,
  minMatchesPlayed: 1,
  seasonsIncluded: [2022, 2023],
  competitionsIncluded: ['Premier League'],
  tierCutoffs: {
    orange: 0.1,
    purple: 0.25,
    blue: 0.5,
    green: 0.75,
  },
};
