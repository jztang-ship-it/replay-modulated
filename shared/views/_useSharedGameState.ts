/**
 * shared/views/_useSharedGameState.ts
 *
 * Phase 2 sub-PR 03 — owns the GameView state hooks + leaderboard helpers
 * that are common to every sport. Per-sport GameView wrappers call this
 * hook with a (partial) GameAdapter and destructure the return value into
 * the same names previously held by local hooks.
 *
 * What lives here:
 *   - Core game state (gameState, roster, betMultiplier, balance, …)
 *   - Hand outcome state (winTier, winPayout, streak, handCount, …)
 *   - Reveal-adjacent state (revealIndex, revealedSalary, lastRevealedCardId,
 *     springFp, springSettled — the *state*; the orchestrator/callbacks
 *     stay in the per-sport file until Task 4)
 *   - Commentary-chip channel state (ftueCommentaryOverride — legacy name)
 *   - Leaderboard helpers (submitToLeaderboard, checkLeaderboardRank,
 *     logHandToDb) bound to adapter.leaderboardScope
 *
 * What stays per-sport (deferred to later tasks):
 *   - UI/modal state (showProfile, showLeaderboard, bellOpen, …)        Task 5
 *   - Reveal orchestration callbacks + spring runner                    Task 4
 *   - Sport-specific imports (sportAdapter, calculateWinTier, …)
 *
 * localStorage key policy: sport-private state goes through
 * nsKey(adapter, ...) which prepends adapter.localStorageNamespace + "_"
 * if it is non-empty. Cross-sport / device-global flags use raw keys and
 * are documented inline at each call site (e.g. rm_on_board_today, which
 * intentionally lives outside the per-sport namespace because the
 * leaderboard board state is global to the device, not per-sport).
 *
 * Phase 2 originally shipped with localStorageNamespace = "" for both
 * sports, which leaked basketball's streak / personal-bests into a
 * fresh baseball play (the user's "extra win already existing" bug).
 * fix/baseball-stale-win flipped baseball to "baseball" and kept
 * basketball at "" so existing basketball users keep all their state.
 * Per-key policy:
 *   - replaymod_streak  → nsKey (sport-scoped)
 *   - rm_best_hand      → nsKey (sport-scoped, applied at call site in _useReveal.ts + ProfileScreen.tsx + LeaderboardScreen.tsx)
 *   - rm_best_tier      → nsKey (sport-scoped, applied at call site)
 *   - replaymod_balance → raw  (one wallet across sports)
 *   - replaymod_hand_count → raw  (analytics-grade total; read by AuthProvider too)
 *   - rm_on_board_today → raw  (device-global trophy flag)
 * See docs/storage-keys-audit.md for the full enumeration.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { WinTierKey } from "@shared/utils/payoutLogic";
import type { PlayerCard } from "@shared/types";
import { getPlayerUid, getNickname, getSessionId } from "@shared/utils/playerIdentity";
import { supabase } from "@shared/lib/supabase";
import { useAchievements } from "@shared/hooks/useAchievements";

import type { GameAdapter } from "./GameAdapter";

export type GameState =
  | "IDLE" | "DEALING" | "HOLD" | "DRAWING"
  | "REVEALING" | "RESULTS" | "WIN_CELEBRATION";

const STARTING_BALANCE = 5000;
const MIN_BALANCE_FLOOR = 500;

/** The fields the hook actually reads off the adapter. Keeping the
 *  parameter narrowed to a Pick<> means call sites can pass a partial
 *  literal during the multi-PR lift instead of constructing dummy
 *  CardComponent values. */
type SharedGameStateAdapter = Pick<
  GameAdapter,
  "sportKey" | "localStorageNamespace" | "leaderboardScope" | "competition"
>;

function nsKey(adapter: SharedGameStateAdapter, key: string): string {
  return adapter.localStorageNamespace
    ? `${adapter.localStorageNamespace}_${key}`
    : key;
}

// Balance is intentionally cross-sport — it represents the player's wallet,
// not a per-sport stat. Using nsKey here would orphan basketball balances
// when baseball flips its namespace. Raw key keeps the wallet shared.
function loadBalance(_adapter: SharedGameStateAdapter): number {
  try {
    const v = localStorage.getItem("replaymod_balance");
    const n = v ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= MIN_BALANCE_FLOOR) return n;
    return STARTING_BALANCE;
  } catch { return STARTING_BALANCE; }
}

