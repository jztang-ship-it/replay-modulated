/**
 * basketball/src/views/GameView.tsx
 *
 * Phase 2 sub-PR 05 — wrapper. Builds a GameAdapter literal and renders
 * the canonical <GameView> from shared. All state, JSX, overlays,
 * reveal orchestration, and FTUE flow live in shared/views/GameView.tsx.
 *
 * Anything basketball-specific flows through this adapter:
 *   - sportAdapter (rosterSize, salaryCap)
 *   - dealInitialRoster / redrawRoster / resolveRoster
 *   - dealFTUERoster / redrawFTUERoster / resolveFTUERoster
 *   - calculateWinTier / calculatePayoutWithStreak / BASKETBALL_WIN_TIERS
 *   - getStreakMultiplier
 *   - AthleteCard (card render slot)
 *   - getTodaysStars + computeRosterCeiling
 *   - basketball-specific GameBar tier rows + legend (in this file)
 *
 * Basketball does NOT use PostHandSheet — adapter slot left undefined,
 * shared GameView's conditional render skips it.
 */

import { useEffect, useMemo, useState } from "react";
import { getActiveSeason } from "@shared/engines/dataEngine";
import { GameView as SharedGameView } from "@shared/views/GameView";
import type { GameAdapter } from "@shared/views/GameAdapter";
import type { LegendData } from "@shared/components/GameBar";
import { BASKETBALL_FTUE_CONFIG } from "@shared/components/CoachLayer";
import { isSlateV2Enabled } from "@shared/featureFlags";
import { BasketballSlateChip } from "../components/BasketballSlatePanel";
import { sportAdapter } from "../adapters/SportAdapter";
import type { CardRenderer, H2HCard } from "@shared/components/H2HRevealScreen";
import { MATCHUP_DURATION_MS } from "@shared/components/useH2HReveal";
import { getShakeType } from "@shared/hooks/useEmotionalReveal";
import type { PlayerCard } from "@shared/types";
import {
  dealInitialRoster,
  redrawRoster,
  resolveRoster,
  computeRosterCeiling,
  getTodaysStars,
} from "../adapters/gameAdapter";
import {
  dealFTUERoster,
  redrawFTUERoster,
  resolveFTUERoster,
} from "../adapters/ftueRoster";
import { AthleteCard, resetAllOverlays } from "../components/AthleteCard";
import {
  calculateWinTier,
  calculatePayoutWithStreak,
  getStreakMultiplier,
  getBasketballWinTiers,
  getGaugeThresholds,
  getGameBarWinTiers,
  STREAK_TIERS,
} from "../utils/payoutLogic";

/** Build the legend modal's payout rows from the active season's win-tier
 *  thresholds. Without this the legend modal showed a static "190+" ROOKIE
 *  floor that no longer matched per-season-calibrated thresholds (e.g. a
 *  161.5 FP win counted as ROOKIE while the legend modal said "needs 190").
 *  Multipliers stay static — they control payout, not difficulty. */
function buildPayoutRows(): LegendData["payoutRows"] {
  const t = getBasketballWinTiers();
  return [
    { label: "LEGEND",   score: `${t.LEGEND.minFp}+`,             payout: "20x",  color: "#EF4444", bg: "rgba(239,68,68,0.12)",    border: "rgba(239,68,68,0.35)"    },
    { label: "MVP",      score: `${t.MVP.minFp}+`,                payout: "8x",   color: "#FB923C", bg: "rgba(251,146,60,0.10)",   border: "rgba(251,146,60,0.3)"    },
    { label: "ALL-STAR", score: `${t.ALL_STAR.minFp}+`,           payout: "3x",   color: "#C084FC", bg: "rgba(192,132,252,0.10)",  border: "rgba(192,132,252,0.25)"  },
    { label: "STARTER",  score: `${t.STARTER.minFp}+`,            payout: "1.5x", color: "#3B82F6", bg: "rgba(59,130,246,0.08)",   border: "rgba(59,130,246,0.25)"   },
    { label: "ROOKIE",   score: `${t.ROOKIE.minFp}+`,             payout: "0.5x", color: "#22C55E", bg: "rgba(34,197,94,0.10)",    border: "rgba(34,197,94,0.25)"    },
    { label: "BUST",     score: `<${t.ROOKIE.minFp}`,             payout: "—",    color: "#6B7280", bg: "rgba(107,114,128,0.08)",  border: "rgba(107,114,128,0.2)"   },
  ];
}

