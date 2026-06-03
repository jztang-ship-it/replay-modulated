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
  HeldCardForTakeCard,
} from "./types";
import type { CultureShape } from "@shared/commentary/selectCommentary";
import {
  classifyAnchorTruth as classifyAnchorTruthShared,
  type AnchorTruthCard,
} from "@shared/commentary/anchorTruth";
import {
  TAKES,
  TAKES_MISS_WIDE_GAP,
  TAKES_CHOKE_ANCHOR_VINDICATED,
  TAKES_CHOKE_ANCHOR_BLAMED,
  TAKES_CHOKE_CULTURE_VINDICATED,
  TAKES_CHOKE_CULTURE_BLAMED,
  MISS_ONE_DECISION_THRESHOLD_FP,
  SUB_HEADLINE,
  DARES,
  CTAS,
  STAKES_BUSTED,
  STAKES_BARELY_SURVIVED,
  STAKES_MISS_NARROW,
  STAKES_MISS_WIDE,
  STAKES_NEUTRAL,
  STAKES_PREFIX_HELD_STARS_PLURAL,
  STAKES_PREFIX_HELD_STARS_SINGULAR,
  BUST_FP_CEILING,
  ROOKIE_FP_CEILING,
  buildStakesCompetition,
} from "./templates";

// Phase 3 (lock: docs/challenge-landing-v2-phase3-authored-voice-engine-
// lock.md): re-export the verdict + thresholds from their new home so
// any consumer importing them from this module keeps working.
export {
  classifyAnchorTruth,
  DELIVERED_RATIO,
  TANKED_RATIO,
  type AnchorTruthVerdict,
} from "@shared/commentary/anchorTruth";

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
  /** Phase 2e — culture-flavored TAKE banks substitute {nickname} when
   *  the anchor has a culture entry with an iconic nickname. Resolved-
   *  nickname when present + uppercased; "" when no culture / no iconic
   *  nickname (routing falls through to the 2d anchorName banks before
   *  ever picking from a culture bank, so an empty dict value here is
   *  defense-in-depth, not the actual flow). */
  nickname: string;
}

