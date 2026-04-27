/**
 * basketball/src/utils/buildBasketballContext.ts
 * Sport-specific culture injector. Maps a roster to per-card culture nuggets
 * by looking up players in playerCulture.ts and pre-filtering tone arrays
 * down to the ones that match each card's actual performance.
 *
 * The output is a CommentaryCultureNugget[] consumed by the sport-agnostic
 * promptBuilder. Keeping the filter here means the model only sees relevant
 * phrasing, which keeps prompts tight and on-target.
 */

import { PLAYER_CULTURE, type PlayerCulture } from "./playerCulture";
import type {
  CommentaryRosterCard,
  CommentaryCultureNugget,
} from "@shared/commentary/types";
import { lineCitesMismatchedStat } from "../../../shared/commentary/selectCommentary";

const PERF_BAND = 5;          // FP delta below which we consider a card "on pace"
const BIG_GAME_DELTA = 15;    // additional band for outlier overperformance
const QUIET_GAME_DELTA = -15; // additional band for outlier underperformance
const MAX_TONES_PER_CARD = 5; // cap to keep prompt size sane

/**
 * PLAYER_CULTURE is keyed by lowercase last name (e.g. "harden", "jokic").
 * Strip diacritics and take the last whitespace-separated token.
 */
function cultureKey(name: string): string {
  const stripped = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const tokens = stripped.trim().split(/\s+/);
  return (tokens[tokens.length - 1] ?? "").toLowerCase();
}

function pickRelevantTones(
  culture: PlayerCulture,
  card: CommentaryRosterCard,
): string[] {
  const out: string[] = [];
  const delta = card.actualFp - card.projectedFp;

  if (delta >= PERF_BAND) {
    out.push(...(culture.overperform ?? []));
    if (delta >= BIG_GAME_DELTA) out.push(...(culture.bigGame ?? []));
  } else if (delta <= -PERF_BAND) {
    out.push(...(culture.underperform ?? []));
    if (delta <= QUIET_GAME_DELTA) out.push(...(culture.quietGame ?? []));
  } else {
    out.push(...(culture.onPace ?? []));
  }

  // Always include 1-2 generic tier-flavor lines so the model has phrasing
  // to borrow even on "ON_PACE" hands where the perf-specific arrays are thin.
  const tier = culture.salaryTier;
  if (tier === "max" || tier === "star") {
    out.push(...(culture.tier1 ?? []).slice(0, 2));
  } else if (tier === "role" || tier === "value") {
    out.push(...(culture.tier2 ?? []).slice(0, 2));
  } else {
    out.push(...(culture.tier3 ?? []).slice(0, 2));
  }

  // Filter out lines that cite stat values which don't match this card's
  // current game. Source pools (overperform / bigGame / tier1 / etc.) include
  // historical references — the LLM was free to echo them and produce
  // "Pacers have nightmares about his 64-point game" on a 37-pt night.
  // Cap is applied AFTER filtering so we keep the requested count.
  const sl = (card.statLine ?? {}) as Record<string, number | undefined>;
  return out.filter(line => !lineCitesMismatchedStat(line, sl)).slice(0, MAX_TONES_PER_CARD);
}

export function buildBasketballContext(
  roster: CommentaryRosterCard[],
): CommentaryCultureNugget[] {
  const out: CommentaryCultureNugget[] = [];
  for (const card of roster) {
    const key = cultureKey(card.name);
    const culture = PLAYER_CULTURE[key];
    if (!culture) continue;

    // Same stat-citation guard applied to every nugget field that ends up in
    // the LLM prompt. Without this, opponentFlavor / salaryNarrative /
    // milestones / streakLines / etc. could feed historical numbers into the
    // model that don't match tonight's box score.
    const sl = (card.statLine ?? {}) as Record<string, number | undefined>;
    const safe = (lines?: string[]): string[] | undefined =>
      lines?.filter(l => !lineCitesMismatchedStat(l, sl));

    const rawOppFlavor =
      culture.opponentFlavor && card.opponent
        ? culture.opponentFlavor[card.opponent.toUpperCase()]
        : undefined;
    const opponentFlavor =
      rawOppFlavor && !lineCitesMismatchedStat(rawOppFlavor, sl) ? rawOppFlavor : undefined;

    // Check if this is a former-team matchup (team-keyed, not stat-cited)
    const isFormerTeam = rawOppFlavor !== undefined;

    out.push({
      playerName: card.name,
      knownFor: culture.knownFor,
      nicknames: culture.nicknames,
      relevantTones: pickRelevantTones(culture, card),
      opponentFlavor,
      signatureGames: culture.signatureGames?.slice(0, 3),
      salaryNarrative: safe(culture.salaryNarrative)?.slice(0, 2),
      streakLines: safe(culture.streakLines)?.slice(0, 2),
      teamContext: safe(culture.teamContext)?.slice(0, 1),
      draftAndPath: safe(culture.draftAndPath)?.slice(0, 1),
      formerTeam: isFormerTeam ? safe(culture.formerTeam)?.slice(0, 1) : undefined,
      rivalry: safe(culture.rivalry)?.slice(0, 1),
      milestones: safe(culture.milestones)?.slice(0, 1),
    });
  }
  return out;
}