const LEGEND_DATA_STATIC: Omit<LegendData, "payoutRows"> = {
  bonusRows: [
    { label: "3-WIN STREAK", condition: "3 wins in a row", reward: "1.2x payout"  },
    { label: "5-WIN STREAK", condition: "5 wins in a row", reward: "1.5x payout"  },
    { label: "10-WIN STREAK", condition: "10 wins in a row", reward: "2.0x payout" },
  ],
  scoringRules: [
    { stat: "Point",    pts: "+1.0" },
    { stat: "Rebound",  pts: "+1.2" },
    { stat: "Assist",   pts: "+1.5" },
    { stat: "Steal",    pts: "+2.0" },
    { stat: "Block",    pts: "+2.0" },
    { stat: "Turnover", pts: "-1.0" },
  ],
  stamps: [],
  badges: [
    { icon: "⚡",  label: "GOD MODE",         condition: "50+ points",           fp: 10  },
    { icon: "🔥",  label: "FIRE",             condition: "40-49 points",         fp: 5   },
    { icon: "🏀",  label: "BUCKET",           condition: "30-39 points",         fp: 2   },
    { icon: "🦍",  label: "BEAST",            condition: "15+ rebounds",         fp: 5   },
    { icon: "🧲",  label: "GLASS",            condition: "10-14 rebounds",       fp: 3   },
    { icon: "🪄",  label: "WIZARD",           condition: "15+ assists",          fp: 5   },
    { icon: "🧠",  label: "DIME",             condition: "10-14 assists",        fp: 3   },
    { icon: "🧤",  label: "THIEF",            condition: "5+ steals",            fp: 4   },
    { icon: "👀",  label: "PICKPOCKET",       condition: "3-4 steals",           fp: 2   },
    { icon: "🚫",  label: "SWAT",             condition: "5+ blocks",            fp: 4   },
    { icon: "🛡️", label: "REJECTION",        condition: "3-4 blocks",           fp: 2   },
    { icon: "🎼",  label: "MAESTRO",          condition: "10+ ast, 0 turnovers", fp: 8   },
    { icon: "🎯",  label: "PURE",             condition: "5+ ast, 0 turnovers",  fp: 3   },
    { icon: "💦",  label: "SLOPPY",           condition: "4-5 turnovers",        fp: -3  },
    { icon: "🤦",  label: "TURNOVER MACHINE", condition: "6+ turnovers",         fp: -6  },
    { icon: "🦕",  label: "QUAD DOUBLE",      condition: "4 categories 10+",     fp: 30  },
    { icon: "🖐️", label: "5x5",              condition: "all 5 categories 5+",  fp: 15  },
    { icon: "👑",  label: "TRIPLE DOUBLE",    condition: "3 categories 10+",     fp: 8   },
    { icon: "✌️", label: "DOUBLE DOUBLE",    condition: "2 categories 10+",     fp: 2   },
  ],
};

// Salary-cutoff tier — fallback only. Player data should carry an authoritative `tier`.
function tierFromSalary(salary: number): string {
  const s = Number(salary ?? 0);
  return s >= 73 ? "RED" : s >= 58 ? "ORANGE" : s >= 44 ? "PURPLE" : s >= 30 ? "BLUE" : s >= 23 ? "GREEN" : "WHITE";
}

// ── H2H reveal renderers (phase 5a commit 3) ──────────────────────
// Basketball-specific renderers passed via GameAdapter to the shared
// H2HRecipientReveal wrapper. Both wrap AthleteCard, mirroring the
// dev mock route at basketball/src/dev/H2HRevealMockRoute.tsx:59-83
// + :296-313 — production wraps the same components with the same
// props, just sourced from real data (resolvedSenderHand + recipient
// roster) instead of the mock fixture.

const shakeForCard = (card: H2HCard) =>
  getShakeType(card as unknown as { projectedFp: number; actualFp: number; cardId: string }, false);

export const h2hArcRenderer: CardRenderer = (card: H2HCard, options) => {
  const isRevealed = options?.revealed ?? false;
  return (
    <AthleteCard
      card={card as unknown as PlayerCard}
      phase={"RESULTS" as any}
      isFlipped={false}
      canFlip={false}
      locked={card.wasHeld}
      heldFpVisible={true}
      badges={isRevealed ? card.achievements : []}
      visibleFp={options?.visibleFp}
      fpCountUpMs={MATCHUP_DURATION_MS}
      cardShakeType={isRevealed ? shakeForCard(card) : null}
      isRevealing={!isRevealed}
      ignoreHeldStatus={true}
      staticEndState={isRevealed && options?.visibleFp === undefined}
      shakeType={options?.shakeType ?? null}
      glowActive={options?.glowActive ?? false}
      glowTier={options?.glowTier ?? "WHITE"}
      glowDurationMs={options?.glowDurationMs ?? 700}
    />
  );
};

