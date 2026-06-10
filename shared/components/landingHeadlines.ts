// shared/components/landingHeadlines.ts
//
// RD5.1 v3 — Decision-frame headline + CTA + seal system for the
// recipient challenge landing. Spec of record: docs/rd5-1-headline-
// system-spec.md (v3 — native vocabulary lock).
//
// Governing principle: the headline starts an argument, the stamp
// provides evidence, the CTA lets the recipient answer. The vocabulary
// mirrors the game's own — `HELD` for the sender's decision (matches
// the in-game state name `wasHeld`) and `KEEP` on the CTA (matches the
// recipient's literal next-screen instruction "Tap the players you'd
// keep. Draw the rest." in H2HRecipientPlay.tsx:406).
//
// Stamp labels + colors mirror `TierGauge.tsx` (the in-game commentary
// chip that fires alongside the result). The string "BIG SCORE" is
// retired — big_score renders the tier label only.
//
// This module is pure: no React, no DOM, no side effects. The landing
// component renders the strings returned by pickHeadlineAndCta and the
// stamp label / color returned by resolveSeal.

import type { TakeCardTrigger } from "@shared/challengeTakeCard/types";
import type { WinTierKey } from "@shared/utils/payoutLogic";

// ── Held-card name listing ───────────────────────────────────────────────
//
// Spec §Name rules: 1 → "LAST", 2 → "LAST AND LAST", 3+ → "HIS STARS".
// The headline templates prefix these with HELD ("HELD HARDEN AND BEAL").
// Single-name picks the last token (matches the spec's HARDEN / BEAL
// worked examples).

function lastName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1];
}

export function formatHeldNamesForHeadline(names: readonly string[]): string {
  if (names.length === 0) return "HIS STARS";
  if (names.length === 1) return lastName(names[0]).toUpperCase();
  if (names.length === 2) {
    const a = lastName(names[0]).toUpperCase();
    const b = lastName(names[1]).toUpperCase();
    return `${a} AND ${b}`;
  }
  return "HIS STARS";
}

// ── Hold-verb pool (spec §Name rules) ────────────────────────────────────
// Build default is `HELD`; the alternates are documented on the tree for a
// later variation pass. NOT wired as an A/B harness in v3.

export const HOLD_VERBS = ["HELD", "KEPT", "STUCK WITH", "RODE WITH"] as const;

// ── Choke consequence-clause (spec §choke) ───────────────────────────────
// Build default is `IT COST HIM.` The two alternates ride on the tree as a
// const array for a later A/B; do NOT wire a harness in v3.

export const CHOKE_CONSEQUENCE_DEFAULT = "IT COST HIM.";
export const CHOKE_CONSEQUENCE_ALTERNATES = [
  "WRONG HOLD.",   // argument-focused
  "IT BACKFIRED.", // outcome-focused
] as const;

// ── Stamp seal — labels + colors mirror TierGauge.tsx ───────────────────
//
// Source-of-truth file references in comments. The landing's InFlowBadge
// component renders this label + color; the headline guardrail uses the
// label string to compute the forbidden vocabulary dynamically.

export interface SealVisual {
  /** Visible label, uppercase. */
  label: string;
  /** CSS background (gradient or solid color from TIER_CFG). */
  background: string;
  /** Text color on the chip. */
  color: string;
}

// TierGauge.tsx:101-108 — TIER_CFG for win_tier stamps. big_score reuses
// these solid colors (no gradient) because that's what TierGauge renders.
const WIN_TIER_COLOR: Record<WinTierKey, string> = {
  LEGEND:   "#EF4444",
  MVP:      "#FB923C",
  ALL_STAR: "#C084FC",
  STARTER:  "#3B82F6",
  ROOKIE:   "#22C55E",
  BUST:     "#6B7280",
};

// TierGauge.tsx:101-108 — the on-chip label for ALL_STAR is "ALL-STAR"
// (hyphen, not space). MVP and LEGEND need no transformation.
const WIN_TIER_LABEL: Record<WinTierKey, string> = {
  LEGEND:   "LEGEND",
  MVP:      "MVP",
  ALL_STAR: "ALL-STAR",
  STARTER:  "STARTER",
  ROOKIE:   "ROOKIE",
  BUST:     "BUST",
};

