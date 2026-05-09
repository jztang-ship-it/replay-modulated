/**
 * Notched card silhouette for clip-path / masks.
 * objectBoundingBox normalized (0→1); must stay in sync with CardFront.
 *
 * Notch widened 2026-05-09 — slant geometry preserved (same angle), just
 * shifted outward by ~0.06 each side to give the team/year label room to
 * fit comfortably without text-size changes. Flat bottom went 29% → 41%.
 */
export const CARD_CLIP_PATH_OBJECT_BOX =
  "M 0.0678 0 L 0.1886 0 L 0.2590 0.0338 Q 0.2590 0.0497 0.2818 0.0497 " +
  "L 0.6956 0.0497 Q 0.7182 0.0497 0.7182 0.0338 L 0.7549 0 L 0.9322 0 " +
  "Q 1 0 1 0.0677 L 1 0.9323 Q 1 1 0.9322 1 L 0.0678 1 " +
  "Q 0 1 0 0.9323 L 0 0.0677 Q 0 0 0.0678 0 Z";
