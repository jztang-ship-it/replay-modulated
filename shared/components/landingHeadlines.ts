// shared/components/landingHeadlines.ts
//
// RD5.1 — Decision-frame headline + CTA + seal system for the recipient
// challenge landing. Spec of record: docs/rd5-1-headline-system-spec.md.
//
// Governing principle: the headline starts an argument, the stamp provides
// evidence, the CTA lets the recipient answer. The headline must NEVER
// contain the stamp's label word (no-duplication guardrail).
//
// This module is pure: given the trigger + held-card names + sender name +
// (for the miss/rare_pull seal label) the trigger-detail fields, it returns
// the rendered strings for the h1, the seal, and the CTA. No data fetching,
// no React, no side effects. The landing component renders them.
//
// Tier-agnostic headlines: only the seal LABEL depends on missTier /
// topGameTier. The headline copy is the same shape for every miss or
// rare_pull. This is by design — the seal carries the tier.

import type { TakeCardTrigger } from "@shared/challengeTakeCard/types";

// ── Held-card name listing ───────────────────────────────────────────────
//
// Spec: 1 → "HARDEN", 2 → "HARDEN AND BEAL", 3+ → "HIS STARS" /
// "THE BIG NAMES". The card grid still shows the full roster — this is for
// the headline string only. Single-name picks the last token of the player's
// name (matches the "HARDEN", "BEAL" examples in the spec).

function lastName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1];
}

export function formatHeldNamesForHeadline(names: readonly string[]): string {
  // Pre-uppercase so the rendered string survives even if the consumer
  // doesn't apply textTransform. The h1 in the landing also applies
  // uppercase via CSS — this double-cover is intentional.
  if (names.length === 0) return "HIS STARS";
  if (names.length === 1) return lastName(names[0]).toUpperCase();
  if (names.length === 2) {
    const a = lastName(names[0]).toUpperCase();
    const b = lastName(names[1]).toUpperCase();
    return `${a} AND ${b}`;
  }
  return "HIS STARS";
}

// ── Choke setup verbs (decision-verb pool) ───────────────────────────────
//
// Per the spec: "Setup verbs to vary the decision clause: trusted · backed
// · rode with · bet on · stuck with · handed the keys to."
// Exported for future deterministic-pick wiring; the live choke default
// uses "TRUSTED" (the worked example).

export const CHOKE_SETUP_VERBS = [
  "TRUSTED",
  "BACKED",
  "RODE WITH",
  "BET ON",
  "STUCK WITH",
  "HANDED THE KEYS TO",
] as const;

// ── Choke consequence-clause alternates ──────────────────────────────────
//
// Spec leaves all three in for a later A/B; build default = THE CALL COST
// HIM. Kept as a const array (not an A/B harness) so the alternates are
// authored on the tree without a flag.

export const CHOKE_CONSEQUENCE_DEFAULT = "THE CALL COST HIM.";
export const CHOKE_CONSEQUENCE_ALTERNATES = [
  "IT COST HIM.",        // outcome-focused
  "WRONG CALL.",         // argument-focused
] as const;

// ── Seal label resolution ────────────────────────────────────────────────
//
// Resolves the trigger's stamp label. Returns null for `default` (no seal).
// For `miss`, the spec retires "NEAR MISS" — only ALL STAR / MVP / LEGEND
// MISS exist; bare "MISS" is a defensive fallback when the tier is missing.
// For `rare_pull`, the tier label map is verified.

const RARE_PULL_TIER_LABEL: Record<string, string> = {
  record: "NEW RECORD",
  career: "CAREER HIGH",
  season: "SEASON HIGH",
};

function formatMissTier(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/_/g, " ").trim().toUpperCase();
}

export function resolveSealLabel(
  trigger: TakeCardTrigger,
  missTier?: string | null,
  topGameTier?: "record" | "career" | "season" | null,
): string | null {
  switch (trigger) {
    case "choke":
      return "CHOKE";
    case "big_score":
      return "BIG SCORE";
    case "miss": {
      const prefix = formatMissTier(missTier);
      return prefix ? `${prefix} MISS` : "MISS";
    }
    case "rare_pull":
      return topGameTier ? (RARE_PULL_TIER_LABEL[topGameTier] ?? "RARE PULL") : "RARE PULL";
    case "default":
    default:
      return null;
  }
}

// ── Headline templates ───────────────────────────────────────────────────
//
// All five trigger shapes are tier-agnostic prose; the seal carries any
// tier specificity. Headlines must pass the Why?/Really?/What happened?
// test (spec §"The Headline Test") — they start an argument, they don't
// finish one. Score is never in a headline (spec §"Score rule"); the
// target line above the CTA is the sole numeric.

interface HeadlineInputs {
  trigger: TakeCardTrigger;
  challengerName: string;            // already passed isRealName upstream
  heldNamesList: readonly string[];  // ordered held-card display names
}

function chokeHeadline({ challengerName, heldNamesList }: HeadlineInputs): string {
  // Worked example: JOHN TRUSTED HARDEN AND BEAL. THE CALL COST HIM.
  const name = challengerName.toUpperCase();
  const held = formatHeldNamesForHeadline(heldNamesList);
  return `${name} ${CHOKE_SETUP_VERBS[0]} ${held}. ${CHOKE_CONSEQUENCE_DEFAULT}`;
}

