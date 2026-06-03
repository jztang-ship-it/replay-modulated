// shared/commentary/commentaryFacts.ts
//
// Phase 3 authored voice engine (lock: docs/challenge-landing-v2-phase3-
// authored-voice-engine-lock.md §A "CommentaryFacts"). The verified-
// fact object the model is trusted with: every field is sourced from
// deterministic code (anchor selector, in-memory roster, trigger
// evaluator, anchor-truth classifier). Facts not present here MAY NOT
// appear in the rendered output — the validator rejects extraneous
// team/opponent references downstream.
//
// Sport- and surface-agnostic: the same shape feeds the challenge
// headline endpoint today and the regular post-hand commentary path
// later (Phase 2 of the lock). No basketball-specific imports here.
//
// venue is NEVER populated in v1 per the lock §"Decisions locked" item 1
// (no verified era-bracketed team→arena source exists yet). The shape
// has no `venue` slot at all — keeping it absent at the type level so
// a future contributor can't accidentally wire it.

import {
  classifyAnchorTruth,
  type AnchorTruthVerdict,
} from "./anchorTruth";
import { lookupCulture, type CultureShape } from "./selectCommentary";
import type { TopGameReason } from "./types";

// ── Public shapes ──────────────────────────────────────────────────────

export type CommentarySurface = "challenge_headline" | "post_hand";

export type CommentaryTrigger =
  | "choke"
  | "miss"
  | "big_score"
  | "rare_pull"
  | "default";

/** The anchor block. Optional on the top-level facts so miss / no-
 *  anchor cases can produce a valid object without a hero/villain. */
export interface CommentaryFactsAnchor {
  name: string;
  basePlayerId: string;
  nicknames: string[];
  /** May be empty string when the culture entry has no `knownFor`. The
   *  model treats an empty string the same as a missing field. */
  knownFor: string;
  tier: string;
  team: string;
  /** The REAL box line — pts/reb/ast/stl/blk/threes/min/.... Passed
   *  through verbatim from `GeneratedCard.statLine`. */
  statLine: Record<string, number | string>;
  /** 3-letter opponent code (verified, from gameInfo.opponent). */
  opponent: string;
  /** "H" or "A" — empty string when the source didn't populate it. */
  homeAway: "H" | "A" | "";
  /** YYYY-MM-DD. */
  date: string;
  /** rare_pull → from detectTopGame's primaryReason on the trigger
   *  result. big_score → derived from the anchor's actualFp. Omitted
   *  otherwise. */
  topReason?: TopGameReason;
}

export interface CommentaryFacts {
  surface: CommentarySurface;
  sport: string;
  /** e.g. "0809" — drives the anti-anachronism rule in VOICE_CONTRACT. */
  season: string;
  trigger: CommentaryTrigger;
  verdict: AnchorTruthVerdict;
  /** Absent on miss + when the anchor doesn't resolve (legacy rows etc.). */
  anchor?: CommentaryFactsAnchor;
  /** miss only — how many FP short of the next tier. */
  nearMissGap?: number;
  /** miss only — tier just missed (e.g. "ALL_STAR"). */
  nearMissNextTier?: string;
}

/** The builder's discriminated result. `skip` means the caller MUST NOT
 *  POST to /api/headline — the bank pick is the correct surface for
 *  this hand (default trigger; no LLM-authored headline planned in v1). */
export type CommentaryFactsResult =
  | { kind: "facts"; facts: CommentaryFacts }
  | { kind: "skip"; reason: "default_trigger" };

// ── Builder input ──────────────────────────────────────────────────────

/** Minimal per-card shape the builder reads. Maps directly onto the
 *  basketball `GeneratedCard` and is intentionally smaller than that
 *  type so the builder is sport-portable. */
export interface CommentaryFactsCard {
  basePlayerId: string;
  name: string;
  tier: string;
  team: string;
  actualFp: number;
  projectedFp: number;
  wasHeld?: boolean;
  gameInfo?: { date?: string; opponent?: string; homeAway?: string };
  statLine?: Record<string, any>;
}

export interface BuildCommentaryFactsInput {
  surface: CommentarySurface;
  sport: string;
  season: string;
  trigger: CommentaryTrigger;
  roster: CommentaryFactsCard[];
  /** Anchor identity. Sourced from TriggerResult.anchorBasePlayerId at
   *  the call site. May be null when the trigger doesn't carry an
   *  anchor (miss, default) or when an older row didn't persist it. */
  anchorBasePlayerId: string | null;
  /** Snapshot-level flag mirrored from the create payload. The verdict
   *  short-circuits to neutral when false. */
  holdsRecorded: boolean;
  /** rare_pull only — the primary TopGameReason produced by
   *  detectTopGame; threaded through `TriggerResult.topGamePrimaryReason`
   *  by the evaluator at GameView.tsx. */
  topGamePrimaryReason?: TopGameReason | null;
  /** miss only. */
  nearMissGap?: number | null;
  /** miss only. */
  nearMissNextTier?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────

function findAnchor(
  roster: CommentaryFactsCard[],
  anchorBasePlayerId: string | null,
): CommentaryFactsCard | null {
  if (!anchorBasePlayerId) return null;
  return roster.find(c => c.basePlayerId === anchorBasePlayerId) ?? null;
}

function normalizeHomeAway(raw: string | undefined): "H" | "A" | "" {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "H" || v === "A") return v;
  return "";
}

