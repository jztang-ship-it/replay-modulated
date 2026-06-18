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

import { useState, useRef, useCallback } from "react";
import type { WinTierKey } from "@shared/utils/payoutLogic";
import type { PlayerCard } from "@shared/types";
import { getPlayerUid, getNickname, getSessionId } from "@shared/utils/playerIdentity";
import { supabase } from "@shared/lib/supabase";
import { addBigWinMessage } from "@shared/inbox/inbox";
import { useAchievements } from "@shared/hooks/useAchievements";
import { serializeResolvedRoster } from "@shared/utils/resolvedRosterSerialization";
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
  // Build-phase round counter. Rounds used in the current hand; reset to 0 at
  // deal. The round-machine controller drives loop-vs-lock off this; with
  // adapter.maxRounds defaulting to 1, a hand locks on round 1 (single-shot).
  const [roundsUsed, setRoundsUsed] = useState(0);
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
      const resp = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          action: "submit",
          sport: adapter.leaderboardScope,
          competition: adapter.competition,  // football: "world_cup"; others: undefined
          metric,
          value,
          uid,
          nickname,
          session_id: getSessionId(),
          ...extra,
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

  // Latest handId persisted via logHandToDb. Exposed so downstream surfaces
  // (specifically ChallengeSharePrompt) can reuse the same audit ID when
  // creating a challenge from this hand — without this, the prompt would
  // mint a fresh UUID and shared_challenges.hand_id would have no matching
  // hand_log row, breaking the H2H reveal arc's sender-hand endpoint
  // premise. See docs/h2h-reveal-arc-design.md "handId threading fix".
  const currentHandIdRef = useRef<string | null>(null);

  const logHandToDb = useCallback(async (
    rosterArg: any[],
    totalFp: number,
    tier: string,
    payout: number,
    streakAtPlay: number,
    handId?: string,
  ) => {
    // Write to the shared ref first so the ChallengeSharePrompt mount —
    // which reads from this ref at RESULTS — sees the correct ID even if
    // the network insert below races / fails. The audit-DB write being
    // best-effort doesn't change the contract: the handId associated with
    // *this* hand is whatever _useReveal generated and passed in.
    if (handId) currentHandIdRef.current = handId;
    const season = String((rosterArg[0] as any)?.season ?? "");
    try {
      const uid = getPlayerUid();
      if (!uid || uid.startsWith("u_")) return; // Only log with real Supabase UID
      const rosterIds = rosterArg
        .map((c: any) => String(c.basePlayerId ?? ""))
        .filter(Boolean);
      const { data: { session } } = await supabase.auth.getSession();
      const verified = !!session?.access_token;
      // final_roster: GeneratedCard-shaped per-card resolved data, populated
      // on every hand from 2026-05-26 forward. Consumed by the H2H reveal
      // arc data path (GET /api/challenge/{id}/sender-hand). Pre-cutover
      // rows are NULL → endpoint returns sender_resolved:false with
      // reason:"legacy_pre_h2h_capture". Field picker is explicit so future
      // GeneratedCard additions don't accidentally bloat the JSONB without
      // an intentional decision. See docs/h2h-reveal-arc-design.md
      // "Data model gap — RESOLVED for phase 1" for the locked schema.
      const finalRoster = serializeResolvedRoster(rosterArg);
      await supabase.from("hand_log").insert({
        player_id: uid,
        hand_id: handId ?? null,
        roster_ids: rosterIds,
        total_fp: totalFp,
        tier,
        payout,
        streak_at_play: streakAtPlay,
        verified,
        sport: adapter.sportKey,
        season,
        final_roster: finalRoster,
      });
      // Trigger inbox big-win recap for elite tiers
      if (tier === "MVP+" || tier === "LEGEND") {
        const hand_id = `hand-${Date.now()}`;
        await addBigWinMessage(uid, { tier, fp: totalFp, hand_id });
      }
    } catch { /* silent — audit trail is best-effort */ }

    // Fire-and-forget: evaluate + persist any newly unlocked achievements.
    // Runs after the hand_log insert but never blocks or throws.
    const isWin = !["BUST", "ROOKIE"].includes(tier);
    const newStreak = isWin ? streakAtPlay + 1 : 0;
    void evaluateAchievementsAndSave({
      sport: adapter.sportKey,
      season,
      handId: handId ?? "",
      totalFp,
      fpTier: tier,
      isWin,
      rosterIds: rosterArg.map((c: any) => String(c.basePlayerId ?? "")).filter(Boolean),
      cards: rosterArg.map((c: any) => ({
        fp: Number(c.actualFp ?? 0),
        stats: (c.statLine ?? {}) as Record<string, unknown>,
        position: String(c.position ?? ""),
        name: String(c.name ?? ""),
        team: String(c.team ?? ""),
        tier: String(c.tier ?? "WHITE"),
        season: String(c.season ?? ""),
        photoCode: c.photoCode ?? undefined,
      })),
      streak: newStreak,
      handsPlayed: handCount,
    });
  }, [adapter, evaluateAchievementsAndSave, handCount]);

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
    currentHandIdRef,

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

    // Achievement state (fire-and-forget evaluation happens inside logHandToDb)
    unlockedAchievementIds,
    newlyUnlockedAchievements,
    clearNewlyUnlockedAchievements,
  };
}

// Re-exported so per-sport wrappers can build their adapter literals
// without needing to know the namespace prefix scheme.
export { nsKey };
