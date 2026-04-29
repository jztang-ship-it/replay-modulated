/**
 * shared/views/GameView.tsx
 *
 * Phase 2 sub-PR 05 — the canonical GameView component. Per-sport wrappers
 * shrink to ~80-line files that build a GameAdapter literal and render
 * <GameView adapter={...}>. All variation flows through the adapter or
 * through SportAdapter; this file contains zero `if (sportKey === ...)`
 * branches.
 *
 * What lives here:
 *   - Full GameView JSX (header, RosterGrid, GameBar, TierGauge, footer,
 *     all overlays — RegisterModal, LeaderboardScreen, ProfileScreen,
 *     BellSheet, FeedbackModal, CollectScreen, PwaInstallPrompt)
 *   - All inline <style> blocks (tier flip / slam / fade animations)
 *   - Local UI/modal state (showProfile, showLeaderboard, bellOpen,
 *     showRegisterModal, showCollect, showNamePrompt, showRawScore,
 *     feedbackOpen, unreadCount, bigWinFired, multipliersHost, controlsHost)
 *   - Chad usher message scheduling
 *   - Tier flip / near-miss / spring reset effects
 *
 * What flows in via the adapter:
 *   - sportAdapter (rosterSize, salaryCap)
 *   - dealInitialRoster / redrawRoster / resolveRoster (non-FTUE)
 *   - ftueDealRoster / ftueRedrawRoster / ftueResolveRoster (FTUE)
 *   - CardComponent (AthleteCard / BaseballCard)
 *   - calculateWinTier / calculatePayoutWithStreak / winTiersMap /
 *     getStreakMultiplier
 *   - gameBarWinTiers + gameBarLegend (sport-specific tier rows + legend)
 *   - getTodaysStars + (optional) computeRosterCeiling
 *   - ftueTextConfig (optional — basketball uses CoachLayer defaults)
 *   - PostHandSheet (optional — baseball-only today)
 *   - resetAllOverlays
 *
 * State + persistence: useSharedGameState owns the canonical hooks bag.
 * Reveal + spring orchestration: useReveal returns the callbacks +
 * derived helpers (computeDisplayFp / computeLockedSalary).
 */

import {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  sleep,
  RosterGridScaleFit,
  RollingNumber,
  toRevealableCards,
  cardId,
  sumSalary,
} from "./_gameViewHelpers";
import { useSharedGameState } from "./_useSharedGameState";
import { useReveal } from "./_useReveal";
import type { GameAdapter } from "./GameAdapter";
import type { GamePhase, PlayerCard } from "@shared/types";
import type { WinTierKey } from "@shared/utils/payoutLogic";
import {
  RosterGrid as SharedRosterGrid,
  type RosterGridCardProps,
} from "@shared/components/RosterGrid";
import { AppHeader } from "@shared/components/AppHeader";
import { CoachLayer } from "@shared/components/CoachLayer";
import { useFTUE } from "@shared/hooks/useFTUE";
import { useCardFlipState } from "@shared/hooks/useCardFlipState";
import {
  useEmotionalReveal,
  DRAWING_DWELL_MS,
} from "@shared/hooks/useEmotionalReveal";
import { GameBar as SharedGameBar, type CelebrationData } from "@shared/components/GameBar";
import { featureFlags } from "@shared/featureFlags";
import { selectCommentary } from "@shared/commentary/selectCommentary";
import { detectTopGame } from "@shared/data/recordDetector";
import { selectStar } from "@shared/commentary/storySelector";
import { useGameAnalytics } from "@shared/analytics/useGameAnalytics";
import { track } from "@shared/analytics/analytics";
import { CollectScreen } from "@shared/engagement/CollectScreen";
import { TierGauge, computeGaugeState } from "@shared/components/TierGauge";
import { useEngagement } from "@shared/engagement/useEngagement";
import { soundManager } from "@shared/utils/soundManager";
import { getBonusPool, contributeBet } from "@shared/utils/bonusPoolStore";
import { audioDirector } from "@shared/utils/audioDirector";
import {
  getPlayerUid,
  getNickname,
  setNickname,
} from "@shared/utils/playerIdentity";
import {
  captureReferrerFromUrl,
  applyReferral,
  claimReferral,
} from "@shared/utils/referral";
import { LeaderboardScreen } from "@shared/components/LeaderboardScreen";
import { chadMessage } from "@shared/commentary/chad";
import { ProfileScreen } from "@shared/components/ProfileScreen";
import { useAuth } from "@shared/auth/useAuth";
import { RegisterModal } from "@shared/components/RegisterModal";
import { PwaInstallPrompt } from "@shared/components/PwaInstallPrompt";
import { BellSheet } from "@shared/inbox/BellSheet";
import { FeedbackModal } from "@shared/inbox/FeedbackModal";
import { listMessages } from "@shared/inbox/inbox";
import { ensureLoaded } from "@shared/engines/dataEngine";

// ── Reveal mode toggle ─────────────────────────────────────────────────────
// "auto" = cards flip automatically in sequence (original behaviour)
// "tap"  = user taps each unheld card to reveal it; held FP fades in at end
const REVEAL_MODE: "auto" | "tap" = "tap";

const BASE_BET = 10;

const NEAR_MISS_FP = 5;

const TIER_IMAGE_MAP: Record<string, string> = {
  BUST: "bust1.png",
  ROOKIE: "Rookie2.png",
  STARTER: "Starter3.png",
  ALL_STAR: "All_Star_4.png",
  MVP: "MVP5.png",
  LEGEND: "LEGEND6.png",
};

// Hue correction for tier images whose baked-in color doesn't match TIER_CFG
// Starter3.png is green — rotate +120° to blue
const TIER_IMAGE_HUE: Record<string, string> = {
  STARTER: "hue-rotate(120deg) saturate(1.3)",
};

const GV_STYLE_ID = "gv-tier-flip";
if (typeof document !== "undefined" && !document.getElementById(GV_STYLE_ID)) {
  const st = document.createElement("style");
  st.id = GV_STYLE_ID;
  st.textContent = `
    @keyframes tierFlip {
      0% { transform: perspective(400px) rotateX(90deg); filter: blur(6px); opacity: 0; }
      35% { transform: perspective(400px) rotateX(-15deg); filter: blur(0); opacity: 1; }
      55% { transform: perspective(400px) rotateX(8deg); opacity: 1; }
      75% { transform: perspective(400px) rotateX(-3deg); opacity: 1; }
      100% { transform: perspective(400px) rotateX(0deg); opacity: 1; }
    }
    @keyframes tierSlam {
      0% { transform: scale(0.1) translateY(-10px); opacity: 0; }
      22% { transform: scale(1.5) translateY(2px); opacity: 1; }
      38% { transform: scale(0.9) translateY(-1px); opacity: 1; }
      52% { transform: scale(1.2) translateY(1px); opacity: 1; }
      66% { transform: scale(0.97) translateY(0); opacity: 1; }
      80% { transform: scale(1.05) translateY(0); opacity: 1; }
      100% { transform: scale(1.0) translateY(0); opacity: 1; }
    }
    @keyframes tierSlamFlash {
      0% { opacity: 0; }
      15% { opacity: 0.35; }
      40% { opacity: 0; }
      100% { opacity: 0; }
    }
    @keyframes tierInfoFadeIn {
      0% { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes tierTeaseIn {
      0%   { transform: perspective(400px) rotateX(90deg) scale(0.9); opacity: 0; }
      40%  { transform: perspective(400px) rotateX(-12deg) scale(1.05); opacity: 1; }
      65%  { transform: perspective(400px) rotateX(6deg) scale(0.98); opacity: 1; }
      100% { transform: perspective(400px) rotateX(0deg) scale(1); opacity: 1; }
    }
    @keyframes tierTeaseOut {
      0%   { transform: perspective(400px) rotateX(0deg) scale(1); opacity: 1; }
      30%  { transform: perspective(400px) rotateX(20deg) scale(0.95); opacity: 0.6; }
      100% { transform: perspective(400px) rotateX(90deg) scale(0.85); opacity: 0; }
    }
    @keyframes bonusPoolPulse {
      0%   { box-shadow: 0 0 0px rgba(255,215,0,0); }
      30%  { box-shadow: 0 0 28px rgba(255,215,0,0.95), 0 0 56px rgba(255,215,0,0.5); }
      65%  { box-shadow: 0 0 18px rgba(255,215,0,0.7); }
      100% { box-shadow: 0 0 6px rgba(255,215,0,0.3); }
    }
  `;
  document.head.appendChild(st);
}

// ── BonusPoolPill — pool meter with drip + gold blink on bet ─────────────────

