// shared/challengeTakeCard/generateChallengeTakeCard.ts
//
// Phase 2c take-card generator — the pure selector that turns
// challenge data into the six TAKE → EVIDENCE → DARE fields. Lock:
// docs/challenge-landing-v2-phase2c-take-evidence-dare-lock.md.
// Reshapes the 2a/2b 4-field output (hookHeadline / outcomeLine /
// disagreementLine / ctaText) into the argument shape; banks rewritten
// in templates.ts to the claim/dare register.
//
// Non-negotiables (the test gates pin these):
//   1. DETERMINISTIC — same challengeId → identical take card on every
//      call. Seed = hash(challengeId + slotName) per the 2a contract,
//      preserved through the 2c reshape. NO Math.random. NO
//      pickWithAntiRepeat.
//   2. Mode split — correction (choke, miss) vs competition (big_score,
//      rare_pull) vs neutral (default). take + dare both flip on mode.
//   3. Correction dare is pure-hypothetical — no outcome reference per
//      the lock §"FP-spoiler rule" (guarded by templates.ts's
//      CORRECTION_DARE_BANNED_SUBSTRINGS + the test).
//   4. heldCards: [] on legacy (holdsRecorded:false) — the landing omits
//      the held block entirely. Never emits a half-filled token.
//   5. CTA family lock — banks in CTAS only; guarded against BANNED_CTAS.

import type {
  ChallengeTakeCard,
  TakeCardInput,
  TakeCardMode,
  TakeCardTrigger,
} from "./types";
import {
  TAKES,
  TAKES_MISS_WIDE_GAP,
  MISS_ONE_DECISION_THRESHOLD_FP,
  SUB_HEADLINE,
  DARES,
  CTAS,
  buildEvidenceLineCorrection,
  buildEvidenceLineCompetition,
  buildEvidenceLineNeutral,
} from "./templates";

// ── Determinism: FNV-1a 32-bit hash (carried from 2a, unchanged) ───────
// Pure, no Math.random. Same input → same output forever. The slot name
// is salted in so the take / dare / cta picks don't all index the same
// bank position.

function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seededIndex(challengeId: string, slot: string, bankLength: number): number {
  if (bankLength <= 0) return 0;
  return fnv1a32(`${challengeId}|${slot}`) % bankLength;
}

function seededPick(bank: readonly string[], challengeId: string, slot: string): string {
  if (bank.length === 0) return "";
  return bank[seededIndex(challengeId, slot, bank.length)]!;
}

// ── Mode derivation ────────────────────────────────────────────────────

export function deriveMode(trigger: TakeCardTrigger): TakeCardMode {
  switch (trigger) {
    case "choke":
    case "miss":
      return "correction";
    case "big_score":
    case "rare_pull":
      return "competition";
    case "default":
      return "neutral";
  }
}

// ── Token substitution ────────────────────────────────────────────────
// Tokens land at output time. Every {…} in the source bank must either
// be substituted from input or the line must not have been picked (the
// generator's routing guarantees this). A post-substitution check at
// the bottom of generate() catches stray braces — defense against a
// future bank carrying a token the dict doesn't know about.

interface SubstitutionDict {
  challengerName: string;
  targetScore: string;
  nearMissGap: string;
  nearMissNextTier: string;
}

function buildDict(input: TakeCardInput): SubstitutionDict {
  return {
    // The dict's challengerName is for TEMPLATE-LEVEL substitution
    // ({challengerName} tokens in named-bank lines). Bank routing
    // (named vs noName) handles the no-name fallback at the bank level,
    // so this dict value is the resolved name when present and "" when
    // not — letting any accidental {challengerName} in a noName-routed
    // line surface as a stray and fail the post-substitution check.
    challengerName: input.challengerName?.trim() ?? "",
    targetScore: input.targetScore.toFixed(1),
    nearMissGap: input.nearMissGap != null ? String(Math.round(input.nearMissGap)) : "",
    nearMissNextTier: formatTierLabel(input.nearMissNextTier),
  };
}

function formatTierLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/_/g, "-");
}

function substitute(template: string, dict: SubstitutionDict): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    if (key in dict) return (dict as Record<string, string>)[key] ?? "";
    return `{${key}}`;
  });
}

// ── isRealName (subset of shared/utils/isRealName — kept local to avoid
//   a render-path dependency on the named-vs-noName routing) ──────────
// Returns true when the value is a non-empty string that doesn't look
// like an auto-mint placeholder. The full @shared/utils/isRealName has
// the placeholder denylist; for the TAKE-routing decision a simpler
// "non-empty trimmed string" is enough — the landing already runs the
// full check before passing challengerName to the generator.

function looksLikeName(s: string | null | undefined): boolean {
  if (!s) return false;
  return s.trim().length > 0;
}

// ── Public entry point ────────────────────────────────────────────────

export function generateChallengeTakeCard(input: TakeCardInput): ChallengeTakeCard {
  const mode = deriveMode(input.trigger);
  const dict = buildDict(input);
  const seed = input.challengeId;

  // TAKE: route to named or noName bank based on whether
  // challengerName resolves. For correction triggers both banks are
  // identical (the claim is about the hand, not the person); for
  // competition triggers the named variant uses {challengerName}.
  //
  // 2c-review miss overclaim gate: when the trigger is miss AND the
  // gap exceeds MISS_ONE_DECISION_THRESHOLD_FP, route to the wide-gap
  // bank instead — the "ONE DECISION FROM {tier}" claim reads honest
  // at tight gaps but overclaims as gap stretches toward the 5%-of-
  // next-tier ceiling (up to ~13 FP near LEGEND). See templates.ts
  // §"miss 'one decision' overclaim gate."
  const takeBank =
    input.trigger === "miss" && (input.nearMissGap ?? 0) > MISS_ONE_DECISION_THRESHOLD_FP
      ? TAKES_MISS_WIDE_GAP
      : TAKES[input.trigger];
  const takeLines = looksLikeName(input.challengerName) ? takeBank.named : takeBank.noName;
  const takeTemplate = seededPick(takeLines, seed, "take");

  // DARE: mode-keyed, trigger-refined.
  const dareBank = DARES[mode][input.trigger] ?? [];
  const dareTemplate = seededPick(dareBank, seed, "dare");

  // CTA: mode-keyed.
  const ctaText = seededPick(CTAS[mode], seed, "cta");

  // EVIDENCE: composed from input by mode (see templates.ts).
  const factInput = {
    targetScore: input.targetScore,
    bestScore: input.bestScore ?? null,
    attemptCount: input.attemptCount ?? null,
    winnerCount: input.winnerCount ?? null,
  };
  const evidenceLine =
    mode === "correction"  ? buildEvidenceLineCorrection(factInput)  :
    mode === "competition" ? buildEvidenceLineCompetition(factInput) :
                             buildEvidenceLineNeutral(factInput);

  // heldCards: structured list, NOT prose. Empty when holdsRecorded is
  // false — the landing's labeled held block omits entirely.
  const heldCards = input.holdsRecorded
    ? input.heldCards
        .filter(c => looksLikeName(c.name))
        .map(c => c.name.trim())
    : [];

  const card: ChallengeTakeCard = {
    mode,
    take:        substitute(takeTemplate, dict).trim(),
    subHeadline: SUB_HEADLINE,
    heldCards,
    evidenceLine,
    dare:        substitute(dareTemplate, dict).trim(),
    ctaText:     ctaText.trim(),
  };

  // Post-substitution token-stray guard. If any prose field still
  // contains a {token}, the bank references a key buildDict doesn't
  // supply — surface the half-rendered slot as empty rather than ship
  // a broken line.
  for (const key of ["take", "dare", "ctaText", "evidenceLine", "subHeadline"] as const) {
    if (/\{\w+\}/.test(card[key])) {
      (card as Record<typeof key, string>)[key] = "";
    }
  }

  return card;
}