function saveBalance(_adapter: SharedGameStateAdapter, v: number) {
  try { localStorage.setItem("replaymod_balance", String(v)); } catch { }
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

export interface UseSharedGameStateOptions {
  /** Roster size for placeholder generation. Defaults to 6 (basketball) but
   *  baseball uses a different number, so make it explicit. */
  rosterSize: number;
}

export function useSharedGameState(
  adapter: SharedGameStateAdapter,
  options: UseSharedGameStateOptions,
) {
  const { rosterSize } = options;

  // ── Achievement tracking ───────────────────────────────────────────
  const { unlockedIds: unlockedAchievementIds, newlyUnlocked: newlyUnlockedAchievements, evaluateAndSave: evaluateAchievementsAndSave, clearNewlyUnlocked: clearNewlyUnlockedAchievements } = useAchievements();

  // ── Core flow ──────────────────────────────────────────────────────
  const [gameState, setGameState] = useState<GameState>("IDLE");
  // Build-phase lineup counter. The DEAL is lineup/round 1, so this resets to 1
  // at deal (not 0). The round-machine controller locks when roundsUsed+1 >=
  // maxRounds: basketball (maxRounds 3) locks after 2 rerolls (3 lineups);
  // baseball/football (maxRounds defaulting to 1) lock on the first reroll =
  // today's single-shot.
  const [roundsUsed, setRoundsUsed] = useState(1);
  const [dataReady, setDataReady] = useState(false);
  const [noTransition, setNoTransition] = useState(false);

  // ── Roster + selection ─────────────────────────────────────────────
  const [roster, setRoster] = useState<PlayerCard[]>(() => createPlaceholders(rosterSize));
  const [lockedCardIds, setLockedCardIds] = useState<Set<string>>(new Set());
  const [statsFlippedIds, setStatsFlippedIds] = useState<Set<string>>(new Set());
  const [mvpId, setMvpId] = useState<string | undefined>();
  const rosterRef = useRef<PlayerCard[]>([]);

  // ── Bet + balance ──────────────────────────────────────────────────
  const [betMultiplier, setBetMultiplier] = useState(1);
  const [balance, setBalance] = useState<number>(() => loadBalance(adapter));
  const [isBalanceAnimating, setIsBalanceAnimating] = useState(false);

  // ── Outcome ────────────────────────────────────────────────────────
  const [winTier, setWinTier] = useState<WinTierKey | null>(null);
  const [winPayout, setWinPayout] = useState(0);
  const [streak, setStreak] = useState<number>(() =>
    parseInt(localStorage.getItem(nsKey(adapter, "replaymod_streak")) ?? "0", 10),
  );
  // Hand count is intentionally cross-sport (raw key, no nsKey). It's
  // analytics-grade — total hands ever played on this device — and is read
  // from non-GameView call sites that don't carry a sport adapter
  // (AuthProvider, useGameAnalytics, ProfileScreen). Sport-scoping it would
  // desync those reads.
  const [handCount, setHandCount] = useState<number>(() =>
    parseInt(localStorage.getItem("replaymod_hand_count") ?? "1", 10),
  );

  // ── Reveal + tier flip (state only — orchestrator stays per-sport) ──
  const [revealIndex, setRevealIndex] = useState(0);
  const [revealedSalary, setRevealedSalary] = useState(0);
  const [lastRevealedCardId, setLastRevealedCardId] = useState<string | null>(null);
  const [legendaryCardName, setLegendaryCardName] = useState<string | undefined>();
  const [celebrationHeld, setCelebrationHeld] = useState(false);
  const [glowState, setGlowState] = useState<{ cardId: string | null; tier: string; durationMs: number }>({
    cardId: null, tier: "WHITE", durationMs: 300,
  });
  const [tierFlipKey, setTierFlipKey] = useState(0);
  const [displayTier, setDisplayTier] = useState("BUST");
  const [tierResultPhase, setTierResultPhase] = useState<1 | 2>(1);
  const [nearMissTeasing, setNearMissTeasing] = useState(false);

  // ── Spring oscillation (state only — runSpring stays per-sport) ────
  const [springFp, setSpringFp] = useState<number | null>(null);
  const [springSettled, setSpringSettled] = useState(false);

  // Commentary-chip channel (NOT FTUE — survived the FTUE kill). Drives the
  // sticky Chad / challenge commentary pill rendered by TierGauge. The
  // `ftue*` name is legacy; retained to avoid churn across consumers.
  const [ftueCommentaryOverride, setFtueCommentaryOverride] = useState<{
    parts: React.ReactNode[]; sticky?: boolean;
  } | null>(null);

  // ── Bound balance persistence helpers ──────────────────────────────
  const persistBalance = useCallback((v: number) => saveBalance(adapter, v), [adapter]);

  // ── Leaderboard helpers — adapter.leaderboardScope replaces hardcoded sport literals ──
  const submitToLeaderboard = useCallback(async (
    metric: string,
    value: number,
    extra?: Record<string, unknown>,
  ) => {
    // Leaderboard writes are intentionally narrow: the API accepts only a
    // server-verified hand_best result. Do not fall back to anonymous or
    // client-identified submissions.
    const handId = typeof extra?.handId === "string" ? extra.handId : "";
    if (metric !== "hand_best" || !handId || value <= 0) return;
    const nickname = getNickname();
    let accessToken = "";
    try {
      const { data: { session } } = await supabase.auth.getSession();
      accessToken = session?.access_token ?? "";
    } catch {
      return;
    }
    if (!accessToken) return;
    try {
      const resp = await fetch("/api/leaderboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: "submit",
          sport: adapter.leaderboardScope,
          competition: adapter.competition,
          metric: "hand_best",
          nickname,
          handId,
        }),
      });
      if (!resp.ok) console.warn("[leaderboard] submit failed", metric, resp.status);
    } catch (e) {
      console.warn("[leaderboard] submit network error", metric, e);
    }
  }, [adapter]);

  /** Check if player is in top 10 of either daily leaderboard → set
   *  rm_on_board_today for trophy glow. */
  const checkLeaderboardRank = useCallback(async () => {
    const uid = getPlayerUid();
    const sessId = getSessionId();
    if (!uid) return;
    try {
      const sport = adapter.leaderboardScope;
      const compQs = adapter.competition ? `&competition=${encodeURIComponent(adapter.competition)}` : "";
      const [best, session] = await Promise.all([
        fetch(`/api/leaderboard?sport=${sport}&metric=hand_best&scope=daily&limit=10${compQs}`).then(r => r.json()),
        fetch(`/api/leaderboard?sport=${sport}&metric=session_score&scope=daily&limit=10${compQs}`).then(r => r.json()),
      ]);
      const entries = [...(best.entries ?? []), ...(session.entries ?? [])];
      const onBoard = entries.some((e: any) => e.uid === uid || (sessId && e.session_id === sessId));
      // Raw key (no nsKey): rm_on_board_today is a *device-global* flag —
      // it tracks whether the player is currently on any leaderboard, not a
      // sport-specific score. Using nsKey here would create stale per-sport
      // copies that contradict each other.
      localStorage.setItem("rm_on_board_today", onBoard ? "1" : "0");
    } catch { } // Non-critical
  }, [adapter]);

  // ── Streak / hand-count persistence helpers ────────────────────────
  // These are exposed so reveal/celebration callbacks (Task 4 and beyond)
  // don't have to duplicate the nsKey wrapping. They keep state + storage
  // in lockstep so the namespace flip later doesn't desync them.
  /** Reads the persisted streak fresh from localStorage (avoids stale
   *  closure on the React state) and writes back the incremented value.
   *  Side effects stay outside the setStreak updater so React 18
   *  StrictMode dev double-invocation can't double-write or return an
   *  uncommitted value. Returns the new streak. */
  const incrementStreak = useCallback((): number => {
    let next = 1;
    try {
      next = parseInt(
        localStorage.getItem(nsKey(adapter, "replaymod_streak")) ?? "0",
        10,
      ) + 1;
      localStorage.setItem(nsKey(adapter, "replaymod_streak"), String(next));
    } catch { }
    setStreak(next);
    return next;
  }, [adapter]);

  const resetStreak = useCallback(() => {
    try { localStorage.setItem(nsKey(adapter, "replaymod_streak"), "0"); } catch { }
    setStreak(0);
  }, [adapter]);

  /** Reads the persisted hand count fresh from localStorage (avoids stale
   *  closure on the React state) and writes back the incremented value.
   *  Returns the new count. */
  const incrementHandCount = useCallback((): number => {
    let next = 1;
    try {
      // Raw key — see init comment above. Cross-sport hand-count is intentional.
      next = parseInt(
        localStorage.getItem("replaymod_hand_count") ?? "0",
        10,
      ) + 1;
      localStorage.setItem("replaymod_hand_count", String(next));
    } catch { }
    setHandCount(next);
    return next;
  }, []);

  // Latest handId submitted to the server resolve endpoint. Exposed so
  // downstream surfaces (specifically ChallengeSharePrompt) can reuse the
  // same verified audit ID when creating a challenge from this hand — without
  // this, the prompt would mint a fresh UUID and lose the H2H reveal linkage
  // premise. See docs/h2h-reveal-arc-design.md "handId threading fix".
  const currentHandIdRef = useRef<string | null>(null);
  const serverResultRef = useRef<any>(null);

  // Keep auth-verified state fresh outside the bounded hand path. This prevents
  // an unauthenticated client from entering the server resolve request while
  // avoiding an auth refresh inside the charge-gating callback. Seed once +
  // subscribe; clean up on unmount. Defensive: auth is never allowed to throw into the hand path
  // (mirrors AuthProvider; the test supabase mock returns a no-op subscription).
  const verifiedRef = useRef(false);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    try {
      supabase.auth.getSession()
        .then(({ data: { session } }) => { if (active) verifiedRef.current = !!session?.access_token; })
        .catch(() => { /* keep prior value */ });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        verifiedRef.current = !!session?.access_token;
      });
      unsubscribe = () => subscription.unsubscribe();
    } catch { /* auth never blanks the hand path */ }
    return () => { active = false; try { unsubscribe?.(); } catch { /* ignore */ } };
  }, []);

  // Compatibility seam for existing consumers. Never turn a client roster into a verified result.
  const logHandToDb = useCallback(async (..._args: any[]) => {
    if (!serverResultRef.current) throw new Error("Server settlement required");
  }, []);

  return {
    // Core flow
    gameState, setGameState,
    roundsUsed, setRoundsUsed,
    dataReady, setDataReady,
    noTransition, setNoTransition,

    // Roster + selection
    roster, setRoster,
    lockedCardIds, setLockedCardIds,
    statsFlippedIds, setStatsFlippedIds,
    mvpId, setMvpId,
    rosterRef,

    // Bet + balance
    betMultiplier, setBetMultiplier,
    balance, setBalance,
    isBalanceAnimating, setIsBalanceAnimating,
    persistBalance,

    // Outcome
    winTier, setWinTier,
    winPayout, setWinPayout,
    streak, setStreak,
    handCount, setHandCount,
    currentHandIdRef, serverResultRef,

    // Reveal state
    revealIndex, setRevealIndex,
    revealedSalary, setRevealedSalary,
    lastRevealedCardId, setLastRevealedCardId,
    legendaryCardName, setLegendaryCardName,
    celebrationHeld, setCelebrationHeld,
    glowState, setGlowState,
    tierFlipKey, setTierFlipKey,
    displayTier, setDisplayTier,
    tierResultPhase, setTierResultPhase,
    nearMissTeasing, setNearMissTeasing,

    // Spring state
    springFp, setSpringFp,
    springSettled, setSpringSettled,

    // FTUE flags
    ftueCommentaryOverride, setFtueCommentaryOverride,

    // Leaderboard helpers
    submitToLeaderboard,
    checkLeaderboardRank,
    logHandToDb,

    // Streak / hand-count helpers (writes go through nsKey)
    incrementStreak,
    resetStreak,
    incrementHandCount,

    // Achievement state is read-only on the client; unlocks are server-issued
    unlockedAchievementIds,
    newlyUnlockedAchievements,
    clearNewlyUnlockedAchievements,
  };
}

// Re-exported so per-sport wrappers can build their adapter literals
// without needing to know the namespace prefix scheme.
export { nsKey };
