// shared/challengeTakeCard/templates.ts
//
// Phase 2c TAKE → EVIDENCE → DARE banks. Lock: docs/challenge-landing-
// v2-phase2c-take-evidence-dare-lock.md. Voice spine:
// docs/commentary-voice-system.md.
//
// The 2c reshape: each slot is now a CLAIM (take), a FACT (evidenceLine),
// or a CHALLENGE (dare). The 2a/2b prose-slot banks (HOOKS / OUTCOMES /
// DISAGREEMENTS) were replaced — they manufactured the recap. These banks
// manufacture the argument.
//
// Tokens substituted at output time:
//   {challengerName}     — sender's display name; falls back to "Someone"
//                          (note: NOT "Your friend" — competition TAKEs
//                          read better with "Someone thinks" than "Your
//                          friend thinks")
//   {targetScore}        — sender's totalFp, one decimal
//   {nearMissNextTier}   — miss only, "ALL-STAR" / "MVP" / "LEGEND" form
//   (no per-card outcome tokens — the 2c FP-spoiler rule forbids them)

import type { TakeCardTrigger, TakeCardMode } from "./types";

// ── TAKE bank (trigger keyed, named/noName split) ──────────────────────
//
// The claim. Largest type at the top of the landing. Per-trigger
// families:
//
//   choke     → "SOMEBODY WASTED THIS HAND" / "THESE CARDS SHOULD NOT
//               HAVE LOST" — claims that this hand was wasted; sets up
//               the dare's pure-hypothetical "would you keep the same
//               core?"
//   miss      → "THIS HAND WAS ONE DECISION AWAY" / "ONE DECISION FROM
//               {nearMissNextTier}" — claims a single different choice
//               would have flipped it; sets up "can you finish the job?"
//   big_score → "{challengerName} THINKS THIS HAND IS SAFE" / "THIS
//               NUMBER IS A WALL" — names the sender (or "Someone")
//               making the claim; sets up "beat the receipt"
//   rare_pull → "HISTORY IS ON THE BOARD" / "THE RECORD BOOK GOT A NEW
//               PAGE" — claims historic; sets up "can you match it?"
//   default   → "SAME HAND. YOUR MOVE." — the neutral claim
//
// Competition TAKEs name the sender; when challengerName is null
// (anonymous / not isRealName), the generator routes to the noName
// variant ("SOMEONE THINKS..."). Correction TAKEs are claims about the
// HAND ("these cards should not have lost") and read fine regardless of
// name — both banks contain the same lines for those triggers.

export interface TakeBank {
  named: string[];
  noName: string[];
}

export const TAKES: Record<TakeCardTrigger, TakeBank> = {
  choke: {
    named: [
      "SOMEBODY WASTED THIS HAND",
      "THESE CARDS SHOULD NOT HAVE LOST",
      "THIS HAND HAD A WINNING SHAPE",
      "THE STARS WERE THERE. THE SCORE WASN'T.",
    ],
    noName: [
      "SOMEBODY WASTED THIS HAND",
      "THESE CARDS SHOULD NOT HAVE LOST",
      "THIS HAND HAD A WINNING SHAPE",
      "THE STARS WERE THERE. THE SCORE WASN'T.",
    ],
  },
  // miss SMALL-GAP bank — gap ≤ MISS_ONE_DECISION_THRESHOLD_FP. The
  // "ONE DECISION" claim reads honest at tight gaps where a single
  // card swap could plausibly cover the deficit. At wider gaps the
  // claim overclaims — generator routes to TAKES_MISS_WIDE_GAP below.
  miss: {
    named: [
      "THIS HAND WAS ONE DECISION AWAY",
      "ONE DECISION FROM {nearMissNextTier}",
      "THIS HAND TOUCHED THE CUT LINE",
      "ALMOST CLEARED THE BAR. NOT QUITE.",
    ],
    noName: [
      "THIS HAND WAS ONE DECISION AWAY",
      "ONE DECISION FROM {nearMissNextTier}",
      "THIS HAND TOUCHED THE CUT LINE",
      "ALMOST CLEARED THE BAR. NOT QUITE.",
    ],
  },
  big_score: {
    named: [
      "{challengerName} THINKS THIS HAND IS SAFE",
      "THIS NUMBER IS A WALL",
      "{challengerName} BUILT THE BAR",
      "TOP-SHELF NIGHT, RECEIPT ATTACHED",
    ],
    noName: [
      "SOMEONE THINKS THIS HAND IS SAFE",
      "THIS NUMBER IS A WALL",
      "THE BAR IS SET",
      "TOP-SHELF NIGHT, RECEIPT ATTACHED",
    ],
  },
  rare_pull: {
    named: [
      "HISTORY IS ON THE BOARD",
      "THE RECORD BOOK GOT A NEW PAGE",
      "{challengerName} CAUGHT A HISTORIC NIGHT",
      "ONCE-A-SEASON HAND, ON THE TABLE",
    ],
    noName: [
      "HISTORY IS ON THE BOARD",
      "THE RECORD BOOK GOT A NEW PAGE",
      "SOMEONE CAUGHT A HISTORIC NIGHT",
      "ONCE-A-SEASON HAND, ON THE TABLE",
    ],
  },
  default: {
    named: [
      "SAME HAND. YOUR MOVE.",
      "THE CARDS ARE ON THE TABLE",
      "{challengerName} POSTED A NUMBER",
      "SAME SIX. DIFFERENT DECISIONS.",
    ],
    noName: [
      "SAME HAND. YOUR MOVE.",
      "THE CARDS ARE ON THE TABLE",
      "SOMEONE POSTED A NUMBER",
      "SAME SIX. DIFFERENT DECISIONS.",
    ],
  },
};

