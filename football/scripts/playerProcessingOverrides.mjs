/**
 * football/scripts/playerProcessingOverrides.mjs
 *
 * Per-player processing-mode overrides for the football headshot
 * pipeline. The processing script consults this manifest to decide
 * which background-removal algorithm to apply for each player ID.
 *
 * Why this exists
 * ───────────────
 * Football source images come from API-Football and are NOT a
 * consistent set. They mix:
 *   - bright white studio shots (Mbappé, Messi, Bellingham)
 *   - mid-grey studio shots (Martinez 6909)
 *   - dark studio / blurry-pitch backdrops (Moreno 5573)
 *   - kit-coloured backdrops (Lemar 3245 — purple kit on purple bg)
 *   - in-action photos with crowd / pitch behind the player
 *
 * A single global algorithm tuned aggressively to handle the mid-grey
 * studio shots eats faces/jerseys on white-studio shots. A single
 * conservative algorithm leaves grey/dark studio backdrops untouched.
 * Per-player mode overrides give us surgical control. New players
 * default to "whiteStudio" (the conservative historical default that
 * matches how the original `--force=false` runs behaved).
 *
 * Modes
 * ─────
 * "whiteStudio"   — conservative: only remove edge-connected pixels
 *                   that are bright (max channel > ~215) AND nearly
 *                   unsaturated (sat < ~15). Preserves mid-tones, faces,
 *                   coloured jerseys, and skin. Safe default.
 *
 *   {preserveJersey: true} — extra-tight saturation cap to avoid eating
 *                            white-or-near-white jerseys (Argentina,
 *                            Mbappé in the white France kit). Drops
 *                            sat cap to 8 and bright floor to 230.
 *
 * "grayStudio"    — Martinez-fix algorithm: brightness > 90 + sat < 35
 *                   with a "neutral channels" arm to catch mid-grey
 *                   backdrops. Eats more aggressively. Use ONLY when
 *                   the source has a uniform grey (or near-grey) studio
 *                   background and the subject is colourful/dark enough
 *                   to fence off interior neutrals.
 *
 * "darkStudio"    — for shots where the bg is darker than the subject
 *                   (e.g. blurred pitch behind a brightly-lit player).
 *                   Edge-connected only, brightness < 100 AND sat < 35.
 *                   Conservative; avoids eating dark hair/clothing
 *                   because it's restricted to edge-connected pixels.
 *
 * "skipUseOriginal"  — do NOT process. Resolver should serve the local
 *                      raw image at /football/players/<id>.png with
 *                      its original photo background intact.
 *
 * "manualBadCutout"  — processing produced a damaged subject; do NOT
 *                      use the processed file. Resolver falls back to
 *                      a portrait tile / sport-specific visual fallback.
 *
 * Adding a player override
 * ────────────────────────
 *   1. Run audit: `node football/scripts/auditProcessedHeadshots.mjs --ids=<id>`
 *   2. Inspect debug-headshots/<id>-on-cardcolor.png
 *   3. If subject has been eaten (face/jersey holes): pick a safer mode
 *      OR mark as manualBadCutout.
 *   4. Add an entry below. Re-run processPlayerHeadshots.mjs --ids=<id> --force
 */

export const playerProcessingOverrides = {
  // ── Verified clean cutouts ────────────────────────────────────────
  // Damián Emiliano Martínez (Argentina) — mid-grey studio backdrop,
  // colourful Argentina jersey fences interior neutrals. grayStudio
  // is correct here.
  "6909": { mode: "grayStudio" },

  // ── White-studio players (conservative) ──────────────────────────
  // Lionel Messi — white studio. preserveJersey because Argentina
  // jerseys can be near-white in highlights.
  "5503": { mode: "whiteStudio", preserveJersey: true },
  // Kylian Mbappé — white studio + white France kit. preserveJersey
  // mandatory or we eat the jersey.
  "3009": { mode: "whiteStudio", preserveJersey: true },
  // Jude Bellingham — white studio.
  "30714": { mode: "whiteStudio" },

  // ── Bad cutouts: use fallback ─────────────────────────────────────
  // Thomas Lemar — France kit on a backdrop that the gray algorithm
  // ate as background, leaving a "destroyed purple face mask". No
  // safe algorithm currently produces a clean cutout for this image;
  // resolver will use the portrait tile fallback.
  "3245": { mode: "manualBadCutout" },

  // Héctor Moreno — original is a stadium-photo (crowd/stand behind
  // him), not a studio shot. darkStudio caught the darkest patches but
  // left coloured stadium fragments around the head; result was messier
  // than the raw original. Per "safe over aggressive": mark as
  // manualBadCutout, resolver uses fallback (raw local image with the
  // original photo backdrop, OR the sport-specific portrait tile).
  "5573": { mode: "manualBadCutout" },
};

/**
 * Look up the override for a given player id. Returns the default
 * mode (whiteStudio) when no explicit override exists — matching the
 * conservative behaviour of the pre-751f524 pipeline.
 */
export function getProcessingOverride(playerId) {
  const id = String(playerId);
  return playerProcessingOverrides[id] ?? { mode: "whiteStudio" };
}

/** Set of all modes the processor must implement. */
export const ALL_MODES = new Set([
  "whiteStudio",
  "grayStudio",
  "darkStudio",
  "skipUseOriginal",
  "manualBadCutout",
]);
