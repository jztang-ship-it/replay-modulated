/**
 * templateBank.ts — Template registry. Loads sport-specific template banks
 * and provides lookup by (register, story, tone).
 */

import type { CommentaryTemplate, Register, StoryId, ToneId } from "./types";
import { BASKETBALL_TEMPLATES } from "./templateBank.basketball";
import { BASEBALL_TEMPLATES } from "./templateBank.baseball";

const BANKS: Record<string, CommentaryTemplate[]> = {
  basketball: BASKETBALL_TEMPLATES,
  baseball: BASEBALL_TEMPLATES,
};

/**
 * Look up templates matching (register, story, tone).
 * Returns the template string pool, or an empty array if no match.
 */
export function lookupTemplates(
  sport: string,
  register: Register,
  story: StoryId,
  tone: ToneId,
): string[] {
  const bank = BANKS[sport] ?? BANKS["basketball"];
  const match = bank.find(
    t => t.register === register && t.story === story && t.tone === tone,
  );
  return match?.templates ?? [];
}

/**
 * Fallback: look up by (register, tone) ignoring story — for clean_win/everyone_flat.
 */
export function lookupFallbackTemplates(
  sport: string,
  register: Register,
  tone: ToneId,
): string[] {
  const bank = BANKS[sport] ?? BANKS["basketball"];
  const fallbackStory: StoryId = register === "win" ? "clean_win" : "everyone_flat";
  const match = bank.find(
    t => t.register === register && t.story === fallbackStory && t.tone === tone,
  );
  return match?.templates ?? [];
}