// ── Phase 2d: anchor-aware choke TAKEs (anchor-truth branching) ────────
//
// When the choke trigger fires, the generator compares each held card's
// actualFp/projectedFp to decide which framing is HONEST to the data:
//
//   anchor DELIVERED (ratio >= DELIVERED_RATIO) AND ≥1 other held card
//   TANKED (ratio < TANKED_RATIO) → indict the others, vindicate the anchor
//     → TAKES_CHOKE_ANCHOR_VINDICATED
//
//   anchor TANKED (ratio < TANKED_RATIO) → indict the anchor
//     → TAKES_CHOKE_ANCHOR_BLAMED
//
//   ambiguous (mid-zone or both delivered or both tanked, no clear split)
//     → fall through to the generic TAKES.choke ("THESE CARDS SHOULD NOT
//        HAVE LOST" — safe, always true)
//
// Legacy / no-anchor / single-held / anchor not in heldCards → also
// generic. The anchor-aware claim must NEVER contradict the data.
//
// DELIVERED_RATIO = 0.90: within 10% of projection counts as "showed up."
// TANKED_RATIO = 0.60: under 60% of projection is the clearly-bad-night
// floor. The mid-zone [0.60, 0.90) deliberately maps to "no honest take"
// → generic claim. Tight thresholds prevent overclaim at the edges.
//
// Phase 3 (lock: docs/challenge-landing-v2-phase3-authored-voice-engine-
// lock.md): the constants now live in shared/commentary/anchorTruth.ts
// (the lifted classifier needs them; templates.ts re-exports so existing
// importers from this module keep working). Values are NOT touched.

export { DELIVERED_RATIO, TANKED_RATIO } from "@shared/commentary/anchorTruth";

export const TAKES_CHOKE_ANCHOR_VINDICATED: TakeBank = {
  named: [
    "{anchorName} WASN'T THE PROBLEM",
    "{anchorName} DID HIS PART",
    "DON'T BLAME {anchorName}",
    "{anchorName} SHOWED UP. THE REST DIDN'T.",
  ],
  noName: [
    "{anchorName} WASN'T THE PROBLEM",
    "{anchorName} DID HIS PART",
    "DON'T BLAME {anchorName}",
    "{anchorName} SHOWED UP. THE REST DIDN'T.",
  ],
};

export const TAKES_CHOKE_ANCHOR_BLAMED: TakeBank = {
  named: [
    "EVEN {anchorName} COULDN'T SAVE IT",
    "{anchorName} FORGOT TO SHOW UP",
    "{anchorName} WAS THE ONE THAT MISSED",
    "BUILT AROUND {anchorName}. {anchorName} BLINKED.",
  ],
  noName: [
    "EVEN {anchorName} COULDN'T SAVE IT",
    "{anchorName} FORGOT TO SHOW UP",
    "{anchorName} WAS THE ONE THAT MISSED",
    "BUILT AROUND {anchorName}. {anchorName} BLINKED.",
  ],
};

