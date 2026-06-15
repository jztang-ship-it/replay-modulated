// shared/explanation/explainH2HResult.ts
//
// RD7.2 wiring — builds the Resolution Engine input from the live H2H hands
// and returns the explanation string. Pure-fn engine stays pure: this helper
// only gathers (your-side card facts + percentile via the pool-stats
// provider + nickname via lookupCulture + the opponent luck-outlier) and
// calls explainResolution. No engine logic lives here.

import {
  explainResolution,
  flavorMarginBucket,
  shouldAuthorFlavor,
  selectFlavorCard,
  extractFlavorBox,
  lastName,
  type YourCardFact,
  type OpponentOutlier,
  type Classification,
} from "./resolutionEngine";
import type { FlavorFacts } from "./flavorValidator";
import { percentileFromStats } from "./poolStats";
import { getPoolStats } from "./poolStatsProvider";
import { lookupCulture } from "@shared/commentary/selectCommentary";
import type { H2HHand, H2HCard } from "@shared/components/H2HRevealScreen";
import type { GeneratedCard } from "@shared/types/index";
import { featureFlags } from "@shared/featureFlags";
import {
  selectDivergence,
  renderDivergenceClause,
  validateRivalryClause,
  type Divergence,
} from "./selectDivergence";

export function explainH2HResult(args: {
  sender: H2HHand;
  recipient: H2HHand;
  sport: string;
  // RD8 — the shared deal, needed to derive the rivalry divergence (§6). The
  // call site passes challengeCtx.initialRoster. Optional so legacy callers and
  // the flag-OFF path are unaffected.
  initialRoster?: GeneratedCard[];
  // RD8 — gate. Defaults to the build-time flag; an explicit value (tests) wins.
  rivalryEnabled?: boolean;
}): {
  text: string;
  classification: Classification;
  flavorRequest: FlavorFacts | null;
  // RD8 — the optional rivalry clause, returned SEPARATELY (never concatenated
  // into `text`): the LLM swap at H2HRecipientReveal.tsx discards `text`, so the
  // clause is composed onto displayExplanation at the render site instead.
  rivalryClause: string | null;
} | null {
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

  // RD8 — derive the rivalry divergence (flag-gated). Decisions only; score is
  // read INSIDE selectDivergence to rank, then discarded (§0/§2). Validate the
  // clause up-front (the named form — coincidence below doesn't affect validity)
  // so an invalid clause leaves the luck-outlier path fully intact (§4 fail →
  // base only). When a valid divergence exists we SUBSUME the outlier: build the
  // input with opponentOutlier:null so the bad-beat pull-frame never renders
  // (§4, §8.1). When there is no divergence the outlier path is UNCHANGED (§8.3).
  const rivalryOn = args.rivalryEnabled ?? featureFlags.rivalryClause;
  let divergence: Divergence | null = null;
  if (rivalryOn && args.initialRoster?.length) {
    const senderGC = sender.cards as unknown as GeneratedCard[];
    const recipientGC = recipient.cards as unknown as GeneratedCard[];
    const d = selectDivergence(args.initialRoster, senderGC, recipientGC);
    if (d && validateRivalryClause(renderDivergenceClause(d), d, args.initialRoster, senderGC, recipientGC)) {
      divergence = d;
    }
  }

  const input = {
    yourCards: recipient.cards.map(toFact),
    margin,
    opponentOutlier: divergence ? null : outlier,
  };
  const result = explainResolution(input);

  // RD7.12 — build the firewalled LLM-Flavor request. NULL (skip the model) on
  // beatdown / tie and when no card has a recognized box line (non-basketball /
  // sparse). RD7.12-b — also skip VARIANCE-classified close-losses: the LLM is
  // flat there and the deterministic humble-cause line is better (eval finding).
  // The gate reuses the engine's existing agency/variance register. The request
  // carries ONLY stats + nickname + outcome bucket — nothing about the user's
  // decision, so the model cannot claim agency it was never told about.
  const bucket = flavorMarginBucket(margin);
  let flavorRequest: FlavorFacts | null = null;
  if (shouldAuthorFlavor(margin, result.classification.register)) {
    const card = selectFlavorCard(result.classification, input);
    const box = card ? extractFlavorBox(card.statLine) : null;
    if (card && box) {
      flavorRequest = {
        outcome: bucket as "win" | "close-loss",
        player: { last: lastName(card.name), nickname: card.nickname ?? null },
        box,
      };
    }
  }

  // RD8 — render the clause now that classification is known. Coincident form
  // (pronoun, no re-naming/score) when the divergence player is the base's named
  // subject, so the combined line doesn't double-name him (§9 render nit).
  let rivalryClause: string | null = null;
  if (divergence) {
    const coincident =
      !!result.classification.decisive &&
      lastName(result.classification.decisive.name) === lastName(divergence.playerName);
    rivalryClause = renderDivergenceClause(divergence, { coincident });
  }

  return { ...result, flavorRequest, rivalryClause };
}
