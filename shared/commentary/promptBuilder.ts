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
    ? `Recent tones (avoid these): ${recentTones.join(", ")}.`
    : "";

  return `You write post-hand commentary for a fantasy sports game.

OUTPUT: Return ONLY raw JSON. No backticks, no explanation.
{ "commentary": "your line here", "tone": "wry" }

RULES:
1. Write 1-2 COMPLETE sentences. Target 160-230 characters. Must sound like natural English a human would say to a friend.
2. ALWAYS use the FULL NAME of the [MAIN-SUBJECT-OK] star player. Never "he", never just a first name, never just a nickname without the full name first. Example: "Jayson Tatum went 48 tonight and made it look routine" — NOT "He went 48" or "Tatum did well."
3. ONLY name [MAIN-SUBJECT-OK] players (ORANGE or PURPLE tier). NEVER mention any [NOT-MAIN-SUBJECT] player by name, first name, last name, or nickname. Refer to them as "the bench" or "the supporting cast" only.
4. NEVER use the letters "FP" in commentary. Say "points" or just the number.
5. BUST = deadpan/wry honesty. ROOKIE/STARTER = it's a win, not a loss. ALL_STAR+ = real celebration.
6. Write like a basketball-watching friend, not a robot. No fragments. No taglines. Full sentences with subject-verb-object.

BAD (reject these patterns):
- "Cold from the first tip." ← fragment, no player name
- "Hawkins: 7 FP on a 18 average. The gap." ← names a non-star, uses FP, fragment
- "Somebody had a real night." ← vague, no name
- "The gap." ← not a sentence

GOOD:
- "Jayson Tatum's 48 points against Indiana is the kind of night that sticks with you — the rest of the lineup just had to stay out of the way."
- "Nikola Jokić made 62 look casual, which is basically his whole career in one sentence."
- "Giannis Antetokounmpo went to war tonight and the scoreboard agreed — 55 points and no one else needed to do much."
- "LeBron James at 39 is still doing things that shouldn't be physically possible, and tonight's 44 was proof."

TONE: Pick one of "deadpan", "observational", "analytical", "wry", "hype", "warm". ${recentTonesLine}

NICKNAMES: ONLY use nicknames from the CULTURE CONTEXT. If a player has no culture entry, use their full real name. Never invent nicknames. Never apply one player's nickname to another player.

Return ONLY the JSON object. Start with { and end with }. Nothing else.`;
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
      // New rich culture fields
      if (nug.salaryNarrative?.length) {
        lines.push(`  salary takes:`);
        nug.salaryNarrative.forEach((s) => lines.push(`    - ${s}`));
      }
      if (nug.draftAndPath?.length) {
        lines.push(`  draft/path: ${nug.draftAndPath[0]}`);
      }
      if (nug.teamContext?.length) {
        lines.push(`  team context: ${nug.teamContext[0]}`);
      }
      if (nug.formerTeam?.length) {
        lines.push(`  former team flavor: ${nug.formerTeam[0]}`);
      }
      if (nug.rivalry?.length) {
        lines.push(`  rivalry: ${nug.rivalry[0]}`);
      }
      if (nug.milestones?.length) {
        lines.push(`  milestone: ${nug.milestones[0]}`);
      }
      if (nug.streakLines?.length) {
        lines.push(`  streak context:`);
        nug.streakLines.forEach((s) => lines.push(`    - ${s}`));
      }
      if (nug.signatureGames?.length) {
        lines.push(`  SIGNATURE GAMES (real performances — reference these):`);
        nug.signatureGames.forEach((g) =>
          lines.push(`    - ${g.date} vs ${g.opponent}: ${g.fp} FP — ${g.line}`),
        );
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
