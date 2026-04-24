// shared/data/nbaAllTimeThresholds.ts
/**
 * NBA single-game all-time thresholds. Curated, edited by hand. Any star-card
 * game that crosses a threshold (simple or composite) earns T1 in the Top
 * Games detector.
 *
 * Priority ordering: composites rank above singles. Higher priority wins when
 * multiple thresholds match the same game; delta-above-threshold breaks ties
 * within the same priority band.
 */

export interface AllTimeThreshold {
  /** Category code — either a single stat key ("pts") or a composite rule key ("td_30_20_20"). */
  category: string;
  /** Stat value must be >= min to qualify. Composites use min: 1 (the rule does the work). */
  min: number;
  /** Human label flowed into commentary via the {topLabel} token. */
  label: string;
  /** Higher wins when multiple thresholds match. Composites: 80-100. Singles: 40-60. */
  priority: number;
}

export const NBA_ALL_TIME_THRESHOLDS: AllTimeThreshold[] = [
  // Composites — rank above singles
  { category: "quad_double",     min: 1,  label: "quadruple-double — one of the rarest feats ever",   priority: 100 },
  { category: "td_60_10_10",     min: 1,  label: "60-point triple-double",                            priority: 95 },
  { category: "td_40_20_20",     min: 1,  label: "40/20/20 triple-double",                            priority: 90 },
  { category: "td_30_20_20",     min: 1,  label: "30/20/20 triple-double — top-five ever",            priority: 85 },
  { category: "five_by_five",    min: 1,  label: "5x5 — 5+ in five categories",                       priority: 80 },
  { category: "fifty_plus_game", min: 1,  label: "50+ point game",                                    priority: 60 },

  // Singles
  { category: "pts",    min: 70, label: "70+ point game — top-thirty ever", priority: 50 },
  { category: "reb",    min: 30, label: "30+ rebounds",                     priority: 40 },
  { category: "ast",    min: 20, label: "20+ assists",                      priority: 40 },
  { category: "threes", min: 12, label: "12+ threes",                       priority: 40 },
  { category: "stl",    min: 9,  label: "9+ steals",                        priority: 40 },
  { category: "blk",    min: 10, label: "10+ blocks",                       priority: 40 },
];
