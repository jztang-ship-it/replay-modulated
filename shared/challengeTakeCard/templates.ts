// shared/challengeTakeCard/templates.ts
//
// Phase 2a take-card banks. SLOT-keyed (hook / outcome / disagreement /
// cta), authored to the Chad voice spine — see
// docs/commentary-voice-system.md (canonical) + §3a (challenge-surface
// user needling, the 2026-06-03 amendment) + §7 (the applied register).
// Lock: docs/challenge-landing-v2-phase2a-voice-and-generator-lock.md.
//
// Same voice spine as chadChallenge.ts; this is a NEW SURFACE, not a
// fork (§6 of the voice doc already lists multiple bank files
// implementing one spine — these banks plug the decomposed
// hook/outcome/disagreement/cta the H2H intro banks fuse into a single
// Line[]).
//
// Tokens substituted at output time by generateChallengeTakeCard:
//   {challengerName} — sender's display name (falls back to "Your friend")
//   {targetScore}    — sender's totalFp, one decimal
//   {anchorName}     — anchor card name (resolved from anchor_base_player_id)
//   {held1}, {held2} — top two wasHeld card names (sorted by actualFp desc)
//   {nearMissGap}    — miss only, integer FP
//   {nearMissNextTier} — miss only, "ALL-STAR" / "MVP" / "LEGEND" form

import type { TakeCardTrigger, TakeCardMode } from "./types";

// ── HOOK (top of landing — the provocation) ─────────────────────────────
// Trigger-keyed. choke leans on the §3a register (savage about the
// sender's decision); players ({anchorName}, {held*}) stay untouched.

export const HOOKS: Record<TakeCardTrigger, string[]> = {
  // rare_pull leans on the §7 INTRO_RARE_PULL_* register — the
  // *witnessing rarity* register, not the *executing a great lineup*
  // register that big_score uses. Vocabulary cribbed straight from the
  // shipped voice: "box score had to double-check," "carved into the
  // record sheet," "the night the stat sheet broke," "did something the
  // league hadn't seen in years." So rare_pull diverges clearly from
  // big_score: rare_pull is "you were there when one player did
  // something rare"; big_score is "you stacked a great lineup."
  rare_pull: [
    "{challengerName} caught {anchorName} on a night the box score had to double-check.",
    "{anchorName} did something the league hadn't seen in years, and {challengerName} had the ticket.",
    "{challengerName} caught {anchorName} on the night the stat sheet broke.",
    "{anchorName} carved {challengerName} into the record sheet — once-a-season material.",
  ],
  big_score: [
    "{challengerName} cleared the bar by a mile and posted the receipt.",
    "{challengerName} stacked the right names and the right names brought the circus.",
    "{challengerName} caught the whole slate hot and cashed it.",
    "{challengerName} hit {targetScore} and dared the group chat to come close.",
  ],
  choke: [
    "{challengerName} held the studs and choked the slate around them.",
    "{challengerName} talked himself into a loaded hand and folded it.",
    "{challengerName} had the studs and still bricked the floor.",
    "{challengerName} stacked the names, lost the nerve, and posted the receipt anyway.",
  ],
  miss: [
    "{challengerName} bumped the {nearMissNextTier} cut line and slid back.",
    "{challengerName} got close enough to feel it. Close didn't pay.",
    "{challengerName} put up {targetScore} and stalled at the edge.",
    "{challengerName} walked the slate right up to {nearMissNextTier} and the door held.",
  ],
  default: [
    "{challengerName} ran the slate. Posted {targetScore}. Your call.",
    "{challengerName} played the same six and walked off at {targetScore}.",
    "{challengerName} took a swing at the slate. {targetScore} is what it returned.",
  ],
};

// ── OUTCOME (by the score — what happened, score visible but not hero) ──
// Trigger-keyed. Reads the score factually and names what made the score
// what it was. No new provocation here — the hook already provoked; this
// is the receipt.

