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
import { useEmotionalReveal, DRAWING_DWELL_MS, type RevealableCard } from "../hooks/useEmotionalReveal";
import { calculateWinTier, calculatePayoutWithStreak, BASEBALL_WIN_TIERS, type WinTier } from "../utils/payoutLogic";

import { useGameAnalytics } from "@shared/analytics/useGameAnalytics";
import { CollectScreen } from '@shared/engagement/CollectScreen';
import { TierGauge, computeGaugeState } from '@shared/components/TierGauge';
import { useEngagement } from '@shared/engagement/useEngagement';
import { CoinDisplay } from '@shared/engagement/CoinDisplay';
import { DailyTasksPanel } from '@shared/engagement/DailyTasksPanel';
import { XPBar } from '@shared/engagement/XPBar';
import { soundManager } from '@shared/utils/soundManager';
import { getBonusPool, contributeBet } from '@shared/utils/bonusPoolStore';
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
import { chadMessage } from "@shared/commentary/chad";
import { captureReferrerFromUrl, applyReferral, claimReferral } from "@shared/utils/referral";
import { featureFlags } from "@shared/featureFlags";
import { detectTopGame } from "@shared/data/recordDetector";
import { selectStar } from "@shared/commentary/storySelector";
import { RegisterModal } from "@shared/components/RegisterModal";

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
// Authoritative source is KV via /api/bonus-pool. SEED is the local
// fallback when the server / KV is unavailable (and matches the server's
// own SEED constant). BET_RAKE / drip are now server-controlled — kept
// here only as documentation / for analytics math.
const BONUS_POOL_SEED = 1_000;

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

/** Check if player is in top 10 of either daily leaderboard → set rm_on_board_today for trophy glow */
async function checkLeaderboardRank() {
  const uid = getPlayerUid();
  const sessId = getSessionId();
  if (!uid) return;
  try {
    const [best, session] = await Promise.all([
      fetch("/api/leaderboard?metric=hand_best&scope=daily&limit=10").then(r => r.json()),
      fetch("/api/leaderboard?metric=session_score&scope=daily&limit=10").then(r => r.json()),
    ]);
    const entries = [...(best.entries ?? []), ...(session.entries ?? [])];
    const onBoard = entries.some((e: any) => e.uid === uid || (sessId && e.session_id === sessId));
    localStorage.setItem("rm_on_board_today", onBoard ? "1" : "0");
  } catch {} // Non-critical
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
  { tier: "ROOKIE",   minFP: 170 },
  { tier: "STARTER",  minFP: 200 },
  { tier: "ALL_STAR", minFP: 230 },
  { tier: "MVP",      minFP: 260 },
  { tier: "LEGEND",   minFP: 310 },
];
const NEAR_MISS_FP = 5;

/** Cross-pool salary fallback when a card lacks a tier field (rare; players.json always sets one). */
function tierFromSalary(salary: number): string {
  const s = Number(salary ?? 0);
  return s >= 58 ? "ORANGE" : s >= 44 ? "PURPLE" : s >= 30 ? "BLUE" : s >= 23 ? "GREEN" : "WHITE";
}

