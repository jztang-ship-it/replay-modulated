/**
 * selectCommentary.ts — Unified runtime commentary selector.
 *
 * Replaces composeCommentary.ts as the main entry point.
 *
 * Flow:
 * 1. Classify archetype (deterministic, first — archetype is king)
 * 2. Determine intensity
 * 3. Select tone (secondary to archetype)
 * 4. Load library, filter by archetype → register → tone → enabled
 * 5. Apply anti-repeat penalties and score candidates
 * 6. Select best candidate
 * 7. Fill template tokens via templateResolver
 * 8. Assemble sub-line from details
 * 9. Select stamp if applicable
 * 10. Record usage in anti-repeat
 * 11. Return CommentaryResult
 */

import type {
  CommentaryInput,
  CommentaryLine,
  CommentaryLibrary,
  CommentaryResult,
  CommentaryArchetype,
  ToneId,
  Intensity,
  Register,
} from "./types";
import { classifyArchetype } from "./classifyArchetype";
import { selectTone } from "./toneEngine";
import { buildTemplateData, resolveTemplate, composeMessage } from "./templateResolver";
import { scoreRepeatPenalty, recordUsage } from "./antiRepeat";
import { selectStamp } from "./priorities";
import { getFallbackChain } from "./archetypes";
import { selectStory } from "./storySelector";

// Static imports — work in ESM/Node/Vite without require/createRequire shims.
import basketballLibrary from "./libraries/basketball.json" with { type: "json" };
import baseballLibrary from "./libraries/baseball.json" with { type: "json" };
import { PLAYER_CULTURE as BASKETBALL_CULTURE } from "../../basketball/src/utils/playerCulture";
import { PLAYER_CULTURE as BASEBALL_CULTURE } from "../../baseball/src/utils/playerCulture";
import { TEAM_FLAVOR as BASKETBALL_TEAM_FLAVOR } from "../../basketball/src/utils/teamFlavor";
import { TEAM_FLAVOR as BASEBALL_TEAM_FLAVOR } from "../../baseball/src/utils/teamFlavor";

// ── Library loader ─────────────────────────────────────────────────────────

const _libraries: Record<string, CommentaryLibrary> = {
  basketball: basketballLibrary as CommentaryLibrary,
  baseball: baseballLibrary as CommentaryLibrary,
};

function loadLibrary(sport: string): CommentaryLibrary {
  return _libraries[sport] ?? {};
}

// ── Intensity (same logic as composeCommentary) ────────────────────────────

function determineIntensity(input: CommentaryInput): Intensity {
  const { winTier, totalFp, tierFloor, nextTierMin, isBust } = input;
  const margin = totalFp - (tierFloor ?? 0);
  if (isBust) {
    const gap = (nextTierMin ?? 0) > 0 ? (nextTierMin! - totalFp) : 999;
    if (gap <= 8) return "bust_close";
    if (gap <= 25) return "bust_mid";
    return "bust_bad";
  }
  switch (winTier) {
    case "LEGEND": return "legend";
    case "MVP": return "mvp";
    case "ALL_STAR": return "all_star";
    case "STARTER":
      if (margin <= 5) return "starter_barely";
      if (margin >= 15) return "starter_dominant";
      return "starter_normal";
    case "ROOKIE": return "rookie";
    default: return "starter_normal";
  }
}

// ── Result framing ─────────────────────────────────────────────────────────
// Short prefix/suffix phrases that lead the commentary with the RESULT (win/loss
// size) before star-specific content. Ensures the message reflects on the hand
// first, then gets into the star's performance.

const RESULT_FRAMING: Record<Intensity, string[]> = {
  legend: [
    "Legend-tier night.", "Historic cash.", "Top-of-the-chart hand.", "Ceiling-kissing hand.",
    "Years from now, still telling this story.", "Bottle that night.", "That one goes in the book.",
    "Top of the mountain.", "Career-defining cash.", "All-time hand.", "Goosebumps cash.",
    "One in a thousand.", "Save the box score.", "Frame this one.", "The kind you screenshot.",
    "Hall-of-fame hand.", "Statue-worthy night.", "Banner night.", "Chef's kiss cash.",
    "Rare-air payout.", "Tell your kids about this one.", "Lock-it-in legend.",
    "Once-in-a-decade hand.", "Off-the-charts cash.", "Print-it-and-pin-it night.",
  ],
  mvp: [
    "MVP-level hand.", "Huge night.", "Real money on this one.", "Serious cash.",
    "That's a number to remember.", "Money — actual money.", "Put that one in the highlight reel.",
    "Stack that in the trophy case.", "Statement payout.", "Premium cash.", "Top-shelf hand.",
    "Big-boy cash.", "Heavy ledger.", "Quality green ink.", "Proper payout.", "Substantial.",
    "That's the one.", "Headliner hand.", "Marquee night.", "Big-time cash.",
    "Gold-standard payout.", "Now we're talking.", "Notable cash.", "Properly fat ledger.",
    "Heavyweight payout.",
  ],
  all_star: [
    "Big one.", "All-Star cash.", "Real payout tonight.", "That's a hand that counts.",
    "Deep run.", "That's a hand that pays the rent.", "Real money, real satisfying.", "Pay day.",
    "Solid payout.", "Quality cash.", "Above-average hand.", "Tangible green.", "Worth the hype.",
    "Properly paid.", "Healthy ledger.", "Notable green.", "Cleanly cashed.", "Pulled it off.",
    "Lined the wallet.", "Earned it.", "Take a bow.", "Counted ledger.", "Real-deal cash.",
    "Comfortable green.", "Above-the-fold result.",
  ],
  starter_dominant: [
    "Cruised through.", "Comfortable win.", "Handled it.", "Had room to spare.",
    "Clean win with cushion.", "Felt like a choice, not a chase.", "Coasted into the payout.",
    "Easy money night.", "Wire to wire.", "Foot off the gas.", "Rolled it up.", "Ran the table.",
    "Done before the buzzer.", "Never in doubt.", "Walking-pace win.", "Casual cash.",
    "Drifted in.", "Margin to burn.", "Stress-free hand.", "Relaxed payout.",
    "Cleared with ease.", "Slid through it.", "Set and forget.", "Nothing to chase.",
    "Drove it home.",
  ],
  starter_normal: [
    "Clean hand.", "Solid cash.", "Got the job done.", "Pro night.", "Money on the board.",
    "Punched in, punched out.", "Business as usual — boring is a skill.", "Pro night, pro paycheck.",
    "Day's work.", "Standard cash.", "On-time delivery.", "Wins are wins.", "Quietly profitable.",
    "Filed and paid.", "Receipts on the table.", "Modest cash.", "Workmanlike.", "Workman's cash.",
    "Done and done.", "Posted the W.", "Closed the loop.", "Nothing fancy, paid out.",
    "Steady-state win.", "Held the line.", "Showed up, paid out.",
  ],
  starter_barely: [
    "Squeaked through.", "Held on by a thread.", "Barely held it together.", "Tight win.",
    "One play from a different result.", "Threaded the needle.", "Bend but not break.",
    "Photo finish.", "Tightrope win.", "Skin-of-teeth cash.", "Fingertip finish.",
    "Won by a hair.", "By the skin.", "Squeezed it out.", "Razor-thin margin.",
    "Wobbled across the line.", "Barely upright.", "Stumbled into green.", "Limped to cash.",
    "On the bubble until the buzzer.", "Inch-of-margin win.", "Got there, barely.",
    "Hangs together.", "Closer than the box says.", "By the eyelash.",
  ],
  // ROOKIE is the in-between zone: technically green, but not a "win" in any
  // satisfying sense. Framing should signal limbo / breakeven / survival —
  // never celebratory, never resigned. No "scraped a win" or "ugly win is
  // still a win" language.
  rookie: [
    "Held the line.", "Treaded water.", "Even-Steven.", "Refused to bust.",
    "Kept your seat at the table.", "Subsistence cash.", "Hovered above zero.",
    "Floor-level result.", "Nominal payout.", "Marginal green.", "Token return.",
    "Held position.", "Functional not festive.", "Not bust, not braggable.",
    "Pushed the chair back even.", "Hand of survival.", "Crawled across the line.",
    "Quietly survived.", "Break-even kind of night.", "Just kept the lights on.",
    "Lukewarm green.", "Stayed in the room.", "Penny-ante cash.",
    "Neither here nor there.", "Held even, held position.",
  ],
  bust_close: [
    "One card short.", "Missed it by inches.", "Right there, not quite.", "Inches from the line.",
    "So close you could taste it.", "One possession away.", "That one stings.",
    "Tantalizingly close — still zero.", "Heartbreak cash.", "Almost-cash.", "Painful inches.",
    "On the wrong side of close.", "Close enough to feel it.", "Tasted it. Lost it.",
    "Rounding-error loss.", "Missed by a possession.", "One bounce different.",
    "One free throw away.", "Brutal margin.", "Cruel inches.", "Should've cashed.",
    "Could've, didn't.", "One play short.", "Stings extra.", "A whisper from green.",
  ],
  bust_mid: [
    "Bust night.", "Came up short.", "Off night across the board.", "Didn't get there.",
    "Hand never cashed.", "Chalk it up.", "Next hand.", "Not every hand cashes.",
    "Loss column.", "Red ink.", "Move along.", "Tough hand.", "Closed in the negative.",
    "Filed under loss.", "Take the lesson.", "Never developed.", "Went sideways.",
    "Loss of the day.", "Not tonight.", "Try again.", "Miss.", "Whiff.",
    "Underwater hand.", "Below the line.", "Quiet bust.",
  ],
  bust_bad: [
    "Never had it.", "Rough all around.", "A night to forget.", "Flat from the tip.",
    "Nothing worked tonight.", "Film room won't be kind.", "Write this one off.",
    "Nothing clicked, nothing close.", "Disaster hand.", "Faceplant.", "Catastrophe.",
    "Bottom fell out.", "Roster check needed.", "Shred it.", "Sub-floor performance.",
    "Wheel-came-off night.", "Implosion.", "Burn the tape.", "Wiped out.", "Total miss.",
    "Couldn't get out of its own way.", "Off the rails.", "Nothing connected.",
    "Empty cabinet.", "Hand of dust.",
  ],
};

