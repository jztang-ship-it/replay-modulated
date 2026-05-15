/**
 * chad.ts — The voice of ReplayMod.
 *
 * Chad is the game's personality layer. Norman Chad energy: dry wit,
 * acts unimpressed but clearly loves the game, talks to you like a
 * buddy at a sportsbook who's seen it all.
 *
 * This file is the SINGLE source for all non-results commentary.
 * Results commentary lives in the template bank / Claude pipeline.
 * Chad handles: greetings, nudges, promotions, streaks, milestones.
 *
 * Each category has multiple variants — pick randomly to avoid repetition.
 * Keep every message ≤ 150 chars (3 lines at 12px on mobile).
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0];
}

// ── Categories ─────────────────────────────────────────────────────────────

/** First time transitioning from FTUE to real game */
const WELCOME: string[] = [
  "Look who decided to play for real. Tap the gold icon to see all the scoring rules and your target to beat.",
  "Training wheels are off. Tap the gold icon to see all the scoring rules and your target to beat.",
  "Alright, you're in. Tap the gold icon to see all the scoring rules and your target to beat.",
];

/** User returns within 24hrs */
const DAILY_RETURN: string[] = [
  "You're back. Good. New bonus players loaded — one of them might actually show up tonight.",
  "Another day, another roster. Bonus players rotated — same rules, different names.",
  "Back for more. Bonus lineup refreshed overnight — might want to peek before you deal.",
  "The regulars are here. Bonus players swapped — tap the gold icon to see today's lineup.",
];

/** User returns after 3+ days away */
const WIN_BACK: string[] = [
  "Stranger. Bonus pool's been growing without you. Three players are juiced up — might want to look.",
  "Oh you remembered we exist. Daily bonuses refreshed, leaderboard's wide open.",
  "Been a minute. Bonus players rotated a few times since you left. Today's lineup looks decent.",
];

/** First time hitting a 2-win streak */
const STREAK_INTRO: string[] = [
  "Two in a row — now we're cooking. Keep it going and the multiplier kicks in. Don't get cocky.",
  "Back to back wins. See those fire emojis? Three in a row hits 1.3x. No pressure.",
  "Two straight. Streak multiplier is warming up — one more and the bonus kicks in.",
];

/** First time landing a ROOKIE win — explain the half-money-back rule and
 *  point at the legend modal so the user can see the full payout table. */
const ROOKIE_FIRST_WIN: string[] = [
  "You didn't win, but you didn't lose all of it either — half your money's back. Tap the gold icon for the full scoring rules.",
  "Rookie tier. Not a payout, not a bust — half of your bet comes back. Tap the gold icon to see how the tiers stack.",
  "Half-back. Rookie tier means you didn't get there but you didn't get cooked either. Tap the legend icon — the rules are worth knowing.",
];

/** First time qualifying for leaderboard (anonymous user) */
const LEADERBOARD_INTRO: string[] = [
  "Well well, you made the board. Top 10 split the bonus pool — might want to drop an email so nobody steals your spot.",
  "You qualified for the leaderboard. Don't celebrate yet — check where you actually landed.",
  "Look at that, you're on the board. Tap to get coins — add an email to lock in your claim.",
];

/** How the leaderboard + bonus pool works — shown after 3rd hand */
const LEADERBOARD_EXPLAINER: string[] = [
  "See that bonus pool up top? Every bet feeds it. End of the day, top 10 hands and session scores split the pot. Play more, pool grows, everybody eats.",
  "Here's the deal — 5% of every bet goes into the bonus pool. Best single hand and best total session score make the leaderboard. Top 10 get paid.",
  "That bonus pool isn't decoration. It's real coins. Best hands of the day split it — so every hand you play is a shot at the board.",
];

/** Big win nudge (anonymous, hit ALL_STAR+) */
const BIG_WIN: string[] = [
  "That's a real score right there. Might want to save your account before luck runs out.",
  "Solid hit. Would be a shame to lose that progress — save your account.",
  "Nice hand. Your coins are real but your account isn't — might want to fix that.",
];

