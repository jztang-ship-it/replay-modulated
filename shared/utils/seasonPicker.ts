/**
 * shared/utils/seasonPicker.ts
 *
 * Deterministic "season of the day" picker. Same (sport, UTC date) always
 * resolves to the same season — every client sees the same answer without
 * needing to coordinate. Drives the slot-machine reel UI: the predetermined
 * choice is computed up-front; the reel animates the reveal.
 *
 * Inclusion rule (matches the slate-architecture principle): pick uniformly
 * from whatever's in the manifest. The manifest is the eligibility set,
 * built mechanically by the data pipeline. No editorial weighting here —
 * if a season is in the manifest, it has equal odds of being today's pick.
 */

import { hashStr, mulberry32 } from "./seededRng";
import { getDailyBonusDateKey } from "./dailyBonus";

export type SeasonManifestEntry = {
  /** 4-digit numeric key, e.g. "2425" or "9697". */
  key: string;
  /** Human-readable label, e.g. "2024-25". */
  label: string;
  playerCount: number;
  logCount: number;
  playersBytes?: number;
  logsBytes?: number;
};

export type SeasonsManifest = {
  generatedAt: string;
  seasons: SeasonManifestEntry[];
};

/**
 * Pick the season for a given (sport, date). Deterministic.
 * Returns null if the manifest is empty.
 */
export function pickTodaysSeason(
  sportKey: string,
  date: Date,
  manifest: SeasonsManifest,
): SeasonManifestEntry | null {
  if (!manifest?.seasons?.length) return null;
  const dateKey = getDailyBonusDateKey(date);
  const seed = hashStr(`${sportKey}|season-pick|${dateKey}`);
  const rng = mulberry32(seed);
  const idx = Math.floor(rng() * manifest.seasons.length);
  return manifest.seasons[idx];
}

/**
 * Load the manifest from the SPA's public-data path. Cached at module level
 * so multiple callers in a session don't refetch.
 */
let _manifestCache: SeasonsManifest | null = null;
let _manifestPromise: Promise<SeasonsManifest> | null = null;

export async function loadSeasonsManifest(url: string): Promise<SeasonsManifest> {
  if (_manifestCache) return _manifestCache;
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = (async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch manifest: ${r.status}`);
    const m = (await r.json()) as SeasonsManifest;
    _manifestCache = m;
    _manifestPromise = null;
    return m;
  })();
  return _manifestPromise;
}

export function clearManifestCache(): void {
  _manifestCache = null;
  _manifestPromise = null;
}

/**
 * Returns labels in chronological order (oldest → newest), suitable for
 * the reel display. The manifest may store keys in lexical order (which
 * puts 9697 after 2425) — sort by parsed start year for human-readable
 * progression.
 */
export function manifestLabelsChronological(manifest: SeasonsManifest): string[] {
  return [...manifest.seasons]
    .sort((a, b) => Number(a.label.slice(0, 4)) - Number(b.label.slice(0, 4)))
    .map(s => s.label);
}
