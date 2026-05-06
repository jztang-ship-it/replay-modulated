/**
 * football/src/data/playerPortraitAdjustments.ts
 *
 * Per-player overrides for football headshot framing on cards. The default
 * football portrait CSS (in SoccerCard.tsx FootballHero) is tuned to feel
 * like basketball — head/face roughly the same fraction of the card area,
 * eyes anchored near the top third. Most players look right with the
 * default. A few photos in the API-Football set are framed unusually
 * (zoomed too tight, off-center, head sitting too low because the photo
 * crops at the chin rather than the chest) — those need a small nudge.
 *
 * How to use:
 *   1. Run the app with `?debugFootballImages=1` and look at the cards.
 *   2. For any player whose head looks wrong:
 *      - too small / too big        → tune `scale`
 *      - too high / too low         → tune `objectPositionY` (smaller = higher)
 *      - shifted off-center         → tune `objectPositionX`
 *      - slipped down/up after scale → tune `translateYPct`
 *   3. Add an entry keyed by the player's basePlayerId. Player IDs come
 *      from football/src/data/playerImageManifest.ts (left side of each
 *      manifest entry).
 *
 * Field reference (all optional; omit any you don't need):
 *   scale          — multiplier on the default WIDTH/HEIGHT percentages.
 *                    1.0 = default, 1.10 = 10% bigger, 0.90 = 10% smaller.
 *                    Range: 0.85–1.30 is sane. Bigger = closer crop on the face.
 *   objectPositionX — % across the source image used as the visible center.
 *                    Default 50 (centered). Range: 30–70.
 *   objectPositionY — % down from the top of the source image used as the
 *                    visible vertical center. Default 18. Smaller = face
 *                    moves UP within the card frame. Range: 5–35.
 *   translateXPct  — additional X offset as % of hero container width
 *                    AFTER object-fit cropping. Default 0. Range: −10..10.
 *   translateYPct  — additional Y offset as % of hero container height
 *                    AFTER object-fit cropping. Default 0. Range: −10..10.
 *
 * Anything not listed here uses the FootballHero defaults — leave the file
 * empty if no overrides are currently needed.
 */

export interface PortraitAdjustment {
  scale?: number;
  objectPositionX?: number;
  objectPositionY?: number;
  translateXPct?: number;
  translateYPct?: number;
}

/**
 * basePlayerId → portrait override.
 *
 * Conservative seed list — only includes the named players from the design
 * brief whose default crop is visibly off after the basketball-aligned
 * default tune. Add more entries as the user spots them in `?debugFootballImages=1`.
 */
export const PLAYER_PORTRAIT_ADJUSTMENTS: Record<string, PortraitAdjustment> = {
  // 6909 — Emiliano Martínez (Argentina GK).
  // API-Football photo crops fairly tight to the head with very little
  // shoulder visible — default scale leaves the head feeling small relative
  // to other cards. Slight scale-up + nudge down to keep the eyes in the
  // upper-third sweet spot rather than touching the card top.
  "6909": { scale: 1.04, objectPositionY: 16 },

  // 5503 — Lionel Messi (Argentina FWD).
  // Photo is a close shoulder-up shot; default crop reads fine. Add a
  // tiny scale-down so his head doesn't look bigger than teammates'.
  "5503": { scale: 0.96, objectPositionY: 18 },

  // 3009 — Kylian Mbappé (France FWD).
  // Photo crops slightly higher in the frame than typical (more forehead
  // showing, less neck). Drop objectPositionY a touch so the eyes land in
  // the same zone as Messi/Bellingham.
  "3009": { scale: 0.98, objectPositionY: 14 },

  // 30714 — Jude Bellingham (England MID).
  // Default crop looks correct in audit. Listed here as a no-op anchor so
  // future tuning has a documented baseline.
  // (No fields set = defaults applied.)
  "30714": {},

  // 3602 — Marcos Rojo (Argentina DEF).
  // Photo is well-framed; no override needed at default settings.
  "3602": {},
};

/**
 * Look up the adjustment for a player. Returns an empty object when there
 * is no entry, so callers can spread it into the default values without a
 * null check.
 */
export function getPortraitAdjustment(basePlayerId: string | undefined | null): PortraitAdjustment {
  if (!basePlayerId) return {};
  return PLAYER_PORTRAIT_ADJUSTMENTS[basePlayerId] ?? {};
}
