/**
 * chadChallenge.ts — Chad voice, challenge-flow commentary surfaces.
 *
 * Surfaces unique to the challenge feature: the intro chip a recipient
 * sees when they land on a challenge, the tactical line in the
 * comparison sheet, the trash-talk strip, share-prompt trigger framing,
 * Send-It-Back rivalry intro, and the post-challenge "welcome to normal
 * play" handoff line.
 *
 * Single-player Chad surfaces (welcome, daily return, leaderboard intro,
 * big-win, retention, etc.) live in chad.ts. Split out from chad.ts
 * after Tier 1 culture lock so the two voice surfaces can evolve
 * independently — challenge copy is recipient-facing, has stronger
 * tonal constraints, and is sized to a different attention budget.
 */

import type { WinTier, TopGameReason } from "./types";
import { lookupCulture, type CultureShape } from "./selectCommentary";
import type { GeneratedCard } from "../types/index";

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0];
}

// ── TOP-slot parts model — bucket 2 (S1 slot-split restoration) ──────────
//
// TOP slot lines mix prose with inline trigger stamps. Bank lines are
// authored as an array of LinePart: strings flow through Typewriter at
// render time, StampToken values render as inline DEAL/DRAW-style chips.
//
// Tier substitution model (HYBRID — bucket 2 Q4 refinement locked
// 2026-05-24; extended for win_tier 2026-05-24 evening): the selector
// substitutes tier when a bank line specifies a sentinel
// (`tier: "{missTier}"` or `tier: "{winTier}"`); the renderer
// (TierGauge) falls back to context lookup when `token.tier` is
// absent.
//
// - Bank line writes `{ stamp: "miss", tier: "{missTier}" }` → selector
//   replaces `"{missTier}"` with the actual missTier value at selection
//   time. Renderer sees a concrete tier on the token and uses it
//   directly.
// - Bank line writes `{ stamp: "win_tier", tier: "{winTier}" }` →
//   same pattern with the winTier arg. The win_tier stamp REPLACES the
//   former "big_score" stamp variant (2026-05-24 evening design
//   change): chip renders as `[ALL STAR]` / `[MVP]` / `[LEGEND]` in
//   the matching TIER_CFG color, no "BIG SCORE" suffix.
// - Bank line writes `{ stamp: "miss" }` (no tier) → renderer reads
//   missTier from props (model-(b) preserved). Same fallback path
//   exists for win_tier reading from a winTier context.
//
// Anti-repeat: JSON.stringify on the unsubstituted bank line (before
// selector substitution) keys the dedup ring buffer so the same
// authored line dedups consistently across hands regardless of which
// tier/name/statLabel gets substituted in.

export type StampToken = {
  stamp: "bad_beat" | "miss" | "win_tier" | "rare_pull";
  /** Tier label. Three forms:
   *   - `WinTier` value (e.g. "ALL_STAR") — explicit override, renderer
   *     uses directly.
   *   - Sentinel string (e.g. "{missTier}") on bank lines — selector
   *     substitutes with actual tier at selection time.
   *   - `undefined` — renderer falls back to context lookup (winTier
   *     prop for big_score; missTier prop for miss).
   *  Widened from strict `WinTier` to permit the sentinel form per
   *  the 2026-05-24 hybrid model refinement. */
  tier?: WinTier | string;
};

export type LinePart = string | StampToken;
export type Line = LinePart[];

// Buckets selected by signed delta = mySCore − targetScore:
//   |delta| ≤ 1            → photo_finish
//   1 < delta < 15         → win_narrow
//   delta ≥ 15             → win_big
//   −15 < delta < −1       → loss_narrow
//   delta ≤ −15            → loss_big
//
// {name} and {delta} are template tokens substituted at output time.

// Trash talk lines never duplicate the FP delta — the comparison sheet's
// headline already shows it. These lines carry the emotional payoff
// only, and avoid "them"/"they" pronouns (real name or "your friend"
// surfaces only).

// Win big — delta ≥ 15. Tone: ruthless, "send the receipt" energy.
const TRASH_WIN_BIG_NAMED: string[] = [
  "{name} got cooked. Send the receipt.",
  "Ruthless. Run it again.",
  "{name}'s reaching for the rematch button.",
  "{name}'s gonna want this back.",
];
const TRASH_WIN_BIG_UNNAMED: string[] = [
  "Your friend got cooked. Send the receipt.",
  "Ruthless. Run it again.",
  "Your friend's reaching for the rematch button.",
  "Your friend's gonna want this back.",
];

// Win narrow — 1 < delta < 15. Tone: "stole it", needle the rival's worry.
const TRASH_WIN_NARROW_NAMED: string[] = [
  "{name}'s not gonna sleep tonight.",
  "Stole it. Send it before {name} sees.",
  "{name} was a redraw away.",
  "Razor-thin. Send it back.",
];
const TRASH_WIN_NARROW_UNNAMED: string[] = [
  "Your friend's not gonna sleep tonight.",
  "Stole it. Send it before your friend sees.",
  "Your friend was a redraw away.",
  "Razor-thin. Send it back.",
];

// Loss big — delta ≤ −15. Tone: honest, name the rival's gloating, push forward.
const TRASH_LOSS_BIG_NAMED: string[] = [
  "{name} had your number. Build your own and call {name} out.",
  "Rough. {name}'s gonna gloat. Shut that up with a fresh slate.",
  "Got cooked. The reads weren't there.",
  "{name}'s living rent-free. Run another.",
];
const TRASH_LOSS_BIG_UNNAMED: string[] = [
  "Your friend had your number. Build your own and run another.",
  "Rough. Your friend's gonna gloat. Shut that up with a fresh slate.",
  "Got cooked. The reads weren't there.",
  "Your friend's living rent-free. Run another.",
];

// Loss narrow — −15 < delta < −1. Tone: "right there", name the rival's sweat, forward verb.
const TRASH_LOSS_NARROW_NAMED: string[] = [
  "The kind of loss that haunts you. Run it back.",
  "Right there. Try another hand.",
  "Almost. {name}'s sweating — but still won. Cook a real one.",
  "Brutal. Build a fresh hand.",
];
const TRASH_LOSS_NARROW_UNNAMED: string[] = [
  "The kind of loss that haunts you. Run it back.",
  "Right there. Try another hand.",
  "Almost. Your friend's sweating — but still won. Cook a real one.",
  "Brutal. Build a fresh hand.",
];

