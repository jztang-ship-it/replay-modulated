/**
 * shared/commentary/archetypes.ts
 * Master archetype registry — every CommentaryArchetype mapped to metadata.
 * 13 active archetypes (populated with lines) + 19 reserved (schema only).
 */

import type { CommentaryArchetype, Register } from "./types";

export interface ArchetypeMeta {
  register: Register | "any";
  active: boolean;
  fallback: CommentaryArchetype | null;
  legacyStoryIds: string[];
}

export const ARCHETYPE_REGISTRY: Record<CommentaryArchetype, ArchetypeMeta> = {
  // ── Active — Win ──────────────────────────────────────────────────────────
  star_carry:       { register: "win",  active: true,  fallback: "star_delivered",   legacyStoryIds: ["star_went_off"] },
  star_carry_big:   { register: "win",  active: true,  fallback: "star_carry",       legacyStoryIds: ["star_went_off"] },
  star_delivered:   { register: "win",  active: true,  fallback: "balanced_win",     legacyStoryIds: ["star_delivered"] },
  balanced_win:     { register: "win",  active: true,  fallback: null,               legacyStoryIds: ["clean_win", "star_quiet_win"] },
  badge_explosion:  { register: "any",  active: true,  fallback: "star_carry",       legacyStoryIds: ["star_rare_badge"] },
  ugly_win:         { register: "win",  active: true,  fallback: "balanced_win",     legacyStoryIds: [] },
  career_night:     { register: "any",  active: true,  fallback: "star_carry",       legacyStoryIds: [] },

  // ── Active — Loss ─────────────────────────────────────────────────────────
  near_miss:        { register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: [] },
  star_failed:      { register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: ["star_no_showed"] },
  star_cold:        { register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: ["star_cold"] },
  star_carried_loss:{ register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: ["star_carried_loss"] },
  everyone_flat:    { register: "loss", active: true,  fallback: null,               legacyStoryIds: ["everyone_flat"] },
  collapse:         { register: "loss", active: true,  fallback: "everyone_flat",    legacyStoryIds: [] },

  // ── Reserved (schema only, no lines yet) ──────────────────────────────────
  streak_first:           { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  streak_milestone:       { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  streak_broken:          { register: "loss", active: false, fallback: "everyone_flat",    legacyStoryIds: [] },
  hold_rewarded:          { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  draw_rewarded:          { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  smart_hold_star:        { register: "win",  active: false, fallback: "star_carry",       legacyStoryIds: [] },
  smart_hold_role_player: { register: "win",  active: false, fallback: "balanced_win",     legacyStoryIds: [] },
  painful_near_miss:      { register: "loss", active: false, fallback: "near_miss",        legacyStoryIds: [] },
  anchor_underperformed:  { register: "loss", active: false, fallback: "star_failed",      legacyStoryIds: [] },
  one_player_threw:       { register: "loss", active: false, fallback: "star_failed",      legacyStoryIds: [] },
  outlier_bench_hero:     { register: "win",  active: false, fallback: "balanced_win",     legacyStoryIds: [] },
  ice_cold:               { register: "loss", active: false, fallback: "star_cold",        legacyStoryIds: [] },
  lucky_escape:           { register: "win",  active: false, fallback: "ugly_win",         legacyStoryIds: [] },
  comfortable_win:        { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  dominant_win:           { register: "win",  active: false, fallback: "star_carry_big",   legacyStoryIds: [] },
  goat_clinch:            { register: "win",  active: false, fallback: "star_carry_big",   legacyStoryIds: [] },
  mvp_clinch:             { register: "win",  active: false, fallback: "star_carry_big",   legacyStoryIds: [] },
  bust_result:            { register: "loss", active: false, fallback: "everyone_flat",    legacyStoryIds: [] },
  high_score_low_reward:  { register: "win",  active: false, fallback: "star_delivered",   legacyStoryIds: [] },
  wrong_star_wrong_night: { register: "loss", active: false, fallback: "star_cold",        legacyStoryIds: [] },
  clutch_finish:          { register: "win",  active: false, fallback: "star_carry",       legacyStoryIds: [] },
  overperformance_shock:  { register: "win",  active: false, fallback: "star_carry_big",   legacyStoryIds: [] },
  underperformance_shock: { register: "loss", active: false, fallback: "star_failed",      legacyStoryIds: [] },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getActiveArchetypes(): CommentaryArchetype[] {
  return (Object.entries(ARCHETYPE_REGISTRY) as [CommentaryArchetype, ArchetypeMeta][])
    .filter(([, meta]) => meta.active)
    .map(([id]) => id);
}

export function getFallbackChain(archetype: CommentaryArchetype): CommentaryArchetype[] {
  const chain: CommentaryArchetype[] = [archetype];
  let current = archetype;
  for (let i = 0; i < 3; i++) {
    const fb = ARCHETYPE_REGISTRY[current]?.fallback;
    if (!fb || chain.includes(fb)) break;
    chain.push(fb);
    current = fb;
  }
  return chain;
}
