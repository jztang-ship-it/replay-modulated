/**
 * selectCommentary.ts — Unified runtime commentary selector.
 *
 * Replaces composeCommentary.ts as the main entry point.
 *
 * Flow:
 * 1. Classify archetype (deterministic, first — archetype is king)
 * 2. Determine intensity
 * 3. Select tone (secondary to archetype)
 * 4. Load library, filter by archetype → register → tone → enabled
 * 5. Apply anti-repeat penalties and score candidates
 * 6. Select best candidate
 * 7. Fill template tokens via templateResolver
 * 8. Assemble sub-line from details
 * 9. Select stamp if applicable
 * 10. Record usage in anti-repeat
 * 11. Return CommentaryResult
 */

import type {
  CommentaryInput,
  CommentaryLine,
  CommentaryLibrary,
  CommentaryResult,
  CommentaryArchetype,
  ToneId,
  Intensity,
  Register,
} from "./types";
import { classifyArchetype } from "./classifyArchetype";
import { selectTone } from "./toneEngine";
import { buildTemplateData, resolveTemplate, composeMessage } from "./templateResolver";
import { scoreRepeatPenalty, recordUsage } from "./antiRepeat";
import { selectStamp } from "./priorities";
import { getFallbackChain } from "./archetypes";
import { selectStory } from "./storySelector";

// ── Library loader ─────────────────────────────────────────────────────────

let _libraries: Record<string, CommentaryLibrary> = {};

function loadLibrary(sport: string): CommentaryLibrary {
  if (!_libraries[sport]) {
    try {
      if (sport === "basketball") {
        _libraries[sport] = require("./libraries/basketball.json");
      } else if (sport === "baseball") {
        try {
          _libraries[sport] = require("./libraries/baseball.json");
        } catch {
          _libraries[sport] = {};
        }
      } else {
        _libraries[sport] = {};
      }
    } catch {
      _libraries[sport] = {};
    }
  }
  return _libraries[sport]!;
}

// ── Intensity (same logic as composeCommentary) ────────────────────────────

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
    case "LEGEND": return "goat";
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

// ── Culture lookup ─────────────────────────────────────────────────────────

let _cultureDb: Record<string, Record<string, { nicknames?: string[] }>> = {};

function lookupCulture(name: string, sport: string): { nicknames?: string[] } | null {
  if (!_cultureDb[sport]) {
    try {
      if (sport === "baseball") {
        const mod = require("../../baseball/src/utils/playerCulture");
        _cultureDb[sport] = mod.PLAYER_CULTURE ?? {};
      } else {
        const mod = require("../../basketball/src/utils/playerCulture");
        _cultureDb[sport] = mod.PLAYER_CULTURE ?? {};
      }
    } catch { _cultureDb[sport] = {}; }
  }
  const parts = name.trim().split(/\s+/);
  const suffixes = new Set(["II", "III", "IV", "V", "Jr.", "Jr", "Sr.", "Sr"]);
  while (parts.length > 1 && suffixes.has(parts[parts.length - 1])) parts.pop();
  const last = (parts[parts.length - 1] ?? "").toLowerCase();
  return _cultureDb[sport]![last] ?? null;
}

// ── Seed-based random ──────────────────────────────────────────────────────

function seededRandom(seed: number, index: number): number {
  const raw = (seed * 9301 + 49297 + index * 7919) % 233280;
  return (raw < 0 ? raw + 233280 : raw) / 233280;
}

// ── Core selector ──────────────────────────────────────────────────────────

export interface PostRevealCopy {
  primary: string;
  secondary?: string;
}

export function selectCommentary(
  input: CommentaryInput & { sport?: string },
): PostRevealCopy {
  const sport = input.sport ?? "basketball";
  const seed = Math.abs(Math.floor(input.totalFp * 13) + input.streak * 7 + (input.isBust ? 3 : 0));

  // Step 1: Classify archetype (FIRST — archetype is king)
  const classification = classifyArchetype(input);
  const { archetype, star, nearMiss, deltaToNextTier } = classification;

  // Step 2: Determine intensity
  const intensity = determineIntensity(input);

  // Step 3: Select tone (SECONDARY to archetype)
  const tone = selectTone(intensity, seed);
  const register: Register = input.isBust ? "loss" : "win";

  // Step 4: Get story details for sub-line assembly
  const { details, recordEvents } = selectStory(input, seed, sport);

  // Step 5: Build template data
  const culture = star ? lookupCulture(star.name, sport) : null;
  const templateData = buildTemplateData(star, input, recordEvents, culture);

  // Step 6: Load library and filter candidates
  const library = loadLibrary(sport);
  const fallbackChain = getFallbackChain(archetype);

  let candidates: CommentaryLine[] = [];
  let matchedArchetype: CommentaryArchetype = archetype;

  for (const arch of fallbackChain) {
    const pool = library[arch] ?? [];

    // Filter: register match, tone match, enabled, sport match
    const toneMatch = pool.filter(line =>
      line.enabled &&
      line.register === register &&
      line.tone === tone &&
      (line.sport === "any" || line.sport === sport)
    );

    if (toneMatch.length > 0) {
      candidates = toneMatch;
      matchedArchetype = arch;
      break;
    }

    // Fallback within archetype: any tone
    const anyTone = pool.filter(line =>
      line.enabled &&
      line.register === register &&
      (line.sport === "any" || line.sport === sport)
    );

    if (anyTone.length > 0) {
      candidates = anyTone;
      matchedArchetype = arch;
      break;
    }
  }

  // Absolute fallback — static line
  if (candidates.length === 0) {
    const fallbackLine = register === "win" ? "Good hand." : "Tough night.";
    return { primary: fallbackLine };
  }

  // Step 7: Score candidates with anti-repeat
  const scored = candidates.map((line, i) => {
    const resolved = resolveTemplate(line.template, templateData);
    const penalty = scoreRepeatPenalty(line.id, matchedArchetype, tone, resolved);
    const quality = line.qualityScore ?? 7;
    const jitter = 0.9 + seededRandom(seed, i) * 0.2;
    return {
      line,
      resolved,
      score: quality * penalty.score * jitter,
    };
  });

  // Sort by score descending, pick the best non-blocked
  scored.sort((a, b) => b.score - a.score);
  const best = scored.find(s => s.score > 0) ?? scored[0];

  // Step 8: Compose message with detail sub-lines
  const mainLine = composeMessage(best.line.template, templateData, details);

  // Step 9: Stamp
  const stamp = selectStamp(matchedArchetype, deltaToNextTier, input.prevStreak);

  // Step 10: Record usage in anti-repeat
  recordUsage(best.line.id, matchedArchetype, tone, mainLine);

  // Step 11: Return as PostRevealCopy (compatible with existing UI)
  return {
    primary: mainLine,
    secondary: stamp ?? undefined,
  };
}
