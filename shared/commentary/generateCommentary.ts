/**
 * shared/commentary/generateCommentary.ts
 * Sport-agnostic commentary generation. Calls the /api/commentary serverless
 * function, which proxies to Claude with the server-side ANTHROPIC_API_KEY.
 *
 * Returns null on any failure (network, timeout, parse error, validation).
 * Caller is responsible for falling back to template/static tiers.
 */

import type {
  CommentaryInput,
  CommentaryCultureNugget,
  CommentaryOutput,
} from "./types";
import { buildPrompt } from "./promptBuilder";

const TIMEOUT_MS = 3000;
const ENDPOINT = "/api/commentary";
const HARD_CHAR_CAP = 280;

/** Banned phrases — if any appear in the output, reject it entirely. */
const BANNED_PHRASES = [
  "every card underdelivered",
  "full bust",
  "avoided zero",
  "avoided the bust",
  "the minimum",
  "the floor",
  "minimum win",
  "came up short",
  "still lost",
  "couldn't overcome",
  "fell short",
  "barely lost",
  "nice work",
  "great job",
  "clutch performance",
  "the rest of the roster",
  "showed up",
  "went nuclear",
  "carry the load",
  "carried the load",
  "pick up the slack",
  "picked up the slack",
  "disappeared",
];

/**
 * Check if commentary mentions a NOT-MAIN-SUBJECT player by name.
 * Returns true if the output is clean (only star players named).
 */
function passesStarFilter(commentary: string, roster: CommentaryInput["roster"]): boolean {
  const lower = commentary.toLowerCase();
  for (const card of roster) {
    const tier = (card.cardTier ?? "").toUpperCase();
    if (tier === "ORANGE" || tier === "PURPLE") continue; // stars are OK to name
    // Check if this non-star player's last name appears in the commentary
    const nameParts = card.name.trim().split(/\s+/);
    const lastName = nameParts[nameParts.length - 1]?.toLowerCase();
    if (lastName && lastName.length > 2 && lower.includes(lastName)) {
      return false; // named a non-star player — reject
    }
  }
  return true;
}

export async function generateCommentary(
  input: CommentaryInput,
  culture: CommentaryCultureNugget[],
  recentTones: string[],
): Promise<CommentaryOutput | null> {
  const { system, user } = buildPrompt(input, culture, recentTones);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, user, tier: input.winTier }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!r.ok) return null;

    const data = (await r.json()) as { commentary?: unknown; tone?: unknown };
    if (typeof data.commentary !== "string" || data.commentary.trim().length === 0) {
      return null;
    }

    let commentary = data.commentary.trim();

    // Hard cap — truncate at last sentence boundary
    if (commentary.length > HARD_CHAR_CAP) {
      const truncated = commentary.slice(0, HARD_CHAR_CAP);
      const lastPunct = Math.max(
        truncated.lastIndexOf("."),
        truncated.lastIndexOf("!"),
        truncated.lastIndexOf("?"),
      );
      commentary = lastPunct > 50 ? truncated.slice(0, lastPunct + 1) : truncated;
    }

    // Reject if commentary contains banned phrases
    const lower = commentary.toLowerCase();
    if (BANNED_PHRASES.some(p => lower.includes(p))) return null;

    // Reject if commentary names a non-star player
    if (!passesStarFilter(commentary, input.roster)) return null;

    // Reject if commentary uses "he" or "him" without a player name
    // (vague pronouns with no antecedent = bad UX)
    const hasStarName = input.roster
      .filter(c => (c.cardTier ?? "").toUpperCase() === "ORANGE" || (c.cardTier ?? "").toUpperCase() === "PURPLE")
      .some(c => {
        const parts = c.name.trim().split(/\s+/);
        const last = parts[parts.length - 1]?.toLowerCase() ?? "";
        return last.length > 2 && lower.includes(last);
      });
    if (!hasStarName && commentary.length > 30) return null; // no star name at all = reject

    return {
      commentary,
      tone: typeof data.tone === "string" ? data.tone : "observational",
      source: "claude",
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}