/** Retention nudge (12+ hands, still anonymous) */
const RETENTION: string[] = [
  "You've been at this a while. Save your account — play on any device, keep your coins.",
  "12 hands deep and still anonymous. Your streak and coins deserve a real account.",
  "At this point you're a regular. Save your progress — it takes 10 seconds.",
];

/** MVP-test personal thanks — fires once after 5+ hands.
 *  Warmer than normal Chad, acknowledges the tester specifically.
 *  Remove or gate behind a flag once we're post-MVP. */
const MVP_THANKS: string[] = [
  "You're in the early rooms of this thing. Every hand you play goes into a shared doc on our end — not creepy, just grateful. Thanks for sticking with it.",
  "Most testers bounce by now. You didn't. That actually matters to us — we're calibrating from sessions like yours. Keep going.",
  "Honest aside from us: the commentary, the payouts, the streaks — we wrote every line and tuned every number. You playing means we learn. Thanks for being here.",
];

/** 4th-wall break — team speaks directly to the user.
 *  One-time, fires around hand 15 when commitment is clearest.
 *  Distinct register from Chad: reflective, small-team vulnerability.
 *  Remove or gate post-MVP. */
const DEV_4THWALL: string[] = [
  "Quick break — Chad steps aside. Real voice now. We're a small team behind ReplayMod. You're in the early version. Every hand you play is calibrating what we build next. If something feels weird, say so. If the commentary lands, also say so. Back to the game.",
  "Honest moment. The people making this are small — a couple of us, some savings, a lot of belief that fantasy sports can still surprise people. If a hand feels rigged, tell us. If a line made you laugh, we probably celebrated on our end. Thanks for being here.",
  "Real talk for a second. This is the team, not Chad. You're one of the first hundred-ish people playing the full loop. We're grateful, nervous, and fixing things as we watch. Stay if the game's good, leave if it isn't. Either way — thanks for the data and the time.",
];

// ── Challenge comparison: outcome-bucket trash talk (line 2) ──────────────
//
// Rendered on the comparison screen *underneath* the existing tactical hand
// commentary. Always about the play/result, never about the player as a
// person. Two banks per bucket: NAMED (real challenger name available) and
// UNNAMED (anonymous / generic placeholder).
//
// Buckets selected by signed delta = mySCore − targetScore:
//   |delta| ≤ 1            → photo_finish
//   1 < delta < 15         → win_narrow
//   delta ≥ 15             → win_big
//   −15 < delta < −1       → loss_narrow
//   delta ≤ −15            → loss_big
//
// {name} and {delta} are template tokens substituted at output time.

// Win big — delta ≥ 15. Tone: ruthless, "send the receipt" energy.
const TRASH_WIN_BIG_NAMED: string[] = [
  "You buried {name} by {delta}. Send the receipt.",
  "{name} got cooked. Don't let them forget it.",
  "By {delta}? Ruthless. Make them try again.",
  "{delta} FP clear. {name}'s reaching for the rematch button.",
];
const TRASH_WIN_BIG_UNNAMED: string[] = [
  "You buried your friend by {delta}. Send the receipt.",
  "Your friend got cooked. Don't let them forget it.",
  "By {delta}? Ruthless. Make them try again.",
  "{delta} FP clear. Your friend's reaching for the rematch button.",
];

// Win narrow — 1 < delta < 15. Tone: "stole it", needle the rival's worry.
const TRASH_WIN_NARROW_NAMED: string[] = [
  "By {delta}. Stole it. Send it before {name} sees.",
  "{delta} FP. {name}'s not gonna sleep tonight.",
  "Razor-thin. {name} knows they were a redraw away.",
  "By {delta}. Send it back before they regroup.",
];
const TRASH_WIN_NARROW_UNNAMED: string[] = [
  "By {delta}. Stole it. Send it before your friend sees.",
  "{delta} FP. Your friend's not gonna sleep tonight.",
  "Razor-thin. Your friend knows they were a redraw away.",
  "By {delta}. Send it back before they regroup.",
];

