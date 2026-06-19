/**
 * shared/utils/handStatus.ts
 *
 * Hand-status flags — sparse, ABSOLUTE, tier-orthogonal flavor markers that sit
 * ON TOP of any win tier (a LEGEND hand can also be a 🔥 Heater). Unlike win
 * tiers (per-season percentile cuts), status bands are fixed absolute FP numbers
 * and do NOT move per season. Most hands return null (neither flag).
 *
 * The MECHANISM is sport-agnostic (compare the hand total to two bands); the BAND
 * VALUES are sport data, passed in by the caller (basketball wires its own via the
 * SportAdapter.getHandStatus method). This keeps the rule in shared and the
 * numbers on the sport — same split as win-tier thresholds.
 *
 * Display-only: status drives visual treatment (Heater = gold/flame flex; Cold
 * Night = the loss-coloring hook BUST vacated). No commentary text is wired here.
 */

export type HandStatus = "HEATER" | "COLD_NIGHT";

/**
 * Classify a hand total into a status flag, or null when it sits between the
 * bands (the common case). Heater wins ties at the high end; Cold Night is a
 * strict `<` so the coldMax value itself is neutral.
 *
 * @param totalFp   the hand's resolved total fantasy points
 * @param heaterMin inclusive floor for HEATER (totalFp >= heaterMin)
 * @param coldMax   exclusive ceiling for COLD_NIGHT (totalFp < coldMax)
 */
export function getHandStatus(totalFp: number, heaterMin: number, coldMax: number): HandStatus | null {
  if (totalFp >= heaterMin) return "HEATER";
  if (totalFp < coldMax) return "COLD_NIGHT";
  return null;
}
