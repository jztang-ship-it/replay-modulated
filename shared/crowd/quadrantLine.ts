/**
 * shared/crowd/quadrantLine.ts — descriptive copy for the read×draw headline.
 *
 * Renders ONE line for a draw-extreme held card (the pick from `pickDrawLead`).
 * Descriptive + UNGRADED: it states what happened vs the room and vs the player's
 * own average — no "correct", no "optimal", no grade. The classifier (readDraw.ts)
 * stays copy-free by design; this is the copy seam that sits beside it.
 *
 * Only the two DRAW-extreme CONTRARIAN reads are "loud"; the chalk lines are quiet.
 * The neutral bulk never reaches here — `pickDrawLead` returns null for it, so the
 * caller keeps its existing verdict copy.
 */
import type { ReadDrawLead, ReadDrawQuadrant } from "./readDraw";
import { endDot } from "./nameText";

/** Closer for the contrarian-cold "robbed" line — the designated strongest-share
 *  lead. A DARE, not a consolation. Referenced by BOTH the standalone lead line
 *  (renderQuadrantLine) and the convergent fold (renderQuadrantFold) so the two
 *  can never drift; change it here and both move together. */
const CONTRARIAN_COLD_CLOSER = "Your turn — better dice?";

/** ratio ≥ WARM → a clean multiple phrase ("double"), never a raw decimal. */
function phraseMultiple(r: number): string {
  if (r >= 2.75) return "triple";
  if (r >= 2.25) return "two and a half times";
  if (r >= 1.75) return "double";
  return "one and a half times"; // WARM floor 1.6 → 1.75
}

/** ratio ≤ COLD → a clean fraction phrase ("a third"), never a raw decimal. */
function phraseFraction(r: number): string {
  if (r <= 0.225) return "a fifth";
  if (r <= 0.29) return "a quarter";
  return "a third"; // 0.29 → COLD ceiling 0.40
}

/**
 * The headline line for a draw-extreme held card. `lead.label.quadrant` is always
 * one of the four extreme corners (pickDrawLead excludes neutral); the empty-string
 * default is unreachable defensive cover.
 */
export function renderQuadrantLine(lead: ReadDrawLead): string {
  const name = lead.label.name;
  switch (lead.label.quadrant) {
    case "contrarian-warm":
      // Opens on the EVENT (headline voice), not "You held" — the atom owns "You
      // held X" as the crown jewel; the lead re-announcing ownership read as
      // template repetition. {name} leads the sentence, so no endDot (nothing to
      // append; a "Jr." suffix period is the abbreviation, not a collision).
      return `${name} gave you ${phraseMultiple(lead.ratio)} his average — that's the whole game.`;
    case "contrarian-cold":
      return `${name} no-showed — ${phraseFraction(lead.ratio)} of his number. ${CONTRARIAN_COLD_CLOSER}`;
    case "chalk-warm":
      return `You and the room both rode ${name}${endDot(name)} He delivered.`;
    case "chalk-cold":
      return `Everybody held ${name}${endDot(name)} Nobody got paid.`;
    default:
      return "";
  }
}

/** Structured lead for the verdict surface: the rendered lead line, the held
 *  player it names (so the caller can detect same-player convergence with the
 *  verdict atom), and the FOLDED single-sentence form for that convergent case
 *  (null for quadrants that don't fold). */
export interface QuadrantLead {
  line: string;
  leadPlayer: string;
  folded: string | null;
  /** The read×draw quadrant — lets a caller gate on a SPECIFIC corner (e.g. the
   *  contrarian-cold grievance) rather than the coarse `folded != null`. */
  quadrant: ReadDrawQuadrant;
  /** Severity inputs for the results-box composer (composeVerdictCommentary). Raw facts
   *  from the lead's card; do NOT feed the DM (that reads `line`). fade% = round((1−own)·100). */
  fadePct: number;
  ratio: number;
  fp: number;
}

/**
 * The CONVERGENT fold — one sentence that folds the atom's fade%/FP into the
 * quadrant line, used ONLY when the lead and the verdict atom name the SAME
 * player (~29% of contrarian-cold leads, ~52% of contrarian-warm). fade% + FP are
 * pulled RAW from the lead's own card — identical to the atom's numbers (same room
 * model, same resolved FP) — so the atom can be suppressed with no data loss.
 * Returns null for chalk quadrants: chalk-cold NEVER converges and chalk-warm
 * converges ~0.3% of the time, so both take the byte-identical composed fallback.
 */
export function renderQuadrantFold(lead: ReadDrawLead): string | null {
  const name = lead.label.name;
  const fadePct = Math.round((1 - lead.card.ownership) * 100);
  const fp = lead.card.actualFp.toFixed(1);
  switch (lead.label.quadrant) {
    case "contrarian-warm":
      return `You held ${name} — ${fadePct}% of the room off him — and he went ${phraseMultiple(lead.ratio)} his average (${fp} FP). That's the whole game.`;
    case "contrarian-cold":
      return `You held ${name} — ${fadePct}% of the room off him — and he no-showed, ${phraseFraction(lead.ratio)} of his number (${fp} FP). ${CONTRARIAN_COLD_CLOSER}`;
    default:
      return null;
  }
}
