/**
 * headshotUrl.ts — returns CDN URL for a player headshot.
 * Falls back to local /headshots/ path if VITE_HEADSHOT_BASE_URL is not set.
 */

const BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_HEADSHOT_BASE_URL as string | undefined)
  ?? '/headshots';

export function headshotUrl(photoCode: string | undefined | null, sport = 'nba'): string {
  if (!photoCode) return '';
  // If env var is set, it already includes the sport segment (e.g. .../headshots/nba)
  // If falling back to local, just use /headshots/{code}.png
  if (BASE === '/headshots') return `/headshots/${photoCode}.png`;
  const base = sport === 'nba' ? BASE : BASE.replace('/nba', `/${sport}`);
  return `${base}/${photoCode}.png`;
}
