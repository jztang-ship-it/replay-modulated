// shared/utils/triggerEvaluation.ts
import type { GeneratedCard } from "../types/index";
import type { WinTierMap, WinTierKey } from "./payoutLogic";

const RECORD_BADGE_IDS = ["TOP_GAME", "CAREER_HIGH", "NBA_RECORD", "SEASON_RECORD", "PB"];

/** Top-game tiers from shared/data/recordDetector.ts. All three are
 *  "rare-pull" worthy — a record, a career high, or a season top-10 are
 *  the share-worthy moments rare_pull is supposed to surface. */
export type TopGameTier = "record" | "career" | "season";

export interface TriggerInput {
  roster: GeneratedCard[];
  totalFp: number;
  winTier: WinTierKey | string;
  badges: Array<{ id: string; icon: string; label: string; fp: number }>;
  winTiersMap: WinTierMap;
  /** topGame tier of the hand's star card (from recordDetector). Set when
   *  the star pulled a "record" / "career" / "season" game. This is the
   *  authoritative input for rare_pull — the badge-substring check below
   *  is a redundant fallback in case a future code path puts a record
   *  badge directly on card.achievements (none do today). */
  topGameTier?: TopGameTier | null;
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
  const { roster, totalFp, winTier, badges, winTiersMap, topGameTier } = input;
  const fp = Math.round(totalFp * 10) / 10;

  // 1. rare_pull — star card pulled a record / career-high / season top-10
  //    game. Two paths into this branch:
  //      (a) topGameTier passed in directly — the canonical signal,
  //          sourced from detectTopGame() at the GameView call site.
  //      (b) Substring match against RECORD_BADGE_IDS in the badge list —
  //          retained as a fallback in case a future code path emits a
  //          synthetic record badge on card.achievements. No badge with
  //          these IDs is written today (basketballConfig only emits
  //          stat-based badges like GOD_MODE / TRIPLE_DBL), so this path
  //          is dormant; the (a) path is what actually fires now.
  const hasRecordBadge = badges.some(b => RECORD_BADGE_IDS.some(rid => b.id.includes(rid)));
  const hasTopGame = topGameTier === "record" || topGameTier === "career" || topGameTier === "season";
  if (hasRecordBadge || hasTopGame) {
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

  // 4. bad_beat — BUST or ROOKIE with 2+ RED/ORANGE cards that the user
  //    actually HELD. "Stacked lineup got cooked" is a story about the
  //    user's deliberate picks busting, not RNG dropping high-tier
  //    cards into the redraw. Earlier versions counted all roster slots
  //    regardless of wasHeld, which fired bad_beat on hands the user
  //    didn't actually stack.
  if (winTier === "BUST" || winTier === "ROOKIE") {
    const highTierHeldCount = roster.reduce(
      (n, c: any) => n + (c.wasHeld === true && (c.tier === "RED" || c.tier === "ORANGE") ? 1 : 0),
      0,
    );
    if (highTierHeldCount >= 2) {
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
