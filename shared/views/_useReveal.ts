/**
 * shared/views/_useReveal.ts
 *
 * Phase 2 sub-PR 04 — owns the reveal + spring orchestration that fires
 * during the REVEALING → RESULTS transition. Consumed by per-sport
 * GameView wrappers, which pass it the adapter, the destructured return
 * of `useSharedGameState`, plus a small bag of per-sport callbacks
 * (win-tier math, engagement counters, FTUE refs).
 *
 * What lives here:
 *   - runSpring  — the 4-segment damped spring that animates the gauge
 *     after the anchor card resolves
 *   - onCardFpStart — budget rolldown trigger (deduct non-held salary as
 *     each card's FP rolls up)
 *   - onCardComplete — bumps revealIndex / lastRevealedCardId, kicks the
 *     FTUE gauge oscillation when Tatum's stamp lands
 *   - onAnchorFpComplete — calculates winTier/payout, records analytics,
 *     branches FTUE-vs-non-FTUE for pendingBalanceUpdateRef wiring
 *   - All paired refs: springTimersRef, springRafRef, frozenBarFpRef,
 *     lockedGaugeFpRef, springHasFiredRef, anchorFpCallCountRef,
 *     prevRevealTierRef, nearMissChoreTimersRef,
 *     deductedSalaryCardsRef, latestGaugeFpRef, pendingBalanceUpdateRef
 *   - Derived `displayFp` and `lockedSalary` (deferred from Task 3 because
 *     they fold reveal-state refs)
 *
 * What stays per-sport:
 *   - Win-tier math (calculateWinTier, calculatePayoutWithStreak) —
 *     passed in via args. Basketball ships its own; baseball will plug
 *     in its equivalents in Task 6.
 *   - useEmotionalReveal usage — the callbacks returned from this hook
 *     are passed *into* useEmotionalReveal at the call site, since the
 *     hook also returns isSkippingRef + anchorCardId which must be wired
 *     back into our callbacks via the args.refs bundle.
 *
 * Streak / hand-count localStorage writes route through the
 * incrementStreak/resetStreak helpers on `state`, which themselves
 * wrap nsKey(adapter, ...). This preserves byte-identical behavior
 * today (namespace = "") while making the namespace flip safe later.
 */

import { useRef, useCallback, useMemo } from "react";
import type { WinTierKey } from "@shared/utils/payoutLogic";
import type { PlayerCard } from "@shared/types";
import { soundManager } from "@shared/utils/soundManager";
import { audioDirector } from "@shared/utils/audioDirector";
import { buildScoreProof } from "@shared/utils/scoreProof";
import { track } from "@shared/analytics/analytics";
import type { GameAdapter } from "./GameAdapter";
import { nsKey } from "./_useSharedGameState";
import type { useSharedGameState } from "./_useSharedGameState";
import { cardId } from "./_gameViewHelpers";

type RevealAdapter = Pick<GameAdapter, "sportKey" | "leaderboardScope" | "localStorageNamespace">;

type SharedState = ReturnType<typeof useSharedGameState>;

// ── Spring oscillation waypoints ───────────────────────────────────────
// Mirrored from the basketball file; this table is sport-agnostic — it
// only uses the basketball thresholds because that's what the gauge
// boundaries are. Worldcup/baseball pass their own thresholds via args.
const DEFAULT_SPRING_TIERS = [
  { name: "BUST", lo: 0, hi: 190 },
  { name: "ROOKIE", lo: 190, hi: 205 },
  { name: "STARTER", lo: 205, hi: 225 },
  { name: "ALL_STAR", lo: 225, hi: 235 },
  { name: "MVP", lo: 235, hi: 255 },
  { name: "LEGEND", lo: 255, hi: 9999 },
];

export interface SpringTier { name: string; lo: number; hi: number }

export interface UseRevealArgs {
  adapter: RevealAdapter;
  state: SharedState;

  /** Spring tier table — controls overshoot clamp during the anchor
   *  spring. Defaults to basketball's table; baseball/worldcup pass
   *  their own. */
  springTiers?: SpringTier[];

  // ── Per-sport hooks ─────────────────────────────────────────────────
  /** Maps a final FP total to a tier key (BUST | ROOKIE | STARTER+).
   *  May return null if the sport's win-tier function can't classify the
   *  total (baseball's wrapper, wired in Task 6, is the motivating case). */
  calculateWinTier: (totalFp: number) => WinTierKey | null;
  /** Calculates the payout, with streak bonus. Accepts null tier to
   *  match calculateWinTier's return — null collapses to no-payout. */
  calculatePayoutWithStreak: (
    tier: WinTierKey | null,
    bet: number,
    streak: number,
  ) => number;

