// shared/challengeTakeCard/generateChallengeTakeCard.ts
//
// Phase 2a take-card generator — the pure selector that turns
// challenge data into the four V2 landing fields. Lock:
// docs/challenge-landing-v2-phase2a-voice-and-generator-lock.md.
//
// Non-negotiables (the test gates pin these):
//   1. DETERMINISTIC — same challengeId → identical take card on every
//      call (landing refresh + OG share-card runtime BOTH render this).
//      Seed = hash(challengeId + slotName). NO Math.random. NO
//      pickWithAntiRepeat. The existing chad selectors get this wrong
//      for this surface (they reroll per render) — see lock 2d.
//   2. Mode split on the disagreement slot — correction (choke/miss),
//      competition (big_score/rare_pull), neutral (default).
//   3. holdsRecorded graceful degrade — when false, route to no-anchor
//      disagreement banks (never emit a half-filled "{anchorName}"
//      token).
//   4. CTA family lock — banks in templates.CTAS only; tested against
//      templates.BANNED_CTAS.
//
// All four output fields are FULLY substituted strings — landing
// renders them verbatim. The CHOKE/MISS stamp from Phase 1 is its own
// element on the landing; this module is the prose around it.

import type {
  ChallengeTakeCard,
  TakeCardInput,
  TakeCardMode,
  TakeCardTrigger,
  HeldCardForTakeCard,
} from "./types";
import { HOOKS, OUTCOMES, DISAGREEMENTS, CTAS } from "./templates";

// ── Determinism: a tiny FNV-1a 32-bit hash ─────────────────────────────
// Pure, no Math.random. Same input → same output forever. Used to seed
// per-slot picks so the four fields don't all index the same bank
// position (the slot name is salted in).
//
// FNV-1a is chosen because it's a few lines, has well-known constants,
// and produces enough avalanche to spread short inputs (challengeId is
// a UUID — ~32 hex chars — and a short slot label) across the bank
// length space. No cryptographic claim is made or needed.
function fnv1a32(input: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 0x01000193 — multiplied via Math.imul for 32-bit semantics
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned so modulo math is well-defined.
  return h >>> 0;
}

function seededIndex(challengeId: string, slot: string, bankLength: number): number {
  if (bankLength <= 0) return 0;
  return fnv1a32(`${challengeId}|${slot}`) % bankLength;
}

/** Pure seeded pick. Returns the empty string when the bank is empty so
 *  the caller can route to a fallback bank rather than crash. Callers
 *  who must produce a non-empty field should pass a guaranteed-non-empty
 *  bank (the generator's routing ensures this for the four output
 *  fields). */
function seededPick(bank: readonly string[], challengeId: string, slot: string): string {
  if (bank.length === 0) return "";
  return bank[seededIndex(challengeId, slot, bank.length)]!;
}

// ── Mode derivation ────────────────────────────────────────────────────
// Lock 2e: the disagreement slot's tone flips on mode, not just trigger.

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
// be substituted from input or the line must not have been picked
// (graceful-degrade routing prevents emitting half-filled tokens). A
// post-substitution check at the bottom of generate() catches any stray
// braces — defense against a future bank carrying a token the generator
// doesn't know about.

interface SubstitutionDict {
  challengerName: string;
  targetScore: string;
  anchorName: string;
  held1: string;
  held2: string;
  nearMissGap: string;
  nearMissNextTier: string;
  winTier: string;
}

function buildDict(input: TakeCardInput): SubstitutionDict {
  // Falls back: missing names → "Your friend"; missing tier label →
  // raw winTier; missing miss fields → "" (caller's routing should
  // ensure miss banks only fire when these are present).
  const held = topTwoHeldByActualFp(input.heldCards);
  return {
    challengerName: input.challengerName?.trim() || "Your friend",
    targetScore: input.targetScore.toFixed(1),
    anchorName: input.anchorName?.trim() || "",
    held1: held[0]?.name ?? "",
    held2: held[1]?.name ?? "",
    nearMissGap: input.nearMissGap != null ? String(Math.round(input.nearMissGap)) : "",
    nearMissNextTier: formatTierLabel(input.nearMissNextTier),
    winTier: formatTierLabel(input.winTier),
  };
}

function formatTierLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  // Underscore → hyphen to match existing recipient-intro rendering
  // ("ALL_STAR" → "ALL-STAR") so the take card reads consistently with
  // the stamp + the surrounding intro copy on the landing.
  return raw.replace(/_/g, "-");
}

function substitute(template: string, dict: SubstitutionDict): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    if (key in dict) return (dict as Record<string, string>)[key] ?? "";
    // Unknown token — leave the brace in place so the post-check at the
    // bottom of generate() catches the bank/dict drift loudly rather
    // than silently emit a stripped half-line.
    return `{${key}}`;
  });
}

function topTwoHeldByActualFp(held: readonly HeldCardForTakeCard[]): HeldCardForTakeCard[] {
  return [...held]
    .sort((a, b) => (b.actualFp ?? 0) - (a.actualFp ?? 0))
    .slice(0, 2);
}

// ── Disagreement routing ──────────────────────────────────────────────
// 2f's graceful-degrade contract + 2e's mode split + the choke-only
// "with two helds" variant (the "stack" framing that needs both names).

function pickDisagreementBank(input: TakeCardInput, mode: TakeCardMode): string[] {
  const banks = DISAGREEMENTS[mode][input.trigger];
  if (!banks) return [];

  const hasAnchor = !!(input.anchorName && input.anchorName.trim().length > 0);
  const heldsCount = input.holdsRecorded ? input.heldCards.length : 0;

  // Choke + 2+ helds — the "stack" framing (named two players). Only
  // when both held names are available; otherwise fall through to the
  // anchor-only variant.
  if (
    input.trigger === "choke" &&
    mode === "correction" &&
    heldsCount >= 2 &&
    banks.withTwoHelds &&
    banks.withTwoHelds.length > 0
  ) {
    const top = topTwoHeldByActualFp(input.heldCards);
    if (top[0]?.name && top[1]?.name) return banks.withTwoHelds;
  }

  // Anchor-bearing route — needs both holdsRecorded:true AND a
  // resolved anchorName. Either condition false → no-anchor route
  // (2f's graceful-degrade).
  if (hasAnchor && input.holdsRecorded && banks.withAnchor.length > 0) {
    return banks.withAnchor;
  }

  return banks.noAnchor;
}

// ── Public entry point ────────────────────────────────────────────────

export function generateChallengeTakeCard(input: TakeCardInput): ChallengeTakeCard {
  const mode = deriveMode(input.trigger);
  const dict = buildDict(input);
  const seed = input.challengeId;

  const hookTemplate    = seededPick(HOOKS[input.trigger],    seed, "hook");
  const outcomeTemplate = seededPick(OUTCOMES[input.trigger], seed, "outcome");
  const disagreementBank = pickDisagreementBank(input, mode);
  const disagreementTemplate = seededPick(disagreementBank, seed, "disagreement");
  const ctaText = seededPick(CTAS[mode], seed, "cta");

  const card: ChallengeTakeCard = {
    hookHeadline:     substitute(hookTemplate,         dict).trim(),
    outcomeLine:      substitute(outcomeTemplate,      dict).trim(),
    disagreementLine: substitute(disagreementTemplate, dict).trim(),
    ctaText:          ctaText.trim(),
  };

  // Post-substitution token-stray guard. If any field still contains a
  // {token}, the bank is referencing a key buildDict doesn't supply —
  // surface that as an empty field rather than ship a half-rendered
  // line. The tests pin all-tokens-resolve per trigger.
  for (const key of ["hookHeadline", "outcomeLine", "disagreementLine", "ctaText"] as const) {
    if (/\{\w+\}/.test(card[key])) {
      // Mark the half-rendered slot as empty; the landing's render
      // path can decide whether to fall back, hide, or surface an
      // error. Tests catch this in CI.
      (card as Record<typeof key, string>)[key] = "";
    }
  }

  return card;
}
