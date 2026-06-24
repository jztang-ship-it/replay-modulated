/**
 * shared/components/platinumBand.ts
 *
 * VALUES-ONLY shared tokens for the platinum header band — NOT a layout /
 * box-model primitive. Single color source so the solo AppHeader (onLight)
 * and the challenge GlobalChallengeHeader render the SAME platinum look
 * without value drift.
 *
 * GlobalChallengeHeader is deliberately NOT refactored to import these (it's
 * a locked, contract-bound surface: constant height + no-transform + reveal→
 * results no-snap). These literals MIRROR its inline values, so a future
 * values-sync would be a one-line swap there — out of scope for this pass.
 */

/** The platinum / brushed-metal bar fill (mirrors GlobalChallengeHeader.tsx:115). */
export const PLATINUM_BAND_GRADIENT =
  "linear-gradient(180deg, #D4DAE2 0%, #C7CDD6 52%, #B8BFC9 100%)";

/** Primary ink for text/icons on the platinum bar (mirrors GlobalChallengeHeader REPLAY #12151E). */
export const PLATINUM_INK = "#12151E";

/** Muted ink for recessive labels/icons on platinum (mirrors GlobalChallengeHeader soft #5A626F). */
export const PLATINUM_INK_MUTED = "#5A626F";

/** Notification-dot ring on the light bar. The default dark ring (#070A12) is
 *  tuned for the near-black app body; on the platinum bar it reads as a dark
 *  artifact, so the light dot ring is a clean cutout halo around the colored dot. */
export const PLATINUM_DOT_BORDER = "#D4DAE2";

/** Shared left rail — header content aligns to the card/strip left edge
 *  (mirrors GlobalChallengeHeader SHARED_LEFT_RAIL_PX). */
export const PLATINUM_LEFT_RAIL_PX = 13;
