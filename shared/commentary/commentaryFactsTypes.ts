// shared/commentary/commentaryFactsTypes.ts
//
// Phase 3 step 2 — pure-type module for CommentaryFacts. Split out so
// consumers (api/headline.ts, the future regular-commentary surface)
// can `import type { CommentaryFacts }` WITHOUT pulling in commentary
// Facts.ts's runtime imports (selectCommentary.lookupCulture →
// playerCulture.ts, which tsconfig excludes from the typecheck program
// but tsc still traverses via import resolution).
//
// commentaryFacts.ts re-exports these types so existing callers don't
// change. The runtime builder still lives in commentaryFacts.ts.

/** Local mirror of the TopGameReason shape from ./types. Inlined here so
 *  this types-only module has ZERO transitive imports — consumers
 *  (api/headline.ts in particular) can `import type` from this file
 *  without dragging in shared/commentary/types.ts → @shared/utils/
 *  payoutLogic (the @shared path alias isn't configured in root
 *  tsconfig.json, so a chain via types.ts would fail tsc). */
interface TopGameReason {
  category: string;
  label: string;
  value: number;
  rank?: number;
}
export type { TopGameReason };

/** Phase 4 Pass 1 — hand-level salience signal. Code (caller) ranks
 *  per-stat FP contribution (weight × value summed across the roster)
 *  and surfaces the largest positive / largest negative to the model.
 *  Mirror of TopGameReason's {category, value, label} shape so the
 *  prompt formatter renders both signals identically.
 *
 *  - category: the stat key the signal refers to ("pts", "turnovers", ...).
 *  - value: the FP CONTRIBUTION (weight × raw value, summed across roster).
 *           NOT the raw stat count — that's encoded in the label.
 *  - label: human-readable form rendered into the prompt verbatim
 *           (e.g. "84 FP from pts (84 pts across the hand)"). */
export interface SalienceFact {
  category: string;
  value: number;
  label: string;
}

// ── Public shapes ──────────────────────────────────────────────────────

export type CommentarySurface = "challenge_headline" | "post_hand";

export type CommentaryTrigger =
  | "choke"
  | "miss"
  | "big_score"
  | "rare_pull"
  | "default";

/** Win tier classification of the sender's hand. Mirrors PayoutTier in
 *  api/_lib/router/types.ts; redeclared here so the shared module stays
 *  independent of the api/ tree. */
export type CommentaryWinTier =
  | "BUST"
  | "ROOKIE"
  | "STARTER"
  | "ALL_STAR"
  | "MVP"
  | "LEGEND";

/** The verdict the honesty layer hands the model. Re-declared locally
 *  (mirror of AnchorTruthVerdict from ./anchorTruth) so this types-only
 *  module has zero runtime imports. The runtime classifier lives in
 *  ./anchorTruth; both shapes must stay in sync. */
export type CommentaryVerdict = "credited" | "blamed" | "neutral";

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
  verdict: CommentaryVerdict;
  /** Result tier of the sender's hand. Drives the router's per-tier
   *  routing decisions (KV key includes tier) and lands on the grader's
   *  "Result tier:" context line. Optional for forward-compat — older
   *  callers that don't pass it default to "STARTER" at the routing
   *  boundary (api/headline.ts). */
  winTier?: CommentaryWinTier;
  /** Absent on miss + when the anchor doesn't resolve (legacy rows etc.). */
  anchor?: CommentaryFactsAnchor;
  /** miss only — how many FP short of the next tier. */
  nearMissGap?: number;
  /** miss only — tier just missed (e.g. "ALL_STAR"). */
  nearMissNextTier?: string;
  /** Phase 4 Pass 1 — total FP of the sender's hand. Threaded from the
   *  upstream evaluateTrigger value (triggerEvaluation.ts ~146) — the
   *  authoritative source — so the model can author hand-relative lines
   *  ("238.7 FP — too much for this hand"). Rounded to 1 decimal.
   *  RD0 — tagged with category "fp" so the voice contract's
   *  FP-VS-POINTS rule is category-driven (no untyped-default carve-out). */
  totalFp?: { value: number; category: "fp" };
  /** Phase 4 Pass 1 — allowlist of stat keys that feed the FP formula
   *  for this sport (basketball: pts/reb/ast/stl/blk/turnovers). Source:
   *  the sport adapter's projectionWeights at the caller. Drives the
   *  statLine trim in buildUserPrompt — min/threes/fg% never reach the
   *  model. Optional for forward-compat; absent → no trim, full
   *  statLine renders (legacy callers / tests). */
  fpStatKeys?: readonly string[];
  /** Phase 4 Pass 1 — hand-level salience signal. Code-computed at the
   *  caller; the model explains rather than derives. Per-trigger usage
   *  is governed by VOICE_CONTRACT (Pass 2). Omitted for rare_pull
   *  (topReason already carries the signal). */
  salience?: {
    /** Largest positive FP contribution across the hand (any trigger
     *  except rare_pull). */
    primaryPositive?: SalienceFact;
    /** Largest negative FP contribution across the hand (big_score
     *  often absent; choke usually small; miss omitted — leans on
     *  nearMissGap). */
    primaryNegative?: SalienceFact;
    /** choke only — the held star whose shortfall (actualFp -
     *  projectedFp) sank the hand. The TRUE choke negative; stat-level
     *  negative alone is misleading. */
    primaryDragPlayer?: {
      basePlayerId: string;
      name: string;
      /** actualFp - projectedFp. Negative for a shortfall. Rounded to
       *  1 decimal. */
      shortfall: number;
    };
  };
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
  /** Result tier of the sender's hand — passed through to facts.winTier
   *  for downstream routing + grader context. Optional for callers that
   *  don't have it yet. */
  winTier?: CommentaryWinTier;
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
  /** Phase 4 Pass 1 — hand total FP. Threaded from the value
   *  evaluateTrigger already computes (triggerEvaluation.ts ~146 —
   *  Math.round(totalFp * 10) / 10). Optional for forward-compat; when
   *  absent the builder omits facts.totalFp rather than re-summing
   *  (per lock §"don't re-sum in the builder"). */
  totalFp?: number | null;
  /** Phase 4 Pass 1 — allowlist of stat keys that feed the FP formula
   *  for this sport. Threaded onto facts.fpStatKeys so the prompt
   *  formatter trims the rendered statLine. Caller sources from the
   *  sport's projectionWeights (basketball: Object.keys of
   *  BasketballSportConfig.projectionWeights). Optional for forward-
   *  compat. */
  fpStatKeys?: readonly string[] | null;
  /** Phase 4 Pass 1 — pre-computed hand-level salience signal.
   *  Threaded through to facts.salience. Caller computes via the
   *  sport adapter's FP helper (basketball: computeBasketballFpDetailed
   *  + a held-card shortfall pass for choke's primaryDragPlayer).
   *  shared/commentary/ does NOT import basketball/. Omitted for
   *  rare_pull at the caller. */
  salience?: CommentaryFacts["salience"] | null;
}
