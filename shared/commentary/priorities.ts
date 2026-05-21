/**
 * priorities.ts — Narrative priority rules.
 *
 * These rules are ENFORCED by classifyArchetype.ts (the priority chain).
 * This file documents them explicitly and provides detail-assembly priority
 * for the sub-line / stamp system.
 *
 * CORE RULE: Archetype classification takes precedence over all other systems.
 * Tone is secondary. Culture is flavor. Badges feed classification, not vice versa.
 */

import type { DetailId } from "./types";

/**
 * Win detail priority — which details get assembled into sub-lines.
 * Higher priority = assembled first. Max 2 details per hand.
 */
export const WIN_DETAIL_PRIORITY: DetailId[] = [
  "record_event",
  "rare_badge",
  "extreme_game",
  "ejected",            // low-min status — high specificity if flag set
  "injured",            // low-min status — high specificity if flag set
  "near_miss_win",
  "high_stats",
  "common_badge",
  "streak_event",
  "streak_proximity",
  "low_min_ambiguous",  // catch-all for sub-10-min outcomes without flags
  "culture_hit",
  "held_card_paid",
];

/**
 * Loss detail priority — same structure, loss-specific.
 */
export const LOSS_DETAIL_PRIORITY: DetailId[] = [
  "record_event",
  "rare_badge",
  "extreme_game",
  "ejected",            // low-min status — fires if ejection flag set
  "injured",            // low-min status — fires if injury flag set
  "zero_card",
  "low_min_ambiguous",  // catch-all; suppresses zero_card when both apply
  "streak_broken",
  "near_miss_loss",
  "turnover_problem",
  "culture_loss",
  "injury_cost",
];

/**
 * Stamps — only fire for truly extraordinary moments.
 * These are separate from the main line. Optional UI treatment.
 */
export type Stamp = "CAREER NIGHT" | "ICE COLD" | "BAD BEAT" | "STREAK BROKEN" | "HISTORIC";

export function selectStamp(
  archetype: string,
  gap: number,
  prevStreak: number,
): Stamp | null {
  if (archetype === "career_night") return "CAREER NIGHT";
  if (archetype === "near_miss" && gap <= 2) return "BAD BEAT";
  if (archetype === "collapse" && prevStreak >= 5) return "STREAK BROKEN";
  return null;
}
