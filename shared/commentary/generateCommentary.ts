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
      body: JSON.stringify({ system, user }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!r.ok) return null;

    const data = (await r.json()) as { commentary?: unknown; tone?: unknown };
    if (typeof data.commentary !== "string" || data.commentary.trim().length === 0) {
      return null;
    }

    let commentary = data.commentary.trim();

    // Hard cap — model went over budget. Truncate at the last sentence boundary
    // if there is one in the cap window, otherwise hard truncate.
    if (commentary.length > HARD_CHAR_CAP) {
      const truncated = commentary.slice(0, HARD_CHAR_CAP);
      const lastPunct = Math.max(
        truncated.lastIndexOf("."),
        truncated.lastIndexOf("!"),
        truncated.lastIndexOf("?"),
      );
      commentary = lastPunct > 50 ? truncated.slice(0, lastPunct + 1) : truncated;
    }

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