function bigScoreHeadline({ challengerName }: HeadlineInputs): string {
  const name = challengerName.toUpperCase();
  return `${name} PUT TOGETHER A MONSTER HAND.`;
}

function rarePullHeadline({ challengerName }: HeadlineInputs): string {
  const name = challengerName.toUpperCase();
  return `${name} FOUND SOMETHING NOBODY SAW COMING.`;
}

function missHeadline({ challengerName }: HeadlineInputs): string {
  const name = challengerName.toUpperCase();
  return `ONE SWAP STOOD BETWEEN ${name} AND GREATNESS.`;
}

function defaultHeadline({ challengerName }: HeadlineInputs): string {
  const name = challengerName.toUpperCase();
  return `${name} SET THE BAR.`;
}

// ── CTA per trigger ──────────────────────────────────────────────────────
//
// Spec §"CTA rule": outcome-aware AND frame-aware. Each CTA answers its
// headline's argument. ACCEPT CHALLENGE is the fallback ONLY (used when the
// trigger isn't known on the data path).

const CTA_BY_TRIGGER: Record<TakeCardTrigger, string> = {
  choke: "MAKE THE BETTER CALL",
  big_score: "TRY TO TOP IT",
  rare_pull: "TAKE YOUR SHOT",
  miss: "FIND THE SWAP",
  default: "CLEAR IT",
};

export const FALLBACK_CTA = "ACCEPT CHALLENGE";

// ── Public API ───────────────────────────────────────────────────────────
//
// Single entry point the landing component uses. Returns ready-to-render
// strings (headline + ctaLabel) and the seal label (or null for default).

export interface LandingHeadlineOutput {
  headline: string;
  ctaLabel: string;
  sealLabel: string | null;
}

export interface PickHeadlineArgs {
  trigger: TakeCardTrigger;
  challengerName: string;
  heldNamesList: readonly string[];
  missTier?: string | null;
  topGameTier?: "record" | "career" | "season" | null;
}

export function pickHeadlineAndCta(args: PickHeadlineArgs): LandingHeadlineOutput {
  const inputs: HeadlineInputs = {
    trigger: args.trigger,
    challengerName: args.challengerName,
    heldNamesList: args.heldNamesList,
  };

  let headline: string;
  switch (args.trigger) {
    case "choke":     headline = chokeHeadline(inputs); break;
    case "big_score": headline = bigScoreHeadline(inputs); break;
    case "rare_pull": headline = rarePullHeadline(inputs); break;
    case "miss":      headline = missHeadline(inputs); break;
    case "default":
    default:          headline = defaultHeadline(inputs); break;
  }

  return {
    headline,
    ctaLabel: CTA_BY_TRIGGER[args.trigger] ?? FALLBACK_CTA,
    sealLabel: resolveSealLabel(args.trigger, args.missTier, args.topGameTier),
  };
}

// ── No-duplication guardrail (spec §Governing principle) ────────────────
//
// Whole-word, case-insensitive. Headline must NOT contain any token from
// the stamp's label vocabulary. Exported so the component test can
// parametrize over all five triggers without re-deriving the rules.
//
// Vocabulary derives from the seal labels and obvious inflections:
//   choke     → choke, choked, choking
//   big_score → big, score, scored, scoring, scoreboard? — no, scoreboard
//               would never appear in a tier-agnostic prose headline AND
//               whole-word matching means "scoreboard" wouldn't trip
//               "score" anyway. The literal stamp words are "BIG SCORE";
//               we forbid those two stems.
//   miss      → miss, missed, missing  (plus the tier tokens that appear
//               on the seal: ALL, STAR, MVP, LEGEND — but those CAN
//               appear in a headline that doesn't restate the seal, e.g.
//               "GREATNESS" lives near MVP semantically without being the
//               same word. The guardrail enforces the stamp's literal
//               vocabulary, not its semantics.)
//   rare_pull → rare, pull, record, career, season  (the seal label is
//               one of NEW RECORD / CAREER HIGH / SEASON HIGH; if any of
//               those root words shows up in the headline, the no-
//               duplication rule is violated.)
//   default   → no seal → no forbidden tokens.

const FORBIDDEN_BY_TRIGGER: Record<TakeCardTrigger, readonly string[]> = {
  choke: ["choke", "choked", "choking"],
  big_score: ["big", "score", "scored", "scoring"],
  miss: ["miss", "missed", "missing"],
  rare_pull: ["rare", "pull", "record", "career", "season"],
  default: [],
};

export function forbiddenWordsForTrigger(trigger: TakeCardTrigger): readonly string[] {
  return FORBIDDEN_BY_TRIGGER[trigger] ?? [];
}

export function headlineContainsForbiddenWord(
  trigger: TakeCardTrigger,
  headline: string,
): { hit: true; word: string } | { hit: false } {
  const words = FORBIDDEN_BY_TRIGGER[trigger] ?? [];
  for (const w of words) {
    // Whole-word, case-insensitive. \b handles ASCII word boundaries,
    // which the spec headlines stay within (no diacritics).
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(headline)) return { hit: true, word: w };
  }
  return { hit: false };
}
