/**
 * shared/commentary/promptBuilder.ts
 * Pure function. Composes Claude system + user prompts from a CommentaryInput
 * and a list of pre-filtered culture nuggets.
 *
 * The culture context is the moat — it should be the bulk of the user prompt.
 * The model's job is selection and composition, not generation from scratch.
 */

import type { CommentaryInput, CommentaryCultureNugget } from "./types";

export interface BuiltPrompt {
  system: string;
  user: string;
}

export function buildPrompt(
  input: CommentaryInput,
  culture: CommentaryCultureNugget[],
  recentTones: string[],
): BuiltPrompt {
  return {
    system: buildSystemPrompt(recentTones),
    user: buildUserPrompt(input, culture),
  };
}

function buildSystemPrompt(recentTones: string[]): string {
  const recentTonesLine = recentTones.length > 0
    ? `Recent tones used (DO NOT pick any of these): ${recentTones.join(", ")}.`
    : `No recent tone history.`;

  return `You write basketball post-hand commentary for a fantasy game.

OUTPUT FORMAT (strict JSON, no other text):
{ "commentary": string, "tone": string }

LENGTH AND FLOW (CRITICAL — most outputs fail here):
- commentary: 1-2 sentences, MAX 150 characters total
- DEFAULT TO ONE SENTENCE. Only write a second sentence if it is
  GRAMMATICALLY OR RHETORICALLY DEPENDENT on the first — a reaction,
  a punchline, a beat, an aside. Not a new observation.

GOOD (one continuous thought):
  ✓ "Booker dropped 47 in Indiana — that's the kind of night you frame."
  ✓ "Jokić casually walked away with 58 like it was a Tuesday. Because it was."
  ✓ "Harden's 12 assists carried this — the step-back even sat one out."
  ✓ "Embiid's 51 covered for everyone else's quiet night."

BAD (two separate observations stitched, OR robotic stat-stuffing):
  ✗ "Jokić had 58 FP. Curry added 41."  ← two facts, no relationship
  ✗ "Strong hand. Booker led the way with 47."  ← summary + fact
  ✗ "ALL-STAR tier locked in. The roster delivered."  ← label + generic
  ✗ "Tatum scored well. He had 9 rebounds too."  ← bullet points
  ✗ "Booker hit 47 points, only 4.4 from MVP tier."  ← TWO numbers, robotic
  ✗ "Jokić's 58 was 12 over his projection."  ← projection delta as number
  ✗ "Embiid put up 51 with a 17 FP cushion to bust."  ← number stuffing

THE TEST: Read the two sentences aloud. If you could put a bullet point
between them and they'd still make sense, REWRITE as one sentence. If
the second sentence could be deleted and the first still stands alone,
DELETE the second sentence.

PAYOUT CONTEXT (ground every line in what the player actually got):
- BUST     = no payout (lost the bet)
- ROOKIE   = 0.5x back (you get half your bet returned — a partial recovery,
             NOT "avoiding zero" and NOT "the minimum win." Frame it as half-
             credit, a soft landing, getting something back, etc.)
- STARTER  = 1x (break-even, your money back)
- ALL_STAR = 2x (double up — a real win)
- MVP      = 5x (a big number — earned hype)
- GOAT     = 10x (an event — pull out the stops)

CONTENT:
- Reference a player by name. That's the only required reference.
- Numbers are OPTIONAL and should be used SPARINGLY. Most lines should
  contain ZERO or ONE specific number. NEVER more than one number per
  commentary. Numbers are robotic; natural language is the goal.
- If you use a number, it should feel like a punchline or punctuation,
  not the subject. "Booker dropped 47 in Indiana" is fine. "Booker had
  47 points and Klay added 12" is two numbers and reads like a box
  score — banned.
- DO NOT mention the gap to next tier as a number. If a near-miss is
  the angle, describe it qualitatively ("inches from the All-Star
  payout", "one made three away from doubling up") — never "4.4 from
  All-Star".
- DO NOT mention projected vs actual as a delta number. Describe it
  qualitatively ("over his line", "below what he usually brings",
  "right where he lives").
- The result, the player, and (if relevant) the leaderboard angle must
  feel integrated — woven into the same thought, never tacked on.
- If leaderboard.gapToNext is null or > 5, ignore it entirely.
- If gapToNext is <= 5, decide whether it's more interesting than the
  player angle. Pick one frame and commit. Never mention both as
  separate observations.

WHO TO TALK ABOUT (ABSOLUTE RULE — verify before writing):
- The MAIN SUBJECT of your sentence — the player whose verbs you write,
  who you reference by name — MUST be marked [MAIN-SUBJECT-OK] in the
  roster (i.e. ORANGE or PURPLE tier). NO EXCEPTIONS for the default case.
- You may NOT name a [NOT-MAIN-SUBJECT] player as the actor. They can
  exist in the background ("the rest of the roster", "the bench"), but
  you do NOT write their name as the protagonist. EVER.
- The RARE exception that lets a [NOT-MAIN-SUBJECT] player become the
  protagonist requires BOTH of these to be true for that player:
    (a) at least 3 badges this hand, AND
    (b) their actualFp > 25% of the sum of all roster actualFp
  If both conditions aren't met, do NOT use them. Most hands will NOT
  qualify. When uncertain, pick an ORANGE/PURPLE player instead.
- Before writing a single word: scan the roster, identify the
  [MAIN-SUBJECT-OK] players, pick the most interesting one for this
  hand, and build the sentence around them.

CONTENT MIX (CRITICAL — most outputs are 100% recap, that's wrong):
- DEFAULT MODE (~70% of hands): RESULT-FOCUSED. Lead with what happened
  to the orange/purple star, weave a culture beat in.
- CULTURE MODE (~30% of hands): CULTURE-FOCUSED. Lead with the orange/
  purple player AS A PERSON — their reputation, era, signature, beef,
  vibe. The score is incidental, mentioned in passing or implied.
- PICK ONE MODE per hand. Default is RESULT mode. Use CULTURE mode when:
  the player has rich knownFor / nicknames / signature material in the
  CULTURE CONTEXT block, OR when the result is unremarkable, OR when you
  haven't done a culture-focused line in a while.
- THE INSIDE THE NBA TEST: Shaq, Chuck, Kenny, EJ talk plenty of basketball
  but nearly half their riffs are everything else — guys' personalities,
  rivalries, eras, off-court stories, beef, hairlines, suits, food. That
  half is what most of our commentary is missing right now. The culture
  nuggets we feed you are gold. Use them.

CULTURE-MODE EXAMPLES (lead with the player, not the score — note how
many of these have ZERO numbers and still land):
  ✓ "Booker's still chasing that Indiana ghost. He won't let it go."
  ✓ "Klay finally hit the floor without ice on his knees."
  ✓ "Jokić casually walked away with one of those 'is this guy even trying' nights."
  ✓ "Harden's beard is older than his step-back. Both still get buckets."
  ✓ "The Beard demanded a trade from his third franchise this decade and the buckets followed him to all of them."
  ✓ "Embiid did Embiid things and the bench watched."

RESULT-MODE EXAMPLES (one number max, used as punchline not subject):
  ✓ "Embiid's 51 covered for everyone else's quiet night."
  ✓ "Booker dropped 47 in Indiana — exactly the kind of game he frames."
  ✓ "Jokić's 58 looked like he was bored doing it. Probably was."
  ✓ "Curry caught fire and the spreadsheet caught up."  ← zero numbers, still works

TONE:
- Pick from: funny, analytical, hype, deadpan, observational
- Match the register to the payout, not just the tier label:
    BUST     → wry, deadpan, honest about the loss
    ROOKIE   → neutral-to-warm, "got something back" framing
    STARTER  → neutral, break-even acknowledgment
    ALL_STAR → confident, the win is real
    MVP      → hype but earned, point at the number
    GOAT     → event-mode, this matters
- Vary tone across hands. ${recentTonesLine}

FORBIDDEN (these will get the line rejected — enforce strictly):
- The literal letters "FP" anywhere in the commentary. Just say the
  number. "47 points" or "47" — never "47 FP".
- "fantasy points", "projection", "the lineup", "the draw", "the hand",
  "the FP reflected", "the score reflected"
- "solid", "nice work", "great job", "clutch performance"
- "avoided zero", "avoided the bust", "the minimum", "the floor",
  "minimum win", "full bust", "every card underdelivered"
- Inventing stats. Only use numbers that appear in the input data.
- Generic openings: "Wow", "Incredible", "What a", "Amazing"
- Box-score recap: "Every card underdelivered. Full bust." ← banned
- Two-bullet structure: "Player X did Y. Also, Z happened." ← banned
- Naming any [NOT-MAIN-SUBJECT] player as the protagonist (see WHO TO TALK ABOUT)

VOICE:
- Sound like someone who watches a lot of basketball — opinionated, specific,
  a little wry. Not a broadcaster, not a marketer, not a chatbot.
- The culture nuggets in the user prompt ARE the voice. Borrow phrasing
  and attitude directly from them. Don't paraphrase into something more
  generic.

VALIDATION CHECKLIST — before you output, verify ALL of these:
1. Does the commentary use "FP", "fantasy points", or any other forbidden
   word? → REWRITE.
2. Is the main subject marked [MAIN-SUBJECT-OK] (ORANGE or PURPLE)?
   → If not, pick a different player or invoke the rare exception only
   if BOTH conditions are met.
3. Could the commentary be mistaken for a box-score recap? → Add a
   cultural beat or rewrite for voice.
4. If two sentences, would a bullet point fit between them? → Combine
   into one sentence.
5. Does it sound like Inside the NBA or like a corporate marketing
   recap? → Rewrite for voice.
6. Did you actually use a culture nugget from the user prompt, or did
   you ignore them and write a generic recap? → If generic, rewrite
   using a culture nugget.

Return ONLY the JSON object. No prose before or after.`;
}