// ── Phase 2e: culture-flavored choke TAKEs (anchor + nickname) ─────────
//
// Layered ON TOP of 2d's vindicated/blamed routing. When the anchor has
// an iconic nickname in its culture DB entry, the take swaps in the
// nickname instead of the legal name ("MAMBA DID HIS PART" vs "KOBE
// BRYANT DID HIS PART"). This solves the 2d triple-named-player feel —
// the take reads as an argument about the player's IMAGE, not a third
// listing of the same proper noun (badges + DENZEL'S LINE block already
// have the legal name).
//
// Fallback: when no culture OR no iconic nickname, generator falls
// through to TAKES_CHOKE_ANCHOR_VINDICATED / TAKES_CHOKE_ANCHOR_BLAMED
// (2d behavior). NEVER emits a broken {nickname} token.
//
// Author-without-articles rule: nicknames substitute as proper nouns —
// "MAMBA DID HIS PART" works without "THE"; "THE MAMBA DID HIS PART"
// would break for nicknames like "PENNY" or "TMAC". Bank lines use
// {nickname} unprefixed.

export const TAKES_CHOKE_CULTURE_VINDICATED: TakeBank = {
  named: [
    "{nickname} DID HIS PART",
    "DON'T BLAME {nickname}",
    "{nickname} SHOWED UP. THE REST DIDN'T.",
    "YOU DON'T WASTE A {nickname} HAND",
  ],
  noName: [
    "{nickname} DID HIS PART",
    "DON'T BLAME {nickname}",
    "{nickname} SHOWED UP. THE REST DIDN'T.",
    "YOU DON'T WASTE A {nickname} HAND",
  ],
};

export const TAKES_CHOKE_CULTURE_BLAMED: TakeBank = {
  named: [
    "EVEN {nickname} WENT QUIET",
    "{nickname} FORGOT TO SHOW UP",
    "{nickname} BLINKED",
    "BUILT AROUND {nickname}. STILL LOST.",
  ],
  noName: [
    "EVEN {nickname} WENT QUIET",
    "{nickname} FORGOT TO SHOW UP",
    "{nickname} BLINKED",
    "BUILT AROUND {nickname}. STILL LOST.",
  ],
};

// ── Phase 2e: stakes prefix for the GENERIC-take path ──────────────────
//
// The 2d generic choke take ("THESE CARDS SHOULD NOT HAVE LOST") doesn't
// name the anchor; the bare stakes word ("BUSTED.") reads flat alongside
// it. 2e adds a credit-anchoring prefix when the take is generic AND ≥1
// held — "HELD THE STARS. BUSTED." — so the talent-vs-failure tension
// lives on the page. When the take NAMES the anchor (vindicated/blamed/
// culture-flavored), the prefix is dropped (the take already carries
// the indictment); evidence is just bare stakes.
//
// The 1-held case uses the singular form. The 0-held legacy case skips
// the prefix entirely (no holds to credit).

export const STAKES_PREFIX_HELD_STARS_PLURAL = "HELD THE STARS";
export const STAKES_PREFIX_HELD_STARS_SINGULAR = "HELD THE STAR";

// ── Phase 2d: plain-language stakes (the new evidenceLine vocabulary) ──
//
// Raw FP is GONE from the landing. The evidenceLine is now a stakes word
// a stranger understands: BUSTED / BARELY SURVIVED / ONE DECISION SHORT /
// CAME UP SHORT / UNBEATEN / {N} TRIED. {N} FAILED. / A NUMBER ON THE
// BOARD. BEAT IT.
//
// Tier-keyed CORRECTION stakes — choke fires only on BUST/ROOKIE finals,
// so we only need the two cuts. Threshold is the season's ROOKIE_MIN cut
// (the "did you make money" line). 2425 canonical thresholds: ROOKIE 173 /
// STARTER 203. Hardcoded — the modal season cuts; a one-FP edge case
// reading "BARELY SURVIVED" when it was technically BUST is acceptable
// imprecision (the stakes word is the LEAD, not a forensic tier label).

export const BUST_FP_CEILING = 173;
export const ROOKIE_FP_CEILING = 203;

export const STAKES_BUSTED = "BUSTED";
export const STAKES_BARELY_SURVIVED = "BARELY SURVIVED";
export const STAKES_MISS_NARROW = "ONE DECISION SHORT";
export const STAKES_MISS_WIDE = "CAME UP SHORT";
export const STAKES_NEUTRAL = "A NUMBER ON THE BOARD. BEAT IT.";

