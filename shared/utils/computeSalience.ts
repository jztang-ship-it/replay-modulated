// shared/utils/computeSalience.ts
//
// Phase 4 Pass 1 (lock: docs/challenge-landing-v2-phase4-salience-stat-
// hygiene-foundation-lock.md §3 "SALIENCE COMPUTATION — Option A"). The
// hand-level salience signal: code decides WHICH facts mattered; the
// model (Pass 2/3) explains them. Lives at the caller side of the
// commentary boundary so shared/commentary/ stays free of basketball/
// imports and the FP weights stay sport-side.
//
// Today wired for basketball only — football / baseball would add
// branches in fpWeightsForSport() when their voice paths ship.
//
// Inputs: trigger + sport + the roster cards (already mapped to the
// pure CommentaryFactsCard shape so this helper has no GeneratedCard
// dep). Output: { salience } suitable for threading into
// BuildCommentaryFactsInput.salience. Returns { salience: undefined }
// for rare_pull (topReason carries the rare-line signal; salience
// would duplicate or distract) and for sports without wired weights
// (forward-compat fallback).

import type {
  CommentaryFacts,
  CommentaryFactsCard,
} from "@shared/commentary/commentaryFacts";
import {
  computeBasketballFpDetailed,
  type FpBreakdown,
} from "../../basketball/src/adapters/fantasyPoints";
import { BasketballSportConfig } from "../../basketball/src/adapters/basketballConfig";

/** Sport → FP weights. Today only basketball is wired live; the lock
 *  explicitly defers football/baseball-equivalent salience to those
 *  sports' voice efforts. Returns null when no weights are wired so
 *  the caller skips salience cleanly (an undefined salience is the
 *  expected forward-compat shape). */
function fpWeightsForSport(sport: string): Readonly<Record<string, number>> | null {
  if (sport === "basketball") return BasketballSportConfig.projectionWeights;
  return null;
}

/** Sport → ordered list of FP-component stat keys. The same source as
 *  fpWeightsForSport so the trim allowlist (rendered in the prompt by
 *  formatStatLine) and the salience computation (this file) agree on
 *  what counts as an FP-component stat. */
export function fpStatKeysForSport(sport: string): readonly string[] | null {
  const w = fpWeightsForSport(sport);
  return w ? Object.keys(w) : null;
}

export interface SalienceComputation {
  salience: NonNullable<CommentaryFacts["salience"]> | undefined;
}

/** Per-stat FP-contribution sum across HELD cards only, plus the raw
 *  stat count per key for the human-readable label. Pure: no side
 *  effects, weights passed in.
 *
 *  Phase 4 Pass 1 held-only fix (lock: docs/phase4-pass1-salience-
 *  held-only-lock.md §1). The narrative-salience signals fed to
 *  primaryPositive / primaryNegative critique the user's HELD lineup
 *  — the decisions they made — not the full roster's box score. The
 *  earlier all-cards aggregation was correctly-sourced-but-wrongly-
 *  scoped: e.g. an on-glass choke headline "Fourteen turnovers killed
 *  this before Bosh could matter." where only 3 turnovers came from
 *  held cards and the other 11 from bench cards the user cut.
 *
 *  Held filter mirrors the existing primaryDragPlayer loop pattern
 *  (`if (c.wasHeld !== true) continue;`): skip cards where wasHeld is
 *  not strictly true. Cards missing the flag are treated as unheld;
 *  CommentaryFactsCard.wasHeld is always populated in production
 *  (ChallengeSharePrompt maps `c.wasHeld === true` explicitly).
 *
 *  Does NOT change the FP score / target_fp / tier / payout math —
 *  those paths read `actualFp` directly and never call this helper.
 *  The two scopes (score = all cards, narrative = held cards) are
 *  intentionally different per the lock's two-lens principle. */
