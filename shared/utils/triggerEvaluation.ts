// shared/utils/triggerEvaluation.ts
import type { GeneratedCard } from "../types/index";
import type { WinTierMap, WinTierKey } from "./payoutLogic";
import type { TopGameReason } from "../commentary/types";

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
  /** basePlayerId of the anchor card (typically the star identified by
   *  selectStar at the call site). Threaded through to
   *  TriggerResult.anchorBasePlayerId so rare_pull surfaces can locate
   *  the anchor in roster without re-running selectStar. Only meaningful
   *  when topGameTier is also set. */
  starBasePlayerId?: string | null;
  /** rare_pull only — the primary TopGameReason from detectTopGame
   *  (= topGame.primaryReason on the call-site TopGameResult). Threaded
   *  through to TriggerResult so downstream copy surfaces can read the
   *  category/label/value/rank for statLabel extraction without
   *  re-running detectTopGame. Bucket 2 Q3.1 LOCKED 2026-05-24. */
  topGamePrimaryReason?: TopGameReason | null;
  /** rare_pull only — the full reasons array from detectTopGame
   *  (= topGame.allReasons). Needed so the bank-side selector can
   *  prefer a stat-typed reason (rank defined) over a composite/flag
   *  reason when both coexist for the same hand. Bucket 2 Q3.1
   *  LOCKED 2026-05-24. */
  topGameAllReasons?: TopGameReason[] | null;
}

export interface TriggerResult {
  trigger: "rare_pull" | "big_score" | "miss" | "bad_beat" | "default";
  headline: string;
  /** How many FP short of the next tier (miss only).
   *  Field name preserved for DB column compatibility (near_miss_gap). */
  nearMissGap?: number;
  /** Which tier was just missed (miss only).
   *  Field name preserved for DB column compatibility. */
  nearMissNextTier?: string;
  /** rare_pull only — basePlayerId of the anchor card so the prompt can
   *  look it up in roster to read name / actualFp / projectedFp for
   *  anchor-aware copy. Mirrors the TriggerInput.starBasePlayerId input. */
  anchorBasePlayerId?: string | null;
  /** rare_pull only — passed through so the prompt can route to the
   *  rare_pull initiation bank. */
  topGameTier?: TopGameTier | null;
  /** rare_pull only — passes the primary TopGameReason through so the
   *  TOP-slot framing selector (chadChallenge.selectTopSlotFraming) can
   *  extract {statLabel} for the RARE_PULL_SEASON bank. Bucket 2 Q3.1
   *  LOCKED 2026-05-24. */
  topGamePrimaryReason?: TopGameReason | null;
  /** rare_pull only — passes the full reasons array through so the
   *  selector can prefer a stat-typed reason (rank defined) over a
   *  composite/flag reason for statLabel extraction. Bucket 2 Q3.1
   *  LOCKED 2026-05-24. */
  topGameAllReasons?: TopGameReason[] | null;
}

const MISS_WINDOW = 5;

export function evaluateTrigger(input: TriggerInput): TriggerResult {
  const {
    roster, totalFp, winTier, badges, winTiersMap,
    topGameTier, starBasePlayerId,
    topGamePrimaryReason, topGameAllReasons,
  } = input;
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
      // Headline is a fallback for callers that don't render via
      // selectChallengeInitiation. The prompt path replaces this with
      // an anchor-aware line from the rare_pull initiation bank when
      // anchorCardId + topGameTier are both available downstream.
      headline: `You pulled a legendary game. Challenge someone to beat this.`,
      anchorBasePlayerId: starBasePlayerId ?? null,
      topGameTier: topGameTier ?? null,
      // Propagate TopGameReason data for chadChallenge.selectTopSlotFraming
      // statLabel extraction on the RARE_PULL_SEASON bank. Null when the
      // caller doesn't have topGame context (e.g. useChallengeShare path
      // — selector falls back to RECORD bank per Q3.1 spec). Bucket 2
      // Q3.1 LOCKED 2026-05-24.
      topGamePrimaryReason: topGamePrimaryReason ?? null,
      topGameAllReasons: topGameAllReasons ?? null,
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

  // 3. miss — within MISS_WINDOW FP of next tier AND current tier is
  //    STARTER+. We don't fire miss on BUST→ROOKIE transitions — a BUST
  //    hand isn't share-worthy just because it almost cleared ROOKIE.
  const tierOrder: WinTierKey[] = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
  const STARTER_IDX = tierOrder.indexOf("STARTER");
  const currentIdx = tierOrder.indexOf(winTier as WinTierKey);
  if (currentIdx >= STARTER_IDX && currentIdx < tierOrder.length - 1) {
    const nextTier = tierOrder[currentIdx + 1];
    const nextMin = winTiersMap[nextTier]?.minFp;
    if (nextMin !== undefined) {
      const gap = Math.round((nextMin - fp) * 10) / 10;
      if (gap > 0 && gap <= MISS_WINDOW) {
        return {
          trigger: "miss",
          headline: `You missed ${nextTier.replace("_", "-")} by ${gap} FP. See if they finish the job.`,
          nearMissGap: gap,
          nearMissNextTier: nextTier,
        };
      }
    }
  }

  // 4. bad_beat — BUST or ROOKIE with 1+ RED/ORANGE card that the user
  //    actually HELD. Threshold broadened from 2 to 1 on 2026-05-25
  //    (bucket 2 piece B final amend) per user mental model: "any
  //    premium-held hand that BUSTs or barely ROOKIEs is a bad beat."
  //    Trigger frequency was too low in smoke (~1 in 15 hands); broaden
  //    to ship a feature that actually fires. Empirical calibration
  //    (whether 30-50% feels right, or whether we tighten back to RED
  //    only / BUST only) is tracked as an open followup.
  //
  //    The wasHeld gate stays — "stacked lineup got cooked" is a story
  //    about the user's deliberate picks, not RNG dropping high-tier
  //    cards into the redraw. Earlier versions counted all roster slots
  //    regardless of wasHeld, which fired bad_beat on hands the user
  //    didn't actually stack.
  if (winTier === "BUST" || winTier === "ROOKIE") {
    const highTierHeldCount = roster.reduce(
      (n, c: any) => n + (c.wasHeld === true && (c.tier === "RED" || c.tier === "ORANGE") ? 1 : 0),
      0,
    );
    if (highTierHeldCount >= 1) {
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