function toRevealableCards(cards: PlayerCard[]): RevealableCard[] {
  return cards.map(c => {
    const salary = Number((c as any).salary ?? 0);
    const dataTier = String((c as any).tier ?? "").toUpperCase();
    const validTier = ["RED","ORANGE","PURPLE","BLUE","GREEN","WHITE"].includes(dataTier);
    return {
      cardId: cardId(c),
      slotIndex: c.slotIndex ?? 0,
      actualFp: Number(c.actualFp ?? 0),
      projectedFp: Number(c.projectedFp ?? 0),
      salary,
      tier: validTier ? dataTier : tierFromSalary(salary),
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
  // Leave 0.5 FP of clearance. LEGEND tier has no ceiling so skip cap there.
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
    @keyframes tierShrinkDown {
      0% { transform: scale(1.0); opacity: 1; }
      40% { transform: scale(0.6); opacity: 0.9; }
      70% { transform: scale(0.72); opacity: 1; }
      100% { transform: scale(0.65); opacity: 1; }
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

// ── BonusRow — community bonus pool pill ─────────────────────────────────────

function BonusRow({ betAdded, streak = 0, onAmountChange }: {
  betAdded: number; streak?: number;
  onAmountChange?: (v: number) => void;
}) {
  const [amount, setAmount] = useState(BONUS_POOL_SEED);
  const prevBetRef = useRef(0);
  const streakGlow = streak >= 5 ? 0.22 : streak >= 3 ? 0.14 : streak >= 1 ? 0.08 : 0.06;
  const streakBorder = streak >= 5 ? "rgba(255,215,0,0.55)" : streak >= 3 ? "rgba(255,215,0,0.38)" : streak >= 1 ? "rgba(255,215,0,0.25)" : "rgba(255,215,0,0.18)";
  const streakShadow = streak > 0 ? `0 0 ${6 + streak * 3}px rgba(255,215,0,${streakGlow})` : "none";

  // Mount: fetch real KV-backed pool value. Periodic poll keeps display fresh.
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const pool = await getBonusPool("baseball");
        if (cancelled) return;
        setAmount(pool);
        onAmountChange?.(pool);
      } catch { /* swallow — keep last known value */ }
    };
    sync();
    const pollId = setInterval(sync, 30_000);
    return () => { cancelled = true; clearInterval(pollId); };
  }, []); // eslint-disable-line

  // Per-bet rake: push to server, update local from authoritative response.
  useEffect(() => {
    if (betAdded > 0 && betAdded !== prevBetRef.current) {
      prevBetRef.current = betAdded;
      (async () => {
        try {
          const next = await contributeBet("baseball", betAdded);
          setAmount(next);
          onAmountChange?.(next);
        } catch { /* swallow — KV unavailable */ }
      })();
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
        boxShadow: streakShadow,
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
  salaryCap: 180,
  sportLabel: "baseball",
  cardPositions: {
    "ftue-ohtani": "below",
    "ftue-freeman": "below",
    "ftue-jturner": "below",
    "ftue-scherzer": "above",
    "ftue-twilliams": "above",
  },
  cardTexts: {
    "ftue-freeman": "Freeman went deep — 1H, 1HR, 1R, 1RBI for 58 FP. Going Yard badge ⚾. Star bats deliver.",
    "ftue-jturner": "J. Turner went cold — 1H, no extras for 12 FP on a $20 card. Even veteran hitters have quiet nights. 🧊",
    "ftue-scherzer": "Scherzer was vintage — 6IP, 5K, 1ER, win, Quality Start ✅. 55 FP from a $38 arm. Stars can come cheap when timing's right.",
    "ftue-twilliams": "T. Williams gave you 5 IP, 4 K, 2 ER — 25 FP. Decent partial start from a $22 arm.",
  },
  anchorRevealText: "Ohtani was electric tonight. 🔥 2 hits, 1 HR, 2 RBI, scored a run. 79 FP — Going Yard badge ⚾ stacks on top. That's why you held him.",
  idleText: "Real stats. Real history. Your fantasy result instantly. Hit DEAL to get started." as any,
  holdIntroText: "5 players — 3 batters and 2 pitchers, $180 cap. Fantasy Points come from real stats — hits, home runs, strikeouts. Who do we keep?",
  holdAnchorText: "Ohtani is your $54 RED anchor — top batter in baseball. Tap his card to hold, then hit DRAW and tap each replacement to see your hand." as any,
  nearMissText: "So close — only 1 FP from the All-Star win. One more hit from J. Turner and we'd be celebrating a 7x score. ⚾",
  anchorFlipHintText: "Ohtani carried this hand — 79 FP is monster. Flip his card to see the full stat line. 🔥",
  anchorStatText: "2 H, 1 HR, 1 R, 2 RBI vs San Francisco. 71 base FP + 8 Going Yard badge ⚾ = 79. Badges are real. ✅",
  finalText: "Every game log comes from true historical games. Replay lets you relive baseball history at your fingertips. Hit Replay to start playing for real. ⚾",
};

// ── GameView ───────────────────────────────────────────────────────────────

export default function GameView() {

  // Zone 1: State
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const {
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
  const { user, isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [bigWinFired, setBigWinFired] = useState(false);
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
  // Tracks which cards have already had their salary deducted from the rolling
  // Budget so onCardFpStart and onTapReveal don't double-count.
  const deductedSalaryCardsRef = useRef<Set<string>>(new Set());
  const rosterRef = useRef<PlayerCard[]>([]);
  const { isFTUE, completeFTUE } = useFTUE("baseball");
  const [legendaryCardName, setLegendaryCardName] = useState<string | undefined>();
  const [revealIndex, setRevealIndex] = useState(0);
  const [lastRevealedCardId, setLastRevealedCardId] = useState<string | null>(null);
  const [celebrationHeld, setCelebrationHeld] = useState(false);
  const [ftueCardsBlocked, setFtueCardsBlocked] = useState(false);
  const [ftueReplayReady, setFtueReplayReady] = useState(false);
  const [ftueResultsDim, setFtueResultsDim] = useState(false);
  const [ftueAnchorFlipped, setFtueAnchorFlipped] = useState(false);
  const [ftueOscillating, setFtueOscillating] = useState(false);
  const [ftueCommentaryDone, setFtueCommentaryDone] = useState(false);
  const [ftueCommentaryOverride, setFtueCommentaryOverride] = useState<{ parts: React.ReactNode[]; sticky?: boolean } | null>(null);
  const [glowState, setGlowState] = useState<{ cardId: string | null; tier: string; durationMs: number }>({
    cardId: null, tier: "WHITE", durationMs: 300
  });
  /** After FTUE scripted gauge animation completes — bar stays frozen until next hand */
  const [ftueGaugeOscDone, setFtueGaugeOscDone] = useState(false);
  const [ftueWinCelebrationActive, setFtueWinCelebrationActive] = useState(false);
  const [ftueAnchorPulse, setFtueAnchorPulse] = useState(false);
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
  /** Legend icon gold-filled when pre-game msg is active OR daily bonus unseen */
  const [legendGold, setLegendGold] = useState(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem("replaymod_ftue_baseball") !== "1") return false;
    const today = new Date().toISOString().slice(0, 10);
    const seenToday = localStorage.getItem("replaymod_legend_seen_date") === today;
    const introSeen = localStorage.getItem("replaymod_pregame_intro_baseball") === "1";
    return !seenToday || !introSeen;
  });
  const [trophyPulsing, setTrophyPulsing] = useState(false);
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

  // ── Chad usher — full parity with basketball (welcome + educational + MVP-test
  // + auth-gated nudges). Trophy/legend icon blinking is skipped because baseball's
  // GameBar doesn't expose those props, but the modal trigger still fires.
  const chadFiredThisIdleRef = useRef(false);
  useEffect(() => {
    if (gameState !== "IDLE") chadFiredThisIdleRef.current = false;
  }, [gameState]);

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

  // Welcome — first time post-FTUE. Gated on IDLE so it doesn't fire the
  // moment isFTUE flips false (which is mid-FTUE-results, before the user
  // sees the FTUE finalText). Waits until they click Replay → state goes
  // IDLE → welcome fires as the first commentary line of normal game.
  useEffect(() => {
    if (isFTUE) return;
    if (gameState !== "IDLE") return;
    if (localStorage.getItem("replaymod_pregame_intro_baseball") === "1") return;
    localStorage.setItem("replaymod_pregame_intro_baseball", "1");
    chadFiredThisIdleRef.current = true;
    setLegendGold(true);
    setFtueCommentaryOverride({ parts: [chadMessage("welcome")], sticky: true });
  }, [isFTUE, gameState]);

  // Priority-ordered checks — first match wins
  // First rookie win — fires at RESULTS (winTier is set there; IDLE clears it).
  // Deterministic, one-time per device. Lights the legend pulse so the user
  // can read the scoring rules.
  useEffect(() => {
    if (isFTUE) return;
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return;
    if (winTier !== "ROOKIE") return;
    if (localStorage.getItem("rm_usher_rookie_first_win_bb") === "1") return;
    localStorage.setItem("rm_usher_rookie_first_win_bb", "1");
    setLegendGold(true);
    setFtueCommentaryOverride({ parts: [chadMessage("rookie_first_win")], sticky: true });
  }, [gameState, winTier, isFTUE]);

  useEffect(() => {
    if (isFTUE || gameState !== "IDLE") return;
    if (chadFiredThisIdleRef.current) return;

    const lastChadHand = parseInt(localStorage.getItem("rm_chad_last_hand_bb") ?? "0", 10);
    if (handCount - lastChadHand < 2 && handCount > 1) return;

    type ChadCheck = { key: string; topic: Parameters<typeof chadMessage>[0]; condition: boolean };
    const checks: ChadCheck[] = [
      { key: "rm_usher_lb_explainer_bb", topic: "leaderboard_explainer", condition: handCount >= 3 },
      { key: "rm_usher_mvp_thanks_bb",   topic: "mvp_thanks",            condition: handCount >= 5 },
      { key: "rm_usher_lb_shown_bb",     topic: "leaderboard_intro",     condition: isAnonymous && localStorage.getItem("rm_on_board_today") === "1" },
      { key: "rm_usher_big_win_bb",      topic: "big_win",               condition: isAnonymous && bigWinFired },
      { key: "rm_usher_dev_4thwall_bb",  topic: "dev_4thwall",           condition: handCount >= 15 },
      { key: "rm_usher_retention_bb",    topic: "retention",             condition: isAnonymous && handCount >= 12 },
    ];

    for (const { key, topic, condition } of checks) {
      if (!condition) continue;
      if (localStorage.getItem(key) === "1") continue;
      localStorage.setItem(key, "1");
      localStorage.setItem("rm_chad_last_hand_bb", String(handCount));
      chadFiredThisIdleRef.current = true;
      setFtueCommentaryOverride({ parts: [chadMessage(topic)], sticky: true });
      // Blink the relevant icon until tapped
      if (topic === "leaderboard_intro" || topic === "leaderboard_explainer") {
        setTrophyPulsing(true);
      } else {
        setLegendGold(true);
      }
      // Auth-gated topics also surface the modal a few seconds after the line
      if (topic === "leaderboard_intro" || topic === "big_win" || topic === "retention") {
        tryOpenAuthModal(`chad_${topic}`, 4500);
      }
      return;
    }
  }, [gameState, handCount, isFTUE, isAnonymous, bigWinFired, tryOpenAuthModal]);

  // Auth nudge — MVP+ hand while anonymous. Wait until the user has cleared
  // celebration and returned to IDLE so the modal doesn't pop over the
  // celebration animation. The "save your progress" prompt should only
  // surface at hand-conclusion, never mid-reveal.
  useEffect(() => {
    if (!isAnonymous || isFTUE) return;
    if (gameState !== "IDLE") return;
    if (winTier !== "MVP" && winTier !== "LEGEND") return;
    return tryOpenAuthModal("big_win", 2500, { tier: winTier ?? "" });
  }, [winTier, isAnonymous, isFTUE, gameState, tryOpenAuthModal]);

  // Auth nudge — fallback at hand 5 if no big win has converted.
  // IDLE only — never RESULTS, which would interrupt the score reveal.
  useEffect(() => {
    if (!isAnonymous || isFTUE) return;
    if (gameState !== "IDLE") return;
    if (handCount < 5) return;
    return tryOpenAuthModal("hand_5", 3500);
  }, [handCount, isAnonymous, isFTUE, gameState, tryOpenAuthModal]);

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
    onCardFpStart: useCallback((cId: string) => {
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
    }, []),
    onCardComplete: useCallback((cId: string) => {
      setRevealIndex(prev => {
        const next = prev + 1;
        audioDirector.setRevealProgress(next, rosterRef.current.length);
        return next;
      });
      setLastRevealedCardId(cId);

      // FTUE: start gauge oscillation shortly after the anchor's stamp lands
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
        const payout = calculatePayoutWithStreak(tier, currentBet, streak);
        setWinTier(tier);
        setWinPayout(payout);
        const bust = !tier || tier === "BUST";
        soundManager.playTierResult(tier);
        // Nudge trigger: first ALL_STAR+ hit for anonymous users
        if (["ALL_STAR", "MVP", "LEGEND"].includes(tier as string) && isAnonymous) {
          setBigWinFired(true);
        }
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
                submitToLeaderboard("streak", next);
                return next;
              });
              submitToLeaderboard("wins", 1);
              submitToLeaderboard("fp", totalFp);
              submitToLeaderboard("hand_best", totalFp, { proof: buildScoreProof(rosterRef.current as any[], totalFp) });
              submitToLeaderboard("hand_avg", totalFp, { handCount });
              submitToLeaderboard("money_won", payout);
              // Refresh on-board flag (drives trophy pulse via Chad leaderboard_intro topic)
              setTimeout(() => checkLeaderboardRank(), 2000);

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

  const isPreRevealFooter = gameState === "HOLD" && !isFTUE;
  const showGaugeInZone3 = true;
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
    if (tier === "LEGEND") return "LEGEND";
    return tier.replace("_", "-");
  };

  const celebrationData: CelebrationData | undefined = useMemo(() => {
    if (gameState !== "WIN_CELEBRATION" || !winTier) return undefined;
    const tc = CELEBRATION_TIER_COLORS[winTier] ?? { color: "#888", glow: "#88888833" };
    const tierMult = BASEBALL_WIN_TIERS[winTier]?.multiplier ?? 0;
    const isLoss = winTier === "BUST"; // ROOKIE is a partial win, not a loss
    const lossAmount = winTier === "BUST" ? BASE_BET * betMultiplier : 0;
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
    // Pre-reveal phases (DEALING/HOLD/DRAWING) must NOT leak the hidden actualFp.
    // Basketball relies on the (always-undefined) c.fp field to return 0 here;
    // baseball returns 0 explicitly to match.
    return 0;
  }, [gameState, runningTotalFp, roster, isFTUE]);

  const ceilingPct = useMemo(() => {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return null;
    // Realistic ceiling = projectedFp × 3.0 per card. Tuned against the
    // observed variance tail (top batter peak/avg ratio ~6×, top pitcher
    // ~1.7×, mixed roster ~3×). With the old 2.0 multiplier any LEGEND
    // hand pinned at 100% — misleading, since you can always do better.
    const maxPossible = roster.reduce((s, c: any) => s + Number(c.projectedFp ?? 0) * 3.0, 0);
    if (maxPossible <= 0 || totalFp <= 0) return null;
    return Math.min(100, Math.round((totalFp / maxPossible) * 100));
  }, [gameState, roster, totalFp]);


  // During anchor count-up: bar frozen at 5-card total (frozenBarFpRef)
  // During spring: springFp drives the bar
  // After spring: lockedGaugeFpRef holds the final value
  const displayFp = springFp ?? (frozenBarFpRef.current ?? (lockedGaugeFpRef.current ?? totalFp));
  const gaugeTotalFp = displayFp;
  latestGaugeFpRef.current = gaugeTotalFp;

  // Top Games: detect on the star card's real-life line.
  // Shared between commentary (as copyInput.topGame) and card render (topGameTier prop).
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
          "baseball",
        )
      : { tier: null as null, primaryReason: null, allReasons: [] as any[] };
    return { star, topGame };
  }, [roster]);

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
      topGame: topGameInfo.topGame,
    } as any;
    // Canonical commentary engine — selectCommentary is the sole source.
    const copy = selectCommentary(copyInput);
    postRevealCopyRef.current = copy;
    return copy;
  }, [gameState, winTier, springSettled, displayFp, roster, streak, ceilingPct]); // eslint-disable-line

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
    }
  }, [gameState]);

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
    // FTUE: only the anchor can be toggled, and once held cannot unhold
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
    // FTUE RESULTS: only the anchor is flippable while dim is active
    if (isFTUE && ftueResultsDim && cardKey !== "ftue-ohtani") return;
    setStatsFlippedIds(prev => {
      const next = new Set(prev);
      next.has(cardKey) ? next.delete(cardKey) : next.add(cardKey);
      return next;
    });
    // Track when the anchor is flipped in FTUE to trigger the final bubble
    if (isFTUE && cardKey === "ftue-ohtani") {
      setFtueAnchorFlipped(true);
      setFtueAnchorPulse(false);
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
      await sleep(DRAWING_DWELL_MS);
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
      deductedSalaryCardsRef.current = new Set(
        finalRoster.filter((c: any) => c.wasHeld).map((c: any) => String(c.cardId ?? c.basePlayerId ?? "")),
      );

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
      deductedSalaryCardsRef.current = new Set();
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

  // FTUE: when RESULTS starts, dim non-anchor, fire bubble
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
      // Fade out big win music if it's still playing (MVP/LEGEND celebration)
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
            <BonusRow
              betAdded={currentBet}
              streak={streak}
              onAmountChange={(v) => { bonusPoolRef.current = v; }}
            />
          </div>
        </div>

        {/* 2 — Card stage — flex:1 takes all remaining space after header + bottom grid */}
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
                ftueFlipTargetId={isFTUE && (ftueAnchorPulse || ftueHoldSpotlight) ? "ftue-ohtani" : null}
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
                  if (card && !(card as any).wasHeld && !deductedSalaryCardsRef.current.has(cardId)) {
                    setRevealedSalary(prev => prev + Number((card as any).salary ?? 0));
                    deductedSalaryCardsRef.current.add(cardId);
                  }
                  tapRevealCard(cardId);
                } : tapRevealCard)}
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
                topGameStarBasePlayerId={topGameInfo.star?.basePlayerId ?? null}
                topGameTier={topGameInfo.topGame.tier}
              />
            </RosterGridScaleFit>
          </div>
        </div>

        {/* 3 — Bottom landscape: CSS Grid, all rows fixed pixel — matches basketball */}
        {/* stats(72) gap(4) bar(14) gap(8) info(0) gap(4) commentary(96) gap(2) action(74) = 274px */}
        <div style={{
          flex: "0 0 auto",
          display: "grid",
          gridTemplateRows: "72px 4px 14px 8px 0px 4px 96px 2px 74px",
          gridTemplateColumns: "1fr",
          padding: "0 12px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}>

          {/* ROW 1 — Stats: Team FP+Budget OR tier label */}
          {/* Mirrors basketball/src/views/GameView.tsx score-row — keep both in sync until shared/views/GameView lands. Sport-specific bits (BASE_BET, CAP_MAX) come from each sport's config; layout/structure must match. */}
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
                        filter: `drop-shadow(0 0 24px ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).glow})`,
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
                          filter: `drop-shadow(0 0 12px ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).glow})`,
                          animation: "tierShrinkDown 500ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
                        }}
                      />
                      <div style={{ animation: "tierInfoFadeIn 300ms ease 500ms both", display: "flex", justifyContent: "center", alignItems: "center", gap: 20, marginTop: 4, width: "100%" }}>
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

          {/* ROW 3 — Tier bar + ROW 5 info + ROW 7 commentary (spans rows 3-7 via TierGauge) */}
          <div
            data-ftue-anchor="tier-gauge"
            style={{
              gridRow: "3 / 8",
              gridColumn: "1",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              overflow: "visible",
              zIndex: (isFTUE && ftueCommentaryOverride) ? 1100 : (isFTUE ? 1100 : undefined),
              pointerEvents: isFTUE ? "none" as const : "auto" as const,
            }}
          >
            {showGaugeInZone3 ? (
              <TierGauge
                totalFp={gaugeTotalFp}
                thresholds={GAUGE_THRESHOLDS as any}
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
            ) : null}
          </div>

          {/* Multiplier host — overlays commentary row 7, column 1 during HOLD */}
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

          {/* ROW 9 — Action row (74px fixed) */}
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
              justifyContent: "center",
              minHeight: 0,
              paddingBottom: "max(env(safe-area-inset-bottom, 0px), 8px)",
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
              ftueAnchorFlipped={ftueAnchorFlipped}
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
                // Non-FTUE: CoachLayer calls this after anchor bubble dismiss
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
              onFtueReadyToFlip={() => setFtueAnchorPulse(true)}
              onFtueAnchorHeld={() => { /* draw pulse handled inside CoachLayer */ }}
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
                setFtueAnchorFlipped(false);
                setFtueAnchorPulse(false);
                setFtueHoldSpotlight(false);
                setFtueGaugeOscDone(false);
                pendingCelebration.current = null;
                heldRevealResumeRef.current = null;
                handleButtonClick();
              }}
            />
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

        </div>{/* end CSS grid container */}

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
        ftueReplayPulse={(isFTUE && ftueReplayReady) || (!isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && springSettled)}
        dataFtuePrimaryAnchor={isFTUE ? (gameState === "HOLD" ? "draw" : "deal") : undefined}
        splitFooter={{ multipliersHost, controlsHost }}
        splitMultiplierRowVisible={isPreRevealFooter && !isFTUE}
        onViewLeaderboard={() => {
          setShowLeaderboard(true);
          setTrophyPulsing(false);
        }}
        trophyPulsing={trophyPulsing && !isFTUE}
        onLeaderboardOpened={() => setTrophyPulsing(false)}
        streak={streak}
        legendPulsing={legendGold && !isFTUE}
        onLegendOpened={() => {
          const today = new Date().toISOString().slice(0, 10);
          localStorage.setItem("replaymod_legend_seen_date", today);
          setLegendGold(false);
        }}
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
          onSaveAccount={() => {
            track("auth", "signup_modal_shown", { trigger: "profile_button", hand_number: handCount });
            setShowProfile(false);
            setShowRegisterModal(true);
          }}
          onOpenFeedback={() => setFeedbackOpen(true)}
        />
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