// Archetype-specific framing — overrides intensity framing when the ARCHETYPE
// carries a specific narrative shape the generic pool can't capture.
const ARCHETYPE_FRAMING: Partial<Record<CommentaryArchetype, string[]>> = {
  // Star delivered, team collapsed around him. Objective voice, not blanket blame.
  star_carried_loss: [
    "The star did their job. The rest didn't.",
    "One-man-band tonight — everyone else no-showed.",
    "The anchor held. The rest of the boat sank.",
    "The star brought it. The supporting cast brought nothing.",
    "The roster leaned on one guy, and the lean was the whole thing.",
    "Star delivered, team failed to hold up their end.",
    "The money card cashed in. Nobody else did.",
  ],
  // Scraped a rookie win on a low-ratio star — team made it work despite the star.
  ugly_win: [
    "Got there on a prayer and roster depth.",
    "Scraped into green without the star carrying it.",
    "The star didn't have it, and the roster made it work anyway.",
    "Not the script, but the payout is real.",
    "The team covered for the star tonight. That goes both ways.",
  ],
};

// Anchor-specific framing — for when the star IS the highest-salary roster card
// (the "waiting on the big one" reveal narrative). Fires when star.salary is
// the roster maximum. Different vocabulary for delivered vs. failed.
const ANCHOR_DELIVERED_FRAMING = [
  "The whole roster was waiting on the anchor, and they came through.",
  "Anchor delivered. That's why you pay for the big card.",
  "The money card paid its salary tonight.",
  "Everyone was leaning on the anchor to show up. They showed up.",
  "You pay that salary for nights exactly like this.",
];
const ANCHOR_FAILED_FRAMING = [
  "The roster was waiting on the anchor, and the anchor didn't come.",
  "When the money card goes quiet, the whole hand feels it.",
  "Anchor didn't cover the salary tonight.",
  "The big card went small. Hard to recover from that.",
  "The roster was built around one card. That card didn't show up.",
];

// Gap-specific near-miss framing — replaces generic bust_close framing when the
// gap is tight enough to name a specific number. Makes the "oh so close" hit.
function nearMissFraming(gap: number, seed: number): string {
  if (gap <= 1) {
    return pickSeeded([
      "One FP. ONE.",
      "Missed by less than a single point.",
      "A single FP from the next tier. Single.",
      "One point — count it on one finger.",
      "That gap was a single foul shot away from falling.",
    ], seed, 60) ?? "";
  }
  if (gap <= 3) {
    return pickSeeded([
      `${Math.ceil(gap)} FP from the line.`,
      "A made basket away. Literally one bucket.",
      "Three FP or fewer. Three.",
      "The next tier was a single possession away.",
      "That HURTS — one fewer turnover and this cashes bigger.",
    ], seed, 60) ?? "";
  }
  if (gap <= 5) {
    return pickSeeded([
      `${Math.ceil(gap)} FP from the next tier. Painfully close.`,
      "Under five FP away. One stronger line from anyone closes this.",
      "Five FP or fewer to the next level. Tight margin, sharp pain.",
      "Five points. Five. That's all this hand needed.",
    ], seed, 60) ?? "";
  }
  return "";
}

// Chad-style analogy pool — everyday-life comparisons, dry understatement, the
// occasional absurd aside. Fires as a closing beat on ~25% of short hands.
// SPORT-AGNOSTIC by design — references are domestic / pop-culture / food /
// work / commerce, NOT insider NBA/MLB/etc lore. Same pool works for basketball,
// baseball, and any future sport added to the commentary system.
const CHAD_ANALOGIES: Record<Intensity, string[]> = {
  legend: [
    "Nights like this happen about as often as your local weatherman being right.",
    "Put this one in a box in the garage. Look at it in ten years.",
    "That's the fantasy equivalent of Thanksgiving leftovers — kept giving.",
    "A hand to tell your barber about. And the barber's apprentice.",
    "This is the one you frame and hang next to the diploma you never actually use.",
    "Ceiling hands like this deserve a plaque. Or at least a fridge magnet.",
    "This hand is what other hands measure themselves against at weddings.",
    "The kind of result that makes you silent for two minutes, then obnoxious for two hours.",
    "Historic like your grandmother's casserole recipe — and nobody else can pull it off.",
    "Generations from now, archaeologists will find this ledger and nod solemnly.",
    "The hand equivalent of finding a Stradivarius at a garage sale.",
    "Performance like this gets you a parade, if your neighborhood had parades.",
    "Put this one in the shoebox under the bed next to the savings bond from 1997.",
    "This is the night they name a local sandwich after you.",
    "Rare like a functioning self-checkout lane. Take a moment.",
  ],
  mvp: [
    "Felt like ordering takeout and getting a bonus side.",
    "That's the fantasy equivalent of finding the last parking spot near the door.",
    "Paid the bills and then some. Leftover money is the best money.",
    "Star delivered like a pizza in a rainstorm — miraculous, slightly soggy, worth every dollar.",
    "A hand this clean deserves a compliment from someone it doesn't know.",
    "The kind of night where even your cynical friend has to admit it was something.",
    "Real money — the kind that doesn't quietly leave your bank account by Wednesday.",
    "The hand equivalent of the upgraded hotel room you didn't book.",
    "Earned the paycheck. Earned a second paycheck we don't talk about.",
    "The night you get to be insufferable about it. Don't waste the window.",
    "Result you text your cousin about. Twice.",
    "The kind of hand that fills the birthday envelope AND the birthday card.",
    "Fantasy money that feels earned, which is rare these days.",
    "Like your order arriving exactly on time AND hot. Take a moment.",
    "That hand had more protein than a steakhouse sampler.",
  ],
  all_star: [
    "Real money, and the kind that makes you briefly consider believing in things.",
    "Paperwork cashed, memory filed, evening made.",
    "The fantasy equivalent of the waiter bringing a free appetizer you didn't order.",
    "This is what the hype is for. Not the hype itself — the hype EARNS this.",
    "Green ink with texture. The kind you can feel through the page.",
    "The hand equivalent of nailing the parallel park on the first try, with witnesses.",
    "Paid rent and then some. The and-then-some is what you remember.",
    "Like a surprise upgrade at the airport — somehow both deserved and undeserved.",
    "The hand you mention at Thanksgiving in place of being interesting.",
    "Real money, real night, real reason to feel okay about Wednesday.",
    "Cashed the way a well-written letter reads — clean, intentional, nothing extra.",
    "Your roster just earned a cheat day. Use it wisely.",
    "The kind of hand that makes the scorekeeper circle the total.",
    "Hand delivered with a bow. Somebody put effort in tonight.",
    "Big one. The good kind of 'big one' — not the one you avoid mentioning.",
  ],
  starter_dominant: [
    "Cruise control, not luck. Different zip code entirely.",
    "Professional result, professionally obtained. No drama, no complaints, no overtime.",
    "This is what happens when you read the projections and decide to believe them.",
    "The hand equivalent of signing a contract in triplicate and everyone showing up on time.",
    "Boring excellence. The most underrated flavor in the game.",
    "Like watching a TV remote work on the first press. Rare. Deserved.",
    "Cruised through like a Tuesday. Quiet and efficient.",
    "The hand equivalent of hitting every green light on the commute.",
    "Comfortable like the couch you've owned for twelve years.",
    "Not flashy. Not confused. Just got it done — the middle child of good hands.",
    "This was the IKEA assembly where you actually followed the instructions.",
    "Paid like a Wednesday. No surprise, no complaints.",
    "Result delivered with the same energy as your hairdresser saying 'looking good.'",
    "Solid the way your car is solid — does the thing, doesn't ask questions.",
    "The hand equivalent of getting exactly the change you expected.",
  ],
  starter_normal: [
    "Not memorable. That's the point.",
    "Solid like a desk — not exciting, but you need one.",
    "Paycheck hand. No style points in the ledger.",
    "The hand your accountant would give a tasteful thumbs-up.",
    "Business casual. Got the job done in khakis.",
    "Not the story you tell. Still the hand that paid the tab.",
    "Result like a successful trip to Costco — you got what you came for and left.",
    "Middle-of-the-road hand. The road gets you there fine; nobody's writing songs about it.",
    "Got it done with the same energy as paying bills on time.",
    "The hand equivalent of the standard car wash. Clean, quiet, done.",
    "No fireworks, no dumpster fires. Just a night that passed through efficiently.",
    "Cashed like a tax refund you forgot you were getting.",
    "The kind of night where the scoreboard ticked forward and nobody raised their voice.",
    "Result with the drama of folded laundry.",
    "Not going in the highlight reel. Going in the ledger. That's the trade.",
  ],
  starter_barely: [
    "Squeaked through like a kid in algebra with a tutor's help.",
    "Photo finish. The scoreboard operator did a double-take.",
    "Close enough that you felt it in your chest. Cash is still cash.",
    "The fantasy equivalent of catching the door before it closes on the elevator. Made it.",
    "Threaded the needle with the thread already fraying.",
    "The kind of night your cardiologist would raise an eyebrow at.",
    "Made the cut like the last seat on Southwest. Uncomfortable but seated.",
    "Threaded a needle in the dark. Nobody's asking how — just that it happened.",
    "Tighter than airport security on Christmas Eve.",
    "Close calls in fantasy earn you frequent-flyer anxiety. This was one of those.",
    "Held on the way you hold a sandwich while walking — delicately, intently.",
    "One play from heartbreak, one play into cash. That's the margin.",
    "Made it by the skin of whatever the teeth's skin is called.",
    "Bend-don't-break hand. Bent like yoga, didn't snap.",
    "The elevator doors closed on the bag but the bag made it through. So did this hand.",
  ],
  // ROOKIE Chad analogies — match the in-between framing of the rookie pool.
  // Survival, equilibrium, holding pattern — never "won ugly" celebration.
  rookie: [
    "The hand equivalent of paying rent on the 1st. Didn't gain ground; didn't lose it.",
    "Like clearing the inbox to zero. Nothing accomplished, nothing pending.",
    "The fantasy equivalent of finding exact change. Useful, not memorable.",
    "Held position like a parked car in a tight spot. There, but not going anywhere.",
    "Stood your ground the way you stand at a slow-moving DMV line.",
    "Treadmill cash. The ledger moved its feet, the ledger went nowhere.",
    "Ledger held its breath. Didn't exhale until the buzzer.",
    "Like watching paint dry — except at the end the wall is still beige.",
    "Energy of a midweek leftover lunch. Sustenance without occasion.",
    "Net-zero hand with a slight green tint. Officially in the room.",
    "Result with the drama of folded laundry. Necessary, finished.",
    "Hand of in-between. Not the loss; not the win you'd tell anyone about.",
    "The ledger-equivalent of a truce. Both sides walked away.",
    "Showed up, signed in, signed out. Neither here nor there.",
    "Quiet cash, the kind that arrives in a blank envelope.",
  ],
  bust_close: [
    "Closer than a drive-thru line at noon, and equally frustrating.",
    "The slow-motion walk into a glass door.",
    "The next tier sat right there like your phone on the nightstand, unreachable.",
    "The fantasy gods had the envelope ready and changed their minds at the podium.",
    "That was the heart-attack in the waiting room. Dressed up. Went nowhere.",
    "Tonight had a coupon that expired at the register.",
    "So close it made the hand shake a little. Then it didn't cash.",
    "That one ended like an autoplay episode getting cut off by buffering.",
    "Hit the door with a cart full of groceries and the door didn't open.",
    "Inches from the line and not a step further. The kind of inches that keep you up.",
    "You saw the finish and the finish saw you and nothing happened.",
    "Lost it at the register like someone asked for ID on your birthday.",
    "The gap was laughable, which made it worse.",
    "One point short. The saddest number in sports.",
    "Felt like texting the right person the wrong message. Recoverable. Still a sting.",
  ],
  bust_mid: [
    "Read the room, took a loss.",
    "Nothing showed up to work tonight. Send the timecards back.",
    "Chalk it. Chalk is honest.",
    "Your roster did less than a Netflix recommendation algorithm tonight.",
    "The hand equivalent of a Monday meeting that got rescheduled to Friday at 5.",
    "Everybody turned in their assignment three weeks late. Unacceptable.",
    "A night that belongs in the folder labeled 'do not revisit.'",
    "Result with the warmth of a leftover pizza from last Tuesday.",
    "The ledger took a nap and nobody woke it up.",
    "That was the group text everyone muted. Eventually they muted the group itself.",
    "This hand had the energy of a line at the post office. And similar outcomes.",
    "Like an unreplied-to email with 'urgent' in the subject.",
    "Chalk this one up and take the night off of thinking.",
    "Tonight's cash receipt was unfortunately in red ink.",
    "Not great, not catastrophic. Just a loss that rhymes with 'again.'",
  ],
  bust_bad: [
    "Tonight got marked 'return to sender.'",
    "Burn the film. Skip the postmortem.",
    "Tonight was a group project where everyone ghosted.",
    "The supporting cast brought less than a potluck where everyone brought chips.",
    "Your roster did less than a corporate HR email about the ping-pong tournament.",
    "This is what happens when you bring a salad to a barbecue.",
    "Your lineup showed up like airport security on a holiday weekend — late, unhelpful, unpleasant.",
    "A hand so flat you could serve dinner on it.",
    "The kind of night where even the loser's bracket isn't interested.",
    "Roster performance was the algorithm showing you ads for things you already bought.",
    "Tonight was a customer service hold song on loop.",
    "Sound of silence from the entire lineup. Not artistic. Just silent.",
    "The ledger asked for its money back and the lineup pretended not to hear.",
    "Tonight was the IKEA assembly with three missing screws and a spite-filled allen wrench.",
    "This hand had the energy of an email sent Friday at 4:59 PM that nobody reads until Monday.",
  ],
};

