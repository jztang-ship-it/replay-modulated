/**
 * GameView.tsx
 * Orchestration only. No flip logic lives here.
 * Flip state is owned by useCardFlipState.
 * Reveal sequence is owned by useEmotionalReveal.
 */

import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { sportAdapter } from "../adapters/SportAdapter";
import { dealInitialRoster, redrawRoster, resolveRoster } from "../adapters/gameAdapter";
import { CoachLayer } from "@shared/components/CoachLayer";
import type { FTUETextConfig } from "@shared/components/CoachLayer";
import { useFTUE } from "@shared/hooks/useFTUE";
import { dealFTUERoster, redrawFTUERoster, resolveFTUERoster } from "../adapters/ftueRoster";
import { ensureLoaded } from "../engines/dataEngine";
import { RosterGrid } from "../components/RosterGrid";
import { AppHeader } from "../components/AppHeader";
import { resetAllOverlays } from "../components/BaseballCard";
import { GameBar, type CelebrationData } from "../components/GameBar";
import { useCardFlipState } from "../hooks/useCardFlipState";
import { useEmotionalReveal, type RevealableCard } from "../hooks/useEmotionalReveal";
import { calculateWinTier, calculatePayout, BASEBALL_WIN_TIERS, type WinTier } from "../utils/payoutLogic";

import { useGameAnalytics } from "@shared/analytics/useGameAnalytics";
import { HotStreakOverlay } from '@shared/engagement/HotStreakOverlay';
import { CollectScreen } from '@shared/engagement/CollectScreen';
import { TierGauge, computeGaugeState } from '@shared/components/TierGauge';
import { useEngagement } from '@shared/engagement/useEngagement';
import { CoinDisplay } from '@shared/engagement/CoinDisplay';
import { DailyTasksPanel } from '@shared/engagement/DailyTasksPanel';
import { XPBar } from '@shared/engagement/XPBar';
import { soundManager } from '@shared/utils/soundManager';
import { audioDirector } from '@shared/utils/audioDirector';
import { getPlayerUid, getNickname, setNickname, getSessionId } from '@shared/utils/playerIdentity';
import { buildScoreProof } from '@shared/utils/scoreProof';
import { PostHandSheet } from '@shared/components/PostHandSheet';
import { LeaderboardScreen } from '@shared/components/LeaderboardScreen';
import { ProfileScreen } from '@shared/components/ProfileScreen';
import { useAuth } from "@shared/auth/useAuth";
import { BellSheet } from "@shared/inbox/BellSheet";
import { FeedbackModal } from "@shared/inbox/FeedbackModal";
import { listMessages } from "@shared/inbox/inbox";
import { track } from "@shared/analytics/analytics";
import { selectCommentary } from "@shared/commentary/selectCommentary";
import type { CommentaryOutput } from "@shared/commentary/types";
import { chadMessage } from "@shared/commentary/chad";
import { captureReferrerFromUrl, applyReferral, claimReferral } from "@shared/utils/referral";
// buildBaseballContext — culture injection now handled inside selectCommentary

// Test-wire only: allow passing glow props even if wrapper prop types lag behind.
const RosterGridAny = RosterGrid as any;

const CAP_MAX = sportAdapter.salaryCap;
const ROSTER_SIZE = sportAdapter.rosterSize;
const STARTING_BALANCE = 100000;
const MIN_BALANCE_FLOOR = 500; // auto-refill for testing if balance runs too low

// ── Reveal mode toggle ─────────────────────────────────────────────────────
// "auto" = cards flip automatically in sequence (original behaviour)
// "tap"  = user taps each unheld card to reveal it; held FP fades in at end
const REVEAL_MODE: "auto" | "tap" = "tap";

function loadBalance(): number {
  try {
    const v = localStorage.getItem("replaymod_balance");
    const n = v ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= MIN_BALANCE_FLOOR) return n;
    return STARTING_BALANCE; // reset if missing, NaN, or below floor
  } catch { return STARTING_BALANCE; }
}
function saveBalance(v: number) {
  try { localStorage.setItem("replaymod_balance", String(v)); } catch { }
}

