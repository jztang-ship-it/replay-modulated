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

// ─── Helpers ────────────────────────────────────────────────────────────────

function isNameable(c: CommentaryRosterCard): boolean {
  const t = (c.cardTier ?? "").toUpperCase();
  return t === "RED" || t === "ORANGE" || t === "PURPLE";
}

function headlineScore(c: CommentaryRosterCard): number {
  return (c.salary * 2.5) + (c.actualFp * 1.5);
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

function assembleWinDetails(
  input: CommentaryInput,
  star: CommentaryRosterCard | null,
  recordEvents: RecordEvent[],
  seed: number,
): DetailId[] {
  const candidates: DetailCandidate[] = [];

  if (recordEvents.length > 0) candidates.push({ id: "record_event", probability: 0.95 });

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

  // near_miss_loss removed — do not console losses, busts get no sympathy text

  const zeroCard = input.roster.find(c => c.actualFp <= 1.0);
  if (zeroCard) candidates.push({ id: "zero_card", probability: 0.60 });

  if (input.prevStreak >= 5) candidates.push({ id: "streak_broken", probability: 0.15 });
  candidates.push({ id: "culture_loss", probability: 0.40 });

  const shuffled = candidates.sort((a, b) => roll(seed, candidates.indexOf(a)) - roll(seed, candidates.indexOf(b)));

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
