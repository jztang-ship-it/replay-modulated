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
  trigger: "rare_pull" | "big_score" | "miss" | "choke" | "default";
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

// The `miss` (tier near-miss) challenge trigger was REMOVED (2026-06-20): an
// ordinary near-miss no longer initiates a challenge. The near-miss SIGNAL still
// lives — the solo reveal stamp ("ALL STAR MISS") now rides the gauge's standalone
// 5% band (computeGaugeState + NEAR_MISS_BAND in GameView), decoupled from challenge
// creation. The TriggerResult `miss` union member + nearMissGap/nearMissNextTier
// fields + their near_miss_* DB columns are PRESERVED (hide-don't-delete) for
// persisted rows and downstream consumers; the classifier just never emits them now.

// ── Anchor selection helpers (Phase 5c Path A, 2026-06-01) ─────────────────
//
// Per the doc lock T2 anchor-selection rule (docs/h2h-reveal-arc-design.md
// Phase 5c), bad_beat and big_score now persist anchorBasePlayerId at create
// time alongside rare_pull. The recipient intro reads the anchor as a
// published fact rather than re-deriving on every render.
//
// The selectors are deterministic and pure — same inputs always produce the
// same anchor. Both tolerate missing fields on roster cards (defensive
// `?? 0` / `?? null`) so legacy or partially-populated rosters degrade
// without throwing.

/** choke anchor: the held card the sender was relying on that disappointed
 *  most. Filter to wasHeld===true; pick most-negative (actualFp - projectedFp);
 *  tiebreak highest salary (bigger conviction = bigger betrayal). Returns null
 *  when there are no held cards on the roster (the choke trigger guarantees
 *  ≥2 high-tier held cards upstream, so this null path is a defensive escape
 *  hatch rather than an expected outcome). Phase 1 renamed from
 *  selectBadBeatAnchor — logic unchanged. */
function selectChokeAnchor(roster: GeneratedCard[]): string | null {
  const held = roster.filter(c => c.wasHeld === true);
  if (held.length === 0) return null;
  let best = held[0];
  let bestDelta = (best.actualFp ?? 0) - (best.projectedFp ?? 0);
  let bestSalary = best.salary ?? 0;
  for (let i = 1; i < held.length; i++) {
    const c = held[i];
    const delta = (c.actualFp ?? 0) - (c.projectedFp ?? 0);
    const salary = c.salary ?? 0;
    if (delta < bestDelta || (delta === bestDelta && salary > bestSalary)) {
      best = c;
      bestDelta = delta;
      bestSalary = salary;
    }
  }
  return best.basePlayerId ?? null;
}

/** big_score anchor: the card that drove the win. Pick highest actualFp; when
 *  the runner-up is within 1 FP, prefer the wasHeld card (bet-on player gets
 *  credit over a hot replacement). Returns null on empty roster. */
function selectBigScoreAnchor(roster: GeneratedCard[]): string | null {
  if (roster.length === 0) return null;
  let topFp = -Infinity;
  for (const c of roster) {
    const fp = c.actualFp ?? 0;
    if (fp > topFp) topFp = fp;
  }
  // Cards within 1 FP of the top — the tiebreak window.
  const within = roster.filter(c => Math.abs((c.actualFp ?? 0) - topFp) <= 1);
  // Prefer wasHeld inside the tiebreak window; among held candidates pick the
  // highest actualFp. When no held cards are within the window, pick the
  // outright highest actualFp.
  const heldWithin = within.filter(c => c.wasHeld === true);
  const pool = heldWithin.length > 0 ? heldWithin : within;
  let best = pool[0];
  for (let i = 1; i < pool.length; i++) {
    if ((pool[i].actualFp ?? 0) > (best.actualFp ?? 0)) best = pool[i];
  }
  return best.basePlayerId ?? null;
}

export function evaluateTrigger(input: TriggerInput): TriggerResult {
  const {
    roster, totalFp, winTier, badges,
    topGameTier, starBasePlayerId,
    topGamePrimaryReason, topGameAllReasons,
  } = input;
  // winTiersMap is still accepted on TriggerInput (callers pass it; preserved for
  // the future economy/trigger work) but no longer read — the only consumer was
  // the removed miss branch.
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
      // Phase 5c Path A (2026-06-01): anchor persisted at create time so the
      // recipient intro reads "X cooked" without re-deriving the leader on
      // every render. selectBigScoreAnchor picks the highest-actualFp card,
      // preferring wasHeld inside the 1-FP tiebreak window.
      anchorBasePlayerId: selectBigScoreAnchor(roster),
    };
  }

  // 3. choke — BUST or ROOKIE with 2+ RED/ORANGE cards that the user
  //    actually HELD. Phase 1 trigger split (2026-06-03, lock:
  //    docs/challenge-landing-v2-phase1-trigger-split-lock.md): renamed
  //    from bad_beat → choke and TIGHTENED ≥1 → ≥2. The 1-held-high-tier
  //    case now drops to default — choke is rare and earned, and rarity
  //    is what makes the stamp sting.
  //
  //    Precedence rule: choke OUTRANKS miss. Choke requires BUST/ROOKIE
  //    and miss requires STARTER+, so today they can't overlap on the
  //    same hand. But the 5% miss window (next block) widens the miss
  //    band near LEGEND; ordering choke before miss locks the "held studs
  //    and bricked is a sharper story than almost-cleared" preference for
  //    any future overlap.
  //
  //    The wasHeld gate stays — "stacked lineup got cooked" is a story
  //    about deliberate picks, not RNG dropping high-tier cards into the
  //    redraw.
  if (winTier === "BUST" || winTier === "ROOKIE") {
    const highTierHeldCount = roster.reduce(
      (n, c: any) => n + (c.wasHeld === true && (c.tier === "RED" || c.tier === "ORANGE") ? 1 : 0),
      0,
    );
    if (highTierHeldCount >= 2) {
      return {
        trigger: "choke",
        headline: `Brutal hand. See if they survive the same slate.`,
        // Phase 5c Path A (2026-06-01): anchor persisted at create time. The
        // choke trigger gates on ≥2 held RED/ORANGE cards; the anchor is the
        // held card whose actualFp - projectedFp landed worst (tiebreak
        // highest salary). selectChokeAnchor reads from any held card on the
        // roster, not just RED/ORANGE — the held-tier gate above is for
        // firing the trigger; the anchor narrative is "which held card
        // disappointed most." See doc lock M1 EDIT 2026-06-01 + T2.
        anchorBasePlayerId: selectChokeAnchor(roster),
      };
    }
  }

  // 4. miss — REMOVED (2026-06-20). A tier near-miss no longer initiates a
  //    challenge. See the note above the helpers: the near-miss reveal stamp now
  //    rides the gauge's standalone 5% band (GameView), and the `miss` union
  //    member + nearMissGap/nearMissNextTier fields + near_miss_* columns are
  //    preserved for persisted rows. A former-miss hand now falls through to
  //    default below (and to no challenge once default is removed).

  // 5. default — always fires
  return {
    trigger: "default",
    headline: `${fp} FP on the board. Same slate. Beat them.`,
  };
}
