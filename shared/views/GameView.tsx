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
  lazy,
  Suspense,
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
import { commitRound } from "./_roundMachine";
import { boundedPersist } from "./_persistLock";
import type { GameAdapter } from "./GameAdapter";
import type { GamePhase, PlayerCard } from "@shared/types";
import type { WinTierKey } from "@shared/utils/payoutLogic";
import {
  RosterGrid as SharedRosterGrid,
  type RosterGridCardProps,
} from "@shared/components/RosterGrid";
import { AppHeader } from "@shared/components/AppHeader";
import { PLATINUM_BAND_GRADIENT } from "@shared/components/platinumBand";
import { useCardFlipState } from "@shared/hooks/useCardFlipState";
import { useBossEntry } from "@shared/hooks/useBossEntry";
import { BossEntryCta } from "@shared/components/BossEntryCta";
import {
  useEmotionalReveal,
  DRAWING_DWELL_MS,
} from "@shared/hooks/useEmotionalReveal";
import { GameBar as SharedGameBar, type CelebrationData } from "@shared/components/GameBar";
import { featureFlags } from "@shared/featureFlags";
import { selectCommentary } from "@shared/commentary/selectCommentary";
import { evaluateTrigger } from "@shared/utils/triggerEvaluation";
import { detectTopGame } from "@shared/data/recordDetector";
import { selectStar } from "@shared/commentary/storySelector";
import { useGameAnalytics } from "@shared/analytics/useGameAnalytics";
import { track } from "@shared/analytics/analytics";
// Lazy-load CollectScreen — only renders when showCollect is true (post-hand
// rewards). Saves ~30-50 KB from the initial bundle for the most common
// path (no rewards yet).
const CollectScreen = lazy(() =>
  import("@shared/engagement/CollectScreen").then(m => ({ default: m.CollectScreen }))
);
import { TierGauge, computeGaugeState } from "@shared/components/TierGauge";
import { TeamStamp } from "@shared/components/TeamStamp";
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
// Lazy-load all the conditional overlays — they only mount when their
// respective open flags fire, which is rare on first paint. Code-splitting
// these is the biggest single Lighthouse perf win available without
// touching the game core. Each named-export wrapper below converts the
// dynamic import's namespace to the { default } shape lazy() expects.
const LeaderboardScreen = lazy(() =>
  import("@shared/components/LeaderboardScreen").then(m => ({ default: m.LeaderboardScreen }))
);
const ProfileScreen = lazy(() =>
  import("@shared/components/ProfileScreen").then(m => ({ default: m.ProfileScreen }))
);
const RegisterModal = lazy(() =>
  import("@shared/components/RegisterModal").then(m => ({ default: m.RegisterModal }))
);
const PwaInstallPrompt = lazy(() =>
  import("@shared/components/PwaInstallPrompt").then(m => ({ default: m.PwaInstallPrompt }))
);
const BellSheet = lazy(() =>
  import("@shared/inbox/BellSheet").then(m => ({ default: m.BellSheet }))
);
const FeedbackModal = lazy(() =>
  import("@shared/inbox/FeedbackModal").then(m => ({ default: m.FeedbackModal }))
);
const ChallengeSharePrompt = lazy(() =>
  import("@shared/components/ChallengeSharePrompt").then(m => ({ default: m.ChallengeSharePrompt }))
);
const ChallengeComparisonScreen = lazy(() =>
  import("@shared/components/ChallengeComparisonScreen").then(m => ({ default: m.ChallengeComparisonScreen }))
);
const ChallengePostResultBar = lazy(() =>
  import("@shared/components/ChallengePostResultBar").then(m => ({ default: m.ChallengePostResultBar }))
);
const H2HRecipientReveal = lazy(() =>
  import("@shared/components/H2HRecipientReveal").then(m => ({ default: m.H2HRecipientReveal }))
);
const H2HSenderReveal = lazy(() =>
  import("@shared/components/H2HSenderReveal").then(m => ({ default: m.H2HSenderReveal }))
);
// (ChallengeDebugPanel is mounted at the basketball app-shell level so
// it surfaces on every route including the chooser landing before this
// component mounts. Imported there, not here.)
const NotificationsPanel = lazy(() =>
  import("@shared/components/NotificationsPanel").then(m => ({ default: m.NotificationsPanel }))
);
import { chadMessage } from "@shared/commentary/chad";
import {
  chadChallengeIntro,
  chadChallengeTactical,
  chadNormalPlayWelcome,
  chadRivalryBackIntro,
  selectTopSlotFraming,
} from "@shared/commentary/chadChallenge";
import type { TopSlotTrigger } from "@shared/commentary/chadChallenge";
import { isRealName } from "@shared/utils/isRealName";
import { useAuth } from "@shared/auth/useAuth";
import { listMessages } from "@shared/inbox/inbox";
import { useChallengeNotifications, type ChallengeNotification } from "@shared/hooks/useChallengeNotifications";
import { ensureLoaded } from "@shared/engines/dataEngine";
import { supabase } from "@shared/lib/supabase";

// ── Reveal mode toggle ─────────────────────────────────────────────────────
// "auto" = cards flip automatically in sequence (original behaviour)
// "tap"  = user taps each unheld card to reveal it; held FP fades in at end
const REVEAL_MODE: "auto" | "tap" = "tap";

const BASE_BET = 10;

// Phase 1 trigger split (2026-06-03, docs/challenge-landing-v2-phase1-
// trigger-split-lock.md): the post-reveal "missed X by Y" copy and the
// near-miss teasing animation now read off the same 5% of next tier's
// minFp window that emits the MISS stamp (triggerEvaluation.MISS_PCT_OF_
// NEXT_MIN). Was flat 5 FP. Tier-aware so near LEGEND (235 minFp → 11.75
// FP band) and near ALL-STAR (155 minFp → 7.75 FP band) both surface the
// "almost there" framing on the same threshold the stamp uses — no
// "stamp fired but copy didn't" contradiction. TierGauge's spring stays
// at flat 8 FP (NEAR_MISS_PTS) — that's a hand-tuned visual magnitude
// and a deliberate divergence (see TierGauge.tsx:111).
const NEAR_MISS_BAND: { pctOfNextMin: number } = { pctOfNextMin: 5 };

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

function BonusPoolPill({ betAmount, betNonce, onAmountChange, sportKey, competition, economyEnabled = true }: {
  betAmount: number;
  betNonce: number;
  onAmountChange?: (v: number) => void;
  sportKey: string;
  competition?: string;
  /** When false, the 5% rake accrual is paused — the contributeBet call (and its
   *  local animation) are skipped. Decouples the rake from the Pill render: even
   *  if the Pill is rendered, the rake stays off when the economy is off. Default
   *  true ⇒ rake live (baseball/football). */
  economyEnabled?: boolean;
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
        const pool = await getBonusPool(sportKey, competition);
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

  // 5% rake on every bet — push to server, animate locally for feedback.
  // Decoupled from the Pill render: when the economy is off the rake never
  // accrues (no contributeBet, no animation), regardless of whether the Pill is
  // mounted. This is the call-site guard — the render gate at the call site only
  // HIDES the surface; this is what stops the rake.
  useEffect(() => {
    if (!economyEnabled) return;
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
        const next = await contributeBet(sportKey, betAmount, competition);
        setAmount(next);
        onAmountChange?.(next);
      } catch {
        setAmount(endVal);
        onAmountChange?.(endVal);
      }
    })();

    return () => cancelAnimationFrame(rafRef.current);
  }, [betNonce, economyEnabled]); // eslint-disable-line

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
  challengeCtx?: import("@shared/adapters/challengeTypes").ChallengeCtx;
  /** Rivalry-continuation context. When set, the fresh hand that the user
   *  is about to play is the result of a win-state "Send It Back" — the
   *  share prompt auto-fires at RESULTS framed as a back-challenge. */
  challengeBackCtx?: import("@shared/adapters/challengeTypes").ChallengeBackCtx;
  /** Clears challengeCtx in the parent. Called from comparison-sheet
   *  Dismiss / "Play your own hand" / "Send It Back" (which then
   *  installs challengeBackCtx via the setter below). */
  clearChallengeCtx?: () => void;
  /** Installs challengeBackCtx in the parent. Called from win-state
   *  "Send It Back" to mark the upcoming fresh hand as a return-fire. */
  setChallengeBackCtx?: (ctx: import("@shared/adapters/challengeTypes").ChallengeBackCtx) => void;
  /** Clears challengeBackCtx once the rivalry-continuation hand resolves
   *  + the user shares or dismisses. */
  clearChallengeBackCtx?: () => void;
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

/** OAuth-resume race guard (build lock: docs/locks/oauth-resume-sender-
 *  confirmation-lock.md, rev 3). Presence-only check for the
 *  ResumeShareSurface sessionStorage payload — does NOT parse, does NOT
 *  import the parser, does NOT touch the key constant from
 *  ResumeShareSurface (the key string is duplicated here intentionally so
 *  this gate has no dependency on the resume-surface module). True while
 *  a post-OAuth-redirect challenge create is queued; the auth nudges
 *  below skip entirely so they don't race the brief
 *  first-render→INITIAL_SESSION window where isAnonymous is transiently
 *  true on the rebuilt React tree. ResumeShareSurface clears the key in
 *  its `finally` block after a successful POST, after which the next
 *  IDLE re-evaluates the nudges normally. */
function hasPendingResumeShare(): boolean {
  try {
    return typeof window !== "undefined"
      && window.sessionStorage.getItem("replaymod_pending_challenge_share_v1") !== null;
  } catch {
    return false;
  }
}

