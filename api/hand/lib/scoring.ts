/**
 * scoring.js — Fantasy basketball scoring module v2
 * 19 badges, correct FP weights (reb=1.2, tov=-1.0), floor before badges.
 */

// ---------------------------------------------------------------------------
// Badge definitions
// Each badge: { id, icon, label, fp, category, test(stats) }
// Within each category, only the highest-tier badge fires.
// 'milestone' is split into 'milestone' (deduped) and '5x5' (independent).
// ---------------------------------------------------------------------------

const BADGE_DEFS = [
  // SCORING (pts) — highest first
  {
    id: 'GOD_MODE', icon: '⚡', label: 'God Mode', fp: 10,
    category: 'scoring',
    test: (s) => s.pts >= 50,
  },
  {
    id: 'FIRE', icon: '🔥', label: 'Fire', fp: 5,
    category: 'scoring',
    test: (s) => s.pts >= 40 && s.pts < 50,
  },
  {
    id: 'BUCKET', icon: '🏀', label: 'Bucket', fp: 2,
    category: 'scoring',
    test: (s) => s.pts >= 30 && s.pts < 40,
  },

  // REBOUNDS — highest first
  {
    id: 'BEAST', icon: '🦍', label: 'Beast', fp: 5,
    category: 'rebounds',
    test: (s) => s.reb >= 15,
  },
  {
    id: 'GLASS', icon: '🧲', label: 'Glass', fp: 3,
    category: 'rebounds',
    test: (s) => s.reb >= 10 && s.reb < 15,
  },

  // ASSISTS — highest first
  {
    id: 'WIZARD', icon: '🪄', label: 'Wizard', fp: 5,
    category: 'assists',
    test: (s) => s.ast >= 15,
  },
  {
    id: 'DIME', icon: '🧠', label: 'Dime', fp: 3,
    category: 'assists',
    test: (s) => s.ast >= 10 && s.ast < 15,
  },

  // STEALS — highest first
  {
    id: 'THIEF', icon: '🧤', label: 'Thief', fp: 4,
    category: 'steals',
    test: (s) => s.stl >= 5,
  },
  {
    id: 'PICKPOCKET', icon: '👀', label: 'Pickpocket', fp: 2,
    category: 'steals',
    test: (s) => s.stl >= 3 && s.stl < 5,
  },

  // BLOCKS — highest first
  {
    id: 'SWAT', icon: '🚫', label: 'Swat', fp: 4,
    category: 'blocks',
    test: (s) => s.blk >= 5,
  },
  {
    id: 'REJECTION', icon: '🛡️', label: 'Rejection', fp: 2,
    category: 'blocks',
    test: (s) => s.blk >= 3 && s.blk < 5,
  },

  // EFFICIENCY — highest first
  {
    id: 'MAESTRO', icon: '🎼', label: 'Maestro', fp: 8,
    category: 'efficiency',
    test: (s) => s.ast >= 10 && s.turnovers === 0,
  },
  {
    id: 'PURE', icon: '🎯', label: 'Pure', fp: 3,
    category: 'efficiency',
    test: (s) => s.ast >= 5 && s.turnovers === 0,
  },

  // NEGATIVE — most severe first (highest tov threshold = most severe)
  {
    id: 'TURNOVER_MACHINE', icon: '🤦', label: 'Turnover Machine', fp: -6,
    category: 'negative',
    test: (s) => s.turnovers >= 6,
  },
  {
    id: 'SLOPPY', icon: '💦', label: 'Sloppy', fp: -3,
    category: 'negative',
    test: (s) => s.turnovers >= 4 && s.turnovers < 6,
  },

  // MILESTONES (deduped — highest only among these three)
  {
    id: 'QUAD_DBL', icon: '🦕', label: 'Quad Double', fp: 30,
    category: 'milestone',
    test: (s) => {
      const count = [s.pts, s.reb, s.ast, s.stl, s.blk].filter((v) => v >= 10).length
      return count >= 4
    },
  },
  {
    id: 'TRIPLE_DBL', icon: '👑', label: 'Triple Double', fp: 8,
    category: 'milestone',
    test: (s) => {
      const count = [s.pts, s.reb, s.ast, s.stl, s.blk].filter((v) => v >= 10).length
      return count >= 3 && count < 4
    },
  },
  {
    id: 'DOUBLE_DBL', icon: '✌️', label: 'Double Double', fp: 2,
    category: 'milestone',
    test: (s) => {
      const count = [s.pts, s.reb, s.ast, s.stl, s.blk].filter((v) => v >= 10).length
      return count >= 2 && count < 3
    },
  },

  // 5X5 — INDEPENDENT (separate category so it always stacks)
  {
    id: '5X5', icon: '🖐️', label: '5x5', fp: 15,
    category: '5x5',
    test: (s) => s.pts >= 5 && s.reb >= 5 && s.ast >= 5 && s.stl >= 5 && s.blk >= 5,
  },
]

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a stat value to a finite number; non-numeric → 0.
 */
