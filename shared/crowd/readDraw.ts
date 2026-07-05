/**
 * shared/crowd/readDraw.ts — the DESCRIPTIVE read×draw hand model.
 *
 * Pure, sport-agnostic, and DELIBERATELY UNGRADED. For each HELD card it names
 * two independent, observable facts and their combination — no valence, no
 * "correct", no "optimal", no win/loss. Descriptions only; any framing is written
 * downstream AGAINST this data, never baked in here.
 *
 *   READ  — how the hold sat vs the room. fade = 1 − ownership; a hold the room
 *           was OFF (fade ≥ fadeChalk) is `contrarian`, one the room was WITH is
 *           `chalk`. Uses the SAME fadeChalk seam as verdict.ts (imported — one
 *           source of truth, so READ can never drift from the verdict's fade line).
 *   DRAW  — how the game came in vs the player's own baseline. ratio = actualFp /
 *           projectedFp (projectedFp = the season AVG). ratio ≤ COLD → `cold`,
 *           ratio ≥ WARM → `warm`, between → `neutral`. The luck signal, value-free.
 *
 * NOT verdict.ts: verdict picks ONE headline held card + an EVALUATIVE tone
 * (contrarian-hit reads as a "win"). This labels EVERY held card, descriptively.
 * Different output shape, different job. It does NOT touch verdict.clause (that is
 * the verdict-weave copy carrier, a separate concern).
 *
 * The COLD threshold is data-set, not guessed — see READ_DRAW_COLD below.
 */

import { DEFAULT_VERDICT_CONFIG } from "./verdict";

export type ReadStance = "contrarian" | "chalk";
export type DrawState = "cold" | "warm" | "neutral";

/** READ × DRAW combination. 2 reads × 3 draws = 6 cells (the "2×2" corners are
 *  contrarian/chalk × cold/warm; `neutral` is the draw axis's dead zone). */
export type ReadDrawQuadrant =
  | "contrarian-cold"
  | "contrarian-warm"
  | "contrarian-neutral"
  | "chalk-cold"
  | "chalk-warm"
  | "chalk-neutral";

/** One resolved card handed to the classifier. `ownership` ∈ [0,1] is the room's
 *  backing (same field verdict reads); `projectedFp` is the season AVG; `salary`
 *  is carried ONLY for the 3-stance expansion (see readStance) and is unused today. */
export interface ReadDrawCard {
  playerId: string;
  name: string;
  wasHeld: boolean;
  actualFp: number;
  projectedFp: number;
  /** room ownership 0..1 (frozen crowd model). fade = 1 − ownership. */
  ownership: number;
  /** salary — reserved for the 3-stance READ expansion; not read today. */
  salary?: number;
}

/** Descriptive labels for one held card. Structured data, NOT a copy string. */
export interface ReadDrawLabel {
  playerId: string;
  name: string;
  read: ReadStance;
  draw: DrawState;
  quadrant: ReadDrawQuadrant;
}

export interface ReadDrawConfig {
  /** fade at/above this = contrarian (room was OFF him). Shared with verdict. */
  fadeChalk: number;
  /** ratio at/below this = a genuinely cold draw. */
  cold: number;
  /** ratio at/above this = ran hot. */
  warm: number;
}

/**
 * COLD draw threshold — actualFp/projectedFp ≤ 0.40 (the player delivered ≤40%
 * of his season average). Set from data, not guessed: across a 525,350-game
 * study (30 seasons, min ≥ 10, proj ≥ 10) the ratio distribution is
 *   P5 = 0.369 · P6–7 ≈ 0.40 · P10 = 0.500 · median = 1.003 · P90 = 1.612
 * and 49.5% of games are merely sub-AVG — so a knee (~P6-7), not the median, is
 * the honest "cold" line. 0.40 keeps `cold` a scarce tail, not "any dip".
 */
export const READ_DRAW_COLD = 0.40;
/** WARM draw threshold — ratio ≥ 1.6 (the ~P90 upper mirror of COLD). */
export const READ_DRAW_WARM = 1.6;