// Ring buffer of recently-used Chad analogies to prevent back-to-back repeats.
// Module-level state (per-session); resets on page reload. Window size covers
// the most-common intensity pool size so we won't repeat within a single run.
const RECENT_ANALOGIES = new Set<string>();
const RECENT_ANALOGIES_WINDOW = 15;

function pickChadAnalogy(intensity: Intensity, seed: number): string {
  const pool = CHAD_ANALOGIES[intensity];
  if (!pool || pool.length === 0) return "";
  const start = Math.abs(seed) % pool.length;
  // Walk the pool starting at seed-derived offset, return first entry not in
  // the recent-use set. Guarantees no repeat within the window.
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(start + i) % pool.length];
    if (!RECENT_ANALOGIES.has(candidate)) {
      RECENT_ANALOGIES.add(candidate);
      if (RECENT_ANALOGIES.size > RECENT_ANALOGIES_WINDOW) {
        // Set iteration preserves insertion order — first() is oldest
        const first = RECENT_ANALOGIES.values().next().value;
        if (first) RECENT_ANALOGIES.delete(first);
      }
      return candidate;
    }
  }
  // All pool entries seen recently — return seed-default anyway (rare)
  return pool[start];
}

// ── Beat connectives ───────────────────────────────────────────────────────
// Joins two sentence-beats using one of several natural connectives.
// Rotates by seed+nonce so each joint in the same output can pick differently,
// producing flowing variety instead of rigid period-delimited fragments.
//
//   period   (. )         — default, distinct beats
//   emdash   ( — )        — flowing, invites continuation
//   comma    (, )         — tightest flow; requires lowercasable continuation

/** First word is a common sentence starter we can safely lowercase after a comma. */
// NEVER add acronyms or game-tier names here. `maybeLowerFirst` only lowercases
// char 0, so MVP → mVP. Tier-name words also drift "All-Star" → "all-Star".
const SAFE_LOWERCASE_STARTERS = /^(the|a|an|this|that|these|those|it|its|we|he|she|they|you|your|when|if|because|after|before|even|still|but|and|while|though|so|cash|green|money|real|not|no|nothing|solid|clean|barely|scraped|minimum|pay|pro|photo|threaded|held|tight|one|huge|big|historic|top|serious|deep|quiet|tonight|tomorrow|paid|closed|paperwork)\b/i;

/** Lowercase first letter only when safe (common starter words, not proper nouns). */
function maybeLowerFirst(s: string): string {
  const trimmed = s.trim();
  if (SAFE_LOWERCASE_STARTERS.test(trimmed)) {
    return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  }
  return trimmed;
}

/** Returns true if lowercasing the first word of `s` would be grammatical. */
function canLowercaseFirst(s: string): boolean {
  return SAFE_LOWERCASE_STARTERS.test(s.trim());
}

/** Join two beats with a seed-rotating connective. Position-aware so the second
 *  beat's capitalization is preserved when the connective demands it.
 *  Avoids em-dash stacking — if either side already contains " — ", fall back
 *  to period or comma so we don't produce fragmented "A — B — C — D" patterns. */
function joinBeats(a: string, b: string, seed: number, nonce: number, allowComma: boolean): string {
  const cleanA = a.replace(/[\s.!?;:,—-]+$/, "");
  const bTrim = b.trim();
  const alreadyHasEmDash = cleanA.includes(" — ") || bTrim.includes(" — ");
  const commaHeavy = (cleanA.match(/,/g)?.length ?? 0) >= 2;
  const canComma = allowComma && !commaHeavy && canLowercaseFirst(bTrim);
  const mode = Math.abs(Math.floor((seed + nonce * 13) / 3)) % 5;

  // Em-dash already present on either side — em-dash stacking looks fragmented.
  // Prefer comma-join when safe; otherwise fall back to period.
  if (alreadyHasEmDash) {
    if (canComma) return `${cleanA}, ${maybeLowerFirst(bTrim)}`;
    return `${cleanA}. ${bTrim}`;
  }
  // Comma-join — only when second beat lowercases cleanly AND first beat
  // isn't already comma-heavy (avoids run-on feel).
  if (mode === 0 && canComma) return `${cleanA}, ${maybeLowerFirst(bTrim)}`;
  // Em-dash — 60% of rolls, natural flow
  if (mode === 0 || mode === 1 || mode === 2) return `${cleanA} — ${bTrim}`;
  // Period fallback — always safe.
  return `${cleanA}. ${bTrim}`;
}