// Loss big — delta ≤ −15. Tone: honest, name the rival's gloating, push forward.
const TRASH_LOSS_BIG_NAMED: string[] = [
  "{name} had your number. Build your own and call them out.",
  "Rough. {name}'s gonna gloat. Shut them up with a fresh slate.",
  "Got cooked. The hand was there — your reads weren't. Run a real one.",
  "Down {delta}. {name}'s living rent-free in your hand history. Run another.",
];
const TRASH_LOSS_BIG_UNNAMED: string[] = [
  "Your friend had your number. Build your own and call them out.",
  "Rough. Your friend's gonna gloat. Shut them up with a fresh slate.",
  "Got cooked. The hand was there — your reads weren't. Run a real one.",
  "Down {delta}. Your friend's living rent-free in your hand history. Run another.",
];

// Loss narrow — −15 < delta < −1. Tone: "right there", name the rival's sweat, forward verb.
const TRASH_LOSS_NARROW_NAMED: string[] = [
  "By {delta}. The kind of loss that haunts you. Run it back.",
  "Right there. {delta} FP from owning them. Try another hand.",
  "Almost. {name}'s sweating — but they still won. Cook a real one.",
  "{delta} FP. Brutal. Build a fresh hand and come back for them.",
];
const TRASH_LOSS_NARROW_UNNAMED: string[] = [
  "By {delta}. The kind of loss that haunts you. Run it back.",
  "Right there. {delta} FP from owning them. Try another hand.",
  "Almost. Your friend's sweating — but they still won. Cook a real one.",
  "{delta} FP. Brutal. Build a fresh hand and come back for them.",
];

// Photo finish — |delta| ≤ 1. Tone: drama, one more hand.
const TRASH_PHOTO_FINISH_NAMED: string[] = [
  "Tied. Run another to break it.",
  "Photo finish. Settle it on a fresh slate.",
  "Within {delta}. Brutal. Go again.",
];
const TRASH_PHOTO_FINISH_UNNAMED: string[] = [
  "Tied. Run another to break it.",
  "Photo finish. Settle it on a fresh slate.",
  "Within {delta}. Brutal. Go again.",
];

export type TrashTalkBucket =
  | "win_big" | "win_narrow"
  | "loss_big" | "loss_narrow"
  | "photo_finish";

const TRASH_NAMED: Record<TrashTalkBucket, string[]> = {
  win_big: TRASH_WIN_BIG_NAMED,
  win_narrow: TRASH_WIN_NARROW_NAMED,
  loss_big: TRASH_LOSS_BIG_NAMED,
  loss_narrow: TRASH_LOSS_NARROW_NAMED,
  photo_finish: TRASH_PHOTO_FINISH_NAMED,
};
const TRASH_UNNAMED: Record<TrashTalkBucket, string[]> = {
  win_big: TRASH_WIN_BIG_UNNAMED,
  win_narrow: TRASH_WIN_NARROW_UNNAMED,
  loss_big: TRASH_LOSS_BIG_UNNAMED,
  loss_narrow: TRASH_LOSS_NARROW_UNNAMED,
  photo_finish: TRASH_PHOTO_FINISH_UNNAMED,
};

// ── Challenge entry chip ──────────────────────────────────────────────────
//
// Shown the moment a challenge recipient lands in the game (first HOLD
// state). Pattern: name the challenger's act with a verb, frame the
// recipient as the active party, end with a forward-pointing imperative.
// NO instructional copy — the hold/redraw mechanic teaches itself through
// the UI.

const INTRO_NAMED: string[] = [
  "{name} put up {target}. Think you've got better in you?",
  "{name} dropped {target} on this hand. Time to cook.",
  "{name}'s gloating about {target}. Make them regret it.",
  "{name} thinks {target} is untouchable. Prove them wrong.",
  "{target}. That's the bar {name} set. Your turn at the wheel.",
];

const INTRO_UNNAMED: string[] = [
  "Your friend put up {target}. Think you've got better in you?",
  "{target} to beat. Your friend's already gloating. Shut them up.",
  "Your friend cooked. {target} on this hand. Same cards. Your move.",
  "Your friend thinks {target} is untouchable. Prove them wrong.",
  "{target}. That's the bar. Your turn at the wheel.",
];

/**
 * Entry chip shown when a challenge recipient lands in HOLD. Trash-talk
 * energy, no instructional copy. `name=null` routes to the unnamed bank.
 */