export const OUTCOMES: Record<TakeCardTrigger, string[]> = {
  rare_pull: [
    "{targetScore} on the board, paid out by a stat sheet that broke at the margins.",
    "{targetScore} — {anchorName} hung a number people print and pin.",
    "{targetScore} — the kind of line they double-check before printing it.",
  ],
  big_score: [
    "{targetScore} cleared. {challengerName} cashed in clean.",
    "{targetScore} on the board. The slate said yes and {challengerName} said amen.",
    "{targetScore}, top-shelf execution, no asterisks.",
  ],
  choke: [
    "{targetScore} flat. Loaded hand, hollow result.",
    "{targetScore} on the scoreboard. The studs delivered nothing.",
    "{targetScore} when the math said better. The stamp earned itself.",
    "{targetScore} — the cards were loaded, the hands weren't.",
  ],
  miss: [
    "{targetScore} on the board, {nearMissGap} FP short of {nearMissNextTier}.",
    "{targetScore}, and the next tier was a possession away.",
    "{targetScore} — {nearMissGap} FP from a different conversation.",
  ],
  default: [
    "{targetScore} posted. Same slate's right here.",
    "{targetScore} on the board. Same six cards, same chance you'll do worse.",
    "{targetScore}. Receipt's printed, slate's portable.",
  ],
};

// ── DISAGREEMENT (by the cards — where acceptance happens) ─────────────
// MODE-keyed with trigger refinement. The disagreement slot is what
// flips on acceptance psychology (lock 2e):
//   - correction (choke, miss): "I'd have done it better." Name the
//     sender's decision; dare the reader to top it.
//   - competition (big_score, rare_pull): "I'll match that." Respect
//     the line; can-you-even-match.
//   - neutral (default): "same hand, your move."
//
// Within each (mode, trigger), the generator routes between an
// anchor-bearing variant and a no-anchor/no-holds variant. The
// no-holds path is the lock-2f graceful-degrade for legacy
// (holdsRecorded:false) challenges — same prose discipline, no
// {anchorName}/{held*} tokens that could render half-filled.

export interface DisagreementBanks {
  /** holdsRecorded:true AND anchorName resolved. Names the anchor. */
  withAnchor: string[];
  /** holdsRecorded:true with 2+ heldCards. Names two held players.
   *  Choke-only (the "stack" framing); empty/falsy means the
   *  withAnchor path is the holds-aware route. */
  withTwoHelds?: string[];
  /** Graceful-degrade — no anchor, no held names. Uses targetScore /
   *  trigger framing only. Fires when holdsRecorded:false OR the
   *  caller couldn't resolve anchorName from the roster. */
  noAnchor: string[];
}

