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
  "Look who decided to play for real. Three bonus players rotate in every 24hrs — tap the gold icon to see who's paying extra today.",
  "Training wheels are off. Daily bonuses just refreshed — tap the gold icon to see who's hot today.",
  "Alright, you're in. Three players get bonus FP every day — check the gold icon before you deal.",
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
  "Back to back wins. See those fire emojis? Three in a row hits 1.2x. No pressure.",
  "Two straight. Streak multiplier is warming up — one more and the bonus kicks in.",
];

/** First time qualifying for leaderboard (anonymous user) */
const LEADERBOARD_INTRO: string[] = [
  "Well well, you made the board. Top 10 split the bonus pool — might want to drop an email so nobody steals your spot.",
  "You qualified for the leaderboard. Don't celebrate yet — check where you actually landed.",
  "Look at that, you're on the board. Top 10 get coins — add an email to lock in your claim.",
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

// ── Public API ─────────────────────────────────────────────────────────────

export type ChadTopic =
  | "welcome"
  | "daily_return"
  | "win_back"
  | "streak_intro"
  | "leaderboard_intro"
  | "big_win"
  | "retention";

const BANKS: Record<ChadTopic, string[]> = {
  welcome: WELCOME,
  daily_return: DAILY_RETURN,
  win_back: WIN_BACK,
  streak_intro: STREAK_INTRO,
  leaderboard_intro: LEADERBOARD_INTRO,
  big_win: BIG_WIN,
  retention: RETENTION,
};

/** Get a random Chad message for the given topic. */
export function chadMessage(topic: ChadTopic): string {
  return pick(BANKS[topic]);
}

/** Get all messages for a topic (for testing/preview). */
export function chadBank(topic: ChadTopic): string[] {
  return [...BANKS[topic]];
}