function rankPerStat(
  cards: ReadonlyArray<CommentaryFactsCard>,
  weights: Readonly<Record<string, number>>,
): { fpByStat: Record<string, number>; rawCountByStat: Record<string, number> } {
  const fpByStat: Record<string, number> = {};
  const rawCountByStat: Record<string, number> = {};
  for (const c of cards) {
    if (c.wasHeld !== true) continue;
    if (!c.statLine) continue;
    const detailed: FpBreakdown = computeBasketballFpDetailed(c.statLine, weights);
    for (const [k, contrib] of Object.entries(detailed.breakdown)) {
      fpByStat[k] = (fpByStat[k] ?? 0) + contrib;
      const raw = Number((c.statLine as any)[k] ?? 0);
      if (Number.isFinite(raw)) rawCountByStat[k] = (rawCountByStat[k] ?? 0) + raw;
    }
  }
  return { fpByStat, rawCountByStat };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Phase 4 Pass 1 (fixup) — concept-word render for stat keys. The
 *  rendered SalienceFact.label is a model-facing CONCEPT ("38 points")
 *  instead of analyst shorthand ("38 FP from 38 pts"). The .value
 *  field still carries the FP CONTRIBUTION for computation /
 *  downstream joins; only the label form changes.
 *
 *  Singular form when raw count is exactly 1 ("1 point"); plural
 *  otherwise. Unknown keys (forward-compat for football/baseball)
 *  pass through verbatim so an unmapped category still produces a
 *  legible — if blunt — label. */
const STAT_WORD_FORMS: Record<string, { singular: string; plural: string }> = {
  pts:       { singular: "point",    plural: "points" },
  reb:       { singular: "rebound",  plural: "rebounds" },
  ast:       { singular: "assist",   plural: "assists" },
  stl:       { singular: "steal",    plural: "steals" },
  blk:       { singular: "block",    plural: "blocks" },
  turnovers: { singular: "turnover", plural: "turnovers" },
};

function statWord(key: string, count: number): string {
  const forms = STAT_WORD_FORMS[key];
  if (!forms) return key;
  return count === 1 ? forms.singular : forms.plural;
}

/** Magnitude-only label, held-lineup-scoped: "<raw count> <concept word>
 *  from your held lineup" (e.g. "42 points from your held lineup",
 *  "8 turnovers from your held lineup"). Sign is conveyed by the SALIENCE
 *  block's MOST IMPORTANT POSITIVE / NEGATIVE header, not by a minus on
 *  the number — the model reads the header for direction and the label
 *  for content.
 *
 *  RD0 — scope is baked into the label so prose doesn't have to police
 *  attribution. rankPerStat filters held-only
 *  (`if (c.wasHeld !== true) continue;`), so the aggregate is always a
 *  held-lineup sum — never one player, never the drawn/cut cards. The
 *  named drag signal `primaryDragPlayer` stays player-attributed. */
function magnitudeLabel(key: string, rawCount: number): string {
  const abs = Math.abs(rawCount);
  return `${abs} ${statWord(key, abs)} from your held lineup`;
}

/** Per-trigger salience for the hand. Lock §"Per-trigger signal map":
 *    big_score → primaryPositive (+ optional primaryNegative).
 *    choke     → primaryPositive + primaryDragPlayer (+ optional
 *                primaryNegative). primaryDragPlayer is the held card
 *                with the largest negative (actualFp - projectedFp);
 *                this is the TRUE choke negative — stat-level alone is
 *                usually small + misleading.
 *    miss      → primaryPositive only (negative leans on nearMissGap).
 *    rare_pull → no salience; topReason carries the rare-line signal. */
export function computeSalience(
  trigger: string,
  sport: string,
  cards: ReadonlyArray<CommentaryFactsCard>,
): SalienceComputation {
  if (trigger === "rare_pull") return { salience: undefined };
  const weights = fpWeightsForSport(sport);
  if (!weights) return { salience: undefined };

  const { fpByStat, rawCountByStat } = rankPerStat(cards, weights);

  let primaryPositive: NonNullable<CommentaryFacts["salience"]>["primaryPositive"];
  let primaryNegative: NonNullable<CommentaryFacts["salience"]>["primaryNegative"];

  let posBest: { key: string; fp: number } | null = null;
  let negBest: { key: string; fp: number } | null = null;
  for (const [k, fp] of Object.entries(fpByStat)) {
    if (fp > 0 && (!posBest || fp > posBest.fp)) posBest = { key: k, fp };
    if (fp < 0 && (!negBest || fp < negBest.fp)) negBest = { key: k, fp };
  }
  if (posBest) {
    const fp = round1(posBest.fp);
    const raw = rawCountByStat[posBest.key] ?? 0;
    primaryPositive = {
      category: posBest.key,
      value: fp,
      label: magnitudeLabel(posBest.key, raw),
    };
  }
  if (negBest) {
    const fp = round1(negBest.fp);
    const raw = rawCountByStat[negBest.key] ?? 0;
    primaryNegative = {
      category: negBest.key,
      value: fp,
      label: magnitudeLabel(negBest.key, raw),
    };
  }

  // miss → primaryPositive only. nearMissGap on facts carries the
  // negative ("X FP from the next tier") and is the more honest
  // framing than any stat-level negative.
  if (trigger === "miss") primaryNegative = undefined;

  // choke → also compute primaryDragPlayer. Among HELD cards, the one
  // with the largest negative (actualFp - projectedFp). When no held
  // card underperformed (rare on a choke; would mean the BENCH dragged
  // the hand), primaryDragPlayer is omitted.
  let primaryDragPlayer: NonNullable<CommentaryFacts["salience"]>["primaryDragPlayer"];
  if (trigger === "choke") {
    let worst: { card: CommentaryFactsCard; shortfall: number } | null = null;
    for (const c of cards) {
      if (c.wasHeld !== true) continue;
      const shortfall = (c.actualFp ?? 0) - (c.projectedFp ?? 0);
      if (shortfall < 0 && (!worst || shortfall < worst.shortfall)) {
        worst = { card: c, shortfall };
      }
    }
    if (worst) {
      primaryDragPlayer = {
        basePlayerId: worst.card.basePlayerId,
        name: worst.card.name,
        shortfall: round1(worst.shortfall),
      };
    }
  }

  if (!primaryPositive && !primaryNegative && !primaryDragPlayer) {
    return { salience: undefined };
  }
  return {
    salience: {
      ...(primaryPositive ? { primaryPositive } : {}),
      ...(primaryNegative ? { primaryNegative } : {}),
      ...(primaryDragPlayer ? { primaryDragPlayer } : {}),
    },
  };
}