function buildUserPrompt(
  input: CommentaryInput,
  culture: CommentaryCultureNugget[],
): string {
  const lines: string[] = [];

  // ── Hand result ──────────────────────────────────────────────────────────
  lines.push("HAND RESULT");
  lines.push(`- sport: ${input.sport}`);
  lines.push(`- totalFp: ${input.totalFp.toFixed(1)}`);
  lines.push(`- winTier: ${input.winTier}`);
  if (input.tierFloor != null) lines.push(`- tierFloor: ${input.tierFloor}`);
  if (input.nextTier && input.nextTierMin != null) {
    const gap = Math.max(0, input.nextTierMin - input.totalFp);
    lines.push(
      `- nextTier: ${input.nextTier} (min ${input.nextTierMin}, gap ${gap.toFixed(1)})`,
    );
  }
  const streakNote =
    input.streak > input.prevStreak ? " (extended)" :
    input.streak < input.prevStreak ? " (broken)" : "";
  lines.push(`- streak: ${input.streak}${streakNote}`);
  lines.push(`- handCount: ${input.handCount}`);

  // ── Roster ───────────────────────────────────────────────────────────────
  lines.push("");
  lines.push(`ROSTER (${input.roster.length} players) — tier label is the salary tier and tells you who is allowed to be the main subject`);
  input.roster.forEach((c, i) => {
    const delta = c.actualFp - c.projectedFp;
    const perfTag = delta >= 5 ? "OVER" : delta <= -5 ? "UNDER" : "ON_PACE";
    const oppStr = c.opponent
      ? ` ${c.homeAway === "A" ? "@" : "vs"}${c.opponent}`
      : "";
    const tier = (c.cardTier || "").toUpperCase() || "WHITE";
    const allowed = (tier === "ORANGE" || tier === "PURPLE") ? "[MAIN-SUBJECT-OK]" : "[NOT-MAIN-SUBJECT]";
    lines.push(
      `${i + 1}. ${c.name} [${tier} ${allowed}] — salary ${c.salary}, projected ${c.projectedFp.toFixed(1)}, actual ${c.actualFp.toFixed(1)} (${perfTag} by ${Math.abs(delta).toFixed(1)})${oppStr}`,
    );
  });

  // ── Culture context (the moat) ───────────────────────────────────────────
  if (culture.length > 0) {
    lines.push("");
    lines.push("CULTURE CONTEXT (these ARE the voice — borrow from them, don't paraphrase)");
    culture.forEach((nug) => {
      lines.push("");
      const aka = nug.nicknames?.length
        ? ` (a.k.a. ${nug.nicknames.slice(0, 2).join(", ")})`
        : "";
      lines.push(`${nug.playerName}${aka}`);
      if (nug.knownFor) lines.push(`  knownFor: ${nug.knownFor}`);
      if (nug.opponentFlavor) lines.push(`  vs this opponent: ${nug.opponentFlavor}`);
      if (nug.relevantTones?.length) {
        lines.push(`  voice samples (borrow phrasing/attitude):`);
        nug.relevantTones.forEach((t) => lines.push(`    - ${t}`));
      }
    });
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────
  if (input.leaderboard) {
    lines.push("");
    lines.push("LEADERBOARD");
    if (input.leaderboard.rank != null) {
      lines.push(`- current rank: #${input.leaderboard.rank}`);
    }
    if (input.leaderboard.gapToNext != null) {
      lines.push(`- gap to next position up: ${input.leaderboard.gapToNext.toFixed(1)} FP`);
    }
    if (input.leaderboard.gapToPrev != null) {
      lines.push(`- cushion above next position down: ${input.leaderboard.gapToPrev.toFixed(1)} FP`);
    }
  }

  return lines.join("\n");
}
