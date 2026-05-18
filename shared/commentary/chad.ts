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
  "Tutorial's over. Tap the gold icon — that's where the rules and your target live. Don't make me explain twice.",
  "Training wheels off. Gold icon up top is the scoring rules and the bar to beat. Memorize it.",
  "You're playing for coins now. Tap the gold icon — rules, targets, payouts. Know them or wing it.",
];

/** User returns within 24hrs */
const DAILY_RETURN: string[] = [
  "You're back. Bonus pool rotated overnight — one of them might actually clock in tonight, the rest will disappoint you.",
  "New day, new bonus pool. Same rules, different chances to overpay for the wrong guy.",
  "Back for more. Bonus pool refreshed; peek before you deal or learn the hard way.",
  "Regulars are back. Bonus pool swapped — tap the gold icon and see who's bumped tonight.",
];

/** User returns after 3+ days away */
const WIN_BACK: string[] = [
  "Stranger. Pool's been compounding without you. Three players are juiced up — coward play is ignoring them.",
  "You remembered we exist. Daily bonuses refreshed, leaderboard's wide open — top 10 split coins, your spot's been empty.",
  "Been a minute. Bonus pool's cycled a few times since you bailed. Tonight's lineup is honest — read it.",
];

/** First time hitting a 2-win streak */
const STREAK_INTRO: string[] = [
  "Two straight. Fire emojis are real — one more win, multiplier hits 1.3x. Don't trip on the way.",
  "Back to back. Multiplier wakes up at three straight. Stack another or watch it die.",
  "Two in a row. The multiplier's warming up; ice it with one more or restart from zero.",
];

/** First time landing a ROOKIE win — explain the half-money-back rule and
 *  point at the legend modal so the user can see the full payout table. */
const ROOKIE_FIRST_WIN: string[] = [
  "Didn't win. Didn't get cooked. Half your bet's back — that's ROOKIE tier. Tap the gold icon if you want to chase the real money.",
  "Rookie tier, half-back. Not a win, not a loss — just rent paid. Tap the gold icon and see what the actual tiers pay.",
  "Half your bet, returned to sender. ROOKIE tier exists so the floor doesn't eat you alive — tap the legend icon and learn how to clear it.",
];

/** First time qualifying for leaderboard (anonymous user) */
const LEADERBOARD_INTRO: string[] = [
  "You made the board. Top 10 split the bonus pool — drop an email or watch some stranger inherit your spot.",
  "Qualified. Don't celebrate — go look where you actually landed before you start texting people.",
  "On the board. Tap to claim coins; without an email it's just decoration.",
];

/** How the leaderboard + bonus pool works — shown after 3rd hand */
const LEADERBOARD_EXPLAINER: string[] = [
  "See the bonus pool up top? Every bet feeds it. Top 10 hands and top 10 sessions split it at midnight — more hands, bigger pool, everybody eats.",
  "5% of every bet feeds the pool. Best single hand makes one board, best session score makes another. Top 10 each get paid — show up or don't.",
  "The pool isn't decoration — it's real coins, paid at midnight. Every hand you play is a swing at the board.",
];

/** Big win nudge (anonymous, hit ALL_STAR+) */
const BIG_WIN: string[] = [
  "That's a real score. Save your account before variance comes back to collect.",
  "Solid hit. Lose this device, lose this hand — save your account.",
  "Nice hand. Coins are real, account isn't — fix it before the browser does.",
];

/** Retention nudge (12+ hands, still anonymous) */
const RETENTION: string[] = [
  "You're not a tourist anymore. Save your account or risk feeding the next hand to a stranger's browser.",
  "12 hands deep, still anonymous. The streak you're building isn't backed up — fix that.",
  "At this point you're a regular. Save the progress — 10 seconds to lock it, forever to lose it.",
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
