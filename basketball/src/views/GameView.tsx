/**
 * GameView.tsx
 * Orchestration only. No flip logic lives here.
 * Flip state is owned by useCardFlipState.
 * Reveal sequence is owned by useEmotionalReveal.
 */

import { useMemo, useState, useCallback, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import type { GamePhase, PlayerCard } from "../adapters/types";
import { sportAdapter } from "../adapters/SportAdapter";
import { dealInitialRoster, redrawRoster, resolveRoster, computeRosterCeiling } from "../adapters/gameAdapter";
import { dealFTUERoster, redrawFTUERoster, resolveFTUERoster } from "../adapters/ftueRoster";
import { CoachLayer } from "@shared/components/CoachLayer";
import { useFTUE } from "@shared/hooks/useFTUE";
import { ensureLoaded } from "../engines/dataEngine";
import { RosterGrid } from "../components/RosterGrid";
import { AppHeader } from "../components/AppHeader";
import { resetAllOverlays } from "../components/AthleteCard";
import { GameBar, type CelebrationData } from "../components/GameBar";
import { useCardFlipState } from "../hooks/useCardFlipState";
import { useEmotionalReveal, type RevealableCard } from "../hooks/useEmotionalReveal";
import { calculateWinTier, calculatePayout, calculatePayoutWithStreak, getStreakMultiplier, BASKETBALL_WIN_TIERS, STREAK_TIERS, type WinTier } from "../utils/payoutLogic";
import { detectExtremes } from "@shared/utils/extremeGames";
import { buildPostRevealCopy } from "../utils/buildPostRevealCopy";
import { composeCommentary } from "../../../shared/commentary/composeCommentary";
import { useGameAnalytics } from "../../../shared/analytics/useGameAnalytics";
import { CollectScreen } from '@shared/engagement/CollectScreen';
import { TierGauge, computeGaugeState } from '@shared/components/TierGauge';
import { useEngagement } from '@shared/engagement/useEngagement';
import { CoinDisplay } from '@shared/engagement/CoinDisplay';
import { DailyTasksPanel } from '@shared/engagement/DailyTasksPanel';
import { XPBar } from '@shared/engagement/XPBar';
import { soundManager } from '@shared/utils/soundManager';
import { audioDirector } from '@shared/utils/audioDirector';
import { getPlayerUid, getNickname, setNickname, getSessionId } from '@shared/utils/playerIdentity';
import { supabase } from "@shared/lib/supabase";
import { buildScoreProof } from '@shared/utils/scoreProof';
import { LeaderboardScreen } from '@shared/components/LeaderboardScreen';
import { generateCommentary } from "@shared/commentary/generateCommentary";
import { chadMessage } from "@shared/commentary/chad";
import type { CommentaryInput, CommentaryOutput, CommentaryRosterCard } from "@shared/commentary/types";
import { buildBasketballContext } from "../utils/buildBasketballContext";
import { ProfileScreen } from '@shared/components/ProfileScreen';
import { useAuth } from "@shared/auth/useAuth";
import { RegisterModal } from "@shared/components/RegisterModal";
import { PwaInstallPrompt } from "@shared/components/PwaInstallPrompt";

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
      setScale(Math.min(1, pw / mw, ph / mh));
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

// ── Jackpot constants ──────────────────────────────────────────────────────
// ── Economy constants (new system) ────────────────────────────────────────
const POOL_DRIP_INTERVAL_MS = 3000;
const POOL_DRIP_AMOUNT = 0.07; // ~1.4 coins/min at 3s interval

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
  let authHeader: Record<string, string> = {};
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authHeader = { Authorization: `Bearer ${session.access_token}` };
    }
  } catch { /* auth not available, submit unverified */ }
  try {
    await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ action: "submit", metric, value, uid, nickname, session_id: getSessionId(), ...extra }),
    });
  } catch { }
}

async function logHandToDb(
  roster: any[],
  totalFp: number,
  tier: string,
  payout: number,
  streak: number,
) {
  try {
    const uid = getPlayerUid();
    if (!uid || uid.startsWith("u_")) return; // Only log with real Supabase UID
    const rosterIds = roster
      .map((c: any) => String(c.basePlayerId ?? ""))
      .filter(Boolean);
    const { data: { session } } = await supabase.auth.getSession();
    const verified = !!session?.access_token;
    await supabase.from("hand_log").insert({
      player_id: uid,
      roster_ids: rosterIds,
      total_fp: totalFp,
      tier,
      payout,
      streak_at_play: streak,
      verified,
    });
  } catch { /* silent — audit trail is best-effort */ }
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
  { tier: "ROOKIE", minFP: 190 },
  { tier: "STARTER", minFP: 205 },
  { tier: "ALL_STAR", minFP: 225 },
  { tier: "MVP", minFP: 235 },
  { tier: "LEGEND", minFP: 255 },
];
const NEAR_MISS_FP = 5;

/** Must match salary → tier thresholds in shared/engines/economyEngine.ts (DEFAULT_ECONOMY_CONFIG.tierThresholds). */
function tierFromSalary(salary: number): string {
  const s = Number(salary ?? 0);
  return s >= 73 ? "RED" : s >= 58 ? "ORANGE" : s >= 44 ? "PURPLE" : s >= 30 ? "BLUE" : s >= 23 ? "GREEN" : "WHITE";
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
  if (fp >= 255) return "LEGEND";
  if (fp >= 235) return "MVP";
  if (fp >= 225) return "ALL_STAR";
  if (fp >= 205) return "STARTER";
  if (fp >= 190) return "ROOKIE";
  return "BUST";
}

