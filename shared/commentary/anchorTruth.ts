// shared/commentary/anchorTruth.ts
//
// Phase 3 lift (lock: docs/challenge-landing-v2-phase3-authored-voice-
// engine-lock.md). The honesty verdict the choke take routing has used
// since Phase 2d, promoted into a sport- and surface-agnostic shared
// module so the new CommentaryFacts builder can read the SAME verdict
// the take card reads — one source of truth, not two.
//
// Vocabulary remap from the original (Phase 2d) classifier:
//   vindicated → credited   (anchor delivered, others tanked)
//   blamed     → blamed     (anchor itself tanked)
//   generic    → neutral    (mid-zone, no honest credit/blame call)
//
// Thresholds (DELIVERED_RATIO=0.90, TANKED_RATIO=0.60) are NOT touched
// per the Phase 3 lock §"Non-negotiables." They live on as constants
// here so the shared module is self-contained — re-exported by the take
// card templates module for any landing-side consumer that wants them.

/** Verdict for the "did the anchor cause this outcome?" question. The
 *  honesty layer of the headline + take card; the model MUST obey it. */
export type AnchorTruthVerdict = "credited" | "blamed" | "neutral";

/** Minimal per-card shape the verdict reads. The full GeneratedCard is
 *  not required — pull only what's needed so this module stays usable
 *  from any roster shape (challenge snapshot, in-memory roster, fixtures). */
export interface AnchorTruthCard {
  basePlayerId: string;
  actualFp: number;
  projectedFp: number;
  /** When undefined, treated as not held. The classifier filters held
   *  cards itself so the caller can pass the full roster. */
  wasHeld?: boolean;
}

export interface ClassifyAnchorTruthInput {
  roster: AnchorTruthCard[];
  anchorBasePlayerId: string | null | undefined;
  /** When false (legacy pre-Phase-0 rows), there's no per-card hold info
   *  to read → no honest credit/blame call → neutral. Mirrors the take
   *  card's legacy gate so a legacy row produces the same verdict on
   *  both surfaces. */
  holdsRecorded: boolean;
}

/** Within 10% of projection counts as "showed up." */
export const DELIVERED_RATIO = 0.90;
/** Under 60% of projection is the clearly-bad-night floor. The mid-zone
 *  [0.60, 0.90) maps to neutral by design — tight enough to prevent
 *  overclaim at the edges. */
export const TANKED_RATIO = 0.60;

/** Returns the honesty verdict for the anchor on this hand.
 *
 *  - `credited`: the anchor's ratio ≥ 0.90 AND at least one OTHER held
 *    card's ratio < 0.60. Coherent "anchor wasn't the problem" claim.
 *  - `blamed`:  the anchor's ratio < 0.60. The anchor itself tanked.
 *  - `neutral`: every other case — legacy row, no anchor on the input,
 *    anchor not in the held set, projection undefined, mid-zone ratio,
 *    or anchor delivered but no other tanked. The headline cannot
 *    honestly name a hero or villain here. */
export function classifyAnchorTruth(input: ClassifyAnchorTruthInput): AnchorTruthVerdict {
  if (!input.holdsRecorded) return "neutral";
  if (!input.anchorBasePlayerId) return "neutral";

  const held = input.roster.filter(c => c.wasHeld === true);
  if (held.length < 2) return "neutral"; // need an "other" to indict

  const anchor = held.find(c => c.basePlayerId === input.anchorBasePlayerId);
  if (!anchor) return "neutral"; // anchor wasn't held — no coherent claim
  if (anchor.projectedFp <= 0) return "neutral"; // ratio undefined

  const anchorRatio = anchor.actualFp / anchor.projectedFp;
  if (anchorRatio < TANKED_RATIO) return "blamed";

  if (anchorRatio >= DELIVERED_RATIO) {
    const otherTanked = held.some(c => {
      if (c === anchor) return false;
      if (c.projectedFp <= 0) return false;
      return c.actualFp / c.projectedFp < TANKED_RATIO;
    });
    if (otherTanked) return "credited";
  }

  // Mid-zone OR anchor delivered with no other tanked → no honest call.
  return "neutral";
}