export function chadChallengeIntro(args: {
  challengerName: string | null;
  targetScore: number;
}): string {
  const bank = args.challengerName ? INTRO_NAMED : INTRO_UNNAMED;
  const target = args.targetScore.toFixed(1);
  const line = pick(bank);
  return line
    .replace(/{name}/g, args.challengerName ?? "")
    .replace(/{target}/g, target);
}

// ── Challenge comparison: tactical line 1 ─────────────────────────────────
//
// When the recipient finishes a challenge attempt, Line 1 should observe
// the play AS A CHALLENGE — referencing the target and how their hold /
// redraw decisions played against it. Distinct from the generic post-hand
// tactical commentary (selectCommentary) which reads as a standalone hand.

export interface ChadChallengeTacticalArgs {
  /** Highest-salary held card from the recipient's played hand, or null if
   *  they held nothing. `delivered` = anchor.actualFp >= anchor.projectedFp. */
  heldAnchor: { name: string; delivered: boolean } | null;
  /** Signed FP delta (my score − target). */
  delta: number;
  /** Challenger's target score. */
  target: number;
  /** Challenger's name, or null when the captured name fails isRealName. */
  challengerName: string | null;
}

export function chadChallengeTactical(args: ChadChallengeTacticalArgs): string {
  const t = args.target.toFixed(1);
  const possessive = args.challengerName ? `${args.challengerName}'s ` : "their ";
  const a = args.heldAnchor;
  const d = args.delta;

  if (d >= 1) {
    if (a?.delivered) return pick([
      `Held ${a.name} for the anchor and ${a.name} delivered. Cleared ${possessive}${t}.`,
      `${a.name} came through. Redraws didn't blink. Past ${possessive}${t}.`,
      `Anchor on ${a.name} paid out, redraws stayed disciplined. Above ${possessive}${t}.`,
    ]);
    if (a) return pick([
      `${a.name} didn't pop but the redraws found the gap. Cleared ${possessive}${t}.`,
      `Held ${a.name} — quiet anchor, redraws picked up the slack. Above ${possessive}${t}.`,
      `Anchor was muted; redraws ran the math. Past ${possessive}${t}.`,
    ]);
    return pick([
      `No anchor — pure redraw run. Cleared ${possessive}${t}.`,
      `Built from scratch and cleared ${possessive}${t}. Bold path worked.`,
    ]);
  }
  if (d <= -1) {
    if (a?.delivered) return pick([
      `Held ${a.name} and ${a.name} did their part. Redraws were the gap to ${possessive}${t}.`,
      `Anchor on ${a.name} cashed. Redraws didn't keep pace with ${possessive}${t}.`,
      `${a.name} delivered; the rest of the run stalled short of ${possessive}${t}.`,
    ]);
    if (a) return pick([
      `Held ${a.name} — solid call, but the redraws didn't keep pace with ${possessive}${t}.`,
      `${a.name} didn't show up; redraws had to carry too much. ${possessive}${t} held.`,
      `Anchor on ${a.name} sat quiet, redraws couldn't close to ${possessive}${t}.`,
    ]);
    return pick([
      `No anchor to lean on — redraws came up short of ${possessive}${t}.`,
      `Skipped the hold; redraws couldn't carry the load to ${possessive}${t}.`,
    ]);
  }
  if (a) return pick([
    `Held ${a.name}, ran the math the same way they did. Decimals from ${possessive}${t}.`,
    `Anchor on ${a.name}, redraws stayed in line. Decimals from ${possessive}${t}.`,
  ]);
  return `Same starting cards, parallel decisions. Decimals from ${possessive}${t}.`;
}

/** Pick the outcome bucket from a signed FP delta (my score − target). */
export function trashTalkBucket(delta: number): TrashTalkBucket {
  if (Math.abs(delta) <= 1) return "photo_finish";
  if (delta >= 15) return "win_big";
  if (delta > 1) return "win_narrow";
  if (delta <= -15) return "loss_big";
  return "loss_narrow";
}

/**
 * Outcome-specific trash-talk line for the challenge comparison screen.
 * Pass `name = null` (or any non-real-name) to use the UNNAMED bank.
 */
