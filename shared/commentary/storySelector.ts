/**
 * storySelector.ts — Star-first causal logic + probabilistic detail assembly.
 * Answers: "Why did I win or lose?" → a star carried or a star failed.
 */

import type {
  StoryId, DetailId, StoryResult, RecordEvent, Register,
  CommentaryRosterCard,
} from "./types";
import type { CommentaryInput } from "./types";
import { detectRecords } from "../data/recordDetector";
import { getHighestBadge, isRareBadge } from "./badgeTiers";

// ─── Helpers ────────────────────────────────────────────────────────────────

function isNameable(_c: CommentaryRosterCard): boolean {
  // Any player who scored the most FP deserves to be named
  return true;
}

function headlineScore(c: CommentaryRosterCard): number {
  // Highest FP is the star — salary is a tiebreaker, not the driver
  const t1 = c.extremeFlags?.find(f => f.tier === 1);
  const extremeBoost = t1 ? (t1.priority * 5) : (c.extremeFlags?.length ?? 0) > 0 ? 50 : 0;
  return (c.actualFp * 10) + (c.salary * 0.5) + extremeBoost;
}

function ratio(c: CommentaryRosterCard): number {
  const p = Number(c.projectedFp ?? 0);
  return p > 0 ? c.actualFp / p : 1;
}

function statN(c: CommentaryRosterCard, key: string): number {
  const s = c.statLine ?? {};
  return Number(s[key] ?? s[key.toUpperCase()] ?? s[key.toLowerCase()] ?? 0);
}

// ─── Star selection ─────────────────────────────────────────────────────────

export function selectStar(roster: CommentaryRosterCard[]): CommentaryRosterCard | null {
  const nameable = roster.filter(isNameable);
  if (nameable.length > 0) {
    return [...nameable].sort((a, b) => headlineScore(b) - headlineScore(a))[0] ?? null;
  }
  return null;
}

// ─── Story ID ───────────────────────────────────────────────────────────────

function pickStoryId(register: Register, star: CommentaryRosterCard | null): StoryId {
  if (!star) return register === "win" ? "clean_win" : "everyone_flat";

  const r = ratio(star);

  if (register === "win") {
    if (r >= 1.35) return "star_went_off";
    if (r >= 1.0) return "star_delivered";
    return "star_quiet_win";
  } else {
    // Star went off but the team still lost — the rest of the roster failed them
    if (r >= 1.35) return "star_carried_loss";
    if (r < 0.65) return "star_no_showed";
    if (r < 0.75) return "star_cold";
    return "everyone_flat";
  }
}

// ─── Probabilistic detail assembly ──────────────────────────────────────────

interface DetailCandidate {
  id: DetailId;
  probability: number;
}

function roll(seed: number, index: number): number {
  const raw = (seed * 9301 + 49297 + index * 7919) % 233280;
  return (raw < 0 ? raw + 233280 : raw) / 233280;
}

// Find a card whose resolved log was sub-10-min. Returns the most expensive
// such card (the "story" card — the user trusted them with cap dollars and
// got 4 minutes). When multiple cards qualify, the highest-salary one wins.
// Returns null if no card has min < 10 (the universal case under the old
// pre-tier-aware-filter behavior; now possible on PURPLE+ cards).
function findLowMinCard(roster: CommentaryRosterCard[]): CommentaryRosterCard | null {
  const candidates = roster.filter(c => {
    const min = Number(c.statLine?.min ?? 0);
    return min > 0 && min < 10;
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.salary ?? 0) - (a.salary ?? 0));
  return candidates[0];
}

