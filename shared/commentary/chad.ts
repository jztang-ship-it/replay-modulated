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

const TRASH_WIN_BIG_NAMED: string[] = [
  "You buried {name} by {delta}. Send the receipt.",
  "{name} got cooked. Don't let them forget it.",
  "{delta} FP daylight on {name}. Run it back and twist the knife.",
  "You beat {name} by {delta}. That's not a win, that's a statement.",
  "Embarrassed {name} by {delta}. Send it before you change your mind.",
];
const TRASH_WIN_BIG_UNNAMED: string[] = [
  "Buried them by {delta}. Send the receipt.",
  "They got cooked. Don't let it slide.",
  "{delta} FP of daylight. Make them watch.",
  "Cleared the bar by {delta}. That's a statement.",
  "Beat them by {delta}. Run it back before they recover.",
];

const TRASH_WIN_NARROW_NAMED: string[] = [
  "By {delta}. {name}'s gonna want a rematch.",
  "Stole it. Send it before {name} sees this.",
  "{delta} FP. {name} won't sleep on that one.",
  "Slim margin on {name}. They'll be back — get ahead of it.",
  "Edged {name} by {delta}. Run it before they cool off.",
];
const TRASH_WIN_NARROW_UNNAMED: string[] = [
  "By {delta}. They'll want a rematch.",
  "Stole it by {delta}. Send it before they see this.",
  "Edged them by {delta}. Run it before they recover.",
  "{delta} FP. They won't sleep on it.",
  "Squeaked through. Lock it in and send it back.",
];

const TRASH_LOSS_BIG_NAMED: string[] = [
  "{name} had your number. Build your own and call them out.",
  "{name} got you by {delta}. Run a fresh hand and pick a new fight.",
  "Rough one against {name}. Reset the board.",
  "{name} took it by {delta}. Get cleaner cards and try again.",
  "Off night. {name}'s gonna gloat — beat someone else.",
];
const TRASH_LOSS_BIG_UNNAMED: string[] = [
  "Got cooked by {delta}. Run a fresh one.",
  "Rough hand. Reset the board.",
  "Down {delta}. Try someone else's slate.",
  "Off night. Build your own and pick a new fight.",
  "Lost by {delta}. Walk it off — fresh hand.",
];

const TRASH_LOSS_NARROW_NAMED: string[] = [
  "By {delta}. Right there.",
  "So close. {name} knows they got lucky.",
  "{delta} FP shy of {name}. That's gonna bug you all night.",
  "Off by {delta}. {name}'s gonna remember that — get them back later.",
  "{name} squeaked by you. Built different next time.",
];
const TRASH_LOSS_NARROW_UNNAMED: string[] = [
  "By {delta}. Right there.",
  "{delta} FP short. That'll bug you.",
  "So close. They got lucky.",
  "Off by {delta}. Get clean cards and run it back.",
  "Shy by {delta}. The slate had it — you didn't.",
];

const TRASH_PHOTO_FINISH_NAMED: string[] = [
  "Tied with {name}. Run another to break it.",
  "Photo finish. Settle it on a fresh slate.",
  "Coin flip. {name} won't be ready for round two.",
  "{delta} FP. Same slate, same energy needed for the rematch.",
  "Dead heat against {name}. The next hand decides it.",
];
const TRASH_PHOTO_FINISH_UNNAMED: string[] = [
  "Photo finish. Settle it on a fresh slate.",
  "Coin flip. Run another to break it.",
  "Dead heat. Next hand decides it.",
  "Within {delta} FP. The slate had room — barely.",
  "Razor margin. One more hand.",
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
