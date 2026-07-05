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
import type { ReadDrawLead } from "./readDraw";

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
      return `You held ${name}. He gave you ${phraseMultiple(lead.ratio)} his average — that's the whole game.`;
    case "contrarian-cold":
      return `You held ${name}. He no-showed — ${phraseFraction(lead.ratio)} of his number. Right call, wrong night.`;
    case "chalk-warm":
      return `You and the room both rode ${name}. He delivered.`;
    case "chalk-cold":
      return `Everybody held ${name}. Nobody got paid.`;
    default:
      return "";
  }
}
