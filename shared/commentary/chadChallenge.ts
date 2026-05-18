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

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0];
}

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

// [Chad:trigger-v2] Curated banks per trigger type. Each branch is
// situation-specific — references the actual stat that fired the
// trigger (gap for near_miss, tier name for big_score, etc.) rather
// than generic share copy. Treat these as carefully as FTUE copy:
// they're the moment that determines whether the user shares.
export function chadTriggerFraming(args: ChadTriggerFramingArgs): string {
  const fp = args.fp.toFixed(1);
  const tierName = args.tier.replace("_", "-");
  switch (args.trigger) {
    case "big_score":
      return pick([
        `Hit ${tierName} on this slate. The kind of score that needs an audience.`,
        `${tierName} on the board with ${fp}. Don't sit on it.`,
        `${fp} FP — ${tierName} tier. Pick someone and send the receipt.`,
        `${tierName}. ${fp}. Half this app dreams about that line. Share it.`,
        `Big board, big number. ${fp} FP, ${tierName}. Find a victim.`,
        `${tierName} confirmed. ${fp} FP. The bragging window is open.`,
        `That's a ${tierName} flag plant. ${fp} FP. Let somebody chase it.`,
        `${fp} FP. ${tierName}. Don't let this one go unwitnessed.`,
      ]);
    case "rare_pull": {
      const what = args.badgeLabel ?? "A record game";
      return pick([
        `${what} showed up in your lineup. Worth showing off.`,
        `${what}. The kind of moment that doesn't repeat. Send it.`,
        `${what} just landed for you. Pin it before it fades.`,
        `${what} in your roster. The slate handed you a story.`,
        `${what} — that's the share. Forget the FP, the headline is the game.`,
        `Some hands you play. This one you frame. ${what}.`,
        `${what}. Slates like this don't come back. Get it out the door.`,
      ]);
    }
    case "near_miss": {
      const gap = (args.nearMissGap ?? 0).toFixed(1);
      const next = (args.nearMissNextTier ?? "the next tier").replace("_", "-");
      return pick([
        `By ${gap} FP. Brutal. Someone else might close the gap.`,
        `${gap} FP short of ${next}. Pass the slate — see who finishes it.`,
        `So close. ${gap} FP. Make somebody finish what you started.`,
        `${gap} FP from ${next}. The slate's right there. Hand it off.`,
        `Off by ${gap}. ${next} is one good redraw away. See if they get it.`,
        `${gap} FP. That's a friend's roll-of-the-dice away from ${next}. Send it.`,
        `Heartbreak math: ${gap} FP. Let someone else taste it.`,
      ]);
    }
    case "bad_beat":
      return pick([
        `Looked stacked on paper. Got cooked. Share the misery.`,
        `Premium roster, premium disaster. Send it — let them try.`,
        `Stars went cold. Make somebody else feel that one.`,
        `Held the right cards, got the wrong games. Pass the curse.`,
        `On paper it was a coronation. The court said no. Share it.`,
        `Your picks, your faith, your loss. Let them see if they can fix it.`,
        `The roster wasn't the problem. The dice were. Curious who else gets these dice?`,
      ]);
  }
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

function pickWithAntiRepeat(bank: string[]): string {
  // Filter out lines used in the last N picks. If all bank lines were
  // recent (small bank, long session), fall through to the full pool so
  // we don't pin on a single line forever.
  const fresh = bank.filter(line => !_recentChadLines.includes(line));
  const pool = fresh.length > 0 ? fresh : bank;
  const pick = pool[Math.floor(Math.random() * pool.length)] ?? bank[0];
  _recentChadLines.push(pick);
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
  if (trigger === "near_miss" || winTier === "STARTER") return "statement";
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