function assembleWinDetails(
  input: CommentaryInput,
  star: CommentaryRosterCard | null,
  recordEvents: RecordEvent[],
  seed: number,
): DetailId[] {
  const candidates: DetailCandidate[] = [];

  if (recordEvents.length > 0) candidates.push({ id: "record_event", probability: 0.95 });

  // Rare badge detection — tier 1-2 badges (triple double, 5x5, etc.) ALWAYS mentioned
  const starBadgeIds = (star?.achievements ?? []).map(a => a.id);
  const highestBadge = getHighestBadge(starBadgeIds);
  if (highestBadge && highestBadge.tier <= 1) {
    candidates.push({ id: "rare_badge", probability: 1.0 }); // legendary — always
  } else if (highestBadge && isRareBadge(highestBadge.tier)) {
    candidates.push({ id: "rare_badge", probability: 0.95 }); // rare — almost always
  } else if (highestBadge && highestBadge.tier === 3) {
    candidates.push({ id: "common_badge", probability: 0.30 }); // solid — sometimes
  }

  // Extreme game detection — tier 1 always mentioned, tier 2 supplements
  const tier1Card = input.roster.find(c => c.extremeFlags?.some(f => f.tier === 1));
  const tier2Card = input.roster.find(c => c.extremeFlags?.some(f => f.tier === 2));
  if (tier1Card) candidates.push({ id: "extreme_game", probability: 1.0 }); // always
  else if (tier2Card) candidates.push({ id: "extreme_game", probability: 0.50 }); // sometimes

  const gap = (input.nextTierMin ?? 0) > 0 ? (input.nextTierMin! - input.totalFp) : 999;
  if (gap > 0 && gap <= 3 && input.nextTier) candidates.push({ id: "near_miss_win", probability: 0.70 });

  if (star) {
    const pts = statN(star, "pts");
    const reb = statN(star, "reb");
    const ast = statN(star, "ast");
    if (pts >= 30 || reb >= 12 || ast >= 10) candidates.push({ id: "high_stats", probability: 0.60 });
  }

  const isFirstStreak = input.streak >= 3 && input.prevStreak < 3;
  const isMilestone = input.streak === 5 || input.streak === 10 || input.streak === 15;
  if (isFirstStreak || isMilestone) candidates.push({ id: "streak_event", probability: 0.12 });

  // Streak proximity nudges — "one more win" moments
  if (input.streak === 2) candidates.push({ id: "streak_proximity", probability: 0.30 });
  if (input.streak === 4) candidates.push({ id: "streak_proximity", probability: 0.80 });
  if (input.streak >= 8 && input.streak < 10) candidates.push({ id: "streak_proximity", probability: 0.90 });

  // Low-minute outcome on any resolved card. Detected via statLine.min < 10
  // (PURPLE+ tier cards now surface these via the tier-aware resolve filter).
  // Mutually exclusive at fire time: ejected > injured > ambiguous.
  // TODO: ingestion enrichment for injured/ejected flags — see
  // shared/types/index.ts RawLog comment. Today both flags are always false,
  // so 100% of low-min outcomes fire `low_min_ambiguous`.
  const lowMinCardWin = findLowMinCard(input.roster);
  if (lowMinCardWin) {
    if (lowMinCardWin.statLine?._ejected === true) {
      candidates.push({ id: "ejected", probability: 1.0 });
    } else if (lowMinCardWin.statLine?._injured === true) {
      candidates.push({ id: "injured", probability: 1.0 });
    } else {
      // Win + low-min = lower fire rate. The hand cleared a tier despite
      // the bench cameo; it's interesting but not the headline.
      candidates.push({ id: "low_min_ambiguous", probability: 0.35 });
    }
  }

  candidates.push({ id: "culture_hit", probability: 0.40 });

  // Shuffle then pick up to 2 details
  const shuffled = candidates.sort((a, b) => roll(seed, candidates.indexOf(a)) - roll(seed, candidates.indexOf(b)));

  // Exception: record_broken always goes first and always included
  const recordBroken = recordEvents.some(e => e.type === "record_broken");
  if (recordBroken) {
    const recIdx = shuffled.findIndex(c => c.id === "record_event");
    if (recIdx > 0) {
      const [rec] = shuffled.splice(recIdx, 1);
      shuffled.unshift(rec);
    }
  }

  // Exception: rare badges (tier 1-2) always go first — they ARE the headline
  if (highestBadge && isRareBadge(highestBadge.tier)) {
    const badgeIdx = shuffled.findIndex(c => c.id === "rare_badge");
    if (badgeIdx > 0) {
      const [badge] = shuffled.splice(badgeIdx, 1);
      shuffled.unshift(badge);
    }
  }

  const selected: DetailId[] = [];
  for (let i = 0; i < shuffled.length && selected.length < 2; i++) {
    const chance = selected.length === 0 ? shuffled[i].probability : shuffled[i].probability * 0.3;
    if (roll(seed, i + 100) < chance) {
      selected.push(shuffled[i].id);
    }
  }

  return selected;
}

