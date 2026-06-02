// shared/challengeTakeCard/types.ts
//
// Phase 2a take-card generator — input + output contracts.
// Lock: docs/challenge-landing-v2-phase2a-voice-and-generator-lock.md.
// Voice spine: docs/commentary-voice-system.md (the templates in
// ./templates.ts are written against this spine, NOT a fork).
//
// The OUTPUT CONTRACT (ChallengeTakeCard) is what Phase 2b's landing
// component builds against. Locking the four-field shape here lets 2b
// place each field in the V2 hierarchy (hook at top, outcome by the
// score, disagreement by the cards, CTA on the button) without ever
// importing Line[]/StampToken shapes — the CHOKE/MISS stamp from
// Phase 1 is its own element; the take card is the prose around it.

/** The trigger value AFTER normalizeTriggerType has aliased stored
 *  "bad_beat" rows to "choke". The generator never sees raw "bad_beat".
 *  Mirrors the union the recipient ctx already carries. */
export type TakeCardTrigger = "rare_pull" | "big_score" | "choke" | "miss" | "default";

/** The "acceptance psychology" axis the disagreement slot flips on.
 *  - correction (choke, miss): "I'd have done it better."
 *  - competition (big_score, rare_pull): "I'll match that."
 *  - neutral (default): "same hand, your move."
 *  See generator.deriveMode. */
export type TakeCardMode = "correction" | "competition" | "neutral";

/** Held-card view the generator reads. Only the fields the disagreement
 *  slot needs — the landing component owns the full GeneratedCard. */
export interface HeldCardForTakeCard {
  name: string;
  actualFp: number;
  tier: string;
}

/** Inputs to {@link generateChallengeTakeCard}. The caller (Phase 2b's
 *  landing) derives this from ChallengeData + the deserialized enriched
 *  roster. anchorName is resolved by the caller: find the card whose
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
   *  generator falls back to a hold-agnostic disagreement line. */
  holdsRecorded: boolean;
  /** Cards the SENDER held (wasHeld===true in the deserialized roster).
   *  Empty when holdsRecorded is false. The disagreement slot may name
   *  up to two of these. */
  heldCards: HeldCardForTakeCard[];
  /** Name of the trigger anchor card (e.g. the held card most
   *  disappointing for choke, or the rare_pull card). Null when the
   *  stored anchor_base_player_id is null (default trigger / legacy)
   *  or when the basePlayerId doesn't resolve in the roster — the
   *  generator's null-anchor fallback fires. */
  anchorName: string | null;
  /** miss-trigger only; null otherwise. */
  nearMissGap: number | null;
  nearMissNextTier: string | null;
  /** Determinism seed (per 2d of the lock). Same challengeId → identical
   *  take card every call, on every runtime (landing + OG share card). */
  challengeId: string;
}

/** The four-field output. All strings are FULLY substituted at generation
 *  time — no `{tokens}` remain. The landing renders these verbatim. */
export interface ChallengeTakeCard {
  /** Top of landing — the provocation. */
  hookHeadline: string;
  /** By the score — what happened, score visible but not the hero. */
  outcomeLine: string;
  /** By the cards — where acceptance happens. Mode-keyed. */
  disagreementLine: string;
  /** The button — from a tight CTA family per 2g. Never "Accept Challenge". */
  ctaText: string;
}