function buildDict(input: TakeCardInput, nickname: string): SubstitutionDict {
  return {
    challengerName: input.challengerName?.trim() ?? "",
    targetScore: input.targetScore.toFixed(1),
    nearMissGap: input.nearMissGap != null ? String(Math.round(input.nearMissGap)) : "",
    nearMissNextTier: formatTierLabel(input.nearMissNextTier),
    anchorName: input.anchorName?.trim().toUpperCase() ?? "",
    nickname,
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

/** Phase 2d → Phase 3: anchor-truth classification, now delegating to
 *  the shared `classifyAnchorTruth` in `@shared/commentary/anchorTruth`.
 *  Routing here keeps the take card's existing 2d/2e bank vocabulary
 *  ("vindicated"/"blamed"/"generic") so the rest of the generator reads
 *  unchanged; the shared verdict ("credited"/"blamed"/"neutral") is
 *  remapped at this boundary.
 *
 *  Adapter: the take card's `TakeCardInput.heldCards` carries an
 *  optional basePlayerId; the shared classifier matches by
 *  basePlayerId. For held cards without one (legacy test fixtures), a
 *  deterministic name-keyed synthetic ID is used on BOTH the anchor
 *  resolution side and the roster side, preserving the original
 *  name-match semantics. Production callers (the landing) supply real
 *  basePlayerIds and never hit the synthetic path. */
type AnchorTruth = "vindicated" | "blamed" | "generic";

function nameKeyId(c: HeldCardForTakeCard): string {
  if (c.basePlayerId && c.basePlayerId.trim().length > 0) return c.basePlayerId;
  return `__name__:${c.name.trim().toLowerCase()}`;
}

function classifyAnchorTruthLocal(input: TakeCardInput): AnchorTruth {
  if (!looksLikeName(input.anchorName)) return "generic";

  const target = (input.anchorName ?? "").trim().toLowerCase();
  const anchorHeld = input.heldCards.find(
    c => c.name.trim().toLowerCase() === target,
  );
  const anchorBasePlayerId = anchorHeld ? nameKeyId(anchorHeld) : null;

  const roster: AnchorTruthCard[] = input.heldCards.map(c => ({
    basePlayerId: nameKeyId(c),
    actualFp: c.actualFp,
    projectedFp: c.projectedFp,
    wasHeld: true,
  }));

  const verdict = classifyAnchorTruthShared({
    roster,
    anchorBasePlayerId,
    holdsRecorded: input.holdsRecorded,
  });

  if (verdict === "credited") return "vindicated";
  if (verdict === "blamed") return "blamed";
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

/** Phase 2e — iconic nickname pick. Returns the first nickname in the
 *  culture's `nicknames[]` that passes the iconic-nickname filter
 *  (length ≥ 4, not equal to the player's first or last name — same
 *  rule lookupCulture uses for PURPLE-tier gating). Falls back to "" if
 *  no iconic nickname exists; routing layer treats "" as "no culture
 *  flavor available" and falls through to the 2d non-culture bank.
 *
 *  Deterministic across the seed: when multiple iconic nicknames exist,
 *  the seed picks one ("Black Mamba" vs "Mamba" vs "Vino" for Kobe). */
function pickIconicNickname(
  culture: CultureShape | null | undefined,
  anchorName: string | null | undefined,
  challengeId: string,
): string {
  const nicks = culture?.nicknames ?? [];
  if (nicks.length === 0 || !anchorName) return "";
  const parts = anchorName.trim().split(/\s+/);
  const first = (parts[0] ?? "").toLowerCase();
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  const iconic = nicks.filter(n => {
    if (n.length < 4) return false;
    const lower = n.toLowerCase();
    return lower !== first && lower !== last;
  });
  if (iconic.length === 0) return "";
  return seededPick(iconic, challengeId, "take-nickname").toUpperCase();
}

/** Phase 2e — conditional stakes evidence line. When the take NAMES the
 *  anchor (vindicated/blamed/culture-flavored), the take carries the
 *  talent indictment → bare stakes ("BUSTED.") reads honest. When the
 *  take is GENERIC ("THESE CARDS SHOULD NOT HAVE LOST"), the bare form
 *  reads flat alongside it → prefix the stakes with "HELD THE STARS."
 *  so the talent-vs-failure tension lives somewhere on the page.
 *  Drops the prefix entirely on 0-held (legacy) — can't credit "stars
 *  held" when none were. */
function buildEvidenceLineChoke(
  input: TakeCardInput,
  stakesWord: string,
  takeNamedAnchor: boolean,
): string {
  if (takeNamedAnchor) return `${stakesWord}.`;
  const heldCount = input.holdsRecorded ? input.heldCards.length : 0;
  if (heldCount === 0) return `${stakesWord}.`;
  const prefix =
    heldCount === 1 ? STAKES_PREFIX_HELD_STARS_SINGULAR : STAKES_PREFIX_HELD_STARS_PLURAL;
  return `${prefix}. ${stakesWord}.`;
}

export function generateChallengeTakeCard(input: TakeCardInput): ChallengeTakeCard {
  const mode = deriveMode(input.trigger);
  const seed = input.challengeId;

  // TAKE routing — choke gets anchor-truth branching (Phase 2d) + a
  // culture-flavored overlay (Phase 2e) when an iconic nickname is
  // available. Miss keeps the 2c overclaim gate; everything else uses
  // the standard trigger-keyed bank. The named/noName routing layers
  // on top.
  //
  // 2e routing:
  //   choke + vindicated + iconic nickname → TAKES_CHOKE_CULTURE_VINDICATED
  //   choke + vindicated + no nickname     → TAKES_CHOKE_ANCHOR_VINDICATED
  //   choke + blamed + iconic nickname     → TAKES_CHOKE_CULTURE_BLAMED
  //   choke + blamed + no nickname         → TAKES_CHOKE_ANCHOR_BLAMED
  //   choke + generic                      → TAKES.choke
  //   miss wide                            → TAKES_MISS_WIDE_GAP
  //   everything else                      → TAKES[trigger]
  const anchorTruth = input.trigger === "choke" ? classifyAnchorTruthLocal(input) : "generic";
  const nickname =
    input.trigger === "choke" && anchorTruth !== "generic"
      ? pickIconicNickname(input.anchorCulture, input.anchorName, seed)
      : "";
  const dict = buildDict(input, nickname);
  const hasCultureFlavor = nickname.length > 0;

  let takeBank;
  let takeNamedAnchor = false;
  if (input.trigger === "choke" && anchorTruth === "vindicated") {
    takeBank = hasCultureFlavor ? TAKES_CHOKE_CULTURE_VINDICATED : TAKES_CHOKE_ANCHOR_VINDICATED;
    takeNamedAnchor = true;
  } else if (input.trigger === "choke" && anchorTruth === "blamed") {
    takeBank = hasCultureFlavor ? TAKES_CHOKE_CULTURE_BLAMED : TAKES_CHOKE_ANCHOR_BLAMED;
    takeNamedAnchor = true;
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

  // EVIDENCE: Phase 2d plain-language stakes + Phase 2e conditional
  // prefix (generic take only). NO raw FP appears. NO held names fused
  // into the stakes line — the DENZEL'S LINE block lists them; the take
  // names the anchor (when applicable). De-dup'd.
  const stakesWord = buildPlainStakes(input, mode);
  const evidenceLine =
    input.trigger === "choke"
      ? buildEvidenceLineChoke(input, stakesWord, takeNamedAnchor)
      : stakesWord;

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
    // Phase 2e — expose the routing flag for the landing to gate the
    // DENZEL'S LINE block. Already computed above for stakes routing;
    // now also surfaced on the contract.
    takeNamedAnchor,
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
