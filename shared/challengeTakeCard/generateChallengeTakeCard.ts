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
  TAKES_CHOKE_ANCHOR_VINDICATED,
  TAKES_CHOKE_ANCHOR_BLAMED,
  DELIVERED_RATIO,
  TANKED_RATIO,
  MISS_ONE_DECISION_THRESHOLD_FP,
  SUB_HEADLINE,
  DARES,
  CTAS,
  STAKES_BUSTED,
  STAKES_BARELY_SURVIVED,
  STAKES_MISS_NARROW,
  STAKES_MISS_WIDE,
  STAKES_NEUTRAL,
  BUST_FP_CEILING,
  ROOKIE_FP_CEILING,
  buildStakesCompetition,
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
  /** Phase 2d — anchor-aware TAKE banks substitute {anchorName} when an
   *  anchor-truth branch fires. Resolved-name when present; "" when not
   *  (the routing already requires anchorName for the anchor banks, so an
   *  empty string here means the generic bank was picked instead). */
  anchorName: string;
}

function buildDict(input: TakeCardInput): SubstitutionDict {
  return {
    challengerName: input.challengerName?.trim() ?? "",
    targetScore: input.targetScore.toFixed(1),
    nearMissGap: input.nearMissGap != null ? String(Math.round(input.nearMissGap)) : "",
    nearMissNextTier: formatTierLabel(input.nearMissNextTier),
    anchorName: input.anchorName?.trim().toUpperCase() ?? "",
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

/** Phase 2d — anchor-truth classification. Used by the choke TAKE
 *  routing to decide vindicate/blame/generic. Gated to choke (the only
 *  trigger where "{anchor} wasn't the problem" is a coherent claim).
 *
 *  Returns "vindicated" when the anchor delivered AND at least one other
 *  held card tanked; "blamed" when the anchor itself tanked; "generic"
 *  for every ambiguous / under-determined case. Critically, the legacy
 *  gate (holdsRecorded:false → heldCards:[] from the landing) short-
 *  circuits to "generic" because there's no anchor card in the list to
 *  classify. */
type AnchorTruth = "vindicated" | "blamed" | "generic";

function classifyAnchorTruth(input: TakeCardInput): AnchorTruth {
  if (!input.holdsRecorded) return "generic";
  if (!looksLikeName(input.anchorName)) return "generic";
  if (input.heldCards.length < 2) return "generic"; // need an "other" to indict
  const anchor = input.heldCards.find(
    c => c.name.trim().toLowerCase() === (input.anchorName ?? "").trim().toLowerCase(),
  );
  if (!anchor) return "generic"; // anchor wasn't held — no coherent claim
  if (anchor.projectedFp <= 0) return "generic"; // ratio undefined
  const anchorRatio = anchor.actualFp / anchor.projectedFp;
  if (anchorRatio < TANKED_RATIO) return "blamed";
  if (anchorRatio >= DELIVERED_RATIO) {
    const otherTanked = input.heldCards.some(c => {
      if (c === anchor) return false;
      if (c.projectedFp <= 0) return false;
      return c.actualFp / c.projectedFp < TANKED_RATIO;
    });
    if (otherTanked) return "vindicated";
  }
  return "generic";
}

/** Phase 2d — plain-language stakes by mode/trigger. Replaces the 2c
 *  "165.5 FP on the board" prose. NO FP number ever appears in the
 *  return value (asserted by gate test). */
function buildPlainStakes(input: TakeCardInput, mode: TakeCardMode): string {
  if (mode === "competition") {
    return buildStakesCompetition(input.attemptCount, input.winnerCount);
  }
  if (mode === "correction") {
    if (input.trigger === "choke") {
      // BUST < ROOKIE_MIN; ROOKIE_MIN <= ROOKIE < STARTER_MIN. Choke fires
      // only on BUST/ROOKIE finals so we map both.
      return input.targetScore < BUST_FP_CEILING ? STAKES_BUSTED : STAKES_BARELY_SURVIVED;
    }
    if (input.trigger === "miss") {
      const gap = input.nearMissGap ?? 0;
      return gap > MISS_ONE_DECISION_THRESHOLD_FP ? STAKES_MISS_WIDE : STAKES_MISS_NARROW;
    }
  }
  // BUST_FP_CEILING / ROOKIE_FP_CEILING currently only inform the choke
  // branch above. ROOKIE_FP_CEILING stays exported for future tier-edge
  // routing — referenced here to keep the import contract live so a
  // future bank can branch on the STARTER-MIN line without a re-import.
  void ROOKIE_FP_CEILING;
  return STAKES_NEUTRAL;
}

/** Phase 2d — fused choke evidence ("KOBE AND KIDD. BUSTED."). Only
 *  applies when the take is the GENERIC choke claim (not an anchor-
 *  vindicated/blamed take, which already names the anchor). Lists the
 *  first two held names; falls through to plain stakes for 0–1 held. */
function fuseChokeEvidence(
  input: TakeCardInput,
  stakesWord: string,
  anchorTruth: AnchorTruth,
): string {
  if (anchorTruth !== "generic") return stakesWord; // take already names the anchor
  if (input.trigger !== "choke") return stakesWord;
  if (!input.holdsRecorded) return stakesWord;
  if (input.heldCards.length < 2) return stakesWord;
  const [a, b] = input.heldCards;
  const first = a!.name.trim().toUpperCase();
  const second = b!.name.trim().toUpperCase();
  return `${first} AND ${second}. ${stakesWord}.`;
}

export function generateChallengeTakeCard(input: TakeCardInput): ChallengeTakeCard {
  const mode = deriveMode(input.trigger);
  const dict = buildDict(input);
  const seed = input.challengeId;

  // TAKE routing — choke gets anchor-truth branching (Phase 2d); miss
  // keeps the 2c overclaim gate; everything else uses the standard
  // trigger-keyed bank. The named/noName routing layers on top.
  //
  // anchor-truth (choke only):
  //   vindicated → TAKES_CHOKE_ANCHOR_VINDICATED
  //   blamed     → TAKES_CHOKE_ANCHOR_BLAMED
  //   generic    → TAKES.choke (the safe always-true claim)
  const anchorTruth = input.trigger === "choke" ? classifyAnchorTruth(input) : "generic";

  let takeBank;
  if (input.trigger === "choke" && anchorTruth === "vindicated") {
    takeBank = TAKES_CHOKE_ANCHOR_VINDICATED;
  } else if (input.trigger === "choke" && anchorTruth === "blamed") {
    takeBank = TAKES_CHOKE_ANCHOR_BLAMED;
  } else if (input.trigger === "miss" && (input.nearMissGap ?? 0) > MISS_ONE_DECISION_THRESHOLD_FP) {
    takeBank = TAKES_MISS_WIDE_GAP;
  } else {
    takeBank = TAKES[input.trigger];
  }
  const takeLines = looksLikeName(input.challengerName) ? takeBank.named : takeBank.noName;
  const takeTemplate = seededPick(takeLines, seed, "take");

  // DARE: mode-keyed, trigger-refined.
  const dareBank = DARES[mode][input.trigger] ?? [];
  const dareTemplate = seededPick(dareBank, seed, "dare");

  // CTA: mode-keyed.
  const ctaText = seededPick(CTAS[mode], seed, "cta");

  // EVIDENCE: Phase 2d plain-language stakes. NO raw FP appears.
  const stakesWord = buildPlainStakes(input, mode);
  const evidenceLine = fuseChokeEvidence(input, stakesWord, anchorTruth);

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
