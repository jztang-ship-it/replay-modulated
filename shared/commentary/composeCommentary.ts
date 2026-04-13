/**
 * composeCommentary.ts — The unified composer. Orchestrates Steps 1-6.
 * Sport-agnostic: uses CommentaryInput and delegates to sport-specific template banks.
 */

import type {
  Register, Intensity, ToneId,
  CommentaryInput,
} from "./types";
import { selectTone } from "./toneEngine";
import { selectStory, selectStar } from "./storySelector";
import { lookupTemplates, lookupFallbackTemplates } from "./templateBank";
import { buildTemplateData, composeMessage } from "./templateResolver";

// ─── Culture lookup ──────────────────────────────────────────────────────────
// Lazy-loaded to avoid circular deps and to keep composer sport-agnostic.
let _cultureDb: Record<string, Record<string, { nicknames?: string[] }>> = {};

function getCultureDb(sport: string): Record<string, { nicknames?: string[] }> {
  if (!_cultureDb[sport]) {
    try {
      if (sport === "baseball") {
        // @ts-ignore
        const mod = require("../../baseball/src/utils/playerCulture");
        _cultureDb[sport] = mod.PLAYER_CULTURE ?? {};
      } else {
        // Dynamic require — works in Vite/bundler environments
        // @ts-ignore
        const mod = require("../../basketball/src/utils/playerCulture");
        _cultureDb[sport] = mod.PLAYER_CULTURE ?? {};
      }
    } catch {
      _cultureDb[sport] = {};
    }
  }
  return _cultureDb[sport]!;
}

function lookupCulture(name: string, sport: string): { nicknames?: string[] } | null {
  const parts = name.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  return getCultureDb(sport)[last] ?? null;
}

// ─── Step 1: Register ───────────────────────────────────────────────────────

function determineRegister(input: CommentaryInput): Register {
  return input.isBust ? "loss" : "win";
}

// ─── Step 2: Intensity ──────────────────────────────────────────────────────

function determineIntensity(input: CommentaryInput): Intensity {
  const { winTier, totalFp, tierFloor, nextTierMin, isBust } = input;
  const margin = totalFp - (tierFloor ?? 0);

  if (isBust) {
    const gap = (nextTierMin ?? 0) > 0 ? (nextTierMin! - totalFp) : 999;
    if (gap <= 8) return "bust_close";
    if (gap <= 25) return "bust_mid";
    return "bust_bad";
  }

  switch (winTier) {
    case "GOAT": return "goat";
    case "MVP": return "mvp";
    case "ALL_STAR": return "all_star";
    case "STARTER":
      if (margin <= 5) return "starter_barely";
      if (margin >= 15) return "starter_dominant";
      return "starter_normal";
    case "ROOKIE": return "rookie";
    default: return "starter_normal";
  }
}

// ─── Pick helper ────────────────────────────────────────────────────────────

function pick<T>(arr: T[], seed: number): T {
  if (!arr.length) return "" as any;
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

// ─── ROOKIE half-back flag (~40%) ───────────────────────────────────────────

function isHalfBack(intensity: Intensity, seed: number): boolean {
  if (intensity !== "rookie") return false;
  return ((seed * 7919) % 100) < 40;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface PostRevealCopy {
  primary: string;
  secondary?: string;
}

export function composeCommentary(input: CommentaryInput & { sport?: string }): PostRevealCopy {
  const seed = Math.abs(Math.floor(input.totalFp * 13) + input.streak * 7 + (input.isBust ? 3 : 0));
  const sport = input.sport ?? "basketball";

  // Step 1: Register
  const register = determineRegister(input);

  // Step 2: Intensity
  const intensity = determineIntensity(input);

  // Step 3: Star
  const star = selectStar(input.roster);
  const culture = star ? lookupCulture(star.name, sport) : null;

  // Step 4: Story + details
  const { storyId, details, recordEvents } = selectStory(input, seed, sport);

  // Step 5: Tone
  const tone = selectTone(intensity, seed);

  // Step 6: Compose
  let templates = lookupTemplates(sport, register, storyId, tone);
  if (templates.length === 0) {
    templates = lookupFallbackTemplates(sport, register, tone);
  }
  if (templates.length === 0) {
    return { primary: register === "win" ? "Good hand." : "Tough night." };
  }

  const template = pick(templates, seed);
  const data = buildTemplateData(star, input, recordEvents, culture);

  let message = composeMessage(template, data, details);

  // ROOKIE half-back: prepend ~40% of the time
  if (isHalfBack(intensity, seed) && !message.toLowerCase().includes("half")) {
    message = `Half your money back. ${message}`;
  }

  return { primary: message };
}
