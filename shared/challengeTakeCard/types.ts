// shared/challengeTakeCard/types.ts
//
// Phase 2c take-card generator — TAKE → EVIDENCE → DARE output contract.
// Lock: docs/challenge-landing-v2-phase2c-take-evidence-dare-lock.md.
// Supersedes the 2a/2b 4-field prose shape (hookHeadline / outcomeLine /
// disagreementLine / ctaText). 2c is a structural reshape: the output
// now distinguishes the CLAIM (take) from the FACT (evidenceLine) from
// the CHALLENGE (dare), and surfaces structured held names as data
// (heldCards: string[]) rather than fused into prose. Phase 2b's recap-
// style three-blocks-of-the-same-story collapsed into one argument.
//
// Voice spine: docs/commentary-voice-system.md + §3a (challenge-surface
// user needling). Banks live in ./templates.ts.

/** The trigger value AFTER normalizeTriggerType has aliased stored
 *  "bad_beat" rows to "choke". The generator never sees raw "bad_beat".
 *  Mirrors the union the recipient ctx already carries. */
export type TakeCardTrigger = "rare_pull" | "big_score" | "choke" | "miss" | "default";

/** Acceptance psychology — the TAKE and DARE flip on this.
 *  - correction (choke, miss): "I can do better." TAKE claims somebody
 *    wasted this / was one decision away. DARE goes pure-hypothetical
 *    ("would you keep the same core?") — MUST NOT reference outcome
 *    (no "flinched"/"cratered"/"delivered nothing").
 *  - competition (big_score, rare_pull): "I can match that." TAKE
 *    claims safe/wall/history. DARE is "beat the receipt" / "match it."
 *  - neutral (default): no strong claim. TAKE "SAME HAND. YOUR MOVE."
 *  See generator.deriveMode + the 2c lock §"Two modes". */
export type TakeCardMode = "correction" | "competition" | "neutral";

/** Held-card view the generator reads. The landing component owns the
 *  full GeneratedCard; the generator only needs `name` to build the
 *  structured heldCards list and (in legacy fallback) detect 0 helds.
 *  actualFp + tier stay on the type for forward-compat (banks may want
 *  to filter on tier later); generator does not emit per-card outcomes
 *  in any field per the 2c spoiler rule. */
export interface HeldCardForTakeCard {
  name: string;
  actualFp: number;
  /** Phase 2d — anchor-truth ratio is actualFp / projectedFp. The
   *  generator gates the anchor-aware take on holdsRecorded:true (legacy
   *  rows produce empty heldCards regardless of input), so a missing
   *  projectedFp on a non-legacy row is a snapshot integrity bug, not a
   *  ratio-of-undefined risk. */
  projectedFp: number;
  tier: string;
}

/** Inputs to {@link generateChallengeTakeCard}. The caller (the landing)
 *  derives this from ChallengeData + the deserialized enriched roster.
 *  anchorName is resolved by the caller: find the card whose
 *  basePlayerId === data.anchor_base_player_id and read its .name. The
 *  generator never does roster lookups — keeps it pure + UI-agnostic. */
export interface TakeCardInput {
  /** Normalized trigger — caller routes through normalizeTriggerType. */
  trigger: TakeCardTrigger;
  challengerName: string | null;
  targetScore: number;
  winTier: string;
  /** Phase-0 enrichment availability flag from the snapshot top-level.
   *  When false (legacy pre-Phase-0 rows), heldCards is empty and the
   *  generator emits heldCards:[] → the landing's labeled held list is
   *  omitted entirely (no "John held:" with nothing after the colon). */
  holdsRecorded: boolean;
  /** Cards the SENDER held (wasHeld===true in the deserialized roster).
   *  Empty when holdsRecorded is false. */
  heldCards: HeldCardForTakeCard[];
  /** Name of the trigger anchor card. Null when stored
   *  anchor_base_player_id is null (default trigger / legacy) or
   *  doesn't resolve in the roster. */
  anchorName: string | null;
  /** miss-trigger only; null otherwise. */
  nearMissGap: number | null;
  nearMissNextTier: string | null;
  /** Best score against this challenge so far ("Still unbeaten" or
   *  "X stand" framing for competition's evidenceLine). Optional — the
   *  competition wall reads "{targetScore} FP · Still unbeaten" when
   *  best_score is null. */
  bestScore?: number | null;
  attemptCount?: number | null;
  winnerCount?: number | null;
  /** Determinism seed (per the 2a contract — preserved through the
   *  2c reshape). Same challengeId → identical card on every call. */
  challengeId: string;
}

/** The 2c output — six fields. All strings are FULLY substituted at
 *  generation time — no `{tokens}` remain. The landing renders these
 *  verbatim into the TAKE → EVIDENCE → DARE hierarchy.
 *
 *  This shape REPLACES the 2a/2b ChallengeTakeCard (hookHeadline /
 *  outcomeLine / disagreementLine / ctaText). The reshape is the 2c
 *  migration tripwire — a clean tsc proves every consumer migrated. */
export interface ChallengeTakeCard {
  /** Mode the take/dare were written against. Useful for the landing
   *  layout (e.g. competition shows the score-as-wall framing). */
  mode: TakeCardMode;
  /** The CLAIM — the argument the page exists to make. Largest type
   *  at the top of the landing ("SOMEBODY WASTED THIS HAND" /
   *  "JOHN THINKS THIS HAND IS SAFE" / etc.). Mode-keyed with trigger
   *  refinement. */
  take: string;
  /** The USP line — "Same starting hand. Different decisions." The
   *  fairness mechanic + differentiator. Effectively constant today
   *  but kept on the type so per-mode variation can ship later
   *  without a generator API change. */
  subHeadline: string;
  /** Structured held-player names. The landing renders this as a
   *  LABELED LIST ("John held: Finley, Grant Hill"), not as prose —
   *  the prose form was the 2b recap trap. Empty array on legacy
   *  (holdsRecorded:false); the landing omits the held block then. */
  heldCards: string[];
  /** The one minimal fact backing the claim. MODE-SPECIFIC:
   *  - correction: hand TOTAL only (the stakes) — never per-card
   *    breakdown (that's the FP spoiler the lock §"FP-spoiler rule"
   *    forbids).
   *  - competition: hand TOTAL framed as the WALL ("238.7 FP · Still
   *    unbeaten").
   *  - neutral: hand total + "to beat" framing. */
  evidenceLine: string;
  /** The CHALLENGE line. Mode-aware. Correction MUST be pure-
   *  hypothetical (no outcome reference); competition is "beat the
   *  receipt" / "match it"; neutral is "beat the number." */
  dare: string;
  /** The button — from the tight CTA family. Never "Accept Challenge"
   *  / "Start Game" / "Beat Score" (the V2 anti-patterns). */
  ctaText: string;
}
