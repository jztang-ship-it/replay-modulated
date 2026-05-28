// shared/utils/resolvedRosterSerialization.ts
//
// Serialize a resolved roster into a JSONB-safe blob mirroring GeneratedCard
// (shared/types/index.ts:178-186). Two write paths consume this helper:
//
//   1. hand_log.final_roster — sender side, written at logHandToDb time.
//      Read back by GET /api/challenge/{id}/sender-hand for the H2H
//      reveal arc (recipient overlay).
//
//   2. challenge_attempts.score_breakdown +
//      user_notifications.payload.attempter_roster — recipient side,
//      written at attempt-POST time. Read back by the sender-side
//      overlay wrapper for the phase 5b reveal (see
//      docs/h2h-reveal-arc-design.md "Phase 5b — attempter-roster
//      delivery path").
//
// Explicit field picker — additions to GeneratedCard should land here
// intentionally, not implicitly. statLine + achievements are passed
// through as-is (already JSON-safe per their production producers) so
// per-card box scores and badge details survive the round-trip.

export function serializeResolvedRoster(roster: any[]): Array<Record<string, any>> {
  return roster.map((c: any) => ({
    id: String(c.id ?? ""),
    basePlayerId: String(c.basePlayerId ?? ""),
    personKey: String(c.personKey ?? c.basePlayerId ?? ""),
    cardId: String(c.cardId ?? c.id ?? ""),
    name: String(c.name ?? ""),
    team: String(c.team ?? ""),
    season: String(c.season ?? ""),
    position: String(c.position ?? ""),
    photoCode: c.photoCode != null ? String(c.photoCode) : null,
    salary: Number(c.salary ?? 0),
    tier: String(c.tier ?? "WHITE"),
    projectedFp: Number(c.projectedFp ?? 0),
    slotIndex: Number(c.slotIndex ?? 0),
    wasHeld: c.wasHeld === true,
    actualFp: Number(c.actualFp ?? 0),
    fpDelta: Number(c.fpDelta ?? 0),
    gameInfo: {
      date: String(c.gameInfo?.date ?? ""),
      opponent: String(c.gameInfo?.opponent ?? ""),
      ...(c.gameInfo?.homeAway != null ? { homeAway: String(c.gameInfo.homeAway) } : {}),
    },
    statLine: (c.statLine && typeof c.statLine === "object") ? c.statLine : {},
    achievements: Array.isArray(c.achievements) ? c.achievements : [],
  }));
}