// Photo finish — |delta| ≤ 1. Tone: drama, one more hand.
const TRASH_PHOTO_FINISH_NAMED: string[] = [
  "Tied. Run another to break it.",
  "Photo finish. Settle it on a fresh slate.",
  "Razor margin. One more hand.",
];
const TRASH_PHOTO_FINISH_UNNAMED: string[] = [
  "Tied. Run another to break it.",
  "Photo finish. Settle it on a fresh slate.",
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

// ── First normal-play welcome (challenge → standard play handoff) ─────────
//
// One-shot Chad line for users who entered the app via a challenge URL
// and are now transitioning into normal game flow for the first time.

// Plays alongside the daily season-reel intro. Storage flag in
// localStorage prevents replay across sessions.

const NORMAL_PLAY_WELCOME: string[] = [
  "That was the warm-up. This is today's real game — pick your bet, build your hand, chase the tier.",
  "Welcome to today's slate. New season, new players, real coins on the line.",
  "Same game, fresh slate. Cards are today's, stakes are real, tiers pay out.",
  "Now you're playing for real. Today's slate, your moves, big payouts on the line.",
];

export function chadNormalPlayWelcome(): string {
  return pick(NORMAL_PLAY_WELCOME);
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

// ── Send-It-Back fresh-deal intro chip ────────────────────────────────────
//
// [Chad:rivalry-back] Fires once when the user taps "Send It Back" on a
// won challenge → routes into a fresh normal hand. Sets challengeBackCtx
// (rivalry continuation) and lands the user in HOLD with this chip
// sticky. Distinct from chadChallengeIntro (which fires for INCOMING
// challenge replays) — this is the OUTGOING rivalry continuation. The
// share prompt at RESULTS auto-fires with rivalry framing.
const RIVALRY_BACK_NAMED: string[] = [
  "Okay champ, fresh deal. Build something worth sending back to {name}.",
  "Fresh slate, same target. Whatever you cook here, it's going to {name}.",
  "Today's cards. {name}'s name on the receipt. Play the build.",
  "Rivalry math: this hand goes back to {name}. Pick like you mean it.",
  "New hand, old rival. Make {name} sweat the reply.",
];
const RIVALRY_BACK_UNNAMED: string[] = [
  "Okay champ, fresh deal. Build something worth sending back.",
  "Fresh slate, same target. Whatever you cook, it's going back to them.",
  "Today's cards, their name on the receipt. Play the build.",
  "Rivalry math: this hand fires right back. Pick like you mean it.",
];

export function chadRivalryBackIntro(args: { challengerName: string | null }): string {
  const bank = args.challengerName ? RIVALRY_BACK_NAMED : RIVALRY_BACK_UNNAMED;
  const line = pick(bank);
  return line.replace(/{name}/g, args.challengerName ?? "");
}

// ── Challenge initiation — Chad's framing as user posts their hand ────────
//
// Fires when the user has played a hand and the share prompt is preparing
// to surface. Voice: outbound, talking TO the poster about the slate
// they're about to send. Tone graduates by bucket:
//   - bad_beat:  held strong cards, hand underperformed → share-the-misery
//   - flex:      RED/ALL-STAR+/rare_pull → "make them try"
//   - statement: STARTER+ honest hand → "I dare you"
//   - default:   everything else → baseline
//
// Culture-aware variants fire ONLY when the star card had a meaningful
// performance (overperformed projection OR landed a top-game tier). When
// applicable, they replace {name} with the star's name. The lift over
// generic should feel earned — never random-fact-drop.

const INITIATION_BAD_BEAT: string[] = [
  "Held two studs and they brought you a casserole. Send it — someone has to suffer with you.",
  "Premium picks, premium disappointment. Make a friend feel this hand.",
  "You picked the right cards. The basketball didn't read the memo. Pass the slate.",
  "Stars on paper, role players on the floor. Find a victim with the same delusions.",
  "The build was right. The game was rude. Forward the receipt.",
  "Held the names, missed the production. Someone in your contacts deserves this slate.",
  "Locked in two anchors and they showed up empty-handed. Pass the misery.",
  "The math said win. The math doesn't watch basketball. Share the loss.",
  "Right reads, wrong night. See if anyone can flip the script you couldn't.",
  "Cooked by your own anchor picks. Find out who you respect enough to send this to.",
];

const INITIATION_FLEX: string[] = [
  "That's not a hand — that's a flag plant. Hand the slate to someone and watch them blink.",
  "Three big-money cards delivered. Pick a friend who thinks they could match it.",
  "Numbers like that need an audience. Send. Wait. Enjoy the silence.",
  "A score this clean doesn't repeat. Lock it in, then pick someone to chase it.",
  "MVP-tier night. The slate is yours; give it to whoever still thinks they're a hooper.",
  "Hand of the day candidate. Pick a friend, send it, watch them fold.",
  "You painted the corner. Now pick someone with paint on their hands.",
  "Receipts like this don't unread themselves. Pass it along.",
  "Set your calendar — this is the high you'll measure against for a month. Find a challenger.",
  "Top-shelf execution. Don't sit on it — see who in your group can come close.",
];

const INITIATION_STATEMENT: string[] = [
  "Not the ceiling, but the floor was furniture-store quality. See if your group can stand on it.",
  "Solid build, clean execution. Someone in your contacts thinks they could do better — find out.",
  "The line is the line. Make a friend prove they can clear it.",
  "Good hand, not a great one. Plenty of room for someone to fail at it.",
  "STARTER tier doesn't carry itself. Pass the slate; see who can carry it past you.",
  "Came up short of the trophy, but the build was honest. Make someone prove they can do the work.",
  "Decent line. Decent line gets shared too — see who treats it like a layup and misses.",
  "You set a bar. It's not the ceiling. Find someone who claims they can step on it.",
  "Above average is still above. Send it and see who falls below.",
  "Workman's hand. Pass it along — the talkers in your group can show their work.",
];

const INITIATION_DEFAULT: string[] = [
  "You played the hand. Now play the friend. Send it.",
  "Same slate, your decisions. Pick a victim.",
  "The cards are the cards. Pass them along and find out who you're really competing with.",
  "Receipt's printed. Forward it.",
  "Hand's in the books. Pick someone and see what they do with the same paper.",
  "You took your swing. Now find out if your friends can hit it.",
  "Score's locked. Slate's portable. Find a recipient.",
  "Hand for hand. Who in your contacts thinks they're better at this?",
  "Posted. Pick the friend who'll have an opinion about it.",
  "Done deal. Now find someone whose deal would have been worse.",
  "The slate doesn't change. The hand does. Share both.",
  "Your number. Their slate. See who blinks first.",
];

// Culture-aware variants — fire only when the star card had a meaningful
// performance. {name} interpolates the star's first or last name (caller
// decides which feels more natural for the bank). Pool kept tight so the
// lift over generic only happens when the moment earns it.

const INITIATION_CULTURE_FLEX: string[] = [
  "{name} dropped a vintage line. Send the slate to someone who needs reminding.",
  "{name} just put one on the wall. Pick a friend who can't match this.",
  "That's a {name} kind of night — the kind that makes box scores collectibles. Send it.",
  "{name} delivered the season-high. Slate's got receipts; find a recipient.",
  "Pull-of-the-year material from {name}. Forward it; let your group try to top it.",
  "When {name} hits like that, the rest of the league watches. Make a friend watch too.",
  "{name} cleared their own career bar. Your turn — find someone who'll try to clear yours.",
  "{name} carried it. Your job now is finding someone whose anchor won't.",
];

const INITIATION_CULTURE_BAD_BEAT: string[] = [
  "{name} clocked in and left early. Send the slate to someone who needs the same lesson.",
  "Held {name}, got nothing. Pass the slate and let a friend try the same trust fall.",
  "{name} on the marquee, no show on the floor. Find a victim.",
  "Locked in {name}'s salary. Got role-player production. Make somebody else write that check.",
  "{name} no-showed. The hand can't be rebuilt — pass the rubble.",
  "Big name, small night. See if a friend gets a different version of {name}.",
];

// ── Rare-pull initiation bank ────────────────────────────────────────────
//
// Fires when triggerResult.trigger === "rare_pull" — the star card pulled
// a record / career-high / season top-10 game. Routed by the
// starAchievementType field on ChallengeInitiationArgs; preempts the
// generic flex bucket.
//
// Template tokens (substituted at output time):
//   {name}             — anchor card's last name (e.g., "Wembanyama")
//   {achievementLabel} — "season high" | "career high" | "new record"
//                        (lowercase no-article; templates supply grammar)
//   {anchorFp}         — Math.round(anchor.actualFp), e.g. "86"
//   {fpDelta}          — Math.round(actualFp - projectedFp); always > 0
//                        when emitted (selector filters lines requiring
//                        {fpDelta} when projection is missing or delta ≤ 0)

const INITIATION_RARE_PULL: string[] = [
  "{name} just set a {achievementLabel}. Anyone who beats this is lying.",
  "{name} dropped {anchorFp}. Most of your group chat couldn't get there with a forklift.",
  "+{fpDelta} over his average. That's not a hot hand, that's a problem.",
  "{achievementLabel} on the {name} card. Half your group chat couldn't clear this on their best night.",
  "Post it. Wait. Count how many try.",
  "Send this to the friend who thinks he knows ball. Watch him fold.",
  "{achievementLabel} on {name}. Screenshot it. Frame it. Send it.",
  "Send to your group chat. Wait for the silence.",
  "{name} doesn't drop this twice a year. You just made him do it on a Tuesday.",
  "{anchorFp} from {name}. That's not a stat line. That's a receipt.",
  "+{fpDelta} over his average. That's not luck, that's somebody's nightmare.",
  "{achievementLabel} on {name}. The card knows. Now make your friends know.",
];

// ── Selection ────────────────────────────────────────────────────────────

export type InitiationBucket = "bad_beat" | "flex" | "statement" | "default" | "rare_pull";

export interface ChallengeInitiationArgs {
  /** Win tier of the hand (BUST | ROOKIE | STARTER | ALL_STAR | MVP | LEGEND). */
  winTier: string;
  /** Resolved roster — used to detect held R/O cards for bad_beat. */
  roster: Array<{ tier?: string; wasHeld?: boolean }>;
  /** Top-game tier of the star card from recordDetector, if any. */
  topGameTier?: "record" | "career" | "season" | null;
  /** The star card's display name (typically last name or first-last). */
  starName?: string | null;
  /** True when the star card's actualFp meaningfully exceeded projection
   *  OR the star landed a record/career topGame. Drives whether the
   *  culture-aware bank is eligible to fire. */
  starHadMeaningfulPerformance?: boolean;
  /** Set when the anchor card pulled a record / career-high / season top-10
   *  game. Routes the bucket selector to INITIATION_RARE_PULL, preempting
   *  flex. Maps 1:1 to topGameTier — separate field so callers explicitly
   *  opt into the rare_pull bank (some flex paths don't want the
   *  anchor-aware framing even when topGameTier is set). */
  starAchievementType?: "record" | "career" | "season" | null;
  /** Anchor card actualFp. Required for {anchorFp}-templated lines. */
  starAnchorFp?: number | null;
  /** Anchor card projectedFp. Required for {fpDelta}-templated lines —
   *  selector filters those lines when this is missing or
   *  (actualFp - projectedFp) ≤ 0. */
  starProjectedFp?: number | null;
}

/** Map a topGameTier value to the lowercase no-article achievement label
 *  the rare_pull templates expect. */
function achievementLabelFor(tier: "record" | "career" | "season"): string {
  if (tier === "record") return "new record";
  if (tier === "career") return "career high";
  return "season high";
}

/** Maps hand state to the appropriate initiation bucket. Mirrors the
 *  trigger evaluator rules (bad_beat requires 2+ HELD high-tier cards;
 *  flex covers ALL_STAR+ tiers + topGame record/career). rare_pull
 *  preempts everything when starAchievementType is set. */
function selectInitiationBucket(args: ChallengeInitiationArgs): InitiationBucket {
  if (args.starAchievementType) return "rare_pull";
  const tier = args.winTier;
  if (tier === "BUST" || tier === "ROOKIE") {
    const heldHigh = args.roster.filter(
      c => c.wasHeld === true && (c.tier === "RED" || c.tier === "ORANGE")
    ).length;
    if (heldHigh >= 2) return "bad_beat";
  }
  if (tier === "ALL_STAR" || tier === "MVP" || tier === "LEGEND") return "flex";
  if (args.topGameTier === "record" || args.topGameTier === "career") return "flex";
  if (tier === "STARTER") return "statement";
  return "default";
}

/** Local ring-buffer anti-repeat for chad initiation / resolution /
 *  trash-talk banks.
 *
 *  Earlier versions of pickWithAntiRepeat called shared/commentary/
 *  antiRepeat's scoreRepeatPenalty + recordUsage with a single-arg
 *  signature, but those functions require (lineId, archetype, tone,
 *  resolvedLine). Calling with one arg left resolvedLine undefined,
 *  and the internal extractOpeningPhrase(undefined).split() crashed
 *  the renderer the first time the path actually fired (on a rare_pull
 *  reveal once selectChallengeInitiation got wired into the prompt).
 *
 *  The shared antiRepeat module is built for the rich commentary
 *  archetype/tone system; chad banks have a different shape (no
 *  archetypes, no tones). A local 8-deep ring buffer keyed by line
 *  content is the right anti-repeat surface for these banks: simple,
 *  no cross-module coupling, no crash risk. */
const _recentChadLines: string[] = [];
const _CHAD_RECENT_WINDOW = 8;

/** Generic over T so the same ring buffer dedups string banks (BOTTOM-slot
 *  initiation, resolution, trash-talk) and Line banks (TOP-slot framing,
 *  bucket 2). Default keyFn = String preserves every existing string-bank
 *  call site. For Line[] banks, callers pass JSON.stringify so the dedup
 *  key reflects the structural bank line. Because tier substitution is
 *  done at render time (model-(b)), JSON.stringify on a bank line is
 *  stable across hands — the same authored line dedups consistently. */
function pickWithAntiRepeat<T>(bank: T[], keyFn: (item: T) => string = String): T {
  // Filter out lines used in the last N picks. If all bank lines were
  // recent (small bank, long session), fall through to the full pool so
  // we don't pin on a single line forever.
  const fresh = bank.filter(item => !_recentChadLines.includes(keyFn(item)));
  const pool = fresh.length > 0 ? fresh : bank;
  const pick = pool[Math.floor(Math.random() * pool.length)] ?? bank[0];
  _recentChadLines.push(keyFn(pick));
  while (_recentChadLines.length > _CHAD_RECENT_WINDOW) _recentChadLines.shift();
  return pick;
}

/** Filter INITIATION_RARE_PULL down to lines whose template variables are
 *  all renderable for this set of args. Lines using {fpDelta} are skipped
 *  when projectedFp is missing or the delta is ≤ 0 (rare_pull on a sub-
 *  par night doesn't read right with a "+0 over average" line). Lines
 *  using {anchorFp} are skipped when actualFp is missing — though that
 *  shouldn't happen when rare_pull is fired by upstream code, the filter
 *  defends the surface anyway. */
function rarePullCandidates(args: ChallengeInitiationArgs): string[] {
  const hasAnchorFp = typeof args.starAnchorFp === "number" && args.starAnchorFp > 0;
  const delta = (typeof args.starAnchorFp === "number" && typeof args.starProjectedFp === "number")
    ? args.starAnchorFp - args.starProjectedFp
    : null;
  const hasUsableDelta = delta !== null && delta > 0;
  return INITIATION_RARE_PULL.filter(line => {
    if (line.includes("{fpDelta}") && !hasUsableDelta) return false;
    if (line.includes("{anchorFp}") && !hasAnchorFp) return false;
    return true;
  });
}

/** Top-level: returns Chad's initiation line for the just-played hand.
 *  Routing precedence (highest first):
 *    1. rare_pull  — starAchievementType set (preempts all other buckets)
 *    2. culture-aware flex/bad_beat — starName + starHadMeaningfulPerformance
 *    3. generic bucket via selectInitiationBucket
 */
export function selectChallengeInitiation(args: ChallengeInitiationArgs): string {
  const bucket = selectInitiationBucket(args);

  // Rare-pull path: anchor-aware templated lines. Falls back to flex
  // culture-aware bank if anchor data is incomplete enough that no
  // RARE_PULL line is renderable.
  if (bucket === "rare_pull") {
    const candidates = rarePullCandidates(args);
    if (candidates.length > 0) {
      const raw = pickWithAntiRepeat(candidates);
      const delta = (typeof args.starAnchorFp === "number" && typeof args.starProjectedFp === "number")
        ? Math.round(args.starAnchorFp - args.starProjectedFp)
        : 0;
      const anchorFpStr = typeof args.starAnchorFp === "number" ? String(Math.round(args.starAnchorFp)) : "";
      const labelStr = args.starAchievementType ? achievementLabelFor(args.starAchievementType) : "";
      return raw
        .replace(/\{name\}/g, args.starName ?? "")
        .replace(/\{achievementLabel\}/g, labelStr)
        .replace(/\{anchorFp\}/g, anchorFpStr)
        .replace(/\{fpDelta\}/g, String(delta));
    }
    // No renderable rare_pull line (e.g., anchor data missing). Fall through
    // to flex so a generic culture-aware or generic-flex line still fires.
  }

  // Culture-aware path: only when star meaningfully performed + named.
  if (args.starName && args.starHadMeaningfulPerformance) {
    if (bucket === "flex" || bucket === "rare_pull") {
      return pickWithAntiRepeat(INITIATION_CULTURE_FLEX).replace(/\{name\}/g, args.starName);
    }
    if (bucket === "bad_beat") {
      return pickWithAntiRepeat(INITIATION_CULTURE_BAD_BEAT).replace(/\{name\}/g, args.starName);
    }
  }

  switch (bucket) {
    case "rare_pull": return pickWithAntiRepeat(INITIATION_FLEX); // final fallback
    case "bad_beat":  return pickWithAntiRepeat(INITIATION_BAD_BEAT);
    case "flex":      return pickWithAntiRepeat(INITIATION_FLEX);
    case "statement": return pickWithAntiRepeat(INITIATION_STATEMENT);
    case "default":   return pickWithAntiRepeat(INITIATION_DEFAULT);
  }
}

/** Expose bank arrays for testing / preview. */
export function chadInitiationBank(bucket: InitiationBucket): string[] {
  switch (bucket) {
    case "rare_pull": return [...INITIATION_RARE_PULL];
    case "bad_beat":  return [...INITIATION_BAD_BEAT];
    case "flex":      return [...INITIATION_FLEX];
    case "statement": return [...INITIATION_STATEMENT];
    case "default":   return [...INITIATION_DEFAULT];
  }
}

// ── TOP-slot framing banks (bucket 2 — S1 slot-split restoration) ────────
//
// Hand-celebration copy for the TOP slot of the post-reveal screen when
// a challenge surface is firing. Mirrors the trigger taxonomy of the
// challenge-trigger system. Each bank line is a Line (array of LinePart)
// so inline trigger stamps render as DEAL/DRAW-style chips mid-sentence.
//
// CRITICAL — slot semantics (S1 LOCKED rules):
//   - TOP slot is about the user's HAND and the TRIGGER EVENT that made
//     it shareable. Never references the friend or the send action.
//   - BOTTOM slot (selectChallengeInitiation above) owns push-to-send copy.
//
// Sub-bank structure (bucket 2 Q1.1 + Q1.2 LOCKED 2026-05-24, smoke
// revisions 2026-05-24 evening):
//   TOP_BAD_BEAT_HELD_ONE       — bad_beat, heldCount === 1, low-tier outcome
//   TOP_BAD_BEAT_HELD_TWO_PLUS  — bad_beat, heldCount >= 2, low-tier outcome
//   TOP_BAD_BEAT_NO_HOLDS       — bad_beat, heldCount === 0 (or fallback when
//                                  HELD banks are tier-gated out)
//   TOP_MISS                    — miss (any tier missed)
//   TOP_BIG_SCORE               — big_score trigger (renders win_tier stamp)
//   TOP_RARE_PULL_RECORD        — rare_pull, topGameTier=record
//   TOP_RARE_PULL_CAREER        — rare_pull, topGameTier=career
//   TOP_RARE_PULL_SEASON        — rare_pull, topGameTier=season (uses {statLabel})
//   TOP_DEFAULT                 — unreachable per GameView gate (see comment at def)
//
// Substitution tokens (resolved by selector at selection time):
//   {starName}    — anchor card's last name (or first-last); used by
//                   HELD_ONE / NO_HOLDS and other non-2+-held banks
//   {starName1}   — first held player (anchor-priority, then FP-desc);
//                   used by HELD_TWO_PLUS only
//   {starName2}   — second held player; used by HELD_TWO_PLUS only
//   {winTierLow}  — title-case winTier ("Rookie", "Starter", "Bust");
//                   used by HELD_ONE / HELD_TWO_PLUS / NO_HOLDS to
//                   contrast premium picks with the low outcome
//   {statLabel}   — conversational form of TopGameReason.category for SEASON
//   "{missTier}"  — sentinel in StampToken.tier for miss
//   "{winTier}"   — sentinel in StampToken.tier for win_tier

const TOP_BAD_BEAT_HELD_ONE: Line[] = [
  ["You held {starName} as your conviction pick and walked away with a {winTierLow} scrape — ", { stamp: "bad_beat" }, " — that's a bad beat if I've ever seen one."],
  ["Premium pick on {starName}, premium result not in the cards — ", { stamp: "bad_beat" }, " — call it what it is."],
  ["You held {starName} expecting a real night and got the kind that pays in coupons — ", { stamp: "bad_beat" }, " — textbook bad beat."],
  ["{starName} on your held card. {winTierLow} on the scoreboard. ", { stamp: "bad_beat" }, ". That's the definition."],
  ["You doubled down on {starName} and the conviction came back as a flat stat line — ", { stamp: "bad_beat" }, " — that's the textbook one."],
  ["You held {starName} expecting fireworks and got a sparkler — ", { stamp: "bad_beat" }, " — bad beat with a capital B."],
  [{ stamp: "bad_beat" }, ". You held {starName} as your big play and he came in like the deep bench."],
  ["A {winTierLow} hand off a held card on {starName}. ", { stamp: "bad_beat" }, ". Pure bad beat."],
  ["{starName} on the held card, lineup couldn't lift it — ", { stamp: "bad_beat" }, " — what else do you call it."],
  ["You read it. You held {starName}. {starName} held, result didn't read the script. ", { stamp: "bad_beat" }, ". Bad beat."],
];

const TOP_BAD_BEAT_HELD_TWO_PLUS: Line[] = [
  ["You counted on {starName1} and {starName2}, and walked away with a {winTierLow} scrape — ", { stamp: "bad_beat" }, " — that's a bad beat if I've ever seen one."],
  ["You stacked {starName1} and {starName2} and they delivered the kind of night that pays in coupons — ", { stamp: "bad_beat" }, " — textbook bad beat."],
  ["You held {starName1} and {starName2} expecting fireworks and got a sparkler — ", { stamp: "bad_beat" }, " — call it what it is."],
  ["{starName1} and {starName2} on your held cards, {winTierLow} on the scoreboard. ", { stamp: "bad_beat" }, "."],
  ["You doubled down on {starName1} and {starName2} and the {winTierLow} came in anyway — ", { stamp: "bad_beat" }, " — that's the textbook one."],
  [{ stamp: "bad_beat" }, ". You counted on {starName1} AND {starName2} and the lineup still came in like role players."],
  ["Premium picks on {starName1} and {starName2}, premium result not in the cards — ", { stamp: "bad_beat" }, " — what else do you call it."],
  ["A {winTierLow} hand off held cards on {starName1} and {starName2}. ", { stamp: "bad_beat" }, ". That's the definition."],
  ["{starName1} and {starName2} on the held cards, lineup couldn't lift it — ", { stamp: "bad_beat" }, " — bad beat with a capital B."],
  ["You read it. You held it. {starName1} and {starName2} held, result didn't read the script. ", { stamp: "bad_beat" }, ". Pure bad beat."],
];

const TOP_BAD_BEAT_NO_HOLDS: Line[] = [
  ["You drew {starName} as your big play and walked away with a {winTierLow} scrape — ", { stamp: "bad_beat" }, " — that's a bad beat if I've ever seen one."],
  ["Premium pick on {starName}, premium disappointment from him — ", { stamp: "bad_beat" }, " — call it what it is."],
  ["You drew the right names for the right slate and the right names had the wrong night — ", { stamp: "bad_beat" }, " — textbook bad beat."],
  ["{starName} as your headline. {winTierLow} as your finish. ", { stamp: "bad_beat" }, ". That's the definition."],
  ["You built this lineup around {starName} and {starName} forgot what he was here for — ", { stamp: "bad_beat" }, " — that's the textbook one."],
  ["You drew {starName} expecting fireworks and got a sparkler — ", { stamp: "bad_beat" }, " — bad beat with a capital B."],
  [{ stamp: "bad_beat" }, ". You drew {starName} as your big play and he came in like the deep bench."],
  ["A {winTierLow} hand off a lineup that looked like a winner on paper. ", { stamp: "bad_beat" }, ". Pure bad beat."],
  ["Stars on paper, role players on the floor — the whole lineup ghosted you — ", { stamp: "bad_beat" }, " — what else do you call it."],
  ["You read the slate. You picked the right names. The right names didn't read the script. ", { stamp: "bad_beat" }, ". Bad beat."],
];

const TOP_MISS: Line[] = [
  ["{starName} got you close — ", { stamp: "miss", tier: "{missTier}" }, " — couple more buckets and you're in a different tier."],
  ["Right names, right night, just a few points short of where this was going. ", { stamp: "miss", tier: "{missTier}" }, "."],
  ["{starName} did his part. The math came up a hair shy — ", { stamp: "miss", tier: "{missTier}" }, " — that's how thin the line is."],
  ["You were one possession away from a different conversation. ", { stamp: "miss", tier: "{missTier}" }, "."],
  ["{starName} carried this thing right up to the door — ", { stamp: "miss", tier: "{missTier}" }, " — door didn't open."],
  [{ stamp: "miss", tier: "{missTier}" }, ". {starName} got you to the edge and the edge held."],
  ["Three or four plays from a totally different night — ", { stamp: "miss", tier: "{missTier}" }, " — that's the cruelty of the cut line."],
  ["{starName} brought enough for almost the whole climb. ", { stamp: "miss", tier: "{missTier}" }, "."],
  ["You felt this one bumping the next tier all the way through — ", { stamp: "miss", tier: "{missTier}" }, " — fell back to earth at the buzzer."],
  ["Same effort, same picks, six more points: completely different story. ", { stamp: "miss", tier: "{missTier}" }, "."],
];

const TOP_BIG_SCORE: Line[] = [
  ["{starName} cooked, and you were sitting at the table with a knife and fork — ", { stamp: "win_tier", tier: "{winTier}" }, " — read of the night."],
  ["{starName} dropped an absolute number on these guys and you saw it coming — ", { stamp: "win_tier", tier: "{winTier}" }, " — that's the call."],
  ["{starName} took the whole game by the collar and you were riding shotgun — ", { stamp: "win_tier", tier: "{winTier}" }, " — you called this one."],
  ["You stacked the right names and the right names brought the whole circus. ", { stamp: "win_tier", tier: "{winTier}" }, "."],
  ["{starName} torched the entire opposing lineup tonight — ", { stamp: "win_tier", tier: "{winTier}" }, " — you saw this coming a mile out."],
  [{ stamp: "win_tier", tier: "{winTier}" }, ". {starName} went absolutely nuclear and you were holding the detonator."],
  ["Top to bottom, the lineup ran it back like they owed you money — ", { stamp: "win_tier", tier: "{winTier}" }, " — pure read."],
  ["{starName} put up the kind of stat line you screenshot. You were on it. ", { stamp: "win_tier", tier: "{winTier}" }, "."],
  ["{starName} ate, and the whole roster ate after him — ", { stamp: "win_tier", tier: "{winTier}" }, " — buffet-line read."],
  ["You looked at the slate, you picked the heater, the heater turned the building into a sauna. ", { stamp: "win_tier", tier: "{winTier}" }, "."],
];

const TOP_RARE_PULL_RECORD: Line[] = [
  ["{starName} carved his name into the record book tonight — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — you didn't pick the game, you picked history."],
  ["{starName} just put up a game the league will be talking about for decades — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — and you were holding the ticket."],
  ["You just watched {starName} do something the rest of the league has never done — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — that's not luck, that's the read."],
  ["{starName} hung a number on the league tonight that nobody alive has matched. You called it. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
  ["{starName} dropped one of the games they'll cut highlight reels around — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — you were in the right seat for it."],
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, ". {starName} just made the record book and you handed him the pen."],
  ["{starName} put together an all-time individual performance and you were the one stacking him — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — pure read."],
  ["You picked the right night to back the right player. The record book agreed. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
  ["{starName} did something on the floor tonight that lives in the history of the league — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — read of the year."],
  ["{starName} just produced a stat line that goes in a museum somewhere. You owned it. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
];

const TOP_RARE_PULL_CAREER: Line[] = [
  ["{starName} just played the best game of his entire career and you had him locked in — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — that's a read."],
  ["{starName} set a new personal high tonight and you were the one cashing on it — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — read of the season."],
  ["{starName} just outdid every version of himself that came before — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — and you saw it coming."],
  ["Years in the league and tonight was the one he'll tell his grandkids about. You called it. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
  ["{starName} ran into his own ceiling tonight and put a hole in it — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — pure read."],
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, ". {starName} just rewrote his own best and you were the one who knew tonight was the night."],
  ["{starName} has been chasing this number his whole career. Tonight it caught him — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — and you were riding shotgun."],
  ["You picked {starName} on the night he topped his own number. Stamp it. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
  ["{starName} showed up as the best version of himself you've ever seen on tape — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — and you were already there."],
  ["{starName} has played hundreds of games. None of them looked like tonight. You called it. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
];

const TOP_RARE_PULL_SEASON: Line[] = [
  ["{starName} put together one of the best {statLabel} performances of the season tonight. You picked him. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
  ["{starName} just had one of the highest {statLabel} nights of the entire season and you were stacked behind him — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — that's a read."],
  ["{starName} just dropped one of the biggest {statLabel} games anyone's put up this year — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — you called it."],
  ["{starName} produced one of the best {statLabel} games the league has seen all year. You were on it. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
  ["You picked the right night to back the right player and the {statLabel} backed it up — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — pure read."],
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, ". {starName} just had one of the bigger {statLabel} games anyone has put up this season and you saw it coming."],
  ["{starName} delivered a {statLabel} performance almost nobody in the league has matched this year — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — read of the month."],
  ["{starName} put up {statLabel} numbers that rank with the best of the season. You called it. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
  ["{starName} just had one of the best {statLabel} nights the league has seen this year and you had him locked in — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — that's the call."],
  ["You picked {starName} on the night he put up one of the biggest {statLabel} games of the season. Stamp it. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, "."],
];

// UNREACHABLE per GameView L1330 trigger-override gate
// (`challengeTrigger.trigger !== "default"` filters default-trigger hands
// out before the TOP-slot framing call). Bank retained for shape
// consistency with the trigger union; placeholder copy left in place
// from 4bd0c89 — real copy not drafted per Bucket 2 Q1.3 LOCKED
// 2026-05-24. Future routing change that sends default-trigger hands to
// the TOP slot would require drafting real copy here.
const TOP_DEFAULT: Line[] = [
  ["TOP_DEFAULT placeholder 1. Played the hand."],
  ["TOP_DEFAULT placeholder 2. The slate gave you a line."],
  ["TOP_DEFAULT placeholder 3. Solid hand on the books."],
];

/** Raw stat-key → conversational label mapping. Keys are the authoritative
 *  category values that land in TopGameReason.category, sourced from:
 *    - basketball/public/data/topGames.json (season tier — verified
 *      enumeration: pts, reb, ast, stl, blk + composite/flag forms)
 *    - basketball SportAdapter careerCategories (career tier: pts, reb,
 *      ast, threes)
 *    - shared/data/nbaRecords.ts NBA_SINGLE_GAME_RECORDS (record tier:
 *      pts, ast, reb, stl, blk, threes, turnovers)
 *  Bucket 2 Q3.1 LOCKED 2026-05-24. */
export const STAT_LABEL_MAP: Record<string, string> = {
  // Stat-typed reasons (preferred — extractStatLabel walks allReasons
  // and prefers these over composite/flag siblings when both exist)
  pts:       "scoring",
  reb:       "rebounding",
  ast:       "passing",
  stl:       "steals",
  blk:       "blocks",
  threes:    "3-point shooting",
  // rare_pull on turnovers is data-permissible but reads ironically;
  // left intentional pending feature-polish review.
  turnovers: "turnovers",
  // Composite/flag fallbacks — used only when no stat-typed reason
  // exists in allReasons (pure five_by_five / td_X_Y_Z games with no
  // per-stat top-10 ranking that hand).
  fifty_plus_game: "scoring",
  five_by_five:    "all-around",
  td_30_20_20:     "triple-double",
  td_60_10_10:     "scoring",
};

/** Walk allReasons preferring a stat-typed reason (rank defined) over a
 *  composite/flag reason (no rank), then map its category through
 *  STAT_LABEL_MAP. Returns null when no reasons exist or all categories
 *  are unmapped. */
export function extractStatLabel(
  topGame: { primaryReason: TopGameReason | null; allReasons: TopGameReason[] | null } | null,
): string | null {
  if (!topGame) return null;
  const all = topGame.allReasons ?? (topGame.primaryReason ? [topGame.primaryReason] : []);
  if (all.length === 0) return null;
  // Prefer stat-typed (rank defined). Fall through to first available.
  const preferred = all.find(r => typeof r.rank === "number") ?? all[0];
  const label = STAT_LABEL_MAP[preferred.category];
  return label ?? null;
}

/** Title-case formatter for {winTierLow} substitution into BAD_BEAT
 *  bank lines (e.g. `ROOKIE → "Rookie"`, `ALL_STAR → "All Star"`).
 *  Distinct from formatTier() at the renderer (which uppercases for
 *  stamp-chip display); this lives at the selector for in-line prose
 *  use. Bucket 2 piece B smoke revision 2026-05-24. */
function formatWinTierLow(t: string | undefined | null): string {
  if (!t) return "";
  return t
    .split("_")
    .map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

export type TopSlotTrigger = "bad_beat" | "miss" | "big_score" | "rare_pull" | "default";

export interface TopSlotFramingArgs {
  /** The fired trigger from the challenge-trigger evaluator. */
  trigger: TopSlotTrigger;
  /** Resolved roster — used to count held cards for bad_beat routing
   *  (Q1.1 + 2026-05-24 smoke split: HELD_ONE / HELD_TWO_PLUS /
   *  NO_HOLDS). */
  roster: Array<{ tier?: string; wasHeld?: boolean }>;
  /** rare_pull only — routes RECORD / CAREER / SEASON sub-banks
   *  (Q1.2). Mirrors triggerResult.topGameTier. */
  starAchievementType?: "record" | "career" | "season" | null;
  /** Anchor card display name (typically last name or first-last) for
   *  `{starName}` substitution. Used by HELD_ONE / NO_HOLDS / MISS /
   *  RARE_PULL_* / BIG_SCORE banks. When null, lines containing
   *  `{starName}` still substitute the empty string. */
  starName?: string | null;
  /** First held-card name for `{starName1}` substitution. Used by
   *  TOP_BAD_BEAT_HELD_TWO_PLUS only. Caller computes per the
   *  anchor-priority + FP-descending rule:
   *  if anchor is in the held set, anchor → starName1; otherwise the
   *  highest-FP held card → starName1. Bucket 2 smoke revision
   *  2026-05-24. */
  starName1?: string | null;
  /** Second held-card name for `{starName2}` substitution. Used by
   *  TOP_BAD_BEAT_HELD_TWO_PLUS only. Caller computes per the same
   *  rule: the next highest-FP held card (excluding the one already
   *  used as starName1). */
  starName2?: string | null;
  /** Resolved hand winTier. Drives:
   *   - tier-gate filter for HELD_ONE / HELD_TWO_PLUS (these banks
   *     only fire on BUST/ROOKIE/STARTER; ALL_STAR+ routes to
   *     NO_HOLDS so the {winTierLow}-bearing copy doesn't read
   *     contradictorily on a big-tier "bad beat").
   *   - `{winTierLow}` substitution into BAD_BEAT bank lines.
   *   - `tier: "{winTier}"` sentinel substitution into win_tier
   *     StampTokens (TOP_BIG_SCORE).
   *  Bucket 2 smoke revision 2026-05-24. */
  winTier?: WinTier | null;
  /** Which tier was missed (miss only). Sentinel substitution for
   *  `tier: "{missTier}"` on MISS bank lines. Display-formatted in the
   *  StampToken (underscore → space) by the renderer. */
  missTier?: string | null;
  /** rare_pull only — TopGameReason data for {statLabel} extraction on
   *  the SEASON sub-bank. Combined shape mirrors TopGameResult. When
   *  null on a SEASON-tier call, selector logs warn and falls back to
   *  the RECORD bank per Q3.1 fallback spec. */
  topGame?: { primaryReason: TopGameReason | null; allReasons: TopGameReason[] | null } | null;
}

/** Pick a hand-celebration line for the TOP slot of the post-reveal
 *  screen. Returns a Line (parts array) — strings render through
 *  Typewriter at the call-site, StampToken parts render as inline
 *  DEAL/DRAW-style chips.
 *
 *  Substitution happens at selection time AFTER anti-repeat dedup
 *  (which keys on the raw bank line via JSON.stringify):
 *   - String parts: `{starName}`, `{starName1}`, `{starName2}`,
 *     `{statLabel}`, `{winTierLow}`.
 *   - StampToken parts: `tier: "{missTier}"` or `tier: "{winTier}"`
 *     sentinels.
 *  Selector substitution mirrors how selectChallengeInitiation
 *  substitutes `{name}` / `{anchorFp}` etc. */
export function selectTopSlotFraming(args: TopSlotFramingArgs): Line {
  // Routing: pick the sub-bank for the trigger (+ qualifiers for splits).
  let bank: Line[];
  let resolvedAchievementType = args.starAchievementType ?? null;

  switch (args.trigger) {
    case "bad_beat": {
      const heldCount = args.roster.filter(c => c.wasHeld === true).length;
      // Tier-gate filter: HELD_ONE / HELD_TWO_PLUS banks lean on the
      // {winTierLow} contrast ("premium picks, {winTierLow} scrape").
      // The mechanic breaks if a bad_beat hand also cleared ALL_STAR+
      // — at higher tiers, the NO_HOLDS bank's "right pick, wrong
      // night" framing reads cleaner. Defensive: the trigger evaluator
      // currently only fires bad_beat on BUST/ROOKIE, so this gate
      // only matters if firing conditions ever loosen.
      const isLowTier = args.winTier === "BUST" || args.winTier === "ROOKIE" || args.winTier === "STARTER";
      if (heldCount === 0 || !isLowTier) {
        bank = TOP_BAD_BEAT_NO_HOLDS;
      } else if (heldCount === 1) {
        bank = TOP_BAD_BEAT_HELD_ONE;
      } else {
        bank = TOP_BAD_BEAT_HELD_TWO_PLUS;
      }
      break;
    }
    case "miss":
      bank = TOP_MISS;
      break;
    case "big_score":
      bank = TOP_BIG_SCORE;
      break;
    case "rare_pull": {
      if (resolvedAchievementType === "record") bank = TOP_RARE_PULL_RECORD;
      else if (resolvedAchievementType === "career") bank = TOP_RARE_PULL_CAREER;
      else if (resolvedAchievementType === "season") {
        // SEASON requires statLabel. If null (topGame missing or
        // category unmapped), log warn and fall back to RECORD bank
        // per Q3.1 spec — closest texturally; better than placeholder.
        const statLabel = extractStatLabel(args.topGame ?? null);
        if (!statLabel) {
          // eslint-disable-next-line no-console
          console.warn(
            "[selectTopSlotFraming] rare_pull season trigger fired without statLabel; " +
            "trigger eval may not be propagating TopGameReason. Falling back to RECORD bank.",
            { topGame: args.topGame ?? null }
          );
          bank = TOP_RARE_PULL_RECORD;
          resolvedAchievementType = "record"; // for downstream consistency
        } else {
          bank = TOP_RARE_PULL_SEASON;
        }
      } else {
        // rare_pull fired but no topGameTier supplied — shouldn't happen
        // through GameView path, but defend the surface. Use RECORD as
        // safe default texturally.
        bank = TOP_RARE_PULL_RECORD;
      }
      break;
    }
    case "default":
      bank = TOP_DEFAULT;
      break;
  }

  // Anti-repeat dedups on the raw bank line (pre-substitution) so the
  // ring buffer reflects bank shape, not per-hand substituted values.
  const raw = pickWithAntiRepeat(bank, line => JSON.stringify(line));

  // Substitute {starName} / {statLabel} / {winTierLow} / etc. in
  // string parts, and replace tier sentinels in StampToken parts.
  // Build statLabel once here so both the bank-routing path above
  // (SEASON branch) and substitution path use the same extracted value.
  const statLabel = args.trigger === "rare_pull" && resolvedAchievementType === "season"
    ? extractStatLabel(args.topGame ?? null)
    : null;

  return substituteLine(raw, {
    starName: args.starName ?? "",
    starName1: args.starName1 ?? "",
    starName2: args.starName2 ?? "",
    statLabel: statLabel ?? "",
    missTier: args.missTier ?? "",
    winTier: args.winTier ?? "",
    winTierLow: formatWinTierLow(args.winTier),
    rarePullTier: args.starAchievementType ?? "",
  });
}

interface LineSubstitutions {
  starName: string;
  starName1: string;
  starName2: string;
  statLabel: string;
  missTier: string;
  winTier: string;
  winTierLow: string;
  rarePullTier: string;
}

/** Substitute tokens into each LinePart. Strings: `{starName}`,
 *  `{starName1}`, `{starName2}`, `{statLabel}`, `{winTierLow}`
 *  (global replace). StampTokens: `tier: "{missTier}"` and
 *  `tier: "{winTier}"` sentinels → actual values (or stripped to
 *  undefined when empty, so renderer falls back to context lookup).
 *
 *  Ordering note: `{starName}` regex is `\{starName\}` which won't
 *  match `{starName1}` or `{starName2}` (the trailing digits prevent
 *  match). Substitutions are mutually non-overlapping; order
 *  doesn't matter. */
function substituteLine(line: Line, subs: LineSubstitutions): Line {
  return line.map((part): LinePart => {
    if (typeof part === "string") {
      return part
        .replace(/\{starName1\}/g, subs.starName1)
        .replace(/\{starName2\}/g, subs.starName2)
        .replace(/\{starName\}/g, subs.starName)
        .replace(/\{statLabel\}/g, subs.statLabel)
        .replace(/\{winTierLow\}/g, subs.winTierLow);
    }
    // StampToken: handle tier sentinel substitution.
    if (part.tier === "{missTier}") {
      if (subs.missTier) return { stamp: part.stamp, tier: subs.missTier };
      // Strip the sentinel so renderer falls back to missTier prop.
      return { stamp: part.stamp };
    }
    if (part.tier === "{winTier}") {
      if (subs.winTier) return { stamp: part.stamp, tier: subs.winTier };
      // Strip the sentinel so renderer falls back to winTier prop.
      return { stamp: part.stamp };
    }
    if (part.tier === "{rarePullTier}") {
      if (subs.rarePullTier) return { stamp: part.stamp, tier: subs.rarePullTier };
      // Strip the sentinel; renderer falls back to base "RARE PULL" label.
      return { stamp: part.stamp };
    }
    return part;
  });
}

/** Expose bank arrays for testing / preview. */
export type TopSlotBankKey =
  | "bad_beat_held_one" | "bad_beat_held_two_plus" | "bad_beat_no_holds"
  | "miss" | "big_score"
  | "rare_pull_record" | "rare_pull_career" | "rare_pull_season"
  | "default";

export function topSlotFramingBank(key: TopSlotBankKey): Line[] {
  const bank = (() => {
    switch (key) {
      case "bad_beat_held_one":      return TOP_BAD_BEAT_HELD_ONE;
      case "bad_beat_held_two_plus": return TOP_BAD_BEAT_HELD_TWO_PLUS;
      case "bad_beat_no_holds":      return TOP_BAD_BEAT_NO_HOLDS;
      case "miss":                   return TOP_MISS;
      case "big_score":              return TOP_BIG_SCORE;
      case "rare_pull_record":       return TOP_RARE_PULL_RECORD;
      case "rare_pull_career":       return TOP_RARE_PULL_CAREER;
      case "rare_pull_season":       return TOP_RARE_PULL_SEASON;
      case "default":                return TOP_DEFAULT;
    }
  })();
  return bank.map(line => [...line]);
}

// ── Challenge resolution — Chad's verdict to the recipient ────────────────
//
// Fires after the recipient finishes their attempt at the slate and the
// ChallengeComparisonScreen reveals the gap. Voice: directly to the
// recipient about THEIR result vs the original poster's hand.
//
// 5 outcome buckets, signed delta = recipientFp − posterFp:
//   delta ≥ 15            → you_won_big
//   1  < delta < 15       → you_won_narrow
//   |delta| ≤ 1           → photo_finish
//   -15 < delta < -1      → you_lost_narrow
//   delta ≤ -15           → you_lost_big
//
// Two flavors per bucket:
//   tactical     — comments on the gap, math, or build choices
//   personality  — comments on the social/relationship dynamic; requires
//                  posterName to interpolate (else fall back to tactical)
//
// Template tokens substituted at output time:
//   {name}  → poster's display name
//   {delta} → absolute FP gap (integer)

const RES_YOU_WON_BIG_TACTICAL: string[] = [
  "Ran them off the floor by {delta}. Different builds, same slate — yours hit harder.",
  "Cooked them by {delta}. The same names, a sharper hand.",
  "{delta}-point gap doesn't come from luck. You read the room better.",
  "Crushed by {delta}. That's the kind of margin people screenshot.",
  "Slate said it was possible. You said yes by {delta}.",
  "You found {delta} extra points in cards they had access to. That's the whole game.",
  "Math says decisive. Decisive says {delta}.",
  "{delta} points means the holds and the swings all hit. Clean execution.",
];

const RES_YOU_WON_BIG_PERSONALITY: string[] = [
  "{name}'s gonna feel that one. Run it back when they're ready to try again.",
  "{name} just got a basketball reality check. Send it back, twist the knife.",
  "Put {name} in the dirt by {delta}. Don't be modest about it.",
  "{name} sent you a challenge. You sent them a lesson.",
  "Hand back to {name} — let them carry the {delta}-point bruise around for a day.",
  "{name} thought this was competitive. You corrected that assumption.",
  "{name} just learned what your hand looks like on a good night.",
  "Hope {name} is sitting down. {delta} is not a polite margin.",
];

const RES_YOU_WON_NARROW_TACTICAL: string[] = [
  "By {delta}. One different decision and it flips — that's the line you walked.",
  "Won by {delta}. Tight, but math doesn't grade on style.",
  "{delta}-point margin. The slate is honest; you were honester.",
  "Squeaked it by {delta}. Two cards swung the whole hand.",
  "Closer than the screen makes it look — {delta} is real but fragile.",
  "Your build edged theirs by {delta}. Single-game variance kind of margin.",
  "Pulled it off by {delta}. Don't bank on the rematch being this kind.",
  "Math says win. Math also says it was close. Take the W.",
];

const RES_YOU_WON_NARROW_PERSONALITY: string[] = [
  "{name} kept it close. You kept it closer.",
  "Beat {name} by a sneeze ({delta} points). They'll demand a rematch — give them one.",
  "{name} is allowed to be salty. You're allowed to be smug.",
  "Tight one against {name}. Send it back before they cool off.",
  "{name} brought a fight. You brought one more point. Or {delta}.",
  "{name} didn't lose. {name} just didn't win.",
  "Edge against {name}. Make them earn the rematch.",
  "{name} can claim it was close. The leaderboard doesn't care.",
];

// Photo finish — split by sign so +1 (very narrow win) and -1 (very narrow
// loss) get emotionally distinct copy. True ties (|delta| < 0.05, which
// catches delta=0 and float-rounding noise from FP-component sums) keep
// the neutral tie banks.

const RES_PHOTO_FINISH_TIE_TACTICAL: string[] = [
  "Within a free throw. Both hands were honest — the slate cooperated with both of you.",
  "Photo finish. The math couldn't separate you, neither could the slate.",
  "Dead even in real terms. {delta} point gap is rounding error.",
  "Tied in spirit. You both played the same cards the same well.",
  "If this had a longer slate, somebody would be embarrassed. Today, neither of you is.",
  "Same hand, same answer. Run a different slate to settle it.",
  "Inside the noise. Take the photo, don't bet on the rematch.",
  "Slate handed out two clean lines. Coin flip would've called the same shot.",
];

const RES_PHOTO_FINISH_TIE_PERSONALITY: string[] = [
  "{name} and you read the slate identically. Run it again on different cards.",
  "{name} is mad about a tie. So are you.",
  "Bragging rights are off the table. Send {name} the slate again and break the tie.",
  "Inside the margin against {name}. The next one decides it.",
  "{name} is going to want a rematch on a different slate. Give them one.",
  "Tie days against {name} are the worst days. Settle it tomorrow.",
  "{name} and you cancel out. The slate had no opinion.",
];

const RES_PHOTO_FINISH_WIN_TACTICAL: string[] = [
  "Edged it by {delta}. The closest you can get and still win.",
  "Won by less than a possession. Take the W; don't ask questions.",
  "Stuck the landing by {delta} — smaller than a free throw, bigger than zero.",
  "Smallest legal margin. The slate said no, the column said yes.",
  "Photo finish, but you're in the photo. Don't squint at the margin.",
  "Squeaked past by {delta} — the kind of win that makes the rematch feel mandatory.",
  "Took it by a sneeze. Don't sit on it.",
  "Won by a {delta}-point bounce. Bank it; run it back.",
];

const RES_PHOTO_FINISH_WIN_PERSONALITY: string[] = [
  "{name} ran it perfect. You ran it perfect-er. Barely.",
  "{name} got walked off by one possession. Salt the wound politely.",
  "By a fingernail. {name} will say it was lucky — and it was. So what.",
  "{name} can complain. The column still says you won.",
  "Edged {name} by {delta} — they'll ask for a rematch, give them one.",
  "{name} brought it to the wire. You brought it across the wire first.",
  "{name} is one breath from tying you. Don't let them get a second breath.",
  "Took {name} down by less than a possession. Hand back; let them stew.",
];

const RES_PHOTO_FINISH_LOSS_TACTICAL: string[] = [
  "Lost by {delta}. The slate was right there — one card away from flipping it.",
  "Off by less than a possession. The kind of loss that haunts you.",
  "{delta} short. Single-card swing and you walk away with the W.",
  "Photo finish, wrong side of it. Painful but recoverable.",
  "Down to the wire, down by a hair. {delta} is the worst margin to lose by.",
  "Closer than the score column makes it look — but losing is losing.",
  "Inside the noise, on the wrong side. Sharper reads next slate.",
  "Lost by {delta}. A different swap wins the next one.",
];

const RES_PHOTO_FINISH_LOSS_PERSONALITY: string[] = [
  "{name} got it by less than a possession. They'll never let you forget — pre-empt them.",
  "Down by a fingernail to {name}. The right kind of mad to fuel a rematch.",
  "{name} won this one by literally nothing. Win the next one by literally something.",
  "{name} edged you by {delta}. Coin flip plus one for them; plus one for you next time.",
  "{name} got the slimmer side of a coin flip. Recover faster than they can brag.",
  "Lost to {name} by a sneeze. Rematch them while their guard is down.",
  "{name} took the photo finish. You take the next one.",
];

const RES_YOU_LOST_NARROW_TACTICAL: string[] = [
  "Cost yourself {delta}. Read the slate one more time tomorrow.",
  "Lost by {delta}. One different swap and it's a different story.",
  "{delta} points off. That's a single-card miss. Find it.",
  "Slate had answers; you found most of them. Not all.",
  "Closer than the trophy makes it look — but losing is losing.",
  "Down {delta}. The hand was right; the timing wasn't.",
  "Margin of {delta}. Two more correct holds, totally different night.",
  "Build was honest. Execution was almost. Almost gets you {delta} short.",
];

const RES_YOU_LOST_NARROW_PERSONALITY: string[] = [
  "{name} had one decision you didn't. Send a rebuttal.",
  "Down to {name} by {delta}. Petty rematch is the only correct response.",
  "{name} won this one. Don't let them think it's a pattern.",
  "Margin of {delta} to {name}. You owe them — and yourself — a comeback.",
  "{name} will remind you about this for a week. Quiet them next slate.",
  "Lost to {name} by a possession. That's the kind of loss that compounds if you let it.",
  "{name} earned this round. Take the slate they sent — give one back.",
  "{name} is celebrating {delta} points. Make tomorrow's hand louder.",
];

const RES_YOU_LOST_BIG_TACTICAL: string[] = [
  "Cooked by {delta}. The slate had answers; you missed them.",
  "Down {delta}. The build never had a chance — wrong reads at the wrong tier.",
  "{delta}-point gap is structural. Not a miss — a mismatch.",
  "Slate said try this. You tried that. {delta} points apart.",
  "Lost by {delta}. The math wasn't unfair; the choices were.",
  "Decisive loss. {delta} doesn't lie. Take it as data.",
  "Margin of {delta} means the hand wasn't close at any point.",
  "{delta} points down. Different slate next time, different lessons.",
];

const RES_YOU_LOST_BIG_PERSONALITY: string[] = [
  "{name} is texting about it. Owe them a rematch.",
  "Took {delta} from {name}. Don't pretend it didn't sting.",
  "{name} cooked you. Send a new slate; don't send a peace offering.",
  "{name} will dine on this one for a week. Earn back the next night.",
  "Lost to {name} by {delta}. The only correct move is petty.",
  "{name} just bought themselves bragging rights. You can repossess them tomorrow.",
  "{name} put {delta} on you. Frame the receipt — you'll need the motivation.",
  "{name} got the better of you. Run it back; don't dwell.",
];

// ── Selection ────────────────────────────────────────────────────────────

export type ResolutionOutcome =
  | "you_won_big"
  | "you_won_narrow"
  | "photo_finish_win"
  | "photo_finish_tie"
  | "photo_finish_loss"
  | "you_lost_narrow"
  | "you_lost_big";

export type ResolutionFlavor = "tactical" | "personality";

export interface ChallengeResolutionArgs {
  /** Recipient's hand FP. */
  myScore: number;
  /** Original poster's hand FP. */
  posterScore: number;
  /** Original poster's display name, if known. Required for personality flavor. */
  posterName?: string | null;
  /** Force flavor selection (for testing). Default: random when posterName set. */
  forceFlavor?: ResolutionFlavor;
}

const RESOLUTION_BANKS: Record<ResolutionOutcome, Record<ResolutionFlavor, string[]>> = {
  you_won_big:       { tactical: RES_YOU_WON_BIG_TACTICAL,       personality: RES_YOU_WON_BIG_PERSONALITY },
  you_won_narrow:    { tactical: RES_YOU_WON_NARROW_TACTICAL,    personality: RES_YOU_WON_NARROW_PERSONALITY },
  photo_finish_win:  { tactical: RES_PHOTO_FINISH_WIN_TACTICAL,  personality: RES_PHOTO_FINISH_WIN_PERSONALITY },
  photo_finish_tie:  { tactical: RES_PHOTO_FINISH_TIE_TACTICAL,  personality: RES_PHOTO_FINISH_TIE_PERSONALITY },
  photo_finish_loss: { tactical: RES_PHOTO_FINISH_LOSS_TACTICAL, personality: RES_PHOTO_FINISH_LOSS_PERSONALITY },
  you_lost_narrow:   { tactical: RES_YOU_LOST_NARROW_TACTICAL,   personality: RES_YOU_LOST_NARROW_PERSONALITY },
  you_lost_big:      { tactical: RES_YOU_LOST_BIG_TACTICAL,      personality: RES_YOU_LOST_BIG_PERSONALITY },
};

/** Sign-aware bucket selector. `photo_finish_tie` covers true ties incl.
 *  float-rounding noise from FP-component sums (epsilon = 0.05). The
 *  win/loss variants of photo_finish handle the emotionally distinct +1
 *  and -1 cases — a possession-and-change win celebrates, a possession-
 *  and-change loss commiserates. */
function selectResolutionOutcome(delta: number): ResolutionOutcome {
  if (Math.abs(delta) < 0.05) return "photo_finish_tie";
  if (Math.abs(delta) <= 1)   return delta > 0 ? "photo_finish_win" : "photo_finish_loss";
  if (delta >= 15)            return "you_won_big";
  if (delta > 0)              return "you_won_narrow";
  if (delta > -15)            return "you_lost_narrow";
  return "you_lost_big";
}

/** Top-level: returns Chad's resolution line for the recipient's attempt.
 *  Personality flavor is only eligible when posterName is provided;
 *  otherwise falls back to tactical. When both eligible, 50/50 random
 *  unless forceFlavor is supplied. */
export function selectChallengeResolution(args: ChallengeResolutionArgs): string {
  const delta = args.myScore - args.posterScore;
  const outcome = selectResolutionOutcome(delta);
  const personalityEligible = !!args.posterName;
  const flavor: ResolutionFlavor =
    args.forceFlavor
      ?? (personalityEligible && Math.random() < 0.5 ? "personality" : "tactical");
  const effectiveFlavor: ResolutionFlavor =
    flavor === "personality" && !personalityEligible ? "tactical" : flavor;
  const bank = RESOLUTION_BANKS[outcome][effectiveFlavor];
  const raw = pickWithAntiRepeat(bank);
  return raw
    .replace(/\{name\}/g, args.posterName ?? "")
    .replace(/\{delta\}/g, Math.abs(delta).toFixed(1));
}

/** Expose bank arrays for testing / preview. */
export function chadResolutionBank(outcome: ResolutionOutcome, flavor: ResolutionFlavor): string[] {
  return [...RESOLUTION_BANKS[outcome][flavor]];
}

// ── Share-payload trash talk — what ships IN the share card / share text ──
//
// Rendered onto the @vercel/og share card and included in default share
// copy. Distinct surface from the comparison-sheet trash talk
// (chadTrashTalk above): that one fires for the poster AFTER seeing the
// recipient's score; this one is the cold provocation a recipient reads
// BEFORE they've played.
//
// Generic by design — the share card already shows poster name and FP.
// Chad's line carries the dare. No {name}/{delta} interpolation because
// the recipient sees the slate details elsewhere on the card.
//
// Four trigger-keyed sub-banks (mirror selectChallengeInitiation's
// bucket structure — same emotional taxonomy on both sender prompt
// and recipient share):
//   bad_beat  — sender stacked R/O cards and got cooked; share-the-pain
//   flex      — sender hit ALL_STAR+/rare_pull/big_score; brag and dare
//   statement — sender cleared STARTER honestly OR near-missed next
//               tier; set the floor, beat it
//   default   — everything else; cold provocation, play the slate

const SHARE_TT_BAD_BEAT: string[] = [
  "Held two anchors. Got nothing. Try not to make my mistake.",
  "Stacked the lineup, came up empty. Same cards. Your decisions.",
  "Got cooked on premium picks. The slate's not the problem — find out.",
  "Brutal hand. See if you read it better.",
  "Spent the budget on RED, got handed a punch in the mouth. Your turn.",
  "Two anchors, no production. The math says rebound; the math also says good luck.",
  "Slate looked perfect on paper. Paper got eaten. See if your hand survives.",
  "Built the dream lineup. Watched it die. Pass the receipt; let's see if it dies twice.",
  "When the high-tier cards no-show, there's no salvaging it. Try anyway.",
  "Took the swings, missed everything. Find out if you do better — odds say maybe.",
];

const SHARE_TT_FLEX: string[] = [
  "Cleared the bar. Find out how short you are.",
  "Hand of the day candidate. Try not to be the photo-finish loss.",
  "Top-shelf night. The slate's yours; the ceiling is mine.",
  "MVP-tier output. Don't come within five and call it close.",
  "Set the high. See if you can touch it.",
  "Anyone who beats this is lying. Make me look stupid — I dare you.",
  "Built it, won it, posted it. Your move.",
  "Don't embarrass yourself, but if you do, I want pictures.",
  "Trophy hand on a Tuesday. See if you can do it on a weeknight too.",
  "Receipts say I cooked. Let's see what yours says.",
];

const SHARE_TT_STATEMENT: string[] = [
  "Above the line. See if you can clear the same height.",
  "STARTER on the board. Either you match or you don't. The math doesn't grade on style.",
  "Solid hand, not the ceiling. Plenty of room for you to fall short.",
  "Workman's night. The kind your group chat respects until somebody beats it.",
  "Decent floor. Find out if you're better at this than you think.",
  "Made it past the rookie line. Now make it past me.",
  "Honest hand. The honest question is whether you can match it.",
  "Solid night. Pick a friend, hand them the slate, watch them sweat.",
  "Set the bar somewhere between possible and annoying. Make me look easy.",
  "Above average is above. Find out if you are.",
];

const SHARE_TT_DEFAULT: string[] = [
  "Same slate, your turn. Show your work.",
  "Beat this. Don't make me regret sending it.",
  "Played a hand. Made it your problem now.",
  "Sent you a slate. Whoever scores higher wins the group chat for a week.",
  "Hand's on the table. Your move.",
  "Same names, same numbers. Different hand if you're smart.",
  "Run the slate. Send back the receipt.",
  "Built one. Curious if yours holds up.",
  "Tap in. The slate is the slate; the score is yours to chase.",
  "Don't overthink it. Don't underthink it either. Just play.",
];

export type ShareTrashTalkBucket = "bad_beat" | "flex" | "statement" | "default";

/** Map trigger (+ winTier as secondary signal) to share-bank bucket.
 *  Mirrors selectInitiationBucket above so sender prompt and recipient
 *  share copy point at the same emotional frame.
 *
 *  Trigger-only mapping covers most cases; winTier=STARTER pulls
 *  comfortable-STARTER wins (which evaluate to trigger="default") into
 *  the statement bucket so they don't get the cold/generic default
 *  pool. */
function shareTrashTalkBucket(trigger?: string, winTier?: string): ShareTrashTalkBucket {
  if (trigger === "rare_pull" || trigger === "big_score") return "flex";
  if (trigger === "bad_beat") return "bad_beat";
  if (trigger === "miss" || winTier === "STARTER") return "statement";
  return "default";
}

/** Top-level: returns Chad's recipient-facing trash talk for the share
 *  payload. Trigger-aware (mirrors selectChallengeInitiation) so a
 *  bad_beat share recipient reads "share the pain" copy, a flex share
 *  recipient reads "match this if you can" copy, etc. Anti-repeat
 *  shared with other Chad surfaces. */
export function chadShareTrashTalk(args: { trigger?: string; winTier?: string } = {}): string {
  const bucket = shareTrashTalkBucket(args.trigger, args.winTier);
  switch (bucket) {
    case "bad_beat":  return pickWithAntiRepeat(SHARE_TT_BAD_BEAT);
    case "flex":      return pickWithAntiRepeat(SHARE_TT_FLEX);
    case "statement": return pickWithAntiRepeat(SHARE_TT_STATEMENT);
    case "default":   return pickWithAntiRepeat(SHARE_TT_DEFAULT);
  }
}

/** Expose bank arrays for testing / preview. */
export function chadShareTrashTalkBank(bucket: ShareTrashTalkBucket): string[] {
  switch (bucket) {
    case "bad_beat":  return [...SHARE_TT_BAD_BEAT];
    case "flex":      return [...SHARE_TT_FLEX];
    case "statement": return [...SHARE_TT_STATEMENT];
    case "default":   return [...SHARE_TT_DEFAULT];
  }
}

// ── First-share invitation — early-discovery one-shot ─────────────────────
//
// Fires ONCE per identity, in the post-reveal commentary slot, when the
// engagement gate trips:
//   handCount >= 3  &&  !isFTUE  &&  !challengeCtx  &&  flag-not-set
//
// Caller (GameView's postRevealCopy useMemo) evaluates the gate, fires
// this function, sets localStorage rm_usher_first_share_invitation="1",
// and treats the returned string as the post-reveal primary line. Bank
// preempts the named-trigger override (workstream 2) for that one
// reveal — so a user whose first share-eligible hand is ALSO a rare_pull
// sees the invitation copy, not the anchor-aware line, this one time.
//
// Two sub-buckets keyed on winTier:
//   BUST       → FIRST_SHARE_BUST  (own the bust, name the competition)
//   anything else → FIRST_SHARE_HIT  (ride the heat, name the competition)
//
// Voice: ASSERTS the competition premise as a fact about the game, not
// a pitch. No "what's more fun is if you can…" hedging.

const FIRST_SHARE_HIT: string[] = [
  "Game's better when somebody you know is sweating the same slate. Send it.",
  "You played the slate. Now make your buddy play the slate. That's the whole thing.",
  "This is the part where you find out if your friends are any good. Pick one.",
  "You just played this slate. Don't keep it — make a friend run it too.",
  "The point of the game is somebody you know taking a swing at the same cards. Now's the time.",
  "Score's on the board. Now find out who in your group chat can clear it.",
];

const FIRST_SHARE_BUST: string[] = [
  "Rough one. Now go cook somebody else on it.",
  "Got cooked. Cook a friend with the same slate.",
  "Bust hand. The fun part: pass it to a friend and watch them eat it too.",
  "That was ugly. Make a friend look at the same ugly cards. Misery is portable.",
  "Hand died. Forward the autopsy. See who else can fail the same way.",
  "The slate punched you. Now find out if it punches your friends too.",
];

/** Returns one line from FIRST_SHARE_HIT (or FIRST_SHARE_BUST for BUST).
 *  Fires at most ONCE per identity via the one-shot flag the caller
 *  manages. Uses the shared anti-repeat ring buffer for consistency,
 *  though anti-repeat barely matters at one-shot scale. */
export function firstShareInvitation(args: { winTier: string }): string {
  if (args.winTier === "BUST") return pickWithAntiRepeat(FIRST_SHARE_BUST);
  return pickWithAntiRepeat(FIRST_SHARE_HIT);
}

/** Expose bank arrays for testing / preview. */
export function firstShareInvitationBank(bucket: "hit" | "bust"): string[] {
  return bucket === "bust" ? [...FIRST_SHARE_BUST] : [...FIRST_SHARE_HIT];
}

// ── Recipient contextual intro (Phase 5c S3) ──────────────────────────────
//
// Two-stage trash-talk that fires inside H2HRecipientPlay's hero zone during
// the `hold_select` state. Stage 1 (intro paragraph) is the "set the stage"
// beat; Stage 2 (deal nudge) is the "go" beat once cards are held. Both
// banks live here; selection is keyed on the sender's `triggerType` from
// the GET /api/challenge/{id} response (M3/M4 plumbing).
//
// T6 VOICE GUARDRAIL — DO NOT VIOLATE:
//   - Bank frames carry RECIPIENT/SITUATION trash talk ONLY. The only
//     real-player material is {cultureLine} substituted at render time
//     from the vetted PLAYER_CULTURE DB (~207 basketball entries,
//     hand-authored + reviewed). DO NOT invent fresh harsh claims about
//     real players in these strings — that exposes liability the vetted
//     bank doesn't.
//   - bad_beat draws cultureLine from `controversy ∪ underperform`
//     (the harsher pools); big_score / rare_pull from `overperform ∪
//     signatureGames`; rare_pull additionally from `milestones ∪
//     streakLines`.
//   - NEVER name broadcasters, podcasters, or media personalities. The
//     Chad voice speaks AT the recipient about the sender's cards. No
//     "as Barkley said", no "Bill Simmons take".
//   - Stay in player-perspective (anchor name, performance) or situation-
//     perspective (sender's hand, recipient's deal). Out-of-game refs
//     stay sourced from PLAYER_CULTURE, not punditry.
//
// ⚠️ TONE-REVIEW — banks below are a FIRST DRAFT for a human tone pass.
// Voice sharpening (snap, rhythm, redundancy) is a follow-up, not part
// of this commit's scope. The structural locks (T2/T5 fallback, T6
// guardrails) hold regardless of how the lines themselves get tuned.

/** Anchor card chosen by selectIntroAnchor for the recipient intro. The
 *  shape mirrors the slice of GeneratedCard the intro selectors actually
 *  read, plus the resolved culture entry. Optional fields stay optional
 *  here so a Path-A-derived anchor (where the persisted basePlayerId
 *  resolved but the card came back missing some metadata) still
 *  satisfies the type. */
export interface RecipientIntroAnchor {
  name: string;
  basePlayerId: string;
  team?: string;
  tier?: string;
  actualFp?: number;
  projectedFp?: number;
  wasHeld?: boolean;
  salary?: number;
  gameInfo?: { date: string; opponent: string };
  /** Culture entry from lookupCulture(name, sport, tier, 0, basePlayerId,
   *  team). Null when the anchor's tier gates culture out (BLUE/GREEN/
   *  WHITE), when no DB entry exists, or when the PURPLE iconic-nickname
   *  gate trips. NAME-only fallback bank fires in that case. */
  culture: CultureShape | null;
  /** rare_pull only — threaded from challengeCtx.topGameTier through
   *  selectIntroAnchor's caller. NEVER fabricated by the derivation
   *  fallback; legacy rows with no persisted tier leave this null and
   *  the chip renderer falls back to the "RARE PULL" base label. */
  topGameTier?: "record" | "career" | "season" | null;
}

export interface SelectIntroAnchorArgs {
  triggerType?: ChallengeCtxTriggerType | null;
  /** ChallengeCtx.resolvedSenderHand.cards — undefined on legacy / fetch
   *  failures. Empty array also routes to null-return path A. */
  senderCards?: GeneratedCard[];
  /** ChallengeCtx.anchorBasePlayerId — Path A primary key. Null on
   *  legacy rows or non-anchor triggers (miss/default). */
  anchorBasePlayerId?: string | null;
  /** ChallengeCtx.topGameTier — rare_pull only. Attached to the anchor
   *  so downstream banks can render the rare_pull chip's sub-tier label.
   *  Never fabricated by the derivation fallback. */
  topGameTier?: "record" | "career" | "season" | null;
  sport: string;
}

type ChallengeCtxTriggerType = "rare_pull" | "big_score" | "miss" | "bad_beat" | "default";

/** Path-A-first anchor resolver. Returns null for miss/default (no anchor
 *  concept by T2). For bad_beat / big_score / rare_pull:
 *    1. Resolve persisted anchorBasePlayerId against senderCards.
 *    2. On null/no-match, fall back to client-side derivation per T2
 *       (the M5/Path-A fallback for legacy or null-column rows).
 *  Culture is attached via the now-exported lookupCulture (Phase 5c S3
 *  Deliverable 1). For rare_pull, topGameTier is plumbed onto the
 *  returned anchor object via the caller's threading — selectIntroAnchor
 *  itself never fabricates topGameTier in the derivation fallback. */
export function selectIntroAnchor(args: SelectIntroAnchorArgs): RecipientIntroAnchor | null {
  const { triggerType, senderCards, anchorBasePlayerId, sport, topGameTier } = args;
  if (!triggerType) return null;
  if (triggerType === "miss" || triggerType === "default") return null;
  if (!senderCards || senderCards.length === 0) return null;

  let card: GeneratedCard | null = null;

  // Path A primary: persisted id → card.
  if (anchorBasePlayerId) {
    card = senderCards.find(c => c.basePlayerId === anchorBasePlayerId) ?? null;
  }

  // Derivation fallback (legacy / null-column / id-not-on-roster).
  if (!card) {
    if (triggerType === "bad_beat") {
      const held = senderCards.filter(c => c.wasHeld === true);
      if (held.length === 0) return null;
      held.sort((a, b) => {
        const da = (a.actualFp ?? 0) - (a.projectedFp ?? 0);
        const db = (b.actualFp ?? 0) - (b.projectedFp ?? 0);
        if (da !== db) return da - db; // most-negative first
        return (b.salary ?? 0) - (a.salary ?? 0); // tiebreak salary desc
      });
      card = held[0];
    } else if (triggerType === "big_score") {
      const sorted = [...senderCards].sort((a, b) => (b.actualFp ?? 0) - (a.actualFp ?? 0));
      const top = sorted[0];
      if (!top) return null;
      // Prefer wasHeld within 1 FP of top — small recency window so the
      // anchor reads as "the one you were betting on" when possible.
      const heldNearTop = sorted.find(
        c => c.wasHeld === true && Math.abs((top.actualFp ?? 0) - (c.actualFp ?? 0)) <= 1,
      );
      card = heldNearTop ?? top;
    } else if (triggerType === "rare_pull") {
      // Don't fabricate a topGameTier — caller threads it from ctx, and
      // it'll be null in the legacy fallback. Renderer's RARE_PULL_TIER_LABEL
      // map handles missing-tier gracefully (falls back to "RARE PULL").
      const sorted = [...senderCards].sort((a, b) => (b.actualFp ?? 0) - (a.actualFp ?? 0));
      card = sorted[0] ?? null;
    }
  }

  if (!card) return null;

  const culture = lookupCulture(card.name, sport, card.tier, 0, card.basePlayerId, card.team);
  return {
    name: card.name,
    basePlayerId: card.basePlayerId,
    team: card.team,
    tier: card.tier,
    actualFp: card.actualFp,
    projectedFp: card.projectedFp,
    wasHeld: card.wasHeld,
    salary: card.salary,
    gameInfo: card.gameInfo ? { date: card.gameInfo.date, opponent: card.gameInfo.opponent } : undefined,
    culture,
    // Path A: forward the persisted ctx.topGameTier (rare_pull only).
    // Derivation fallback never fabricates this — rare_pull anchors
    // derived client-side carry topGameTier === undefined and the chip
    // renderer falls back to "RARE PULL".
    topGameTier: triggerType === "rare_pull" ? (topGameTier ?? null) : null,
  };
}

// ── Recipient Stage 1 banks ───────────────────────────────────────────────
//
// Substitution tokens (replaced at selection time after anti-repeat dedup):
//   {name}            anchor card's display name
//   {cultureLine}     vetted line from PLAYER_CULTURE pool (CULTURE bank only)
//   {challengerName}  sender's display name, or "your friend"
//   {targetScore}     sender's totalFp, one decimal
//   {nearMissGap}     integer FP gap (MISS bank only, with-gap path)
//   {nearMissNextTier} title-cased target tier (MISS bank only, with-gap path)
// StampToken tiers:
//   "{rarePullTier}"  sentinel replaced by anchor's topGameTier
//   "{nearMissNextTier}" sentinel replaced by ctx.nearMissNextTier
//   win_tier StampTokens leave tier undefined — renderer falls back to
//     the winTier prop H2HRecipientPlay passes (senderHand.tier).

const INTRO_BAD_BEAT_CULTURE: Line[] = [
  ["{challengerName} stacked {name} for {targetScore} and got cooked anyway — ", { stamp: "bad_beat" }, " — {cultureLine}"],
  ["{name} on the held card, {targetScore} on the scoreboard. {cultureLine} ", { stamp: "bad_beat" }, ". Run the same hand and read it better."],
  ["Held {name} for the conviction pick, lineup folded around them — ", { stamp: "bad_beat" }, " — {cultureLine} Your turn."],
  ["{name} was {challengerName}'s anchor for {targetScore}. {cultureLine} ", { stamp: "bad_beat" }, ". Same six cards. Cook it."],
  [{ stamp: "bad_beat" }, ". {challengerName} bet on {name} and got {targetScore}. {cultureLine} You've got the redraws."],
  ["{cultureLine} {name} let {challengerName} down for {targetScore} — ", { stamp: "bad_beat" }, " — your shot at the same slate."],
];

const INTRO_BAD_BEAT_NAME: Line[] = [
  ["{challengerName} held {name} and the lineup couldn't lift it — ", { stamp: "bad_beat" }, " — {targetScore} on the board. Your move."],
  ["{name} on the held card. {targetScore} as the finish. ", { stamp: "bad_beat" }, ". Cook it cleaner."],
  ["Premium pick on {name}, premium disappointment — ", { stamp: "bad_beat" }, " — {challengerName}'s leaving you {targetScore} to chase."],
  [{ stamp: "bad_beat" }, ". {challengerName} stacked {name} for {targetScore}. Same six cards. Read the slate."],
  ["{challengerName} bet big on {name} and walked away with {targetScore} — ", { stamp: "bad_beat" }, " — your hand to play."],
];

const INTRO_BAD_BEAT_GENERIC: Line[] = [
  ["{challengerName} got cooked by their own holds — ", { stamp: "bad_beat" }, " — {targetScore} on the board. Your turn."],
  [{ stamp: "bad_beat" }, ". Same six cards, {challengerName} couldn't get past {targetScore}. Cook it."],
  ["The lineup looked like a winner on paper for {challengerName} — ", { stamp: "bad_beat" }, " — {targetScore} is what it actually paid out."],
  ["{challengerName} read the slate, slate didn't read the script — ", { stamp: "bad_beat" }, " — {targetScore} to beat."],
];

const INTRO_BIG_SCORE_CULTURE: Line[] = [
  ["{name} cooked, {challengerName} was holding the detonator — ", { stamp: "win_tier" }, ". {cultureLine} {targetScore} to clear."],
  ["{challengerName} stacked {name} on the right night — ", { stamp: "win_tier" }, ". {cultureLine} Same six cards, {targetScore} on the board."],
  ["{cultureLine} {name} put {challengerName} on the leaderboard at {targetScore} — ", { stamp: "win_tier" }, ". Your shot."],
  [{ stamp: "win_tier" }, ". {name} took the building down for {challengerName}. {cultureLine} {targetScore} to beat."],
  ["{name} ate, {challengerName} ate after — ", { stamp: "win_tier" }, " — {targetScore} on the receipt. {cultureLine} Your turn at the wheel."],
];

const INTRO_BIG_SCORE_NAME: Line[] = [
  ["{name} cooked and {challengerName} was sitting at the table — ", { stamp: "win_tier" }, " — {targetScore} on the board. Same six cards."],
  ["{challengerName} stacked the right name on the right night. {name} ate. ", { stamp: "win_tier" }, ". {targetScore} to clear."],
  [{ stamp: "win_tier" }, ". {name} took the lineup by the collar for {challengerName}. {targetScore} on the receipt."],
  ["{name} torched the whole opposing lineup — ", { stamp: "win_tier" }, " — {challengerName} cleared {targetScore}. Your move."],
];

const INTRO_BIG_SCORE_GENERIC: Line[] = [
  ["{challengerName} cooked the whole slate — ", { stamp: "win_tier" }, " — {targetScore} on the board."],
  [{ stamp: "win_tier" }, ". {challengerName} stacked the right names and ate. {targetScore} to beat."],
  ["The whole lineup ran for {challengerName} — ", { stamp: "win_tier" }, " — {targetScore} is what it paid out."],
  ["{challengerName} put up {targetScore} on these cards — ", { stamp: "win_tier" }, " — your turn at the wheel."],
];

const INTRO_RARE_PULL_CULTURE: Line[] = [
  ["{name} just did something the league hasn't seen in years — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ". {cultureLine} {challengerName} was holding the ticket at {targetScore}."],
  ["{cultureLine} {name} carved {challengerName}'s name into the leaderboard — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ". {targetScore} to chase."],
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, ". {name} hung a number on the league for {challengerName}. {cultureLine} {targetScore} on the receipt."],
  ["{challengerName} caught {name} on the night the stat sheet broke — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — {cultureLine} {targetScore} is your bar."],
  ["{name} just made the highlight reel for {challengerName}. {cultureLine} ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ". {targetScore} to clear."],
];

const INTRO_RARE_PULL_NAME: Line[] = [
  ["{name} just did something the league hasn't seen in years — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — {challengerName} was holding the ticket. {targetScore} to chase."],
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, ". {name} carved {challengerName}'s name into the leaderboard at {targetScore}. Same six cards."],
  ["{challengerName} caught {name} on the night the stat sheet broke — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — {targetScore} on the board."],
  ["{name} hung a historic number for {challengerName} — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — {targetScore} is the bar."],
];

const INTRO_RARE_PULL_GENERIC: Line[] = [
  ["{challengerName} caught one of those nights — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — {targetScore} on the receipt."],
  [{ stamp: "rare_pull", tier: "{rarePullTier}" }, ". The slate handed {challengerName} a historic number. {targetScore} to chase."],
  ["The lineup ran historic for {challengerName} — ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " — {targetScore} is what it paid."],
];

const INTRO_MISS_WITH_GAP: Line[] = [
  ["{challengerName} got {targetScore} on the board — ", { stamp: "miss", tier: "{nearMissNextTier}" }, " — {nearMissGap} FP short of the next tier. Take it from them."],
  ["{nearMissGap} FP from a different conversation for {challengerName}. ", { stamp: "miss", tier: "{nearMissNextTier}" }, ". {targetScore} on the board. Your turn."],
  [{ stamp: "miss", tier: "{nearMissNextTier}" }, ". {challengerName} left {nearMissGap} FP on the floor at {targetScore}. Cook the cleaner read."],
  ["{challengerName} bumped the cut line and fell back — ", { stamp: "miss", tier: "{nearMissNextTier}" }, " — {nearMissGap} FP short. {targetScore} to clear."],
];

const INTRO_MISS_GENERIC: Line[] = [
  ["{challengerName} got close on this slate — ", { stamp: "miss" }, " — {targetScore} on the board. Your shot."],
  [{ stamp: "miss" }, ". {challengerName} ran it right up to the door at {targetScore}. Door didn't open. Try it yourself."],
  ["{challengerName} was a possession from a different night — ", { stamp: "miss" }, " — {targetScore} to chase."],
];

const INTRO_DEFAULT: Line[] = [
  ["{challengerName} played the slate and walked away with {targetScore}. Same six cards. Cook it."],
  ["{targetScore} on the board from {challengerName}. Your turn at the wheel."],
  ["{challengerName} sent {targetScore}. Your shot at the same cards."],
];

// ── Recipient Stage 2 banks (Deal nudges — verb-first, shorter) ──────────

const NUDGE_BAD_BEAT_CULTURE: Line[] = [
  ["Lock in your reads. ", { stamp: "bad_beat" }, " — {cultureLine} Draw."],
  ["Hold the cards {challengerName} should have. {cultureLine} Send it."],
  ["Pick the holds. ", { stamp: "bad_beat" }, " on {name}. {cultureLine} Your draw."],
];

const NUDGE_BAD_BEAT_NAME: Line[] = [
  ["Lock the holds. ", { stamp: "bad_beat" }, " on {name} — your draw to redeem it."],
  ["Pick the conviction. {challengerName} got cooked by {name}. Draw."],
  ["Hold what {challengerName} should have. ", { stamp: "bad_beat" }, ". Send it."],
];

const NUDGE_BAD_BEAT_GENERIC: Line[] = [
  ["Lock in your reads. ", { stamp: "bad_beat" }, " on {challengerName}'s board. Draw."],
  ["Pick your holds and redeem the slate. Send it."],
  ["Hold sharper than {challengerName} did. Draw."],
];

const NUDGE_BIG_SCORE_CULTURE: Line[] = [
  ["Stack the right names. {cultureLine} Draw."],
  ["Hold the heater. ", { stamp: "win_tier" }, " on {name}. {cultureLine} Draw."],
  ["Lock your reads. {cultureLine} Send it."],
];

const NUDGE_BIG_SCORE_NAME: Line[] = [
  ["Hold {name} like {challengerName} did. ", { stamp: "win_tier" }, ". Draw."],
  ["Lock the heater. {name} cooked for {challengerName} — your turn."],
  ["Stack the right name. {targetScore} to clear. Draw."],
];

const NUDGE_BIG_SCORE_GENERIC: Line[] = [
  ["Lock in the heat. ", { stamp: "win_tier" }, " to clear. Draw."],
  ["Stack the right names. Your turn at {targetScore}."],
  ["Hold sharper than {challengerName} did. Send it."],
];

const NUDGE_RARE_PULL_CULTURE: Line[] = [
  ["Hold the history card. {cultureLine} Draw."],
  ["Lock {name}. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ". {cultureLine} Send it."],
  ["Stack on {name}. {cultureLine} Draw."],
];

const NUDGE_RARE_PULL_NAME: Line[] = [
  ["Hold {name}. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, ". Draw."],
  ["Lock the history pull. {name} did it for {challengerName} — your turn."],
  ["Stack on {name}. {targetScore} to chase. Draw."],
];

const NUDGE_RARE_PULL_GENERIC: Line[] = [
  ["Lock your reads. ", { stamp: "rare_pull", tier: "{rarePullTier}" }, " to chase. Draw."],
  ["Hold sharper than {challengerName} did. {targetScore} on the board."],
  ["Stack the slate. Send it."],
];

const NUDGE_MISS: Line[] = [
  ["Lock the holds. {challengerName} fell short — your shot to clear. Draw."],
  ["Hold tighter than {challengerName} did. {targetScore} on the board."],
  ["Pick your reads. Send it past {targetScore}."],
];

const NUDGE_DEFAULT: Line[] = [
  ["Lock the holds. {targetScore} on the board. Draw."],
  ["Pick your reads. Send it past {challengerName}."],
  ["Hold what you trust. {targetScore} to clear."],
];

// ── Selectors ────────────────────────────────────────────────────────────

export interface SelectRecipientIntroArgs {
  triggerType?: ChallengeCtxTriggerType | null;
  challengerName: string | null;
  targetScore: number;
  anchor: RecipientIntroAnchor | null;
  nearMissGap?: number | null;
  nearMissNextTier?: string | null;
}

export interface SelectRecipientDealNudgeArgs {
  triggerType?: ChallengeCtxTriggerType | null;
  challengerName: string | null;
  targetScore: number;
  anchor: RecipientIntroAnchor | null;
}

/** Stage 1 — recipient contextual intro paragraph. Fires on hero zone
 *  entry into `hold_select`. T5 four-level fallback:
 *    1. anchor + culture entry + cultureLine resolved → CULTURE bank
 *    2. anchor + (no culture entry OR no cultureLine renderable) → NAME bank
 *    3. anchor-trigger but no anchor → GENERIC per-trigger bank
 *    4. miss with NULL gap → MISS_GENERIC; legacy (no triggerType) →
 *       chadChallengeIntro wrapped as single-string Line. */
export function selectRecipientIntro(args: SelectRecipientIntroArgs): Line {
  const t = args.triggerType ?? null;
  const challengerLabel = args.challengerName ?? "Your friend";
  const targetStr = args.targetScore.toFixed(1);

  // Level 4 legacy fallback: pre-S1 / missing triggerType.
  if (!t) {
    const legacy = chadChallengeIntro({ challengerName: args.challengerName, targetScore: args.targetScore });
    return [legacy];
  }

  // miss bucket — uses gap framing, not anchor.
  if (t === "miss") {
    if (typeof args.nearMissGap === "number" && args.nearMissNextTier) {
      const line = pickWithAntiRepeat(INTRO_MISS_WITH_GAP, l => JSON.stringify(l));
      return substituteRecipientLine(line, {
        name: "",
        cultureLine: "",
        challengerName: challengerLabel,
        targetScore: targetStr,
        nearMissGap: String(Math.round(args.nearMissGap)),
        nearMissNextTier: args.nearMissNextTier,
        rarePullTier: "",
      });
    }
    const line = pickWithAntiRepeat(INTRO_MISS_GENERIC, l => JSON.stringify(l));
    return substituteRecipientLine(line, {
      name: "",
      cultureLine: "",
      challengerName: challengerLabel,
      targetScore: targetStr,
      nearMissGap: "",
      nearMissNextTier: "",
      rarePullTier: "",
    });
  }

  // default bucket — generic framing.
  if (t === "default") {
    const line = pickWithAntiRepeat(INTRO_DEFAULT, l => JSON.stringify(l));
    return substituteRecipientLine(line, {
      name: "",
      cultureLine: "",
      challengerName: challengerLabel,
      targetScore: targetStr,
      nearMissGap: "",
      nearMissNextTier: "",
      rarePullTier: "",
    });
  }

  // Anchor-bearing triggers: bad_beat / big_score / rare_pull.
  const anchor = args.anchor;
  let bank: Line[];
  let cultureLine = "";

  if (!anchor) {
    bank = t === "bad_beat" ? INTRO_BAD_BEAT_GENERIC
      : t === "big_score" ? INTRO_BIG_SCORE_GENERIC
      : INTRO_RARE_PULL_GENERIC;
  } else {
    const resolved = anchor.culture ? getCultureLine(anchor, t) : null;
    if (anchor.culture && resolved) {
      cultureLine = resolved;
      bank = t === "bad_beat" ? INTRO_BAD_BEAT_CULTURE
        : t === "big_score" ? INTRO_BIG_SCORE_CULTURE
        : INTRO_RARE_PULL_CULTURE;
    } else {
      bank = t === "bad_beat" ? INTRO_BAD_BEAT_NAME
        : t === "big_score" ? INTRO_BIG_SCORE_NAME
        : INTRO_RARE_PULL_NAME;
    }
  }

  const line = pickWithAntiRepeat(bank, l => JSON.stringify(l));
  return substituteRecipientLine(line, {
    name: anchor?.name ?? "",
    cultureLine,
    challengerName: challengerLabel,
    targetScore: targetStr,
    nearMissGap: "",
    nearMissNextTier: "",
    // rare_pull only — Path A: topGameTier persisted on ctx, attached
    // to the anchor by selectIntroAnchor. Derivation-fallback anchors
    // (legacy rows) leave this null; sentinel strips to undefined and
    // the chip renderer falls back to the "RARE PULL" base label.
    rarePullTier: anchor?.topGameTier ?? "",
  });
}

/** Stage 2 — deal nudge. Same trigger-branched bank, distinct templates.
 *  Fires when held.size > 0 in hold_select. */
export function selectRecipientDealNudge(args: SelectRecipientDealNudgeArgs): Line {
  const t = args.triggerType ?? null;
  const challengerLabel = args.challengerName ?? "Your friend";
  const targetStr = args.targetScore.toFixed(1);

  if (!t || t === "default") {
    const line = pickWithAntiRepeat(NUDGE_DEFAULT, l => JSON.stringify(l));
    return substituteRecipientLine(line, {
      name: "", cultureLine: "", challengerName: challengerLabel, targetScore: targetStr,
      nearMissGap: "", nearMissNextTier: "", rarePullTier: "",
    });
  }

  if (t === "miss") {
    const line = pickWithAntiRepeat(NUDGE_MISS, l => JSON.stringify(l));
    return substituteRecipientLine(line, {
      name: "", cultureLine: "", challengerName: challengerLabel, targetScore: targetStr,
      nearMissGap: "", nearMissNextTier: "", rarePullTier: "",
    });
  }

  const anchor = args.anchor;
  let bank: Line[];
  let cultureLine = "";

  if (!anchor) {
    bank = t === "bad_beat" ? NUDGE_BAD_BEAT_GENERIC
      : t === "big_score" ? NUDGE_BIG_SCORE_GENERIC
      : NUDGE_RARE_PULL_GENERIC;
  } else {
    const resolved = anchor.culture ? getCultureLine(anchor, t) : null;
    if (anchor.culture && resolved) {
      cultureLine = resolved;
      bank = t === "bad_beat" ? NUDGE_BAD_BEAT_CULTURE
        : t === "big_score" ? NUDGE_BIG_SCORE_CULTURE
        : NUDGE_RARE_PULL_CULTURE;
    } else {
      bank = t === "bad_beat" ? NUDGE_BAD_BEAT_NAME
        : t === "big_score" ? NUDGE_BIG_SCORE_NAME
        : NUDGE_RARE_PULL_NAME;
    }
  }

  const line = pickWithAntiRepeat(bank, l => JSON.stringify(l));
  return substituteRecipientLine(line, {
    name: anchor?.name ?? "",
    cultureLine,
    challengerName: challengerLabel,
    targetScore: targetStr,
    nearMissGap: "",
    nearMissNextTier: "",
    rarePullTier: anchor?.topGameTier ?? "",
  });
}

/** Resolve {cultureLine} for an anchor + trigger. Prefers a signatureGames
 *  date+opp match against the anchor's gameInfo over the trigger-appropriate
 *  generic pool. Returns null when no renderable line exists (NAME bank
 *  fallback fires upstream). Reads `controversy` / `underperform` /
 *  `overperform` via `as any` per the CultureShape's intentionally loose
 *  shape (sport-specific fields not declared on the shared interface). */
function getCultureLine(anchor: RecipientIntroAnchor, triggerType: ChallengeCtxTriggerType): string | null {
  const c = anchor.culture;
  if (!c) return null;

  // Signature-game preferred match — exact date+opp on the anchor's gameInfo.
  if (anchor.gameInfo && c.signatureGames?.length) {
    const date = anchor.gameInfo.date.slice(0, 10);
    const opp = anchor.gameInfo.opponent.toUpperCase();
    const sig = c.signatureGames.find(g => g.date === date && g.opponent.toUpperCase() === opp);
    if (sig?.line) return sig.line;
  }

  // Trigger-appropriate pool. The intentionally loose CultureShape doesn't
  // declare overperform/underperform/controversy on the shared interface;
  // sport-specific PlayerCulture entries carry them.
  const ca = c as any;
  const sigLines = (c.signatureGames ?? []).map(g => g.line).filter((l): l is string => !!l);
  let pool: string[] = [];

  if (triggerType === "bad_beat") {
    pool = [
      ...(Array.isArray(ca.controversy) ? ca.controversy : []),
      ...(Array.isArray(ca.underperform) ? ca.underperform : []),
    ];
  } else if (triggerType === "big_score") {
    pool = [
      ...(Array.isArray(ca.overperform) ? ca.overperform : []),
      ...sigLines,
    ];
  } else if (triggerType === "rare_pull") {
    pool = [
      ...sigLines,
      ...(Array.isArray(ca.overperform) ? ca.overperform : []),
      ...(c.milestones ?? []),
      ...(c.streakLines ?? []),
    ];
  }

  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

interface RecipientLineSubstitutions {
  name: string;
  cultureLine: string;
  challengerName: string;
  targetScore: string;
  nearMissGap: string;
  nearMissNextTier: string;
  rarePullTier: string;
}

/** Substitute tokens into each LinePart for the recipient intro / nudge
 *  banks. Mirrors substituteLine (above) but with the recipient-intro
 *  token set. StampToken sentinels handled: "{rarePullTier}" and
 *  "{nearMissNextTier}". win_tier StampTokens leave tier undefined here —
 *  H2HRecipientPlay passes `winTier={senderHand.tier}` to PartsLine and
 *  the renderer reads it from props. */
function substituteRecipientLine(line: Line, subs: RecipientLineSubstitutions): Line {
  return line.map((part): LinePart => {
    if (typeof part === "string") {
      return part
        .replace(/\{cultureLine\}/g, subs.cultureLine)
        .replace(/\{challengerName\}/g, subs.challengerName)
        .replace(/\{targetScore\}/g, subs.targetScore)
        .replace(/\{nearMissGap\}/g, subs.nearMissGap)
        .replace(/\{nearMissNextTier\}/g, subs.nearMissNextTier)
        .replace(/\{name\}/g, subs.name);
    }
    if (part.tier === "{rarePullTier}") {
      if (subs.rarePullTier) return { stamp: part.stamp, tier: subs.rarePullTier };
      return { stamp: part.stamp };
    }
    if (part.tier === "{nearMissNextTier}") {
      if (subs.nearMissNextTier) return { stamp: part.stamp, tier: subs.nearMissNextTier };
      return { stamp: part.stamp };
    }
    return part;
  });
}

/** Expose recipient banks for testing / preview. */
export type RecipientIntroBankKey =
  | "bad_beat_culture" | "bad_beat_name" | "bad_beat_generic"
  | "big_score_culture" | "big_score_name" | "big_score_generic"
  | "rare_pull_culture" | "rare_pull_name" | "rare_pull_generic"
  | "miss_with_gap" | "miss_generic" | "default";

export function recipientIntroBank(key: RecipientIntroBankKey): Line[] {
  const bank = (() => {
    switch (key) {
      case "bad_beat_culture":  return INTRO_BAD_BEAT_CULTURE;
      case "bad_beat_name":     return INTRO_BAD_BEAT_NAME;
      case "bad_beat_generic":  return INTRO_BAD_BEAT_GENERIC;
      case "big_score_culture": return INTRO_BIG_SCORE_CULTURE;
      case "big_score_name":    return INTRO_BIG_SCORE_NAME;
      case "big_score_generic": return INTRO_BIG_SCORE_GENERIC;
      case "rare_pull_culture": return INTRO_RARE_PULL_CULTURE;
      case "rare_pull_name":    return INTRO_RARE_PULL_NAME;
      case "rare_pull_generic": return INTRO_RARE_PULL_GENERIC;
      case "miss_with_gap":     return INTRO_MISS_WITH_GAP;
      case "miss_generic":      return INTRO_MISS_GENERIC;
      case "default":           return INTRO_DEFAULT;
    }
  })();
  return bank.map(line => [...line]);
}

export type RecipientNudgeBankKey =
  | "bad_beat_culture" | "bad_beat_name" | "bad_beat_generic"
  | "big_score_culture" | "big_score_name" | "big_score_generic"
  | "rare_pull_culture" | "rare_pull_name" | "rare_pull_generic"
  | "miss" | "default";

export function recipientDealNudgeBank(key: RecipientNudgeBankKey): Line[] {
  const bank = (() => {
    switch (key) {
      case "bad_beat_culture":  return NUDGE_BAD_BEAT_CULTURE;
      case "bad_beat_name":     return NUDGE_BAD_BEAT_NAME;
      case "bad_beat_generic":  return NUDGE_BAD_BEAT_GENERIC;
      case "big_score_culture": return NUDGE_BIG_SCORE_CULTURE;
      case "big_score_name":    return NUDGE_BIG_SCORE_NAME;
      case "big_score_generic": return NUDGE_BIG_SCORE_GENERIC;
      case "rare_pull_culture": return NUDGE_RARE_PULL_CULTURE;
      case "rare_pull_name":    return NUDGE_RARE_PULL_NAME;
      case "rare_pull_generic": return NUDGE_RARE_PULL_GENERIC;
      case "miss":              return NUDGE_MISS;
      case "default":           return NUDGE_DEFAULT;
    }
  })();
  return bank.map(line => [...line]);
}