export function GameView({ adapter, challengeCtx, challengeBackCtx, clearChallengeCtx, setChallengeBackCtx, clearChallengeBackCtx }: Props) {
  const {
    sportKey,
    sportAdapter,
    leaderboardScope,
    gaugeThresholds,
    calculateWinTier,
    calculatePayoutWithStreak,
    winTiersMap,
    getStreakMultiplier,
    streakTiers,
    gameBarWinTiers,
    gameBarLegend,
    dealInitialRoster,
    redrawRoster,
    resolveRoster,
    getTodaysStars,
    computeRosterCeiling,
    CardComponent,
    rosterGridColumns,
    rosterGridLayout,
    slotLabels,
    resetAllOverlays,
    ftueTextConfig,
    PostHandSheet,
    SlateChipComponent,
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
  // Phase 2-mount Step 3/4: today's boss for the post-results entry CTA.
  // Basketball-only inside the hook; null elsewhere → CTA never renders.
  const bossEntry = useBossEntry(sportKey);
  const {
    gameState, setGameState,
    roundsUsed, setRoundsUsed,
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
    currentHandIdRef,
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
    ftueCommentaryOverride, setFtueCommentaryOverride,
    incrementHandCount,
    newlyUnlockedAchievements,
    clearNewlyUnlockedAchievements,
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
  // OAuth-resume race guard — belt-and-suspenders companion to
  // `hasPendingResumeShare()`. The auth-nudge useCallback below
  // (tryOpenAuthModal) schedules a delayed setShowRegisterModal(true);
  // its own deps don't include isAnonymous (intentional — re-creating
  // the callback on every auth state would invalidate the nudge effect
  // gates), so the setTimeout closure reads `isAnonymousRef.current` at
  // fire time to catch the case where INITIAL_SESSION lands AFTER the
  // timer was scheduled but BEFORE it fires.
  const isAnonymousRef = useRef(isAnonymous);
  useEffect(() => { isAnonymousRef.current = isAnonymous; }, [isAnonymous]);
  const [bellOpen, setBellOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  // Notification panel state + hook. Anonymous users skip the fetch
  // entirely (the RLS policy would return nothing anyway).
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifRefreshNonce, setNotifRefreshNonce] = useState(0);
  // Phase 5b commit 3 (2026-05-28): when set, the sender-side H2H
  // surface mounts for this notification. Replaces today's win-path
  // (set challengeBackCtx + deal-fresh) AND loss-path (dismiss-only)
  // routing in the notification tap handler — both paths now mount the
  // wrapper. The placeholder CTA's challengeBackCtx-setting (preserved
  // for is_winner=true only per Strategy A) moves into the CTA handler.
  const [senderRevealNotification, setSenderRevealNotification] = useState<ChallengeNotification | null>(null);
  const {
    notifications: challengeNotifications,
    unreadCount: challengeUnreadCount,
    markAllRead: markNotificationsRead,
  } = useChallengeNotifications({
    enabled: !!user && !isAnonymous,
    refreshNonce: notifRefreshNonce,
  });
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [bigWinFired, setBigWinFired] = useState(false);
  const [challengeTrigger, setChallengeTrigger] = useState<import("@shared/utils/triggerEvaluation").TriggerResult | null>(null);
  // TOP-slot snapshot of the last non-null challengeTrigger for the
  // current hand. Survives the ChallengeSharePrompt dismiss handler's
  // setChallengeTrigger(null) (~L2995) so the TOP-slot bank line
  // continues to render after the prompt is dismissed (Finding A fix,
  // 2026-05-25). Synced inside the postRevealCopy useMemo so reads are
  // current with the latest hand's trigger. Cleared at hand-start
  // alongside other hand-scoped refs.
  //
  // Other surfaces (panel TeamStamp, missTier props on TierGauge /
  // TeamStamp) intentionally keep reading the live challengeTrigger
  // and continue clearing on dismiss — that's pre-bucket-2 behavior
  // and we preserve it scope-strict. The cascade impact on those
  // surfaces is inferred from code reading, not observed; tracked
  // in docs/open-followups.md as "Inferred dismissal cascade on panel
  // TeamStamp / missTier surfaces".
  const topSlotTriggerRef = useRef<import("@shared/utils/triggerEvaluation").TriggerResult | null>(null);
  // Imperative handle to the invisible sender ChallengeSharePrompt, so GameBar's
  // "Challenge" button can start a send (challengeSendRef.current?.startSend()).
  const challengeSendRef = useRef<import("@shared/components/ChallengeSharePrompt").ChallengeSendHandle | null>(null);
  const [showChallengeComparison, setShowChallengeComparison] = useState(false);
  // Sheet visibility split into "mounted" (showChallengeComparison) vs
  // "rendered on-screen" (!comparisonCollapsed). Dismiss gestures toggle
  // collapsed; the sheet stays mounted so attempt POST fires only once.
  const [comparisonCollapsed, setComparisonCollapsed] = useState(false);
  // Mirrored from the sheet via onResolved so the post-result action
  // bar + trash-talk chip have the same state without rerunning the
  // attempt POST. Cleared when the user enters a fresh hand.
  const [postResultState, setPostResultState] = useState<"WIN" | "LOSS_OPEN" | "LOSS_CLOSED" | null>(null);
  const [postResultTrashTalk, setPostResultTrashTalk] = useState<string | null>(null);
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
  const initialRosterRef = useRef<import("@shared/types/index").GeneratedCard[]>([]);
  /** Legend icon gold-filled when pre-game msg is active OR daily bonus unseen */
  const [legendGold, setLegendGold] = useState(() => {
    if (typeof window === "undefined") return false;
    const today = new Date().toISOString().slice(0, 10);
    const seenToday = localStorage.getItem("replaymod_legend_seen_date") === today;
    const introSeen = localStorage.getItem(`replaymod_pregame_intro_${sportKey}`) === "1";
    return !seenToday || !introSeen;
  });
  const [trophyPulsing, setTrophyPulsing] = useState(false);
  const [trophyBurst, setTrophyBurst] = useState(false);
  // Tick bumped by _useReveal after checkLeaderboardRank's localStorage
  // write completes. Wired into the trophy-burst edge-detect effect's
  // deps so the effect re-evaluates same-hand on the write, instead of
  // waiting for the next gameState/handCount transition.
  const [onBoardTick, setOnBoardTick] = useState(0);

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
    if (gameState !== "IDLE") return;
    if (localStorage.getItem(`replaymod_pregame_intro_${sportKey}`) === "1") return;
    // Challenge acceptors get their own intro chip instead. Skip firing
    // the welcome HERE, but leave the flag alone — when they later play
    // a fresh non-challenge hand, the welcome should fire normally.
    if (challengeCtx) return;
    localStorage.setItem(`replaymod_pregame_intro_${sportKey}`, "1");
    chadFiredThisIdleRef.current = true;
    setLegendGold(true);
    setFtueCommentaryOverride({ parts: [chadMessage("welcome")], sticky: true });
  }, [gameState]); // eslint-disable-line

  // ── Challenge mode: auto-deal on accept + intro chip ──
  // Accept Challenge → instant deal. No DEAL button tap required.
  const challengeAutoDealtRef = useRef(false);
  // Explicit "the next IDLE deal should use challengeCtx.initialRoster"
  // intent. Set true at the two points that legitimately want the
  // challenge snapshot replayed: the Accept auto-deal (below) and the
  // "Try Again" buttons on the comparison sheet + post-result action
  // bar. The IDLE branch of onPrimaryAction reads this and resets it.
  //
  // Without an explicit intent, `if (challengeCtx)` alone misroutes
  // any post-dismiss DEAL tap (e.g. the main GameBar's button while
  // the post-result action bar is hidden, or the user tapping
  // through after the API failed to produce postResultState) back
  // into the challenge snapshot. Stale challengeCtx is cleared in
  // the IDLE branch when this flag is false.
  const challengeNextDealRef = useRef(false);
  useEffect(() => {
    if (!challengeCtx) { challengeAutoDealtRef.current = false; return; }
    if (challengeAutoDealtRef.current) return;
    if (gameState !== "IDLE") return;
    challengeAutoDealtRef.current = true;
    challengeNextDealRef.current = true;
    void onPrimaryAction();
  }, [challengeCtx, gameState]); // eslint-disable-line

  // Challenge intro chip: fires once when the deal lands in HOLD. Persists
  // until the user touches a card (first hold). Sets sticky chad commentary
  // with target FP + challenger name so the recipient knows the bar to beat.
  const challengeIntroShownRef = useRef(false);
  useEffect(() => {
    if (!challengeCtx) { challengeIntroShownRef.current = false; return; }
    if (challengeIntroShownRef.current) return;
    if (gameState !== "HOLD") return;
    challengeIntroShownRef.current = true;
    // Trash-talk-energy chip: randomized bank, no instructional copy.
    // Hold/redraw mechanic teaches itself via the UI affordances.
    const namedChallenger = isRealName(challengeCtx.challengerName)
      ? challengeCtx.challengerName
      : null;
    const introLine = chadChallengeIntro({
      challengerName: namedChallenger,
      targetScore: challengeCtx.targetScore,
    });
    setFtueCommentaryOverride({ parts: [introLine], sticky: true });
  }, [challengeCtx, gameState]); // eslint-disable-line

  // Dismiss the challenge intro chip on first card interaction (any hold)
  // or any state transition past HOLD.
  useEffect(() => {
    if (!challengeIntroShownRef.current) return;
    if (lockedCardIds.size > 0 || (gameState !== "HOLD" && gameState !== "IDLE")) {
      setFtueCommentaryOverride(null);
    }
  }, [lockedCardIds, gameState]); // eslint-disable-line

  // [Chad:rivalry-back] Fresh-hand intro chip after Send-It-Back.
  // Mirrors the incoming-challenge intro pattern (chip lands at HOLD,
  // dismisses on first card interaction) but framing flips outbound:
  // "this hand is going back to {name}". Distinguishing signal is
  // challengeBackCtx (rivalry continuation) being set with no inbound
  // challengeCtx — the user just left a win and is on a fresh deal.
  const rivalryBackChipFiredRef = useRef(false);
  useEffect(() => {
    if (!challengeBackCtx || challengeCtx) {
      rivalryBackChipFiredRef.current = false;
      return;
    }
    if (rivalryBackChipFiredRef.current) return;
    if (gameState !== "HOLD") return;
    rivalryBackChipFiredRef.current = true;
    const namedChallenger = isRealName(challengeBackCtx.challengerName)
      ? challengeBackCtx.challengerName
      : null;
    const line = chadRivalryBackIntro({ challengerName: namedChallenger });
    setFtueCommentaryOverride({ parts: [line], sticky: true });
  }, [challengeBackCtx, challengeCtx, gameState]); // eslint-disable-line
  // Dismiss on first hold or past-HOLD transition (same gate as the
  // inbound intro chip).
  useEffect(() => {
    if (!rivalryBackChipFiredRef.current) return;
    if (lockedCardIds.size > 0 || (gameState !== "HOLD" && gameState !== "IDLE")) {
      setFtueCommentaryOverride(null);
    }
  }, [lockedCardIds, gameState]); // eslint-disable-line

  // ── Attention-surface mutex (single lock, all auto-fired surfaces) ──
  //
  // The post-resolve / IDLE moment can trigger several "demand attention"
  // surfaces from independent effects on the same render flush:
  //   - chad sticky commentary (ftueCommentaryOverride)
  //   - RegisterModal (Google auth + email save)
  //   - showNamePrompt (save-nickname overlay, hand >= 3)
  //   - PwaInstallPrompt (handCount >= 3 idle bottom-sheet)
  // Without serialization they stack on the same emotional beat ("two
  // notifications competing for the same moment").
  //
  // Single attention lock — generalises the per-pair mutex shipped in PR #23.
  // Any auto-fired surface MUST tryClaimAttention(name) before opening; if
  // the lock is held by another surface, the trigger early-returns WITHOUT
  // burning its one-shot localStorage flag, so it re-evaluates on the next
  // IDLE once the active surface has dismissed.
  //
  // A ref (vs state) so claims/releases are visible SYNCHRONOUSLY within a
  // single effect flush; useEffect-synced state would be one tick stale and
  // sibling effects on the same render would race past the gate.
  //
  // User-initiated surfaces (bell tap, profile tap, leaderboard button,
  // collect tap, feedback) DO NOT go through this gate — they're explicit
  // intent, not background nudges.
  const attentionLockRef = useRef<{ surface: string; openedAt: number } | null>(null);
  const tryClaimAttention = useCallback((surface: string): boolean => {
    if (attentionLockRef.current) return false;
    attentionLockRef.current = { surface, openedAt: Date.now() };
    return true;
  }, []);
  const releaseAttention = useCallback((surface: string) => {
    if (attentionLockRef.current?.surface === surface) {
      attentionLockRef.current = null;
    }
  }, []);

  // Auto-release the lock when the surface that owns it dismisses. Each
  // effect watches the dismissal signal of its own surface — chad watches
  // ftueCommentaryOverride going null, RegisterModal watches showRegisterModal
  // going false, etc. Releases via the surface key so a stale claim from a
  // previous owner can't accidentally clear an active one.
  useEffect(() => {
    if (ftueCommentaryOverride == null) releaseAttention("chad_commentary");
  }, [ftueCommentaryOverride, releaseAttention]);
  useEffect(() => {
    if (!showRegisterModal) releaseAttention("auth_modal");
  }, [showRegisterModal, releaseAttention]);
  useEffect(() => {
    if (!showNamePrompt) releaseAttention("name_prompt");
  }, [showNamePrompt, releaseAttention]);

  // Unified auth-modal gate — fires at most once ever, across all trigger sources.
  // Goes through tryClaimAttention("auth_modal"); if another surface owns the
  // lock, defer to the next IDLE without burning rm_auth_modal_shown.
  const tryOpenAuthModal = useCallback((trigger: string, delayMs: number, extraProps: Record<string, string | number> = {}) => {
    if (localStorage.getItem("rm_auth_modal_shown") === "1") return;
    if (!tryClaimAttention("auth_modal")) return; // another surface in-flight → defer to next IDLE
    localStorage.setItem("rm_auth_modal_shown", "1");
    const t = setTimeout(() => {
      // OAuth-resume race guard (build lock rev 3). The nudge effects
      // below gate on isAnonymous, but during the post-redirect first-
      // render→INITIAL_SESSION window the Context value is transiently
      // true even though a real session is about to land. The effects'
      // own cleanup cancels this timer when isAnonymous flips for the
      // hand_5 / big_win nudges, but the chad-chained call into
      // tryOpenAuthModal at ~:872 is fire-and-forget — its cleanup is
      // discarded. Re-check via the ref so any already-scheduled timer
      // no-ops if the user is no longer anonymous when it fires (or if
      // a resume payload is still pending — same intent as the upstream
      // gates, applied here for completeness).
      if (isAnonymousRef.current === false) return;
      if (hasPendingResumeShare()) return;
      track("auth", "signup_modal_shown", { trigger, hand_number: handCount, ...extraProps });
      setShowRegisterModal(true);
    }, delayMs);
    return () => clearTimeout(t);
  }, [handCount, tryClaimAttention]);

  // First rookie win — fires at RESULTS. Skipped for challenge recipients
  // (their first impression of the game shouldn't be a tutorial-style
  // Chad nudge about ROOKIE tier rules). onChallengeUrl covers pre-Accept.
  useEffect(() => {
    if (challengeCtx || onChallengeUrl) return;
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return;
    if (winTier !== "ROOKIE") return;
    if (localStorage.getItem("rm_usher_rookie_first_win") === "1") return;
    localStorage.setItem("rm_usher_rookie_first_win", "1");
    setLegendGold(true);
    setFtueCommentaryOverride({ parts: [chadMessage("rookie_first_win")], sticky: true });
  }, [gameState, winTier, challengeCtx]); // eslint-disable-line

  // All other Chad messages — evaluated once per IDLE.
  // Challenge recipients don't see retention/auth-nudge Chad lines — the
  // intro chip and the comparison sheet are the only Chad surfaces in the
  // challenge flow. onChallengeUrl gate covers pre-Accept (challengeCtx
  // null but landing screen open).
  useEffect(() => {
    if (challengeCtx || onChallengeUrl || gameState !== "IDLE") return;
    // OAuth-resume race guard (build lock rev 3): skip the entire chad
    // pass while a resume payload is queued. The chained
    // tryOpenAuthModal at ~:872 below is fire-and-forget — its cleanup
    // is discarded by this effect, so blocking the whole pass here is
    // the only place to keep the chained timer from being scheduled.
    // Benign chad topics (leaderboard_explainer / mvp_thanks /
    // dev_4thwall) are suppressed in this window too; that's intentional
    // — the user is mid-OAuth-resume modal flow and wouldn't see the
    // chad bubble anyway, and chad re-evaluates on the next IDLE once
    // ResumeShareSurface clears the payload in its `finally` block.
    if (hasPendingResumeShare()) return;
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
      // Attention mutex: if any other surface (auth modal, name prompt) is
      // already in-flight on this IDLE, defer this turn's chad message —
      // re-evaluates next IDLE. Do NOT mark rm_usher_<topic>=1 yet so the
      // topic can still fire later.
      if (!tryClaimAttention("chad_commentary")) return;
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
      // INTENTIONAL HANDOFF: chad's chained auth-modal call (e.g. "you're
      // on the leaderboard" → 4500ms read pause → sign-up modal). Chad
      // currently holds the attention lock; we hand it off to the auth
      // modal by releasing chad's claim, then letting tryOpenAuthModal
      // re-claim under "auth_modal". Sibling tryOpenAuthModal calls in the
      // same flush (MVP/LEGEND big_win at 2500ms, hand_5 at 3500ms) will
      // see the lock held and defer to the next IDLE.
      if (topic === "leaderboard_intro" || topic === "big_win" || topic === "retention") {
        releaseAttention("chad_commentary");
        tryOpenAuthModal(`chad_${topic}`, 4500);
        // Re-claim chad's lock so the sticky bubble's dismissal still
        // releases correctly via the ftueCommentaryOverride watcher.
        // (If tryOpenAuthModal claimed "auth_modal", the lock is now held
        // by auth_modal — re-claiming chad would fail and that's fine: the
        // auth modal owns the moment, chad's bubble visually rides on top
        // until it's tapped, after which the lock transfers cleanly.)
        attentionLockRef.current ??= { surface: "chad_commentary", openedAt: Date.now() };
      }
      return;
    }
  }, [gameState, handCount, isAnonymous, bigWinFired, tryOpenAuthModal, tryClaimAttention, releaseAttention]); // eslint-disable-line

  // [Auth:challenge-skip] Auth nudge — MVP+ hand while anonymous.
  // Challenge recipients are guests landing through a deep link — pushing a
  // sign-in modal kills the moment. Skip during ALL challenge flow:
  //   - challengeCtx truthy   → post-Accept (replay in progress)
  //   - challengeIdFromUrl    → pre-Accept (landing screen visible,
  //                             challengeCtx still null but GameView
  //                             is mounted underneath)
  // Earlier versions only checked challengeCtx, which let the nudge fire
  // for return users (handCount>=5) on the landing screen.
  const onChallengeUrl = typeof window !== "undefined" &&
    /\/basketball\/challenge\/[0-9a-f-]{36}/i.test(window.location.pathname);
  useEffect(() => {
    // OAuth-resume race guard (build lock rev 3): hasPendingResumeShare()
    // covers the first-render→INITIAL_SESSION window where isAnonymous
    // is transiently true. Without it, this effect schedules a timer
    // while the ResumeShareSurface modal is queueing up — the timer's
    // cleanup runs when isAnonymous flips false (so this specific
    // nudge IS cancelled), but the belt-and-suspenders check keeps the
    // intent local to this gate. Skip ordering matches the existing
    // !isAnonymous gate's intent.
    if (!isAnonymous || challengeCtx || onChallengeUrl || hasPendingResumeShare()) return;
    if (gameState !== "IDLE") return;
    if (winTier !== "MVP" && winTier !== "LEGEND") return;
    return tryOpenAuthModal("big_win", 2500, { tier: winTier ?? "" });
  }, [winTier, isAnonymous, gameState, tryOpenAuthModal, challengeCtx, onChallengeUrl]);

  // Auth nudge — fallback at hand 5. Same challenge-mode skip as above.
  useEffect(() => {
    if (!isAnonymous || challengeCtx || onChallengeUrl || hasPendingResumeShare()) return;
    if (gameState !== "IDLE") return;
    if (handCount < 5) return;
    return tryOpenAuthModal("hand_5", 3500);
  }, [handCount, isAnonymous, gameState, tryOpenAuthModal, challengeCtx, onChallengeUrl]);

  // Trophy burst — fires when the user lands on the daily leaderboard,
  // independent of (and parallel to) the isAnonymous-gated chad
  // leaderboard_intro topic so it celebrates registered users too. Edge-
  // detected via the rm_board_pulsed_state key (owned by this branch)
  // against rm_on_board_today (read-only here; that flag's writer is
  // shared/utils/leaderboardContext.ts:125). Outer gates mirror the chad
  // effect so the burst lands on IDLE after the share prompt dismisses,
  // never during it.
  useEffect(() => {
    if (challengeCtx || gameState !== "IDLE") return;
    if (hasPendingResumeShare()) return;
    let onBoard = false;
    let lastCelebrated: string | null = null;
    try {
      onBoard = localStorage.getItem("rm_on_board_today") === "1";
      lastCelebrated = localStorage.getItem("rm_board_pulsed_state");
    } catch { return; }
    if (onBoard && lastCelebrated !== "1") {
      setTrophyBurst(true);
      try {
        localStorage.setItem("rm_board_pulsed_state", "1");
        // New on-board entry is unacknowledged — drives GameBar's durable
        // pulse loop (independent of the one-shot trophyBurst state) until
        // the user taps the trophy. Cleared in the tap handlers below.
        localStorage.setItem("rm_board_ack", "0");
      } catch { }
    } else if (!onBoard && lastCelebrated !== "0") {
      // Re-arm the edge so a later flip back to onBoard re-fires. Leave
      // rm_board_ack alone — it'll re-zero on the next not→on edge.
      try { localStorage.setItem("rm_board_pulsed_state", "0"); } catch { }
    }
  }, [gameState, handCount, challengeCtx, onBoardTick]);

  // (prepareChallenge removed in push 2a. Send It Back from the
  // comparison sheet no longer shares from the played hand directly —
  // it routes the user into a FRESH normal hand with challengeBackCtx
  // set, and the share prompt at that hand's RESULTS does the create
  // synchronously from its own tap handler. The Web-Share user-gesture
  // chain is preserved by ChallengeSharePrompt's own pre-creation flow.)

  const pendingCelebration = useRef<{ totalFp: number } | null>(null);
  /** FTUE: roster sum can read 0 briefly in RESULTS — keep last resolved hand FP for TierGauge */
  const completedCardsRef = useRef<Set<string>>(new Set());
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
    let cancelled = false;
    const load = () => {
      setDataReady(false);
      ensureLoaded()
        .then(() => { if (!cancelled) setDataReady(true); })
        .catch(() => { if (!cancelled) setGameError("Failed to load game data. Check your connection and try again."); });
    };
    load();
    // Re-load when the active season key changes (e.g. FTUE→real-game
    // transition swaps from FTUE_SEASON_KEY to today's pick). setActiveSeason
    // invalidates the cache; without re-running ensureLoaded the next deal
    // throws "dataEngine not loaded".
    const onSeasonChange = () => load();
    if (typeof window !== "undefined") {
      window.addEventListener("replaymod:active-season-change", onSeasonChange);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("replaymod:active-season-change", onSeasonChange);
      }
    };
  }, []); // eslint-disable-line

  const flipState = useCardFlipState();
  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);
  // FP "already locked in" at REVEAL start — sum of held cards' actualFp
  // EXCLUDING the held anchor (highest-salary held card). The held anchor's
  // FP is the spring's payload (added to the bar via runSpring after its
  // count-up), matching the existing non-held-anchor flow. This stops the
  // gauge bar from rebounding to 0 at REVEAL start when the user held one
  // or more cards. seedFp = 0 when no cards are held → identical legacy
  // behavior.
  // Team FP starts at 0 every REVEAL. Held cards no longer "pre-load" the
  // bar — they tick up via their own visibleFp animation in revealHeldCards
  // just like non-held cards. Combined with removing frozenBarFpRef freeze
  // (see handleCardRevealStart), this gives the per-card rollup feel the
  // user asked for, regardless of auto / tap / mixed reveal path.
  const heldFpAtDraw = 0;
  // In challenge mode there's no wager — win/loss is the head-to-head
  // comparison. Lock the effective multiplier to 1x so all downstream
  // bet math (payout, animations, FTUE seeds) reads 1x even if the
  // user's preferred multiplier from a prior session is higher. The UI
  // hides the multiplier selector entirely so it can't drift from this.
  // Build-phase entryFee collapse: when the sport disables the multiplier
  // (basketball, adapter.multiplierEnabled === false), the bet is a single
  // entryFee — pin the effective multiplier to 1. Default true ⇒ multiplier
  // live (baseball/football unchanged). betMultiplier state + setBetMultiplier
  // stay intact and re-wireable; only the input-to-bet role is disconnected.
  const multiplierEnabled = adapter.multiplierEnabled ?? true;
  // Build-phase round cap. Default 1 ⇒ single-shot (today's flow) for any sport
  // that doesn't opt in. Basketball sets 3. Read site owns the default.
  const maxRounds = adapter.maxRounds ?? 1;
  // Streaks paused for sports that opt out (basketball). Default true ⇒ live.
  // effectiveStreak collapses the streak to 0 at every DISPLAY/MULTIPLIER read
  // site (getStreakMultiplier(0) = 1.0), neutralizing the effect without touching
  // the real `streak` state, its counting, or the streak_at_play column.
  const streaksEnabled = adapter.streaksEnabled ?? true;
  const effectiveStreak = streaksEnabled ? streak : 0;
  // F2P money seam. Default true ⇒ economy LIVE (baseball/football unchanged).
  // Basketball sets false: the wallet never moves — charge/gate/credit are
  // bypassed at their call sites (closure body kept intact for the pinned tests).
  const economyEnabled = adapter.economyEnabled ?? true;
  const effectiveBetMultiplier = (!multiplierEnabled || challengeCtx) ? 1 : betMultiplier;
  const currentBet = BASE_BET * effectiveBetMultiplier;
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
    currentBet,
    betMultiplier: effectiveBetMultiplier,
    economyEnabled,
    rosterRef,
    isAnonymous,
    setBigWinFired,
    setOnBoardTick,
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
    // Bar no longer freezes when the anchor starts revealing — it ticks up
    // continuously with each card's visibleFp so the user sees per-card
    // rollup all the way through. The end-of-reveal spring still fires (its
    // start = end = total, so it's a no-op visually but the win-tier audio
    // / glow / stamp still play). Setting frozenBarFpRef here would force
    // the displayed FP to stop ticking during the anchor's flip animation,
    // creating the "jumps in the anchor's FP at the end" feel.
    void trueAnchorId; // referenced for future spring tuning
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
    seedFp: heldFpAtDraw,
    flipState,
    onBeforeHeldReveal: undefined,
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

  const isPreRevealFooter = gameState === "HOLD";

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
    // B2a status flags: sparse, absolute, tier-orthogonal. Cold Night inherits the
    // visual loss-coloring hook BUST vacated (Step 2) so a cold hand looks distinct
    // from a neutral ROOKIE; Heater gets its own gold/flame treatment in the bottom.
    const handStatus = adapter.getHandStatus?.(lockedGaugeFpRef.current ?? 0) ?? null;
    const isLoss = winTier === "BUST" || handStatus === "COLD_NIGHT";
    const lossAmount = winTier === "BUST" ? BASE_BET * effectiveBetMultiplier : 0;
    const streakMult = getStreakMultiplier(effectiveStreak);
    return {
      tierLabel: formatTierLabel(winTier),
      tierColor: tc.color,
      tierGlow: tc.glow,
      payout: winPayout,
      streak: effectiveStreak,
      isBust: winTier === "BUST",
      betMultiplier: effectiveBetMultiplier,
      tierMultiplier: tierMult,
      streakMultiplier: streakMult,
      baseBet: BASE_BET,
      isLoss,
      lossAmount,
      handStatus,
    };
  }, [gameState, winTier, winPayout, streak, effectiveBetMultiplier]); // eslint-disable-line

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
      return 0;
    }
    if (gameState === "DEALING" || gameState === "HOLD" || gameState === "DRAWING") {
      return roster.reduce((sum, c) => sum + ((c as any).fp ?? 0), 0);
    }
    return 0;
  }, [gameState, runningTotalFp, roster]);

  const ceilingPct = useMemo(() => {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return null;
    if (!computeRosterCeiling) return null;
    const maxPossible = computeRosterCeiling(roster);
    if (maxPossible <= 0 || totalFp <= 0) return null;
    return Math.min(100, Math.round((totalFp / maxPossible) * 100));
  }, [gameState, roster, totalFp, computeRosterCeiling]);

  // Sum of bonus FP (badges + dailyBonus) accumulated across cards that have
  // finished revealing. Surfaces next to Team FP as "(+30)". During REVEAL
  // each card's bonus contribution lands the moment its FP roll-up completes,
  // so the (+N) ticks up alongside the headline number rather than appearing
  // fully formed at the start. RollingNumber smooths the visual between steps.
  // Dependency on runningTotalFp ensures the memo re-runs at the same cadence
  // as the headline FP — getVisibleFp is a stable callback ref and on its own
  // wouldn't trigger recomputation per card-completion.
  const teamBonusFp = useMemo(() => {
    const cardBonus = (c: any): number => {
      const daily = Number(c?.dailyBonus ?? 0);
      const badges = Array.isArray(c?.achievements) ? c.achievements : [];
      const badgeBonus = badges.reduce((s: number, b: any) => s + Number(b?.fp ?? 0), 0);
      return daily + badgeBonus;
    };
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      return roster.reduce((sum, c) => sum + cardBonus(c), 0);
    }
    if (gameState === "REVEALING") {
      return roster.reduce((sum, c) => {
        const cid = cardId(c);
        const visFp = getVisibleFp(cid);
        if (visFp === undefined) return sum;
        const actualFp = Number((c as any).actualFp ?? 0);
        // Card still rolling — wait until it lands before adding its bonus.
        // Compare on absolute value so negative-FP results (rare) work too.
        if (Math.abs(visFp) < Math.abs(actualFp) - 0.5) return sum;
        return sum + cardBonus(c);
      }, 0);
    }
    return 0;
  }, [gameState, roster, runningTotalFp, getVisibleFp]);

  // Top Games
  const topGameInfo = useMemo(() => {
    const commentaryRoster = roster.map((c: any) => ({
      name: String(c?.name ?? ""),
      salary: Number(c?.salary ?? 0),
      actualFp: Number(c?.actualFp ?? 0),
      projectedFp: Number(c?.projectedFp ?? 0) || 0,
      cardTier: String(c?.tier ?? ""),
      basePlayerId: String(c?.basePlayerId ?? ""),
      // Player's own team for this game's season (e.g. "CHI" for a Bulls-
      // era Jordan card). Drives the culture lookup's teamEras overlay
      // for multi-tenure players. Distinct from opponent (faced team).
      team: String(c?.team ?? ""),
      statLine: (c?.statLine ?? {}) as Record<string, any>,
      gameDate: String(c?.gameInfo?.date ?? ""),
    }));
    const star = selectStar(commentaryRoster as any);
    const realTopGame = (featureFlags.topGames && star?.statLine)
      ? detectTopGame(
          star.statLine as any,
          star.basePlayerId ?? "",
          star.gameDate ?? "",
          star.cardTier ?? "",
          sportKey,
          )
        : { tier: null as null, primaryReason: null, allReasons: [] as any[] };

    // DEV-ONLY force hook: ?forceAchievementBack=career|record|season
    //                      ?forceAchievementCount=1|2|3 (default 1)
    // Synthesizes a TopGameResult on the star card by picking the top N
    // non-zero stats as featured. Lets QA preview multi-stat achievement
    // headlines (e.g. DOUBLE CAREER HIGH) without staging a real game.
    let topGame: any = realTopGame;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const forced = params.get("forceAchievementBack");
      const forcedCount = Math.max(1, Math.min(3, Number(params.get("forceAchievementCount") ?? 1) || 1));
      if (forced && (forced === "career" || forced === "record" || forced === "season") && star?.statLine) {
        const sl: Record<string, any> = star.statLine as any;
        const candidates = ["pts", "reb", "ast", "blk", "stl", "threes"];
        const ranked = candidates
          .map(k => ({ k, v: Number(sl[k] ?? 0) }))
          .filter(x => x.v > 0)
          .sort((a, b) => b.v - a.v)
          .slice(0, forcedCount);
        if (ranked.length > 0) {
          const allReasons = ranked.map(({ k, v }) => ({ category: k, value: v, label: `forced ${forced} (${v} ${k})` }));
          topGame = {
            tier: forced as any,
            primaryReason: allReasons[0],
            allReasons,
          };
        }
      }
    }

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
  // hand picks fresh copy.
  //
  // CACHE-KEY INVALIDATION (added 2026-05-24, bucket 2 piece B smoke
  // diagnosis): the cached copy is keyed on the challengeTrigger?.trigger
  // value that was active at cache time. If the cache was populated
  // BEFORE the trigger arrived (gameState/winTier/springSettled flip
  // true first, then evaluateTrigger fires a tick later — common
  // ordering on big_score/miss/rare_pull/choke hands), the cache
  // would hold baseCopy and short-circuit forever. The key ref forces
  // a recompute when the trigger value the cache was computed against
  // no longer matches the current trigger.
  //
  // Expected per-hand fingerprint:
  //   - default-trigger hands: 1 recompute, key="default" or "_none_"
  //   - named-trigger hands  : 2 recomputes (first with key="_none_"
  //     pre-trigger; second with key="big_score"/"miss"/etc.). The
  //     first recompute calls selectCommentary only (no chad-anti-
  //     repeat side effect); the second recompute calls
  //     selectTopSlotFraming which DOES push to the chad ring buffer
  //     — exactly once per hand, matching no-race behavior.
  //
  // See docs/smoke-tests/2026-05-24-s1-slot-split-real-copy-smoke.md
  // for the diagnostic fingerprint that motivated this fix.
  //
  // If you change the deps array below or the ref-reset point or the
  // key-derivation, double-check all three: stale-copy bugs are
  // subtle and the smoke fingerprint is the only integration check
  // for this race today (open-followup tracked: extract useMemo body
  // into a usePostRevealCopy hook for renderHook coverage).
  const postRevealCopyRef = useRef<ReturnType<typeof selectCommentary> | null>(null);
  const postRevealCopyKeyRef = useRef<string | null>(null);
  const postRevealCopy = useMemo(() => {
    // Sync the TOP-slot trigger snapshot. When challengeTrigger is
    // non-null, capture it; when null (post-dismissal), keep the prior
    // snapshot so the TOP-slot bank line persists. The sync lives
    // inside the useMemo (rather than a useEffect) so the snapshot is
    // current synchronously with the deps-driven re-run — avoids a
    // one-render lag where the override block would otherwise read a
    // stale ref on the very first hand-resolution render.
    if (challengeTrigger) topSlotTriggerRef.current = challengeTrigger;
    // Cache key derives from the snapshot, not the live state — so the
    // null→null transition on dismiss doesn't invalidate the cache and
    // re-pick a new bank line.
    const currentKey = topSlotTriggerRef.current?.trigger ?? "_none_";
    if (postRevealCopyRef.current && postRevealCopyKeyRef.current === currentKey) {
      return postRevealCopyRef.current;
    }
    if ((gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") || !winTier || !springSettled) return null;
    // Challenge mode: the tactical chad chip + auto-rising comparison sheet
    // own the post-reveal moment. Skip the standard tier commentary so it
    // doesn't speak over the challenge-aware framing.
    if (challengeCtx) return null;
    const fp = lockedGaugeFpRef.current ?? displayFp;
    // Phase 1 trigger split (2026-06-03): tracked NEAR_MISS_BAND with
    // the post-reveal commentary path. Today gaugeSnap.isNearMiss is not
    // consumed at this site (only nextTier/curMin/nextMin flow into
    // copyInput); aligning the threshold now prevents a future change
    // from creating an asymmetry against the stamp window.
    const gaugeSnap = computeGaugeState(fp, gaugeThresholds, winTier, NEAR_MISS_BAND);

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
        teams: Array.isArray((c as any).teams) ? (c as any).teams.map((t: any) => String(t)) : undefined,
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
      handCount,
      sport: sportKey,
      topGame: topGameInfo.topGame,
      streakTiers,
    };

    const copy = selectCommentary(copyInput as any);
    const baseCopy = copy?.primary
      ? copy
      : (() => {
          const fpStr = fp.toFixed(1);
          const staticMap: Record<string, string> = {
            BUST: "Off night. The numbers don't lie.",
            ROOKIE: `${fpStr} on the board. Take it.`,
            STARTER: `${fpStr} — that's a real hand.`,
            ALL_STAR: `${fpStr}. Now we're talking.`,
            MVP: `${fpStr}. That's a number.`,
            LEGEND: `${fpStr}. Insane.`,
          };
          return { primary: staticMap[winTier] ?? staticMap.STARTER, secondary: "" };
        })();

    // First-share invitation — UNWIRED (bucket 2 piece D-min, 2026-05-24).
    //
    // Removed: TOP-slot preempt that wrote the firstShareInvitation()
    // line into postRevealCopy.primary. Violated bucket 2 Q2 LOCKED
    // ("First-share invitation routes to BOTTOM slot only; TOP retains
    // trigger-aware celebration on that hand") — first-share copy is
    // push-to-send, which the S1 slot split places in BOTTOM.
    //
    // TODO (deferred to a future session): wire firstShareInvitation()
    // into BOTTOM (ChallengeSharePrompt) per Q2. Today the one-shot
    // engagement gate is intentionally inactive — surfaced as an open
    // followup in docs/open-followups.md ("First-share invitation
    // BOTTOM-wiring — gated by Q2 LOCKED, deferred from bucket 2 piece
    // D-min"). The localStorage flag (rm_usher_first_share_invitation)
    // is left untouched so users who already saw the invitation
    // pre-regression-fix aren't re-presented when the wire-up lands.

    // Trigger-aware TOP-slot framing override (standalone play only —
    // challenge recipients see ChallengeComparisonScreen with its own
    // Chad lines). When a named trigger fires
    // (rare_pull/big_score/miss/choke), the post-reveal TOP slot
    // delegates to selectTopSlotFraming — TOP-slot hand-celebration
    // copy with inline trigger stamps (DEAL/DRAW-style chips rendered
    // mid-sentence). Returned `primary` is a Line (Array<string |
    // StampToken>); TierGauge's render path walks parts, threading
    // strings through Typewriter and rendering StampTokens as inline
    // chips.
    //
    // Tier label resolution uses the hybrid model (Q4 refinement
    // 2026-05-24): selector substitutes `tier: "{missTier}"` sentinels
    // on MISS bank lines; renderer falls back to context lookup
    // (winTier prop / missTier prop) when token.tier is absent. See
    // chadChallenge.ts StampToken type for the full model.
    //
    // Default trigger is filtered out by the outer guard — those hands
    // keep the basketball.json baseline copy from selectCommentary (the
    // workstream-4 spice target). TOP_DEFAULT bank is unreachable
    // through this path (bucket 2 Q1.3 LOCKED 2026-05-24).
    //
    // S1 slot split (bucket 2 LOCKED): TOP = hand + trigger event with
    // inline stamps; BOTTOM (ChallengeSharePrompt, mounted separately)
    // = push-to-send. Reversing WS2 (5f4ae5e) which had TOP also pulling
    // selectChallengeInitiation — that bank now feeds BOTTOM only.
    // Read the trigger from the TOP-slot snapshot (synced above), not
    // the live challengeTrigger state. This way the override block
    // continues to fire after the ChallengeSharePrompt dismiss handler
    // nulls challengeTrigger — preserving the TOP-slot bank line
    // post-dismissal (Finding A fix, 2026-05-25).
    const tt = topSlotTriggerRef.current;
    if (!challengeCtx && tt && tt.trigger !== "default") {
      // Resolve anchor display name (last name) for {starName}
      // substitution. Same lookup pattern as ChallengeSharePrompt's
      // rarePullHeadline useMemo.
      const anchor = (tt.anchorBasePlayerId
        ? (rosterRef.current as any[]).find(c => c.basePlayerId === tt.anchorBasePlayerId)
        : null);
      const lastNameOf = (c: any): string | null =>
        c ? (String(c.name ?? "").trim().split(/\s+/).pop() ?? c.name ?? "") : null;
      const anchorLast = lastNameOf(anchor);
      // Derive {starName1} / {starName2} for TOP_CHOKE_HELD_TWO_PLUS.
      // Rule per bucket 2 smoke revision 2026-05-24: if anchor is one
      // of the held cards, anchor → starName1 regardless of FP order
      // (headline-priority). Then FP-descending among the remaining
      // held cards. If anchor is NOT held, pure FP-descending.
      const anchorBpId = tt.anchorBasePlayerId ?? null;
      const heldCards = (rosterRef.current as any[]).filter(c => c?.wasHeld === true);
      const anchorIsHeld = !!(anchorBpId && heldCards.some(c => c?.basePlayerId === anchorBpId));
      const sortedHeld = anchorIsHeld
        ? [
            heldCards.find(c => c?.basePlayerId === anchorBpId),
            ...heldCards
              .filter(c => c?.basePlayerId !== anchorBpId)
              .sort((a, b) => (Number(b?.actualFp ?? 0)) - (Number(a?.actualFp ?? 0))),
          ]
        : [...heldCards].sort((a, b) => (Number(b?.actualFp ?? 0)) - (Number(a?.actualFp ?? 0)));
      const starName1 = sortedHeld[0] ? lastNameOf(sortedHeld[0]) : null;
      const starName2 = sortedHeld[1] ? lastNameOf(sortedHeld[1]) : null;
      const framingLine = selectTopSlotFraming({
        trigger: tt.trigger as TopSlotTrigger,
        roster: rosterRef.current as Array<{ tier?: string; wasHeld?: boolean }>,
        starAchievementType: tt.topGameTier ?? null,
        // For choke: the trigger result doesn't carry anchorBasePlayerId
        // today, and choke is semantically about the user's held picks
        // anyway. Use the headline held card (starName1, derived from
        // sortedHeld[0] above) as starName so HELD_ONE bank lines don't
        // render empty {starName}. Fallback to anchorLast for defensive
        // safety. For other triggers (big_score / miss / rare_pull) the
        // anchor-derived starName is correct (Bug #1 fix, bucket 2 piece
        // B smoke 2026-05-25). Phase 1 trigger split (2026-06-03):
        // renamed bad_beat → choke; behavior unchanged.
        starName: tt.trigger === "choke" ? (starName1 ?? anchorLast) : anchorLast,
        starName1,
        starName2,
        winTier: (winTier ?? null) as any,
        missTier: tt.nearMissNextTier ?? null,
        topGame: (tt.topGamePrimaryReason || tt.topGameAllReasons)
          ? {
              primaryReason: tt.topGamePrimaryReason ?? null,
              allReasons: tt.topGameAllReasons ?? null,
            }
          : null,
      });
      const framed = { primary: framingLine, secondary: baseCopy.secondary ?? "" };
      postRevealCopyRef.current = framed as any;
      postRevealCopyKeyRef.current = currentKey;
      return framed as any;
    }

    postRevealCopyRef.current = baseCopy as any;
    postRevealCopyKeyRef.current = currentKey;
    return baseCopy;
  }, [gameState, winTier, springSettled, displayFp, roster, streak, ceilingPct, challengeTrigger, challengeCtx]); // eslint-disable-line

  const regularFinalGaugeKick = false;

  // Tier result phase
  useEffect(() => {
    if ((gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier) {
      nearMissChoreTimersRef.current.forEach(clearTimeout);
      nearMissChoreTimersRef.current = [];
      setNearMissTeasing(false);
      setTierResultPhase(1);
      const gaugeSnap = computeGaugeState(totalFp, gaugeThresholds, winTier, NEAR_MISS_BAND);
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
  }, [gameState, winTier]); // eslint-disable-line

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
      postRevealCopyKeyRef.current = null;
      topSlotTriggerRef.current = null;
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
    setStatsFlippedIds(prev => {
      const next = new Set(prev);
      next.has(cardKey) ? next.delete(cardKey) : next.add(cardKey);
      return next;
    });
  }

  async function onPrimaryAction() {
    if (gameState === "IDLE") {
      // F2P: skip the affordability lockout when the economy is off (wallet never
      // moves). Outer-wrapped so the inner `if (balance < currentBet)` line stays
      // byte-identical for the pinned betOncePerHand assertion.
      if (economyEnabled) {
        if (balance < currentBet) { alert("Insufficient balance!"); return; }
      }
      resetReveal();
      resetAllOverlays();
      setRoundsUsed(1); // new hand → the deal is round/lineup 1 (lock fires after 2 rerolls = 3 lineups at maxRounds 3; first reroll locks at maxRounds 1 = single-shot)
      initialRosterRef.current = [];
      completedCardsRef.current = new Set();
      setDisplayTier("BUST");
      setTierResultPhase(1);
      setLockedCardIds(new Set());
      setStatsFlippedIds(new Set());
      setMvpId(undefined);
      setRevealedSalary(0);
      deductedSalaryCardsRef.current = new Set();
      setLastRevealedCardId(null);
      setCelebrationHeld(false);
      setFtueCommentaryOverride(null);
      pendingCelebration.current = null;
      let res: any;
      try {
        // Challenge snapshot replay requires BOTH: a present challengeCtx
        // AND an explicit "this deal is a challenge replay" intent set by
        // either the Accept auto-deal effect or a "Try Again" button.
        // challengeCtx alone is not enough — it persists across the
        // RESULTS → IDLE transition, and dismissing the comparison sheet
        // doesn't clear it. Treating `if (challengeCtx)` alone as "replay
        // the snapshot" misrouted any post-dismiss DEAL tap back into the
        // same challenge. When the intent isn't set, clear the stale
        // challengeCtx and deal a fresh hand (FTUE-aware).
        if (challengeCtx && challengeNextDealRef.current) {
          // Phase 0 challenge-snapshot-enrichment bleed clear (2026-06-02,
          // lock: docs/challenge-landing-v2-phase0-snapshot-enrichment-lock.md).
          // The deserialized initialRoster now carries the SENDER's
          // wasHeld (display-only on the landing) — strip it here so the
          // recipient's own deal starts with all cards un-held. Mirrors
          // the H2HRecipientPlay.tsx:371-374 defensive pattern; deal-site
          // owns the clear so the invariant holds regardless of what
          // deserializeRoster returns.
          res = { roster: challengeCtx.initialRoster.map(c => ({ ...c, wasHeld: false })) };
          challengeNextDealRef.current = false;
        } else {
          if (challengeCtx) clearChallengeCtx?.();
          // FTUE removed (slice 1): every hand — including hand 1 — deals a
          // real roster. The old `ftueStillActive` localStorage/URL gate that
          // routed first-timers into ftueDealRoster() is gone. It was
          // INDEPENDENT of the FTUE flag (the second deal gate), so cut here
          // is what actually stops the scripted Tatum hand from dealing.
          res = await dealInitialRoster();
        }
      } catch (e) {
        // Surface the real error to the console — the on-screen banner is
        // intentionally generic, but the underlying message (server 4xx, auth
        // failure, balance check) is the only useful debugging signal.
        console.error("[deal] dealInitialRoster failed:", e);
        setGameError("Couldn't deal a hand. Tap to try again.");
        setGameState("IDLE");
        return;
      }
      const nextRoster = (res?.roster ?? res?.cards ?? []) as PlayerCard[];
      initialRosterRef.current = nextRoster as import("@shared/types/index").GeneratedCard[];
      if (!nextRoster.length) {
        setGameError("Couldn't build a roster. Tap to try again.");
        setGameState("IDLE");
        return;
      }
      setGameError(null);
      // Economic invariant: ONE hand pays once and rakes once. The entry bet +
      // bonus rake now fire at LINEUP-LOCK (via the round-machine controller's
      // lock path — see the HOLD branch below), NOT here at deal entry and NOT
      // per HOLD→DRAW. A deal is free; money crosses the seam only when the
      // lineup locks. (Relocated from the deal-entry position of Commit A.)
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
      // One build-phase ROUND: reroll the unheld cards, resolve, then ask the
      // round-machine controller whether to loop back to HOLD (free) or lock to
      // REVEALING. A round NEVER touches balance or the rake directly — money
      // crosses the seam only inside commitRound's lock path (below), once per
      // hand regardless of round count. Held cards carry forward (lockedCardIds
      // are keyed by cardId; redraw preserves held cards' ids).
      // B2a: a round can finish two ways and they converge on ONE shared tail
      // (commitRound + reveal-prep). The EARLY-LOCK head locks the CURRENT lineup
      // with no redraw; the REDRAW head (else) is byte-for-byte today's behavior.
      // The only economic delta between them is the `userTappedReveal` token fed
      // to commitRound below (earlyLock vs the hardcoded false the redraw uses).
      const markedRoster = roster.map(c => ({ ...c, wasHeld: lockedCardIds.has(cardId(c)) }));
      // Trigger: tapping the primary CTA with EVERY card held = "lock what I see
      // now". markedRoster is freshly marked from the CURRENT lockedCardIds at tap
      // time, so .every() reads holds as they are now — never a stale wasHeld from
      // a prior round. Roster-size-agnostic (no literal 5; respects rosterSize).
      // Gated to maxRounds > 1: a single-shot sport has no early lock, so earlyLock
      // stays false → redraw head + userTappedReveal:false, byte-identical to today.
      const allHeld = markedRoster.length > 0 && markedRoster.every(c => (c as any).wasHeld);
      const earlyLock = allHeld && maxRounds > 1;
      let finalRoster: PlayerCard[];
      let mvp: string | undefined;

      if (earlyLock) {
        // ── EARLY-LOCK HEAD: lock what the player is looking at, no redraw. ──
        // Resolution keys off round state, not card inspection (dealt cards carry
        // actualFp:0, so resolution can't be detected from the cards):
        //   roundsUsed === 1 → freshly dealt, never redrawn → unresolved → resolve now.
        //   roundsUsed >= 2  → produced by a redraw → already resolved → reuse as-is.
        // (No resolveRoster idempotency assumption — we resolve at most once.)
        setRoster(markedRoster);
        if (roundsUsed === 1) {
          let resolveRes: any;
          try {
            resolveRes = await resolveRoster({ finalCards: markedRoster });
          } catch {
            setGameError("Something went wrong. Tap to try again.");
            setGameState("HOLD");
            return;
          }
          finalRoster = (resolveRes?.roster ?? resolveRes?.cards ?? markedRoster) as PlayerCard[];
          mvp = resolveRes?.mvpCardId ?? resolveRes?.mvpId;
        } else {
          finalRoster = markedRoster;
        }
      } else {
        // ── REDRAW HEAD: unchanged from today (now wrapped in else). ──
        flipState.beginDraw(markedRoster.filter(c => !(c as any).wasHeld).map(cardId));
        setRoster(markedRoster);
        setGameState("DRAWING");
        gameAnalytics.redrawUsed();
        await sleep(DRAWING_DWELL_MS);
        let drawRes: any, resolveRes: any;
        try {
          drawRes = await redrawRoster({ currentCards: markedRoster, lockedCardIds });
          const drawnRoster = (drawRes?.roster ?? drawRes?.cards ?? markedRoster) as PlayerCard[];
          resolveRes = await resolveRoster({ finalCards: drawnRoster });
        } catch {
          setGameError("Something went wrong during the draw. Tap to try again.");
          setGameState("HOLD");
          return;
        }
        const drawnRoster = (drawRes?.roster ?? drawRes?.cards ?? markedRoster) as PlayerCard[];
        finalRoster = (resolveRes?.roster ?? resolveRes?.cards ?? drawnRoster) as PlayerCard[];
        mvp = resolveRes?.mvpCardId ?? resolveRes?.mvpId;
      }
      if (mvp) setMvpId(mvp);

      // ── Round-machine decision. Loop back to HOLD (free) or lock to REVEALING.
      //    On lock, the controller runs the once-per-hand economics in
      //    crash-boundary order: lineup_locked → persistLock (generates handId +
      //    writes the single hand_log row + sets currentHandIdRef, awaited) →
      //    charge → entry_fee_committed → rake. resolvedRoster is finalRoster
      //    (post-resolveRoster — actualFp baked), so the persisted record is a
      //    reconstructable owed result; payout derives from the same entryFee
      //    that charge deducts.
      const decision = await commitRound({
        roundsUsed,
        maxRounds,
        userTappedReveal: earlyLock, // B2a: earlyLock = allHeld && maxRounds>1. false on the redraw path (= today); true only when the player taps with every card held
        entryFee: currentBet,
        streak,
        resolvedRoster: finalRoster,
        resolveOutcome: (roster, fee, strk) => {
          const totalFp = (roster as any[]).reduce((s, c) => s + Number((c as any).actualFp ?? 0), 0);
          const t = calculateWinTier(totalFp) ?? "BUST";
          return { totalFp, tier: String(t), payout: (calculatePayoutWithStreak as any)(t, fee, strk) };
        },
        effects: {
          telemetry: (ev, meta) => track("gameplay", ev, { sport: sportKey, hand_number: handCount, ...(meta ?? {}) }),
          persistLock: (rec) => {
            const handId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
              ? crypto.randomUUID()
              : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
            // Bounded: a slow/hung hand_log insert must NOT block REVEALING. ok=true
            // only when the write confirms within PERSIST_TIMEOUT_MS — the controller
            // gates the charge on it (record-before-money). logHandToDb sets
            // currentHandIdRef synchronously before its network insert, so _useReveal's
            // handId linkage holds even when the write is bounded out (and the row may
            // still land later — reconcilable via the entry_fee_skipped handId).
            return boundedPersist(
              () => logHandToDb(rec.roster as any[], rec.totalFp, rec.tier, rec.payout, rec.streak, handId),
              handId,
            );
          },
          charge: (fee) => setBalance(prev => { const next = prev - fee; if (!economyEnabled) return prev; saveBalance(next); return next; }),
          rake: () => setBetNonce(n => n + 1),
        },
      });
      setRoundsUsed(decision.roundsUsed);
      if (decision.next === "HOLD") {
        // Loop back to HOLD for another round. Only the UNHELD (rerolled)
        // replacement cards re-deal; HELD cards are left untouched (already
        // FRONT — beginDraw above only flips unheld). Mirrors the deal/lock
        // nonHeldIds/heldIds split so held cards don't flip face-down and the
        // flipState phase map stays clean for the eventual lock-round reveal.
        // No reveal, no money. (Reroll animation polish = B2.)
        rosterRef.current = finalRoster;
        const loopHeldIds = finalRoster.filter(c => (c as any).wasHeld).map(cardId);
        const loopNonHeldIds = finalRoster.filter(c => !(c as any).wasHeld).map(cardId);
        setNoTransition(true);
        // dealRound keeps held cards FRONT (no eviction → no blink/re-flip) and
        // sets only the new replacements BACK; then we animate ONLY the
        // replacements up. (cf. initCards(subset), which evicted held → default BACK.)
        flipState.dealRound(finalRoster.map(cardId), loopHeldIds);
        setRoster(finalRoster);
        await sleep(50);
        setNoTransition(false);
        for (const id of loopNonHeldIds) flipState.revealCard(id);
        await sleep(50);
        for (const id of loopNonHeldIds) flipState.completeReveal(id);
        setGameState("HOLD");
        return;
      }
      // LOCK → fall through to the reveal-prep choreography + REVEALING below.

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
      const heldIds = finalRoster.filter(c => (c as any).wasHeld).map(cardId);
      // Pre-REVEALING state, atomic: held → FRONT (kept cards stay face-up, no
      // re-flip), every unheld → BACK (revealed one-by-one during REVEALING).
      // Replaces the destructive initCards(nonHeld)+revealCard(held) pattern whose
      // held cards survived only by a same-batch synchronous repair (fragile).
      flipState.dealRound(finalRoster.map(cardId), heldIds);
      setRoster(finalRoster);
      (window as any).debugRoster = finalRoster;
      setStatsFlippedIds(new Set());
      // Seed the gauge baseline so the bar doesn't rebound to 0 at REVEAL
      // entry. Held cards' FP (minus the held anchor — that's the spring's
      // payload) is "already locked in" and the bar should start there
      // rather than at 0. Mirrors the seedFp wired into useEmotionalReveal.
      // No-op when no cards are held (heldSeed = 0).
      const heldList = finalRoster.filter((c: any) => c.wasHeld);
      const heldSeed = heldList.length === 0
        ? 0
        : (() => {
            const sortedDesc = [...heldList].sort(
              (a: any, b: any) => (Number(b.salary ?? 0)) - (Number(a.salary ?? 0)),
            );
            return sortedDesc
              .slice(1)
              .reduce((s, c: any) => s + Number(c.actualFp ?? 0), 0);
          })();
      latestGaugeFpRef.current = heldSeed;
      await sleep(50);
      setNoTransition(false);
      await sleep(50);
      setGameState("REVEALING");
      return;
    }

    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      gameAnalytics.sessionEnd();
      resetReveal();
      resetAllOverlays();
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

  function onWinCelebrationComplete() {
    // handCount is already post-incremented here — the increment fires in
    // _useReveal at hand resolution (single source of truth), not here.
    // handCount-gated surfaces (name_prompt, chad nudges, PWA install,
    // first_share_invitation, etc.) hang off this path.
    if (handCount >= 3 && !localStorage.getItem("replaymod_name_prompted")) {
      // Attention mutex: defer to a later IDLE if another surface is already
      // in-flight. Do NOT set replaymod_name_prompted yet so this can fire on
      // a subsequent celebration when the moment is clear.
      setTimeout(() => {
        if (!tryClaimAttention("name_prompt")) return;
        localStorage.setItem("replaymod_name_prompted", "true");
        setShowNamePrompt(true);
      }, 3500);
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

  // AUTO button: queue every unrevealed unheld card into the tap-reveal
  // pipeline. tapRevealCard's internal queue + mutex (useEmotionalReveal)
  // serializes them, so cards flip ONE BY ONE with the normal animation —
  // not all-at-once like the old skipReveal() shortcut, which made the
  // full FP show before any card had flipped. Held cards continue to fire
  // through their own revealHeldCards flow after the unheld sequence
  // completes (handled inside the reveal hook).
  function autoFlipAll() {
    const unheld = (revealableCards as any[])
      .filter(c => !c.wasHeld)
      .sort((a, b) => (Number(a.salary ?? 0)) - (Number(b.salary ?? 0)));
    for (const c of unheld) {
      if (!tappedCardIds.has(c.cardId)) {
        tapRevealCard(c.cardId);
      }
    }
  }

  function handleButtonClick() {
    if (gameState === "REVEALING") {
      setWasSkipped(true);
      autoFlipAll();
    }
    else {
      if (gameState === "WIN_CELEBRATION") {
        soundManager.stopBigWin();
      }
      setWasSkipped(false);
      onPrimaryAction();
    }
  }

  // Evaluate challenge trigger at WIN_CELEBRATION entry — winTier is valid here
  // (setWinTier fires 1200ms before setGameState("WIN_CELEBRATION") in _useReveal.ts).
  // challengeTrigger is set exactly once per hand resolution (the three
  // setChallengeTrigger sites below). It persists from WIN_CELEBRATION
  // through RESULTS unchanged. The only mid-hand clear is the
  // ChallengeSharePrompt dismiss handler (~L2995 — sets null on dismiss).
  // Between hands the state isn't explicitly cleared at IDLE — it carries
  // its prior value through IDLE/DEALING/HOLD/DRAWING until the next
  // resolution overwrites. (Comment updated 2026-05-25 to descriptive
  // form; prior "At IDLE, challengeTrigger is cleared" wording was
  // aspirational — no IDLE-phase clearer exists in the code.)
  // Guard: skip when playing a received challenge (challengeCtx present).
  //
  // Rivalry-continuation: when challengeBackCtx is set (user just tapped
  // "Send It Back" on a win), force the prompt to render even if the
  // fresh hand wouldn't otherwise qualify. Tag the result with a virtual
  // "rivalry_back" trigger type so isSpecial fires and the prominent
  // prompt strip renders (not the small corner icon).
  useEffect(() => {
    if (gameState === "WIN_CELEBRATION" && !challengeCtx) {
      const resolvedRoster = rosterRef.current as import("@shared/types/index").GeneratedCard[];
      const badges = resolvedRoster.flatMap((c: any) => c.achievements ?? []);
      const fp = resolvedRoster.reduce((s: number, c: any) => s + Number(c.actualFp ?? 0), 0);
      const tier = winTier ?? calculateWinTier(fp) ?? "BUST";
      const topGameTier = (topGameInfoHolder.current?.topGame?.tier ?? null) as
        import("@shared/utils/triggerEvaluation").TopGameTier | null;
      const starBasePlayerId =
        (topGameInfoHolder.current?.star?.basePlayerId as string | undefined) ?? null;
      // Bucket 2 Q3.1 LOCKED 2026-05-24 — propagate the TopGameReason
      // data so selectTopSlotFraming can extract {statLabel} for the
      // RARE_PULL_SEASON bank.
      const topGamePrimaryReason = topGameInfoHolder.current?.topGame?.primaryReason ?? null;
      const topGameAllReasons = topGameInfoHolder.current?.topGame?.allReasons ?? null;
      const result = evaluateTrigger({
        roster: resolvedRoster,
        totalFp: fp,
        winTier: tier,
        badges,
        winTiersMap: adapter.winTiersMap,
        topGameTier,
        starBasePlayerId,
        topGamePrimaryReason,
        topGameAllReasons,
      });

      // QA diagnostic — one log per hand. Includes the inputs the
      // evaluator gates on plus the trigger it chose, so future "why
      // did/didn't the prompt fire?" questions are answerable from the
      // browser console without re-deriving the math. Skipped in
      // challenge mode (already gated by the outer challengeCtx check).
      // eslint-disable-next-line no-console
      console.info("[Trigger:v2] hand evaluation", {
        fp: Math.round(fp * 10) / 10,
        winTier: tier,
        topGameTier,
        per_card: resolvedRoster.map((c: any) => ({
          name: c.name,
          tier: c.tier,
          wasHeld: c.wasHeld === true,
          badge_ids: (c.achievements ?? []).map((a: any) => a.id),
        })),
        trigger: result?.trigger ?? null,   // null = no challenge trigger (ordinary hand)
        headline: result?.headline ?? null,
      });

      if (challengeBackCtx) {
        const targetName = challengeBackCtx.challengerName ?? "your friend";
        setChallengeTrigger({
          trigger: "rivalry_back" as any,
          headline: `Send to ${targetName}.`,
        });
      } else {
        setChallengeTrigger(result);
      }
    } else if (gameState === "IDLE") {
      setChallengeTrigger(null);
    }
  }, [gameState, challengeBackCtx]); // eslint-disable-line

  // Share-headline pick — fires once per (challengeTrigger, winTier).
  //
  // sportAdapter.getShareHeadline now delegates to chadShareTrashTalk
  // (random pick from a brag/default bank) for basketball. Without memo,
  // the inline call would re-roll on every render of the RESULTS phase
  // (animation ticks, state changes, etc.) — the user would see the
  // headline flicker, and the chad ring buffer would burn entries.
  //
  // challengeTrigger is set exactly once per hand (lines ~1803/1808/1811)
  // via setState with a fresh object, then preserved across renders by
  // React state until the next IDLE clears it. Same for winTier. So
  // [challengeTrigger, winTier] is the stable identity key: pick fires
  // once when a new trigger lands, sticks until next hand.
  //
  // Returns undefined when there's no trigger (prompt isn't mounted) or
  // the adapter doesn't implement getShareHeadline (baseball / football
  // today — fallthrough preserved per the existing typeof guard).
  const computedShareHeadline = useMemo(() => {
    if (!challengeTrigger) return undefined;
    if (typeof (sportAdapter as any).getShareHeadline !== "function") return undefined;
    return (sportAdapter as any).getShareHeadline({
      roster: rosterRef.current,
      season: (rosterRef.current[0] as any)?.season ?? "",
      winTier: winTier ?? "BUST",
      trigger: challengeTrigger.trigger,
    });
  }, [challengeTrigger, winTier]); // eslint-disable-line react-hooks/exhaustive-deps

  // Challenge mode post-reveal continuity:
  //   1. WIN_CELEBRATION fires (reveal done, gauge settled, springSettled=true).
  //   2. Tactical Chad chip lands as the commentary override — challenge-aware
  //      framing referencing the matchup.
  //   3. 1500ms later, the comparison sheet auto-slides up on top of the
  //      game surface. No tap required to see the rivalry result.
  //
  // If the user reaches RESULTS directly (e.g. via the score-row double-tap
  // codepath), show the sheet immediately — they're past the breath beat.
  useEffect(() => {
    if (!challengeCtx) return;

    if (gameState === "WIN_CELEBRATION") {
      const resolvedRoster = rosterRef.current as any[];
      const myScore = resolvedRoster.reduce(
        (s: number, c: any) => s + Number(c.actualFp ?? 0), 0,
      );
      const delta = myScore - challengeCtx.targetScore;
      const heldSorted = resolvedRoster
        .filter((c: any) => c.wasHeld)
        .sort((a: any, b: any) => (a.salary ?? 0) - (b.salary ?? 0));
      const topHeld = heldSorted[heldSorted.length - 1];
      const heldAnchor = topHeld
        ? {
            name: String(topHeld.name ?? ""),
            delivered:
              Number(topHeld.actualFp ?? 0) >= Number(topHeld.projectedFp ?? 0),
          }
        : null;
      const namedChallenger = isRealName(challengeCtx.challengerName)
        ? challengeCtx.challengerName
        : null;
      const tacticalLine = chadChallengeTactical({
        heldAnchor,
        delta,
        target: challengeCtx.targetScore,
        challengerName: namedChallenger,
      });
      setFtueCommentaryOverride({ parts: [tacticalLine], sticky: true });

      // Reset collapse + post-result mirrors for the new attempt.
      setComparisonCollapsed(false);
      setPostResultState(null);
      setPostResultTrashTalk(null);

      const t = setTimeout(() => setShowChallengeComparison(true), 1500);
      return () => clearTimeout(t);
    }

    if (gameState === "RESULTS") {
      setShowChallengeComparison(true);
      setComparisonCollapsed(false);
    }
  }, [gameState, challengeCtx]); // eslint-disable-line

  // Clear the post-result UI when the user actually starts playing again
  // (DEAL → IDLE/DEALING/HOLD). The sheet + bar should not bleed into
  // the next hand.
  useEffect(() => {
    if (gameState === "IDLE" || gameState === "DEALING" || gameState === "HOLD") {
      if (showChallengeComparison) setShowChallengeComparison(false);
      if (comparisonCollapsed) setComparisonCollapsed(false);
      if (postResultState) setPostResultState(null);
      if (postResultTrashTalk) setPostResultTrashTalk(null);
    }
  }, [gameState]); // eslint-disable-line

  // ── Challenge CTA handlers ────────────────────────────────────────────
  // Phase 5a commit 1 (2026-05-27): lifted from inline JSX arrows on
  // ChallengeComparisonScreen + ChallengePostResultBar so phase 5a
  // commits 2/3 can pass the same refs to the H2H results overlay.
  // Each handler body is a verbatim copy of the inline version it
  // replaced.

  // Win-state Send It Back: route into a fresh normal hand with
  // challengeBackCtx set. challengeCtx is dropped.
  //
  // Plain arrow (re-created each render) — useCallback was used in the
  // initial lift but trapped first-render scope, causing handleButtonClick
  // and its onPrimaryAction chain to read stale challengeCtx/gameState
  // values. Re-creating each render mirrors the original inline-arrow
  // semantics exactly. See prior-turn investigation report.
  const handleSendItBack = () => {
    if (setChallengeBackCtx && challengeCtx) {
      setChallengeBackCtx({
        challengerUserId: null,
        challengerName: challengeCtx.challengerName ?? null,
        originatingChallengeId: challengeCtx.challengeId,
      });
    }
    clearChallengeCtx?.();
    setShowChallengeComparison(false);
    setComparisonCollapsed(false);
    handleButtonClick();
  };

  // Loss-window-open Try Again: re-deal the SAME challenge snapshot.
  // challengeCtx stays set AND we set the next-deal intent so the
  // IDLE branch picks the snapshot.
  const handleTryAgain = () => {
    challengeNextDealRef.current = true;
    setShowChallengeComparison(false);
    setComparisonCollapsed(false);
    handleButtonClick();
  };

  // Action-bar DEAL / LOSS_CLOSED "Play your own hand": clear
  // challenge mode entirely and deal a fresh normal hand. The IDLE
  // branch uses dealInitialRoster (today's slate) once challengeCtx is
  // null.
  const handlePlayOwnHand = () => {
    clearChallengeCtx?.();
    setShowChallengeComparison(false);
    setComparisonCollapsed(false);
    setPostResultState(null);
    setPostResultTrashTalk(null);
    handleButtonClick();
  };

  // Sheet collapse (×, swipe, backdrop, inner Dismiss CTA). Does NOT
  // clear challengeCtx — the played-hand surface stays mounted with
  // the persistent ChallengePostResultBar action bar.
  const handleChallengeCollapse = () => {
    setComparisonCollapsed(true);
  };

  // Phase 5b commit 3 (2026-05-28): sender-side overlay CTA handler.
  // Wired to H2HSenderReveal's placeholder "Play another hand" button
  // AND to SenderLegacyFallbackCard's CTA when the modern path falls
  // back. Strategy A (commit 3 investigation report H): preserves
  // today's is_winner=true tap behavior (setChallengeBackCtx +
  // handleButtonClick → fresh deal + auto-share as back-challenge)
  // exactly. On is_winner=false, the loss-path CTA is a clean fresh
  // deal with no rivalry-back framing — placeholder behavior that
  // phase 8's social-loop study replaces without unwinding anything.
  const handleSenderPlayAnother = () => {
    const n = senderRevealNotification;
    setSenderRevealNotification(null);
    if (!n) {
      handleButtonClick();
      return;
    }
    const p = n.payload ?? {};
    if (Boolean(p.is_winner) && setChallengeBackCtx) {
      setChallengeBackCtx({
        challengerUserId: typeof p.attempter_user_id === "string" ? p.attempter_user_id : null,
        challengerName: typeof p.attempter_name === "string" ? p.attempter_name : null,
        originatingChallengeId: typeof p.challenge_id === "string" ? p.challenge_id : "",
      });
    }
    // challengeCtx is null in normal play; IDLE branch deals from
    // today's slate. Same call shape today's win-path tap used.
    handleButtonClick();
  };

  // Chad welcome on first transition from challenge play to normal play.
  // Fires once per browser per sport when:
  //   1. The user has been in challenge mode (challengeCtx was set this
  //      session), AND
  //   2. They're now in normal play (challengeCtx + challengeBackCtx
  //      both null), AND
  //   3. Game state is IDLE / DEALING (entering a new hand), AND
  //   4. The local seen-flag hasn't been set yet.
  // Plays via setFtueCommentaryOverride so it lands as a chip on the
  // game surface alongside the daily season-reel intro.
  const enteredChallengeModeRef = useRef(false);
  useEffect(() => {
    if (challengeCtx) enteredChallengeModeRef.current = true;
  }, [challengeCtx]);
  useEffect(() => {
    if (challengeCtx || challengeBackCtx) return;
    if (!enteredChallengeModeRef.current) return;
    if (gameState !== "IDLE" && gameState !== "DEALING") return;
    const key = `replaymod_normal_play_welcome_seen_${sportKey}`;
    try {
      if (localStorage.getItem(key) === "1") return;
      localStorage.setItem(key, "1");
    } catch { return; }
    setFtueCommentaryOverride({ parts: [chadNormalPlayWelcome()], sticky: true });
  }, [gameState, challengeCtx, challengeBackCtx, sportKey]); // eslint-disable-line

  // ── JSX ───────────────────────────────────────────────────────────
  // NOTE: this useMemo MUST stay above the early returns below. React's
  // rules-of-hooks require the same hook-call sequence on every render —
  // if `!dataReady` short-circuits before this useMemo runs, the next
  // render (when dataReady flips true) will call one extra hook and
  // trigger React error #310 ("Rendered more hooks than during the
  // previous render"). Keep all hooks above the conditional returns.
  // Inject getTodaysStars into the GameBar legend (keeps the bonus-pool
  // "Today's Stars" row in sync with the live daily rotation).
  // `dataReady` is in the deps array even though the memo body doesn't
  // reference it directly: this memo lives above the `!dataReady` early
  // return (required for React #310 — see PR #21), so on the first render
  // `getTodaysStars()` throws (data not loaded yet) and the memo caches the
  // plain `gameBarLegend` fallback. Both `gameBarLegend` and `getTodaysStars`
  // are module-stable references, so without `dataReady` the memo would
  // never recompute and `todaysStars` would stay empty forever. Adding
  // `dataReady` forces a recompute when data loads (false→true), at which
  // point `getTodaysStars()` returns the real bonus-pool stars.
  const legendWithStars = useMemo(() => {
    try {
      const stars = getTodaysStars();
      if (stars.length > 0) return { ...gameBarLegend, todaysStars: stars };
    } catch { /* data not loaded yet */ }
    return gameBarLegend;
  }, [gameBarLegend, getTodaysStars, dataReady]);

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
          {/* Solo play-surface header = platinum band (matches the challenge
              GlobalChallengeHeader look); gated on !challengeCtx so the
              challenge-via-GameView header keeps its existing dark glass (the
              challenge platinum comes from GlobalChallengeHeader elsewhere).
              onLight drives AppHeader's dark-on-light inversion in lockstep. */}
          <div data-ftue-chrome="true" style={{
            borderRadius: 16,
            border: !challengeCtx ? "1px solid rgba(0,0,0,0.12)" : "1px solid rgba(255,255,255,0.10)",
            background: !challengeCtx ? PLATINUM_BAND_GRADIENT : "rgba(255,255,255,0.05)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
            padding: "2px 12px",
            backdropFilter: "blur(10px)",
          }}>
            <AppHeader
              onLight={!challengeCtx}
              onCollect={() => setShowCollect(true)}
              onProfile={() => {
                setShowProfile(true);
                clearNewlyUnlockedAchievements();
                track("profile", "profile_self_view", { sport: adapter.sportKey });
              }}
              hasUncollected={taskStates.some(t => t.progress >= t.target && !t.collected)}
              // Combined unread count: inbox messages + challenge
              // notifications. Bell badge surfaces both signals.
              unreadInboxCount={unreadCount + challengeUnreadCount}
              onBell={() => {
                // Route challenge notifications to NotificationsPanel.
                // If there are unread challenge notifications, open
                // that surface; otherwise fall back to the existing
                // inbox sheet so legacy inbox messages stay reachable.
                if (challengeUnreadCount > 0) {
                  setShowNotifications(true);
                  track("nav", "bell_clicked", { unread_count: challengeUnreadCount, source: "notifications" }, "system");
                } else {
                  setBellOpen(true);
                  track("nav", "bell_clicked", { unread_count: unreadCount, source: "inbox" }, "system");
                }
              }}
              hasNewAchievements={newlyUnlockedAchievements.length > 0}
            />
          </div>
          <div data-ftue-chrome="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 12px" }}>
            {challengeCtx ? (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 999,
                background: "rgba(255,177,74,0.10)",
                border: "1px solid rgba(255,177,74,0.35)",
                color: "#FFB14A", fontSize: 11, fontWeight: 900, letterSpacing: 0.8,
                fontFamily: "'Inter', system-ui, sans-serif",
              }}>
                TARGET: {challengeCtx.targetScore.toFixed(1)}
                {isRealName(challengeCtx.challengerName) && ` — ${challengeCtx.challengerName}`}
              </div>
            ) : (
              <>
                {/* BONUS POOL paused for the F2P layer (economyEnabled=false):
                    the surface is hidden AND the 5% rake stops accruing — the
                    sole contributeBet() call site lives inside BonusPoolPill, so
                    not rendering it pauses the rake. The store
                    (bonusPoolStore.ts) is intact and re-wireable. SlateChip is a
                    non-economy surface and stays. */}
                {economyEnabled && (
                  <BonusPoolPill
                    betAmount={currentBet}
                    betNonce={betNonce}
                    sportKey={sportKey}
                    competition={adapter.competition}
                    economyEnabled={economyEnabled}
                    onAmountChange={(v) => { bonusPoolRef.current = v; }}
                  />
                )}
                {SlateChipComponent && <SlateChipComponent />}
              </>
            )}
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
                    onTapReveal={tapRevealCard}
                    heldFpVisible={heldFpVisible}
                    heldRevealedIds={heldRevealedIds}
                    tappedCardIds={tappedCardIds}
                    isRevealingPhase={gameState === "REVEALING"}
                    topGameStarBasePlayerId={topGameInfo.star?.basePlayerId ?? null}
                    topGameTier={topGameInfo.topGame.tier as any}
                    topGameResult={topGameInfo.topGame as any}
                    columns={rosterGridColumns}
                    CardComponent={CardComponent as React.ComponentType<RosterGridCardProps>}
                    slotLabels={slotLabels}
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
              pointerEvents: "auto" as const,
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
                  const amountWagered = BASE_BET * effectiveBetMultiplier;
                  const net = winPayout - amountWagered;
                  const netPositive = net > 0;
                  const netColor = netPositive ? "#7FFF00" : "#FF3B30";
                  const netLabel = netPositive ? `+$${net}` : `-$${Math.abs(net)}`;
                  const FF = "'Rajdhani','Oswald','Arial Narrow',sans-serif";
                  const tierMult = winTiersMap[winTier as WinTierKey]?.multiplier ?? 0;
                  const streakMult = getStreakMultiplier(effectiveStreak);
                  const showStreakFactor = streakMult > 1;
                  // Phase 1 trigger split (2026-06-03): renamed bad_beat
                  // → choke. challengeTrigger.trigger now emits "choke"
                  // (live evaluator post-rename); TeamStampKind union now
                  // accepts "choke" instead of "bad_beat".
                  // Near-miss stamp rides the gauge's standalone 5% band
                  // (computeGaugeState + NEAR_MISS_BAND) — the SAME signal the
                  // post-reveal copy already uses (GameView ~3177) — instead of
                  // the challenge trigger. This decouples the solo reveal stamp
                  // from challenge creation so it survives the miss-trigger
                  // removal. Behavior-neutral: the gauge's isNearMiss has no tier
                  // floor, so we re-impose the trigger's STARTER+ floor here
                  // (the miss trigger never fired on ROOKIE/BUST near-misses).
                  // choke stays on the challenge trigger (not being removed).
                  const nmSnap = computeGaugeState(displayFp, gaugeThresholds, winTier, NEAR_MISS_BAND);
                  const isStarterPlusMiss = nmSnap.isNearMiss
                    && (winTier === "STARTER" || winTier === "ALL_STAR" || winTier === "MVP");
                  const stampKind =
                    challengeTrigger?.trigger === "choke" ? "choke" :
                    isStarterPlusMiss ? "miss" :
                    null;
                  return (
                    <>
                      <div style={{ position: "relative", display: "inline-flex", maxWidth: "100%" }}>
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
                        {stampKind && (
                          <div style={{
                            position: "absolute",
                            left: "50%", top: "50%",
                            pointerEvents: "none",
                            zIndex: 5,
                          }}>
                            <TeamStamp
                              kind={stampKind}
                              missTier={stampKind === "miss" ? (nmSnap.nextTier ?? undefined) : undefined}
                              delayMs={200}
                            />
                          </div>
                        )}
                      </div>
                      <div style={{ animation: "tierInfoFadeIn 300ms ease both", display: "flex", justifyContent: "center", alignItems: "center", gap: 20, marginTop: 4, width: "100%" }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: "#FFFFFF", fontFamily: FF, letterSpacing: "-0.5px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                          {displayFp.toFixed(1)} FP
                          {teamBonusFp > 0 && (
                            <span style={{ marginLeft: 6, fontSize: 13, fontWeight: 700, color: "#FFD700", letterSpacing: 0 }}>
                              (+{teamBonusFp})
                            </span>
                          )}
                        </span>
                        {ceilingPct != null && (
                          <span style={{ fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.45)", fontFamily: FF, lineHeight: 1, alignSelf: "center" }}>
                            {ceilingPct}% ceiling
                          </span>
                        )}
                        {/* F2P: the wager net / payout $ display is hidden when the
                            economy is off (the wallet never moves). FP + ceiling
                            still show. */}
                        {!challengeCtx && economyEnabled && (
                          winTier === "BUST" ? (
                            <span style={{ fontSize: 20, fontWeight: 700, color: netColor, fontFamily: FF, letterSpacing: "-0.5px", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                              {netLabel}
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, fontFamily: FF }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)", lineHeight: 1, letterSpacing: 0.3, fontVariantNumeric: "tabular-nums" }}>
                                {tierMult}×{showStreakFactor ? ` × ${streakMult}×` : ""} →
                              </span>
                              <span style={{ fontSize: 20, fontWeight: 700, color: "#7FFF00", lineHeight: 1, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>
                                +${winPayout}
                              </span>
                            </span>
                          )
                        )}
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
                          <div style={{ fontSize: 26, fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: -1, fontStyle: "italic", display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                            {/* displayFp (frozen-aware) tracks the gauge bar: pinned during
                                anchor count-up, springs to total via the held-anchor spring,
                                then locks at lockedGaugeFpRef. Without this, the held anchor's
                                FP stays missing from the label until gameState flips to
                                WIN_CELEBRATION 1200ms after spring settle, even though the
                                gauge bar visually reaches the full total. */}
                            <RollingNumber value={displayFp} decimals={1} duration={300} />
                            {/* Mount the bonus pill from the start of the hand so RollingNumber
                                can animate 0 → N when the first bonus card lands. Hide via opacity
                                until there's something to show — avoids "(+0)" sitting on screen. */}
                            <span style={{
                              fontSize: 13, fontWeight: 800, color: "#FFD700", letterSpacing: 0, fontStyle: "normal",
                              display: "inline-flex", alignItems: "baseline",
                              opacity: teamBonusFp > 0 ? 1 : 0,
                              transition: "opacity 250ms ease",
                            }}>
                              (+<RollingNumber value={teamBonusFp} decimals={0} duration={300} />)
                            </span>
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
                {gameState === "HOLD" && !challengeCtx && multiplierEnabled && (
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
              pointerEvents: "auto" as const,
            }}
          >
            <TierGauge
              totalFp={gaugeTotalFp}
              thresholds={gaugeThresholds}
              winTier={undefined}
              lastCardFp={lastCardFp}
              isSkip={false}
              visible
              regularFinalCardKick={regularFinalGaugeKick}
              onTierCross={undefined}
              postRevealCopy={postRevealCopy}
              missTier={challengeTrigger?.nearMissNextTier ?? undefined}
              commentaryOverride={(showCollect || showLeaderboard || showProfile) ? null : ftueCommentaryOverride}
              hideBar={gameState === "IDLE" || gameState === "DEALING" || gameState === "HOLD" || gameState === "DRAWING"}
              onCommentaryOverrideDone={() => {
                setFtueCommentaryOverride(null);
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
              {showCollect && (
                (() => {
                  const bonusPlayers = getTodaysStars();
                  return (
                    <Suspense fallback={null}>
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
                          track("leaderboard", "viewed", { source: "collect_screen" });
                        }}
                        recordLeaderboardViewed={recordLeaderboardViewed}
                        onClose={() => setShowCollect(false)}
                        onCollect={(id) => { collectTask?.(id); }}
                      />
                    </Suspense>
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
        betMultiplier={effectiveBetMultiplier}
        baseBet={BASE_BET}
        challengeMode={!!challengeCtx}
        winTiers={gameBarWinTiers}
        legend={legendWithStars}
        sportKey={sportKey}
        hideTierBar
        showBetMultiplier={multiplierEnabled}
        onBetMultiplier={setBetMultiplier}
        onAction={handleButtonClick}
        // Two-button result row: when a story trigger exists in sender mode, show a
        // compact "Challenge" button beside REPLAY (REPLAY stays permanent). Default
        // off ⇒ non-challenge sports/states keep the single-REPLAY row unchanged.
        // onChallenge starts the send via the invisible prompt's startSend() handle.
        challengeAvailable={!challengeCtx && !!challengeTrigger && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION")}
        onChallenge={() => challengeSendRef.current?.startSend()}
        celebration={celebrationData}
        onWinCelebrationComplete={onWinCelebrationComplete}
        onWageAnimationComplete={() => {
          pendingBalanceUpdateRef.current?.();
          pendingBalanceUpdateRef.current = null;
        }}
        replayPulse={(gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && springSettled}
        splitFooter={{ multipliersHost, controlsHost }}
        splitMultiplierRowVisible={isPreRevealFooter}
        onViewLeaderboard={() => {
          setShowLeaderboard(true);
          setTrophyPulsing(false);
          setTrophyBurst(false);
          // Durable acknowledgement — kills the iconBlink pulse loop
          // across all future hands until rm_on_board_today drops to
          // "0" and flips back to "1" (a fresh entry edge).
          try { localStorage.setItem("rm_board_ack", "1"); } catch { }
          setFtueCommentaryOverride(null);
          track("leaderboard", "viewed", { source: "gamebar_trophy" });
        }}
        legendPulsing={legendGold}
        trophyPulsing={trophyPulsing}
        trophyBurst={trophyBurst}
        streak={streak}
        showStreak={streaksEnabled}
        economyEnabled={economyEnabled}
        streakTiers={streakTiers}
        onLegendOpened={() => {
          const today = new Date().toISOString().slice(0, 10);
          localStorage.setItem("replaymod_legend_seen_date", today);
          setLegendGold(false);
        }}
        onTrophyOpened={() => {
          setTrophyPulsing(false);
          setTrophyBurst(false);
          try { localStorage.setItem("rm_board_ack", "1"); } catch { }
        }}
        onBurstEnd={() => setTrophyBurst(false)}
      />

      {/* Lazy-loaded overlays — single Suspense boundary; fallback is null
          because each overlay is itself a transient modal that only mounts
          when its flag fires. Showing nothing while a chunk loads is the
          right behavior (chunk loads in <100ms on warm cache). */}
      <Suspense fallback={null}>
        {showLeaderboard && (
          <LeaderboardScreen
            currentUid={getPlayerUid()}
            sport={leaderboardScope}
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

        {showNotifications && user && (
          <NotificationsPanel
            notifications={challengeNotifications}
            onClose={() => {
              // Mark everything read when the panel closes so the badge
              // clears. Backend update happens via markNotificationsRead.
              void markNotificationsRead();
              setShowNotifications(false);
              setNotifRefreshNonce(n => n + 1);
            }}
            onTapNotification={(n: ChallengeNotification) => {
              if (n.type !== "challenge_attempted") return;
              const isWinner = Boolean(n.payload?.is_winner);
              // Phase 5b commit 3 (2026-05-28): both paths now mount the
              // sender-side overlay (H2HSenderReveal). The win-path's
              // setChallengeBackCtx + handleButtonClick block moved into
              // handleSenderPlayAnother below — fires only when the
              // user taps the placeholder CTA, AND only when
              // is_winner=true (Strategy A: preserve today's win-path
              // behavior exactly; loss-path CTA is a clean new placeholder
              // with no rivalry-back baked in, leaving the social-loop
              // decision to phase 8 per the parked Q1 lock).
              setShowNotifications(false);
              void markNotificationsRead();
              setNotifRefreshNonce(x => x + 1);
              track("challenges", "notification_tap", { type: n.type, actionable: isWinner });
              setSenderRevealNotification(n);
            }}
          />
        )}

        {showProfile && (
          <ProfileScreen
            currentUid={getPlayerUid()}
            sport={leaderboardScope}
            economyEnabled={economyEnabled}
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

        {/* PWA install prompt — gated by attention mutex so it doesn't stack
            on top of chad commentary / register modal / name prompt. */}
        {(gameState === "IDLE" || gameState === "RESULTS") && (
          <PwaInstallPrompt
            active={handCount >= 3}
            tryClaimAttention={tryClaimAttention}
            releaseAttention={releaseAttention}
          />
        )}

        {/* Registration modal — normal context per U7 of the phase 5b
            piece 1 unification lock (2caa7a3). Fires from the trigger
            block at GameView.tsx:854-870 (MVP/LEGEND wins, hand≥5). The
            challenge context's RegisterModal is mounted by
            ChallengeSharePrompt itself, not from here. */}
        {showRegisterModal && (
          <RegisterModal
            context="normal"
            onClose={() => setShowRegisterModal(false)}
            onSuccess={() => setShowRegisterModal(false)}
            signUp={signUp}
            linkGoogle={linkGoogle}
            signIn={signIn}
            signInGoogle={signInGoogle}
          />
        )}
      </Suspense>

      {/* PostHandSheet — optional, sport-specific overlay. Suppressed in
          challenge mode so it doesn't collide with ChallengeComparisonScreen.
          The challenge head-to-head sheet IS the post-hand surface for the
          recipient; running both would double-up the result frame. */}
      {PostHandSheet && !challengeCtx && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier && springSettled && (() => {
        const gaugeSnap = computeGaugeState(displayFp, gaugeThresholds, winTier, NEAR_MISS_BAND);
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
            onViewLeaderboard={() => {
              setShowLeaderboard(true);
              track("leaderboard", "viewed", { source: "post_hand" });
            }}
          />
        );
      })()}

      {/* Sender ChallengeSharePrompt — mounted as an INVISIBLE send-owner: it
          renders only its modals (name/auth/delivery). The visible affordance is
          GameBar's "Challenge" button, which calls challengeSendRef.startSend()
          (= the prompt's onCtaTap). Sender mode only (!challengeCtx — recipient
          mode has its own h2h slot owners). Mount location is presentation-neutral
          (the component renders nothing in-flow; its modals are fixed/inset:0).
          Send machinery byte-identical; onConsumed/onDismiss clear the trigger. */}
      {/* Phase 2-mount Step 4: boss entry CTA — sibling on the post-results
          strip. Gated on basketball + a resolved boss id (NOT challengeTrigger,
          so it shows on EVERY basketball result, not just special hands). Hidden
          while playing a received challenge (challengeCtx). Conditional
          unattempted/attempted lives in BossEntryCta. */}
      {!challengeCtx && sportKey === "basketball" && bossEntry.bossChallengeId
        && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && springSettled && (
        <BossEntryCta
          sport={sportKey}
          bossChallengeId={bossEntry.bossChallengeId}
          bossPlayerCount={bossEntry.bossPlayerCount}
        />
      )}

      {!challengeCtx && challengeTrigger && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && (
        <Suspense fallback={null}>
          <ChallengeSharePrompt
            ref={challengeSendRef}
            sport={sportKey}
            season={(rosterRef.current[0] as any)?.season ?? ""}
            totalFp={rosterRef.current.reduce((s: number, c: any) => s + Number(c.actualFp ?? 0), 0)}
            winTier={winTier ?? "BUST"}
            roster={rosterRef.current as import("@shared/types/index").GeneratedCard[]}
            initialRoster={initialRosterRef.current}
            badges={rosterRef.current.flatMap((c: any) => c.achievements ?? [])}
            winTiersMap={adapter.winTiersMap}
            serializeRoster={(cards) => sportAdapter.serializeRoster(cards)}
            triggerResult={challengeTrigger}
            rivalryTargetName={challengeBackCtx?.challengerName ?? null}
            shareHeadline={computedShareHeadline}
            handId={currentHandIdRef.current ?? undefined}
            onDismiss={() => {
              setChallengeTrigger(null);
              if (challengeBackCtx) clearChallengeBackCtx?.();
            }}
            // Terminal SEND: the delivery modal's only dismiss route (its ✕)
            // clears the trigger → the invisible owner unmounts; REPLAY (permanent)
            // remains. Cleared AFTER send success only — createChallenge's
            // `if (!cid) return` keeps a failed write from reaching the modal/clear.
            onConsumed={() => {
              setChallengeTrigger(null);
              if (challengeBackCtx) clearChallengeBackCtx?.();
            }}
          />
        </Suspense>
      )}

      {/* ChallengeComparisonScreen — bottom sheet shown at RESULTS when
          the user is playing a received challenge (challengeCtx present).
          Played hand + game bar (with TARGET) stay visible behind the sheet.
          Submits the attempt, shows score vs. challenger, and offers
          Send It Back or Play Fresh. */}
      {showChallengeComparison && challengeCtx && !challengeCtx.resolvedSenderHand && (
        <Suspense fallback={null}>
          <ChallengeComparisonScreen
            challengeCtx={challengeCtx}
            myScore={rosterRef.current.reduce((s: number, c: any) => s + Number(c.actualFp ?? 0), 0)}
            myRoster={rosterRef.current as import("@shared/types/index").GeneratedCard[]}
            myWinTier={winTier ?? "BUST"}
            sport={sportKey}
            collapsed={comparisonCollapsed}
            onCollapse={handleChallengeCollapse}
            onSendItBack={handleSendItBack}
            onTryAgain={handleTryAgain}
            onPlayAgain={handlePlayOwnHand}
            onResolved={({ state, trashTalk }) => {
              setPostResultState(state);
              setPostResultTrashTalk(trashTalk);
            }}
          />
        </Suspense>
      )}

      {/* H2H reveal arc + results overlay — phase 5a commit 3 (2026-05-27).
          Mount-gated on resolvedSenderHand presence; the comparison
          sheet above is gated on its ABSENCE. Mutual exclusion prevents
          both surfaces from firing the useChallengeAttempt POST in the
          common case. Adapter renderers required — sports without H2H
          wired leave them undefined and the wrapper returns null. */}
      {challengeCtx
        && (gameState === "REVEALING" || gameState === "RESULTS")
        && adapter.h2hArcRenderer
        && adapter.h2hOverlayRenderer && (
        <Suspense fallback={null}>
          <H2HRecipientReveal
            challengeCtx={challengeCtx}
            myScore={rosterRef.current.reduce((s: number, c: any) => s + Number(c.actualFp ?? 0), 0)}
            myRoster={rosterRef.current as import("@shared/types/index").GeneratedCard[]}
            myWinTier={winTier ?? "BUST"}
            gameState={gameState}
            sport={sportKey}
            renderBattlefieldCard={adapter.h2hArcRenderer}
            renderOverlayCard={adapter.h2hOverlayRenderer}
            onSendItBack={handleSendItBack}
            onTryAgain={handleTryAgain}
            onPlayOwnHand={handlePlayOwnHand}
            onDismiss={handlePlayOwnHand}
          />
        </Suspense>
      )}

      {/* H2H sender-side overlay — phase 5b commit 3 (2026-05-28).
          Mounted when the user taps a `challenge_attempted` notification.
          The wrapper handles its own loading + legacy fallback states
          internally (fetches its own sender-hand, falls back to
          SenderLegacyFallbackCard on miss). Adapter renderer required
          — sports without H2H wired leave h2hOverlayRenderer undefined
          and the wrapper doesn't mount. */}
      {senderRevealNotification && adapter.h2hOverlayRenderer && (
        <Suspense fallback={null}>
          <H2HSenderReveal
            payload={senderRevealNotification.payload}
            renderCard={adapter.h2hOverlayRenderer}
            onPlayAnother={handleSenderPlayAnother}
            onDismiss={() => setSenderRevealNotification(null)}
          />
        </Suspense>
      )}

      {/* Persistent post-result action bar — visible when the comparison
          sheet has been collapsed via gesture (×, swipe, backdrop) or
          inner "Dismiss" CTA. challengeCtx stays set so cards remain on
          the game surface. The bar persists until the user enters a
          new hand. */}
      {challengeCtx && comparisonCollapsed && postResultState && (
        gameState === "RESULTS" || gameState === "WIN_CELEBRATION"
      ) && (
        <Suspense fallback={null}>
          <ChallengePostResultBar
            state={postResultState}
            trashTalk={postResultTrashTalk}
            onSeeResult={() => setComparisonCollapsed(false)}
            onSendItBack={handleSendItBack}
            onTryAgain={handleTryAgain}
            onDeal={handlePlayOwnHand}
          />
        </Suspense>
      )}

      {/* ?debug=1 overlay lives at the app shell level (basketball/src/App.tsx)
          so it renders on every route, including the chooser landing and
          the challenge landing screen before GameView mounts. Don't
          re-render here — would stack two copies in-game. */}

    </div>
  );
}