export function chadTrashTalk(bucket: TrashTalkBucket, name: string | null, delta: number): string {
  const bank = name ? TRASH_NAMED[bucket] : TRASH_UNNAMED[bucket];
  const line = pick(bank);
  const d = Math.abs(delta).toFixed(1);
  return line.replace(/{name}/g, name ?? "").replace(/{delta}/g, d);
}

/** Test/preview accessor — returns the raw bank lines for a bucket. */
export function chadTrashTalkBank(bucket: TrashTalkBucket, named: boolean): string[] {
  return [...(named ? TRASH_NAMED[bucket] : TRASH_UNNAMED[bucket])];
}

// ── Trigger-aware framing (results screen, standalone play) ───────────────
//
// When a named challenge trigger fires on the results screen (rare_pull /
// big_score / near_miss / bad_beat), Chad's primary commentary should
// reference the share-worthy nature of the moment, not just describe what
// happened. This produces that line; the share prompt then becomes the
// natural next action below the commentary.

export type ChallengeTriggerKind =
  | "rare_pull" | "big_score" | "near_miss" | "bad_beat";

export interface ChadTriggerFramingArgs {
  trigger: ChallengeTriggerKind;
  fp: number;
  tier: string;
  /** rare_pull only — the badge that fired (e.g. "career high", "top game"). */
  badgeLabel?: string;
  /** near_miss only — FP gap to the next tier. */
  nearMissGap?: number;
  /** near_miss only — the tier that was just missed. */
  nearMissNextTier?: string;
}

export function chadTriggerFraming(args: ChadTriggerFramingArgs): string {
  const fp = args.fp.toFixed(1);
  const tierName = args.tier.replace("_", "-");
  switch (args.trigger) {
    case "big_score":
      return pick([
        `Hit ${tierName} on this slate. The kind of score that needs an audience.`,
        `${tierName} on the board with ${fp}. Don't sit on it.`,
        `${fp} FP — ${tierName} tier. Pick someone and send the receipt.`,
      ]);
    case "rare_pull": {
      const what = args.badgeLabel ?? "A record game";
      return pick([
        `${what} showed up in your lineup. Worth showing off.`,
        `${what}. The kind of moment that doesn't repeat. Send it.`,
        `${what} just landed for you. Pin it before it fades.`,
      ]);
    }
    case "near_miss": {
      const gap = (args.nearMissGap ?? 0).toFixed(1);
      const next = (args.nearMissNextTier ?? "the next tier").replace("_", "-");
      return pick([
        `By ${gap} FP. Brutal. Someone else might close the gap.`,
        `${gap} FP short of ${next}. Pass the slate — see who finishes it.`,
        `So close. ${gap} FP. Make somebody finish what you started.`,
      ]);
    }
    case "bad_beat":
      return pick([
        `Looked stacked on paper. Got cooked. Share the misery.`,
        `Premium roster, premium disaster. Send it — let them try.`,
        `Stars went cold. Make somebody else feel that one.`,
      ]);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export type ChadTopic =
  | "welcome"
  | "daily_return"
  | "win_back"
  | "streak_intro"
  | "rookie_first_win"
  | "leaderboard_intro"
  | "leaderboard_explainer"
  | "big_win"
  | "retention"
  | "mvp_thanks"
  | "dev_4thwall";

const BANKS: Record<ChadTopic, string[]> = {
  welcome: WELCOME,
  daily_return: DAILY_RETURN,
  win_back: WIN_BACK,
  streak_intro: STREAK_INTRO,
  rookie_first_win: ROOKIE_FIRST_WIN,
  leaderboard_intro: LEADERBOARD_INTRO,
  leaderboard_explainer: LEADERBOARD_EXPLAINER,
  big_win: BIG_WIN,
  retention: RETENTION,
  mvp_thanks: MVP_THANKS,
  dev_4thwall: DEV_4THWALL,
};

/** Get a random Chad message for the given topic. */
export function chadMessage(topic: ChadTopic): string {
  return pick(BANKS[topic]);
}

/** Get all messages for a topic (for testing/preview). */
export function chadBank(topic: ChadTopic): string[] {
  return [...BANKS[topic]];
}