function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Normalize raw stats input into guaranteed numeric fields.
 * Returns null when input is null/undefined/empty.
 */
function normalizeStats(raw) {
  if (raw == null) return null
  if (typeof raw !== 'object') return null
  if (Object.keys(raw).length === 0) return null

  return {
    pts: toNum(raw.pts),
    reb: toNum(raw.reb),
    ast: toNum(raw.ast),
    stl: toNum(raw.stl),
    blk: toNum(raw.blk),
    turnovers: toNum(raw.turnovers),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * calculateScore(stats)
 *
 * @param {object} stats - { pts, reb, ast, stl, blk, turnovers }
 * @returns {{ score: number, badges: Array<{id,icon,label,fp}>, rawStats: object }}
 */
export function calculateScore(stats) {
  const empty = { score: 0, badges: [], rawStats: stats ?? {} }

  const s = normalizeStats(stats)
  if (s === null) return empty

  // Base FP — floored at 0 before badges so turnovers don't compound badge penalties
  const baseFP = Math.max(
    0,
    s.pts * 1.0 +
    s.reb * 1.2 +
    s.ast * 1.5 +
    s.stl * 2.0 +
    s.blk * 2.0 +
    s.turnovers * -1.0,
  )

  // Resolve badges — one per category (highest that passes), 5x5 independent
  const firedCategories = new Set()
  const badges = []

  for (const def of BADGE_DEFS) {
    // For deduped categories, skip if category already has a winner
    if (def.category !== '5x5' && firedCategories.has(def.category)) continue

    if (def.test(s)) {
      badges.push({ id: def.id, icon: def.icon, label: def.label, fp: def.fp })
      if (def.category !== '5x5') firedCategories.add(def.category)
    }
  }

  // Sum badge bonuses
  const bonusTotal = badges.reduce((sum, b) => sum + b.fp, 0)

  // Total FP rounded to 1 decimal
  const totalFP = Math.round((baseFP + bonusTotal) * 10) / 10

  return { score: totalFP, badges, rawStats: s }
}

/**
 * resolveTier(totalFp)
 *
 * @param {number} totalFp
 * @returns {{ tier: string, multiplier: number, color: string }}
 */
export function resolveTier(totalFp) {
  if (totalFp >= 255) return { tier: 'LEGEND',  multiplier: 50,  color: '#a855f7' }
  if (totalFp >= 235) return { tier: 'MVP',     multiplier: 8,   color: '#eab308' }
  if (totalFp >= 225) return { tier: 'ALL_STAR', multiplier: 3,  color: '#f97316' }
  if (totalFp >= 205) return { tier: 'STARTER', multiplier: 1.5, color: '#22c55e' }
  if (totalFp >= 190) return { tier: 'ROOKIE',  multiplier: 0.5, color: '#3b82f6' }
  return                     { tier: 'BUST',    multiplier: 0,   color: '#64748b' }
}

/**
 * isWin(tier) — STARTER and above are wins; ROOKIE is NOT a win.
 *
 * @param {string} tier
 * @returns {boolean}
 */
export function isWin(tier) {
  return ['STARTER', 'ALL_STAR', 'MVP', 'LEGEND'].includes(tier)
}

/**
 * getStreakMultiplier(streak)
 *
 * @param {number} streak
 * @returns {number}
 */
export function getStreakMultiplier(streak) {
  if (streak >= 10) return 2.0
  if (streak >= 5)  return 1.5
  if (streak >= 3)  return 1.2
  return 1.0
}

/**
 * calculatePayout(tierMultiplier, betAmount)
 *
 * @param {number} tierMultiplier
 * @param {number} betAmount
 * @returns {number}
 */
export function calculatePayout(tierMultiplier, betAmount) {
  return tierMultiplier * betAmount
}