  /** FTUE anchor card ID (basketball: "ftue-tatum"; baseball: "ftue-ohtani").
   *  Used by onCardComplete to start gauge oscillation when the anchor's
   *  stamp lands. */
  ftueAnchorId: string;
  /** Current bet (BASE_BET * betMultiplier in basketball). */
  currentBet: number;
  /** Bet multiplier (passed separately for engagement.recordMultiplierUsed). */
  betMultiplier: number;

  // ── Roster / FTUE refs ──────────────────────────────────────────────
  /** Mutable ref containing the live roster (resolved actualFp). */
  rosterRef: React.MutableRefObject<PlayerCard[]>;

  /** isFTUE flag, lifted from useFTUE. */
  isFTUE: boolean;
  /** Ref for FTUE last-hand FP — written here, read by other UI. */
  ftueLastHandFpRef: React.MutableRefObject<number>;

  /** True when the user is anonymous (no auth) — gates big-win nudges. */
  isAnonymous: boolean;
  setBigWinFired: (v: boolean) => void;
  /** Bumped after checkLeaderboardRank's localStorage write completes so
   *  GameView re-renders and the trophy-burst edge-detect effect re-reads
   *  rm_on_board_today same-hand instead of waiting for the next
   *  gameState/handCount transition. */
  setOnBoardTick: (updater: (t: number) => number) => void;

  // ── Engagement counters ─────────────────────────────────────────────
  recordHandPlayed: () => void;
  recordHandWon: () => void;
  recordHandLost: () => void;
  recordTierReached: (tier: string | null) => void;
  recordStreakWin: () => void;
  recordStreakBust: () => void;
  recordBonusPlayerUsed: (count: number) => void;
  recordMultiplierUsed: (mult: number) => void;

  // ── Analytics ───────────────────────────────────────────────────────
  gameAnalytics: { handResolved: (fp: number, tier: string, bust: boolean, badges: number, ts: number) => void };

  /** Lazy getter for topGameInfo (used by the analytics call site).
   *  Optional — basketball wires this via a holder ref so the closure
   *  doesn't go stale; baseball can omit. */
  getTopGameInfo?: () => {
    star: { basePlayerId?: string; statLine?: any; gameDate?: string; cardTier?: string } | null;
    topGame: { tier: string | null; primaryReason?: { category?: string } | null };
  } | null;
}

export interface UseRevealReturn {
  // Reveal callbacks (passed into useEmotionalReveal at the call site)
  onCardFpStart: (cId: string) => void;
  onCardComplete: (cId: string) => void;
  onAnchorFpComplete: (hookTotal: number) => void;

  // Spring orchestrator
  runSpring: (finalFp: number, onSettled: () => void) => void;

  // Refs the caller may need to wire (e.g. handleCardRevealStart writes
  // frozenBarFpRef when the true anchor starts, and the JSX reads
  // pendingBalanceUpdateRef on wage-animation complete).
  springTimersRef: React.MutableRefObject<number[]>;
  springRafRef: React.MutableRefObject<number>;
  frozenBarFpRef: React.MutableRefObject<number | null>;
  lockedGaugeFpRef: React.MutableRefObject<number | null>;
  springHasFiredRef: React.MutableRefObject<boolean>;
  anchorFpCallCountRef: React.MutableRefObject<number>;
  latestGaugeFpRef: React.MutableRefObject<number>;
  prevRevealTierRef: React.MutableRefObject<string>;
  nearMissChoreTimersRef: React.MutableRefObject<number[]>;
  deductedSalaryCardsRef: React.MutableRefObject<Set<string>>;
  pendingBalanceUpdateRef: React.MutableRefObject<(() => void) | null>;

  // Derived display values
  /** Bar position during reveal: spring while running, frozen during
   *  count-up, locked after settle, total otherwise. */
  computeDisplayFp: (totalFp: number) => number;
  /** Sum of locked card salaries (HOLD/DRAWING budget display). */
  computeLockedSalary: (
    roster: PlayerCard[],
    lockedCardIds: Set<string>,
  ) => number;

  /** Wire useEmotionalReveal's isSkippingRef into the hook so the
   *  skip-anchor branch can read it. Call this once, after
   *  useEmotionalReveal initializes. The hook stores the ref by identity;
   *  no setState is triggered. */
  bindIsSkippingRef: (src: React.MutableRefObject<boolean>) => void;
}

