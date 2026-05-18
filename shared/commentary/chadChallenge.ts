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