// Nickname-based framing — uses a cultured player's nickname for a personal touch.
// Templates work with or without "The" prefix ("The Joker delivered.", "Greek Freak delivered.")
const NICKNAME_WIN_FRAMING = [
  "{nick} delivered.",
  "{nick} was cooking.",
  "{nick} showed up.",
  "{nick} in his bag tonight.",
  "That's {nick} for you.",
  // "{nick} did what {nick} does." removed — double-substitution made
  // long nicknames ("Easy Money Sniper did what Easy Money Sniper does.")
  // collide with cultureSecondary lines that also reference the player.
  "Vintage {nick}.",
  "{nick} on his stuff.",
];
const NICKNAME_BUST_FRAMING = [
  "Not {nick}'s night.",
  "{nick} couldn't save it.",
  "{nick} had nothing tonight.",
  "Quiet one from {nick}.",
  "Even {nick} went dark.",
  "{nick} took the night off, apparently.",
];

/** Generic framing from RESULT_FRAMING pool keyed by intensity. */
function genericFraming(intensity: Intensity, seed: number): string {
  const pool = RESULT_FRAMING[intensity];
  return pool ? (pickSeeded(pool, seed, 50) ?? "") : "";
}

/** Nickname-templated framing — personal touch using culture.nicknames. */
function nicknameFraming(culture: CultureShape | null, isBust: boolean, seed: number): string {
  if (!culture?.nicknames?.length) return "";
  const nick = pickSeeded(culture.nicknames, seed, 80);
  if (!nick) return "";
  const pool = isBust ? NICKNAME_BUST_FRAMING : NICKNAME_WIN_FRAMING;
  const tmpl = pickSeeded(pool, seed, 85);
  return tmpl ? tmpl.replace(/\{nick\}/g, nick) : "";
}

/** Culture-line framing — pulls a full line from overperform/onPace/underperform
 *  when tonally appropriate. These are the witty player-voice lines already
 *  written in PLAYER_CULTURE (e.g. "Jokić doing Jokić things - efficient, dominant, boring to haters.")
 *  Lines that mention non-star roster members are filtered out so a teammate
 *  doesn't get credited for the star's individual performance. */
function cultureFraming(
  culture: CultureShape | null,
  intensity: Intensity,
  starRatio: number,
  isBust: boolean,
  seed: number,
  star: { name?: string } | null = null,
  roster: Array<{ name?: string }> = [],
): string {
  if (!culture) return "";
  const sl = ((star as any)?.statLine ?? {}) as Record<string, number | undefined>;
  const safe = (lines: string[]): string[] =>
    lines.filter(l =>
      !lineNamesNonStarRosterMember(l, star, roster) &&
      !lineCitesMismatchedStat(l, sl)
    );
  // Busts → underperform pool
  if (isBust && (culture as any).underperform?.length) {
    return pickSeeded(safe((culture as any).underperform), seed, 90) ?? "";
  }
  // High-ratio wins (big games) → overperform pool
  const isBigWin = intensity === "all_star" || intensity === "mvp" || intensity === "legend";
  if (!isBust && starRatio >= 1.2 && isBigWin && (culture as any).overperform?.length) {
    return pickSeeded(safe((culture as any).overperform), seed, 90) ?? "";
  }
  // Normal wins → onPace pool
  if (!isBust && (culture as any).onPace?.length) {
    return pickSeeded(safe((culture as any).onPace), seed, 90) ?? "";
  }
  return "";
}

/** Blended framing: rotates between archetype-specific, anchor-aware, generic,
 *  nickname, and full culture line sources based on seed + context. Higher-signal
 *  sources (archetype, anchor, near-miss gap) fire first when applicable;
 *  remaining hands rotate through the variety layers. */
function pickFraming(
  intensity: Intensity,
  archetype: CommentaryArchetype,
  seed: number,
  culture: CultureShape | null,
  starRatio: number,
  isBust: boolean,
  isAnchor: boolean,
  gapToNextTier: number,
  star: { name?: string } | null = null,
  roster: Array<{ name?: string }> = [],
): string {
  const r = Math.abs(seed) % 10;

  // Priority 1: gap-specific near-miss framing (bust within 5 FP of next tier)
  if (isBust && gapToNextTier > 0 && gapToNextTier <= 5 && r < 4) {
    const nm = nearMissFraming(gapToNextTier, seed);
    if (nm) return nm;
  }

  // Priority 2: archetype-specific framing (star_carried_loss, ugly_win) — 40% when available
  const archPool = ARCHETYPE_FRAMING[archetype];
  if (archPool && r < 4) {
    const af = pickSeeded(archPool, seed, 55);
    if (af) return af;
  }

  // Priority 3: anchor-aware framing — only when result and anchor perf match
  //   delivered = WIN + anchor at/above projection
  //   failed    = LOSS + anchor below projection
  // Prevents "money card went quiet" framing from firing on winning hands.
  if (isAnchor && r < 3) {
    if (!isBust && starRatio >= 1.0) {
      const af = pickSeeded(ANCHOR_DELIVERED_FRAMING, seed, 70);
      if (af) return af;
    } else if (isBust && starRatio < 1.0) {
      const af = pickSeeded(ANCHOR_FAILED_FRAMING, seed, 70);
      if (af) return af;
    }
  }

  // Priority 4: nickname framing (short player flavor) — 20%
  if (r < 2) {
    const nf = nicknameFraming(culture, isBust, seed);
    if (nf) return nf;
  }

  // Priority 5: full culture line (witty player voice) — 20%
  if (r >= 2 && r < 4) {
    const cf = cultureFraming(culture, intensity, starRatio, isBust, seed, star, roster);
    if (cf) return cf;
  }

  // Default: generic framing
  return genericFraming(intensity, seed);
}

/** Apply framing to a main line with variety.
 *  Three modes cycled by seed:
 *    - lead: "{framing} {main}" — result first, star follows
 *    - close: "{main} {framing}" — star first, result reflection at end
 *    - none: "{main}" — template/override stands alone
 *  `forceFraming=true` (for short override-path lines) skips the "none" mode. */
function applyFraming(
  main: string,
  intensity: Intensity,
  archetype: CommentaryArchetype,
  seed: number,
  culture: CultureShape | null,
  starRatio: number,
  isBust: boolean,
  isAnchor: boolean,
  gapToNextTier: number,
  forceFraming = false,
  star: { name?: string } | null = null,
  roster: Array<{ name?: string }> = [],
): string {
  // Achievement archetypes (priority-0 in classifyArchetype) MUST lead with the
  // achievement itself — but we no longer suppress framing/analogy entirely.
  // Instead the mode selection below restricts achievement archetypes to
  // CLOSER-only positions (modes 1/2/3) so framing and analogy add bulk as
  // tail beats without burying the headline.
  const isAchievement = (
    archetype === "historic_record" ||
    archetype === "historic_career" ||
    archetype === "historic_season"
  );

  // LEGEND gets the analogy ~75% of the time (down from auto-fire pre-T2 fix
  // which drove mean length to 173, but back from the 0% T2-overfit). Other
  // high-signal triggers stay deterministic.
  const legendHighSignal = intensity === "legend" && Math.abs(Math.floor(seed / 17)) % 4 < 3;

  // Optional Chad-style closing analogy. Triggers:
  //   1. High-signal moment — narratively big archetype/intensity earns color.
  //   2. Length floor — primaries < 100 chars waste 3+ UI rows; always extend.
  //   3. Seed-gated default — ~25% of remaining short-ish primaries (< 150 chars).
  //   4. Achievement archetypes — 50% gate (adds bulk without burying headline).
  // Applied AFTER framing so the flow reads as: [framing?] [main template] [analogy?]
  const isHighSignal = (
    archetype === "career_night" ||
    archetype === "star_carried_loss" ||
    archetype === "collapse" ||
    archetype === "badge_explosion" ||
    legendHighSignal ||
    intensity === "bust_close"
  );
  const isVeryShort = main.length < 100;
  const chadGate = Math.abs(Math.floor(seed / 11)) % 4;
  const wantsChad = (
    (isAchievement && chadGate < 2 && main.length < 180) ||  // 50% on historic_*
    (!isAchievement && (
      (isHighSignal && main.length < 220) ||
      isVeryShort ||
      (chadGate === 0 && main.length < 150)
    ))
  );
  const analogy = wantsChad ? pickChadAnalogy(intensity, seed) : "";

  const framing = pickFraming(intensity, archetype, seed, culture, starRatio, isBust, isAnchor, gapToNextTier, star, roster);

  const withAnalogy = (s: string) => {
    if (!analogy) return s;
    const core = analogy.toLowerCase().replace(/[^a-z\s]/g, "").trim().slice(0, 30);
    if (core && s.toLowerCase().includes(core)) return s;
    // Analogies are descriptor-style — comma-join is natural when safe
    return joinBeats(s, analogy, seed, 23, true);
  };

  // Skip framing if its words already appear in the main line — avoids
  // "Clean hand. ...Clean hand." style robotic repetition.
  const fcore = framing ? framing.toLowerCase().replace(/[^a-z\s]/g, "").trim() : "";
  const framingDup = fcore.length > 3 && main.toLowerCase().includes(fcore);
  const usableFraming = framing && !framingDup ? framing : "";

  // Six output shapes. Picked by seed so the structure varies across hands
  // instead of always reading "framing → main → analogy". Modes that need a
  // missing piece fall back to the next compatible mode, so this never errors.
  //
  //   0  framing → main → trailing analogy   (lead-framing, classic)
  //   1  main → framing → trailing analogy   (close-framing)
  //   2  main → trailing analogy             (no framing)
  //   3  main alone                          (compact — no framing, no analogy)
  //   4  analogy → main                      (analogy-led — verdict opens)
  //   5  framing → main                      (no analogy — clean two-beat)
  //
  // forceFraming (cultureOverride callers) restricts to framing-included
  // shapes — short override fragments need a result-aware lead/close. To
  // preserve variance on those paths, modes 0, 1, and 5 are reachable
  // (lead+analogy, close+analogy, lead-only). Modes that drop framing (2,3,4)
  // are excluded.
  //
  // Achievement archetypes (historic_*) restrict to modes 2 and 3:
  //   2  main → analogy   (achievement leads, Chad analogy closes — adds bulk)
  //   3  main alone       (bare — clean breath, secondary line still adds flavor)
  // Mode 1 (framing closer) is excluded because RESULT_FRAMING is tier-keyed
  // to the hand's totalFp — a career-high win that only cashed ROOKIE would
  // close with "Take the cash, forget the mechanics", which clashes with
  // the achievement headline. Skipping framing avoids the tier mismatch.
  let mode: number;
  if (isAchievement) {
    const achGate = Math.abs(Math.floor(seed / 7)) % 5;
    mode = achGate < 3 ? 2 : 3; // 60% analogy, 40% bare
  } else {
    const rawMode = Math.abs(Math.floor(seed / 7)) % (forceFraming ? 3 : 6);
    mode = forceFraming && rawMode === 2 ? 5 : rawMode;
  }

  const lead = () => usableFraming
    ? joinBeats(usableFraming, main, seed, 11, false)
    : main;
  const close = () => usableFraming
    ? joinBeats(main, usableFraming, seed, 17, true)
    : main;

  switch (mode) {
    case 5:
      // framing → main, no analogy
      return usableFraming ? lead() : main;
    case 4:
      // analogy → main, no framing
      if (analogy) return joinBeats(analogy, main, seed, 23, false);
      return withAnalogy(lead());
    case 3:
      // bare main, no framing, no analogy (compact)
      return main;
    case 2:
      // no framing, trailing analogy
      return withAnalogy(main);
    case 1:
      // main → framing → trailing analogy
      return withAnalogy(close());
    case 0:
    default:
      // framing → main → trailing analogy
      return withAnalogy(lead());
  }
}

