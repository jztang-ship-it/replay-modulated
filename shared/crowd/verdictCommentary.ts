/**
 * shared/crowd/verdictCommentary.ts — the RESULTS-BOX verdict composer.
 *
 * FENCE: this governs ONLY the post-result commentary in the player's own results box
 * (the TierGauge 96px box). It is DELIBERATELY SEPARATE from renderQuadrantLine /
 * renderQuadrantFold / pickShareHeadline — those still feed the DM share_headline and are
 * NOT touched here. The results box and the DM diverge for now, by design.
 *
 * MODEL: facts compete for inclusion by SEVERITY against a hard ~180-char / 4-line budget
 * (the 96px box geometry), braided into ONE natural sentence — never lead-line + atom-line
 * stacked. Bands are data-anchored (season-study percentiles). Neutral hands (no lead)
 * return "" → the caller keeps its existing non-quadrant copy.
 *
 * DATA NOTE: fade is compressed 55–75% in this crowd model (no 90% fades exist), so the
 * DRAW is almost always the louder fact and is the VERB; the READ ("against the room") is
 * a subordinate clause, never the headline.
 */
import type { ReadDrawQuadrant } from "./readDraw";

/** The lead's severity inputs (all roster-derived; carried on QuadrantLead). */
export interface VerdictLeadFacts {
  quadrant: ReadDrawQuadrant; // one of the four EXTREME corners; neutral never reaches here
  name: string;
  fadePct: number; // 0..100 (fade = 1 − ownership)
  ratio: number;   // actualFp / projectedFp
  fp: number;      // actualFp
}

type Sev = "loud" | "mid" | "mild";
const RANK: Record<Sev, number> = { mild: 0, mid: 1, loud: 2 };

/** DRAW severity — how far the ratio sits from 1.0. Cold: lower = louder (P5 0.17 /
 *  P10 0.34 / ceiling 0.40). Warm: higher = louder (P95 1.94 / P90 1.65 / floor 1.60). */
function drawSev(quadrant: ReadDrawQuadrant, ratio: number): Sev {
  if (quadrant.endsWith("cold")) return ratio <= 0.17 ? "loud" : ratio <= 0.34 ? "mid" : "mild";
  return ratio >= 1.94 ? "loud" : ratio >= 1.65 ? "mid" : "mild";
}

/** READ severity — distance from the chalk line. Contrarian: higher fade = louder
 *  (band ≥70 / 63–70 / 55–63, anchored to the real 55–75% contrarian spread). Chalk:
 *  LOWER fade (higher ownership) = louder (≤47 / 47–51 / 51–55). */
function readSev(quadrant: ReadDrawQuadrant, fadePct: number): Sev {
  if (quadrant.startsWith("contrarian")) return fadePct >= 70 ? "loud" : fadePct >= 63 ? "mid" : "mild";
  return fadePct <= 47 ? "loud" : fadePct <= 51 ? "mid" : "mild";
}

/** TIER notable — LEGEND board or a brutal BUST (< 170 total). Middling stays silent. */
function tierNotable(tier: string, totalFp: number): boolean {
  return tier === "LEGEND" || totalFp < 170;
}

const fp1 = (fp: number) => fp.toFixed(1);
function fractionWord(r: number): string {
  if (r <= 0.09) return "a tenth";
  if (r <= 0.14) return "a seventh";
  if (r <= 0.19) return "a fifth";
  if (r <= 0.28) return "a quarter";
  return "a third";
}
function multipleWord(r: number): string {
  if (r >= 2.75) return "triple";
  if (r >= 2.25) return "two and a half times";
  if (r >= 1.94) return "double";
  if (r >= 1.65) return "half again";
  return "a touch over";
}

export const VERDICT_COMMENTARY_BUDGET = 180;

/**
 * Compose the results-box verdict as ONE braided sentence. Clauses join in priority order
 * — core → draw verb → fade# (readSev≥mid) → draw# (drawSev≥mid) → tier (if notable) →
 * dare (contrarian-cold hook) — and the tier clause is dropped if it would breach budget
 * (the dare, the hook, is protected). Returns "" for a null lead (neutral → caller's copy).
 */
export function composeVerdictCommentary(
  lead: VerdictLeadFacts | null,
  tier: string,
  totalFp: number,
  budget: number = VERDICT_COMMENTARY_BUDGET,
): string {
  if (!lead) return "";
  const { quadrant, name, fadePct, ratio, fp } = lead;
  const dSev = drawSev(quadrant, ratio);
  const rSev = readSev(quadrant, fadePct);
  const fade = RANK[rSev] >= 1 ? ` — ${fadePct}% off him —` : ""; // subordinate, never dramatized
  const own = RANK[rSev] >= 1 ? ` — ${100 - fadePct}% of the room —` : "";
  const dare = quadrant === "contrarian-cold" ? " Your turn?" : "";

  let s: string;
  switch (quadrant) {
    case "contrarian-cold":
      s = dSev === "loud"
        ? `You backed ${name} against the room${fade} and he no-showed, ${fractionWord(ratio)} of his number (${fp1(fp)} FP).`
        : dSev === "mid"
          ? `You held ${name} against the room${fade} and he came up ${fractionWord(ratio)} short (${fp1(fp)} FP).`
          : `You held ${name} against the room and he just came up short.`;
      break;
    case "contrarian-warm":
      s = dSev === "loud"
        ? `You held ${name} against the room${fade} and he went ${multipleWord(ratio)} his average (${fp1(fp)} FP) — that's the whole game.`
        : dSev === "mid"
          ? `You held ${name} against the room${fade} and he delivered ${multipleWord(ratio)} his number (${fp1(fp)} FP).`
          : `You held ${name} against the room and he came through.`;
      break;
    case "chalk-cold":
      s = dSev === "loud"
        ? `Everybody held ${name}${own} and nobody got paid (${fp1(fp)} FP).`
        : dSev === "mid"
          ? `You and the room both held ${name}, and he came up ${fractionWord(ratio)} short.`
          : `You rode ${name} with the room and he came up short.`;
      break;
    case "chalk-warm":
      s = dSev === "loud"
        ? `You and the room both rode ${name} and he went ${multipleWord(ratio)} his average (${fp1(fp)} FP) — chalk paid.`
        : dSev === "mid"
          ? `You rode ${name} with the room and he delivered (${fp1(fp)} FP).`
          : `You and the room rode ${name} and he came through.`;
      break;
    default:
      return "";
  }

  // Tier clause — only if notable AND it fits with the (protected) dare reserved.
  let out = s;
  if (tierNotable(tier, totalFp)) {
    const tierC = totalFp < 170 ? ` A ${fp1(totalFp)}-FP hand — brutal.` : ` A LEGEND board.`;
    if ((s + tierC + dare).length <= budget) out += tierC;
  }
  if ((out + dare).length <= budget) out += dare;
  return out;
}
