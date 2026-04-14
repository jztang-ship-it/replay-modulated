/**
 * antiRepeat.ts — Multi-dimension repeat tracking.
 *
 * Tracks 5 dimensions in localStorage:
 * 1. lineId — exact line used
 * 2. archetype — narrative type
 * 3. tone — voice register
 * 4. openingPhrase — first 4 words of the resolved line
 * 5. comparisonPattern — comparison structure (e.g. "treated X like Y")
 *
 * Each dimension has its own history window and penalty weight.
 */

import type { CommentaryArchetype, ToneId } from "./types";

const STORAGE_KEY = "rm_antirepeat";
const STALE_MS = 60 * 60 * 1000; // 1 hour

export interface RepeatHistory {
  lineIds: string[];
  archetypes: string[];
  tones: string[];
  openingPhrases: string[];
  comparisonPatterns: string[];
  timestamp: number;
}

const WINDOW_SIZES = {
  lineIds: 10,
  archetypes: 5,
  tones: 5,
  openingPhrases: 8,
  comparisonPatterns: 6,
};

function getHistory(): RepeatHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshHistory();
    const h = JSON.parse(raw) as RepeatHistory;
    if (Date.now() - h.timestamp > STALE_MS) return freshHistory();
    return h;
  } catch {
    return freshHistory();
  }
}

function freshHistory(): RepeatHistory {
  return {
    lineIds: [],
    archetypes: [],
    tones: [],
    openingPhrases: [],
    comparisonPatterns: [],
    timestamp: Date.now(),
  };
}

function saveHistory(h: RepeatHistory): void {
  try {
    h.timestamp = Date.now();
    h.lineIds = h.lineIds.slice(-WINDOW_SIZES.lineIds);
    h.archetypes = h.archetypes.slice(-WINDOW_SIZES.archetypes);
    h.tones = h.tones.slice(-WINDOW_SIZES.tones);
    h.openingPhrases = h.openingPhrases.slice(-WINDOW_SIZES.openingPhrases);
    h.comparisonPatterns = h.comparisonPatterns.slice(-WINDOW_SIZES.comparisonPatterns);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
  } catch {
    // SSR / test — no-op
  }
}

/** Extract first 4 words as opening phrase fingerprint */
export function extractOpeningPhrase(line: string): string {
  return line.split(/\s+/).slice(0, 4).join(" ").toLowerCase();
}

/** Extract comparison pattern if present (e.g. "treated X like Y" → "treated_like") */
export function extractComparisonPattern(line: string): string | null {
  const lower = line.toLowerCase();
  const patterns = [
    /treated .+ like/,
    /made .+ look/,
    /turned .+ into/,
    /played like/,
    /felt like/,
    /looked like/,
    /reminded .+ of/,
    /is .+ the new/,
  ];
  for (const p of patterns) {
    const m = lower.match(p);
    if (m) return m[0].replace(/\s+/g, "_").slice(0, 30);
  }
  return null;
}

export interface RepeatPenalty {
  /** 0.0 = blocked, 1.0 = no penalty */
  score: number;
  reasons: string[];
}

/**
 * Score a candidate line against repeat history.
 * Returns a penalty multiplier (0.0–1.0) and reasons.
 */
export function scoreRepeatPenalty(
  lineId: string,
  archetype: CommentaryArchetype,
  tone: ToneId,
  resolvedLine: string,
): RepeatPenalty {
  const h = getHistory();
  let score = 1.0;
  const reasons: string[] = [];

  // Dimension 1: exact line ID — hard block if in last 10
  if (h.lineIds.includes(lineId)) {
    return { score: 0.0, reasons: ["exact_line_repeat"] };
  }

  // Dimension 2: archetype — penalize same archetype in last 5
  const archCount = h.archetypes.filter(a => a === archetype).length;
  if (archCount >= 2) { score *= 0.3; reasons.push("archetype_saturated"); }
  else if (archCount === 1) { score *= 0.6; reasons.push("archetype_recent"); }

  // Dimension 3: tone — penalize same tone in last 5
  const toneCount = h.tones.filter(t => t === tone).length;
  if (toneCount >= 2) { score *= 0.4; reasons.push("tone_saturated"); }
  else if (toneCount === 1) { score *= 0.7; reasons.push("tone_recent"); }

  // Dimension 4: opening phrase — penalize similar openings
  const opening = extractOpeningPhrase(resolvedLine);
  if (h.openingPhrases.includes(opening)) {
    score *= 0.3;
    reasons.push("opening_repeat");
  }

  // Dimension 5: comparison pattern — penalize same structure
  const comp = extractComparisonPattern(resolvedLine);
  if (comp && h.comparisonPatterns.includes(comp)) {
    score *= 0.4;
    reasons.push("comparison_repeat");
  }

  return { score, reasons };
}

/**
 * Record a used line into repeat history. Call after final selection.
 */
export function recordUsage(
  lineId: string,
  archetype: CommentaryArchetype,
  tone: ToneId,
  resolvedLine: string,
): void {
  const h = getHistory();
  h.lineIds.push(lineId);
  h.archetypes.push(archetype);
  h.tones.push(tone);
  h.openingPhrases.push(extractOpeningPhrase(resolvedLine));
  const comp = extractComparisonPattern(resolvedLine);
  if (comp) h.comparisonPatterns.push(comp);
  saveHistory(h);
}

/** For testing: get history without side effects */
export function getRepeatHistory(): RepeatHistory {
  return getHistory();
}

/** For testing: clear history */
export function clearRepeatHistory(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
}