// Competition stakes — attempt-count keyed social proof.
// 0–1 attempts → UNBEATEN. 2+ / 0 winners → "{N} TRIED. {N} FAILED."
// 2+ / ≥1 winner → "BEEN BEATEN. DO IT AGAIN."
export const STAKES_UNBEATEN = "UNBEATEN";

export function buildStakesCompetition(
  attemptCount: number | null | undefined,
  winnerCount: number | null | undefined,
): string {
  const attempts = attemptCount ?? 0;
  const winners = winnerCount ?? 0;
  if (attempts <= 1) return STAKES_UNBEATEN;
  if (winners === 0) return `${attempts} TRIED. ${attempts} FAILED.`;
  return "BEEN BEATEN. DO IT AGAIN.";
}

// ── miss "one decision" overclaim gate ────────────────────────────────
//
// The lock §4 miss rule fires at gap ≤ 5% of next tier's minFp — up to
// ~13 FP near LEGEND (0.05 × 268 ≈ 13.4). At those wider gaps, "ONE
// DECISION FROM {tier}" is an overclaim: a single fantasy-basketball
// card swap realistically swings 5-15 FP, so 13 FP wants 2-3 decisions,
// not 1. The 7 FP threshold is roughly half the ALL-STAR-band ceiling
// (11.25 FP × ~0.6) — tight enough that "one decision" reads as a
// plausible single-card-swap gap, loose enough that most fired misses
// still surface the punchier claim.
//
// Generator routing: `nearMissGap > MISS_ONE_DECISION_THRESHOLD_FP` →
// `TAKES_MISS_WIDE_GAP`. The wide-gap bank swaps the "ONE DECISION"
// entries for a softer "CAME UP SHORT OF {tier}" claim — honest at any
// gap inside the 5% band.
export const MISS_ONE_DECISION_THRESHOLD_FP = 7;

export const TAKES_MISS_WIDE_GAP: TakeBank = {
  named: [
    "CAME UP SHORT OF {nearMissNextTier}",
    "THIS HAND TOUCHED THE CUT LINE",
    "ALMOST CLEARED THE BAR. NOT QUITE.",
    "THE BAR WAS THERE. JUST OUT OF REACH.",
  ],
  noName: [
    "CAME UP SHORT OF {nearMissNextTier}",
    "THIS HAND TOUCHED THE CUT LINE",
    "ALMOST CLEARED THE BAR. NOT QUITE.",
    "THE BAR WAS THERE. JUST OUT OF REACH.",
  ],
};

// ── subHeadline (the USP) ──────────────────────────────────────────────
// "Same starting hand. Different decisions." is the fairness mechanic +
// differentiator. The lock specifies it as constant today but kept as a
// generator field so per-mode variation can ship without an API change.

export const SUB_HEADLINE = "Same starting hand. Different decisions.";

// ── evidenceLine composition (mode-keyed) ───────────────────────────────
//
// The minimal FACT backing the claim. MODE-SPECIFIC because correction
// and competition treat the same number differently:
//
//   correction → the hand TOTAL is the stakes ("157.9 FP on the board").
//                No per-card breakdown (the FP-spoiler rule).
//   competition → the hand TOTAL is the WALL — bears "Still unbeaten"
//                 framing when attempt stats are available; "the wall"
//                 framing otherwise.
//   neutral    → hand total with "to beat" framing.
//
// Functions, not bank arrays, because the line composes from input
// values (targetScore, bestScore, attemptCount). Picking from a small
// bank of templates would be over-engineered for a single concise fact.

export interface EvidenceFactInput {
  targetScore: number;
  bestScore: number | null | undefined;
  attemptCount: number | null | undefined;
  winnerCount: number | null | undefined;
}

export function buildEvidenceLineCorrection(input: EvidenceFactInput): string {
  return `${input.targetScore.toFixed(1)} FP on the board`;
}

export function buildEvidenceLineCompetition(input: EvidenceFactInput): string {
  const total = `${input.targetScore.toFixed(1)} FP`;
  const winners = input.winnerCount ?? 0;
  const attempts = input.attemptCount ?? 0;
  if (attempts > 0 && winners === 0) {
    return attempts === 1
      ? `${total} · 1 attempt, still standing`
      : `${total} · ${attempts} attempts, still unbeaten`;
  }
  return `${total} · the wall`;
}

export function buildEvidenceLineNeutral(input: EvidenceFactInput): string {
  return `${input.targetScore.toFixed(1)} FP to beat`;
}

