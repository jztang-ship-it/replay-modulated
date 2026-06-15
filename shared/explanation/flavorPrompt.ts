// shared/explanation/flavorPrompt.ts
//
// RD7.12 — the LLM Flavor prompt. Separate from the challenge-headline
// VOICE_CONTRACT: the Flavor voice is honesty-critical (description only) and
// the user prompt is strictly firewalled — it carries ONLY stats + nickname +
// outcome tone, never anything about the user's decision. The model cannot
// reference a call it is never told about. Pure string builders — testable.

import type { FlavorFacts } from "./flavorValidator";

/** System prompt encoding the RD7.2/7.3 honesty rules + RD7.11 calibration. */
export function buildFlavorSystemPrompt(): string {
  return [
    "You write ONE short line of color commentary about a basketball player's single game, from a box score. Sportswriter voice.",
    "ABSOLUTE RULES:",
    "- DESCRIPTION ONLY. Say what the player did in the game. NEVER a cause, a prediction, or any claim that someone read/called/picked/knew the outcome.",
    "- NEVER use the word 'you' or 'your'. The line is about the GAME and the PLAYER — never the reader, never a roster decision.",
    "- Use ONLY the numbers provided. Never invent or infer a stat, a final score, or a margin.",
    "- The nickname is optional decoration — use it naturally or omit it.",
    "- One clause or short sentence. Under 120 characters. No emoji, no hashtags, no quotes.",
    "- Never reference personal life, legal trouble, health, or tragedy.",
    "GOOD: \"The Big Ticket went for 23-8-3\" | \"Iverson cooked — 41-7-5, vintage AI\"",
    "BAD: \"you called him and he delivered\" | \"you knew AI would cook\" | \"clutch when it mattered\"",
    "Output ONLY the line — no preamble, no label.",
  ].join("\n");
}

/** User prompt = the firewalled facts only. NO user-decision data. */
export function buildFlavorUserPrompt(facts: FlavorFacts): string {
  const { player, box, outcome } = facts;
  const parts = [`pts ${box.pts}`];
  if (box.reb != null) parts.push(`reb ${box.reb}`);
  if (box.ast != null) parts.push(`ast ${box.ast}`);
  if (box.stl != null) parts.push(`stl ${box.stl}`);
  if (box.blk != null) parts.push(`blk ${box.blk}`);
  if (box.threes != null) parts.push(`3pm ${box.threes}`);
  const nick = player.nickname ? ` (nickname: ${player.nickname})` : "";
  // outcome is only ever "win" | "close-loss" here — beatdown is suppressed
  // before the model is ever called.
  const tone =
    outcome === "win"
      ? "Context: a winning night — confident, celebratory tone is fine."
      : "Context: a narrow loss — keep it factual and even; no bright-side spin, no consolation.";
  return `Player: ${player.last}${nick}\nBox line: ${parts.join(", ")}\n${tone}\nWrite the one-line color note now.`;
}
