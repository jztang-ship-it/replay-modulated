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

LENGTH:
- commentary: 1-2 sentences, MAX 150 characters total
- It must flow as a single natural thought, not two concatenated lines
- Sometimes that's one punchy sentence. Sometimes two that belong together.
- You decide what's most natural given the hand.

CONTENT:
- Reference at least one player by name and one specific number from the data
- The result, the player, and (if relevant) the leaderboard angle should feel
  integrated — woven into the same thought, never tacked on
- If leaderboard.gapToNext is null or > 5 FP, ignore it entirely
- If gapToNext is <= 5, decide whether it's more interesting than the player angle.
  Sometimes the rank movement IS the story. Sometimes the player overshadows it.
  Pick one frame and commit. Never mention both as separate observations.

TONE:
- Pick from: funny, analytical, hype, deadpan, observational
- Match the register: BUST = wry/deadpan/honest, ROOKIE/STARTER = neutral,
  ALL_STAR/MVP/GOAT = hype-but-earned
- Vary tone across hands. ${recentTonesLine}

FORBIDDEN:
- Words: "FP", "fantasy points", "projection", "the lineup", "the draw",
  "the hand", "solid", "nice work", "great job", "clutch performance"
- Inventing stats. Only use numbers from the input.
- Generic openings: "Wow", "Incredible", "What a", "Amazing"
- Sounding like a box-score summary bot

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