function assembleLossDetails(
  input: CommentaryInput,
  star: CommentaryRosterCard | null,
  recordEvents: RecordEvent[],
  seed: number,
): DetailId[] {
  const candidates: DetailCandidate[] = [];

  if (recordEvents.length > 0) candidates.push({ id: "record_event", probability: 0.95 });

  // Rare badge in a loss — still worth mentioning ("triple double and still lost")
  const starBadgeIds = (star?.achievements ?? []).map(a => a.id);
  const highestBadge = getHighestBadge(starBadgeIds);
  if (highestBadge && highestBadge.tier <= 1) {
    candidates.push({ id: "rare_badge", probability: 1.0 });
  } else if (highestBadge && isRareBadge(highestBadge.tier)) {
    candidates.push({ id: "rare_badge", probability: 0.85 });
  }

  // Extreme game in a losing hand — tier 1 always, tier 2 sometimes
  const tier1Card = input.roster.find(c => c.extremeFlags?.some(f => f.tier === 1));
  const tier2Card = input.roster.find(c => c.extremeFlags?.some(f => f.tier === 2));
  if (tier1Card) candidates.push({ id: "extreme_game", probability: 1.0 });
  else if (tier2Card) candidates.push({ id: "extreme_game", probability: 0.40 });

  // Low-minute outcome detection (loss path). Same logic as the win-path
  // assembler. Suppresses `zero_card` when both would apply — the low-min
  // detail is the more specific story ("he played 4 minutes" is causal;
  // "someone gave you nothing" is just descriptive).
  // TODO: ingestion enrichment for injured/ejected flags — see
  // shared/types/index.ts RawLog comment.
  const lowMinCardLoss = findLowMinCard(input.roster);
  let pushZeroCard = true;
  if (lowMinCardLoss) {
    pushZeroCard = false;
    if (lowMinCardLoss.statLine?._ejected === true) {
      candidates.push({ id: "ejected", probability: 1.0 });
    } else if (lowMinCardLoss.statLine?._injured === true) {
      candidates.push({ id: "injured", probability: 1.0 });
    } else {
      candidates.push({ id: "low_min_ambiguous", probability: 0.75 });
    }
  }
  const zeroCard = input.roster.find(c => c.actualFp <= 1.0);
  if (zeroCard && pushZeroCard) candidates.push({ id: "zero_card", probability: 0.60 });

  if (input.prevStreak >= 5) candidates.push({ id: "streak_broken", probability: 0.15 });
  candidates.push({ id: "culture_loss", probability: 0.40 });

  const shuffled = candidates.sort((a, b) => roll(seed, candidates.indexOf(a)) - roll(seed, candidates.indexOf(b)));

  // Exception: rare badges always go first in loss context too
  if (highestBadge && isRareBadge(highestBadge.tier)) {
    const badgeIdx = shuffled.findIndex(c => c.id === "rare_badge");
    if (badgeIdx > 0) {
      const [badge] = shuffled.splice(badgeIdx, 1);
      shuffled.unshift(badge);
    }
  }

  const selected: DetailId[] = [];
  for (let i = 0; i < shuffled.length && selected.length < 2; i++) {
    const chance = selected.length === 0 ? shuffled[i].probability : shuffled[i].probability * 0.3;
    if (roll(seed, i + 200) < chance) {
      selected.push(shuffled[i].id);
    }
  }

  return selected;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function selectStory(input: CommentaryInput, seed: number, sport: string = "basketball"): StoryResult {
  const register: Register = input.isBust ? "loss" : "win";
  const star = selectStar(input.roster);
  const storyId = pickStoryId(register, star);
  const recordEvents = star?.statLine ? detectRecords(star.statLine, sport) : [];

  const details = register === "win"
    ? assembleWinDetails(input, star, recordEvents, seed)
    : assembleLossDetails(input, star, recordEvents, seed);

  return { storyId, details, recordEvents };
}
