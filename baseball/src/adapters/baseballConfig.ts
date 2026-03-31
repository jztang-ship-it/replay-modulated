/**
 * baseballConfig.ts — Layer 2 (MLB-specific)
 *
 * NOTE: Baseball adapter integration is not built yet in this workspace.
 * This file is intentionally self-contained and uses TODO placeholders
 * where baseball-specific thresholds/payout tuning will be wired later.
 */

export type BaseballSportKey = 'baseball';
export type BaseballSlot = 'P' | 'BAT' | 'FLEX';
export type BaseballTier = 'ROOKIE' | 'STARTER' | 'ALL_STAR' | 'MVP' | 'BONUS_POOL';

export type BaseballStatCategory =
  | 'h'
  | 'doubles'
  | 'triples'
  | 'hr'
  | 'r'
  | 'rbi'
  | 'bb'
  | 'sb'
  | 'ip'
  | 'k'
  | 'er'
  | 'w'
  | 'qs';

export type BaseballProjectionWeights = Record<BaseballStatCategory, number>;

export interface BaseballWinThreshold {
  tier: BaseballTier;
  /**
   * TODO: Tune baseball tier floors once the baseball FP distribution is known.
   * Kept as 0 placeholder to avoid guessing.
   */
  minFP: number;
  /**
   * TODO: Tune payout multipliers per tier.
   * Kept as 0 placeholder to avoid guessing.
   */
  multiplier: number;
  /**
   * Matches the basketball "progressive" bonus pool behavior.
   * TODO: Confirm whether/when this becomes progressive for baseball economy.
   */
  progressive?: boolean;
}

export interface BaseballBadgeDef {
  id: string;
  icon: string;
  label: string;
  /**
   * TODO: Badge FP value tuning.
   * Currently set to 0 as a placeholder.
   */
  fp: number;
  /**
   * TODO: Replace placeholder logic once baseball stat mapping/badge triggers are finalized.
   * The function signature is included so future adapters can drop in logic safely.
   */
  test: (stats: Record<string, any>) => boolean;
}

