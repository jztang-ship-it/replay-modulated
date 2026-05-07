/**
 * basketballConfig.ts — Layer 2 (NBA-specific)
 *
 * Single consistent set of thresholds — no protection period.
 * Calibrated for $250 cap (raised from $200 to enable 2-star rosters), engine-accurate sim:
 *   BUST ~44%, ROOKIE ~26%, STARTER ~17%, ALL_STAR ~9%, MVP ~3.5%, LEGEND ~0.5%
 *
 * Hand 1 is always FTUE (hardcoded Tatum-anchored roster, ~$245 total — leaves a few dollars
 * of cap unused by design since FTUE is a fixed narrative sequence, not a full cap-optimized roster).
 */

export const BasketballSportConfig = {
  name: 'Basketball (NBA)',
  sportLabel: 'Basketball (NBA)',
  sportKey: "basketball" as const,

  positions:    ['PG', 'SG', 'SF', 'PF', 'C'] as string[],
  rosterSlots:  ['PG', 'SG', 'SF', 'PF', 'C', 'FLEX'] as string[],
  excludeFromFlex: [] as string[],

  // Maps legacy or alternate strings -> canonical position
  positionAliases: {
    'G':  'PG',
    'F':  'SF',
    'SG': 'SG', 'PG': 'PG', 'SF': 'SF', 'PF': 'PF', 'C': 'C',
  } as Record<string, string>,

  salaryCap:    250,
  minPlayers:   6,
  maxPlayers:   6,
  positionLimits: {} as Record<string, { min: number; max: number }>,

  // Slate v2 (flag-gated; see shared/utils/slateSelector.ts)
  slateSize: 60,
  anchorCount: 9,        // 3x3 grid in slate overlay (was 10)
  weightExponent: 1.0,
  exclusionList: [] as string[],  // populated during data audit; safe default

  statCategories: [
    'pts', 'reb', 'ast', 'stl', 'blk', 'turnovers', 'min', 'fg_pct', 'fg3m',
  ],

  statDisplay: {
    default: [
      { key: 'pts',       variants: ['points'],             label: 'PTS' },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB' },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST' },
      { key: 'stl',       variants: ['steals'],             label: 'STL' },
      { key: 'blk',       variants: ['blocks'],             label: 'BLK' },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'  },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN' },
      { key: 'fg3m',      variants: ['three_pm','threes'],  label: '3PM' },
      { key: 'fg_pct',    variants: ['fgPct','fg_percent'], label: 'FG%' },
    ],
    PG: [
      { key: 'pts',       variants: ['points'],             label: 'PTS' },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST' },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB' },
      { key: 'stl',       variants: ['steals'],             label: 'STL' },
      { key: 'fg3m',      variants: ['three_pm','threes'],  label: '3PM' },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'  },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN' },
    ],
    SG: [
      { key: 'pts',       variants: ['points'],             label: 'PTS' },
      { key: 'fg3m',      variants: ['three_pm','threes'],  label: '3PM' },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB' },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST' },
      { key: 'stl',       variants: ['steals'],             label: 'STL' },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'  },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN' },
    ],
    SF: [
      { key: 'pts',       variants: ['points'],             label: 'PTS' },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB' },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST' },
      { key: 'blk',       variants: ['blocks'],             label: 'BLK' },
      { key: 'stl',       variants: ['steals'],             label: 'STL' },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'  },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN' },
    ],
    PF: [
      { key: 'pts',       variants: ['points'],             label: 'PTS' },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB' },
      { key: 'blk',       variants: ['blocks'],             label: 'BLK' },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST' },
      { key: 'stl',       variants: ['steals'],             label: 'STL' },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'  },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN' },
    ],
    C: [
      { key: 'pts',       variants: ['points'],             label: 'PTS' },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB' },
      { key: 'blk',       variants: ['blocks'],             label: 'BLK' },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST' },
      { key: 'stl',       variants: ['steals'],             label: 'STL' },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'  },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN' },
    ],
  } as Record<string, Array<{ key: string; variants: string[]; label: string }>>,

  projectionWeights: {
    pts:       1.0,
    reb:       1.2,
    ast:       1.5,
    stl:       2.0,
    blk:       2.0,
    turnovers: -1.0,
  },

  historicalLogFilters: { seasonsBack: 3, minMinutes: 10 },

  // Single win condition — thresholds never change.
  // Protected mode (hands 2-30) uses guaranteeTierFloor() for better deals,
  // NOT lower thresholds. House edge stays constant.
  winCondition: {
    type: 'FIXED_THRESHOLD',
    thresholds: [
      { tier: 'ROOKIE',   minFP: 190, multiplier: 0.5  },
      { tier: 'STARTER',  minFP: 205, multiplier: 1.5  },
      { tier: 'ALL_STAR', minFP: 225, multiplier: 3.0  },
      { tier: 'MVP',      minFP: 235, multiplier: 8.0  },
      { tier: 'LEGEND',   minFP: 255, multiplier: 50   },
    ],
  },

  badges: [
    // Scoring
    { id: 'GOD_MODE',         icon: '⚡',  label: 'God Mode',         fp: 10, test: (s: Record<string,any>) => Number(s.pts) >= 50 },
    { id: 'FIRE',             icon: '🔥',  label: 'Fire',             fp: 5,  test: (s: Record<string,any>) => Number(s.pts) >= 40 && Number(s.pts) < 50 },
    { id: 'BUCKET',           icon: '🏀',  label: 'Bucket',           fp: 2,  test: (s: Record<string,any>) => Number(s.pts) >= 30 && Number(s.pts) < 40 },
    // Rebounds
    { id: 'BEAST',            icon: '🦍',  label: 'Beast',            fp: 5,  test: (s: Record<string,any>) => Number(s.reb) >= 15 },
    { id: 'GLASS',            icon: '🧲',  label: 'Glass',            fp: 3,  test: (s: Record<string,any>) => Number(s.reb) >= 10 && Number(s.reb) < 15 },
    // Assists
    { id: 'WIZARD',           icon: '🪄',  label: 'Wizard',           fp: 5,  test: (s: Record<string,any>) => Number(s.ast) >= 15 },
    { id: 'DIME',             icon: '🧠',  label: 'Dime',             fp: 3,  test: (s: Record<string,any>) => Number(s.ast) >= 10 && Number(s.ast) < 15 },
    // Steals
    { id: 'THIEF',            icon: '🧤',  label: 'Thief',            fp: 4,  test: (s: Record<string,any>) => Number(s.stl) >= 5 },
    { id: 'PICKPOCKET',       icon: '👀',  label: 'Pickpocket',       fp: 2,  test: (s: Record<string,any>) => Number(s.stl) >= 3 && Number(s.stl) < 5 },
    // Blocks
    { id: 'SWAT',             icon: '🚫',  label: 'Swat',             fp: 4,  test: (s: Record<string,any>) => Number(s.blk) >= 5 },
    { id: 'REJECTION',        icon: '🛡️', label: 'Rejection',        fp: 2,  test: (s: Record<string,any>) => Number(s.blk) >= 3 && Number(s.blk) < 5 },
    // Efficiency
    { id: 'MAESTRO',          icon: '🎼',  label: 'Maestro',          fp: 8,  test: (s: Record<string,any>) => Number(s.ast) >= 10 && Number(s.turnovers) === 0 },
    { id: 'PURE',             icon: '🎯',  label: 'Pure',             fp: 3,  test: (s: Record<string,any>) => Number(s.ast) >= 5 && Number(s.turnovers) === 0 },
    { id: 'SLOPPY',           icon: '💦',  label: 'Sloppy',           fp: -3, test: (s: Record<string,any>) => Number(s.turnovers) >= 4 && Number(s.turnovers) < 6 },
    { id: 'TURNOVER_MACHINE', icon: '🤦',  label: 'Turnover Machine', fp: -6, test: (s: Record<string,any>) => Number(s.turnovers) >= 6 },
    // Milestones
    { id: 'QUAD_DBL',   icon: '🦕',  label: 'Quad Double',   fp: 30, test: (s: Record<string,any>) => [s.pts,s.reb,s.ast,s.stl,s.blk].filter(v => Number(v) >= 10).length >= 4 },
    { id: '5X5',        icon: '🖐️', label: '5x5',           fp: 15, test: (s: Record<string,any>) => [s.pts,s.reb,s.ast,s.stl,s.blk].every(v => Number(v) >= 5) },
    { id: 'TRIPLE_DBL', icon: '👑',  label: 'Triple Double', fp: 8,  test: (s: Record<string,any>) => [s.pts,s.reb,s.ast,s.stl,s.blk].filter(v => Number(v) >= 10).length >= 3 },
    { id: 'DOUBLE_DBL', icon: '✌️', label: 'Double Double', fp: 2,  test: (s: Record<string,any>) => [s.pts,s.reb,s.ast,s.stl,s.blk].filter(v => Number(v) >= 10).length >= 2 },
  ],

  headshotUrl: (playerId: string) =>
    `https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/${playerId}.png`,
};
