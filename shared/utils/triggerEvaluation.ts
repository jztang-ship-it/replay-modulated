// shared/utils/triggerEvaluation.ts
import type { GeneratedCard } from "../types/index";
import type { WinTierMap, WinTierKey } from "./payoutLogic";

const RECORD_BADGE_IDS = ["TOP_GAME", "CAREER_HIGH", "NBA_RECORD", "SEASON_RECORD", "PB"];

export interface TriggerInput {
  roster: GeneratedCard[];
  totalFp: number;
  winTier: WinTierKey | string;
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
  winTiersMap: WinTierMap;
}

export interface TriggerResult {
  trigger: "rare_pull" | "big_score" | "near_miss" | "bad_beat" | "default";
  headline: string;
  /** How many FP short of the next tier (near_miss only) */
  nearMissGap?: number;
  /** Which tier was just missed (near_miss only) */
  nearMissNextTier?: string;
}

const NEAR_MISS_WINDOW = 5;

export function evaluateTrigger(input: TriggerInput): TriggerResult {
  const { roster, totalFp, winTier, badges, winTiersMap } = input;
  const fp = Math.round(totalFp * 10) / 10;

  // 1. rare_pull — any record/top-game badge
  if (badges.some(b => RECORD_BADGE_IDS.some(rid => b.id.includes(rid)))) {
    return {
      trigger: "rare_pull",
      headline: `You pulled a legendary game. Challenge someone to beat this.`,
    };
  }

  // 2. big_score — ALL_STAR / MVP / LEGEND
  if (winTier === "ALL_STAR" || winTier === "MVP" || winTier === "LEGEND") {
    const label = winTier === "ALL_STAR" ? "ALL-STAR" : winTier;
    return {
      trigger: "big_score",
      headline: `You hit ${label}. Same slate. Beat them.`,
    };
  }

  // 3. near_miss — within NEAR_MISS_WINDOW FP of next tier AND current tier
  //    is STARTER+. We don't fire near_miss on BUST→ROOKIE transitions — a
  //    BUST hand isn't share-worthy just because it almost cleared ROOKIE.
  const tierOrder: WinTierKey[] = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
  const STARTER_IDX = tierOrder.indexOf("STARTER");
  const currentIdx = tierOrder.indexOf(winTier as WinTierKey);
  if (currentIdx >= STARTER_IDX && currentIdx < tierOrder.length - 1) {
    const nextTier = tierOrder[currentIdx + 1];
    const nextMin = winTiersMap[nextTier]?.minFp;
    if (nextMin !== undefined) {
      const gap = Math.round((nextMin - fp) * 10) / 10;
      if (gap > 0 && gap <= NEAR_MISS_WINDOW) {
        return {
          trigger: "near_miss",
          headline: `You missed ${nextTier.replace("_", "-")} by ${gap} FP. See if they finish the job.`,
          nearMissGap: gap,
          nearMissNextTier: nextTier,
        };
      }
    }
  }

  // 4. bad_beat — BUST or ROOKIE with 2+ RED/ORANGE cards (revised from 1+).
  //    One premium card busting isn't surprising; the share-worthy story is
  //    "stacked lineup got cooked", which needs ≥2 high-tier cards.
  if (winTier === "BUST" || winTier === "ROOKIE") {
    const highTierCount = roster.reduce(
      (n, c) => n + (c.tier === "RED" || c.tier === "ORANGE" ? 1 : 0),
      0,
    );
    if (highTierCount >= 2) {
      return {
        trigger: "bad_beat",
        headline: `Brutal hand. See if they survive the same slate.`,
      };
    }
  }

  // 5. default — always fires
  return {
    trigger: "default",
    headline: `${fp} FP on the board. Same slate. Beat them.`,
  };
}
