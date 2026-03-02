/**
 * basketballConfig.ts — Layer 2 (NBA-specific)
 * Passed into the Layer 1 SportAdapter class.
 */

export const BasketballSportConfig = {
    name: 'Basketball (NBA)',
    positions: ['G', 'F', 'C'] as string[],
    rosterSlots: ['G', 'F', 'C', 'FLEX', 'FLEX', 'FLEX'] as string[],
    salaryCap: 180,
    minPlayers: 6,
    maxPlayers: 6,
    positionLimits: {} as Record<string, { min: number; max: number }>,
    // Add this to BasketballSportConfig in basketballConfig.ts
// Replace the existing statCategories array and add statDisplay below it

  statCategories: [
    'pts', 'reb', 'ast', 'stl', 'blk', 'turnovers', 'min', 'fg_pct', 'fg3m',
  ],

  // Layer 2: how stats are displayed on card back, keyed by position
  // FLEX falls back to 'default'
  statDisplay: {
    default: [
      { key: 'pts',       variants: ['points'],             label: 'PTS'  },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB'  },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST'  },
      { key: 'stl',       variants: ['steals'],             label: 'STL'  },
      { key: 'blk',       variants: ['blocks'],             label: 'BLK'  },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'   },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN'  },
      { key: 'fg3m',      variants: ['three_pm','threes'],  label: '3PM'  },
      { key: 'fg_pct',    variants: ['fgPct','fg_percent'], label: 'FG%'  },
    ],
    G: [
      { key: 'pts',       variants: ['points'],             label: 'PTS'  },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST'  },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB'  },
      { key: 'stl',       variants: ['steals'],             label: 'STL'  },
      { key: 'fg3m',      variants: ['three_pm','threes'],  label: '3PM'  },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'   },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN'  },
    ],
    F: [
      { key: 'pts',       variants: ['points'],             label: 'PTS'  },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB'  },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST'  },
      { key: 'blk',       variants: ['blocks'],             label: 'BLK'  },
      { key: 'stl',       variants: ['steals'],             label: 'STL'  },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'   },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN'  },
    ],
    C: [
      { key: 'pts',       variants: ['points'],             label: 'PTS'  },
      { key: 'reb',       variants: ['rebounds','rebs'],    label: 'REB'  },
      { key: 'blk',       variants: ['blocks'],             label: 'BLK'  },
      { key: 'ast',       variants: ['assists','asts'],     label: 'AST'  },
      { key: 'stl',       variants: ['steals'],             label: 'STL'  },
      { key: 'turnovers', variants: ['tov','to'],           label: 'TO'   },
      { key: 'min',       variants: ['minutes','mins'],     label: 'MIN'  },
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
    winCondition: {
      type: 'FIXED_THRESHOLD',
      thresholds: [
        { tier: 'BRONZE',   minFP: 100 },
        { tier: 'SILVER',   minFP: 120 },
        { tier: 'GOLD',     minFP: 150 },
        { tier: 'PLATINUM', minFP: 200 },
        { tier: 'DIAMOND',  minFP: 250 },
      ],
    },
    badges: [
      // ── Scoring ──────────────────────────────────────────────────────
      {
        id: 'GOD_MODE',
        icon: '⚡',
        label: 'God Mode',
        fp: 10,
        test: (s: Record<string,any>) => Number(s.pts) >= 50,
      },
      {
        id: 'FIRE',
        icon: '🔥',
        label: 'Fire',
        fp: 5,
        test: (s: Record<string,any>) => Number(s.pts) >= 40 && Number(s.pts) < 50,
      },
      {
        id: 'BUCKET',
        icon: '🏀',
        label: 'Bucket',
        fp: 2,
        test: (s: Record<string,any>) => Number(s.pts) >= 30 && Number(s.pts) < 40,
      },
      // ── Glass & Dish ──────────────────────────────────────────────────
      {
        id: 'BEAST',
        icon: '🦍',
        label: 'Beast',
        fp: 5,
        test: (s: Record<string,any>) => Number(s.reb) >= 15,
      },
      {
        id: 'GLASS',
        icon: '🧲',
        label: 'Glass',
        fp: 3,
        test: (s: Record<string,any>) => Number(s.reb) >= 12 && Number(s.reb) < 15,
      },
      {
        id: 'WIZARD',
        icon: '🪄',
        label: 'Wizard',
        fp: 5,
        test: (s: Record<string,any>) => Number(s.ast) >= 15,
      },
      {
        id: 'DIME',
        icon: '🧠',
        label: 'Dime',
        fp: 3,
        test: (s: Record<string,any>) => Number(s.ast) >= 12 && Number(s.ast) < 15,
      },
      // ── Lockdown ─────────────────────────────────────────────────────
      {
        id: 'THIEF',
        icon: '🧤',
        label: 'Thief',
        fp: 4,
        test: (s: Record<string,any>) => Number(s.stl) >= 5,
      },
      {
        id: 'SWAT',
        icon: '🚫',
        label: 'Swat',
        fp: 4,
        test: (s: Record<string,any>) => Number(s.blk) >= 5,
      },
      {
        id: 'LOCK',
        icon: '🔒',
        label: 'Lock',
        fp: 4,
        test: (s: Record<string,any>) => (Number(s.stl) + Number(s.blk)) >= 6,
      },
      // ── Milestones ────────────────────────────────────────────────────
      {
        id: 'QUAD_DBL',
        icon: '🦕',
        label: 'Quad Double',
        fp: 50,
        test: (s: Record<string,any>) => {
          const cats = [s.pts, s.reb, s.ast, s.stl, s.blk];
          return cats.filter(v => Number(v) >= 10).length >= 4;
        },
      },
      {
        id: '5X5',
        icon: '🖐️',
        label: '5x5',
        fp: 15,
        test: (s: Record<string,any>) =>
          [s.pts, s.reb, s.ast, s.stl, s.blk].every(v => Number(v) >= 5),
      },
      {
        id: 'TRIPLE_DBL',
        icon: '👑',
        label: 'Triple Double',
        fp: 8,
        test: (s: Record<string,any>) => {
          const cats = [s.pts, s.reb, s.ast, s.stl, s.blk];
          return cats.filter(v => Number(v) >= 10).length >= 3;
        },
      },
      {
        id: 'DOUBLE_DBL',
        icon: '✌️',
        label: 'Double Double',
        fp: 2,
        test: (s: Record<string,any>) => {
          const cats = [s.pts, s.reb, s.ast, s.stl, s.blk];
          return cats.filter(v => Number(v) >= 10).length >= 2;
        },
      },
    ],
    // Player ID is the CDN photo ID — no mapping file needed
    headshotUrl: (playerId: string) =>
      `https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/${playerId}.png`,
  };