// ── Culture lookup ─────────────────────────────────────────────────────────

/** Structural subset of PlayerCulture used by the override/enrichment layer.
 *  Intentionally loose — sport-specific culture shapes may include more fields. */
export interface CultureShape {
  nicknames?: string[];
  // Phase 1 — situational/specific
  bigGame?: string[];
  quietGame?: string[];
  defensive?: string[];
  streakLines?: string[];
  opponentFlavor?: Record<string, string>;
  signatureGames?: Array<{ date: string; opponent: string; line: string; fp?: number }>;
  // Phase 2 — flavor pool (weighted-random selection)
  milestones?: string[];
  rivalry?: string[];
  controversy?: string[];
  salaryNarrative?: string[];
  teamContext?: string[];
  draftAndPath?: string[];
  formerTeam?: string[];
}

const _cultureDb: Record<string, Record<string, CultureShape>> = {
  basketball: BASKETBALL_CULTURE as unknown as Record<string, CultureShape>,
  baseball: BASEBALL_CULTURE as unknown as Record<string, CultureShape>,
};

/** True when the nickname is "iconic" — distinctive enough to use vs. just a
 *  trivial first/last-name shortening. Filters "Mike", "Tony", "Bibby" but
 *  passes "Penny", "Big Ben", "El Contusion", "Mr. Big Shot". */
function isIconicNickname(nick: string, fullName: string): boolean {
  if (nick.length < 4) return false;
  const parts = fullName.trim().split(/\s+/);
  const first = (parts[0] ?? "").toLowerCase();
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  const n = nick.toLowerCase();
  return n !== first && n !== last;
}

/** Tier-gated culture lookup.
 *    RED, ORANGE          → always return culture if present
 *    PURPLE               → only when ≥1 iconic nickname exists, ~30% of hands
 *    BLUE, GREEN, WHITE   → never (prevents misattribution like
 *                            "Anthony Carter" → Vince Carter's "Vinsanity")
 *    undefined/missing    → permissive (legacy/test paths) */
// Track legacy-fallback warnings so we don't spam the console — log each
// missing basePlayerId once per session.
const _cultureFallbackWarned = new Set<string>();

/** Strip accents + non-alphanumerics from the last-name token. Mirrors the
 *  normalization used to mint the new culture keys (`lastname_basePlayerId`). */
