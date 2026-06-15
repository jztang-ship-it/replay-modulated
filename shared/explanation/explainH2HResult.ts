// shared/explanation/explainH2HResult.ts
//
// RD7.2 wiring — builds the Resolution Engine input from the live H2H hands
// and returns the explanation string. Pure-fn engine stays pure: this helper
// only gathers (your-side card facts + percentile via the pool-stats
// provider + nickname via lookupCulture + the opponent luck-outlier) and
// calls explainResolution. No engine logic lives here.

import {
  explainResolution,
  type YourCardFact,
  type OpponentOutlier,
  type Classification,
} from "./resolutionEngine";
import { percentileFromStats } from "./poolStats";
import { getPoolStats } from "./poolStatsProvider";
import { lookupCulture } from "@shared/commentary/selectCommentary";
import type { H2HHand, H2HCard } from "@shared/components/H2HRevealScreen";

export function explainH2HResult(args: {
  sender: H2HHand;
  recipient: H2HHand;
  sport: string;
}): { text: string; classification: Classification } | null {
  const { sender, recipient, sport } = args;
  if (!recipient?.cards?.length) return null;

  const margin = recipient.totalFp - sender.totalFp;

  const toFact = (c: H2HCard): YourCardFact => {
    const ps = getPoolStats(c.basePlayerId, c.season);
    const fp = c.actualFp - ((c as { dailyBonus?: number }).dailyBonus ?? 0);
    const culture = lookupCulture(c.name, sport, c.tier, 0, c.basePlayerId, c.team);
    return {
      name: c.name,
      tier: c.tier,
      salary: c.salary,
      wasHeld: !!c.wasHeld,
      fp,
      percentile: ps ? percentileFromStats(fp, ps) : null,
      poolMedian: ps ? ps.p50 : null,
      nickname: culture?.nicknames?.[0]?.trim() || null,
      // RD7.11 — log fields for the Flavor slot (DESCRIPTION only). Already on
      // H2HCard from the resolve; previously projected away. The engine uses
      // statLine for the box line; gameInfo/achievements are available for
      // richer Flavor. Sparse/absent → engine degrades to the FP line.
      statLine: c.statLine ?? null,
      gameInfo: c.gameInfo ?? null,
      achievements: c.achievements ?? null,
    };
  };

  // Opponent (Mike) luck-outlier: the sender card with the biggest swing
  // above its own median — a luck fact only, gated by the engine's bad-beat
  // rules. Never a decision-comparison (no sender card decisions are read).
  let outlier: OpponentOutlier | null = null;
  for (const c of sender?.cards ?? []) {
    const ps = getPoolStats(c.basePlayerId, c.season);
    if (!ps) continue;
    const fp = c.actualFp - ((c as { dailyBonus?: number }).dailyBonus ?? 0);
    const swing = fp - ps.p50;
    if (!outlier || swing > outlier.swing) {
      outlier = { name: c.name, percentile: percentileFromStats(fp, ps), actualFp: fp, swing };
    }
  }

  return explainResolution({
    yourCards: recipient.cards.map(toFact),
    margin,
    opponentOutlier: outlier,
  });
}