// ── Spring oscillation waypoints ────────────────────────────────────────────
const SPRING_TIERS = [
  { name: "BUST", lo: 0, hi: 190 },
  { name: "ROOKIE", lo: 190, hi: 205 },
  { name: "STARTER", lo: 205, hi: 225 },
  { name: "ALL_STAR", lo: 225, hi: 235 },
  { name: "MVP", lo: 235, hi: 255 },
  { name: "LEGEND", lo: 255, hi: 9999 },
];
const SPRING_TIER_SPAN = 20.0;

/** Compute spring amplitude based on where finalFp lands relative to tier boundaries */
function computeSpringAmplitude(finalFp: number): number {
  const tier = SPRING_TIERS.find(t => finalFp >= t.lo && finalFp < t.hi)
    ?? SPRING_TIERS[SPRING_TIERS.length - 1];
  const margin = finalFp - tier.lo;
  const marginNorm = Math.min(1, margin / SPRING_TIER_SPAN);
  const fpNorm = Math.min(1, Math.max(0, (finalFp - 205) / 50));  // 205=STARTER floor, 50=LEGEND(255)-STARTER(205)
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
      22% { transform: scale(1.5) translateY(2px); opacity: 1; }
      38% { transform: scale(0.9) translateY(-1px); opacity: 1; }
      52% { transform: scale(1.2) translateY(1px); opacity: 1; }
      66% { transform: scale(0.97) translateY(0); opacity: 1; }
      80% { transform: scale(1.05) translateY(0); opacity: 1; }
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

// ── StreakDisplay — fire emojis showing current streak progress ───────────────
// Always visible. Spark animation on light-up or reset.
// 0 wins:  🔥🔥🔥 x1.2  (all dim)
// 3 wins:  🔥🔥🔥 x1.2 ✓ → 🔥🔥 x1.5 appears
// 5 wins:  ✓ ✓ → 🔥🔥🔥🔥🔥 x2.0 appears
// 10 wins: all lit, 2.0x active

const STREAK_STYLE_ID = "streak-spark-styles";
if (typeof document !== "undefined" && !document.getElementById(STREAK_STYLE_ID)) {
  const st = document.createElement("style");
  st.id = STREAK_STYLE_ID;
  st.textContent = `
    @keyframes streakSpark {
      0%   { transform: scale(0.5); opacity: 0; filter: brightness(3); }
      40%  { transform: scale(1.5); opacity: 1; filter: brightness(2); }
      100% { transform: scale(1);   opacity: 1; filter: brightness(1); }
    }
    @keyframes streakDim {
      0%   { transform: scale(1.3); opacity: 1; filter: brightness(2); }
      100% { transform: scale(1);   opacity: 0.2; filter: grayscale(1) brightness(1); }
    }
  `;
  document.head.appendChild(st);
}

function StreakFire({ lit, spark }: { lit: boolean; spark: "light" | "dim" | "none" }) {
  const anim = spark === "light" ? "streakSpark 0.4s ease-out forwards"
    : spark === "dim" ? "streakDim 0.4s ease-out forwards"
    : "none";
  return (
    <span style={{
      fontSize: 13, lineHeight: 1, display: "inline-block",
      opacity: lit ? 1 : 0.2,
      filter: lit ? "none" : "grayscale(1)",
      animation: anim,
    }}>🔥</span>
  );
}

function StreakFires({ count, lit, label, sparkKey }: { count: number; lit: number; label: string; sparkKey: number }) {
  const prevLitRef = useRef(lit);
  const [sparks, setSparks] = useState<Array<"light" | "dim" | "none">>(Array(count).fill("none"));

  useEffect(() => {
    const prev = prevLitRef.current;
    prevLitRef.current = lit;
    if (prev === lit) return;
    const newSparks: Array<"light" | "dim" | "none"> = Array(count).fill("none");
    if (lit > prev) {
      // Lighting up
      for (let i = prev; i < lit && i < count; i++) newSparks[i] = "light";
    } else {
      // Dimming (streak reset)
      for (let i = lit; i < prev && i < count; i++) newSparks[i] = "dim";
    }
    setSparks(newSparks);
    const t = setTimeout(() => setSparks(Array(count).fill("none")), 500);
    return () => clearTimeout(t);
  }, [lit, count]); // eslint-disable-line

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {Array.from({ length: count }, (_, i) => (
        <StreakFire key={`${sparkKey}-${i}`} lit={i < lit} spark={sparks[i]} />
      ))}
      <span style={{ fontSize: 9, fontWeight: 800, color: lit >= count ? "#FFD700" : "rgba(255,255,255,0.35)", marginLeft: 2 }}>{label}</span>
    </div>
  );
}

function StreakDisplay({ streak }: { streak: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
      <StreakFires count={3} lit={Math.min(streak, 3)} label="x1.2" sparkKey={streak} />
      {streak >= 3 && <StreakFires count={2} lit={Math.min(streak - 3, 2)} label="x1.5" sparkKey={streak} />}
      {streak >= 5 && <StreakFires count={5} lit={Math.min(streak - 5, 5)} label="x2.0" sparkKey={streak} />}
    </div>
  );
}

