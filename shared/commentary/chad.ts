/**
 * chad.ts — Chad voice, general (non-challenge) commentary surfaces.
 *
 * Topic-keyed banks for the Chad-commentary system: welcome, daily-return,
 * win-back, streak intro, ROOKIE first-win, leaderboard intro/explainer,
 * big-win, retention, MVP thanks, dev 4th-wall.
 *
 * Challenge-specific surfaces (intro chip, comparison tactical line,
 * trash-talk strip, trigger framing, rivalry-back chip, normal-play
 * handoff welcome) live in chadChallenge.ts. Split per the post-Tier-1
 * culture work — challenge flows have their own voice ergonomics
 * (recipient-facing, two-step rivalry continuation) that diverge from
 * single-player Chad surfaces.
 */

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0];
}


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

// ── Public API ────────────────────────────────────────────────────────────

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
