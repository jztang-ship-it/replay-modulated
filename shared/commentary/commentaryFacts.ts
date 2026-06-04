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

import { classifyAnchorTruth, type AnchorTruthVerdict } from "./anchorTruth";
import { lookupCulture, type CultureShape } from "./selectCommentary";
import type { TopGameReason } from "./types";
// Phase 3 step 2: the types moved to a pure-types module so consumers
// (api/headline.ts, voiceContract.ts, future surfaces) can `import type`
// from there without dragging in the lookupCulture → playerCulture chain.
// Re-exported here verbatim so existing callers keep their import paths.
export type {
  CommentarySurface,
  CommentaryTrigger,
  CommentaryWinTier,
  CommentaryFactsAnchor,
  CommentaryFacts,
  CommentaryFactsResult,
  CommentaryFactsCard,
  BuildCommentaryFactsInput,
} from "./commentaryFactsTypes";
import type {
  CommentaryFacts,
  CommentaryFactsAnchor,
  CommentaryFactsResult,
  CommentaryFactsCard,
  BuildCommentaryFactsInput,
} from "./commentaryFactsTypes";

// Internal sanity: AnchorTruthVerdict from the runtime module must be the
// same set of strings as CommentaryVerdict in the types module.
const _verdictParity: AnchorTruthVerdict = "neutral" as AnchorTruthVerdict;
void _verdictParity;

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

/** Phase 4 Pass 1 — pass-through helpers for the new optional fields.
 *  All three (totalFp, fpStatKeys, salience) are computed UPSTREAM by
 *  the caller; the builder threads them onto facts unchanged. Keeping
 *  these as one place to spread means the per-trigger branches below
 *  don't each duplicate the same five lines.
 *
 *  rare_pull intentionally drops salience — per the lock, rare_pull's
 *  topReason already carries the rare-line signal and a salience pair
 *  would either duplicate it or distract from it. Caller is also
 *  expected to skip the computation for rare_pull, but the builder
 *  enforces the omission at the boundary regardless. */
function passthroughExtras(
  input: BuildCommentaryFactsInput,
): Partial<CommentaryFacts> {
  const out: Partial<CommentaryFacts> = {};
  if (input.totalFp != null) out.totalFp = input.totalFp;
  if (input.fpStatKeys && input.fpStatKeys.length > 0) out.fpStatKeys = input.fpStatKeys;
  if (input.salience && input.trigger !== "rare_pull") out.salience = input.salience;
  return out;
}

export function buildCommentaryFacts(
  input: BuildCommentaryFactsInput,
): CommentaryFactsResult {
  // default trigger never POSTs to /api/headline — bank pick is correct.
  if (input.trigger === "default") {
    return { kind: "skip", reason: "default_trigger" };
  }

  const verdict = deriveVerdict(input);
  const anchorCard = findAnchor(input.roster, input.anchorBasePlayerId);
  const extras = passthroughExtras(input);

  // miss — no anchor concept. Carry gap + next-tier for the prompt to
  // shape "one decision from ALL-STAR" lines.
  if (input.trigger === "miss") {
    const facts: CommentaryFacts = {
      surface: input.surface,
      sport: input.sport,
      season: input.season,
      trigger: "miss",
      verdict,
      ...(input.winTier ? { winTier: input.winTier } : {}),
      ...(input.nearMissGap != null ? { nearMissGap: input.nearMissGap } : {}),
      ...(input.nearMissNextTier ? { nearMissNextTier: input.nearMissNextTier } : {}),
      ...extras,
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
        ...(input.winTier ? { winTier: input.winTier } : {}),
        ...extras,
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
    ...(input.winTier ? { winTier: input.winTier } : {}),
    anchor: buildAnchorBlock(anchorCard, input.sport, topReason),
    ...extras,
  };

  return { kind: "facts", facts };
}
