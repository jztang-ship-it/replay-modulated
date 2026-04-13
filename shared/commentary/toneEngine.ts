/**
 * toneEngine.ts — Session-aware weighted random tone selection.
 * Reads/writes recent tones to localStorage to prevent repetition.
 */

import type { ToneId, Intensity } from "./types";

const STORAGE_KEY = "rm_recent_tones";
const HISTORY_SIZE = 5;
const STALE_MS = 30 * 60 * 1000; // 30 minutes
const TIMESTAMP_KEY = "rm_tone_timestamp";

// ─── Weight tables ──────────────────────────────────────────────────────────

type WeightRow = Record<ToneId, number>;

const WIN_WEIGHTS: Record<string, WeightRow> = {
  rookie:           { hype: 5,  warm: 20, culture_wry: 35, observational: 20, analytical: 15, deadpan: 5 },
  starter_barely:   { hype: 15, warm: 20, culture_wry: 35, observational: 15, analytical: 10, deadpan: 5 },
  starter_normal:   { hype: 15, warm: 20, culture_wry: 35, observational: 15, analytical: 10, deadpan: 5 },
  starter_dominant: { hype: 15, warm: 20, culture_wry: 35, observational: 15, analytical: 10, deadpan: 5 },
  all_star:         { hype: 25, warm: 20, culture_wry: 35, observational: 15, analytical: 5,  deadpan: 0 },
  mvp:              { hype: 35, warm: 15, culture_wry: 35, observational: 10, analytical: 5,  deadpan: 0 },
  goat:             { hype: 45, warm: 15, culture_wry: 30, observational: 5,  analytical: 5,  deadpan: 0 },
};

const LOSS_WEIGHTS: Record<string, WeightRow> = {
  bust_close: { hype: 0, warm: 20, culture_wry: 35, observational: 20, analytical: 10, deadpan: 15 },
  bust_mid:   { hype: 0, warm: 10, culture_wry: 35, observational: 20, analytical: 10, deadpan: 25 },
  bust_bad:   { hype: 0, warm: 5,  culture_wry: 35, observational: 20, analytical: 10, deadpan: 30 },
};

// ─── History management ─────────────────────────────────────────────────────

function getRecentTones(): ToneId[] {
  try {
    const ts = Number(localStorage.getItem(TIMESTAMP_KEY) ?? 0);
    if (Date.now() - ts > STALE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as ToneId[] : [];
  } catch {
    return [];
  }
}

function pushTone(tone: ToneId): void {
  try {
    const history = getRecentTones();
    history.push(tone);
    if (history.length > HISTORY_SIZE) history.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    localStorage.setItem(TIMESTAMP_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable (SSR, tests) — no-op
  }
}

// ─── Selection ──────────────────────────────────────────────────────────────

function applyPenalties(base: WeightRow, recent: ToneId[]): WeightRow {
  const adjusted = { ...base };
  const tones = Object.keys(adjusted) as ToneId[];

  for (const tone of tones) {
    const count = recent.filter(t => t === tone).length;
    if (count === 1) adjusted[tone] *= 0.5;
    else if (count === 2) adjusted[tone] *= 0.25;
    else if (count >= 3) adjusted[tone] *= 0.1;
  }

  // Normalize to sum = 100
  const total = tones.reduce((s, t) => s + adjusted[t], 0);
  if (total > 0) {
    for (const tone of tones) adjusted[tone] = (adjusted[tone] / total) * 100;
  }

  return adjusted;
}

function weightedRandom(weights: WeightRow, seed: number): ToneId {
  const tones = Object.keys(weights) as ToneId[];
  const raw = (seed * 9301 + 49297) % 233280;
  const roll = (raw < 0 ? raw + 233280 : raw) / 233280 * 100;
  let cumulative = 0;
  for (const tone of tones) {
    cumulative += weights[tone];
    if (roll < cumulative) return tone;
  }
  return tones[tones.length - 1];
}

/** Select a tone for this hand. Writes to localStorage history. */
export function selectTone(intensity: Intensity, seed: number): ToneId {
  const isLoss = intensity.startsWith("bust");
  const table = isLoss ? LOSS_WEIGHTS : WIN_WEIGHTS;
  const base = table[intensity];
  if (!base) return "observational";

  const recent = getRecentTones();
  const adjusted = applyPenalties(base, recent);
  const tone = weightedRandom(adjusted, seed);
  pushTone(tone);
  return tone;
}

/** For testing: select tone without writing to localStorage. */
export function selectTonePure(intensity: Intensity, seed: number, recentTones: ToneId[]): ToneId {
  const isLoss = intensity.startsWith("bust");
  const table = isLoss ? LOSS_WEIGHTS : WIN_WEIGHTS;
  const base = table[intensity];
  if (!base) return "observational";

  const adjusted = applyPenalties(base, recentTones);
  return weightedRandom(adjusted, seed);
}

export { WIN_WEIGHTS, LOSS_WEIGHTS };