// TierGauge.tsx:451-455 — rare_pull sub-tier labels. NO "NEW" prefix;
// the in-game chip renders RECORD / CAREER HIGH / SEASON HIGH.
const RARE_PULL_TIER_LABEL: Record<string, string> = {
  record: "RECORD",
  career: "CAREER HIGH",
  season: "SEASON HIGH",
};

function formatMissTier(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/_/g, " ").trim().toUpperCase();
}

export interface ResolveSealArgs {
  trigger: TakeCardTrigger;
  missTier?: string | null;
  topGameTier?: "record" | "career" | "season" | null;
  /** Resolved win tier for big_score (sport adapter computes it from
   *  target_score). Required only for big_score; null/undefined for the
   *  other triggers. When big_score lacks a winTier (legacy / fallback),
   *  the seal degrades to a transparent "RESULT" pill so the surface
   *  still reads as evidence — caller treats as a soft-fail, not a hard
   *  null. */
  winTier?: WinTierKey | null;
}

/** Resolves the visible seal for the trigger. Returns null when the
 *  trigger is `default` (no seal — the headline starts the argument
 *  unaided per spec §default). */
export function resolveSeal(args: ResolveSealArgs): SealVisual | null {
  switch (args.trigger) {
    case "choke":
      return {
        label: "CHOKE",
        background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 60%, #7f1d1d 100%)",
        color: "#fff5f5",
      };
    case "miss": {
      const prefix = formatMissTier(args.missTier);
      return {
        label: prefix ? `${prefix} MISS` : "MISS",
        background: "linear-gradient(135deg, #fde68a 0%, #f59e0b 55%, #b45309 100%)",
        color: "#3a2000",
      };
    }
    case "big_score": {
      // The win_tier stamp from TierGauge: label is the tier, color is
      // the TIER_CFG color. big_score gates on ALL_STAR / MVP / LEGEND
      // upstream (triggerEvaluation.ts:185). The resolver here is
      // defensive against cross-season threshold drift — if the
      // recipient-side calculateWinTier returns a lower tier than
      // big_score's eligibility floor (the sender hit MVP at season X
      // thresholds, but the recipient applies the current season's
      // thresholds and the same FP value lands at STARTER), we soft-
      // fail to the floor (ALL-STAR) rather than render a "STARTER"
      // seal that contradicts the trigger.
      const eligible: ReadonlySet<WinTierKey> = new Set<WinTierKey>(["ALL_STAR", "MVP", "LEGEND"]);
      const tier: WinTierKey = (args.winTier && eligible.has(args.winTier)) ? args.winTier : "ALL_STAR";
      return {
        label: WIN_TIER_LABEL[tier],
        background: WIN_TIER_COLOR[tier],
        color: "#070A12",
      };
    }
    case "rare_pull": {
      const key = args.topGameTier ?? "";
      const label = RARE_PULL_TIER_LABEL[key] ?? "RARE PULL";
      return {
        label,
        background: "linear-gradient(135deg, #7FFF00 0%, #5BBE00 100%)",
        color: "#070A12",
      };
    }
    case "default":
    default:
      return null;
  }
}

// ── Headline templates (v3 — HELD verb throughout) ──────────────────────

interface HeadlineInputs {
  challengerName: string;
  heldNamesList: readonly string[];
}

function chokeHeadline({ challengerName, heldNamesList }: HeadlineInputs): string {
  // Worked example: JOHN HELD HARDEN AND BEAL. IT COST HIM.
  const name = challengerName.toUpperCase();
  const held = formatHeldNamesForHeadline(heldNamesList);
  return `${name} HELD ${held}. ${CHOKE_CONSEQUENCE_DEFAULT}`;
}

function bigScoreHeadline({ challengerName }: HeadlineInputs): string {
  // The held lineup delivered — generic "HIS STARS" carries the spec's
  // big_score template without needing per-name listing (the cards below
  // name the actual lineup).
  const name = challengerName.toUpperCase();
  return `${name} HELD HIS STARS AND THEY DELIVERED.`;
}

function rarePullHeadline({ challengerName }: HeadlineInputs): string {
  const name = challengerName.toUpperCase();
  return `${name} FOUND SOMETHING NOBODY SAW COMING.`;
}

function missHeadline({ challengerName }: HeadlineInputs): string {
  // v3: de-swapped to KEEP. The recipient mechanic is keep/draw, not
  // swap — the headline now uses the verb the recipient will see on the
  // next screen.
  const name = challengerName.toUpperCase();
  return `${name} WAS ONE KEEP AWAY FROM GREATNESS.`;
}

