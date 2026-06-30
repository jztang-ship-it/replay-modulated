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

// boss-winscreen-reclaim (2026-06-30): the single shared boss team-season
// resolver. bossIdentityId follows the authoritative {TEAM}-{YYYY} convention
// (challengeTypes.ts), e.g. "PHX-0607" → "PHX 06-07". Previously this logic was
// inline in H2HRecipientPlay.tsx (play surface only), so the reveal/results
// surfaces leaked the boss display name ("Seven Seconds or Less" → "SEV…").
// Lifting it here lets play AND reveal/results resolve the SAME label, drift-
// proof. Returns null when there's no usable id (caller falls back).
export function formatBossTeamSeason(
  bossIdentityId: string | null | undefined,
): string | null {
  if (!bossIdentityId) return null;
  const [team, season] = String(bossIdentityId).split("-");
  if (!team) return null;
  return season ? `${team} ${formatSeasonRange(season)}` : team;
}
