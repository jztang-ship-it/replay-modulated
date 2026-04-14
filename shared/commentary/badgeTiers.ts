/**
 * badgeTiers.ts — Sport-agnostic badge tier ranking.
 *
 * Badges are grouped into tiers by rarity / impressiveness.
 * Commentary should always focus on the HIGHEST tier badge achieved,
 * never mention a lower-tier badge as the headline when a higher one exists.
 *
 * Tier 1 (Legendary):  Quad Double, 5x5, God Mode — almost never happens
 * Tier 2 (Rare):       Triple Double, Fire, Beast, Wizard, Maestro — notable milestone
 * Tier 3 (Solid):      Double Double, Bucket, Glass, Dime, Lock, Thief, Swat — good but expected from stars
 * Tier 4 (Common):     Pickpocket, Rejection, Pure — minor extras
 * Tier 5 (Negative):   Sloppy, Turnover Machine — penalties
 */

export type BadgeTier = 1 | 2 | 3 | 4 | 5;

export interface BadgeTierInfo {
  tier: BadgeTier;
  /** Human-readable label for commentary (e.g. "triple double", "double double") */
  commentaryLabel: string;
  /**
   * Multi-stat milestone — badge represents achievement across multiple stat categories
   * (e.g. triple double, 5x5). These override the story to star_rare_badge because
   * the milestone is bigger than any single stat. Single-stat badges (GOD_MODE, FIRE)
   * are already served by star_went_off templates.
   */
  multiStat?: boolean;
}

/**
 * Badge ID → tier info. Sport-specific badge configs register their IDs here.
 * IDs not found default to tier 4 (common).
 */
const BADGE_TIER_MAP: Record<string, BadgeTierInfo> = {
  // Tier 1 — Legendary (multi-stat milestones override story to star_rare_badge)
  QUAD_DBL:         { tier: 1, commentaryLabel: "quadruple double", multiStat: true },
  "5X5":            { tier: 1, commentaryLabel: "5x5", multiStat: true },
  GOD_MODE:         { tier: 1, commentaryLabel: "50-point game" },

  // Tier 2 — Rare
  TRIPLE_DBL:       { tier: 2, commentaryLabel: "triple double", multiStat: true },
  FIRE:             { tier: 2, commentaryLabel: "40-point game" },
  BEAST:            { tier: 2, commentaryLabel: "15-rebound game" },
  WIZARD:           { tier: 2, commentaryLabel: "15-assist game" },
  MAESTRO:          { tier: 2, commentaryLabel: "zero-turnover double-digit assist game", multiStat: true },

  // Tier 3 — Solid
  DOUBLE_DBL:       { tier: 3, commentaryLabel: "double double" },
  BUCKET:           { tier: 3, commentaryLabel: "30-point game" },
  GLASS:            { tier: 3, commentaryLabel: "double-digit boards" },
  DIME:             { tier: 3, commentaryLabel: "double-digit dimes" },
  LOCK:             { tier: 3, commentaryLabel: "lockdown game" },
  THIEF:            { tier: 3, commentaryLabel: "5-steal game" },
  SWAT:             { tier: 3, commentaryLabel: "5-block game" },

  // Tier 4 — Common
  PICKPOCKET:       { tier: 4, commentaryLabel: "active hands" },
  REJECTION:        { tier: 4, commentaryLabel: "rim protection" },
  PURE:             { tier: 4, commentaryLabel: "clean sheet" },

  // Tier 5 — Negative
  SLOPPY:           { tier: 5, commentaryLabel: "turnover trouble" },
  TURNOVER_MACHINE: { tier: 5, commentaryLabel: "turnover nightmare" },
};

export function getBadgeTier(badgeId: string): BadgeTierInfo {
  return BADGE_TIER_MAP[badgeId] ?? { tier: 4, commentaryLabel: badgeId.toLowerCase().replace(/_/g, " ") };
}

/**
 * Given an array of badge IDs (from a single card's achievements),
 * return the highest-tier (lowest number) badge info.
 * Returns null if no badges or only negative badges.
 */
export function getHighestBadge(badgeIds: string[]): (BadgeTierInfo & { id: string }) | null {
  if (!badgeIds.length) return null;

  let best: (BadgeTierInfo & { id: string }) | null = null;

  for (const id of badgeIds) {
    const info = getBadgeTier(id);
    // Skip negative badges — they shouldn't be the "headline"
    if (info.tier >= 5) continue;
    if (!best || info.tier < best.tier) {
      best = { ...info, id };
    }
  }

  return best;
}

/**
 * Is this badge tier "rare" enough to override the default story focus?
 * Tier 1 and 2 badges should be the headline, not the payout tier.
 */
export function isRareBadge(tier: BadgeTier): boolean {
  return tier <= 2;
}