function defaultHeadline({ challengerName }: HeadlineInputs): string {
  const name = challengerName.toUpperCase();
  return `${name} SET THE BAR.`;
}

// ── CTA per trigger (v3 — keep-action where appropriate) ────────────────

const CTA_BY_TRIGGER: Record<TakeCardTrigger, string> = {
  choke:     "KEEP THE RIGHT ONES",
  big_score: "TRY TO TOP IT",
  rare_pull: "TAKE YOUR SHOT",
  miss:      "KEEP WHO YOU'D KEEP",
  default:   "KEEP THE RIGHT ONES",
};

export const FALLBACK_CTA = "ACCEPT CHALLENGE";

// ── Public API ──────────────────────────────────────────────────────────

export interface LandingHeadlineOutput {
  headline: string;
  ctaLabel: string;
  seal: SealVisual | null;
}

export interface PickHeadlineArgs {
  trigger: TakeCardTrigger;
  challengerName: string;
  heldNamesList: readonly string[];
  missTier?: string | null;
  topGameTier?: "record" | "career" | "season" | null;
  /** Resolved win tier for big_score (passed in from the sport adapter
   *  via the landing shell). */
  winTier?: WinTierKey | null;
}

export function pickHeadlineAndCta(args: PickHeadlineArgs): LandingHeadlineOutput {
  const inputs: HeadlineInputs = {
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
    seal: resolveSeal({
      trigger: args.trigger,
      missTier: args.missTier,
      topGameTier: args.topGameTier,
      winTier: args.winTier,
    }),
  };
}

// ── No-duplication guardrail (v3 — dynamic per rendered stamp) ──────────
//
// Spec §No-duplication guardrail. Computes the forbidden vocabulary from
// the seal that the trigger will actually render — NOT a hardcoded const
// array. Whole-word, case-insensitive.
//
// Why dynamic: a static list either over-blocks (e.g. ban "MVP" from
// every miss headline even when missTier is ALL_STAR) or under-blocks
// (let "MVP" through a miss whose seal IS "MVP MISS"). The actual
// duplication risk is between the headline and the rendered stamp; the
// dynamic check matches that risk exactly.
//
// Tokenization: split the seal label on whitespace + hyphen, drop very
// short tokens (≤2 chars — "ALL" stays in, but "OF" / "AT" / etc never
// appear in stamp labels anyway). Each token becomes a whole-word case-
// insensitive regex. Also fold in common inflections of the base stamp
// verbs (CHOKE → CHOKED/CHOKING; MISS → MISSED/MISSING) so a future
// author can't write "JOHN CHOKED THIS HAND" without a guardrail hit
// even though the chip says "CHOKE" (not "CHOKED").

const STEM_INFLECTIONS: Record<string, readonly string[]> = {
  CHOKE: ["choke", "choked", "choking"],
  MISS:  ["miss", "missed", "missing"],
};

/** Tokens forbidden in a headline that will render this seal, lower-cased
 *  for the case-insensitive regex. Empty array for seal=null (default
 *  trigger → guardrail N/A). */
export function forbiddenTokensFromSeal(seal: SealVisual | null): string[] {
  if (!seal) return [];
  const out = new Set<string>();
  // Split on whitespace and hyphen so "ALL-STAR" and "ALL STAR" both
  // contribute the same token set (ALL + STAR).
  for (const raw of seal.label.split(/[\s-]+/)) {
    const t = raw.trim().toLowerCase();
    if (t.length === 0) continue;
    if (STEM_INFLECTIONS[t.toUpperCase()]) {
      for (const inf of STEM_INFLECTIONS[t.toUpperCase()]) out.add(inf);
    } else {
      out.add(t);
    }
  }
  return Array.from(out);
}

export interface HeadlineDuplicationResult {
  hit: boolean;
  /** When hit, the token that fired. */
  word?: string;
}

export function headlineContainsSealVocabulary(
  headline: string,
  seal: SealVisual | null,
): HeadlineDuplicationResult {
  const tokens = forbiddenTokensFromSeal(seal);
  for (const w of tokens) {
    const re = new RegExp(`\\b${w}\\b`, "i");
    if (re.test(headline)) return { hit: true, word: w };
  }
  return { hit: false };
}