export const BaseballSportConfig = {
  // ── Sport identity ────────────────────────────────────────────────────
  sportKey: 'baseball' as BaseballSportKey,
  name: 'MLB Baseball',
  sportLabel: 'MLB Baseball',

  // ── Roster / slots ─────────────────────────────────────────────────────
  rosterSize: 6,
  /**
   * Slots in order (total roster size = 6):
   *   - P
   *   - BAT
   *   - BAT
   *   - BAT
   *   - BAT
   *   - FLEX (may be BAT or P)
   */
  rosterSlots: ['P', 'BAT', 'BAT', 'BAT', 'BAT', 'FLEX'] as const satisfies Readonly<BaseballSlot[]>,

  /**
   * FLEX may be BAT or P.
   * Adapter integration note:
   * - Use this when assigning FLEX to either P or BAT while keeping pitcher max <= 2.
   */
  flexAllows: ['BAT', 'P'] as const satisfies Readonly<Array<'BAT' | 'P'>>,

  /**
   * Max 2 pitchers total. (Across P + any FLEX assigned to P.)
   */
  maxPitchersTotal: 2,

  salaryCap: 180,

  // ── Stat categories ────────────────────────────────────────────────────
  hitStatCategories: ['h', 'doubles', 'triples', 'hr', 'r', 'rbi', 'bb', 'sb'] as const,
  pitchStatCategories: ['ip', 'k', 'er', 'w', 'qs'] as const,
  statCategories: [
    // hitters
    'h',
    'doubles',
    'triples',
    'hr',
    'r',
    'rbi',
    'bb',
    'sb',
    // pitchers
    'ip',
    'k',
    'er',
    'w',
    'qs',
  ] as const satisfies Readonly<BaseballStatCategory[]>,

  statDisplay: {
    default: [
      { key: 'h', label: 'H' },
      { key: 'doubles', label: '2B' },
      { key: 'triples', label: '3B' },
      { key: 'hr', label: 'HR' },
      { key: 'r', label: 'R' },
      { key: 'rbi', label: 'RBI' },
      { key: 'bb', label: 'BB' },
      { key: 'sb', label: 'SB' },
      { key: 'ip', label: 'IP' },
      { key: 'k', label: 'K' },
      { key: 'er', label: 'ER' },
      { key: 'w', label: 'W' },
      { key: 'qs', label: 'QS' },
    ],
  },

  // ── Projection / fantasy-point weights ────────────────────────────────
  projectionWeights: {
    // Hitters
    h: 10,
    doubles: 5,
    triples: 10,
    hr: 20,
    r: 8,
    rbi: 8,
    bb: 6,
    sb: 12,
    // Pitchers
    ip: 3,
    k: 4,
    er: -3,
    w: 6,
    qs: 8,
  } as BaseballProjectionWeights,

  // ── EHLP starter filters ──────────────────────────────────────────────
  /**
   * EHLP starter filters (rules you provided):
   * - Hitters: pa >= 3 and at least 1 meaningful event
   * - Pitchers: ip >= 4
   *
   * Adapter integration note:
   * - "meaningful event" definition is TODO because this config does not ship
   *   the baseball event schema yet in this workspace.
   */
  ehlpStarterFilters: {
    hitters: {
      paMin: 3,
      meaningfulEventCountMin: 1,
      meaningDefinition: 'TODO: define which hitter events count as meaningful for EHLP',
    },
    pitchers: {
      ipMin: 4,
    },
  },

  // ── Badges ─────────────────────────────────────────────────────────────
  /**
   * Badge IDs you provided (tests/FP tuning are TODO placeholders).
   * Adapter integration note:
   * - When baseball stat mapping is finalized, replace `test: () => false`
   *   with real badge conditions.
   */
  badges: {
    hitters: [
      { id: 'MULTI_HIT', icon: '⚾', label: 'Multi Hit', fp: 0, test: () => false },
      { id: 'RBI_MACHINE', icon: '🧩', label: 'RBI Machine', fp: 0, test: () => false },
      { id: 'GOING_YARD', icon: '🚀', label: 'Going Yard', fp: 0, test: () => false },
      { id: 'SPEEDSTER', icon: '💨', label: 'Speedster', fp: 0, test: () => false },
      { id: 'PERFECT_DAY', icon: '🌞', label: 'Perfect Day', fp: 0, test: () => false },
    ] as BaseballBadgeDef[],
    pitchers: [
      { id: 'ACE', icon: '👑', label: 'Ace', fp: 0, test: () => false },
      { id: 'SHUTDOWN', icon: '🛑', label: 'Shutdown', fp: 0, test: () => false },
      { id: 'STRIKEOUT_KING', icon: '🔥', label: 'Strikeout King', fp: 0, test: () => false },
      { id: 'MELTDOWN', icon: '🌪️', label: 'Meltdown', fp: 0, test: () => false },
    ] as BaseballBadgeDef[],
  },

  // ── Tiers / win condition ──────────────────────────────────────────────
  /**
   * Reuse the same overall tier idea as basketball.
   *
   * TODO:
   * - Replace minFP and multiplier values with tuned baseball thresholds/payouts.
   * - Confirm whether BONUS_POOL becomes progressive and how it triggers.
   */
  winCondition: {
    type: 'FIXED_THRESHOLD' as const,
    thresholds: [
      { tier: 'ROOKIE', minFP: 0, multiplier: 0 },
      { tier: 'STARTER', minFP: 0, multiplier: 0 },
      { tier: 'ALL_STAR', minFP: 0, multiplier: 0 },
      { tier: 'MVP', minFP: 0, multiplier: 0 },
      { tier: 'BONUS_POOL', minFP: 0, multiplier: 0, progressive: true },
    ] as BaseballWinThreshold[],
  },
};

export default BaseballSportConfig;

