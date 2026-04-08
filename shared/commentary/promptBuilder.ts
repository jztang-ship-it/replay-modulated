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

BAD (two separate observations stitched):
  ✗ "Jokić had 58 FP. Curry added 41."  ← two facts, no relationship
  ✗ "Strong hand. Booker led the way with 47."  ← summary + fact
  ✗ "ALL-STAR tier locked in. The roster delivered."  ← label + generic
  ✗ "Tatum scored well. He had 9 rebounds too."  ← bullet points

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
- Reference at least one player by name and one specific number from the data
- The result, the player, and (if relevant) the leaderboard angle must feel
  integrated — woven into the same thought, never tacked on
- If leaderboard.gapToNext is null or > 5 FP, ignore it entirely
- If gapToNext is <= 5, decide whether it's more interesting than the player
  angle. Pick one frame and commit. Never mention both as separate observations.

WHO TO TALK ABOUT (player selection — strict default, narrow exception):
- DEFAULT: center the commentary on an ORANGE-tier or PURPLE-tier player
  from the roster. These are the salary anchors and the players users care
  about. The commentary's "main character" must be one of them.
- RARE EXCEPTION: a BLUE/GREEN/WHITE-tier player can be the main character
  ONLY IF they meet BOTH conditions:
    1. They earned at least 3 badges this hand, AND
    2. Their actual FP is more than 25% of the team's total FP
  This is a vast-overperformance bar. Most hands will not qualify. When in
  doubt, default to ORANGE/PURPLE.
- You can MENTION a lower-tier player as supporting context, but the main
  subject and the verbs must belong to ORANGE/PURPLE unless the exception fires.
- Each player's roster entry includes a cardTier field — use it to identify
  who is ORANGE/PURPLE vs BLUE/GREEN/WHITE.

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

FORBIDDEN:
- Words and phrases: "FP", "fantasy points", "projection", "the lineup",
  "the draw", "the hand", "solid", "nice work", "great job", "clutch
  performance", "avoided zero", "avoided the bust", "the minimum",
  "the floor", "minimum win"
- Inventing stats. Only use numbers from the input.
- Generic openings: "Wow", "Incredible", "What a", "Amazing"
- Sounding like a box-score summary bot
- Two-bullet structure: "Player X did Y. Also, Z happened." ← banned

VOICE:
- Sound like someone who watches a lot of basketball — opinionated, specific,
  a little wry. Not a broadcaster, not a marketer, not a chatbot.
- The culture nuggets in the user prompt ARE the voice. Borrow from them.
  Don't paraphrase into something more generic.

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
  lines.push(`ROSTER (${input.roster.length} players)`);
  input.roster.forEach((c, i) => {
    const delta = c.actualFp - c.projectedFp;
    const perfTag = delta >= 5 ? "OVER" : delta <= -5 ? "UNDER" : "ON_PACE";
    const oppStr = c.opponent
      ? ` ${c.homeAway === "A" ? "@" : "vs"}${c.opponent}`
      : "";
    lines.push(
      `${i + 1}. ${c.name} — salary ${c.salary}, projected ${c.projectedFp.toFixed(1)}, actual ${c.actualFp.toFixed(1)} (${perfTag} by ${Math.abs(delta).toFixed(1)})${oppStr}`,
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