export const h2hOverlayRenderer: CardRenderer = (card: H2HCard, options) => (
  <AthleteCard
    card={card as unknown as PlayerCard}
    phase={"RESULTS" as any}
    isFlipped={options?.flipped ?? false}
    canFlip={true}
    locked={card.wasHeld}
    heldFpVisible={true}
    badges={card.achievements}
    cardShakeType={shakeForCard(card)}
    staticEndState={true}
    ignoreHeldStatus={true}
  />
);

interface GameViewWrapperProps {
  challengeCtx?: import("@shared/adapters/challengeTypes").ChallengeCtx;
  challengeBackCtx?: import("@shared/adapters/challengeTypes").ChallengeBackCtx;
  clearChallengeCtx?: () => void;
  setChallengeBackCtx?: (ctx: import("@shared/adapters/challengeTypes").ChallengeBackCtx) => void;
  clearChallengeBackCtx?: () => void;
}

export default function GameView({
  challengeCtx,
  challengeBackCtx,
  clearChallengeCtx,
  setChallengeBackCtx,
  clearChallengeBackCtx,
}: GameViewWrapperProps) {
  // Track active season + FTUE state so the adapter rebuilds with the right
  // win-tier thresholds when:
  //   - the daily reel swaps seasons (setActiveSeason → active-season-change)
  //   - the user completes the FTUE (useFTUE → ftue-change)
  // Both events fire from the cross-instance event bus added in PRs #79/#c5a5c0e.
  const [activeSeason, setSeason] = useState<string | null>(getActiveSeason());
  const [ftueTick, setFtueTick] = useState(0);
  useEffect(() => {
    const onSeason = () => setSeason(getActiveSeason());
    const onFtue = () => setFtueTick(t => t + 1);
    if (typeof window !== "undefined") {
      window.addEventListener("replaymod:active-season-change", onSeason);
      window.addEventListener("replaymod:ftue-change", onFtue);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("replaymod:active-season-change", onSeason);
        window.removeEventListener("replaymod:ftue-change", onFtue);
      }
    };
  }, []);

  const adapter: GameAdapter = useMemo(() => ({
    sportKey: "basketball",
    sportAdapter,
    localStorageNamespace: "",
    leaderboardScope: sportAdapter.sportKey as "basketball",
    routeBasePath: "/basketball/",
    gaugeThresholds: getGaugeThresholds(),
    tierFromSalary,
    calculateWinTier,
    calculatePayoutWithStreak,
    winTiersMap: getBasketballWinTiers(),
    getStreakMultiplier,
    streakTiers: STREAK_TIERS,
    gameBarWinTiers: getGameBarWinTiers(),
    gameBarLegend: { ...LEGEND_DATA_STATIC, payoutRows: buildPayoutRows() },
    dealInitialRoster,
    redrawRoster,
    resolveRoster,
    ftueDealRoster: dealFTUERoster,
    ftueRedrawRoster: redrawFTUERoster,
    ftueResolveRoster: resolveFTUERoster,
    getTodaysStars,
    computeRosterCeiling,
    // AthleteCard's Props type marks several fields optional (locked,
    // isMvp, flipped, etc.) that RosterGridCardProps requires. Functionally
    // the wider/looser AthleteCard shape can absorb any RosterGridCardProps
    // call site, but TypeScript treats the optional/required asymmetry as
    // an incompatible signature. Cast pins it to the contract.
    CardComponent: AthleteCard as GameAdapter["CardComponent"],
    rosterGridColumns: 3,
    resetAllOverlays,
    ftueTextConfig: BASKETBALL_FTUE_CONFIG,
    // PostHandSheet — basketball does not surface this overlay.
    audioBedSrc: "/audio/basketball/crowd/bed-murmur.mp3",
    // Slate v2 chip — only when flag is ON for basketball. With flag OFF,
    // SlateChipComponent stays undefined and the shared GameView renders
    // nothing in the chip slot, so no slate-v2 code runs in-game.
    SlateChipComponent: isSlateV2Enabled("basketball") ? BasketballSlateChip : undefined,
    // H2H reveal renderers — phase 5a commit 3 (2026-05-27).
    h2hArcRenderer,
    h2hOverlayRenderer,
  }), [activeSeason, ftueTick]);

  return (
    <SharedGameView
      adapter={adapter}
      challengeCtx={challengeCtx}
      challengeBackCtx={challengeBackCtx}
      clearChallengeCtx={clearChallengeCtx}
      setChallengeBackCtx={setChallengeBackCtx}
      clearChallengeBackCtx={clearChallengeBackCtx}
    />
  );
}