// ── DARE bank (mode + trigger keyed) ───────────────────────────────────
//
// The challenge. CORRECTION dare is PURE-HYPOTHETICAL — no outcome
// reference. The lock §"FP-spoiler rule" forbids "flinched" / "delivered
// nothing" / "cratered" in the correction dare; the savage outcome-sting
// moves to the post-play results screen (which already exists). The
// landing is the invitation; the result is the reveal.

export const DARES: Record<TakeCardMode, Record<TakeCardTrigger, string[]>> = {
  correction: {
    choke: [
      "Would you keep the same core?",
      "Pick your holds. Show your work.",
      "Same six. What's your call?",
      "Hold what you'd bet on. Prove the read.",
    ],
    // miss dare — gap-honest at any gap inside the 5% band. Dropped
    // "One decision short. Find the better one." (same overclaim risk
    // as the TAKE bank's "ONE DECISION" entries) and replaced the
    // {challengerName}-substituting line with a noName-safe form so
    // the dare reads cleanly even when the sender is anonymous.
    miss: [
      "Can you finish the job?",
      "Same hand. Close the gap.",
      "Find the points left on the floor.",
      "Find the cleaner read.",
    ],
    // Correction mode for big_score / rare_pull / default doesn't fire —
    // generator gates on trigger ∈ {choke, miss} before reaching here.
    // Defined empty so the type compiles cleanly.
    big_score: [],
    rare_pull: [],
    default: [],
  },
  competition: {
    big_score: [
      "Same hand. Beat the receipt.",
      "Can you match it?",
      "Same six. Clear the bar.",
      "Match the number or sit it out.",
    ],
    rare_pull: [
      "Same hand. Catch the same lightning.",
      "Can you find one too?",
      "Same six. Make your own history.",
      "Chase the ghost.",
    ],
    choke: [],
    miss: [],
    default: [],
  },
  neutral: {
    default: [
      "Beat the number.",
      "Same hand. Your move.",
      "Show what you'd do.",
      "Same six. Beat it.",
    ],
    choke: [],
    miss: [],
    big_score: [],
    rare_pull: [],
  },
};

// ── CTA (mode keyed) — mode-coherent per the 2c review ─────────────────
//
// The 2a/2b CTA banks scrambled across modes ("TAKE THE SAME HAND" in
// competition; "PLAY YOUR LINE" everywhere); the deterministic seed
// picked entries that didn't reinforce the mode's voice. The 2c-review
// fix tightens each bank to assert its mode's energy:
//
//   correction  → FIX / PROVE energy. The recipient owes the choke/miss
//                 a better answer; the CTA names the correction.
//   competition → BEAT / MATCH energy. The recipient races the wall;
//                 the CTA names the duel.
//   neutral     → PLAY / TAKE energy. No strong claim; the CTA invites
//                 without provoking.
//
// NEVER "Accept Challenge" / "Start Game" / "Beat Score" (the V2 anti-
// patterns, guarded by BANNED_CTAS below).

export const CTAS: Record<TakeCardMode, string[]> = {
  correction: ["PROVE YOUR LINE", "FIX THE HAND", "PLAY YOUR LINE", "DO IT BETTER"],
  competition: ["BEAT THAT LINE", "CAN YOU MATCH IT", "BEAT THE NUMBER"],
  neutral: ["PLAY YOUR LINE", "TAKE THE SAME HAND"],
};

/** Banned CTA phrases — guarded by the test in the suite. */
export const BANNED_CTAS: readonly string[] = [
  "ACCEPT CHALLENGE",
  "START GAME",
  "BEAT SCORE",
];

// ── Correction-dare outcome-reference guard (the pure-hypothetical rule) ─
//
// The lock §"FP-spoiler rule" forbids outcome references in the
// correction dare ("flinched" / "delivered nothing" / "cratered" / etc.
// — anything that telegraphs WHAT happened to the held cards). This list
// is the test guard's denylist; if a future dare line drifts into outcome
// territory, the test fails. Focused on outcome verbs that describe the
// held cards' performance — NOT on "lost" / "bricked" applied to the
// whole hand (those are claim-level fine on a choke take).

export const CORRECTION_DARE_BANNED_SUBSTRINGS: readonly string[] = [
  "flinched",
  "cratered",
  "delivered nothing",
  "delivered the kind",
  "went small",
  "no follow-through",
  "no production",
  "no-show",
  "ghosted",
];
