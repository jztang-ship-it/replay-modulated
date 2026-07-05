/**
 * shared/crowd/nameText.ts — shared copy-formatting helper for crowd/verdict lines.
 *
 * ONE source of truth for the "don't double a name's trailing period" rule, so
 * quadrantLine.ts (the read×draw leads) and verdict.ts (the atom) can never drift
 * into two subtly different fixes. Neutral string infra — not read×draw-specific.
 */

/**
 * The sentence-ending period after an interpolated player name — suppressed when
 * the name already ends in one, so "Jr."/"Sr." render "…Jr." not "…Jr..". Any
 * name ending in "." is handled; names like "III" (no trailing dot) are unaffected.
 *
 *   `You held ${name}${endDot(name)} …`
 */
export const endDot = (name = ""): string => (/\.$/.test(name) ? "" : ".");