function BonusPoolPill({ betAmount, betNonce, onAmountChange, sportKey }: {
  betAmount: number;
  betNonce: number;
  onAmountChange?: (v: number) => void;
  sportKey: "basketball" | "baseball";
}) {
  const [amount, setAmount] = useState(1000);
  const [displayAmount, setDisplayAmount] = useState(1000);
  const [pulse, setPulse] = useState(false);
  const prevNonceRef = useRef(betNonce);
  const rafRef = useRef(0);

  // Mount: fetch real KV-backed pool value. Periodic poll keeps display fresh.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const pool = await getBonusPool(sportKey);
        if (cancelled) return;
        setAmount(pool);
        onAmountChange?.(pool);
      } catch { /* swallow — keep last known value */ }
    };
    sync();
    const pollId = setInterval(sync, 30_000);
    return () => { cancelled = true; clearInterval(pollId); };
  }, []); // eslint-disable-line

  // Sync display with amount when not animating
  useEffect(() => {
    if (!pulse) setDisplayAmount(amount);
  }, [amount, pulse]);

  // 5% rake on every bet — push to server, animate locally for feedback
  useEffect(() => {
    if (betNonce === prevNonceRef.current) return;
    prevNonceRef.current = betNonce;
    const rake = parseFloat((betAmount * 0.05).toFixed(2));
    if (rake <= 0) return;

    const startVal = amount;
    const endVal = parseFloat((amount + rake).toFixed(2));

    setPulse(true);
    const startTime = performance.now();
    const duration = 800;
    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayAmount(Math.round(startVal + (endVal - startVal) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayAmount(endVal);
        setTimeout(() => setPulse(false), 400);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    (async () => {
      try {
        const next = await contributeBet(sportKey, betAmount);
        setAmount(next);
        onAmountChange?.(next);
      } catch {
        setAmount(endVal);
        onAmountChange?.(endVal);
      }
    })();

    return () => cancelAnimationFrame(rafRef.current);
  }, [betNonce]); // eslint-disable-line

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 14px", borderRadius: 20,
      background: pulse ? "rgba(255,215,0,0.25)" : "rgba(255,215,0,0.06)",
      border: `1px solid rgba(255,215,0,${pulse ? 0.7 : 0.18})`,
      boxShadow: pulse ? "0 0 12px 3px rgba(255,215,0,0.35)" : "none",
      transition: "background 400ms ease, border-color 400ms ease, box-shadow 400ms ease",
    }}>
      <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.2, color: "rgba(255,215,0,0.6)", textTransform: "uppercase" }}>
        Bonus Pool
      </span>
      <span style={{ fontSize: 12, fontWeight: 950, color: "#FFD700", fontVariantNumeric: "tabular-nums", textShadow: pulse ? "0 0 12px rgba(255,215,0,0.8)" : "0 0 8px rgba(255,215,0,0.5)" }}>
        ${Math.round(displayAmount).toLocaleString("en-US")}
      </span>
    </div>
  );
}

interface Props {
  adapter: GameAdapter;
}

function createPlaceholders(rosterSize: number): PlayerCard[] {
  return Array.from({ length: rosterSize }, (_, i) => ({
    cardId: `placeholder-${i}`,
    basePlayerId: "",
    name: "",
    team: "",
    season: "",
    position: "MD" as any,
    tier: "WHITE" as any,
    salary: 0,
    projectedFp: 0,
    actualFp: 0,
    fpDelta: 0,
    gameInfo: { date: "", opponent: "" },
    statLine: {},
    achievements: [],
    slotIndex: i,
    wasHeld: false,
  }));
}