export const DEFAULT_READ_DRAW_CONFIG: ReadDrawConfig = {
  // Reuse verdict's fade line verbatim — one seam; READ never drifts from verdict.
  fadeChalk: DEFAULT_VERDICT_CONFIG.fadeChalk,
  cold: READ_DRAW_COLD,
  warm: READ_DRAW_WARM,
};

/**
 * READ axis. Today: ownership-only → `contrarian` | `chalk`.
 *
 * ── 3-STANCE EXPANSION POINT ──────────────────────────────────────────────────
 * Adding salary splits `contrarian` → { "contrarian-star" (faded BUT expensive)
 * and "value" (faded AND cheap) } WITHOUT touching the draw axis or any call
 * site: widen `ReadStance`, branch here on `card.salary` (already on
 * `ReadDrawCard`), and extend the `ReadDrawQuadrant` union. `drawState` and the
 * `classifyReadDraw` loop stay byte-identical. Keeping this a standalone function
 * (not inlined) is what makes that a one-field change.
 */
export function readStance(card: ReadDrawCard, cfg: ReadDrawConfig = DEFAULT_READ_DRAW_CONFIG): ReadStance {
  const fade = 1 - card.ownership;
  return fade >= cfg.fadeChalk ? "contrarian" : "chalk";
}

/**
 * DRAW axis. ratio = actualFp / projectedFp — a value-free luck signal. A card
 * with no usable baseline (projectedFp ≤ 0) has no draw signal → `neutral`.
 */
export function drawState(card: ReadDrawCard, cfg: ReadDrawConfig = DEFAULT_READ_DRAW_CONFIG): DrawState {
  if (!(card.projectedFp > 0)) return "neutral";
  const ratio = card.actualFp / card.projectedFp;
  if (ratio <= cfg.cold) return "cold";
  if (ratio >= cfg.warm) return "warm";
  return "neutral";
}

/**
 * Per-HELD-card descriptive labels. Non-held cards are excluded — the read is
 * about a call you MADE, not a card that rerolled into the lineup (same eligibility
 * rule as verdict). Pure; input order preserved.
 */
export function classifyReadDraw(
  cards: ReadDrawCard[],
  cfg: ReadDrawConfig = DEFAULT_READ_DRAW_CONFIG,
): ReadDrawLabel[] {
  return cards
    .filter((c) => c.wasHeld)
    .map((c) => {
      const read = readStance(c, cfg);
      const draw = drawState(c, cfg);
      return {
        playerId: c.playerId,
        name: c.name,
        read,
        draw,
        quadrant: `${read}-${draw}` as ReadDrawQuadrant,
      };
    });
}

/** A single held card singled out for a headline line, plus its draw ratio. */
export interface ReadDrawLead {
  card: ReadDrawCard;
  label: ReadDrawLabel;
  /** actualFp / projectedFp for `card` — the DRAW ratio that drove the pick. */
  ratio: number;
}

/**
 * Pick the DRAW-extreme HELD card for one headline line: the lowest-ratio COLD
 * card if any held card is cold, else the highest-ratio WARM card if any is warm,
 * else `null`. Draw-extreme wins because that is the interesting one; an
 * all-neutral hand returns null so the caller falls back to its base copy (the
 * ~66% neutral bulk gets no quadrant line). Cold outranks warm. Pure.
 */
export function pickDrawLead(
  cards: ReadDrawCard[],
  cfg: ReadDrawConfig = DEFAULT_READ_DRAW_CONFIG,
): ReadDrawLead | null {
  const scored = cards
    .filter((c) => c.wasHeld && c.projectedFp > 0)
    .map((c) => ({ c, ratio: c.actualFp / c.projectedFp, draw: drawState(c, cfg) }));
  const cold = scored.filter((x) => x.draw === "cold");
  const warm = scored.filter((x) => x.draw === "warm");
  let pick: { c: ReadDrawCard; ratio: number } | null = null;
  if (cold.length) pick = cold.reduce((a, b) => (b.ratio < a.ratio ? b : a)); // coldest
  else if (warm.length) pick = warm.reduce((a, b) => (b.ratio > a.ratio ? b : a)); // hottest
  else return null; // all held cards neutral → no lead
  return { card: pick.c, label: classifyReadDraw([pick.c], cfg)[0], ratio: pick.ratio };
}