function normalizeLastForKey(name: string): string {
  const parts = name.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  const last = (parts[parts.length - 1] ?? "");
  return last
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** Era overlay: when the player's culture entry has a `teamEras[team]`
 *  block matching the card's team, return a copy of the culture object
 *  with era-specific framing replacing tier1/bigGame[0]/quietGame[0].
 *  Other fields pass through unchanged. */
function applyEraOverlay(culture: any, team: string | undefined): any {
  if (!team || !culture?.teamEras) return culture;
  const era = culture.teamEras[team.toUpperCase()];
  if (!era) return culture;
  const overlay: any = { ...culture };
  if (Array.isArray(era.framing) && era.framing.length) {
    overlay.tier1 = era.framing;  // era framing replaces generic tier1 lines
  }
  if (era.bigGameVariant && Array.isArray(culture.bigGame)) {
    overlay.bigGame = [era.bigGameVariant, ...culture.bigGame.slice(1)];
  }
  if (era.quietGameVariant && Array.isArray(culture.quietGame)) {
    overlay.quietGame = [era.quietGameVariant, ...culture.quietGame.slice(1)];
  }
  return overlay;
}

function lookupCulture(
  name: string,
  sport: string,
  cardTier?: string,
  seed = 0,
  basePlayerId?: string,
  team?: string,
): CultureShape | null {
  const tier = (cardTier ?? "").toUpperCase();
  if (tier === "BLUE" || tier === "GREEN" || tier === "WHITE") return null;

  const db = _cultureDb[sport];
  if (!db) return null;

  const last = normalizeLastForKey(name);
  let culture: any = null;

  // [CULTURE_LOOKUP_V2] Primary: composite key `lastname_basePlayerId` so
  // multi-player last names (Wallace, Gasol, Jordan, Davis, etc.) disambiguate
  // cleanly. Falls back to legacy last-name lookup with a once-per-session
  // warning when basePlayerId is missing or absent from the culture DB.
  if (basePlayerId) {
    const compositeKey = `${last}_${basePlayerId}`;
    culture = db[compositeKey] ?? null;
    if (!culture) {
      const fallbackKey = `legacy:${last}:${basePlayerId}`;
      if (!_cultureFallbackWarned.has(fallbackKey)) {
        _cultureFallbackWarned.add(fallbackKey);
        // eslint-disable-next-line no-console
        console.warn(`[culture] no entry for ${compositeKey}; falling back to last-name lookup`);
      }
      culture = db[last] ?? null;
    }
  } else {
    const fallbackKey = `legacy:${last}:nobid`;
    if (!_cultureFallbackWarned.has(fallbackKey)) {
      _cultureFallbackWarned.add(fallbackKey);
      // eslint-disable-next-line no-console
      console.warn(`[culture] missing basePlayerId for "${name}"; using last-name lookup`);
    }
    culture = db[last] ?? null;
  }

  if (!culture) return null;

  if (tier === "PURPLE") {
    const hasIconic = (culture.nicknames ?? []).some((n: string) => isIconicNickname(n, name));
    if (!hasIconic) return null;
    // ~30% probabilistic gate — keep PURPLE culture rare and signal-y
    const gate = Math.abs(Math.floor(seed / 13)) % 10;
    if (gate >= 3) return null;
  }

  // Apply era overlay AFTER tier gate so the gate logic sees generic culture.
  return applyEraOverlay(culture, team);
}

/** [JORDAN_EXEMPTION_V1] Always-fire-secondary surfacing. Returns a single
 *  Chad-voice line when the roster contains a player flagged with
 *  `alwaysFireSecondary: true` and that player is NOT the focused star.
 *  Currently only Michael Jordan (basePlayerId 893) carries the flag, but
 *  the gate is generic — adding another exemption is just setting the flag
 *  + populating secondaryAlways on a different entry. Line resolution
 *  prefers era-specific `teamEras[team].secondary[]` over generic
 *  `secondaryAlways[]`. Returns null when the roster has no flagged
 *  non-star or when the flagged player has no usable lines.
 *
 *  The caller appends the returned line to the commentary output's
 *  secondary slot — distinct from the primary tactical line — so the
 *  star's commentary still owns the lead. */
export function selectAlwaysFireSecondary(
  roster: CommentaryRosterCard[],
  star: CommentaryRosterCard | null,
  sport: string,
  seed = 0,
): string | null {
  const db = _cultureDb[sport];
  if (!db) return null;
  for (const card of roster) {
    if (!card.basePlayerId) continue;
    if (star && card.basePlayerId === star.basePlayerId) continue;
    const compositeKey = `${normalizeLastForKey(card.name)}_${card.basePlayerId}`;
    const culture: any = db[compositeKey];
    if (!culture?.alwaysFireSecondary) continue;
    // Prefer era-specific secondary, fall back to generic
    const eraSecondary = (card.team && culture.teamEras?.[card.team.toUpperCase()]?.secondary) || null;
    const generic = culture.secondaryAlways ?? null;
    const pool: string[] | null =
      (Array.isArray(eraSecondary) && eraSecondary.length) ? eraSecondary :
      (Array.isArray(generic) && generic.length) ? generic : null;
    if (!pool) continue;
    return pickSeeded(pool, seed, 0);
  }
  return null;
}

// ── Team flavor lookup (basketball only) ───────────────────────────────────

interface TeamFlavorEntry { identity: string; hype: string; cold: string; humor: string; }
const _teamFlavorDb: Record<string, Record<string, TeamFlavorEntry>> = {
  basketball: BASKETBALL_TEAM_FLAVOR as Record<string, TeamFlavorEntry>,
  baseball: BASEBALL_TEAM_FLAVOR as Record<string, TeamFlavorEntry>,
};

function lookupTeamFlavor(opp: string | undefined, sport: string): TeamFlavorEntry | null {
  if (!opp) return null;
  const db = _teamFlavorDb[sport];
  if (!db) return null;
  return db[opp.toUpperCase()] ?? null;
}

// ── Seed-based random ──────────────────────────────────────────────────────

function seededRandom(seed: number, index: number): number {
  const raw = (seed * 9301 + 49297 + index * 7919) % 233280;
  return (raw < 0 ? raw + 233280 : raw) / 233280;
}

function pickSeeded<T>(arr: T[], seed: number, index = 0): T | null {
  if (!arr.length) return null;
  return arr[Math.abs(Math.floor(seed + index * 7919)) % arr.length];
}

function statN(c: any, key: string): number {
  const s = c?.statLine ?? {};
  return Number(s[key] ?? s[key.toUpperCase()] ?? s[key.toLowerCase()] ?? 0);
}

function lastName(n: string): string {
  const parts = n.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? n;
}

/** True when a culture line cites a specific stat value (e.g. "64-point game",
 *  "20 assists") that doesn't match the star's stats in the CURRENT game. These
 *  lines come from culture pools (opponentFlavor, bigGame, overperform) and
 *  reference HISTORICAL games — not the played game. When the cited number
 *  doesn't match what the star actually did tonight, the line reads as if the
 *  engine is making up stats (Giannis 37 pts vs IND tonight, but commentary
 *  says "his 64-point game" — the 64 is from a different night).
 *
 *  Lines with no stat citations are always allowed. Citations within ±1 of the
 *  current value pass (rounding tolerance). Bare numbers without a stat-word
 *  context (years, jersey numbers) are ignored. */
/** True when a culture line reads as a historical aside (year reference,
 *  specific opponent matchup, MVP year, etc.) rather than generic flavor.
 *  Used to keep cultureSecondary tied to the CURRENT hand — Westbrook's
 *  "57 vs. the Magic 2015 in a single half" should not appear as a
 *  secondary line on a 35/21/14 night vs IND. */
export function lineLooksHistorical(line: string): boolean {
  if (!line) return false;
  // 4-digit year (1900-2099). These are almost always historical claims.
  if (/\b(19|20)\d{2}\b/.test(line)) return true;
  // "vs" / "vs." followed by a team-name token (3+ letters). Catches the
  // "57 vs. the Magic", "vs Houston", "vs the Lakers" pattern.
  if (/\bvs\.?\s+(the\s+)?[A-Za-z][A-Za-z'-]{2,}/i.test(line)) return true;
  // "back in", "in 20XX", "since 19XX", "1996 draft", etc.
  if (/\b(back in|since|year of)\s+(19|20)\d{2}/i.test(line)) return true;
  // Specific game/playoffs references with a year.
  if (/\b(finals|playoff|championship|all-star|all star)\s+(of\s+)?(19|20)?\d{2}/i.test(line)) return true;
  return false;
}

export function lineCitesMismatchedStat(
  line: string,
  statLine: Record<string, number | undefined> = {},
): boolean {
  if (!line) return false;
  // Build the set of "current" values the star actually has.
  const get = (k: string): number => Number(statLine[k] ?? statLine[k.toUpperCase()] ?? 0);
  const currentByCategory: Record<string, number> = {
    pts: get("pts"),
    reb: get("reb"),
    ast: get("ast"),
    stl: get("stl"),
    blk: get("blk"),
  };
  // Pattern: a number (10-200, two-or-three digits) followed by a stat word
  // (with optional hyphen / space, optional plural-s). Anchored on stat words
  // to avoid matching years (2024), jersey numbers ("#34"), draft picks, etc.
  // Lookbehind also rejects digits AND commas — the latter prevents matching
  // the trailing "000 points" inside thousands-suffixed career totals like
  // "15,000 points" / "30,000-point club", which are season/career milestones
  // and not single-game stat citations.
  const STAT_WORD = "(point|points|pts|pt|assist|assists|ast|rebound|rebounds|reb|board|boards|steal|steals|stl|block|blocks|blk)";
  const PATTERN = new RegExp(`(?<![\\d,])(\\d{2,3})[\\s-]+${STAT_WORD}\\b`, "gi");
  // Map the matched stat word back to a canonical category key.
  const wordToCategory = (w: string): string => {
    const lw = w.toLowerCase();
    if (lw.startsWith("pt") || lw.startsWith("point")) return "pts";
    if (lw.startsWith("ast") || lw.startsWith("assist")) return "ast";
    if (lw.startsWith("reb") || lw.startsWith("rebound") || lw.startsWith("board")) return "reb";
    if (lw.startsWith("stl") || lw.startsWith("steal")) return "stl";
    if (lw.startsWith("blk") || lw.startsWith("block")) return "blk";
    return "";
  };
  for (const m of line.matchAll(PATTERN)) {
    const cited = Number(m[1]);
    const cat = wordToCategory(m[2]);
    const current = currentByCategory[cat] ?? 0;
    // ±1 tolerance for rounding/display. If cited is meaningfully different
    // from what the star actually did, reject.
    if (Math.abs(cited - current) > 1) return true;
  }
  return false;
}

/** True when a culture line text references any roster member OTHER than the
 *  star. Teammate-mentions are off-limits when framing the star's individual
 *  performance — "Jimmy Butler brings out his best in Giannis" should not
 *  surface as commentary on Giannis's hand if Butler is also on the roster. */
export function lineNamesNonStarRosterMember(
  line: string,
  star: { name?: string } | null,
  roster: Array<{ name?: string }>,
): boolean {
  if (!line) return false;
  const lower = line.toLowerCase();
  const starName = (star?.name ?? "").toLowerCase();
  const starLast = star?.name ? lastName(star.name).toLowerCase() : "";
  for (const c of roster) {
    if (!c?.name) continue;
    const fullLower = c.name.toLowerCase();
    if (fullLower === starName) continue;
    if (lower.includes(fullLower)) return true;
    const last = lastName(c.name).toLowerCase();
    // Only block on last-name match if the last name is reasonably distinctive
    // (>=4 chars) AND not equal to the star's last name (e.g., father/son).
    if (last.length >= 4 && last !== starLast && lower.includes(last)) return true;
  }
  return false;
}

/** Prepend the player's name if the line doesn't already reference them. */
function attributeCultureLine(line: string, name: string, nicknames?: string[]): string {
  const lower = line.toLowerCase();
  const full = name.trim().toLowerCase();
  if (lower.includes(full)) return line;
  const last = lastName(name).toLowerCase();
  if (last.length >= 4 && lower.includes(last)) return line;
  if (nicknames?.some(n => n.length >= 3 && lower.includes(n.toLowerCase()))) return line;
  return `${name} — ${maybeLowerFirst(line)}`;
}

// ── Culture override + secondary enrichment ────────────────────────────────

/** Pre-template override. Returns a replacement primary line (early-exit) or null.
 *  Fires on signatureGames exact date+opponent match, or opponentFlavor keyed match.
 *  Lines that mention non-star roster members are rejected — we don't want a
 *  teammate to be the explanation for the star's individual performance. */
function cultureOverride(
  star: any,
  culture: CultureShape | null,
  roster: Array<{ name?: string }> = [],
): string | null {
  if (!star || !culture) return null;
  const sl = (star.statLine ?? {}) as Record<string, number | undefined>;
  const ok = (line: string) =>
    !lineNamesNonStarRosterMember(line, star, roster) &&
    !lineCitesMismatchedStat(line, sl);
  // Signature games — exact date + opponent. These are date-keyed so they're
  // fine to leave unguarded against stat citations (the line was authored for
  // exactly that game), but we still apply the roster-member guard.
  if (culture.signatureGames?.length && star.gameDate && star.opponent) {
    const date = String(star.gameDate).slice(0, 10);
    const opp = String(star.opponent).toUpperCase();
    const sig = culture.signatureGames.find(g => g.date === date && g.opponent.toUpperCase() === opp);
    if (sig?.line && !lineNamesNonStarRosterMember(sig.line, star, roster)) {
      return attributeCultureLine(sig.line, star.name, culture.nicknames);
    }
  }
  // Opponent flavor — keyed by opponent code only, so any matching opponent
  // surfaces this line. When the line cites a historical stat that doesn't
  // match tonight's game, reject — otherwise reads as fabricated stats.
  if (culture.opponentFlavor && star.opponent) {
    const flavor = culture.opponentFlavor[String(star.opponent).toUpperCase()];
    if (flavor && ok(flavor)) return attributeCultureLine(flavor, star.name, culture.nicknames);
  }
  return null;
}

/** Post-template secondary selector.
 *  Two-layer design:
 *    - Situational (strict priority, fires when condition met):
 *        bigGame → defensive → quietGame → streakLines
 *    - Flavor (weighted seeded-random pool over eligible options):
 *        salaryNarrative, milestones, rivalry, formerTeam, controversy,
 *        teamContext, draftAndPath, teamFlavor (hype/cold/humor/identity)
 *  Flavor pool ensures all dormant culture fields get exposure over many hands
 *  instead of only the top-priority branch ever firing. */
/** Returns true when `line` already references `star` by full name, last name,
 *  first name (word-bounded), or a nickname. */
function lineNamesStar(line: string, star: any, nicknames?: string[]): boolean {
  if (!star?.name) return false;
  const lower = line.toLowerCase();
  if (lower.includes(star.name.toLowerCase())) return true;
  const parts = star.name.trim().split(/\s+/);
  const last = lastName(star.name).toLowerCase();
  if (last.length >= 4 && lower.includes(last)) return true;
  const first = (parts[0] ?? "").toLowerCase();
  // Word-bounded first-name match — avoids matching "Luka" inside "lukewarm", etc.
  if (first.length >= 3 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) return true;
  if (nicknames?.some(n => n.length >= 3 && lower.includes(n.toLowerCase()))) return true;
  return false;
}

function cultureSecondary(
  star: any,
  culture: CultureShape | null,
  teamFlavor: TeamFlavorEntry | null,
  input: CommentaryInput,
  seed: number,
  /** When true, primary line already names the star — secondary should avoid
   *  restating the player and pivot to team/opponent-focused flavor. */
  primaryNamesStar: boolean = false,
): string | null {
  if (!star) return null;

  const pts = statN(star, "pts");
  const blk = statN(star, "blk");
  const stl = statN(star, "stl");
  const mins = statN(star, "min") || statN(star, "minutes") || statN(star, "mp");
  const badges = (star.achievements ?? []).map((a: any) => a.id);
  const actualFp = Number(star.actualFp ?? 0);
  const salary = Number(star.salary ?? 0);
  const projectedFp = Number(star.projectedFp ?? 0);
  const ratio = projectedFp > 0 ? actualFp / projectedFp : 1;
  const isBigWin = !input.isBust && (input.winTier === "ALL_STAR" || input.winTier === "MVP" || input.winTier === "LEGEND");
  const attribute = (line: string) => attributeCultureLine(line, star.name, culture?.nicknames);

  // ── Situational layer (strict priority) ──────────────────────────────────
  // Skipped entirely when primary already names the star — these are all
  // player-focused and would create parallel two-line commentary about the
  // same subject. When skipped, the flow falls through to the team-centric
  // flavor pool below so the secondary pivots to opponent/franchise voice.

  // All culture-pool picks must pass these filters: the line must not cite
  // a stat number that doesn't match tonight's stat line, and must not read
  // as a historical aside (year refs, specific opponent matchups). Without
  // these, lines like Westbrook's "57 vs. the Magic 2015 in a single half"
  // surface on unrelated 35/21/14 hands.
  const starSl = (star.statLine ?? {}) as Record<string, number | undefined>;
  const validCultureLine = (l: string | null | undefined): boolean =>
    !!l && !lineCitesMismatchedStat(l, starSl) && !lineLooksHistorical(l);
  const pickValid = (arr: string[] | undefined, seedOffset: number): string | null => {
    if (!arr?.length) return null;
    // Try in order — pickSeeded returns one candidate; if it fails the filters,
    // walk the rest of the array deterministically.
    const first = pickSeeded(arr, seed, seedOffset);
    if (validCultureLine(first)) return first ?? null;
    for (const candidate of arr) {
      if (candidate !== first && validCultureLine(candidate)) return candidate;
    }
    return null;
  };

  if (!primaryNamesStar) {
    // 0. Former-team game — when this season's opponent is a team the player
    // was previously on (player got traded mid-season and now plays their old
    // team), surface a culture.formerTeam line. Highest narrative weight on
    // the secondary: it adds context the user might not have on the back of
    // their head ("oh right, Harden was on Houston").
    if (culture?.formerTeam?.length && Array.isArray(star.teams) && star.teams.length > 1 && star.opponent) {
      const opp = String(star.opponent).toUpperCase();
      const onMultiple = star.teams.map((t: string) => String(t).toUpperCase());
      // If the opponent is one of the player's teams this season, they're
      // facing a former (or future) team. Trigger.
      if (onMultiple.includes(opp)) {
        const line = pickValid(culture.formerTeam, 0);
        if (line) return attribute(line);
      }
    }

    // 1. Big game — non-bust, elite output
    if (!input.isBust && culture?.bigGame?.length) {
      const isBig = pts >= 40 || actualFp >= 65 || badges.includes("QUAD_DBL") || badges.includes("GOD_MODE");
      if (isBig) {
        const line = pickValid(culture.bigGame, 1);
        if (line) return attribute(line);
      }
    }

    // 2. Defensive standout — non-bust
    if (!input.isBust && culture?.defensive?.length) {
      if (blk >= 4 || stl >= 5) {
        const line = pickValid(culture.defensive, 2);
        if (line) return attribute(line);
      }
    }

    // 3. Quiet game — non-big-win, star had off night (non-injury)
    if (!isBigWin && culture?.quietGame?.length && salary >= 30) {
      const nonInjury = !mins || mins >= 20;
      if (nonInjury && pts <= 10 && actualFp < 18) {
        const line = pickValid(culture.quietGame, 3);
        if (line) return attribute(line);
      }
    }

    // 4. Streak lines — wins with streak 3–6
    if (!input.isBust && input.streak >= 3 && input.streak < 7 && culture?.streakLines?.length) {
      const line = pickValid(culture.streakLines, 4);
      if (line) return attribute(line);
    }
  }

  // ── Flavor layer (weighted seeded-random pool) ───────────────────────────
  // When the primary already names the star, the flavor pool is restricted to
  // team/opponent-centric lines so the two-line commentary reads as one message
  // instead of two parallel statements about the same player.

  interface FlavorOption { weight: number; line: string; }
  const pool: FlavorOption[] = [];

  // Narrowed pool — only high-signal culture fields that relate to tonight's
  // hand, not off-topic franchise/origin/controversy trivia. The removed fields
  // (controversy, draftAndPath, formerTeam, teamContext, teamFlavor.identity)
  // were surfacing random trivia disconnected from the played hand.

  if (!primaryNamesStar) {
    // salaryNarrative — comments on card value, relevant to the decision to play this card
    if (culture?.salaryNarrative?.length && salary >= 45) {
      const l = pickValid(culture.salaryNarrative, 10);
      if (l) pool.push({ weight: 18, line: attribute(l) });
    }

    // milestones — player trajectory on wins where star performed at/above projection
    if (!input.isBust && ratio >= 1.0 && culture?.milestones?.length) {
      const l = pickValid(culture.milestones, 11);
      if (l) pool.push({ weight: 12, line: attribute(l) });
    }
  }

  // teamFlavor (opponent voice) intentionally NOT surfaced here.
  // Lines like "Pelicans had a long evening" reference the star's opponent
  // without anywhere in the commentary establishing that matchup, so they
  // read as random trivia disconnected from what the user's roster did.
  // The secondary is only useful when it supports the star/result context;
  // when no star-anchored flavor qualifies, returning null (no secondary)
  // is preferable to opponent-centric filler.
  void teamFlavor; // keep param for callers; not referenced

  if (pool.length === 0) return null;

  // Seeded weighted pick
  const totalWeight = pool.reduce((s, o) => s + o.weight, 0);
  const roll = seededRandom(seed, 99) * totalWeight;
  let cum = 0;
  for (const o of pool) {
    cum += o.weight;
    if (roll < cum) return o.line;
  }
  return pool[pool.length - 1].line;
}

// ── Core selector ──────────────────────────────────────────────────────────

export interface PostRevealCopy {
  primary: string;
  secondary?: string;
}

export function selectCommentary(
  input: CommentaryInput & { sport?: string },
): PostRevealCopy {
  const sport = input.sport ?? "basketball";
  const seed = Math.abs(Math.floor(input.totalFp * 13) + input.streak * 7 + (input.isBust ? 3 : 0));

  // Step 1: Classify archetype (FIRST — archetype is king)
  const classification = classifyArchetype(input);
  const { archetype, star, nearMiss, deltaToNextTier, costar } = classification;

  // Step 2: Determine intensity
  const intensity = determineIntensity(input);

  // Step 3: Select tone (SECONDARY to archetype)
  const tone = selectTone(intensity, seed);
  const register: Register = input.isBust ? "loss" : "win";

  // Step 4: Get story details for sub-line assembly
  const { details, recordEvents } = selectStory(input, seed, sport);

  // Step 5: Build template data
  const culture = star ? lookupCulture(star.name, sport, star.cardTier, seed, star.basePlayerId, star.team) : null;
  const teamFlavor = star ? lookupTeamFlavor(star.opponent, sport) : null;
  const templateData = buildTemplateData(star, input, recordEvents, culture, costar);

  // Step 5a: Culture override — signature game / opponent flavor can replace primary.
  // Highest priority player-specific voice; skip template flow entirely when matched.
  const override = cultureOverride(star, culture, input.roster);
  if (override) {
    // Override primaries are short single-sentence culture fragments. Always
    // pair with result framing (forceFraming=true) but alternate lead/close
    // position so it doesn't read the same way every time.
    const starRatioFromStar = star && star.projectedFp ? star.actualFp / star.projectedFp : 1;
    const maxSalary = input.roster.reduce((m, c) => Math.max(m, c.salary), 0);
    const isAnchor = !!star && star.salary === maxSalary;
    return { primary: applyFraming(override, intensity, archetype, seed, culture, starRatioFromStar, input.isBust, isAnchor, deltaToNextTier, true, star, input.roster) };
  }

  // Step 6: Load library and filter candidates
  const library = loadLibrary(sport);
  const fallbackChain = getFallbackChain(archetype);

  // Build available-details set for `requires` filtering. Seed with detail IDs
  // returned by story assembly, then add Top-Games-specific detail flags.
  const availableDetails = new Set<string>(details.map(d => String(d)));
  if (input.topGame?.tier === "career") availableDetails.add("season_best_stat");

  // A template is eligible when every entry in its `requires` array is present
  // in the available-details set. Templates with no `requires` are always OK.
  const requiresMatch = (line: CommentaryLine): boolean => {
    if (!line.requires || line.requires.length === 0) return true;
    return line.requires.every(r => availableDetails.has(r));
  };

  let candidates: CommentaryLine[] = [];
  let matchedArchetype: CommentaryArchetype = archetype;

  // T1 (career) hard preference. T0 and T2 hijack the archetype itself; T1 is
  // designed to flow through to a normal archetype but tag a personal-best
  // detail. Without preference, the season_best_stat template competes
  // unweighted with the rest of the pool and almost never wins, so the
  // milestone goes unmentioned. Prefer (a) the dedicated historic_career
  // templates (which use {topStat} directly) when available, then fall back to
  // (b) any template tagged requires:["season_best_stat"]. Without (a), the
  // historic_career templates added in PR #76 stay dead because the legacy
  // star_carry seasonBestStat templates always win the fallback race.
  if (input.topGame?.tier === "career") {
    for (const arch of fallbackChain) {
      const pool = library[arch] ?? [];
      const t1Match = pool.filter(line =>
        line.enabled &&
        line.register === register &&
        (line.sport === "any" || line.sport === sport) &&
        (line.archetype === "historic_career" || line.requires?.includes("season_best_stat"))
      );
      if (t1Match.length > 0) {
        candidates = t1Match;
        matchedArchetype = arch;
        break;
      }
    }
  }

  for (const arch of fallbackChain) {
    if (candidates.length > 0) break;
    const pool = library[arch] ?? [];

    // Filter: register match, tone match, enabled, sport match, requires met
    const toneMatch = pool.filter(line =>
      line.enabled &&
      line.register === register &&
      line.tone === tone &&
      (line.sport === "any" || line.sport === sport) &&
      requiresMatch(line)
    );

    if (toneMatch.length > 0) {
      candidates = toneMatch;
      matchedArchetype = arch;
      break;
    }

    // Fallback within archetype: any tone
    const anyTone = pool.filter(line =>
      line.enabled &&
      line.register === register &&
      (line.sport === "any" || line.sport === sport) &&
      requiresMatch(line)
    );

    if (anyTone.length > 0) {
      candidates = anyTone;
      matchedArchetype = arch;
      break;
    }
  }

  // Absolute fallback — static line
  if (candidates.length === 0) {
    const fallbackLine = register === "win" ? "Good hand." : "Tough night.";
    return { primary: fallbackLine };
  }

  // Step 7: Score candidates with anti-repeat.
  // resolveTemplate returns "" when the template references a string var
  // that's empty (e.g., {topStat} with no topGame data) — those templates
  // would render with orphan scaffold punctuation. Filter them out so the
  // scorer only ranks renderable candidates.
  const scored = candidates
    .map((line, i) => {
      const resolved = resolveTemplate(line.template, templateData);
      if (!resolved) return null; // unrenderable — empty required var
      const penalty = scoreRepeatPenalty(line.id, matchedArchetype, tone, resolved);
      const quality = line.qualityScore ?? 7;
      const jitter = 0.9 + seededRandom(seed, i) * 0.2;
      return {
        line,
        resolved,
        score: quality * penalty.score * jitter,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  // All candidates were unrenderable — drop to the absolute fallback rather
  // than picking a "least bad" empty render. Same fallback as Step 6's
  // empty-candidates branch.
  if (scored.length === 0) {
    const fallbackLine = register === "win" ? "Good hand." : "Tough night.";
    return { primary: fallbackLine };
  }

  // Sort by score descending, pick the best non-blocked
  scored.sort((a, b) => b.score - a.score);
  const best = scored.find(s => s.score > 0) ?? scored[0];

  // Step 8: Compose message with detail sub-lines
  const mainLine = composeMessage(best.line.template, templateData, details);

  // Step 9: Record usage in anti-repeat
  recordUsage(best.line.id, matchedArchetype, tone, mainLine);

  // Step 10: Apply framing to compose the primary line.
  // Template path mixes framing sources (archetype / anchor / nickname / culture
  // / generic) based on seed + context, plus three position modes. Keeps the
  // result reflection from appearing in the same shape every hand.
  const templateStarRatio = star && star.projectedFp ? star.actualFp / star.projectedFp : 1;
  const maxSalary = input.roster.reduce((m, c) => Math.max(m, c.salary), 0);
  const isAnchor = !!star && star.salary === maxSalary;
  const primary = applyFraming(mainLine, intensity, matchedArchetype, seed, culture, templateStarRatio, input.isBust, isAnchor, deltaToNextTier, false, star, input.roster);

  // Step 11: Optional culture-secondary line. Adds a flavor beat (signature
  // game / team flavor / milestone) when culture is available. Now fires for
  // achievement archetypes too — the secondary is a separate UI line, so it
  // adds bulk without burying the achievement headline. cultureSecondary
  // itself returns null when culture is null (BLUE/GREEN/WHITE stars, or
  // PURPLE without iconic nickname, or 70% of PURPLE hands), so the player-
  // culture gate is automatic. Team-flavor (venue voice) fires regardless.
  let secondary: string | undefined;
  if (star) {
    const primaryLower = primary.toLowerCase();
    const starLast = lastName(star.name).toLowerCase();
    const primaryNamesStar = (
      primaryLower.includes(star.name.toLowerCase()) ||
      (starLast.length >= 3 && primaryLower.includes(starLast)) ||
      (culture?.nicknames ?? []).some(n => n.length >= 3 && primaryLower.includes(n.toLowerCase()))
    );
    const sec = cultureSecondary(star, culture, teamFlavor, input, seed, primaryNamesStar);
    // Drop the secondary if it restates a stat number the primary already
    // surfaced (e.g. primary "40 pts" + culture line "Each 40-point game...")
    // OR if it opens with the same lead word ("Cashed the hand. Cashed the
    // way..."). The lead-word repeat reads as a jingle, not a thought.
    if (sec && !secondaryRepeatsStat(primary, sec) && !sharesLeadWord(primary, sec)) {
      secondary = sec;
    }
  }

  return secondary ? { primary, secondary } : { primary };
}

/** True when primary and secondary lead with the same word (case-insensitive).
 *  Catches the "Cashed the hand. Cashed the way a well-written letter reads..."
 *  jingle effect — two consecutive sentences starting with the same word
 *  read as one repetitive idea, not two perspectives. Skipped for very
 *  short lead words (≤ 2 chars) so common articles like "An", "It" don't
 *  trigger false positives. */
function sharesLeadWord(primary: string, secondary: string): boolean {
  const leadOf = (s: string) => {
    const m = s.trim().match(/^([A-Za-z][A-Za-z'-]*)/);
    return m ? m[1].toLowerCase() : "";
  };
  const a = leadOf(primary);
  const b = leadOf(secondary);
  if (a.length <= 2) return false;
  return a === b;
}

/** True when the secondary line restates content the primary already covered:
 *  - same stat-number (e.g. primary "40 pts" + secondary "40-point game")
 *  - same achievement name (e.g. primary "triple double" + secondary
 *    "triple double on the side") */
function secondaryRepeatsStat(primary: string, secondary: string): boolean {
  const STAT_WORDS = "pt|pts|point|points|reb|rebs|rebound|rebounds|ast|asts|assist|assists|stl|stls|steal|steals|blk|blks|block|blocks|three|threes";
  const re = new RegExp(`(\\d{2,3})[\\s+-]+(${STAT_WORDS})`, "gi");
  const seen = new Set<string>();
  for (const m of primary.matchAll(re)) seen.add(m[1]);
  for (const m of secondary.matchAll(re)) {
    if (seen.has(m[1])) return true;
  }
  // Achievement-term overlap. Matches the dedup applied within composeMessage
  // but operates across primary→secondary so the user doesn't see "triple
  // double" once in the headline and again as a secondary tagline.
  const ACHIEVEMENT_TERMS = ["triple double", "triple-double", "double double", "double-double", "quadruple double", "5x5"];
  const primaryLower = primary.toLowerCase();
  const secondaryLower = secondary.toLowerCase();
  for (const term of ACHIEVEMENT_TERMS) {
    if (primaryLower.includes(term) && secondaryLower.includes(term)) return true;
  }
  return false;
}