export const DISAGREEMENTS: Record<TakeCardMode, Record<TakeCardTrigger, DisagreementBanks>> = {
  correction: {
    choke: {
      withAnchor: [
        "{challengerName} held {anchorName} and bricked the rest of the slate around it. Would you have held different?",
        "{challengerName} bet on {anchorName} and the bet was the trap. Same six — read it cleaner or eat the same stamp.",
        "{challengerName} rode {anchorName} into the floor. Prove your hands would have stayed steadier.",
        "{challengerName} talked himself into {anchorName}. You think you wouldn't have?",
      ],
      withTwoHelds: [
        "{challengerName} stacked {held1} and {held2} and the stack flinched. Same hand says you'd do it cleaner — show me.",
        "{challengerName} held {held1} and {held2} and choked the floor anyway. Pick the holds he flinched on.",
        "{challengerName} doubled down on {held1} and {held2} and watched it tip over. Prove you'd have held smarter.",
      ],
      noAnchor: [
        "{challengerName} put up {targetScore} on this hand. Beat it or admit you'd have folded the same way.",
        "Same six cards, same trap. Prove you'd hold steadier than {challengerName} did.",
        "{challengerName} choked {targetScore}. Same hand's right here — show different reads or sit this one out.",
      ],
    },
    miss: {
      withAnchor: [
        "{challengerName} rode {anchorName} to {nearMissGap} FP short of {nearMissNextTier}. You think you can close that gap?",
        "{anchorName} carried {challengerName} most of the way. The last {nearMissGap} FP is on you.",
        "{challengerName} got {targetScore} on this slate with {anchorName} leading. Find the cleaner read.",
      ],
      noAnchor: [
        "{challengerName} left {nearMissGap} FP on the floor at {targetScore}. Pick them up.",
        "{challengerName} put up {targetScore} — {nearMissGap} FP short of {nearMissNextTier}. Close the gap.",
        "{challengerName} stalled at {targetScore}. Same six cards. Find the points.",
      ],
    },
    // Correction-mode banks for big_score / rare_pull / default
    // shouldn't fire — generator gates on trigger ∈ {choke, miss} before
    // reaching this branch. Defined empty so the type compiles cleanly.
    big_score: { withAnchor: [], noAnchor: [] },
    rare_pull: { withAnchor: [], noAnchor: [] },
    default:   { withAnchor: [], noAnchor: [] },
  },
  competition: {
    big_score: {
      withAnchor: [
        "{challengerName} caught {anchorName} on fire. Can you touch the same number?",
        "{anchorName} cooked. {challengerName} cashed. {targetScore} to match.",
        "{challengerName} stacked {anchorName} on the right night. Same six — match the read or fall short.",
      ],
      noAnchor: [
        "{challengerName} hit {targetScore} on this slate. Same six cards. Match it or fall short.",
        "{targetScore} on the board from {challengerName}. Can you clear the same height?",
        "{challengerName} caught fire. Same slate, your hand — match it.",
      ],
    },
    // rare_pull disagreement — divergence from big_score is the whole
    // point of the §7 register: chase-the-ghost, catch-lightning,
    // be-there-when-it-happens. NOT "match the bar" (that's big_score).
    // The frame respects the rarity ("once-a-season," "carved into the
    // record books") and dares the recipient to find their own historic
    // line, not to match a number on the same one.
    rare_pull: {
      withAnchor: [
        "{challengerName} caught {anchorName} on a once-a-season night. Pick the holds and chase the ghost.",
        "Lightning struck for {challengerName} the night {anchorName} went off. Catch it twice or live with the gap.",
        "{challengerName} cashed a stat sheet that broke. Same slate — go find your own historic line.",
      ],
      noAnchor: [
        "{challengerName} caught one of those nights the slate hands out once a season. {targetScore} on the receipt.",
        "{challengerName} hung a number people screenshot. Same slate — chase the same ghost.",
        "{challengerName} cashed a stat sheet that broke. Your turn to find the line worth catching.",
      ],
    },
    // Competition-mode banks for choke / miss / default — unused by the
    // generator's mode router; defined empty for type completeness.
    choke:   { withAnchor: [], noAnchor: [] },
    miss:    { withAnchor: [], noAnchor: [] },
    default: { withAnchor: [], noAnchor: [] },
  },
  neutral: {
    default: {
      withAnchor: [
        "{challengerName} played the same six. Your move.",
        "Same slate, same cards. {targetScore} is the number to beat.",
        "{challengerName} ran it. Your hand to take or leave.",
      ],
      noAnchor: [
        "{challengerName} played the same six. Your move.",
        "Same slate, same cards. {targetScore} is the number to beat.",
        "{challengerName} ran it. Your hand to take or leave.",
      ],
    },
    // Neutral-mode banks for non-default triggers — unused; placeholders.
    rare_pull: { withAnchor: [], noAnchor: [] },
    big_score: { withAnchor: [], noAnchor: [] },
    choke:     { withAnchor: [], noAnchor: [] },
    miss:      { withAnchor: [], noAnchor: [] },
  },
};

// ── CTA (the button) ────────────────────────────────────────────────────
// Mode-keyed per lock 2g. Tight family, NEVER "Accept Challenge" /
// "Start Game" / "Beat Score" (V2 anti-patterns). Plain strings — no
// tokens, no substitution, no need for graceful-degrade.
//
//   correction → FIX / PROVE energy (the user owes the choke / miss a
//                 better answer).
//   competition → BEAT / MATCH energy (the user races the line).
//   neutral    → PLAY / TAKE energy (the user just steps up).

export const CTAS: Record<TakeCardMode, string[]> = {
  correction: ["FIX THE HAND", "PROVE YOUR LINE", "PLAY YOUR LINE"],
  competition: ["BEAT THAT LINE", "TAKE THE SAME HAND", "PLAY YOUR LINE"],
  neutral: ["PLAY YOUR LINE", "TAKE THE SAME HAND"],
};

/** Banned CTA phrases — guarded by a test in the suite. Any CTA that
 *  contains one of these substrings (case-insensitive) means the bank
 *  drifted to the V2 anti-pattern list. */
export const BANNED_CTAS: readonly string[] = [
  "ACCEPT CHALLENGE",
  "START GAME",
  "BEAT SCORE",
];
