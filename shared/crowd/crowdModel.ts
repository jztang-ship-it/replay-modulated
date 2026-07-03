/**
 * shared/crowd/crowdModel.ts — the CROWD model (Stage 2 "verdict").
 *
 * Answers ONE question per player: "what fraction of the room would BACK this
 * player?" — a roster-ownership probability in [0,1]. This is the behavioral
 * counterweight to the value model: it models RECOGNITION, not production.
 *
 * ── HARD RULE (read before editing) ──────────────────────────────────────────
 * This engine is INDEPENDENT of value. It takes ONLY behavioral-bias signals and
 * has ZERO knowledge of salary, projections, value/efficiency, tiers, or the
 * economy. It approximates the recognition-OVER-value residual purely from
 * behavioral proxies. Do NOT import or thread any value/pricing input here, and
 * do NOT "correct" the output toward the value model — the orthogonality test
 * (phase 2) VALIDATES independence; it is never wired in as an input.
 * There is NO volatility term anywhere. Volatility is dead for this system.
 *
 * Sport-agnostic: the engine blends normalized signals; each sport supplies its
 * own extractor (e.g. basketball/src/crowd/basketballCrowd.ts) that turns roster
 * data into these signals WITHOUT touching value.
 */

/** Behavioral-bias signals per player, each normalized to [0,1]. NONE of these
 *  may be derived from salary / projection / value / volatility. */
export interface CrowdSignals {
  /** Name / star recognition — fame, cultural salience. Higher = more known. */
  fame: number;
  /** "Hot name" — recent salient/highlight moments the room remembers. The most
   *  value-adjacent proxy, so it carries the smallest weight by default. */
  recency: number;
  /** Market / TV visibility — big-market, nationally-televised teams get
   *  over-backed regardless of the player. The most VALUE-ORTHOGONAL signal. */
  market: number;
  /** Position feel — the room over-backs some positions (scorers/wings). Mild. */
  position: number;
}

/** Blend weights (logistic). Defaults lean on the value-orthogonal signals
 *  (market, then fame/position) and restrain the value-adjacent one (recency),
 *  so the crowd "over-backs stars and hot names + big-market guys" while staying
 *  ~orthogonal to value. Tunable — phase 2 validates, it does not feed back. */
export interface CrowdWeights {
  fame: number;
  recency: number;
  market: number;
  position: number;
  /** Intercept — centers the ownership distribution (average player ≈ 0.3–0.4). */
  bias: number;
}

export const DEFAULT_CROWD_WEIGHTS: CrowdWeights = {
  market:   1.4,   // biggest lever — big-market bias, orthogonal to value
  fame:     1.1,   // over-back stars
  recency:  0.6,   // hot names, restrained (value-adjacent)
  position: 0.5,   // mild positional feel
  bias:    -1.60,  // center the room low so faded players bottom near ~0.25 —
                   // gives the verdict a punchy "N% of the room faded him" range
                   // (floor ≈ 0.25 → ceiling ≈ 0.81 across the real pool).
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const logistic = (z: number): number => 1 / (1 + Math.exp(-z));

/** Ownership probability [0,1] for one player from their behavioral signals. */
export function crowdOwnership(
  signals: CrowdSignals,
  weights: CrowdWeights = DEFAULT_CROWD_WEIGHTS,
): number {
  const z =
    weights.fame * clamp01(signals.fame) +
    weights.recency * clamp01(signals.recency) +
    weights.market * clamp01(signals.market) +
    weights.position * clamp01(signals.position) +
    weights.bias;
  return logistic(z);
}

/** Ownership for a whole pool: id → probability [0,1]. Independent per player
 *  (this is "% of the room that backs him", NOT a distribution summing to 1). */
export function crowdOwnershipMap(
  perPlayer: Map<string, CrowdSignals>,
  weights: CrowdWeights = DEFAULT_CROWD_WEIGHTS,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, sig] of perPlayer) out.set(id, crowdOwnership(sig, weights));
  return out;
}