/** The statLine carries arbitrary number/string fields off the data
 *  engine; we coerce to {number|string} so downstream code reads a
 *  predictable map. Anything unrenderable becomes a string via String(). */
function normalizeStatLine(raw: Record<string, any> | undefined): Record<string, number | string> {
  if (!raw) return {};
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string") out[k] = v;
    else if (v == null) continue;
    else out[k] = String(v);
  }
  return out;
}

function buildAnchorBlock(
  card: CommentaryFactsCard,
  sport: string,
  topReason?: TopGameReason,
): CommentaryFactsAnchor {
  // lookupCulture handles its own tier gate (BLUE/GREEN/WHITE → null;
  // PURPLE iconic+30% — seed=0 here means the 30% gate is deterministic
  // but a SPECIFIC seed isn't load-bearing for facts assembly, since
  // facts only carry the nicknames array, not a chosen nickname). The
  // model picks from the array per VOICE_CONTRACT.
  const culture: CultureShape | null = lookupCulture(
    card.name,
    sport,
    card.tier,
    0,
    card.basePlayerId,
    card.team,
  );
  return {
    name: card.name,
    basePlayerId: card.basePlayerId,
    nicknames: culture?.nicknames?.slice() ?? [],
    knownFor: (culture?.knownFor ?? "").trim(),
    tier: card.tier,
    team: card.team,
    statLine: normalizeStatLine(card.statLine),
    opponent: (card.gameInfo?.opponent ?? "").trim(),
    homeAway: normalizeHomeAway(card.gameInfo?.homeAway),
    date: (card.gameInfo?.date ?? "").trim(),
    ...(topReason ? { topReason } : {}),
  };
}

/** Phase 3 verdict matrix (lock §"Decisions locked" + recon Q3):
 *    choke      → classifyAnchorTruth (Option B lift)
 *    rare_pull  → "credited" (honest-by-construction — the star *had* the event)
 *    big_score  → "credited" (someone delivered; that's the trigger's premise)
 *    miss       → "neutral"  (no anchor — no honest credit/blame call)
 *    default    → builder returns "skip" before this is computed
 */
function deriveVerdict(input: BuildCommentaryFactsInput): AnchorTruthVerdict {
  switch (input.trigger) {
    case "rare_pull":
    case "big_score":
      return "credited";
    case "miss":
      return "neutral";
    case "choke":
      return classifyAnchorTruth({
        roster: input.roster.map(c => ({
          basePlayerId: c.basePlayerId,
          actualFp: c.actualFp,
          projectedFp: c.projectedFp,
          wasHeld: c.wasHeld === true,
        })),
        anchorBasePlayerId: input.anchorBasePlayerId,
        holdsRecorded: input.holdsRecorded,
      });
    default:
      // default trigger is handled above by buildCommentaryFacts; this
      // branch keeps the switch exhaustive at the type level.
      return "neutral";
  }
}

/** big_score derives its own topReason from the anchor's actualFp —
 *  triggerEvaluation doesn't thread one through today (rare_pull is the
 *  only branch that sets `topGamePrimaryReason`). The label form mirrors
 *  TopGameReason convention (e.g. "65.3 FP"). */
function bigScoreTopReason(anchor: CommentaryFactsCard): TopGameReason {
  const fp = Math.round(anchor.actualFp * 10) / 10;
  return {
    category: "fp",
    value: fp,
    label: `${fp.toFixed(1)} FP`,
  };
}

// ── Public entry point ─────────────────────────────────────────────────

export function buildCommentaryFacts(
  input: BuildCommentaryFactsInput,
): CommentaryFactsResult {
  // default trigger never POSTs to /api/headline — bank pick is correct.
  if (input.trigger === "default") {
    return { kind: "skip", reason: "default_trigger" };
  }

  const verdict = deriveVerdict(input);
  const anchorCard = findAnchor(input.roster, input.anchorBasePlayerId);

  // miss — no anchor concept. Carry gap + next-tier for the prompt to
  // shape "one decision from ALL-STAR" lines.
  if (input.trigger === "miss") {
    const facts: CommentaryFacts = {
      surface: input.surface,
      sport: input.sport,
      season: input.season,
      trigger: "miss",
      verdict,
      ...(input.nearMissGap != null ? { nearMissGap: input.nearMissGap } : {}),
      ...(input.nearMissNextTier ? { nearMissNextTier: input.nearMissNextTier } : {}),
    };
    return { kind: "facts", facts };
  }

  // For non-miss triggers (choke / rare_pull / big_score): if no anchor
  // resolves, we still emit facts so the caller can decide what to do —
  // the validator at the endpoint will treat any output naming a player
  // as a violation when no anchor is in the facts. Verdict drops to
  // neutral so the model can't infer one.
  if (!anchorCard) {
    return {
      kind: "facts",
      facts: {
        surface: input.surface,
        sport: input.sport,
        season: input.season,
        trigger: input.trigger,
        verdict: "neutral",
      },
    };
  }

  let topReason: TopGameReason | undefined;
  if (input.trigger === "rare_pull" && input.topGamePrimaryReason) {
    topReason = input.topGamePrimaryReason;
  } else if (input.trigger === "big_score") {
    topReason = bigScoreTopReason(anchorCard);
  }

  const facts: CommentaryFacts = {
    surface: input.surface,
    sport: input.sport,
    season: input.season,
    trigger: input.trigger,
    verdict,
    anchor: buildAnchorBlock(anchorCard, input.sport, topReason),
  };

  return { kind: "facts", facts };
}
