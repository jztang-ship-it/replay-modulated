/**
 * classifyArchetype.ts — Deterministic archetype classification.
 *
 * Priority chain: first match wins, exactly one archetype per hand.
 * No scoring, no blending, no probabilistic logic.
 * Archetype classification takes precedence over all other systems.
 */

import type {
  CommentaryArchetype,
  Register,
  CommentaryInput,
  CommentaryRosterCard,
  WinTier,
} from "./types";
import type { BadgeTierInfo } from "./badgeTiers";
import { getHighestBadge, isRareBadge } from "./badgeTiers";
import { selectStar } from "./storySelector";

// ── Helpers ────────────────────────────────────────────────────────────────

function ratio(c: CommentaryRosterCard): number {
  const p = Number(c.projectedFp ?? 0);
  return p > 0 ? c.actualFp / p : 1;
}

function hasTier1ExtremeOnStar(star: CommentaryRosterCard | null): boolean {
  if (!star) return false;
  return (star.extremeFlags ?? []).some(f => f.tier === 1);
}

function getStarBadge(star: CommentaryRosterCard | null): (BadgeTierInfo & { id: string }) | null {
  if (!star) return null;
  const ids = (star.achievements ?? []).map(a => a.id);
  return getHighestBadge(ids);
}

const HIGH_TIERS: Set<WinTier> = new Set(["ALL_STAR", "MVP", "LEGEND"]);

// ── Classification ─────────────────────────────────────────────────────────

export interface ClassificationResult {
  archetype: CommentaryArchetype;
  star: CommentaryRosterCard | null;
  starRatio: number;
  highestBadge: (BadgeTierInfo & { id: string }) | null;
  hasTier1Extreme: boolean;
  nearMiss: boolean;
  deltaToNextTier: number;
}

/**
 * Classify a hand into exactly one archetype.
 * Priority chain — first match wins. No scoring, no blending.
 */
export function classifyArchetype(input: CommentaryInput): ClassificationResult {
  const register: Register = input.isBust ? "loss" : "win";
  const star = selectStar(input.roster);
  const r = star ? ratio(star) : 1.0;
  const badge = getStarBadge(star);
  const hasExtreme = hasTier1ExtremeOnStar(star);
  const gap = (input.nextTierMin ?? 0) > 0 ? (input.nextTierMin! - input.totalFp) : 999;
  const nearMiss = input.isBust && gap > 0 && gap <= 5;

  const base = {
    star,
    starRatio: r,
    highestBadge: badge,
    hasTier1Extreme: hasExtreme,
    nearMiss,
    deltaToNextTier: gap,
  };

  // ── Priority 1: Career night (tier 1 extreme on star) ──
  if (hasExtreme) {
    return { ...base, archetype: "career_night" };
  }

  // ── Priority 2: Badge explosion (multi-stat badge tier 1-2) ──
  if (badge && isRareBadge(badge.tier) && badge.multiStat === true) {
    return { ...base, archetype: "badge_explosion" };
  }

  // ── Priority 3: Near miss (loss, ≤5 FP from ROOKIE) ──
  if (nearMiss) {
    return { ...base, archetype: "near_miss" };
  }

  // ── Priority 4: Collapse (loss, streak broken, blown out) ──
  if (register === "loss" && input.prevStreak >= 3 && gap > 15) {
    return { ...base, archetype: "collapse" };
  }

  // ── Priority 5: Star carry big (win, high ratio, high tier) ──
  if (register === "win" && r >= 1.35 && HIGH_TIERS.has(input.winTier)) {
    return { ...base, archetype: "star_carry_big" };
  }

  // ── Priority 5b: High-score, low-reward (star went off but hand only cashed ROOKIE) ──
  // Prevents ROOKIE wins from getting celebratory star_carry hype-tone templates
  // ("easy money") when the actual result was a barely-cashed rookie hand.
  // Falls back through ugly_win → balanced_win per archetype registry.
  if (register === "win" && r >= 1.35 && input.winTier === "ROOKIE") {
    return { ...base, archetype: "high_score_low_reward" };
  }

  // ── Priority 6: Star carry (win, high ratio) ──
  if (register === "win" && r >= 1.35) {
    return { ...base, archetype: "star_carry" };
  }

  // ── Priority 7: Star carried loss ──
  // Lowered threshold 1.35 → 1.0 so that losses where the star was at or above
  // projection route to "star did their job, team failed" voice — not the
  // generic everyone_flat blame. Captures the nuance the user flagged:
  // objective reporting when the star performed and the rest didn't deliver.
  if (register === "loss" && r >= 1.0) {
    return { ...base, archetype: "star_carried_loss" };
  }

  // ── Priority 8: Star failed (no-show) ──
  if (register === "loss" && r < 0.65) {
    return { ...base, archetype: "star_failed" };
  }

  // ── Priority 9: Star cold ──
  if (register === "loss" && r < 0.75) {
    return { ...base, archetype: "star_cold" };
  }

  // ── Priority 10: Ugly win ──
  if (register === "win" && r < 0.8 && input.winTier === "ROOKIE") {
    return { ...base, archetype: "ugly_win" };
  }

  // ── Priority 11: Star delivered ──
  if (register === "win" && r >= 1.0) {
    return { ...base, archetype: "star_delivered" };
  }

  // ── Fallthrough ──
  if (register === "loss") {
    return { ...base, archetype: "everyone_flat" };
  }
  return { ...base, archetype: "balanced_win" };
}
