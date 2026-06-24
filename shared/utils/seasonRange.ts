// shared/utils/seasonRange.ts
//
// Tiny shared season-key → display-range formatter. "0304" → "03-04".
//
// Why this exists separately: the equivalent logic was trapped as a private
// `formatSeasonRange` inside shared/components/CardFront.tsx (not exported), and
// the only other season formatter (`formatSeasonKey`) is baseball-only. Neither
// is reusable, so this is the shared, values-only home any surface can import
// (first consumer: the boss page title). CardFront keeps its private copy per
// the no-CardFront-refactor constraint; this can absorb it in a later pass.
//
// Wire shape today is always the 4-digit compact key ("0304"); the extra
// branches mirror CardFront's tolerance so a stray "2003-04"/"03-04" still
// formats instead of leaking raw.

export function formatSeasonRange(season: unknown): string {
  const s = String(season ?? "").trim();
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}-${s.slice(2, 4)}`;
  let m = s.match(/(\d{4})\D+(\d{4})/);
  if (m) return `${m[1].slice(2)}-${m[2].slice(2)}`;
  m = s.match(/(\d{2})\D+(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  return s;
}