/** Scales the 2×3 roster so both rows always fit the middle grid row (no clipping onto Team FP). */
function RosterGridScaleFit({ children }: { children: ReactNode }) {
  const portRef = useRef<HTMLDivElement>(null);
  const measRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const port = portRef.current;
    const meas = measRef.current;
    if (!port || !meas) return;
    const run = () => {
      const pw = port.clientWidth;
      const ph = port.clientHeight;
      const mw = meas.scrollWidth;
      const mh = meas.scrollHeight;
      if (!pw || !ph || !mw || !mh) return;
      // Cap at 1.15 — allows cards to scale UP and fill ghost space on tall
      // phones, matching basketball's behaviour. See basketball/GameView.tsx.
      setScale(Math.min(1.15, pw / mw, ph / mh));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(port);
    ro.observe(meas);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div
      ref={portRef}
      data-ftue-anchor="roster"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        ref={measRef}
        data-ftue-anchor="roster-inner"
        style={{
          width: "100%",
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
const BASE_BET = 10;

// ── Bonus pool constants ──────────────────────────────────────────────────
const BONUS_POOL_SEED = 1_000;
const BONUS_POOL_BET_RAKE = 0.05;   // 5% of each bet added to pool
const TICK_INTERVAL_MS = 3000;
const TICK_AMOUNT = 0.01;

type GameState =
  | "IDLE" | "DEALING" | "HOLD" | "DRAWING"
  | "REVEALING" | "RESULTS" | "WIN_CELEBRATION";

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function submitToLeaderboard(metric: string, value: number, extra?: Record<string, unknown>) {
  const uid = getPlayerUid();
  const nickname = getNickname();
  if (!uid || value <= 0) return;
  try {
    await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", metric, value, uid, nickname, session_id: getSessionId(), ...extra }),
    });
  } catch { } // Non-critical — never block game flow
}

function cardId(card: any): string {
  return String(card?.cardId ?? card?.basePlayerId ?? "");
}

function sumSalary(roster: PlayerCard[]) {
  return roster.reduce((s, c: any) => s + Number(c?.salary ?? 0), 0);
}

function createPlaceholders(): PlayerCard[] {
  return Array.from({ length: ROSTER_SIZE }, (_, i) => ({
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

const GAUGE_THRESHOLDS = [
  { tier: "ROOKIE",   minFP: 148 },
  { tier: "STARTER",  minFP: 178 },
  { tier: "ALL_STAR", minFP: 208 },
  { tier: "MVP",      minFP: 240 },
  { tier: "LEGEND",     minFP: 280 },
];
const NEAR_MISS_FP = 5;

/** Must match salary → tier thresholds in shared/components/CardFront.tsx (derivedTier). */
function tierFromSalary(salary: number): string {
  const s = Number(salary ?? 0);
  return s >= 52 ? "ORANGE" : s >= 40 ? "PURPLE" : s >= 28 ? "BLUE" : s >= 16 ? "GREEN" : "WHITE";
}

function toRevealableCards(cards: PlayerCard[]): RevealableCard[] {
  return cards.map(c => {
    const salary = Number((c as any).salary ?? 0);
    return {
      cardId: cardId(c),
      slotIndex: c.slotIndex ?? 0,
      actualFp: Number(c.actualFp ?? 0),
      projectedFp: Number(c.projectedFp ?? 0),
      salary,
      tier: tierFromSalary(salary),
      wasHeld: (c as any).wasHeld ?? false,
      badges: (c.achievements ?? []).map((a: any) => ({
        id: a.id, icon: a.icon || "⭐", label: a.label, fp: a.fp || 0,
      })),
    };
  });
}

// ── RollingNumber — animates between numeric values ──────────────────────
function RollingNumber({ value, decimals = 0, duration = 400 }: { value: number; decimals?: number; duration?: number }) {
  const [displayed, setDisplayed] = useState(value);
  const rafRef = useRef<number>(0);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (Math.abs(end - start) < 0.05) { setDisplayed(end); prevRef.current = end; return; }
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(start + (end - start) * eased);
      if (progress < 1) { rafRef.current = requestAnimationFrame(animate); }
      else { setDisplayed(end); prevRef.current = end; }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]); // eslint-disable-line
  return <>{displayed.toFixed(decimals)}</>;
}

// ── Tier flip display helpers ──────────────────────────────────────
function deriveTierFromFp(fp: number): string {
  if (fp >= 280) return "LEGEND";
  if (fp >= 240) return "MVP";
  if (fp >= 208) return "ALL_STAR";
  if (fp >= 178) return "STARTER";
  if (fp >= 148) return "ROOKIE";
  return "BUST";
}

// ── Spring oscillation waypoints ────────────────────────────────────────────
const SPRING_TIERS = [
  { name: "BUST",     lo: 0,   hi: 148 },
  { name: "ROOKIE",   lo: 148, hi: 178 },
  { name: "STARTER",  lo: 178, hi: 208 },
  { name: "ALL_STAR", lo: 208, hi: 240 },
  { name: "MVP",      lo: 240, hi: 280 },
  { name: "LEGEND",     lo: 280, hi: 9999 },
];
const SPRING_TIER_SPAN = 20.0;

/** Compute spring amplitude based on where finalFp lands relative to tier boundaries */
function computeSpringAmplitude(finalFp: number): number {
  const tier = SPRING_TIERS.find(t => finalFp >= t.lo && finalFp < t.hi)
    ?? SPRING_TIERS[SPRING_TIERS.length - 1];
  const margin = finalFp - tier.lo;
  const marginNorm = Math.min(1, margin / SPRING_TIER_SPAN);
  const fpNorm = Math.min(1, Math.max(0, (finalFp - 155) / 80));
  const baseAmp = 4.0 + fpNorm * 6.0;
  const marginFactor = 1.0 - marginNorm * 0.75;
  const rawAmplitude = baseAmp * marginFactor;
  // Hard cap: never let the spring push past the current tier ceiling.
  // Without this, a score near the top of a tier (e.g. 167 in ROOKIE 155-175)
  // makes the bar visually shoot to near-100% fill then snap back.
  // Leave 0.5 FP of clearance. GOAT tier has no ceiling so skip cap there.
  const headroom = tier.hi === 9999 ? rawAmplitude : Math.max(0, tier.hi - finalFp - 0.5);
  return Math.min(rawAmplitude, headroom);
}

const TIER_IMAGE_MAP: Record<string, string> = {
  BUST: "bust1.png",
  ROOKIE: "Rookie2.png",
  STARTER: "Starter3.png",
  ALL_STAR: "All_Star_4.png",
  MVP: "MVP5.png",
  LEGEND: "LEGEND6.png",
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
      22% { transform: scale(1.45) translateY(2px); opacity: 1; }
      38% { transform: scale(0.85) translateY(-1px); opacity: 1; }
      52% { transform: scale(1.15) translateY(1px); opacity: 1; }
      66% { transform: scale(0.95) translateY(0); opacity: 1; }
      80% { transform: scale(1.03) translateY(0); opacity: 1; }
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

/** Gold ×N next to payout when multiplier &gt; 1 */
function BetMultSuffix({ m }: { m: number }) {
  if (m <= 1) return null;
  return (
    <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 900, marginLeft: 4 }}>×{m}</span>
  );
}

// ── BonusRow — community bonus pool pill (streak UI lives in Zone 3) ─────────

const BONUS_TIERS = [
  { wins: 3, pct: 5, color: "#FFD700", glow: "#FFD70099" },
  { wins: 5, pct: 15, color: "#FFD700", glow: "#FFD70099" },
];

const BONUS_DOTS = [
  { threshold: 1, tierIdx: 0 },
  { threshold: 2, tierIdx: 0 },
  { threshold: 3, tierIdx: 0 },
  { threshold: 4, tierIdx: 1 },
  { threshold: 5, tierIdx: 1 },
];

function BonusRow({ betAdded, streak = 0, milestoneHit = false, onAmountChange }: {
  betAdded: number; streak?: number; milestoneHit?: boolean;
  onAmountChange?: (v: number) => void;
}) {
  const [amount, setAmount] = useState(BONUS_POOL_SEED);
  const prevBetRef = useRef(0);
  const streakGlow = streak >= 5 ? 0.22 : streak >= 3 ? 0.14 : streak >= 1 ? 0.08 : 0.06;
  const streakBorder = streak >= 5 ? "rgba(255,215,0,0.55)" : streak >= 3 ? "rgba(255,215,0,0.38)" : streak >= 1 ? "rgba(255,215,0,0.25)" : "rgba(255,215,0,0.18)";
  const streakShadow = streak > 0 ? `0 0 ${6 + streak * 3}px rgba(255,215,0,${streakGlow})` : "none";

  useEffect(() => {
    const id = setInterval(() => {
      setAmount(p => {
        const next = parseFloat((p + TICK_AMOUNT).toFixed(2));
        onAmountChange?.(next);
        return next;
      });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line

  useEffect(() => {
    if (betAdded > 0 && betAdded !== prevBetRef.current) {
      prevBetRef.current = betAdded;
      const contribution = parseFloat((betAdded * BONUS_POOL_BET_RAKE).toFixed(2));
      if (contribution > 0) setAmount(p => {
        const next = parseFloat((p + contribution).toFixed(2));
        onAmountChange?.(next);
        return next;
      });
    }
  }, [betAdded]); // eslint-disable-line

  return (
    <div style={{
      flex: "0 0 auto",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "0px 12px",
    }}>
      {/* Bonus pool pill only — streak lives in zone 3 under gauge */}
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "4px 14px", borderRadius: 20,
        background: `rgba(255,215,0,${streakGlow})`,
        border: `1px solid ${streakBorder}`,
        boxShadow: milestoneHit
          ? `0 0 0 2px #FFD700, 0 0 32px rgba(255,215,0,0.9), 0 0 64px rgba(255,215,0,0.5)`
          : streakShadow,
        animation: milestoneHit ? "bonusPoolPulse 1.4s ease-out forwards" : "none",
        transition: "box-shadow 300ms ease",
      }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.2, color: "rgba(255,215,0,0.6)", textTransform: "uppercase" }}>
          Bonus Pool
        </span>
        <span style={{ fontSize: 12, fontWeight: 950, color: "#FFD700", fontVariantNumeric: "tabular-nums", textShadow: "0 0 8px rgba(255,215,0,0.5)" }}>
          ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

    </div>
  );
}

// ── FTUE text config (baseball) ───────────────────────────────────────────
const BASEBALL_FTUE_CONFIG: FTUETextConfig = {
  anchorCardId: "ftue-ohtani",
  rosterCount: 5,
  salaryCap: 220,
  sportLabel: "baseball",
  cardPositions: {
    "ftue-ohtani": "above",
    "ftue-soto": "below",
    "ftue-betts": "below",
    "ftue-freeman": "below",
    "ftue-burnes": "above",
  },
  cardTexts: {
    "ftue-soto": "Soto walked 3 times and drove in a run — 41 FP. Eye at the Plate badge earned. Patient approach pays off. 👁️",
    "ftue-betts": "Betts went 0-for with a walk — 6 FP on a $40 card. Even MVPs have off nights. That's variance. 🧊",
    "ftue-freeman": "Freeman went 2-for-4 with a double — 32 FP with a Hit Machine badge. Solid veteran floor. ⚾",
    "ftue-burnes": "Burnes got the win with 6 innings and a Quality Start badge. 47 FP from a $22 card. Pitchers carry weight here. ✅",
  },
  anchorRevealText: "Ohtani was lights-out tonight. 🔥 6 shutout innings, 8 Ks, Quality Start badge ✅. 64 FP — that's why you held him.",
  idleText: "Real stats. Real history. Your fantasy result instantly. Hit DEAL to get started." as any,
  holdIntroText: "Five players, $220 cap. Fantasy Points come from real stats — hits, home runs, strikeouts. Who do we keep?",
  holdAnchorText: "Ohtani is your $70 ace — most dominant pitcher in baseball. Tap him to hold, hit DRAW to replace the rest, then tap every card to see your replacements." as any,
  nearMissText: "So close — only 5 FP from the All-Star win. One hit from Betts and we'd be celebrating a 7x score. ⚾",
  anchorFlipHintText: "Ohtani carried this whole hand — 64 FP is elite. Flip his card to see the full stat line. 🔥",
  anchorStatText: "6 IP, 8 K, 0 ER against Arizona. 58 base FP + 6 from Quality Start badge = 64. Badges are real. ✅",
  finalText: "Every game log comes from true historical games. Replay lets you relive baseball history at your fingertips. Hit Replay to start playing for real. ⚾",
};

// ── GameView ───────────────────────────────────────────────────────────────

export default function GameView() {

  // Zone 1: State
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const {
    hotStreak,
    sessionWins,
    taskStates,
    weeklyTaskStates,
    perpetualTaskStates,
    streakCount,
    loginStreak,
    coins,
    xp,
    recordHandPlayed,
    recordHandWon,
    recordHandLost,
    collectTask,
  } = useEngagement();
  const [showCollect, setShowCollect] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState(() => getNickname());
  const [multipliersHost, setMultipliersHost] = useState<HTMLDivElement | null>(null);
  const [controlsHost, setControlsHost] = useState<HTMLDivElement | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [roster, setRoster] = useState<PlayerCard[]>(createPlaceholders());
  const [lockedCardIds, setLockedCardIds] = useState<Set<string>>(new Set());
  const [statsFlippedIds, setStatsFlippedIds] = useState<Set<string>>(new Set());
  const [mvpId, setMvpId] = useState<string | undefined>();
  const [betMultiplier, setBetMultiplier] = useState(1);
  const [balance, setBalance] = useState(() => loadBalance());
  const [isBalanceAnimating, setIsBalanceAnimating] = useState(false);
  const [winTier, setWinTier] = useState<WinTier | null>(null);
  const [winPayout, setWinPayout] = useState(0);
  const [showRawScore, setShowRawScore] = useState(false);
  const [showPostHandSheet, setShowPostHandSheet] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { user, isAnonymous } = useAuth();
  const [bellOpen, setBellOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!user || isAnonymous) { setUnreadCount(0); return; }
    listMessages(user.id).then((all) => {
      setUnreadCount(all.filter((m) => m.read_at == null).length);
    });
  }, [user, isAnonymous, bellOpen]);

  useEffect(() => {
    if (gameState === "IDLE" || gameState === "HOLD") setShowRawScore(false);
  }, [gameState]);
  const [noTransition, setNoTransition] = useState(false);
  const [revealedSalary, setRevealedSalary] = useState(0);
  const rosterRef = useRef<PlayerCard[]>([]);
  const { isFTUE, completeFTUE } = useFTUE("baseball");
  const [legendaryCardName, setLegendaryCardName] = useState<string | undefined>();
  const [revealIndex, setRevealIndex] = useState(0);
  const [lastRevealedCardId, setLastRevealedCardId] = useState<string | null>(null);
  const [celebrationHeld, setCelebrationHeld] = useState(false);
  const [ftueCardsBlocked, setFtueCardsBlocked] = useState(false);
  const [ftueReplayReady, setFtueReplayReady] = useState(false);
  const [ftueResultsDim, setFtueResultsDim] = useState(false);
  const [ftueOhtaniFlipped, setFtueOhtaniFlipped] = useState(false);
  const [ftueOscillating, setFtueOscillating] = useState(false);
  const [ftueCommentaryDone, setFtueCommentaryDone] = useState(false);
  const [ftueCommentaryOverride, setFtueCommentaryOverride] = useState<{ parts: React.ReactNode[]; sticky?: boolean } | null>(null);
  const [glowState, setGlowState] = useState<{ cardId: string | null; tier: string; durationMs: number }>({
    cardId: null, tier: "WHITE", durationMs: 300
  });
  /** After FTUE scripted gauge animation completes — bar stays frozen until next hand */
  const [ftueGaugeOscDone, setFtueGaugeOscDone] = useState(false);
  const [ftueWinCelebrationActive, setFtueWinCelebrationActive] = useState(false);
  const [ftueOhtaniPulse, setFtueOhtaniPulse] = useState(false);
  const [ftueHoldSpotlight, setFtueHoldSpotlight] = useState(false);
  const [ftueCoachBubbleKey, setFtueCoachBubbleKey] = useState<string | null>(null);
  const pendingCelebration = useRef<{ totalFp: number } | null>(null);
  /** FTUE: roster sum can read 0 briefly in RESULTS — keep last resolved hand FP for TierGauge */
  const ftueLastHandFpRef = useRef(0);
  const heldRevealResumeRef = useRef<(() => void) | null>(null);
  const completedCardsRef = useRef<Set<string>>(new Set());
  const regularFinalGaugeKickFiredRef = useRef(false);
  // Near your other useState declarations in GameView.tsx
  const [streak, setStreak] = useState<number>(() =>
    parseInt(localStorage.getItem("replaymod_streak") ?? "0", 10)
  );
  const [streakMilestone, setStreakMilestone] = useState<{ wins: number; pct: number } | null>(null);

  // Tier flip display state
  const [tierFlipKey, setTierFlipKey] = useState(0);
  const [displayTier, setDisplayTier] = useState("BUST");
  const prevRevealTierRef = useRef("BUST");
  const lastTierFlipTimeRef = useRef(0);
  const tierFlipTimerRef = useRef<number | null>(null);
  const latestGaugeFpRef = useRef(0);
  // Phase 1 = big PNG slam, Phase 2 = settled info view
  const [tierResultPhase, setTierResultPhase] = useState<1 | 2>(1);
  const ftueTierSlamPlayedRef = useRef(false);
  const [nearMissTeasing, setNearMissTeasing] = useState(false);
  const nearMissChoreTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Spring oscillation phase — fires after all cards settle, before results lock in
  const [springFp, setSpringFp] = useState<number | null>(null);
  const [springSettled, setSpringSettled] = useState(false);
  const [lbContextNonce, setLbContextNonce] = useState(0);
  const springRafRef = useRef<number>(0);
  const springTimersRef = useRef<number[]>([]);
  const pendingBalanceUpdateRef = useRef<(() => void) | null>(null);
  const bonusPoolRef = useRef<number>(BONUS_POOL_SEED);
  const lockedGaugeFpRef = useRef<number | null>(null);
  const springHasFiredRef = useRef(false);
  const frozenBarFpRef = useRef<number | null>(null); // freezes bar at 5-card total during anchor count-up
  const anchorFpCallCountRef = useRef(0); // FTUE: tracks onAnchorFpComplete calls to skip non-held anchor

  const runSpring = useCallback((finalFp: number, onSettled: () => void) => {
    cancelAnimationFrame(springRafRef.current);
    springTimersRef.current.forEach(clearTimeout);
    springTimersRef.current = [];

    // Bar is currently at the 5-card total (frozen during anchor count-up).
    // The anchor card's number has already settled on the card face.
    // Now the tier bar does one smooth spring motion adding card 6's FP.
    const startFp = frozenBarFpRef.current ?? latestGaugeFpRef.current;
    const anchorFp = finalFp - startFp; // card 6's contribution

    // Overshoot = 10% of the anchor card's FP (proportional, not fixed)
    const overshoot = anchorFp * 0.10;
    const tier = SPRING_TIERS.find(t => finalFp >= t.lo && finalFp < t.hi)
      ?? SPRING_TIERS[SPRING_TIERS.length - 1];
    const headroom = tier.hi - finalFp - 0.5;
    const clampedOvershoot = Math.min(overshoot, Math.max(0.5, headroom));

    // Waypoints — each is a direction change, fully extended before reversing:
    // A: startFp → finalFp + overshoot  (shoot up past target)
    // B: peak → finalFp - undershoot     (back down below target)
    // C: bottom → finalFp + tiny         (small rise above)
    // D: settle at finalFp
    const damping = 0.4;
    const peak = finalFp + clampedOvershoot;
    const bottom = finalFp - clampedOvershoot * damping;
    const smallUp = finalFp + clampedOvershoot * damping * damping;

    // Timing: each segment decelerates (longer duration for smaller moves)
    // Total ~2000ms, considerably slower than the card-by-card gauge roll
    const segA = 700;   // longest — the main sweep
    const segB = 500;   // recoil
    const segC = 400;   // small bounce
    const segD = 300;   // settle
    const TOTAL_MS = segA + segB + segC + segD;
    const segments = [
      { from: startFp, to: peak, dur: segA },
      { from: peak, to: bottom, dur: segB },
      { from: bottom, to: smallUp, dur: segC },
      { from: smallUp, to: finalFp, dur: segD },
    ];

    let startTime: number | null = null;
    setSpringFp(startFp);
    setSpringSettled(false);

    function tick(now: number) {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;

      if (elapsed >= TOTAL_MS) {
        lockedGaugeFpRef.current = finalFp;
        frozenBarFpRef.current = null;
        setSpringFp(null);
        setSpringSettled(true);
        onSettled();
        return;
      }

      // Find which segment we're in
      let cumulative = 0;
      let fp = finalFp;
      for (const seg of segments) {
        if (elapsed < cumulative + seg.dur) {
          const segElapsed = elapsed - cumulative;
          const t = segElapsed / seg.dur;
          // Deceleration easing — each move slows as it reaches its peak
          const eased = 1 - Math.pow(1 - t, 3); // cubic ease-out
          fp = seg.from + (seg.to - seg.from) * eased;
          break;
        }
        cumulative += seg.dur;
      }

      setSpringFp(fp);
      springRafRef.current = requestAnimationFrame(tick);
    }
    springRafRef.current = requestAnimationFrame(tick);
  }, []); // eslint-disable-line

  // Near-miss copy — motivating one-liner shown in Phase 2 for BUST/ROOKIE.
  // Picked once when winTier is set; stable for the lifetime of the result screen.
  const nearMissCopy = useMemo(() => {
    const copies: Partial<Record<string, string[]>> = {
      BUST: ["So close.", "Right there.", "Next hand."],
      ROOKIE: ["Just a few more FP.", "Run it back.", "So close."],
      STARTER: ["Right on the edge.", "Almost there.", "Run it back."],
      ALL_STAR: ["One strong hand away.", "So close.", "Push harder."],
    };
    if (!winTier) return null;
    const opts = copies[winTier];
    if (!opts) return null;
    return opts[Math.floor(Math.random() * opts.length)];
  }, [winTier]); // eslint-disable-line

  // Hand count — drives Protected mode (hands 2-30 get top-60% log sampling)
  // Hand 1 is always FTUE. Persisted across sessions.
  const [handCount, setHandCount] = useState<number>(() =>
    parseInt(localStorage.getItem("replaymod_hand_count") ?? "1", 10)
  );

  // ── Referral capture + claim (shared with basketball, sport-agnostic) ───
  // Capture ?ref= on mount. Fire claim once user crosses the legit threshold
  // (≥10 hands AND loginStreak ≥2). Server validates anti-bot before rewarding.
  useEffect(() => {
    captureReferrerFromUrl();
    if (handCount >= 1) applyReferral();
  }, []); // eslint-disable-line

  useEffect(() => {
    claimReferral(handCount, loginStreak);
  }, [handCount, loginStreak]);

  // ── Chad usher — sport-neutral subset (no auth-gated or icon-blinking msgs) ──
  // Baseball skips leaderboard_intro / big_win / retention because those require
  // auth state (isAnonymous) which baseball doesn't wire, and trophy/legend
  // icon blinking which baseball's GameBar doesn't accept. Welcome + educational
  // + MVP-test messages fire the same as basketball.
  const chadFiredThisIdleRef = useRef(false);
  useEffect(() => {
    if (gameState !== "IDLE") chadFiredThisIdleRef.current = false;
  }, [gameState]);

  // Welcome — first time post-FTUE
  useEffect(() => {
    if (isFTUE) return;
    if (localStorage.getItem("replaymod_pregame_intro_baseball") === "1") return;
    localStorage.setItem("replaymod_pregame_intro_baseball", "1");
    chadFiredThisIdleRef.current = true;
    setFtueCommentaryOverride({ parts: [chadMessage("welcome")], sticky: true });
  }, [isFTUE]);

  // Priority-ordered checks — first match wins
  useEffect(() => {
    if (isFTUE || gameState !== "IDLE") return;
    if (chadFiredThisIdleRef.current) return;

    const lastChadHand = parseInt(localStorage.getItem("rm_chad_last_hand_bb") ?? "0", 10);
    if (handCount - lastChadHand < 2 && handCount > 1) return;

    const checks = [
      { key: "rm_usher_lb_explainer_bb", topic: "leaderboard_explainer" as const, condition: handCount >= 3 },
      { key: "rm_usher_mvp_thanks_bb",   topic: "mvp_thanks" as const,   condition: handCount >= 5 },
      { key: "rm_usher_dev_4thwall_bb",  topic: "dev_4thwall" as const,  condition: handCount >= 15 },
    ];

    for (const { key, topic, condition } of checks) {
      if (!condition) continue;
      if (localStorage.getItem(key) === "1") continue;
      localStorage.setItem(key, "1");
      localStorage.setItem("rm_chad_last_hand_bb", String(handCount));
      chadFiredThisIdleRef.current = true;
      setFtueCommentaryOverride({ parts: [chadMessage(topic)], sticky: true });
      return;
    }
  }, [gameState, handCount, isFTUE]);

  // Zone 1: Hooks

  // ── Audio phase sync — maps GameState to AudioPhase ──────────────────
  useEffect(() => {
    const phaseMap: Record<GameState, import('@shared/utils/audioDirector').AudioPhase> = {
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
    ensureLoaded().then(() => setDataReady(true)).catch(console.error);
  }, []);

  const flipState = useCardFlipState();
  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);
  const currentBet = BASE_BET * betMultiplier;
  const gameAnalytics = useGameAnalytics("baseball");

  function handleCardRevealStart(cardId: string, tierArg: string, shakeType?: string | null) {
    // Freeze bar when the TRUE anchor starts — the last card whose spring drives the final total.
    // When held cards exist: the true anchor is the last held card (highest salary held).
    // The non-held anchor (e.g. Westbrook) should NOT freeze — its FP rolls into the gauge normally.
    const card = rosterRef.current.find(c => cardId === ((c as any).cardId ?? (c as any).basePlayerId));
    const isHeldCard = !!(card as any)?.wasHeld;
    const hasHeldCards = rosterRef.current.some((c: any) => c.wasHeld);
    // Find the true anchor: last held card by salary if held cards exist, otherwise anchorCardId
    const heldCards = rosterRef.current.filter((c: any) => c.wasHeld).sort((a: any, b: any) => (a.salary ?? 0) - (b.salary ?? 0));
    const trueAnchorId = heldCards.length > 0
      ? ((heldCards[heldCards.length - 1] as any).cardId ?? (heldCards[heldCards.length - 1] as any).basePlayerId)
      : anchorCardId;
    if (cardId === trueAnchorId) {
      frozenBarFpRef.current = latestGaugeFpRef.current;
    }
    const tier = tierArg?.toUpperCase() ?? "WHITE";
    const st = shakeType ?? null;
    // Must match glowMsForReveal() in useEmotionalReveal
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
    setGlowState({ cardId, tier, durationMs: duration });
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
      // Store the resume fn — CoachLayer will call it after last card bubble dismissed
      heldRevealResumeRef.current = resume;
    } : undefined,
    onCardRevealStart: handleCardRevealStart,
    onCardComplete: useCallback((cId: string) => {
      setRevealIndex(prev => {
        const next = prev + 1;
        audioDirector.setRevealProgress(next, rosterRef.current.length);
        return next;
      });
      setLastRevealedCardId(cId);

      // FTUE: start gauge oscillation shortly after Booker's stamp lands
      if (isFTUE && cId === "ftue-ohtani") {
        setTimeout(() => setFtueOscillating(true), 100);
      }
    }, [isFTUE]),
    onAnchorFpComplete: useCallback((_hookTotal: number) => {
      if (springHasFiredRef.current) return;
      // In tap mode with held cards, onAnchorFpComplete fires twice: once for the
      // non-held anchor and once for the held anchor. Skip the first call so held
      // cards' FP rolls up independently. In skipToEnd mode, all cards are in one
      // sequence with one anchor — never skip.
      const hasHeldCards = rosterRef.current.some((c: any) => c.wasHeld);
      if (hasHeldCards && anchorFpCallCountRef.current === 0 && !isSkippingRef.current) {
        anchorFpCallCountRef.current = 1;
        return; // Non-held anchor's call in tap mode — skip, wait for held anchor
      }
      springHasFiredRef.current = true;
      // Always compute from rosterRef — guaranteed to have all 6 resolved cards
      const totalFp = rosterRef.current.reduce((s, c) => s + Number((c as any).actualFp ?? 0), 0);
      runSpring(totalFp, () => {
        lockedGaugeFpRef.current = totalFp;
        const tier = calculateWinTier(totalFp);
        const payout = calculatePayout(tier, currentBet);
        setWinTier(tier);
        setWinPayout(payout);
        const bust = !tier || tier === "BUST";
        soundManager.playTierResult(tier);
        const badges = rosterRef.current.reduce((s, c) => s + (c.achievements?.length ?? 0), 0);
        gameAnalytics.handResolved(totalFp, String(tier), bust, badges, Date.now());
        recordHandPlayed();
        if (!bust) recordHandWon(); else recordHandLost();
        if (isFTUE) {
          // FTUE: after spring settles, transition same as real game
          ftueLastHandFpRef.current = totalFp;
          const t = window.setTimeout(() => {
            setGameState("RESULTS");
            setTimeout(() => setFtueWinCelebrationActive(true), 300);
          }, 1200);
          springTimersRef.current.push(t);
        } else {
          pendingBalanceUpdateRef.current = () => {
            if (payout > 0) {
              setBalance(prev => { const next = prev + payout; saveBalance(next); return next; });
            }
            if (!bust) {
              setStreak(prev => {
                const next = prev + 1;
                localStorage.setItem("replaymod_streak", String(next));
                if (next === 3 || next === 5 || next === 10) soundManager.playStreakMilestone(next);
                if (next === 3) setStreakMilestone({ wins: 3, pct: 5 });
                else if (next === 5) setStreakMilestone({ wins: 5, pct: 15 });
                submitToLeaderboard("streak", next);
                return next;
              });
              submitToLeaderboard("wins", 1);
              submitToLeaderboard("fp", totalFp);
              submitToLeaderboard("hand_best", totalFp, { proof: buildScoreProof(rosterRef.current as any[], totalFp) });
              submitToLeaderboard("hand_avg", totalFp, { handCount });
              submitToLeaderboard("money_won", payout);

              // Update personal bests
              const prevBest = parseFloat(localStorage.getItem("rm_best_hand") ?? "0");
              if (totalFp > prevBest) {
                localStorage.setItem("rm_best_hand", totalFp.toFixed(1));
              }
              const tierRanks = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
              const prevTierRank = tierRanks.indexOf(localStorage.getItem("rm_best_tier") ?? "BUST");
              const newTierRank = tierRanks.indexOf(tier ?? "BUST");
              if (newTierRank > prevTierRank) {
                localStorage.setItem("rm_best_tier", tier ?? "BUST");
              }
            } else {
              setStreak(0);
              localStorage.setItem("replaymod_streak", "0");
            }
          };
          const t = window.setTimeout(() => {
            setGameState("WIN_CELEBRATION");
            // PostHandSheet overlay disabled for baseball — old design, blocks play.
            // Trophy button on GameBar opens LeaderboardScreen instead.
            // setTimeout(() => setShowPostHandSheet(true), 2000);
          }, 1200);
          springTimersRef.current.push(t);
        }
      });
    }, [isFTUE, currentBet, gameAnalytics, recordHandPlayed, recordHandWon, recordHandLost, runSpring]),
    onAllComplete: useCallback((_totalFp: number) => {
      clearActiveCard();
      soundManager.stopRevealAmbience();
    }, []), // eslint-disable-line
  });

  // Zone 2: Derived values
  const phase: GamePhase = useMemo(() => {
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION" || gameState === "REVEALING") return "RESULTS";
    if (gameState === "DRAWING") return "DRAWING";
    return "HOLD";
  }, [gameState]);

  const isPreRevealFooter =
    (gameState === "IDLE" && !isFTUE) ||
    (gameState === "HOLD" && !isFTUE) ||
    (gameState === "DEALING" && !isFTUE) ||
    (gameState === "DRAWING" && !isFTUE);
  const showGaugeInZone3 =
    gameState === "REVEALING" ||
    gameState === "RESULTS" ||
    gameState === "WIN_CELEBRATION" ||
    (gameState === "IDLE" && isFTUE) ||
    (gameState === "DRAWING" && isFTUE) ||
    (gameState === "HOLD" && isFTUE) ||
    (gameState === "DEALING" && isFTUE);
  const isPostReveal = (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier != null;

  // Tier color map — mirrors WIN_TIERS in basketball/GameBar.tsx
  const CELEBRATION_TIER_COLORS: Record<string, { color: string; glow: string }> = {
    LEGEND: { color: "#EF4444", glow: "#EF444499" },
    MVP: { color: "#FB923C", glow: "#FB923C55" },
    ALL_STAR: { color: "#C084FC", glow: "#C084FC55" },
    STARTER: { color: "#00FFD8", glow: "#00FFD855" },
    ROOKIE: { color: "#22C55E", glow: "#22C55E55" },
    BUST: { color: "#6B7280", glow: "#6B728033" },
  };

  const formatTierLabel = (tier: string) => {
    if (tier === "BUST") return "BUST";
    if (tier === "LEGEND") return "G.O.A.T.";
    return tier.replace("_", "-");
  };

  const celebrationData: CelebrationData | undefined = useMemo(() => {
    if (gameState !== "WIN_CELEBRATION" || !winTier) return undefined;
    const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
    const tierMult = BASEBALL_WIN_TIERS[winTier]?.multiplier ?? 0;
    const isLoss = winTier === "BUST"; // ROOKIE is a partial win, not a loss
    const lossAmount = winTier === "BUST" ? BASE_BET * betMultiplier : 0;
    // Streak milestone bonus pool win
    const milestoneTier = BONUS_TIERS.find(t => streak === t.wins);
    const streakMilestonePct = milestoneTier?.pct;
    const bonusPoolWin = streakMilestonePct
      ? Math.floor(bonusPoolRef.current * (streakMilestonePct / 100))
      : undefined;
    return {
      tierLabel: formatTierLabel(winTier),
      tierColor: tc.color,
      tierGlow: tc.glow,
      payout: winPayout,
      streak,
      isBust: winTier === "BUST",
      betMultiplier,
      tierMultiplier: tierMult,
      baseBet: BASE_BET,
      isLoss,
      lossAmount,
      streakMilestonePct,
      bonusPoolWin,
    };
  }, [gameState, winTier, winPayout, streak, betMultiplier]); // eslint-disable-line

  const capUsed = useMemo(() => sumSalary(roster), [roster]);

  const lockedSalary = useMemo(() =>
    roster.reduce((s, c: any) => lockedCardIds.has(cardId(c)) ? s + Number(c?.salary ?? 0) : s, 0),
    [roster, lockedCardIds]
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
      return roster.reduce((sum, c) => sum + ((c as any).actualFp ?? 0), 0);
    }
    return 0;
  }, [gameState, runningTotalFp, roster, isFTUE]);

  const ceilingPct = useMemo(() => {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return null;
    // Max possible = projectedFp × 2.0 (salaryRatioCeiling) per card
    const maxPossible = roster.reduce((s, c: any) => s + Number(c.projectedFp ?? 0) * 2.0, 0);
    if (maxPossible <= 0 || totalFp <= 0) return null;
    return Math.min(100, Math.round((totalFp / maxPossible) * 100));
  }, [gameState, roster, totalFp]);


  // During anchor count-up: bar frozen at 5-card total (frozenBarFpRef)
  // During spring: springFp drives the bar
  // After spring: lockedGaugeFpRef holds the final value
  const displayFp = springFp ?? (frozenBarFpRef.current ?? (lockedGaugeFpRef.current ?? totalFp));
  const gaugeTotalFp = displayFp;
  latestGaugeFpRef.current = gaugeTotalFp;

  // ── Claude commentary ────────────────────────────────────────────────────
  const commentaryRef = useRef<CommentaryOutput | null>(null);
  const commentaryStatusRef = useRef<'idle' | 'pending' | 'succeeded' | 'failed'>('idle');
  const recentTonesRef = useRef<string[]>([]);
  const commentaryFiredHandRef = useRef(-1);

  // Smart post-reveal copy — computed once when spring settles, then locked for the hand.
  const postRevealCopyRef = useRef<{ primary: string; secondary?: string } | null>(null);
  const postRevealCopy = useMemo(() => {
    if (postRevealCopyRef.current) return postRevealCopyRef.current;
    if ((gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") || !winTier || !springSettled) return null;
    if (isFTUE) {
      if (springSettled && !ftueCommentaryDone) {
        setTimeout(() => setFtueCommentaryDone(true), 2000);
      }
      return null;
    }
    // Wait for Claude while pending — never show template then swap
    if (commentaryStatusRef.current === 'pending') return null;
    // Prefer Claude commentary if it landed
    if (commentaryStatusRef.current === 'succeeded' && commentaryRef.current?.commentary) {
      const copy = { primary: commentaryRef.current.commentary, secondary: "" };
      postRevealCopyRef.current = copy;
      return copy;
    }
    // Fallback: new commentary composer
    const fp = lockedGaugeFpRef.current ?? displayFp;
    const gaugeSnap = computeGaugeState(fp, GAUGE_THRESHOLDS as any, winTier, 8);
    // Primary: unified selector. Fallback: legacy compose.
    const copyInput = {
      sport: "baseball",
      totalFp: fp,
      winTier: winTier as any,
      nextTier: gaugeSnap.nextTier as any,
      tierFloor: gaugeSnap.curMin,
      nextTierMin: gaugeSnap.nextMin > 0 && gaugeSnap.nextMin < 9999 ? gaugeSnap.nextMin : 0,
      roster: (rosterRef.current ?? []).map((c: any) => ({
        name: String(c.name ?? ""),
        salary: Number(c.salary ?? 0),
        actualFp: Number(c.actualFp ?? 0),
        projectedFp: Number(c.projectedFp ?? 0),
        cardTier: String(c.tier ?? ""),
        opponent: String(c.gameInfo?.opponent ?? ""),
        homeAway: String(c.gameInfo?.homeAway ?? "") as "H" | "A" | "",
        statLine: c.statLine ?? {},
      })),
      streak,
      prevStreak: winTier === "BUST" ? streak : Math.max(0, streak - 1),
      isBust: winTier === "BUST",
      handCount,
    } as any;
    // Canonical commentary engine — selectCommentary is the sole source.
    const copy = selectCommentary(copyInput);
    postRevealCopyRef.current = copy;
    return copy;
  }, [gameState, winTier, springSettled, displayFp, roster, streak, ceilingPct, lbContextNonce]); // eslint-disable-line

  // Never show intermediate tiers during spring — only show final tier after spring settles
  const activeTierForDisplay = winTier ?? deriveTierFromFp(totalFp);

  // displayTier is driven only by handleTierCross during normal reveal — not during spring

  // Signal TierGauge to run its fill-space spring while we wait for onSettled.
  // True from anchor card lock until springSettled fires.
  const regularFinalGaugeKick = false; // TierGauge is passive — spring lives in GameView

  // Tier result phase: Phase 1 = big slam (with optional near-miss tease), Phase 2 = info view
  useEffect(() => {
    if ((gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier) {
      nearMissChoreTimersRef.current.forEach(clearTimeout);
      nearMissChoreTimersRef.current = [];
      setNearMissTeasing(false);
      // FTUE: only play slam animation once — keep phase 2 after first settle
      if (isFTUE && ftueTierSlamPlayedRef.current) return;
      if (isFTUE) ftueTierSlamPlayedRef.current = true;
      setTierResultPhase(1);
      const gaugeSnap = computeGaugeState(totalFp, GAUGE_THRESHOLDS as any, winTier, NEAR_MISS_FP);
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

  // Track tier boundary crossings — paced flip with minimum display time per tier
  // Tier flip — shows EVERY intermediate tier for 600ms each.
  // When gauge crosses multiple tiers, schedules each one on a 600ms chain.
  const TIER_ORDER_LIST = ["BUST", "ROOKIE", "STARTER", "ALL_STAR", "MVP", "LEGEND"];
  const tierFlipTimersRef = useRef<number[]>([]);

  const handleTierCross = useCallback((tier: string) => {
    if (isFTUE) return;
    if (springHasFiredRef.current) return; // spring in progress — no tier flips
    if (tier === prevRevealTierRef.current) return;
    soundManager.playTierCross(tier);

    // Jump directly to the final tier — no intermediate flips
    prevRevealTierRef.current = tier;
    setDisplayTier(tier);
    setTierFlipKey(k => k + 1);
  }, [isFTUE]); // eslint-disable-line

  // Reset on state change
  useEffect(() => {
    if (gameState !== "REVEALING" && gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") {
      prevRevealTierRef.current = "BUST";
      setDisplayTier("BUST");
      tierFlipTimersRef.current.forEach(clearTimeout);
      tierFlipTimersRef.current = [];
      // Reset spring
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
      commentaryRef.current = null;
      commentaryStatusRef.current = 'idle';
      setStreakMilestone(null);
    }
  }, [gameState]);

  // Commentary is now handled by selectCommentary in the postRevealCopy memo.
  // This effect just ensures the status ref transitions so the memo runs.
  useEffect(() => {
    if (gameState !== "REVEALING") return;
    if (isFTUE) return;
    if (commentaryFiredHandRef.current === handCount) return;
    commentaryFiredHandRef.current = handCount;
    commentaryStatusRef.current = 'failed';
    postRevealCopyRef.current = null;
    setLbContextNonce(n => n + 1);
  }, [gameState, isFTUE, handCount, streak]); // eslint-disable-line react-hooks/exhaustive-deps

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
    roster.forEach(c => { if (c.wasHeld) held.add(cardId(c)); });
    return held;
  }, [gameState, roster, lockedCardIds]);

  // Zone 2: Handlers
  function toggleLock(cardKey: string) {
    if (gameState !== "HOLD") return;
    // FTUE: only Booker can be toggled, and once held cannot unhold
    if (isFTUE && cardKey !== "ftue-ohtani") return;
    if (isFTUE && cardKey === "ftue-ohtani" && lockedCardIds.has(cardKey)) return;
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
    // FTUE: block ALL flips when a bubble is active
    if (isFTUE && ftueCardsBlocked) return;
    // FTUE RESULTS: only Booker is flippable while dim is active
    if (isFTUE && ftueResultsDim && cardKey !== "ftue-ohtani") return;
    setStatsFlippedIds(prev => {
      const next = new Set(prev);
      next.has(cardKey) ? next.delete(cardKey) : next.add(cardKey);
      return next;
    });
    // Track when Booker is flipped in FTUE to trigger the final bubble
    if (isFTUE && cardKey === "ftue-ohtani") {
      setFtueOhtaniFlipped(true);
      setFtueOhtaniPulse(false);
      // Dim stays active — lifted only after final_replay bubble is dismissed
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
      setLastRevealedCardId(null);
      setCelebrationHeld(false);
      setFtueOscillating(false);
      setFtueGaugeOscDone(false);
      setFtueCommentaryDone(false);
      setFtueCommentaryOverride(null);
      setFtueWinCelebrationActive(false);
      setFtueOhtaniPulse(false);
      setFtueHoldSpotlight(false);
      pendingCelebration.current = null;
      ftueLastHandFpRef.current = 0;
      const res: any = isFTUE ? await dealFTUERoster() : await dealInitialRoster();
      const nextRoster = (res?.roster ?? res?.cards ?? []) as PlayerCard[];
      rosterRef.current = nextRoster;
      console.log('HAND DEALT CALLED');
      console.log('DEALT');
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
      const markedRoster = roster.map(c => ({ ...c, wasHeld: lockedCardIds.has(cardId(c)) }));
      flipState.beginDraw(markedRoster.filter(c => !(c as any).wasHeld).map(cardId));
      setRoster(markedRoster);
      setGameState("DRAWING");
      await sleep(700);
      const drawRes: any = isFTUE
        ? await redrawFTUERoster({ currentCards: markedRoster, lockedCardIds })
        : await redrawRoster({ currentCards: markedRoster, lockedCardIds });
      const drawnRoster = (drawRes?.roster ?? drawRes?.cards ?? markedRoster) as PlayerCard[];
      const resolveRes: any = isFTUE
        ? await resolveFTUERoster({ finalCards: drawnRoster })
        : await resolveRoster({ finalCards: drawnRoster });
      const finalRoster = (resolveRes?.roster ?? resolveRes?.cards ?? drawnRoster) as PlayerCard[];
      const mvp: string | undefined = resolveRes?.mvpCardId ?? resolveRes?.mvpId;
      if (mvp) setMvpId(mvp);

      const heldSalaryAtDraw = finalRoster.reduce(
        (s, c: any) => c.wasHeld ? s + Number(c.salary ?? 0) : s, 0
      );
      setRevealedSalary(heldSalaryAtDraw);

      rosterRef.current = finalRoster;
      completedCardsRef.current = new Set();
      finalRoster.forEach(c => {
        if ((c as any).wasHeld) {
          completedCardsRef.current.add(cardId(c));
        }
      });
      setNoTransition(true);
      // In tap mode: held cards stay FRONT, only non-held start BACK
      const nonHeldIds = finalRoster.filter(c => !(c as any).wasHeld).map(cardId);
      const heldIds = finalRoster.filter(c => (c as any).wasHeld).map(cardId);
      flipState.initCards(nonHeldIds);
      // Force held cards to FRONT so they never show generic back
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
      gameAnalytics.sessionEnd();
      resetReveal();
      resetAllOverlays();
      ftueLastHandFpRef.current = 0;
      setFtueGaugeOscDone(false);
      completedCardsRef.current = new Set();
      setRevealedSalary(0);
      setNoTransition(true);
      const placeholders = createPlaceholders();
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

  // FTUE: when RESULTS starts, dim non-Booker, fire bubble
  useEffect(() => {
    if (!isFTUE || gameState !== "RESULTS") return;
    setFtueResultsDim(true);
    setStatsFlippedIds(new Set());
    // Fire the "Darn it" bubble chain after a short settle delay
    const t = setTimeout(() => setFtueWinCelebrationActive(true), 300);
    return () => {
      setFtueResultsDim(false);
      clearTimeout(t);
    };
  }, [gameState, isFTUE]); // eslint-disable-line

  // FTUE: lift dim only after final_replay bubble dismissed (onFtueAllDone)
  useEffect(() => {
    if (ftueReplayReady) setFtueResultsDim(false);
  }, [ftueReplayReady]); // eslint-disable-line

  function onWinCelebrationComplete() {
    // Increment hand count
    if (!isFTUE) {
      const next = parseInt(localStorage.getItem("replaymod_hand_count") ?? "0", 10) + 1;
      localStorage.setItem("replaymod_hand_count", String(next));
      setHandCount(next);

      // Name prompt trigger — fires once after hand 3
      if (next >= 3 && !localStorage.getItem("replaymod_name_prompted")) {
        localStorage.setItem("replaymod_name_prompted", "true");
        setTimeout(() => setShowNamePrompt(true), 3500);
      }
    }
    // Balance + streak updates already fired via pendingBalanceUpdateRef (wage animation)
    setWinTier(null);
    setWinPayout(0);
    setGameState("RESULTS");
  }

  const [wasSkipped, setWasSkipped] = useState(false);

  function handleButtonClick() {
    if (gameState === "REVEALING") {
      setRevealedSalary(capUsed);
      setWasSkipped(true);
      skipReveal();
    }
    else {
      // Fade out big win music if it's still playing (MVP/GOAT celebration)
      if (gameState === "WIN_CELEBRATION") {
        soundManager.stopBigWin();
      }
      setShowPostHandSheet(false);
      setWasSkipped(false);
      onPrimaryAction();
    }
  }

  // Zone 2.5: FTUE legendary detection
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

  // Zone 3: JSX
  if (!dataReady) {
    return (
      <div style={{
        width: "100vw", height: "100vh", maxHeight: "-webkit-fill-available",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif", gap: 16,
      }}>
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
          flex: "0 0 12dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          gap: 4,
          padding: "0 10px 0",
          marginBottom: 8,
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
          <div data-ftue-chrome="true">
            <BonusRow
              betAdded={currentBet}
              streak={streak}
              milestoneHit={streak === 3 || streak === 5}
              onAmountChange={(v) => { bonusPoolRef.current = v; }}
            />
          </div>
        </div>

        {/* 2 — Card stage */}
        <div style={{
          flex: "0 0 52dvh",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "8px 4px 6px 4px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}>
          <div
            onClick={gameState === "REVEALING" && REVEAL_MODE === "auto" ? skipReveal : undefined}
            style={{
              width: "100%",
              height: "100%",
              cursor: gameState === "REVEALING" && REVEAL_MODE === "auto" ? "pointer" : "default",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <RosterGridScaleFit>
              <RosterGridAny
                roster={displayRoster}
                phase={phase}
                lockedIds={heldCardIds}
                mvpId={mvpId}
                flippedIds={flippedIds}
                revealingIds={revealingIds}
                noTransition={noTransition}
                visibleFpMap={visibleFpMap}
                canFlip={gameState === "RESULTS" || gameState === "WIN_CELEBRATION"}
                ftueFlipTargetId={isFTUE && (ftueOhtaniPulse || ftueHoldSpotlight) ? "ftue-ohtani" : null}
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
                onTapReveal={isFTUE && ftueCardsBlocked ? undefined : (isFTUE ? (cardId: string) => {
                  // FTUE: also tick budget down per card flip
                  const card = rosterRef.current.find(c => {
                    const id = String(c?.cardId ?? c?.basePlayerId ?? "");
                    return id === cardId;
                  });
                  if (card && !(card as any).wasHeld) {
                    setRevealedSalary(prev => prev + Number((card as any).salary ?? 0));
                  }
                  tapRevealCard(cardId);
                } : (cardId: string) => {
                  // Immediately add this card's salary so budget rolls down in sync with FP roll up
                  const card = rosterRef.current.find(c => {
                    const id = String(c?.cardId ?? c?.basePlayerId ?? "");
                    return id === cardId;
                  });
                  if (card && !(card as any).wasHeld) {
                    setRevealedSalary(prev => prev + Number((card as any).salary ?? 0));
                  }
                  tapRevealCard(cardId);
                })}
                heldFpVisible={heldFpVisible}
                heldRevealedIds={heldRevealedIds}
                tappedCardIds={tappedCardIds}
                isRevealingPhase={gameState === "REVEALING"}
                isFTUEHoldPhase={isFTUE && gameState === "HOLD"}
                isFTUEDrawingPhase={isFTUE && gameState === "DRAWING"}
                isFTUE={isFTUE && (gameState === "HOLD" || gameState === "DRAWING")}
                ftueLockedSlot={
                  (isFTUE && ftueResultsDim)
                    ? 0
                    : (isFTUE && (ftueHoldSpotlight || heldCardIds.has("ftue-ohtani")) && gameState === "HOLD")
                      ? 0
                      : null
                }
              />
            </RosterGridScaleFit>
          </div>
        </div>

        {/* 3 — Zone 3: Row A score + Row B (multipliers pre-reveal / gauge post-reveal) = 22dvh */}
        <div
          {...(isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION")
            ? { "data-ftue-anchor": "ftue-darnit-focus" }
            : {})}
          style={{
            flex: "0 0 22dvh",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "visible",
            boxSizing: "border-box",
          }}
        >
          {/* ROW A — score / tier result */}
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
              flex: "0 0 52px",
              height: 52,
              minHeight: 52,
              maxHeight: 52,
              flexShrink: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "4px 10px 2px",
              boxSizing: "border-box",
              overflow: "hidden",
              cursor:
                (gameState === "WIN_CELEBRATION" ||
                  (gameState === "RESULTS" && winTier && !showRawScore))
                  ? "pointer"
                  : "default",
            }}
          >
            {!isFTUE && gameState === "REVEALING" ? (
              /* During spring: only FP number — no tier PNG, no flips.
                 The tier sign appears once as the final slam after spring settles. */
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", gap: 3 }}>
                <span style={{
                  fontSize: 30, fontWeight: 900, color: "#FFFFFF",
                  letterSpacing: "-0.5px", lineHeight: 1,
                  fontVariantNumeric: "tabular-nums", fontStyle: "italic",
                }}>
                  {displayFp.toFixed(1)} FP
                </span>
              </div>
            ) : (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier && !showRawScore ? (
              /* Tier result — single continuous animation: slam in big, shrink to settled */
              <div style={{
                display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
                width: "100%", height: "100%", gap: tierResultPhase === 2 ? 4 : 0,
              }}>
                {/* Glow flash */}
                {tierResultPhase === 1 && (
                  <div
                    key={`flash-${winTier}`}
                    style={{
                      position: "absolute", inset: -40, borderRadius: 30,
                      background: `radial-gradient(ellipse at center, ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).color}44 0%, transparent 70%)`,
                      animation: "tierSlamFlash 600ms ease-out forwards",
                      pointerEvents: "none",
                    }}
                  />
                )}
                {/* Tier PNG — one element, animates from big slam to small settled */}
                <img
                  key={`tier-${winTier}`}
                  src={`${import.meta.env.BASE_URL}${TIER_IMAGE_MAP[winTier] ?? "bust1.png"}`}
                  alt={formatTierLabel(winTier)}
                  style={{
                    maxHeight: tierResultPhase === 1 ? 70 : (isPostReveal ? 28 : 36),
                    maxWidth: tierResultPhase === 1 ? "95%" : "70%",
                    objectFit: "contain",
                    filter: tierResultPhase === 1
                      ? `drop-shadow(0 0 24px ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).glow})`
                      : "none",
                    animation: tierResultPhase === 1 ? "tierSlam 900ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
                    transition: "max-height 500ms ease, max-width 500ms ease, filter 500ms ease",
                  }}
                />
                {/* FP number — fades in for Phase 2 */}
                {tierResultPhase === 2 && (
                  <span style={{
                    fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.55)",
                    letterSpacing: "0.02em", lineHeight: 1, textAlign: "center",
                    fontVariantNumeric: "tabular-nums",
                    animation: "tierInfoFadeIn 400ms ease-out",
                  }}>
                    {displayFp.toFixed(1)} FP{ceilingPct != null && (
                      <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                        {" · "}{ceilingPct}% of possible score
                      </span>
                    )}
                  </span>
                )}
              </div>
            ) : gameState === "WIN_CELEBRATION" && winTier && celebrationData && !showRawScore ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: "100%" }}>
                {(() => {
                  const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
                  return (
                    <>
                      <div style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "baseline",
                        justifyContent: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}>
                        <span style={{
                          fontSize: 24, fontWeight: 900, letterSpacing: 1, fontStyle: "italic",
                          color: tc.color, textShadow: `0 0 20px ${tc.glow}`,
                          lineHeight: 1,
                        }}>
                          {formatTierLabel(winTier)}
                        </span>
                        {winPayout > 0 && (
                          <span style={{
                            fontSize: 15, fontWeight: 800,
                            color: "rgba(255,255,255,0.6)",
                            letterSpacing: "0.04em",
                            lineHeight: 1,
                          }}>
                            +{winPayout}
                          </span>
                        )}
                      </div>
                      {/* Explanation text lives in TierGauge only */}
                    </>
                  );
                })()}
              </div>
            ) : (
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
                        <div style={{ fontSize: 30, fontWeight: 900, color: "#FFFFFF", lineHeight: 1, letterSpacing: -1, fontStyle: "italic" }}>
                          <RollingNumber value={totalFp} decimals={1} duration={300} />
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginTop: 3 }}>
                          Team FP
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 2, justifyContent: "center" }}>
                          <span style={{ fontSize: 30, fontWeight: 900, color: overBudget ? "#ef4444" : "#FFFFFF", lineHeight: 1, fontStyle: "italic" }}>
                            <RollingNumber value={remaining} decimals={0} duration={300} />
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.35)", lineHeight: 1, fontStyle: "italic" }}>
                            /{CAP_MAX}
                          </span>
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginTop: 3 }}>
                          Budget
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* ROW B — fixed-height gauge slot so TierGauge Y position never shifts vs Team FP row */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              alignItems: "stretch",
              padding: "2px 10px 2px",
              boxSizing: "border-box",
              overflow: "visible",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 84,
                minHeight: 84,
                maxHeight: 84,
                flexShrink: 0,
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "visible",
                boxSizing: "border-box",
              }}
            >
              <div
                ref={(el) => setMultipliersHost(el)}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: isPreRevealFooter ? "flex" : "none",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                  pointerEvents: "auto",
                }}
              />
              {showGaugeInZone3 ? (
                <div
                  data-ftue-anchor="tier-gauge"
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: isPreRevealFooter ? "none" : "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    justifyContent: "center",
                    width: "100%",
                    overflow: "visible",
                    boxSizing: "border-box",
                    padding: "4px 2px 0",
                    zIndex: (isFTUE && ftueCommentaryOverride) ? 1100 : undefined,
                  }}
                >
                  <TierGauge
                    totalFp={gaugeTotalFp}
                    thresholds={[
                      { tier: "ROOKIE",   minFP: 148 },
                      { tier: "STARTER",  minFP: 178 },
                      { tier: "ALL_STAR", minFP: 208 },
                      { tier: "MVP",      minFP: 240 },
                      { tier: "LEGEND" as any, minFP: 280 },
                    ]}
                    winTier={springSettled ? (winTier ?? undefined) : undefined}
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
                    commentaryOverride={ftueCommentaryOverride}
                    onCommentaryOverrideDone={() => setFtueCommentaryOverride(null)}
                    onCommentaryDone={() => {
                      // After typewriter finishes, trigger "so close" bubble with slight delay
                      if (isFTUE) {
                        setTimeout(() => setFtueCommentaryDone(true), 800);
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
              ) : null}
            </div>
            {/* Streak progression UI removed for beta */}
          </div>
        </div>

        {/* 4 — Wallet + action only (14dvh) */}
        <div
          style={{
            flex: "0 0 14dvh",
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
              justifyContent: "center",
              minHeight: 0,
              padding: "0 10px max(env(safe-area-inset-bottom, 0px) + 8px, 16px)",
              boxSizing: "border-box",
              overflow: "hidden",
            }}
          >
            <CoachLayer
              isFTUE={isFTUE}
              ftueTextConfig={BASEBALL_FTUE_CONFIG}
              gameState={gameState}
              lockedCount={lockedCardIds.size}
              revealIndex={revealIndex}
              legendaryCardName={legendaryCardName}
              lastRevealedCardId={lastRevealedCardId}
              ftueBookerFlipped={ftueOhtaniFlipped}
              onCoachBubbleKey={(key) => {
                setFtueCoachBubbleKey(key);
                if (key === "hold_ohtani") setFtueHoldSpotlight(true);
              }}
              onResumeHeldReveal={() => {
                const resume = heldRevealResumeRef.current;
                heldRevealResumeRef.current = null;
                resume?.();
              }}
              onCelebrationReady={() => {
                // Non-FTUE: CoachLayer calls this after Booker bubble dismiss
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
              onCommentaryText={(parts) => setFtueCommentaryOverride(parts ? { parts } : null)}
              onReplayReady={() => setFtueReplayReady(true)}
              onFtueReadyToFlip={() => setFtueOhtaniPulse(true)}
              onFtueBookerHeld={() => { /* draw pulse handled inside CoachLayer */ }}
              onFtueAllDone={() => {
                completeFTUE();
                setFtueResultsDim(false);
              }}
              onReplay={() => {
                completeFTUE();
                setLastRevealedCardId(null);
                setCelebrationHeld(false);
                setFtueCardsBlocked(false);
                setFtueReplayReady(false);
                setFtueOhtaniFlipped(false);
                setFtueOhtaniPulse(false);
                setFtueHoldSpotlight(false);
                setFtueGaugeOscDone(false);
                pendingCelebration.current = null;
                heldRevealResumeRef.current = null;
                handleButtonClick();
              }}
            />
            <HotStreakOverlay active={hotStreak} winCount={sessionWins} />
            {showCollect && !isFTUE && (
              <CollectScreen
                taskStates={taskStates}
                weeklyTaskStates={weeklyTaskStates}
                perpetualTaskStates={perpetualTaskStates}
                streakCount={streakCount}
                loginStreak={loginStreak}
                coins={coins}
                xp={xp}
                onClose={() => setShowCollect(false)}
                onCollect={(id) => { collectTask?.(id); }}
              />
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

      </div>

      {/* Portals only — sibling of inner column */}
      <GameBar
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
        onBetMultiplier={setBetMultiplier}
        onAction={handleButtonClick}
        celebration={celebrationData}
        onWinCelebrationComplete={onWinCelebrationComplete}
        onWageAnimationComplete={() => {
          pendingBalanceUpdateRef.current?.();
          pendingBalanceUpdateRef.current = null;
        }}
        ftueDrawBlocked={isFTUE && gameState === "HOLD" && !heldCardIds.has("ftue-ohtani")}
        ftueHideSkip={isFTUE}
        ftuePulseNearMiss={isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && !ftueGaugeOscDone}
        ftueReplayBlocked={isFTUE && gameState === "RESULTS" && !ftueReplayReady}
        dataFtuePrimaryAnchor={isFTUE ? (gameState === "HOLD" ? "draw" : "deal") : undefined}
        splitFooter={{ multipliersHost, controlsHost }}
        splitMultiplierRowVisible={isPreRevealFooter && !isFTUE}
        onViewLeaderboard={() => setShowLeaderboard(true)}
      />

      {showPostHandSheet && !isFTUE && (() => {
        const gs = computeGaugeState(totalFp, GAUGE_THRESHOLDS as any, winTier ?? "BUST", NEAR_MISS_FP);
        const nmGap = gs.nextMin > 0 && gs.nextMin < 9999 ? Math.max(0, gs.nextMin - totalFp) : 0;
        return (
          <PostHandSheet
            totalFp={totalFp}
            winTier={winTier ?? "BUST"}
            isBust={!winTier || winTier === "BUST"}
            nearMissGap={nmGap}
            nearMissNextTier={gs.nextTier ?? null}
            winPayout={winPayout}
            currentUid={getPlayerUid()}
            onPlayAgain={() => {
              setShowPostHandSheet(false);
              handleButtonClick();
            }}
            onViewLeaderboard={() => {
              setShowPostHandSheet(false);
              setShowLeaderboard(true);
            }}
          />
        );
      })()}

      {showLeaderboard && !isFTUE && (
        <LeaderboardScreen
          currentUid={getPlayerUid()}
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
          onClose={() => setShowProfile(false)}
          isAnonymous={isAnonymous}
          onOpenFeedback={() => setFeedbackOpen(true)}
        />
      )}

      {feedbackOpen && user && (
        <FeedbackModal
          userId={user.id}
          onClose={() => setFeedbackOpen(false)}
          metadata={{ sport: 'baseball' }}
        />
      )}

    </div>
  );
}