export function useReveal(args: UseRevealArgs): UseRevealReturn {
  const {
    adapter, state,
    springTiers = DEFAULT_SPRING_TIERS,
    calculateWinTier, calculatePayoutWithStreak,
    ftueAnchorId,
    currentBet, betMultiplier,
    rosterRef,
    isFTUE, ftueLastHandFpRef,
    isAnonymous, setBigWinFired, setOnBoardTick,
    recordHandPlayed, recordHandWon, recordHandLost, recordTierReached,
    recordStreakWin, recordStreakBust, recordBonusPlayerUsed, recordMultiplierUsed,
    gameAnalytics, getTopGameInfo,
  } = args;

  // adapter is used inside onAnchorFpComplete via nsKey() for personal-
  // bests scoping (rm_best_hand / rm_best_tier).

  const {
    streak, handCount,
    setRevealedSalary, setRevealIndex, setLastRevealedCardId,
    setFtueOscillating,
    setSpringFp, setSpringSettled,
    setWinTier, setWinPayout,
    setGameState, setBalance,
    persistBalance,
    submitToLeaderboard, checkLeaderboardRank, logHandToDb,
    incrementStreak, resetStreak, incrementHandCount,
  } = state;

  // ── Tier flip / near-miss timers (state stays in useSharedGameState;
  //    the timer refs live with the orchestrator) ─────────────────────
  const prevRevealTierRef = useRef("BUST");
  const nearMissChoreTimersRef = useRef<number[]>([]);

  // ── Spring oscillation refs ─────────────────────────────────────────
  const springRafRef = useRef<number>(0);
  const springTimersRef = useRef<number[]>([]);
  const pendingBalanceUpdateRef = useRef<(() => void) | null>(null);
  const springHasFiredRef = useRef(false);
  // FTUE: tracks onAnchorFpComplete calls to skip non-held anchor
  const anchorFpCallCountRef = useRef(0);

  // ── Gauge fp refs ───────────────────────────────────────────────────
  // Three fp refs that drive the gauge bar through the reveal:
  //   latestGaugeFpRef — the bar's *current* displayed value (running total
  //     during card-by-card, or the spring's current frame).
  //   frozenBarFpRef   — the 5-card total, snapshotted when the true anchor
  //     starts its count-up. Bar is *pinned* here while the anchor card's
  //     number rolls up on the card face. null when no anchor in flight.
  //   lockedGaugeFpRef — the final post-spring value. null until the spring
  //     onSettled callback fires.
  const latestGaugeFpRef = useRef(0);
  const frozenBarFpRef = useRef<number | null>(null);
  const lockedGaugeFpRef = useRef<number | null>(null);

  // ── Card-level reveal refs ──────────────────────────────────────────
  const deductedSalaryCardsRef = useRef<Set<string>>(new Set());

  // ── Bound isSkipping reference ─────────────────────────────────────
  // useEmotionalReveal owns its own isSkippingRef; this hook can't take
  // it as an arg because the caller initializes useReveal *before*
  // useEmotionalReveal (since useReveal returns the callbacks the latter
  // consumes). The caller uses `bindIsSkippingRef` after
  // useEmotionalReveal returns to wire the source ref in. The skip-anchor
  // branch then dereferences it lazily at callback time.
  const isSkippingRefHolder = useRef<React.MutableRefObject<boolean> | null>(null);
  const bindIsSkippingRef = useCallback((src: React.MutableRefObject<boolean>) => {
    isSkippingRefHolder.current = src;
  }, []);

  // [Spring:v2] runSpring — damped-sinusoid bounce after the anchor lands.
  //
  // The anchor's count animation drives the running total up to finalFp
  // in lockstep with the bar. Without an overlay, the bar just stops
  // dead at finalFp — flat. This function overlays a damped-sinusoid
  // impulse on top, so the bar visibly bounces (peak ~5-8 FP above
  // final, dips slightly below, settles) over ~700ms. springFp is
  // consumed by computeDisplayFp, which the gauge and the team-FP
  // readout both read — so the bar AND the FP total oscillate together.
  //
  // Clamped to springTiers so the overshoot can't visually cross into
  // the next tier (a near-miss STARTER hand shouldn't briefly flash
  // ALL-STAR styling during the bounce).
  const runSpring = useCallback((finalFp: number, onSettled: () => void) => {
    cancelAnimationFrame(springRafRef.current);
    springTimersRef.current.forEach(clearTimeout);
    springTimersRef.current = [];
    setSpringFp(null);
    setSpringSettled(false);
    frozenBarFpRef.current = null;

    // Tier clamp — keep peak below next tier's lo so styling stays put.
    const tier = springTiers.find(t => finalFp >= t.lo && finalFp < t.hi);
    const headroom = tier ? Math.max(0, tier.hi - finalFp - 0.1) : Number.POSITIVE_INFINITY;
    const PEAK_BASE = 7;        // FP units at the visible apex
    const peak = Math.min(PEAK_BASE, headroom);
    const DURATION_MS = 700;
    const ZETA = 0.28;          // damping ratio — visible bounces
    const WN = 14;              // natural freq → ~2.2 Hz, ~2 visible peaks in 700ms
    const wd = WN * Math.sqrt(1 - ZETA * ZETA);
    const startMs = performance.now();

    const step = () => {
      const elapsedMs = performance.now() - startMs;
      if (elapsedMs >= DURATION_MS || peak <= 0) {
        setSpringFp(null);
        lockedGaugeFpRef.current = finalFp;
        setSpringSettled(true);
        onSettled();
        return;
      }
      // Damped-sinusoid impulse: starts at 0, peaks at +peak, oscillates
      // back through 0 with decaying amplitude. sin(0)=0 ensures the
      // bar starts exactly where the count landed (no visual jump).
      const t = elapsedMs / 1000;
      const envelope = Math.exp(-ZETA * WN * t);
      const offset = peak * envelope * Math.sin(wd * t);
      setSpringFp(finalFp + offset);
      springRafRef.current = requestAnimationFrame(step);
    };

    springRafRef.current = requestAnimationFrame(step);
  }, [setSpringFp, setSpringSettled, springTiers]);

  // ── onCardFpStart ──────────────────────────────────────────────────
  const onCardFpStart = useCallback((cId: string) => {
    // Budget rolls down in sync with FP roll-up. Deduct at FP animation start.
    // Ref prevents double-count across tap + skip flows.
    if (deductedSalaryCardsRef.current.has(cId)) return;
    const card = rosterRef.current.find(c => {
      const id = String(c?.cardId ?? c?.basePlayerId ?? "");
      return id === cId;
    });
    if (card && !(card as any).wasHeld) {
      setRevealedSalary(prev => prev + Number((card as any).salary ?? 0));
      deductedSalaryCardsRef.current.add(cId);
    }
  }, [rosterRef, setRevealedSalary]);

  // ── onCardComplete ─────────────────────────────────────────────────
  const onCardComplete = useCallback((cId: string) => {
    setRevealIndex(prev => {
      const next = prev + 1;
      audioDirector.setRevealProgress(next, rosterRef.current.length);
      return next;
    });
    setLastRevealedCardId(cId);

    // FTUE: start gauge oscillation shortly after the sport's anchor card
    // lands its stamp (Tatum for basketball, Ohtani for baseball).
    if (isFTUE && cId === ftueAnchorId) {
      setTimeout(() => setFtueOscillating(true), 100);
    }
  }, [isFTUE, ftueAnchorId, rosterRef, setRevealIndex, setLastRevealedCardId, setFtueOscillating]);

  // ── onAnchorFpComplete ─────────────────────────────────────────────
  const onAnchorFpComplete = useCallback((_hookTotal: number) => {
    if (springHasFiredRef.current) return;
    // In tap mode with held cards, onAnchorFpComplete fires twice: once for the
    // non-held anchor and once for the held anchor. Skip the first call so held
    // cards' FP rolls up independently. In skipToEnd mode, all cards are in one
    // sequence with one anchor — never skip.
    const hasHeldCards = rosterRef.current.some((c: any) => c.wasHeld);
    const isSkipping = isSkippingRefHolder.current?.current ?? false;
    if (hasHeldCards && anchorFpCallCountRef.current === 0 && !isSkipping) {
      anchorFpCallCountRef.current = 1;
      return; // Non-held anchor's call in tap mode — skip, wait for held anchor
    }
    springHasFiredRef.current = true;
    // Always compute from rosterRef — guaranteed to have all 6 resolved cards
    const totalFp = rosterRef.current.reduce((s, c) => s + Number((c as any).actualFp ?? 0), 0);
    runSpring(totalFp, () => {
      lockedGaugeFpRef.current = totalFp;
      const tier = calculateWinTier(totalFp);
      const payout = calculatePayoutWithStreak(tier, currentBet, streak);
      setWinTier(tier);
      setWinPayout(payout);
      const bust = !tier || tier === "BUST";
      // ROOKIE = neutral for streak (doesn't advance or break). BUST = streak reset.
      const isStreakWin = !bust && tier !== "ROOKIE";  // STARTER+ advances streak
      const isStreakLoss = bust;                        // only BUST resets streak
      soundManager.playTierResult(tier ?? "BUST");
      // Nudge trigger: first ALL_STAR+ hit for anonymous users
      if (tier && ["ALL_STAR", "MVP", "LEGEND"].includes(tier) && isAnonymous) {
        setBigWinFired(true);
      }
      const badges = rosterRef.current.reduce((s, c) => s + (c.achievements?.length ?? 0), 0);
      gameAnalytics.handResolved(totalFp, String(tier ?? "BUST"), bust, badges, Date.now());
      const tg = getTopGameInfo?.();
      if (tg?.topGame.tier && tg.star) {
        track("gameplay", "top_game_revealed", {
          tier: tg.topGame.tier,
          category: tg.topGame.primaryReason?.category ?? "unknown",
          playerId: tg.star.basePlayerId ?? "",
          isStarCard: true,
        });
      }
      // Generate the hand id once and reuse it for hand_log and leaderboard
      // hand_best so api/leaderboard can verify the submitted score against
      // a real audit-trail row (Option C — existence check, see
      // docs/superpowers/specs/2026-04-30-prelaunch-section-2.md drafted notes).
      const handIdForAudit = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      logHandToDb(rosterRef.current, totalFp, tier ?? "BUST", payout, streak, handIdForAudit);
      recordHandPlayed();
      if (!bust) recordHandWon(); else recordHandLost();

      // Tier reached
      recordTierReached(tier);

      // Streak
      if (!bust) {
        recordStreakWin();
      } else {
        recordStreakBust();
      }

      // Bonus players used this hand
      const bonusCount = rosterRef.current.filter(
        c => Number((c as any).dailyBonus ?? 0) > 0
      ).length;
      if (bonusCount > 0) {
        recordBonusPlayerUsed(bonusCount);
      }

      // Multiplier used this hand
      recordMultiplierUsed(betMultiplier);
      if (isFTUE) {
        // FTUE: same flow as real game — WIN_CELEBRATION triggers wage animation
        ftueLastHandFpRef.current = totalFp;
        pendingBalanceUpdateRef.current = () => {
          if (payout > 0) {
            setBalance(prev => { const next = prev + payout; persistBalance(next); return next; });
          }
        };
        const t = window.setTimeout(() => {
          setGameState("WIN_CELEBRATION");
        }, 1200);
        springTimersRef.current.push(t);
      } else {
        // Increment the persistent hand counter at hand-resolution — single
        // source of truth, independent of which user-action path exits
        // WIN_CELEBRATION later. Prior site (onWinCelebrationComplete) was
        // bypassed when the user advanced via the action/play-again button
        // instead of tapping the celebration area, leaving all handCount-
        // gated surfaces (name_prompt, chad nudges, PWA install prompt,
        // first_share_invitation, etc.) silently broken. FTUE hands stay
        // excluded — the outer if (isFTUE) above gates this branch.
        incrementHandCount();
        pendingBalanceUpdateRef.current = () => {
          if (payout > 0) {
            setBalance(prev => { const next = prev + payout; persistBalance(next); return next; });
          }
          const proof = buildScoreProof(rosterRef.current as any[], totalFp);
          if (isStreakWin) {
            // STARTER+ = streak advances. incrementStreak writes through nsKey
            // and returns the new value.
            const next = incrementStreak();
            if (next === 3 || next === 5 || next === 10) soundManager.playStreakMilestone(next);
            submitToLeaderboard("streak", next);
            submitToLeaderboard("wins", 1);
            submitToLeaderboard("money_won", payout);
          } else if (isStreakLoss) {
            // BUST = streak resets. resetStreak writes through nsKey.
            resetStreak();
          }
          // ROOKIE: streak unchanged (neutral) — no increment, no reset
          // These fire for all non-bust hands (ROOKIE still counts for leaderboard/session)
          if (!bust) {
            submitToLeaderboard("fp", totalFp);
            if (handCount >= 8) submitToLeaderboard("hand_avg", totalFp, { handCount });
            // Reuse the same handId logHandToDb just persisted — api/leaderboard
            // will look it up in hand_log to confirm the submission corresponds
            // to a real audit-trail row.
            submitToLeaderboard("hand_best", totalFp, { proof, handId: handIdForAudit });
            submitToLeaderboard("session_score", parseFloat(totalFp.toFixed(1)));
            track("gameplay", "score_submitted", {
              sport: adapter.sportKey,
              score: parseFloat(totalFp.toFixed(1)),
              tier: tier ?? "BUST",
              hand_id: handIdForAudit,
              hand_number: handCount,
            });
            setTimeout(async () => {
              // Await so the bump strictly follows the localStorage write
              // inside checkLeaderboardRank's body — the edge-detect effect
              // on the GameView side must observe the fresh value, not the
              // stale one. Covers both write branches (on-board "1" and
              // off-board "0"); the early-return path (missing uid) makes
              // the bump a harmless no-op re-evaluation.
              await checkLeaderboardRank();
              setOnBoardTick(t => t + 1);
            }, 2000);
          }
          // Personal bests are sport-scoped via nsKey — basketball reads
          // the raw key (back-compat: namespace = ""), baseball reads
          // baseball_rm_best_hand. Without this scoping, baseball's first
          // hand would inherit basketball's all-time best, surfacing the
          // user's "extra win already existing" perception on a fresh
          // baseball play. (Trophy colouring is driven by rm_on_board_today,
          // not rm_best_tier — that flag stays raw on purpose.)
          const bestHandKey = nsKey(adapter, "rm_best_hand");
          const bestTierKey = nsKey(adapter, "rm_best_tier");
          const prevBest = parseFloat(localStorage.getItem(bestHandKey) ?? "0");
          if (totalFp > prevBest) {
            localStorage.setItem(bestHandKey, totalFp.toFixed(1));
          }
          const tierRanks = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
          const prevTierRank = tierRanks.indexOf(localStorage.getItem(bestTierKey) ?? "BUST");
          const newTierRank = tierRanks.indexOf(tier ?? "BUST");
          if (newTierRank > prevTierRank) {
            localStorage.setItem(bestTierKey, tier ?? "BUST");
          }
        };
        const t = window.setTimeout(() => {
          setGameState("WIN_CELEBRATION");
        }, 1200);
        springTimersRef.current.push(t);
      }
    });
  }, [
    adapter,
    isFTUE, currentBet, betMultiplier, streak, handCount, isAnonymous,
    rosterRef, ftueLastHandFpRef,
    runSpring, calculateWinTier, calculatePayoutWithStreak,
    setWinTier, setWinPayout, setBalance, persistBalance, setGameState,
    submitToLeaderboard, checkLeaderboardRank, logHandToDb,
    incrementStreak, resetStreak, incrementHandCount,
    setBigWinFired, setOnBoardTick, gameAnalytics, getTopGameInfo,
    recordHandPlayed, recordHandWon, recordHandLost, recordTierReached,
    recordStreakWin, recordStreakBust, recordBonusPlayerUsed, recordMultiplierUsed,
  ]);

  // ── Derived display helpers ────────────────────────────────────────
  // computeDisplayFp folds spring/frozen/locked refs into the bar value.
  // Caller passes the latest totalFp (state.runningTotalFp / sum) so we
  // don't have to lift the source-of-truth into this hook.
  const computeDisplayFp = useCallback((totalFp: number) => {
    return state.springFp ?? (frozenBarFpRef.current ?? (lockedGaugeFpRef.current ?? totalFp));
  }, [state.springFp]);

  const computeLockedSalary = useCallback((
    roster: PlayerCard[],
    lockedCardIds: Set<string>,
  ) => roster.reduce(
    (s, c: any) => lockedCardIds.has(cardId(c)) ? s + Number(c?.salary ?? 0) : s,
    0,
  ), []);

  return useMemo(() => ({
    onCardFpStart,
    onCardComplete,
    onAnchorFpComplete,
    runSpring,
    springTimersRef,
    springRafRef,
    frozenBarFpRef,
    lockedGaugeFpRef,
    springHasFiredRef,
    anchorFpCallCountRef,
    latestGaugeFpRef,
    prevRevealTierRef,
    nearMissChoreTimersRef,
    deductedSalaryCardsRef,
    pendingBalanceUpdateRef,
    computeDisplayFp,
    computeLockedSalary,
    bindIsSkippingRef,
  }), [
    onCardFpStart, onCardComplete, onAnchorFpComplete, runSpring,
    computeDisplayFp, computeLockedSalary, bindIsSkippingRef,
  ]);
}