// ── BonusPoolPill — pool meter with drip + gold blink on bet ─────────────────

function BonusPoolPill({ betAmount, betNonce, onAmountChange }: {
  betAmount: number;
  betNonce: number;
  onAmountChange?: (v: number) => void;
}) {
  const [amount, setAmount] = useState(1000);
  const [displayAmount, setDisplayAmount] = useState(1000);
  const [pulse, setPulse] = useState(false);
  const prevNonceRef = useRef(betNonce);
  const rafRef = useRef(0);

  // Passive drip
  useEffect(() => {
    const id = setInterval(() => {
      setAmount(p => {
        const next = parseFloat((p + POOL_DRIP_AMOUNT).toFixed(2));
        onAmountChange?.(next);
        return next;
      });
    }, POOL_DRIP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line

  // Sync display with amount for drip (no animation needed for tiny drip increments)
  useEffect(() => {
    if (!pulse) setDisplayAmount(amount);
  }, [amount, pulse]);

  // 5% rake on every bet — pulse + animated roll-up
  useEffect(() => {
    if (betNonce === prevNonceRef.current) return;
    prevNonceRef.current = betNonce;
    const rake = parseFloat((betAmount * 0.05).toFixed(2));
    if (rake <= 0) return;

    const startVal = amount;
    const endVal = parseFloat((amount + rake).toFixed(2));
    setAmount(endVal);
    onAmountChange?.(endVal);

    // Pulse glow
    setPulse(true);

    // Animated roll-up over 800ms
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

// ── GameView ───────────────────────────────────────────────────────────────

export default function GameView() {

  // Zone 1: State
  const [gameState, setGameState] = useState<GameState>("IDLE");
  const {
    taskStates,
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
  const [betNonce, setBetNonce] = useState(0);
  const [balance, setBalance] = useState(() => loadBalance());
  const [isBalanceAnimating, setIsBalanceAnimating] = useState(false);
  const [winTier, setWinTier] = useState<WinTier | null>(null);
  const [winPayout, setWinPayout] = useState(0);
  const [showRawScore, setShowRawScore] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [bigWinFired, setBigWinFired] = useState(false);
  const sessionCount = useRef(parseInt(localStorage.getItem("rm_session_count") ?? "0", 10));
  // Bumped when fetchLeaderboardContext patches postRevealCopyRef.current.secondary,
  // forcing the postRevealCopy useMemo to re-read the ref. Each new hand resets the
  // ref to null and we kick off a fresh fetch.
  const [lbContextNonce, setLbContextNonce] = useState(0);

  useEffect(() => {
    if (gameState === "IDLE" || gameState === "HOLD") setShowRawScore(false);
  }, [gameState]);

  useEffect(() => {
    const next = sessionCount.current + 1;
    sessionCount.current = next;
    localStorage.setItem("rm_session_count", String(next));
  }, []);
  const [noTransition, setNoTransition] = useState(false);
  const [revealedSalary, setRevealedSalary] = useState(0);
  const [gameError, setGameError] = useState<string | null>(null);
  const rosterRef = useRef<PlayerCard[]>([]);
  const { isFTUE, completeFTUE } = useFTUE("basketball");
  // Ref mirror so async closures always read the latest isFTUE without stale capture
  const isFTUERef = useRef(isFTUE);
  useEffect(() => { isFTUERef.current = isFTUE; }, [isFTUE]);
  const [legendaryCardName, setLegendaryCardName] = useState<string | undefined>();
  const [revealIndex, setRevealIndex] = useState(0);
  const [lastRevealedCardId, setLastRevealedCardId] = useState<string | null>(null);
  const [celebrationHeld, setCelebrationHeld] = useState(false);
  const [ftueCardsBlocked, setFtueCardsBlocked] = useState(false);
  const [ftueReplayReady, setFtueReplayReady] = useState(false);
  const [ftueResultsDim, setFtueResultsDim] = useState(false);
  const [ftueBookerFlipped, setFtueBookerFlipped] = useState(false);
  const [ftueOscillating, setFtueOscillating] = useState(false);
  const [ftueCommentaryDone, setFtueCommentaryDone] = useState(false);
  const [ftueCommentaryOverride, setFtueCommentaryOverride] = useState<{ parts: React.ReactNode[]; sticky?: boolean } | null>(null);
  const coachDismissRef = useRef<(() => void) | null>(null);
  const [glowState, setGlowState] = useState<{ cardId: string | null; tier: string; durationMs: number }>({
    cardId: null, tier: "WHITE", durationMs: 300
  });
  /** After FTUE scripted gauge animation completes — bar stays frozen until next hand */
  const [ftueGaugeOscDone, setFtueGaugeOscDone] = useState(false);
  const [ftueWinCelebrationActive, setFtueWinCelebrationActive] = useState(false);
  const [ftueBookerPulse, setFtueBookerPulse] = useState(false);
  const [ftueHoldSpotlight, setFtueHoldSpotlight] = useState(false);
  const [ftueCoachBubbleKey, setFtueCoachBubbleKey] = useState<string | null>(null);
  /** Legend icon gold-filled when pre-game msg is active OR daily bonus unseen */
  const [legendGold, setLegendGold] = useState(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem("replaymod_ftue_basketball") !== "1") return false;
    const today = new Date().toISOString().slice(0, 10);
    const seenToday = localStorage.getItem("replaymod_legend_seen_date") === today;
    const introSeen = localStorage.getItem("replaymod_pregame_intro_basketball") === "1";
    return !seenToday || !introSeen;
  });

  // Hand count — used for commentary, leaderboard, and Chad. Must be declared
  // before any useEffect that references it to avoid TDZ in production builds.
  const [handCount, setHandCount] = useState<number>(() =>
    parseInt(localStorage.getItem("replaymod_hand_count") ?? "1", 10)
  );

  // ── Chad usher — single priority queue, max one message per IDLE return ──

  const chadFiredThisIdleRef = useRef(false);
  const chadLastHandRef = useRef(-1);

  // Reset gate when leaving IDLE (new hand started)
  useEffect(() => {
    if (gameState !== "IDLE") chadFiredThisIdleRef.current = false;
  }, [gameState]);

  // Welcome message: first time post-FTUE (highest priority, fires immediately)
  useEffect(() => {
    if (isFTUE) return;
    if (localStorage.getItem("replaymod_pregame_intro_basketball") === "1") return;
    localStorage.setItem("replaymod_pregame_intro_basketball", "1");
    chadFiredThisIdleRef.current = true;
    setLegendGold(true);
    setFtueCommentaryOverride({ parts: [chadMessage("welcome")], sticky: true });
  }, [isFTUE]);

  // All other Chad messages — evaluated once per IDLE, pick highest priority eligible
  useEffect(() => {
    if (isFTUE || gameState !== "IDLE") return;
    if (chadFiredThisIdleRef.current) return;
    // Don't fire on the same hand twice
    if (chadLastHandRef.current === handCount) return;

    // Minimum 2 hands between Chad messages
    const lastChadHand = parseInt(localStorage.getItem("rm_chad_last_hand") ?? "0", 10);
    if (handCount - lastChadHand < 2 && handCount > 1) return;

    // Priority-ordered checks — first match wins
    type ChadCheck = { key: string; topic: Parameters<typeof chadMessage>[0]; condition: boolean; resultsOnly?: boolean };
    const checks: ChadCheck[] = [
      // Leaderboard explainer — after 3rd hand
      { key: "rm_usher_lb_explainer", topic: "leaderboard_explainer", condition: handCount >= 3 },
      // Leaderboard qualification — anonymous, on the board
      { key: "rm_usher_lb_shown", topic: "leaderboard_intro", condition: isAnonymous && localStorage.getItem("rm_on_board_today") === "1" },
      // Big win — anonymous, ALL_STAR+ hit
      { key: "rm_usher_big_win", topic: "big_win", condition: isAnonymous && bigWinFired },
      // Retention — 12+ hands, anonymous
      { key: "rm_usher_retention_shown", topic: "retention", condition: isAnonymous && handCount >= 12 },
    ];

    for (const { key, topic, condition } of checks) {
      if (!condition) continue;
      if (localStorage.getItem(key) === "1") continue;
      // Fire this one
      localStorage.setItem(key, "1");
      localStorage.setItem("rm_chad_last_hand", String(handCount));
      chadFiredThisIdleRef.current = true;
      chadLastHandRef.current = handCount;
      setFtueCommentaryOverride({ parts: [chadMessage(topic)], sticky: true });
      return;
    }
  }, [gameState, handCount, isFTUE, isAnonymous, bigWinFired]);

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
  // streakMilestone removed — streak now directly multiplies payout

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
  const nearMissChoreTimersRef = useRef<number[]>([]);

  // Spring oscillation phase — fires after all cards settle, before results lock in
  const [springFp, setSpringFp] = useState<number | null>(null);
  const [springSettled, setSpringSettled] = useState(false);
  const springRafRef = useRef<number>(0);
  const springTimersRef = useRef<number[]>([]);
  const pendingBalanceUpdateRef = useRef<(() => void) | null>(null);
  const bonusPoolRef = useRef<number>(1000);
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

  // handCount declared above Chad effects (line ~652) to avoid TDZ in production builds.

  // 3rd hand nudge: show leaderboard intro after hand 3 (when returning to IDLE)
  useEffect(() => {
    if (isFTUE || gameState !== "IDLE") return;
    const count = parseInt(localStorage.getItem("replaymod_hand_count") ?? "0", 10);
    if (count === 3 && localStorage.getItem("replaymod_lb_nudge_shown") !== "1") {
      localStorage.setItem("replaymod_lb_nudge_shown", "1");
      setPreGameMsg("LEADERBOARD_INTRO");
    }
  }, [gameState, isFTUE]); // eslint-disable-line

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
    ensureLoaded().then(() => setDataReady(true)).catch(() => setGameError("Failed to load game data. Check your connection and try again."));
  }, []);

  const flipState = useCardFlipState();
  const revealableCards = useMemo(() => toRevealableCards(roster), [roster]);
  const currentBet = BASE_BET * betMultiplier;
  const gameAnalytics = useGameAnalytics("basketball");

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

      // FTUE: start gauge oscillation shortly after Tatum's stamp lands
      if (isFTUE && cId === "ftue-tatum") {
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
        // ROOKIE = neutral for streak (doesn't advance or break). BUST = streak reset.
        const isStreakWin = !bust && tier !== "ROOKIE";  // STARTER+ advances streak
        const isStreakLoss = bust;                        // only BUST resets streak
        soundManager.playTierResult(tier);
        // Nudge trigger: first ALL_STAR+ hit for anonymous users
        if (["ALL_STAR", "MVP", "LEGEND"].includes(tier) && isAnonymous) {
          setBigWinFired(true);
        }
        const badges = rosterRef.current.reduce((s, c) => s + (c.achievements?.length ?? 0), 0);
        gameAnalytics.handResolved(totalFp, String(tier), bust, badges, Date.now());
        logHandToDb(rosterRef.current, totalFp, String(tier), payout, streak);
        recordHandPlayed();
        if (!bust) recordHandWon(); else recordHandLost();
        if (isFTUE) {
          // FTUE: same flow as real game — WIN_CELEBRATION triggers wage animation
          ftueLastHandFpRef.current = totalFp;
          pendingBalanceUpdateRef.current = () => {
            if (payout > 0) {
              setBalance(prev => { const next = prev + payout; saveBalance(next); return next; });
            }
          };
          const t = window.setTimeout(() => {
            setGameState("WIN_CELEBRATION");
          }, 1200);
          springTimersRef.current.push(t);
        } else {
          pendingBalanceUpdateRef.current = () => {
            if (payout > 0) {
              setBalance(prev => { const next = prev + payout; saveBalance(next); return next; });
            }
            const proof = buildScoreProof(rosterRef.current as any[], totalFp);
            if (isStreakWin) {
              // STARTER+ = streak advances
              setStreak(prev => {
                const next = prev + 1;
                localStorage.setItem("replaymod_streak", String(next));
                if (next === 3 || next === 5 || next === 10) soundManager.playStreakMilestone(next);
                submitToLeaderboard("streak", next);
                return next;
              });
              submitToLeaderboard("wins", 1);
              submitToLeaderboard("money_won", payout);
            } else if (isStreakLoss) {
              // BUST = streak resets
              setStreak(0);
              localStorage.setItem("replaymod_streak", "0");
            }
            // ROOKIE: streak unchanged (neutral) — no increment, no reset
            // These fire for all non-bust hands (ROOKIE still counts for leaderboard/session)
            if (!bust) {
              submitToLeaderboard("fp", totalFp);
              if (handCount >= 8) submitToLeaderboard("hand_avg", totalFp, { handCount });
              const handId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
              submitToLeaderboard("hand_best", totalFp, { proof, handId });
              submitToLeaderboard("session_score", parseFloat(totalFp.toFixed(1)));
              setTimeout(() => checkLeaderboardRank(), 2000);
            }
            // Update personal bests on every hand
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
          };
          const t = window.setTimeout(() => {
            setGameState("WIN_CELEBRATION");
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

  // Multiplier row only visible during HOLD (user choosing bet before draw)
  const isPreRevealFooter = gameState === "HOLD" && !isFTUE;
  // Tier gauge is ALWAYS visible — fixed in place throughout the game
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
    const tierMult = BASKETBALL_WIN_TIERS[winTier]?.multiplier ?? 0;
    const isLoss = winTier === "BUST"; // ROOKIE is a partial win, not a loss
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
      return roster.reduce((sum, c) => sum + (c.fp ?? 0), 0);
    }
    return 0;
  }, [gameState, runningTotalFp, roster, isFTUE]);

  const ceilingPct = useMemo(() => {
    if (gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return null;
    // Ceiling = sum of each player's PERSONAL PEAK FP from their 2024-25 game logs.
    // "What if all 6 players hit their absolute best night?"
    const maxPossible = computeRosterCeiling(roster);
    if (maxPossible <= 0 || totalFp <= 0) return null;
    return Math.min(100, Math.round((totalFp / maxPossible) * 100));
  }, [gameState, roster, totalFp]);

  /** Running total of ALL bonuses (daily + badges) — only counts revealed cards.
   *  Accumulates per card reveal, starts at 0, reaches full total after all cards shown. */
  const rosterTotalBonus = useMemo(() => {
    if (gameState === "IDLE" || gameState === "DEALING") return 0;
    const isPostReveal = gameState === "RESULTS" || gameState === "WIN_CELEBRATION";
    return roster.reduce((sum, c: any) => {
      const cId = String(c?.cardId ?? c?.basePlayerId ?? "");
      const isRevealed = isPostReveal || getVisibleFp(cId) != null;
      if (!isRevealed) return sum;
      const daily = Number(c?.dailyBonus ?? 0) || 0;
      const badges = Array.isArray(c?.achievements) ? c.achievements.reduce((s: number, b: any) => s + (Number(b?.fp) || 0), 0) : 0;
      return sum + daily + badges;
    }, 0);
  }, [gameState, roster, getVisibleFp]);


  // During anchor count-up: bar frozen at 5-card total (frozenBarFpRef)
  // During spring: springFp drives the bar
  // After spring: lockedGaugeFpRef holds the final value
  const displayFp = springFp ?? (frozenBarFpRef.current ?? (lockedGaugeFpRef.current ?? totalFp));
  const gaugeTotalFp = displayFp;
  latestGaugeFpRef.current = gaugeTotalFp;

  // Smart post-reveal copy — computed once when spring settles, then locked for the hand.
  // Uses a ref so the copy never changes mid-display from dependency churn.
  const postRevealCopyRef = useRef<ReturnType<typeof buildPostRevealCopy> | null>(null);
  // Claude-generated commentary, populated by the REVEALING-phase pre-fetch effect.
  // postRevealCopy memo prefers this over the template fallback. Reset per hand.
  const commentaryRef = useRef<CommentaryOutput | null>(null);
  // Status of the Claude pre-fetch for the CURRENT hand. The memo blocks rendering
  // (returns null → empty commentary box) while 'pending', so the template never
  // shows-then-swaps. Only after 'succeeded' or 'failed' does the memo populate.
  // 'idle' = no fetch yet; 'pending' = fetch in flight; 'succeeded' = use Claude;
  // 'failed' = use template fallback (or static).
  const commentaryStatusRef = useRef<'idle' | 'pending' | 'succeeded' | 'failed'>('idle');
  // Per-hand dedup so the pre-fetch effect fires exactly once per hand.
  const commentaryFiredHandRef = useRef<number>(-1);
  // Last 3 tones used by Claude — passed back into the prompt to enforce variation.
  const recentTonesRef = useRef<string[]>([]);
  const postRevealCopy = useMemo(() => {
    // Once computed, lock it — never recompute until next hand
    if (postRevealCopyRef.current) return postRevealCopyRef.current;
    if ((gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") || !winTier || !springSettled) return null;
    // FTUE: no postRevealCopy — commentary handled by CoachLayer
    if (isFTUE) {
      return null;
    }
    // While Claude is in flight, render NOTHING. We deliberately wait so the
    // template never shows-then-swaps. The pre-fetch effect transitions status
    // to 'succeeded' or 'failed' on resolve and bumps lbContextNonce to re-run
    // this memo. The 3s timeout in generateCommentary guarantees we never wait
    // forever.
    if (commentaryStatusRef.current === 'pending') {
      return null;
    }
    // Tier 1: Claude commentary if it landed.
    if (commentaryStatusRef.current === 'succeeded' && commentaryRef.current?.commentary) {
      const copy = { primary: commentaryRef.current.commentary, secondary: "" };
      postRevealCopyRef.current = copy;
      return copy;
    }
    const fp = lockedGaugeFpRef.current ?? displayFp;
    const gaugeSnap = computeGaugeState(fp, GAUGE_THRESHOLDS as any, winTier, 8);
    const USE_NEW_COMMENTARY = true; // Feature flag — flip to false to revert

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
      sport: "basketball",
    };

    const copy = USE_NEW_COMMENTARY
      ? composeCommentary(copyInput as any)
      : buildPostRevealCopy(copyInput as any);
    // Tier 3: static fallback if template returned an unusable result.
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
      // FTUE: only play slam animation once — never re-enter after first run
      if (isFTUE && ftueTierSlamPlayedRef.current) return;
      if (isFTUE) ftueTierSlamPlayedRef.current = true;
      nearMissChoreTimersRef.current.forEach(clearTimeout);
      nearMissChoreTimersRef.current = [];
      setNearMissTeasing(false);
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
      commentaryFiredHandRef.current = -1;
      // streakMilestone removed
    }
  }, [gameState]);

  // ── Claude commentary pre-fetch ─────────────────────────────────────────
  // Fire as soon as REVEALING starts. By then rosterRef holds finalized cards
  // (actualFp is already resolved server-side; the reveal phase is animation).
  // Result lands in commentaryRef and the postRevealCopy memo prefers it.
  // Per-hand dedup via commentaryFiredHandRef.
  useEffect(() => {
    if (gameState !== "REVEALING") return;
    if (isFTUE) return;
    if (commentaryFiredHandRef.current === handCount) return;
    commentaryFiredHandRef.current = handCount;
    commentaryStatusRef.current = 'pending';

    const finalRoster = rosterRef.current;
    if (!finalRoster.length) {
      commentaryStatusRef.current = 'failed';
      return;
    }

    const finalFp = finalRoster.reduce(
      (s, c: any) => s + Number(c.actualFp ?? 0),
      0,
    );
    const finalTier = (deriveTierFromFp(finalFp) ?? "BUST") as any;
    const gauge = computeGaugeState(
      finalFp,
      GAUGE_THRESHOLDS as any,
      finalTier,
      8,
    );

    const rosterShape: CommentaryRosterCard[] = finalRoster.map((c: any) => ({
      name: String(c.name ?? ""),
      salary: Number(c.salary ?? 0),
      actualFp: Number(c.actualFp ?? 0),
      projectedFp: Number(c.projectedFp ?? 0),
      cardTier: String(c.tier ?? ""),
      opponent: String(c.gameInfo?.opponent ?? ""),
      homeAway: String(c.gameInfo?.homeAway ?? "") as "H" | "A" | "",
      statLine: c.statLine ?? {},
      extremeFlags: detectExtremes(c.statLine ?? {}, Number(c.salary ?? 0)),
    }));

    const culture = buildBasketballContext(rosterShape);

    const input: CommentaryInput = {
      sport: "basketball",
      totalFp: finalFp,
      winTier: finalTier,
      nextTier: gauge.nextTier as any,
      tierFloor: gauge.curMin,
      nextTierMin: gauge.nextMin > 0 && gauge.nextMin < 9999 ? gauge.nextMin : undefined,
      streak,
      prevStreak: finalTier === "BUST" ? streak : Math.max(0, streak - 1),
      isBust: finalTier === "BUST",
      handCount,
      roster: rosterShape,
      // TODO: leaderboard rank/gap input — requires exposing raw rank from
      // leaderboardContext alongside its current string output. Until then,
      // Claude generates without leaderboard awareness; the legacy patch
      // path still adds a nudge line when Claude is unavailable.
    };

    generateCommentary(input, culture, recentTonesRef.current).then(result => {
      if (result) {
        commentaryRef.current = result;
        if (result.tone) {
          const next = [result.tone, ...recentTonesRef.current.filter(t => t !== result.tone)].slice(0, 6);
          recentTonesRef.current = next;
        }
      }
      commentaryStatusRef.current = result ? 'succeeded' : 'failed';
      // Clear the locked ref so the memo recomputes and picks the new tier.
      postRevealCopyRef.current = null;
      setLbContextNonce(n => n + 1);
    }).catch(() => {
      commentaryStatusRef.current = 'failed';
      postRevealCopyRef.current = null;
      setLbContextNonce(n => n + 1);
    });
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
    // FTUE: only Tatum can be toggled, and once held cannot unhold
    if (isFTUE && cardKey !== "ftue-tatum") return;
    if (isFTUE && cardKey === "ftue-tatum" && lockedCardIds.has(cardKey)) return;
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
    // FTUE RESULTS: only Tatum is flippable while dim is active
    if (isFTUE && ftueResultsDim && cardKey !== "ftue-tatum") return;
    setStatsFlippedIds(prev => {
      const next = new Set(prev);
      next.has(cardKey) ? next.delete(cardKey) : next.add(cardKey);
      return next;
    });
    // Track when Tatum is flipped in FTUE to trigger the final bubble
    if (isFTUE && cardKey === "ftue-tatum") {
      setFtueBookerFlipped(true);
      setFtueBookerPulse(false);
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
      setFtueBookerPulse(false);
      setFtueHoldSpotlight(false);
      pendingCelebration.current = null;
      ftueLastHandFpRef.current = 0;
      // Read FTUE state from localStorage directly — completeFTUE() writes synchronously
      // before setIsFTUE(), so this avoids any React state/effect timing issues.
      // Mirrors useFTUE.readFtueActive() logic for the ?ftue=1 URL override.
      const ftueStillActive = (() => {
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get("ftue") === "1") return true;
          if (params.get("skip") === "1") return false;
          if (localStorage.getItem("replaymod_ftue_basketball") === "1") return false;
          return true;
        } catch {
          return true;
        }
      })();
      let res: any;
      try {
        res = ftueStillActive ? await dealFTUERoster() : await dealInitialRoster();
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
      await sleep(700);
      let drawRes: any, resolveRes: any;
      try {
        drawRes = isFTUE
          ? await redrawFTUERoster({ currentCards: markedRoster, lockedCardIds })
          : await redrawRoster({ currentCards: markedRoster, lockedCardIds });
        const drawnRoster = (drawRes?.roster ?? drawRes?.cards ?? markedRoster) as PlayerCard[];
        resolveRes = isFTUE
          ? await resolveFTUERoster({ finalCards: drawnRoster })
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
      // FTUE: tapping Replay completes the FTUE — write localStorage synchronously
      // so the next deal routes to dealInitialRoster() instead of dealFTUERoster()
      if (isFTUE) {
        try {
          localStorage.setItem("replaymod_ftue_basketball", "1");
        } catch { /* ignore */ }
        gameAnalytics.ftueCompleted();
        completeFTUE();
        setFtueCommentaryOverride(null);
        setFtueCommentaryDone(false);
        setFtueWinCelebrationActive(false);
        setFtueReplayReady(false);
        setFtueBookerFlipped(false);
        setFtueBookerPulse(false);
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
      // Fade out big win music if it's still playing (MVP/LEGEND celebration)
      if (gameState === "WIN_CELEBRATION") {
        soundManager.stopBigWin();
      }
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
            />
          </div>
          <div data-ftue-chrome="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px" }}>
            <BonusPoolPill
              betAmount={currentBet}
              betNonce={betNonce}
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
          padding: "4px 2px 2px 2px",
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
                ftueFlipTargetId={isFTUE && (ftueBookerPulse || ftueHoldSpotlight) ? "ftue-tatum" : null}
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
                    ? 2
                    : (isFTUE && (ftueHoldSpotlight || heldCardIds.has("ftue-tatum")) && gameState === "HOLD")
                      ? 2
                      : null
                }
              />
            </RosterGridScaleFit>
          </div>
        </div>

        {/* ── Bottom landscape: CSS Grid, all rows fixed pixel, nothing moves ── */}
        {/* Rows: stats(40) gap(6) bar(14) gap(4) info(28) gap(4) commentary(62) gap(4) action(50) = 212px total */}
        <div style={{
          flex: "0 0 auto",
          display: "grid",
          gridTemplateRows: "40px 6px 14px 4px 28px 4px 62px 4px 50px",
          gridTemplateColumns: "1fr",
          padding: "0 12px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}>

          {/* ROW 1 — Stats row: Team FP+Budget OR tier label (30px) */}
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
                      src={`/${TIER_IMAGE_MAP[winTier] ?? "bust1.png"}`}
                      alt={formatTierLabel(winTier)}
                      style={{
                        maxHeight: 80, maxWidth: "100%", objectFit: "contain",
                        filter: `drop-shadow(0 0 24px ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).glow})`,
                        animation: "tierSlam 900ms cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    />
                  </>
                )}
                {tierResultPhase === 2 && (
                  <img
                    key={`tier-stay-${winTier}`}
                    src={`/${TIER_IMAGE_MAP[winTier] ?? "bust1.png"}`}
                    alt={formatTierLabel(winTier)}
                    style={{
                      maxHeight: 80, maxWidth: "100%", objectFit: "contain",
                      filter: `drop-shadow(0 0 12px ${(CELEBRATION_TIER_COLORS[winTier] ?? CELEBRATION_TIER_COLORS.BUST).glow})`,
                      animation: "tierShrinkDown 500ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
                    }}
                  />
                )}
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
              /* z-index handled by commentary div inside TierGauge, not the wrapper */
            }}
          >
            <TierGauge
              totalFp={gaugeTotalFp}
              thresholds={GAUGE_THRESHOLDS}
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
              commentaryOverride={ftueCommentaryOverride}
              hideBar={isFTUE && gameState === "REVEALING" && ftueCardsBlocked}
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
              belowBarSlot={
                (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && winTier ? (
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    width: "100%",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                      <span style={{
                        fontSize: 14, fontWeight: 900, lineHeight: 1,
                        color: winTier === "BUST" ? "#FF3B30" : "#22C55E",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {winTier === "BUST" ? `−${BASE_BET * betMultiplier}` : `+${winPayout}`}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)",
                        marginTop: 1, whiteSpace: "nowrap",
                      }}>
                        {betMultiplier === 1 ? `${BASE_BET} wager` : `${BASE_BET} × ${betMultiplier}x wager`}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <span style={{
                        fontSize: 14, fontWeight: 900, lineHeight: 1, color: "#FFFFFF",
                        fontVariantNumeric: "tabular-nums", fontStyle: "italic",
                      }}>
                        {displayFp.toFixed(1)} FP
                      </span>
                      {ceilingPct != null && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)",
                          marginTop: 1,
                        }}>
                          {ceilingPct}% of ceiling
                        </span>
                      )}
                    </div>
                  </div>
                ) : undefined
              }
            />
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

          {/* ROW 9 — Action row (50px fixed) */}
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
              ftueBookerFlipped={ftueBookerFlipped}
              onCoachBubbleKey={(key) => {
                setFtueCoachBubbleKey(key);
                if (key === "hold_tatum") setFtueHoldSpotlight(true);
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
              onCommentaryText={(parts, sticky) => setFtueCommentaryOverride(parts ? { parts, sticky } : null)}
              dismissRef={coachDismissRef}
              onReplayReady={() => setFtueReplayReady(true)}
              onFtueReadyToFlip={() => setFtueBookerPulse(true)}
              onFtueBookerHeld={() => { /* draw pulse handled inside CoachLayer */ }}
              onFtueAllDone={() => {
                // Don't completeFTUE here — isFTUE must stay true for stickyLastOverride
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
                setFtueBookerFlipped(false);
                setFtueBookerPulse(false);
                setFtueHoldSpotlight(false);
                setFtueGaugeOscDone(false);
                ftueTierSlamPlayedRef.current = false;
                pendingCelebration.current = null;
                heldRevealResumeRef.current = null;
                // Delay handleButtonClick so completeFTUE state propagates first
                setTimeout(() => handleButtonClick(), 0);
              }}
            />
            {showCollect && !isFTUE && (
              <CollectScreen
                taskStates={taskStates}
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

        </div>{/* close bottom landscape wrapper */}

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
          // FTUE: trigger commentary flow after balance roll up completes
          if (isFTUE) {
            setTimeout(() => {
              setFtueWinCelebrationActive(true);
              setFtueCommentaryDone(true);
            }, 800);
          }
        }}
        ftueDrawBlocked={isFTUE && gameState === "HOLD" && !heldCardIds.has("ftue-tatum")}
        ftueHideSkip={isFTUE}
        ftueHideBalance={isFTUE && (gameState === "IDLE" || gameState === "DEALING" || gameState === "HOLD")}
        ftuePulseNearMiss={isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && !ftueGaugeOscDone}
        ftueReplayBlocked={isFTUE && (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") && !ftueReplayReady}
        ftueReplayPulse={isFTUE && ftueReplayReady}
        dataFtuePrimaryAnchor={isFTUE ? (gameState === "HOLD" ? "draw" : "deal") : undefined}
        hideTierBar
        splitFooter={{ multipliersHost, controlsHost }}
        splitMultiplierRowVisible={isPreRevealFooter && !isFTUE}
        onViewLeaderboard={() => setShowLeaderboard(true)}
        legendPulsing={legendGold && !isFTUE}
        streak={streak}
        onLegendOpened={() => {
          const today = new Date().toISOString().slice(0, 10);
          localStorage.setItem("replaymod_legend_seen_date", today);
          setLegendGold(false);
        }}
      />

      {showLeaderboard && !isFTUE && (
        <LeaderboardScreen
          currentUid={getPlayerUid()}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {showProfile && (
        <ProfileScreen
          currentUid={getPlayerUid()}
          onClose={() => setShowProfile(false)}
        />
      )}


      {/* PWA install prompt — fires after 3rd real hand, never during FTUE */}
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

    </div>
  );
}