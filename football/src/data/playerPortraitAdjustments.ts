/**
 * football/src/data/playerPortraitAdjustments.ts
 *
 * Per-player overrides for football headshot framing on cards. The default
 * football portrait CSS (in SoccerCard.tsx FootballHero) is tuned to Mbappé
 * as the visual reference — same head footprint and same upper-third eye
 * anchor for every player. Most players look right with the default and
 * need no entry here. Overrides are reserved for sources that physically
 * can't conform to the standard (e.g. tight face-only crops where the
 * head touches both the top and bottom of the source image, leaving no
 * headroom for the hero box's aspect-ratio crop).
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
 * Globals in SoccerCard.tsx are now locked to Mbappé's reference framing
 * (HEADSHOT_WIDTH_PCT=108, HEADSHOT_HEIGHT_PCT=98, HEADSHOT_OBJECT_Y=14),
 * so Messi / Mbappé / Bellingham and the rest of the squad use the bare
 * default with no entry here. Only sources that can't render cleanly at
 * the global appear below.
 */
export const PLAYER_PORTRAIT_ADJUSTMENTS: Record<string, PortraitAdjustment> = {
  // 6909 — Emiliano Martínez (Argentina GK).
  // Source crops fairly tight to the head; at the global Y=14 anchor his
  // face sits noticeably lower in the card than Mbappé's because his
  // shoulders are absent from the source. Override Y back to 8 (face
  // higher in card) and scale 0.96 so his head footprint matches the
  // global 108-width baseline applied to everyone else.
  "6909": { scale: 0.96, objectPositionY: 8 },

  // 3602 — Marcos Rojo (Argentina DEF).
  // Worst-case source in the squad: head fills the entire 150×150 frame
  // with hair touching the top edge and chin flush with the bottom edge,
  // leaving no headroom for the hero box's ~9% vertical aspect-ratio crop.
  // At the global Y=14 anchor, nearly all of that 9% crop comes off the
  // bottom — chin is clipped AND visually pressed against the name strip.
  // Workaround: scale aggressively below the global (0.78) so the head
  // sits visually smaller than the rest of the squad rather than larger,
  // bias the crop toward the top (Y=65: ~5.9% off top, ~3.1% off bottom)
  // so the chin survives, and use translateYPct=-4 to lift the whole IMG
  // up away from the name strip. Cost: a small hair-tip trim — acceptable
  // on his close-cropped haircut.
  // (Prev: scale 0.85, objectPositionY 60 — chin still touched name strip.)
  "3602": { scale: 0.78, objectPositionY: 65, translateYPct: -4 },
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