export function GameView({ adapter }: Props) {
  const {
    sportKey,
    sportAdapter,
    leaderboardScope,
    gaugeThresholds,
    calculateWinTier,
    calculatePayoutWithStreak,
    winTiersMap,
    getStreakMultiplier,
    gameBarWinTiers,
    gameBarLegend,
    dealInitialRoster,
    redrawRoster,
    resolveRoster,
    ftueDealRoster,
    ftueRedrawRoster,
    ftueResolveRoster,
    getTodaysStars,
    computeRosterCeiling,
    CardComponent,
    rosterGridColumns,
    rosterGridLayout,
    resetAllOverlays,
    ftueTextConfig,
    PostHandSheet,
  } = adapter;

  const CAP_MAX = sportAdapter.salaryCap;
  const ROSTER_SIZE = sportAdapter.rosterSize;
  // Derive the FTUE anchor card ID from the sport's text config (basketball
  // passes "ftue-tatum" via BASKETBALL_FTUE_CONFIG; baseball passes
  // "ftue-ohtani"). All other places that reference the anchor flow through
  // this constant so the FTUE flow stays sport-agnostic.
  const FTUE_ANCHOR_ID = ftueTextConfig.anchorCardId;

  // ── Shared game state ─────────────────────────────────────────────
  const sharedAdapter = useMemo(() => ({
    sportKey,
    localStorageNamespace: adapter.localStorageNamespace,
    leaderboardScope,
  }), [sportKey, adapter.localStorageNamespace, leaderboardScope]);
  const shared = useSharedGameState(sharedAdapter, { rosterSize: ROSTER_SIZE });
  const {
    gameState, setGameState,
    dataReady, setDataReady,
    noTransition, setNoTransition,
    roster, setRoster,
    lockedCardIds, setLockedCardIds,
    statsFlippedIds, setStatsFlippedIds,
    mvpId, setMvpId,
    rosterRef,
    betMultiplier, setBetMultiplier,
    balance, setBalance,
    isBalanceAnimating,
    persistBalance: saveBalance,
    winTier, setWinTier,
    winPayout, setWinPayout,
    streak,
    handCount,
    revealIndex,
    revealedSalary, setRevealedSalary,
    lastRevealedCardId, setLastRevealedCardId,
    legendaryCardName, setLegendaryCardName,
    celebrationHeld, setCelebrationHeld,
    glowState, setGlowState,
    setTierFlipKey,
    displayTier, setDisplayTier,
    tierResultPhase, setTierResultPhase,
    nearMissTeasing, setNearMissTeasing,
    springSettled,
    setSpringFp, setSpringSettled,
    ftueCardsBlocked, setFtueCardsBlocked,
    ftueReplayReady, setFtueReplayReady,
    ftueResultsDim, setFtueResultsDim,
    ftueAnchorFlipped, setFtueAnchorFlipped,
    setFtueOscillating,
    ftueCommentaryDone, setFtueCommentaryDone,
    ftueCommentaryOverride, setFtueCommentaryOverride,
    ftueGaugeOscDone, setFtueGaugeOscDone,
    ftueWinCelebrationActive, setFtueWinCelebrationActive,
    ftueAnchorPulse, setFtueAnchorPulse,
    ftueHoldSpotlight, setFtueHoldSpotlight,
    setFtueCoachBubbleKey,
    incrementHandCount,
  } = shared;

  const {
    taskStates,
    loginStreak,
    coins,
    xp,
    recordHandPlayed,
    recordHandWon,
    recordHandLost,
    collectTask,
    recordStreakWin,
    recordStreakBust,
    recordBonusPlayerUsed,
    recordTierReached,
    recordMultiplierUsed,
    streakCount,
    weeklyTaskStates,
    perpetualTaskStates,
    recordLeaderboardViewed,
  } = useEngagement();

  // ── UI / modal state (lifted from per-sport in Task 5) ────────────
  const [showCollect, setShowCollect] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState(() => getNickname());
  const [multipliersHost, setMultipliersHost] = useState<HTMLDivElement | null>(null);
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const [betNonce, setBetNonce] = useState(0);
  const [showRawScore, setShowRawScore] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { user, isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
  const [bellOpen, setBellOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [bigWinFired, setBigWinFired] = useState(false);
  const sessionCount = useRef(parseInt(localStorage.getItem("rm_session_count") ?? "0", 10));

  useEffect(() => {
    if (gameState === "IDLE" || gameState === "HOLD") setShowRawScore(false);
  }, [gameState]);

  useEffect(() => {
    const next = sessionCount.current + 1;
    sessionCount.current = next;
    localStorage.setItem("rm_session_count", String(next));
  }, []);

  useEffect(() => {
    if (!user || isAnonymous) { setUnreadCount(0); return; }
    listMessages(user.id).then((all) => {
      setUnreadCount(all.filter((m) => m.read_at == null).length);
    });
  }, [user, isAnonymous, bellOpen]);

  const [gameError, setGameError] = useState<string | null>(null);
  const { isFTUE, completeFTUE } = useFTUE(sportKey);
  const isFTUERef = useRef(isFTUE);
  useEffect(() => { isFTUERef.current = isFTUE; }, [isFTUE]);
  const coachDismissRef = useRef<(() => void) | null>(null);
  /** Legend icon gold-filled when pre-game msg is active OR daily bonus unseen */
  const [legendGold, setLegendGold] = useState(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem(`replaymod_ftue_${sportKey}`) !== "1") return false;
    const today = new Date().toISOString().slice(0, 10);
    const seenToday = localStorage.getItem("replaymod_legend_seen_date") === today;
    const introSeen = localStorage.getItem(`replaymod_pregame_intro_${sportKey}`) === "1";
    return !seenToday || !introSeen;
  });
  const [trophyPulsing, setTrophyPulsing] = useState(false);

  // ── Referral capture + claim ────────────────────────────────────────
  useEffect(() => {
    captureReferrerFromUrl();
    if (handCount >= 1) applyReferral();
  }, []); // eslint-disable-line

  useEffect(() => {
    claimReferral(handCount, loginStreak);
  }, [handCount, loginStreak]);

  // ── Chad usher — single priority queue, max one message per IDLE return ──
  const chadFiredThisIdleRef = useRef(false);
  const chadLastHandRef = useRef(-1);

  useEffect(() => {
    if (gameState !== "IDLE") chadFiredThisIdleRef.current = false;
  }, [gameState]);

  useEffect(() => {
    if (isFTUE) return;
    if (gameState !== "IDLE") return;
    if (localStorage.getItem(`replaymod_pregame_intro_${sportKey}`) === "1") return;
    localStorage.setItem(`replaymod_pregame_intro_${sportKey}`, "1");
    chadFiredThisIdleRef.current = true;
    setLegendGold(true);
    setFtueCommentaryOverride({ parts: [chadMessage("welcome")], sticky: true });
  }, [isFTUE, gameState]); // eslint-disable-line

  // Unified auth-modal gate — fires at most once ever, across all trigger sources.
  const tryOpenAuthModal = useCallback((trigger: string, delayMs: number, extraProps: Record<string, string | number> = {}) => {
    if (localStorage.getItem("rm_auth_modal_shown") === "1") return;
    localStorage.setItem("rm_auth_modal_shown", "1");
    const t = setTimeout(() => {
      track("auth", "signup_modal_shown", { trigger, hand_number: handCount, ...extraProps });
      setShowRegisterModal(true);
    }, delayMs);
    return () => clearTimeout(t);
  }, [handCount]);

  // First rookie win — fires at RESULTS
  useEffect(() => {
    if (isFTUE) return;
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return;
    if (winTier !== "ROOKIE") return;
    if (localStorage.getItem("rm_usher_rookie_first_win") === "1") return;
    localStorage.setItem("rm_usher_rookie_first_win", "1");
    setLegendGold(true);
    setFtueCommentaryOverride({ parts: [chadMessage("rookie_first_win")], sticky: true });
  }, [gameState, winTier, isFTUE]); // eslint-disable-line

  // All other Chad messages — evaluated once per IDLE
  useEffect(() => {
    if (isFTUE || gameState !== "IDLE") return;
    if (chadFiredThisIdleRef.current) return;
    if (chadLastHandRef.current === handCount) return;

    const lastChadHand = parseInt(localStorage.getItem("rm_chad_last_hand") ?? "0", 10);
    if (handCount - lastChadHand < 2 && handCount > 1) return;

    type ChadCheck = { key: string; topic: Parameters<typeof chadMessage>[0]; condition: boolean };
    const checks: ChadCheck[] = [
      { key: "rm_usher_lb_explainer", topic: "leaderboard_explainer", condition: handCount >= 3 },
      { key: "rm_usher_mvp_thanks", topic: "mvp_thanks", condition: handCount >= 5 },
      { key: "rm_usher_lb_shown", topic: "leaderboard_intro", condition: isAnonymous && localStorage.getItem("rm_on_board_today") === "1" },
      { key: "rm_usher_big_win", topic: "big_win", condition: isAnonymous && bigWinFired },
      { key: "rm_usher_dev_4thwall", topic: "dev_4thwall", condition: handCount >= 15 },
      { key: "rm_usher_retention_shown", topic: "retention", condition: isAnonymous && handCount >= 12 },
    ];

    for (const { key, topic, condition } of checks) {
      if (!condition) continue;
      if (localStorage.getItem(key) === "1") continue;
      localStorage.setItem(key, "1");
      localStorage.setItem("rm_chad_last_hand", String(handCount));
      chadFiredThisIdleRef.current = true;
      chadLastHandRef.current = handCount;
      setFtueCommentaryOverride({ parts: [chadMessage(topic)], sticky: true });
      if (topic === "leaderboard_intro" || topic === "leaderboard_explainer") {
        setTrophyPulsing(true);
      } else {
        setLegendGold(true);
      }
      if (topic === "leaderboard_intro" || topic === "big_win" || topic === "retention") {
        tryOpenAuthModal(`chad_${topic}`, 4500);
      }
      return;
    }
  }, [gameState, handCount, isFTUE, isAnonymous, bigWinFired, tryOpenAuthModal]); // eslint-disable-line

  // Auth nudge — MVP+ hand while anonymous
  useEffect(() => {
    if (!isAnonymous || isFTUE) return;
    if (gameState !== "IDLE") return;
    if (winTier !== "MVP" && winTier !== "LEGEND") return;
    return tryOpenAuthModal("big_win", 2500, { tier: winTier ?? "" });
  }, [winTier, isAnonymous, isFTUE, gameState, tryOpenAuthModal]);

  // Auth nudge — fallback at hand 5
  useEffect(() => {
    if (!isAnonymous || isFTUE) return;
    if (gameState !== "IDLE") return;
    if (handCount < 5) return;
    return tryOpenAuthModal("hand_5", 3500);
  }, [handCount, isAnonymous, isFTUE, gameState, tryOpenAuthModal]);

  const pendingCelebration = useRef<{ totalFp: number } | null>(null);
  /** FTUE: roster sum can read 0 briefly in RESULTS — keep last resolved hand FP for TierGauge */
  const ftueLastHandFpRef = useRef(0);
  const heldRevealResumeRef = useRef<(() => void) | null>(null);
  const completedCardsRef = useRef<Set<string>>(new Set());
  const ftueTierSlamPlayedRef = useRef(false);
  const bonusPoolRef = useRef<number>(1000);

  // (dead effect removed in Task 7: it wrote `replaymod_lb_nudge_shown`
  // but no consumer ever read that key — leaderboard intro is delivered
  // via the chadMessage path above. Original setPreGameMsg call site
  // had been removed in the lift.)

  // ── Audio phase sync ──────────────────────────────────────────────
  useEffect(() => {
    const phaseMap: Record<string, import("@shared/utils/audioDirector").AudioPhase> = {
      IDLE: "IDLE",
      DEALING: "DEAL",
      HOLD: "HOLD",
      DRAWING: "DRAW",
      REVEALING: "REVEAL",
      RESULTS: "RESULTS",
      WIN_CELEBRATION: "CELEBRATION",
    };
    audioDirector.setPhase(phaseMap[gameState] ?? "IDLE");
  }, [gameState]);

  useEffect(() => {
    ensureLoaded()
      .then(() => setDataReady(true))
      .catch(() => setGameError("Failed to load game data. Check your connection and try again."));
  }, []); // eslint-disable-line

  const flipState = useCardFlipState();
  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);
  const currentBet = BASE_BET * betMultiplier;
  const gameAnalytics = useGameAnalytics(sportKey);

  // ── Reveal + spring orchestration ──────────────────────────────────
  const topGameInfoHolder = useRef<{
    star: any;
    topGame: { tier: string | null; primaryReason?: any };
  }>({ star: null, topGame: { tier: null } });
  const reveal = useReveal({
    adapter: sharedAdapter,
    state: shared,
    // Adapter's calculateWinTier/calculatePayoutWithStreak are typed
    // (totalFp) => WinTierKey (non-null); useReveal's contract widens to
    // WinTierKey | null for forward compatibility. The cast is safe — both
    // sport implementations always return a concrete tier.
    calculateWinTier: calculateWinTier as (totalFp: number) => WinTierKey | null,
    calculatePayoutWithStreak: calculatePayoutWithStreak as (
      tier: WinTierKey | null,
      bet: number,
      streak: number,
    ) => number,
    ftueAnchorId: FTUE_ANCHOR_ID,
    currentBet,
    betMultiplier,
    rosterRef,
    isFTUE,
    ftueLastHandFpRef,
    isAnonymous,
    setBigWinFired,
    recordHandPlayed,
    recordHandWon,
    recordHandLost,
    recordTierReached,
    recordStreakWin,
    recordStreakBust,
    recordBonusPlayerUsed,
    recordMultiplierUsed,
    gameAnalytics,
    getTopGameInfo: () => topGameInfoHolder.current,
  });
  const {
    onCardFpStart,
    onCardComplete,
    onAnchorFpComplete,
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
  } = reveal;

  function handleCardRevealStart(cId: string, tierArg: string, shakeType?: string | null) {
    const card = rosterRef.current.find(c => cId === ((c as any).cardId ?? (c as any).basePlayerId));
    const heldCards = rosterRef.current.filter((c: any) => c.wasHeld).sort((a: any, b: any) => (a.salary ?? 0) - (b.salary ?? 0));
    const trueAnchorId = heldCards.length > 0
      ? ((heldCards[heldCards.length - 1] as any).cardId ?? (heldCards[heldCards.length - 1] as any).basePlayerId)
      : anchorCardId;
    if (cId === trueAnchorId) {
      frozenBarFpRef.current = latestGaugeFpRef.current;
    }
    const tier = tierArg?.toUpperCase() ?? "WHITE";
    const st = shakeType ?? null;
    const base = tier === "ORANGE" ? 900
      : tier === "PURPLE" ? 700
        : tier === "BLUE" ? 400
          : tier === "GREEN" ? 350
            : 250;
    const modifier = st === "legendary" ? 300
      : st === "big" ? 150
        : st === "frozen" ? -100
          : st === "cold" ? -50
            : 0;
    const duration = isSkippingRef.current
      ? (tier === "ORANGE" ? (st === "legendary" ? 500 : 400)
        : tier === "PURPLE" ? (st === "legendary" || st === "big" ? 350 : 300)
          : tier === "BLUE" ? 200
            : tier === "GREEN" ? 175
              : 125)
      : Math.max(150, base + modifier);
    setGlowState({ cardId: cId, tier, durationMs: duration });
    setTimeout(() => setGlowState(prev => ({ ...prev, cardId: null })), duration + 50);
  }

  const {
    runningTotalFp,
    lastCardProgress,
    lastCardFp,
    anchorCardId,
    tapRevealCard,
    heldFpVisible,
    heldRevealedIds,
    tappedCardIds,
    getVisibleFp,
    flipMsMap,
    fpCountUpMsMap,
    performanceTagMap,
    pulseMap,
    shakeInfo,
    cardShakeTypeMap,
    activeRevealCardId,
    isSkipping,
    isSkippingRef,
    clearActiveCard,
    visibleBadgesMap,
    skipToEnd: skipReveal,
    reset: resetReveal,
  } = useEmotionalReveal({
    cards: revealableCards,
    isActive: gameState === "REVEALING",
    revealMode: REVEAL_MODE,
    flipState,
    onBeforeHeldReveal: isFTUE ? (resume) => {
      heldRevealResumeRef.current = resume;
    } : undefined,
    onCardRevealStart: handleCardRevealStart,
    onCardFpStart,
    onCardComplete,
    onAnchorFpComplete,
    onAllComplete: useCallback((_totalFp: number) => {
      clearActiveCard();
      soundManager.stopRevealAmbience();
    }, []), // eslint-disable-line
  });
  bindIsSkippingRef(isSkippingRef);

  // ── Derived values ────────────────────────────────────────────────
  const phase: GamePhase = useMemo(() => {
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION" || gameState === "REVEALING") return "RESULTS";
    if (gameState === "DRAWING") return "DRAWING";
    return "HOLD";
  }, [gameState]);

  const isPreRevealFooter = gameState === "HOLD" && !isFTUE;

  const CELEBRATION_TIER_COLORS: Record<string, { color: string; glow: string }> = {
    LEGEND: { color: "#EF4444", glow: "#EF444499" },
    MVP: { color: "#FB923C", glow: "#FB923C55" },
    ALL_STAR: { color: "#C084FC", glow: "#C084FC55" },
    STARTER: { color: "#3B82F6", glow: "#3B82F655" },
    ROOKIE: { color: "#22C55E", glow: "#22C55E55" },
    BUST: { color: "#6B7280", glow: "#6B728033" },
  };

  const formatTierLabel = (tier: string) => {
    if (tier === "BUST") return "BUST";
    if (tier === "LEGEND") return "LEGEND";
    return tier.replace("_", "-");
  };

  const celebrationData: CelebrationData | undefined = useMemo(() => {
    if (gameState !== "WIN_CELEBRATION" || !winTier) return undefined;
    const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
    const tierMult = winTiersMap[winTier]?.multiplier ?? 0;
    const isLoss = winTier === "BUST";
    const lossAmount = winTier === "BUST" ? BASE_BET * betMultiplier : 0;
    const streakMult = getStreakMultiplier(streak);
    return {
      tierLabel: formatTierLabel(winTier),
      tierColor: tc.color,
      tierGlow: tc.glow,
      payout: winPayout,
      streak,
      isBust: winTier === "BUST",
      betMultiplier,
      tierMultiplier: tierMult,
      streakMultiplier: streakMult,
      baseBet: BASE_BET,
      isLoss,
      lossAmount,
    };
  }, [gameState, winTier, winPayout, streak, betMultiplier]); // eslint-disable-line

  const capUsed = useMemo(() => sumSalary(roster), [roster]);

  const lockedSalary = useMemo(
    () => computeLockedSalary(roster, lockedCardIds),
    [roster, lockedCardIds, computeLockedSalary],
  );

  const totalFp = useMemo(() => {
    if (gameState === "REVEALING") return runningTotalFp;
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      const sum = roster.reduce((s, c) => s + Number(c.actualFp ?? 0), 0);
      if (sum > 0) return sum;
      if (isFTUE && ftueLastHandFpRef.current > 0) return ftueLastHandFpRef.current;
      return 0;
    }
    if (gameState === "DEALING" || gameState === "HOLD" || gameState === "DRAWING") {
      return roster.reduce((sum, c) => sum + ((c as any).fp ?? 0), 0);
    }
    return 0;
  }, [gameState, runningTotalFp, roster, isFTUE]);

  const ceilingPct = useMemo(() => {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return null;
    if (!computeRosterCeiling) return null;
    const maxPossible = computeRosterCeiling(roster);
    if (maxPossible <= 0 || totalFp <= 0) return null;
    return Math.min(100, Math.round((totalFp / maxPossible) * 100));
  }, [gameState, roster, totalFp, computeRosterCeiling]);

  // Top Games
  const topGameInfo = useMemo(() => {
    const commentaryRoster = roster.map((c: any) => ({
      name: String(c?.name ?? ""),
      salary: Number(c?.salary ?? 0),
      actualFp: Number(c?.actualFp ?? 0),
      projectedFp: Number(c?.projectedFp ?? 0) || 0,
      cardTier: String(c?.tier ?? ""),
      basePlayerId: String(c?.basePlayerId ?? ""),
      statLine: (c?.statLine ?? {}) as Record<string, any>,
      gameDate: String(c?.gameInfo?.date ?? ""),
    }));
    const star = selectStar(commentaryRoster as any);
    const topGame = (featureFlags.topGames && star?.statLine)
      ? detectTopGame(
          star.statLine as any,
          star.basePlayerId ?? "",
          star.gameDate ?? "",
          star.cardTier ?? "",
          sportKey,
          )
        : { tier: null as null, primaryReason: null, allReasons: [] as any[] };
    return { star, topGame };
  }, [roster, sportKey]);
  topGameInfoHolder.current = topGameInfo;

  const displayFp = computeDisplayFp(totalFp);
  const gaugeTotalFp = displayFp;
  latestGaugeFpRef.current = gaugeTotalFp;

  // postRevealCopy: cache-and-reset pattern.
  // The useMemo computes once when conditions first allow it (RESULTS/
  // WIN_CELEBRATION + winTier + springSettled), then stashes the result
  // in postRevealCopyRef so subsequent renders return the SAME copy
  // (preventing mid-results re-rolls of the random commentary lines).
  // The ref is reset to null on phase changes back to IDLE so the next
  // hand picks fresh copy. If you change the deps array below or the
  // ref-reset point, double-check both: stale-copy bugs are subtle.
  const postRevealCopyRef = useRef<ReturnType<typeof selectCommentary> | null>(null);
  const postRevealCopy = useMemo(() => {
    if (postRevealCopyRef.current) return postRevealCopyRef.current;
    if ((gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") || !winTier || !springSettled) return null;
    if (isFTUE) {
      return null;
    }
    const fp = lockedGaugeFpRef.current ?? displayFp;
    const gaugeSnap = computeGaugeState(fp, gaugeThresholds, winTier, 8);

    const copyInput = {
      totalFp: fp,
      winTier,
      nextTier: gaugeSnap.nextTier,
      tierFloor: gaugeSnap.curMin,
      nextTierMin: gaugeSnap.nextMin > 0 && gaugeSnap.nextMin < 9999 ? gaugeSnap.nextMin : 0,
      roster: roster.map(c => ({
        name: String((c as any).name ?? ""),
        salary: Number((c as any).salary ?? 0),
        actualFp: Number((c as any).actualFp ?? 0),
        projectedFp: Number((c as any).projectedFp ?? 0) || undefined,
        achievements: ((c as any).achievements ?? []) as Array<{ id: string; label: string; icon?: string; fp?: number }>,
        opponent: String((c as any).gameInfo?.opponent ?? ""),
        gameDate: String((c as any).gameInfo?.date ?? ""),
        statLine: ((c as any).statLine ?? {}) as Record<string, any>,
        wasHeld: Boolean((c as any).wasHeld ?? false),
        homeAway: String((c as any).gameInfo?.homeAway ?? "") as "H" | "A" | "",
        cardTier: String((c as any).tier ?? ""),
      })),
      streak,
      prevStreak: winTier === "BUST" ? streak : Math.max(0, streak - 1),
      isBust: winTier === "BUST",
      ceilingPct: ceilingPct ?? undefined,
      isFTUE,
      handCount,
      sport: sportKey,
      topGame: topGameInfo.topGame,
    };

    const copy = selectCommentary(copyInput as any);
    if (!copy?.primary) {
      const fpStr = fp.toFixed(1);
      const staticMap: Record<string, string> = {
        BUST: "Off night. The numbers don't lie.",
        ROOKIE: `${fpStr} on the board. Take it.`,
        STARTER: `${fpStr} — that's a real hand.`,
        ALL_STAR: `${fpStr}. Now we're talking.`,
        MVP: `${fpStr}. That's a number.`,
        LEGEND: `${fpStr}. Insane.`,
      };
      const staticCopy = { primary: staticMap[winTier] ?? staticMap.STARTER, secondary: "" };
      postRevealCopyRef.current = staticCopy;
      return staticCopy;
    }
    postRevealCopyRef.current = copy;
    return copy;
  }, [gameState, winTier, springSettled, displayFp, roster, streak, ceilingPct]); // eslint-disable-line

  const regularFinalGaugeKick = false;

  // Tier result phase
  useEffect(() => {
    if ((gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier) {
      if (isFTUE && ftueTierSlamPlayedRef.current) return;
      if (isFTUE) ftueTierSlamPlayedRef.current = true;
      nearMissChoreTimersRef.current.forEach(clearTimeout);
      nearMissChoreTimersRef.current = [];
      setNearMissTeasing(false);
      setTierResultPhase(1);
      const gaugeSnap = computeGaugeState(totalFp, gaugeThresholds, winTier, NEAR_MISS_FP);
      if (gaugeSnap.isNearMiss && gaugeSnap.nextTier != null) {
        const t1 = setTimeout(() => setNearMissTeasing(true), 400);
        const t2 = setTimeout(() => setNearMissTeasing(false), 1200);
        const t3 = setTimeout(() => setTierResultPhase(2), 1800);
        nearMissChoreTimersRef.current = [t1, t2, t3];
      } else {
        const t = setTimeout(() => setTierResultPhase(2), 1800);
        nearMissChoreTimersRef.current = [t];
      }
      return () => { nearMissChoreTimersRef.current.forEach(clearTimeout); };
    }
  }, [gameState, winTier, isFTUE]); // eslint-disable-line

  const tierFlipTimersRef = useRef<number[]>([]);

  // Reset on state change
  useEffect(() => {
    if (gameState !== "REVEALING" && gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") {
      prevRevealTierRef.current = "BUST";
      setDisplayTier("BUST");
      tierFlipTimersRef.current.forEach(clearTimeout);
      tierFlipTimersRef.current = [];
      cancelAnimationFrame(springRafRef.current);
      springTimersRef.current.forEach(clearTimeout);
      springTimersRef.current = [];
      setSpringFp(null);
      setSpringSettled(false);
      pendingBalanceUpdateRef.current = null;
      lockedGaugeFpRef.current = null;
      springHasFiredRef.current = false;
      frozenBarFpRef.current = null;
      anchorFpCallCountRef.current = 0;
      postRevealCopyRef.current = null;
    }
  }, [gameState]); // eslint-disable-line

  const flippedIds = useMemo(() => {
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") return statsFlippedIds;
    const ids = new Set<string>();
    for (const c of roster) {
      if (flipState.isBack(cardId(c))) ids.add(cardId(c));
    }
    return ids;
  }, [gameState, roster, flipState, statsFlippedIds]);

  const revealingIds = useMemo(() => {
    const ids = new Set<string>();
    if (gameState === "REVEALING") {
      for (const c of roster) {
        const cid = cardId(c);
        const visFp = getVisibleFp(cid);
        if (flipState.isFlipping(cid) || (visFp !== undefined && visFp < Number((c as any).actualFp ?? 0))) {
          ids.add(cid);
        }
      }
    }
    return ids;
  }, [gameState, roster, flipState, getVisibleFp]);

  const displayRoster = roster;

  const visibleFpMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of roster) {
      const fp = getVisibleFp(cardId(c));
      if (fp !== undefined) map.set(cardId(c), fp);
    }
    return map;
  }, [roster, getVisibleFp]);

  const heldCardIds = useMemo(() => {
    if (gameState === "HOLD") return lockedCardIds;
    const held = new Set<string>();
    roster.forEach(c => { if ((c as any).wasHeld) held.add(cardId(c)); });
    return held;
  }, [gameState, roster, lockedCardIds]);

  // ── Handlers ──────────────────────────────────────────────────────
  function toggleLock(cardKey: string) {
    if (gameState !== "HOLD") return;
    if (isFTUE && cardKey !== FTUE_ANCHOR_ID) return;
    if (isFTUE && cardKey === FTUE_ANCHOR_ID && lockedCardIds.has(cardKey)) return;
    setLockedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardKey)) {
        next.delete(cardKey);
        soundManager.playHoldOff();
      } else {
        next.add(cardKey);
        soundManager.playHoldOn();
        const c = roster.find(x => cardId(x) === cardKey);
        if (c) gameAnalytics.cardHeld(c);
      }
      return next;
    });
  }

  function toggleStatsFlip(cardKey: string) {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return;
    if (isFTUE && ftueCardsBlocked) return;
    if (isFTUE && ftueResultsDim && cardKey !== FTUE_ANCHOR_ID) return;
    setStatsFlippedIds(prev => {
      const next = new Set(prev);
      next.has(cardKey) ? next.delete(cardKey) : next.add(cardKey);
      return next;
    });
    if (isFTUE && cardKey === FTUE_ANCHOR_ID) {
      setFtueAnchorFlipped(true);
      setFtueAnchorPulse(false);
    }
  }

  async function onPrimaryAction() {
    if (gameState === "IDLE") {
      if (balance < currentBet) { alert("Insufficient balance!"); return; }
      resetReveal();
      resetAllOverlays();
      completedCardsRef.current = new Set();
      setDisplayTier("BUST");
      setTierResultPhase(1);
      ftueTierSlamPlayedRef.current = false;
      setLockedCardIds(new Set());
      setStatsFlippedIds(new Set());
      setMvpId(undefined);
      setRevealedSalary(0);
      deductedSalaryCardsRef.current = new Set();
      setLastRevealedCardId(null);
      setCelebrationHeld(false);
      setFtueOscillating(false);
      setFtueGaugeOscDone(false);
      setFtueCommentaryDone(false);
      setFtueCommentaryOverride(null);
      setFtueWinCelebrationActive(false);
      setFtueAnchorPulse(false);
      setFtueHoldSpotlight(false);
      pendingCelebration.current = null;
      ftueLastHandFpRef.current = 0;
      const ftueStillActive = (() => {
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get("ftue") === "1") return true;
          if (params.get("skip") === "1") return false;
          if (localStorage.getItem(`replaymod_ftue_${sportKey}`) === "1") return false;
          return true;
        } catch {
          return true;
        }
      })();
      let res: any;
      try {
        res = ftueStillActive ? await ftueDealRoster() : await dealInitialRoster();
      } catch {
        setGameError("Couldn't deal a hand. Tap to try again.");
        setGameState("IDLE");
        return;
      }
      const nextRoster = (res?.roster ?? res?.cards ?? []) as PlayerCard[];
      if (!nextRoster.length) {
        setGameError("Couldn't build a roster. Tap to try again.");
        setGameState("IDLE");
        return;
      }
      setGameError(null);
      rosterRef.current = nextRoster;
      gameAnalytics.handDealt(nextRoster);
      setNoTransition(true);
      flipState.initCards(nextRoster.map(cardId));
      setRoster(nextRoster);
      setGameState("DEALING");
      await sleep(50);
      setNoTransition(false);
      for (const c of nextRoster) flipState.revealCard(cardId(c));
      await sleep(50);
      for (const c of nextRoster) flipState.completeReveal(cardId(c));
      await sleep(400);
      setGameState("HOLD");
      return;
    }

    if (gameState === "HOLD") {
      setBalance(prev => { const next = prev - currentBet; saveBalance(next); return next; });
      setBetNonce(n => n + 1);
      const markedRoster = roster.map(c => ({ ...c, wasHeld: lockedCardIds.has(cardId(c)) }));
      flipState.beginDraw(markedRoster.filter(c => !(c as any).wasHeld).map(cardId));
      setRoster(markedRoster);
      setGameState("DRAWING");
      gameAnalytics.redrawUsed();
      await sleep(DRAWING_DWELL_MS);
      let drawRes: any, resolveRes: any;
      try {
        drawRes = isFTUE
          ? await ftueRedrawRoster({ currentCards: markedRoster, lockedCardIds })
          : await redrawRoster({ currentCards: markedRoster, lockedCardIds });
        const drawnRoster = (drawRes?.roster ?? drawRes?.cards ?? markedRoster) as PlayerCard[];
        resolveRes = isFTUE
          ? await ftueResolveRoster({ finalCards: drawnRoster })
          : await resolveRoster({ finalCards: drawnRoster });
      } catch {
        setGameError("Something went wrong during the draw. Tap to try again.");
        setGameState("HOLD");
        return;
      }
      const drawnRoster = (drawRes?.roster ?? drawRes?.cards ?? markedRoster) as PlayerCard[];
      const finalRoster = (resolveRes?.roster ?? resolveRes?.cards ?? drawnRoster) as PlayerCard[];
      const mvp: string | undefined = resolveRes?.mvpCardId ?? resolveRes?.mvpId;
      if (mvp) setMvpId(mvp);

      const heldSalaryAtDraw = finalRoster.reduce(
        (s, c: any) => c.wasHeld ? s + Number(c.salary ?? 0) : s, 0
      );
      setRevealedSalary(heldSalaryAtDraw);
      deductedSalaryCardsRef.current = new Set();

      rosterRef.current = finalRoster;
      completedCardsRef.current = new Set();
      finalRoster.forEach(c => {
        if ((c as any).wasHeld) {
          completedCardsRef.current.add(cardId(c));
        }
      });
      setNoTransition(true);
      const nonHeldIds = finalRoster.filter(c => !(c as any).wasHeld).map(cardId);
      const heldIds = finalRoster.filter(c => (c as any).wasHeld).map(cardId);
      flipState.initCards(nonHeldIds);
      heldIds.forEach(id => flipState.revealCard(id));
      setTimeout(() => heldIds.forEach(id => flipState.completeReveal(id)), 0);
      setRoster(finalRoster);
      (window as any).debugRoster = finalRoster;
      setStatsFlippedIds(new Set());
      await sleep(50);
      setNoTransition(false);
      await sleep(50);
      setGameState("REVEALING");
      return;
    }

    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      if (isFTUE) {
        try {
          localStorage.setItem(`replaymod_ftue_${sportKey}`, "1");
        } catch { /* ignore */ }
        gameAnalytics.ftueCompleted();
        completeFTUE();
        setFtueCommentaryOverride(null);
        setFtueCommentaryDone(false);
        setFtueWinCelebrationActive(false);
        setFtueReplayReady(false);
        setFtueAnchorFlipped(false);
        setFtueAnchorPulse(false);
        setFtueHoldSpotlight(false);
        setFtueResultsDim(false);
        ftueTierSlamPlayedRef.current = false;
      }
      gameAnalytics.sessionEnd();
      resetReveal();
      resetAllOverlays();
      ftueLastHandFpRef.current = 0;
      setFtueGaugeOscDone(false);
      completedCardsRef.current = new Set();
      setRevealedSalary(0);
      deductedSalaryCardsRef.current = new Set();
      setNoTransition(true);
      const placeholders = createPlaceholders(ROSTER_SIZE);
      flipState.initCards(placeholders.map(cardId));
      setRoster(placeholders);
      rosterRef.current = placeholders;
      setLockedCardIds(new Set());
      setStatsFlippedIds(new Set());
      setMvpId(undefined);
      setWinTier(null);
      setWinPayout(0);
      setGameState("IDLE");
      await sleep(50);
      setNoTransition(false);
    }
  }

  // FTUE: when RESULTS starts, dim non-anchor, fire bubble
  useEffect(() => {
    if (!isFTUE || gameState !== "RESULTS") return;
    setFtueResultsDim(true);
    setStatsFlippedIds(new Set());
    const t = setTimeout(() => setFtueWinCelebrationActive(true), 300);
    return () => {
      setFtueResultsDim(false);
      clearTimeout(t);
    };
  }, [gameState, isFTUE]); // eslint-disable-line

  useEffect(() => {
    if (ftueReplayReady) setFtueResultsDim(false);
  }, [ftueReplayReady]); // eslint-disable-line

  function onWinCelebrationComplete() {
    if (!isFTUE) {
      const next = incrementHandCount();
      if (next >= 3 && !localStorage.getItem("replaymod_name_prompted")) {
        localStorage.setItem("replaymod_name_prompted", "true");
        setTimeout(() => setShowNamePrompt(true), 3500);
      }
    }
    setWinTier(null);
    setWinPayout(0);
    setGameState("RESULTS");
  }

  // wasSkipped state — set on REVEALING skip, read by no consumer today
  // (kept because the setter is invoked in handleButtonClick and removing
  // the state would orphan that side effect; a future PR could replace
  // with a ref if we want to drop the render trigger).
  const [, setWasSkipped] = useState(false);

  function handleButtonClick() {
    if (gameState === "REVEALING") {
      setWasSkipped(true);
      skipReveal();
    }
    else {
      if (gameState === "WIN_CELEBRATION") {
        soundManager.stopBigWin();
      }
      setWasSkipped(false);
      onPrimaryAction();
    }
  }

  // FTUE legendary detection
  useEffect(() => {
    if (!isFTUE || gameState !== "REVEALING") return;
    for (const [cId, tag] of performanceTagMap.entries()) {
      if (tag === "GREAT") {
        const card = rosterRef.current.find(c => cardId(c) === cId);
        if (card && card.name) {
          setLegendaryCardName(card.name);
          break;
        }
      }
    }
  }, [performanceTagMap, gameState, isFTUE]); // eslint-disable-line

  // ── JSX ───────────────────────────────────────────────────────────
  // NOTE: this useMemo MUST stay above the early returns below. React's
  // rules-of-hooks require the same hook-call sequence on every render —
  // if `!dataReady` short-circuits before this useMemo runs, the next
  // render (when dataReady flips true) will call one extra hook and
  // trigger React error #310 ("Rendered more hooks than during the
  // previous render"). Keep all hooks above the conditional returns.
  // Inject getTodaysStars into the GameBar legend (keeps the bonus-pool
  // "Today's Stars" row in sync with the live daily rotation).
  const legendWithStars = useMemo(() => {
    try {
      const stars = getTodaysStars();
      if (stars.length > 0) return { ...gameBarLegend, todaysStars: stars };
    } catch { /* data not loaded yet */ }
    return gameBarLegend;
  }, [gameBarLegend, getTodaysStars]);

  const fullscreenErrorStyle: React.CSSProperties = {
    width: "100vw", height: "100vh", maxHeight: "-webkit-fill-available",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
    color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif", gap: 16,
    textAlign: "center", padding: "0 32px",
  };

  if (gameError && !dataReady) {
    return (
      <div style={fullscreenErrorStyle}>
        <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.5 }}>
          REPLAY <span style={{ color: "#FFB14A" }}>IFS</span>
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", maxWidth: 280 }}>{gameError}</div>
        <button
          onClick={() => { setGameError(null); ensureLoaded().then(() => setDataReady(true)).catch(() => setGameError("Failed to load game data. Check your connection and try again.")); }}
          style={{ marginTop: 8, padding: "10px 24px", background: "#FFB14A", color: "#070A12", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!dataReady) {
    return (
      <div style={fullscreenErrorStyle}>
        <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.5 }}>
          REPLAY <span style={{ color: "#FFB14A" }}>IFS</span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase" }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
      color: "#EAF0FF",
      fontFamily: "'Inter', system-ui, sans-serif",
      userSelect: "none",
      boxSizing: "border-box",
      paddingTop: "env(safe-area-inset-top, 0px)",
    }}>
      {/* ── Transient error banner ── */}
      {gameError && dataReady && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 9999,
          background: "rgba(239,68,68,0.92)", color: "#fff",
          padding: "10px 16px", textAlign: "center",
          fontSize: 13, fontWeight: 600, letterSpacing: 0.2,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
        }}>
          <span>{gameError}</span>
          <button
            onClick={() => setGameError(null)}
            style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", lineHeight: 1 }}
          >✕</button>
        </div>
      )}
      {/* ── Inner game column — 12+54+22+12 = 100dvh ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "hidden",
        overflowX: "hidden",
        width: "100%",
        maxWidth: "min(480px, 100%)",
        margin: "0 auto",
        boxSizing: "border-box",
      }}>

        {/* 1 — Header */}
        <div style={{
          flex: "0 0 10dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 4,
          padding: "0 10px 0",
          boxSizing: "border-box",
          overflow: "hidden",
        }}>
          <div data-ftue-chrome="true" style={{
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
            padding: "2px 12px",
            backdropFilter: "blur(10px)",
          }}>
            <AppHeader
              onCollect={() => setShowCollect(true)}
              onProfile={() => setShowProfile(true)}
              hasUncollected={taskStates.some(t => t.progress >= t.target && !t.collected)}
              unreadInboxCount={unreadCount}
              onBell={() => { setBellOpen(true); track('nav', 'bell_clicked', { unread_count: unreadCount }, 'system'); }}
            />
          </div>
          <div data-ftue-chrome="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px" }}>
            <BonusPoolPill
              betAmount={currentBet}
              betNonce={betNonce}
              sportKey={sportKey}
              onAmountChange={(v) => { bonusPoolRef.current = v; }}
            />
          </div>
        </div>

        {/* 2 — Card stage */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          minHeight: 0,
          maxHeight: 460,
          padding: "4px 1px 2px 1px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}>
          <div
            onClick={gameState === "REVEALING" && (REVEAL_MODE as string) === "auto" ? skipReveal : undefined}
            style={{
              width: "100%",
              height: "100%",
              cursor: gameState === "REVEALING" && (REVEAL_MODE as string) === "auto" ? "pointer" : "default",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <RosterGridScaleFit>
              {rosterGridLayout && <style>{rosterGridLayout.css}</style>}
              {(() => {
                const grid = (
                  <SharedRosterGrid
                    roster={displayRoster}
                    phase={phase}
                    lockedIds={heldCardIds}
                    mvpId={mvpId}
                    flippedIds={flippedIds}
                    revealingIds={revealingIds}
                    noTransition={noTransition}
                    visibleFpMap={visibleFpMap}
                    canFlip={gameState === "RESULTS" || gameState === "WIN_CELEBRATION"}
                    ftueFlipTargetId={isFTUE && (ftueAnchorPulse || ftueHoldSpotlight) ? FTUE_ANCHOR_ID : null}
                    flipMsMap={flipMsMap}
                    fpCountUpMsMap={fpCountUpMsMap}
                    performanceTagMap={performanceTagMap}
                    pulseMap={pulseMap}
                    shakingCardId={shakeInfo?.cardId ?? null}
                    shakeType={shakeInfo?.type ?? null}
                    cardShakeTypeMap={cardShakeTypeMap}
                    visibleBadgesMap={visibleBadgesMap}
                    glowCardId={glowState.cardId}
                    glowTier={glowState.tier}
                    glowDurationMs={glowState.durationMs}
                    isSkipping={isSkipping}
                    activeRevealCardId={activeRevealCardId}
                    onToggleLock={toggleLock}
                    onToggleFlip={toggleStatsFlip}
                    revealMode={REVEAL_MODE}
                    onTapReveal={isFTUE && ftueCardsBlocked ? undefined : tapRevealCard}
                    heldFpVisible={heldFpVisible}
                    heldRevealedIds={heldRevealedIds}
                    tappedCardIds={tappedCardIds}
                    isRevealingPhase={gameState === "REVEALING"}
                    isFTUEHoldPhase={isFTUE && gameState === "HOLD"}
                    isFTUEDrawingPhase={isFTUE && gameState === "DRAWING"}
                    isFTUE={isFTUE && (gameState === "HOLD" || gameState === "DRAWING")}
                    ftueLockedSlot={
                      (isFTUE && ftueResultsDim)
                        ? 2
                        : (isFTUE && (ftueHoldSpotlight || heldCardIds.has(FTUE_ANCHOR_ID)) && gameState === "HOLD")
                          ? 2
                          : null
                    }
                    topGameStarBasePlayerId={topGameInfo.star?.basePlayerId ?? null}
                    topGameTier={topGameInfo.topGame.tier as any}
                    columns={rosterGridColumns}
                    CardComponent={CardComponent as React.ComponentType<RosterGridCardProps>}
                  />
                );
                return rosterGridLayout
                  ? <div className={rosterGridLayout.className}>{grid}</div>
                  : grid;
              })()}
            </RosterGridScaleFit>
          </div>
        </div>

        {/* ── Bottom landscape grid ── */}
        <div style={{
          flex: "0 0 auto",
          display: "grid",
          gridTemplateRows: "72px 4px 14px 8px 0px 4px 96px 2px 74px",
          gridTemplateColumns: "1fr",
          padding: "0 12px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}>

          {/* ROW 1 — Stats row */}
          <div
            {...(isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION")
              ? { "data-ftue-anchor": "ftue-darnit-focus" }
              : {})}
            data-ftue-anchor="score-row"
            onClick={() => {
              if (gameState === "WIN_CELEBRATION" && showRawScore) {
                onWinCelebrationComplete();
                return;
              }
              if (gameState === "WIN_CELEBRATION" && !showRawScore) {
                setShowRawScore(true);
                return;
              }
              if (gameState === "RESULTS" && winTier && !showRawScore) setShowRawScore(true);
            }}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              overflow: "visible",
              position: "relative",
              zIndex: isFTUE ? 1100 : undefined,
              pointerEvents: isFTUE ? "none" as const : "auto" as const,
              cursor:
                (gameState === "WIN_CELEBRATION" ||
                  (gameState === "RESULTS" && winTier && !showRawScore))
                  ? "pointer"
                  : "default",
            }}
          >
            {(gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier && !showRawScore ? (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%", height: "100%" }}>
                {tierResultPhase === 1 && (
                  <>
                    <div
                      key={`flash-${winTier}`}
                      style={{
                        position: "absolute", inset: -40, borderRadius: 30,
                        background: `radial-gradient(ellipse at center, ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).color}44 0%, transparent 70%)`,
                        animation: "tierSlamFlash 600ms ease-out forwards",
                        pointerEvents: "none",
                      }}
                    />
                    <img
                      key={`tier-${winTier}`}
                      src={`${import.meta.env.BASE_URL}${TIER_IMAGE_MAP[winTier] ?? "bust1.png"}`}
                      alt={formatTierLabel(winTier)}
                      style={{
                        maxHeight: 80, maxWidth: "100%", objectFit: "contain",
                        filter: `${TIER_IMAGE_HUE[winTier] ?? ""} drop-shadow(0 0 24px ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).glow})`.trim(),
                        animation: "tierSlam 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    />
                  </>
                )}
                {tierResultPhase === 2 && (() => {
                  const amountWagered = BASE_BET * betMultiplier;
                  const net = winPayout - amountWagered;
                  const netPositive = net > 0;
                  const netColor = netPositive ? "#7FFF00" : "#FF3B30";
                  const netLabel = netPositive ? `+$${net}` : `-$${Math.abs(net)}`;
                  const FF = "'Rajdhani','Oswald','Arial Narrow',sans-serif";
                  return (
                    <>
                      <img
                        key={`tier-stay-${winTier}`}
                        src={`${import.meta.env.BASE_URL}${TIER_IMAGE_MAP[winTier] ?? "bust1.png"}`}
                        alt={formatTierLabel(winTier)}
                        style={{
                          maxHeight: 52, maxWidth: "100%", objectFit: "contain",
                          filter: `${TIER_IMAGE_HUE[winTier] ?? ""} drop-shadow(0 0 12px ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).glow})`.trim(),
                          transform: "scale(0.65)",
                        }}
                      />
                      <div style={{ animation: "tierInfoFadeIn 300ms ease both", display: "flex", justifyContent: "center", alignItems: "center", gap: 20, marginTop: 4, width: "100%" }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: "#FFFFFF", fontFamily: FF, letterSpacing: "-0.5px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                          {displayFp.toFixed(1)} FP
                        </span>
                        {ceilingPct != null && (
                          <span style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.45)", fontFamily: FF, lineHeight: 1, alignSelf: "center" }}>
                            {ceilingPct}% ceiling
                          </span>
                        )}
                        <span style={{ fontSize: 20, fontWeight: 700, color: netColor, fontFamily: FF, letterSpacing: "-0.5px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                          {netLabel}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", alignItems: "center", gap: 4, paddingTop: 10, width: "100%", height: "100%", overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 48, width: "100%" }}>
                  {(() => {
                    const spent =
                      gameState === "IDLE" ? 0 :
                        gameState === "DEALING" ? 0 :
                          gameState === "HOLD" ? lockedSalary :
                            gameState === "DRAWING" ? lockedSalary :
                              gameState === "REVEALING" ? revealedSalary :
                                capUsed;
                    const remaining = CAP_MAX - spent;
                    const overBudget = remaining < 0;
                    return (
                      <>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 26, fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: -1, fontStyle: "italic" }}>
                            <RollingNumber value={totalFp} decimals={1} duration={300} />
                          </div>
                          <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginTop: 2 }}>
                            Team FP
                          </div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 2, justifyContent: "center" }}>
                            <span style={{ fontSize: 26, fontWeight: 900, color: overBudget ? "#ef4444" : "#FFFFFF", lineHeight: 1, fontStyle: "italic" }}>
                              <RollingNumber value={remaining} decimals={0} duration={300} />
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.35)", lineHeight: 1, fontStyle: "italic" }}>
                              /{CAP_MAX}
                            </span>
                          </div>
                          <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginTop: 2 }}>
                            Budget
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
                {gameState === "HOLD" && !isFTUE && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                    <span style={{ fontSize: 16, fontWeight: 400, color: "rgba(255,255,255,0.5)", lineHeight: 1 }}>
                      {BASE_BET} × {betMultiplier}x =
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1, color: betMultiplier === 1 ? "#22C55E" : betMultiplier === 3 ? "#3B82F6" : betMultiplier === 5 ? "#C084FC" : betMultiplier === 10 ? "#FB923C" : "rgba(255,255,255,0.35)" }}>
                      ${BASE_BET * betMultiplier}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* GAP */}<div />

          {/* ROW 3-7 — Tier gauge */}
          <div
            data-ftue-anchor="tier-gauge"
            style={{
              gridRow: "3 / 8",
              gridColumn: "1",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              overflow: "visible",
              zIndex: isFTUE ? 1100 : undefined,
              pointerEvents: isFTUE ? "none" as const : "auto" as const,
            }}
          >
            <TierGauge
              totalFp={gaugeTotalFp}
              thresholds={gaugeThresholds}
              winTier={undefined}
              lastCardFp={lastCardFp}
              isSkip={false}
              visible
              ftueSuppressNormal={false}
              ftueOscillate={false}
              ftueLockStaticBar={false}
              regularFinalCardKick={regularFinalGaugeKick}
              onTierCross={undefined}
              postRevealCopy={postRevealCopy}
              ftueTypewriter={isFTUE}
              stickyLastOverride={isFTUE && ftueReplayReady}
              commentaryOverride={(showCollect || showLeaderboard || showProfile) ? null : ftueCommentaryOverride}
              hideBar={gameState === "IDLE" || gameState === "DEALING" || gameState === "HOLD" || gameState === "DRAWING"}
              onCommentaryOverrideDone={() => {
                setFtueCommentaryOverride(null);
                coachDismissRef.current?.();
              }}
              onCommentaryDone={() => {
                if (isFTUE) {
                  setFtueCommentaryDone(true);
                }
              }}
              onFtueOscillateComplete={() => {
                setFtueGaugeOscDone(true);
                setFtueOscillating(false);
                setCelebrationHeld(false);
                pendingCelebration.current = null;
                setGameState("RESULTS");
                setTimeout(() => setFtueWinCelebrationActive(true), 300);
              }}
            />
          </div>

          {/* Multiplier host */}
          <div
            ref={(el) => setMultipliersHost(el)}
            style={{
              gridRow: "7",
              gridColumn: "1",
              display: isPreRevealFooter ? "flex" : "none",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              pointerEvents: "auto",
              zIndex: 10,
            }}
          />

          {/* GAP */}<div style={{ gridRow: "8" }} />

          {/* ROW 9 — Action row */}
          <div
            style={{
              gridRow: "9",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              minHeight: 0,
              overflow: "visible",
              boxSizing: "border-box",
            }}
          >
            <div
              ref={(el) => setControlsHost(el)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                minHeight: 0,
                paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <CoachLayer
                isFTUE={isFTUE}
                gameState={gameState}
                lockedCount={lockedCardIds.size}
                revealIndex={revealIndex}
                legendaryCardName={legendaryCardName}
                lastRevealedCardId={lastRevealedCardId}
                ftueAnchorFlipped={ftueAnchorFlipped}
                ftueTextConfig={ftueTextConfig}
                onCoachBubbleKey={(key) => {
                  setFtueCoachBubbleKey(key);
                  // CoachLayer emits "hold_<anchorSuffix>" — basketball anchor
                  // "ftue-tatum" → "hold_tatum"; baseball "ftue-ohtani" →
                  // "hold_ohtani". Use the derived anchor key so the side
                  // effect fires for both sports.
                  const holdKey = `hold_${FTUE_ANCHOR_ID.replace(/^ftue-/, "")}`;
                  if (key === holdKey) setFtueHoldSpotlight(true);
                }}
                onResumeHeldReveal={() => {
                  const resume = heldRevealResumeRef.current;
                  heldRevealResumeRef.current = null;
                  resume?.();
                }}
                onCelebrationReady={() => {
                  if (!isFTUE) {
                    setCelebrationHeld(false);
                    if (pendingCelebration.current) {
                      pendingCelebration.current = null;
                      setGameState("WIN_CELEBRATION");
                    }
                  }
                }}
                onBubbleActive={(active) => setFtueCardsBlocked(active)}
                ftueWinCelebrationActive={ftueWinCelebrationActive}
                ftueCommentaryDone={ftueCommentaryDone}
                onCommentaryText={(parts, sticky) => setFtueCommentaryOverride(parts ? { parts, sticky } : null)}
                dismissRef={coachDismissRef}
                onReplayReady={() => setFtueReplayReady(true)}
                onFtueReadyToFlip={() => setFtueAnchorPulse(true)}
                onFtueAnchorHeld={() => { /* draw pulse handled inside CoachLayer */ }}
                onFtueAllDone={() => {
                  setFtueResultsDim(false);
                }}
                onReplay={() => {
                  completeFTUE();
                  setFtueCommentaryOverride(null);
                  setFtueCommentaryDone(false);
                  setFtueWinCelebrationActive(false);
                  setLastRevealedCardId(null);
                  setCelebrationHeld(false);
                  setFtueCardsBlocked(false);
                  setFtueReplayReady(false);
                  setFtueAnchorFlipped(false);
                  setFtueAnchorPulse(false);
                  setFtueHoldSpotlight(false);
                  setFtueGaugeOscDone(false);
                  ftueTierSlamPlayedRef.current = false;
                  pendingCelebration.current = null;
                  heldRevealResumeRef.current = null;
                  setTimeout(() => handleButtonClick(), 0);
                }}
              />
              {showCollect && !isFTUE && (
                (() => {
                  const bonusPlayers = getTodaysStars();
                  return (
                    <CollectScreen
                      taskStates={taskStates}
                      weeklyTaskStates={weeklyTaskStates}
                      perpetualTaskStates={perpetualTaskStates}
                      loginStreak={loginStreak}
                      coins={coins}
                      xp={xp}
                      streakCount={streakCount}
                      bonusPlayers={bonusPlayers}
                      onViewLeaderboard={() => {
                        setShowCollect(false);
                        setShowLeaderboard(true);
                      }}
                      recordLeaderboardViewed={recordLeaderboardViewed}
                      onClose={() => setShowCollect(false)}
                      onCollect={(id) => { collectTask?.(id); }}
                    />
                  );
                })()
              )}
              {/* Name change prompt — after hand 3 */}
              {showNamePrompt && (
                <div style={{
                  position: "fixed", inset: 0, zIndex: 9999,
                  background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center",
                }} onClick={() => setShowNamePrompt(false)}>
                  <div onClick={e => e.stopPropagation()} style={{
                    background: "#111827", borderRadius: 16, padding: "24px 20px",
                    width: "min(320px, 90vw)", display: "flex", flexDirection: "column", gap: 12,
                    border: "1px solid rgba(255,215,0,0.2)",
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#EAF0FF" }}>
                      Want to save your results? You're currently listed as:
                    </div>
                    <input
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      maxLength={20}
                      style={{
                        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                        borderRadius: 8, padding: "10px 12px", color: "#FFD700", fontSize: 16, fontWeight: 700,
                        outline: "none", width: "100%", boxSizing: "border-box",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => {
                        setNickname(nameInput);
                        setShowNamePrompt(false);
                      }} style={{
                        flex: 1, padding: "10px 0", background: "rgba(255,215,0,0.85)", color: "#070A12",
                        border: "none", borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: "pointer",
                      }}>Change Name</button>
                      <button onClick={() => setShowNamePrompt(false)} style={{
                        flex: 1, padding: "10px 0", background: "rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer",
                      }}>Use This Name</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>{/* close bottom landscape wrapper */}

      </div>

      {/* Portals only — sibling of inner column */}
      <SharedGameBar
        gameState={gameState}
        balance={balance}
        isBalanceAnimating={isBalanceAnimating}
        totalFp={totalFp}
        lastCardProgress={lastCardProgress}
        lastCardFp={lastCardFp}
        capMax={CAP_MAX}
        capUsed={capUsed}
        lockedSalary={lockedSalary}
        revealedSalary={revealedSalary}
        betMultiplier={betMultiplier}
        baseBet={BASE_BET}
        winTiers={gameBarWinTiers}
        legend={legendWithStars}
        hideTierBar
        onBetMultiplier={setBetMultiplier}
        onAction={handleButtonClick}
        celebration={celebrationData}
        onWinCelebrationComplete={onWinCelebrationComplete}
        onWageAnimationComplete={() => {
          pendingBalanceUpdateRef.current?.();
          pendingBalanceUpdateRef.current = null;
          if (isFTUE) {
            setTimeout(() => {
              setFtueWinCelebrationActive(true);
              setFtueCommentaryDone(true);
            }, 800);
          }
        }}
        ftueDrawBlocked={isFTUE && gameState === "HOLD" && !heldCardIds.has(FTUE_ANCHOR_ID)}
        ftueHideSkip={isFTUE}
        ftueHideBalance={isFTUE && (gameState === "IDLE" || gameState === "DEALING" || gameState === "HOLD")}
        ftuePulseNearMiss={isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && !ftueGaugeOscDone}
        ftueReplayBlocked={isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && !ftueReplayReady}
        ftueReplayPulse={(isFTUE && ftueReplayReady) || (!isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && springSettled)}
        dataFtuePrimaryAnchor={isFTUE ? (gameState === "HOLD" ? "draw" : "deal") : undefined}
        splitFooter={{ multipliersHost, controlsHost }}
        splitMultiplierRowVisible={isPreRevealFooter && !isFTUE}
        onViewLeaderboard={() => {
          setShowLeaderboard(true);
          setTrophyPulsing(false);
          setFtueCommentaryOverride(null);
        }}
        legendPulsing={legendGold && !isFTUE}
        trophyPulsing={trophyPulsing && !isFTUE}
        streak={streak}
        onLegendOpened={() => {
          const today = new Date().toISOString().slice(0, 10);
          localStorage.setItem("replaymod_legend_seen_date", today);
          setLegendGold(false);
        }}
        onTrophyOpened={() => {
          setTrophyPulsing(false);
        }}
      />

      {showLeaderboard && !isFTUE && (
        <LeaderboardScreen
          currentUid={getPlayerUid()}
          sport={leaderboardScope as "basketball" | "baseball" | "worldcup"}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {bellOpen && user && (
        <BellSheet
          userId={user.id}
          onClose={() => setBellOpen(false)}
          onViewAll={() => setShowProfile(true)}
        />
      )}

      {showProfile && (
        <ProfileScreen
          currentUid={getPlayerUid()}
          sport={leaderboardScope}
          onClose={() => setShowProfile(false)}
          isAnonymous={isAnonymous}
          onSaveAccount={() => {
            track("auth", "signup_modal_shown", { trigger: "profile_button", hand_number: handCount });
            setShowProfile(false);
            setShowRegisterModal(true);
          }}
          onOpenFeedback={() => setFeedbackOpen(true)}
        />
      )}

      {feedbackOpen && user && (
        <FeedbackModal
          userId={user.id}
          onClose={() => setFeedbackOpen(false)}
          metadata={{ sport: sportKey }}
        />
      )}

      {/* PWA install prompt */}
      {!isFTUE && (gameState === "IDLE" || gameState === "RESULTS") && (
        <PwaInstallPrompt active={handCount >= 3} />
      )}

      {/* Registration modal */}
      {showRegisterModal && (
        <RegisterModal
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => setShowRegisterModal(false)}
          signUp={signUp}
          linkGoogle={linkGoogle}
          signIn={signIn}
          signInGoogle={signInGoogle}
        />
      )}

      {/* PostHandSheet — optional, sport-specific overlay */}
      {PostHandSheet && !isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier && springSettled && (() => {
        const gaugeSnap = computeGaugeState(displayFp, gaugeThresholds, winTier, NEAR_MISS_FP);
        return (
          <PostHandSheet
            totalFp={displayFp}
            winTier={winTier}
            isBust={winTier === "BUST"}
            nearMissGap={gaugeSnap.isNearMiss && gaugeSnap.nextTier ? Math.max(0, gaugeSnap.nextMin - displayFp) : 0}
            nearMissNextTier={gaugeSnap.isNearMiss ? gaugeSnap.nextTier : null}
            winPayout={winPayout}
            currentUid={getPlayerUid()}
            onPlayAgain={handleButtonClick}
            onViewLeaderboard={() => setShowLeaderboard(true)}
          />
        );
      })()}

    </div>
  );
}
