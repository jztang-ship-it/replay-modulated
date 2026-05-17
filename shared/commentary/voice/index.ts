/**
 * Voice router — picks the right SYSTEM prompt by sport key.
 *
 * Usage in generateCulture.ts:
 *   import { pickVoice } from "@shared/commentary/voice";
 *   const SYSTEM = pickVoice(process.env.SPORT ?? "basketball");
 *
 * Sport keys match the per-sport SPA directory names: "basketball",
 * "football", "baseball". Default fallback is basketball — the only
 * fully-locked voice as of this commit.
 */

import { BASKETBALL_VOICE } from "./basketballVoice";
import { FOOTBALL_VOICE } from "./footballVoice";
import { BASEBALL_VOICE } from "./baseballVoice";

export type SportKey = "basketball" | "football" | "baseball";

export function pickVoice(sport: string): string {
  switch (sport.toLowerCase()) {
    case "basketball": return BASKETBALL_VOICE;
    case "football":   return FOOTBALL_VOICE;
    case "baseball":   return BASEBALL_VOICE;
    default:
      // Unknown sport → fall back to basketball + log a warning. Prevents
      // a typo in CULTURE_SPORT from silently sending an empty SYSTEM to
      // the model and burning tokens on a useless run.
      // eslint-disable-next-line no-console
      console.warn(`[voice] unknown sport "${sport}" — falling back to basketball`);
      return BASKETBALL_VOICE;
  }
}

export { BASKETBALL_VOICE, FOOTBALL_VOICE, BASEBALL_VOICE };
