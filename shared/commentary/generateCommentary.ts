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
const MIN_CHAR_LENGTH = 80; // reject fragments

/**
 * Strict quality gate. Returns null (reject) or cleaned commentary.
 * Every check here exists because Haiku violated the prompt rule.
 */
function qualityGate(raw: string, roster: CommentaryInput["roster"]): string | null {
  let text = raw.trim();

  // 1. Hard reject: contains "FP" anywhere (case-insensitive)
  if (/\bfp\b/i.test(text)) return null;

  // 2. Hard reject: too short (fragments, taglines)
  if (text.length < MIN_CHAR_LENGTH) return null;

  // 3. Hard reject: ends with a short fragment after a period ("The gap.", "That's it.")
  const lastDot = text.lastIndexOf(".", text.length - 2);
  if (lastDot > 0) {
    const lastSentence = text.slice(lastDot + 1).trim();
    if (lastSentence.length > 0 && lastSentence.length < 20) return null;
  }

  // 4. Hard reject: contains banned words/phrases or game tier names
  const lower = text.toLowerCase();
  const banned = [
    "every card", "full bust", "avoided zero", "the minimum", "the floor",
    "came up short", "still lost", "couldn't overcome", "fell short",
    "nice work", "great job", "clutch performance", "went nuclear",
    "carry the load", "carried the load", "pick up the slack",
    "the rest of the roster", "fantasy points", "projection",
    "the lineup", "the draw", "the hand", "reflected it",
    // Game tier names — these are mechanics, not basketball concepts
    "rookie tier", "starter tier", "all-star tier", "mvp tier", "goat tier",
    "rookie money", "starter money", "all-star money",
  ];
  if (banned.some(b => lower.includes(b))) return null;
  // Also reject phrasing that uses STARTER as a payout tier (never a real basketball concept)
  if (/\bstarter (money|tier|level|payout|threshold|floor|ceiling)\b/i.test(text)) return null;

  // 5. Hard reject: names a non-star player
  for (const card of roster) {
    const tier = (card.cardTier ?? "").toUpperCase();
    if (tier === "ORANGE" || tier === "PURPLE") continue;
    const parts = card.name.trim().split(/\s+/);
    const last = parts[parts.length - 1]?.toLowerCase();
    if (last && last.length > 2 && lower.includes(last)) return null;
  }

  // 6. Hard reject: no star player's FULL NAME (first AND last) appears
  const stars = roster.filter(c => {
    const t = (c.cardTier ?? "").toUpperCase();
    return t === "ORANGE" || t === "PURPLE";
  });
  const hasFullStarName = stars.some(c => {
    const full = c.name.trim().toLowerCase();
    return full.length > 4 && lower.includes(full);
  });
  // Also accept last name if it's distinctive (>= 5 chars)
  const hasDistinctiveLastName = stars.some(c => {
    const parts = c.name.trim().split(/\s+/);
    const last = parts[parts.length - 1]?.toLowerCase() ?? "";
    return last.length >= 5 && lower.includes(last);
  });
  if (!hasFullStarName && !hasDistinctiveLastName) return null;

  // 7. Hard reject: mentions a player NOT in the roster at all
  //    (catches hallucinated players like "CP3" when CP3 isn't in the hand)
  //    Skip this check — too complex to implement reliably with nicknames

  // 8. Length cap
  if (text.length > HARD_CHAR_CAP) {
    const truncated = text.slice(0, HARD_CHAR_CAP);
    const lastPunct = Math.max(truncated.lastIndexOf("."), truncated.lastIndexOf("!"), truncated.lastIndexOf("?"));
    text = lastPunct > 50 ? truncated.slice(0, lastPunct + 1) : truncated;
  }

  return text;
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

    // Run through strict quality gate — rejects bad Haiku output
    const cleaned = qualityGate(data.commentary as string, input.roster);
    if (!cleaned) return null;

    return {
      commentary: cleaned,
      tone: typeof data.tone === "string" ? data.tone : "observational",
      source: "claude",
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}
