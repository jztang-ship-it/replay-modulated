/**
 * shared/utils/leaderboardContext.ts
 *
 * Smart leaderboard awareness for post-reveal commentary.
 *
 * Called from GameView after a hand resolves and submitToLeaderboard("hand_best", totalFp)
 * has fired. Performs a silent background fetch of the daily hand_best board and evaluates
 * four triggers in priority order. Returns a single string to use as the secondary
 * commentary line for THIS hand only, or null if nothing fires.
 *
 * The fetch is fire-and-forget — failures return null and commentary falls back to
 * its normal secondary line.
 *
 * Triggers (priority 2 → 3 → 4 → 1):
 *   T2  You got on the board       (MVP+ tier, not previously on today)
 *   T3  You've been passed         (was on board, now ranked worse / dropped off)
 *   T4  Close to the board         (winning hand, gap ≤ smart threshold)
 *   T1  New-user intro             (hands 1–3, never been on board)
 *
 * Bust hands only qualify for T1. Triggers 2/3/4 require a non-bust result.
 * Each trigger fires at most once per its declared gate.
 */

type LbEntry = { uid: string; nickname: string; score: number };

const API_URL = "/api/leaderboard?metric=hand_best&scope=daily&limit=25";

async function fetchBoard(): Promise<LbEntry[] | null> {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.entries) ? (data.entries as LbEntry[]) : null;
  } catch {
    return null;
  }
}

/**
 * Smart "close to the board" threshold.
 *  - <5 entries  → 15 FP (board is sparse, anything reasonable is "close")
 *  - <20 entries → 10 FP
 *  - else        → clamp((entries[19].score - entries[24].score) * 0.8, [3, 15])
 */
function smartThreshold(entries: LbEntry[]): number {
  if (entries.length < 5) return 15;
  if (entries.length < 20) return 10;
  const span = (entries[19].score - entries[24].score) * 0.8;
  return Math.max(3, Math.min(15, span));
}

/**
 * Tier helper — Trigger 2 fires for tiers that qualify for "on the board."
 * Default: MVP+ (basketball). Override via args.onBoardTiers for other sports.
 */
const DEFAULT_ON_BOARD_TIERS = new Set(["MVP", "LEGEND"]);

export interface LeaderboardContextArgs {
  myFp: number;
  winTier: string;        // BUST | ROOKIE | STARTER | ALL_STAR | MVP | LEGEND
  isBust: boolean;
  myUid: string;          // from getPlayerUid()
  /** Tiers that qualify for "on the board" (default: MVP, LEGEND). */
  onBoardTiers?: string[];
  /** MVP threshold FP for intro message (default: 215). */
  mvpThresholdFp?: number;
}

/**
 * Evaluate triggers and return the secondary commentary line, or null.
 * Side effects: updates localStorage / sessionStorage gate keys on fire.
 *
 * Gate keys (per spec):
 *   localStorage.rm_whisper_intro_count   — T1 fire count, max 3
 *   localStorage.rm_ever_on_board         — set once user has ever been on board
 *   localStorage.rm_on_board_today        — set when T2 fires today
 *   localStorage.rm_last_rank             — last known rank (for T3 detection)
 *   sessionStorage.lb_passed_shown        — T3 fired this session
 *   sessionStorage.lb_close_shown         — T4 fired this session
 */
export async function fetchLeaderboardContext(
  args: LeaderboardContextArgs
): Promise<string | null> {
  const { myFp, winTier, isBust, myUid, onBoardTiers, mvpThresholdFp } = args;
  const boardTiers = onBoardTiers ? new Set(onBoardTiers) : DEFAULT_ON_BOARD_TIERS;
  const mvpFp = mvpThresholdFp ?? 215;

  const introCount = parseInt(localStorage.getItem("rm_whisper_intro_count") || "0", 10);
  const everOnBoard = localStorage.getItem("rm_ever_on_board") === "1";
  const introEligible = !everOnBoard && introCount < 3;

  const fireIntro = (): string => {
    const next = introCount + 1;
    localStorage.setItem("rm_whisper_intro_count", String(next));
    return next === 1
      ? `Top players hit MVP tier (${mvpFp}+ FP) to get on the leaderboard`
      : `${mvpFp} FP gets you on the board — you're learning the range`;
  };

  const entries = await fetchBoard();

  // Network failed → only T1 (intro) is still possible since it doesn't need the board.
  if (!entries) {
    if (introEligible) return fireIntro();
    return null;
  }

  // Identify my rank on the daily board.
  // Prefer uid match (works even with duplicate scores). Fall back to score-only
  // if uid is missing for some reason.
  let myRank: number | null = null;
  if (myUid) {
    const idx = entries.findIndex(e => e.uid === myUid);
    if (idx >= 0) myRank = idx + 1;
  }
  if (myRank == null) {
    const idx = entries.findIndex(e => Math.abs(e.score - myFp) < 0.05);
    if (idx >= 0) myRank = idx + 1;
  }

  // ── Trigger 2: You got on the board ─────────────────────────────────────
  // Board-qualifying tier, not previously on the board today, and confirmed present.
  if (!isBust && boardTiers.has(winTier)) {
    const onBoardToday = localStorage.getItem("rm_on_board_today") === "1";
    if (!onBoardToday && myRank != null) {
      localStorage.setItem("rm_on_board_today", "1");
      localStorage.setItem("rm_ever_on_board", "1");
      localStorage.setItem("rm_last_rank", String(myRank));
      return `🏆 You're on the board — #${myRank} today`;
    }
  }

  // ── Trigger 3: You've been passed ───────────────────────────────────────
  // Was on the board (rm_last_rank set), now ranked worse — or dropped off top 25.
  if (!isBust) {
    const prevRankStr = localStorage.getItem("rm_last_rank");
    const passedShown = sessionStorage.getItem("lb_passed_shown") === "1";
    if (prevRankStr && !passedShown) {
      const prevRank = parseInt(prevRankStr, 10);
      // If still on the board, compare ranks. If off, treat as "worse than 25".
      const newRank = myRank ?? entries.length + 1;
      if (newRank > prevRank) {
        sessionStorage.setItem("lb_passed_shown", "1");
        // Update tracker to current state so we don't double-fire next hand.
        if (myRank != null) localStorage.setItem("rm_last_rank", String(myRank));
        return `📉 Someone passed you — you're #${newRank} now. Answer back.`;
      }
      // Not passed — still keep the rank fresh if user climbed.
      if (myRank != null) localStorage.setItem("rm_last_rank", String(myRank));
    }
  }

  // ── Trigger 4: Close to the board ───────────────────────────────────────
  // Winning hand, not on the board today, gap to last entry within smart threshold.
  if (!isBust) {
    const onBoardToday = localStorage.getItem("rm_on_board_today") === "1";
    const closeShown = sessionStorage.getItem("lb_close_shown") === "1";
    if (!onBoardToday && !closeShown && entries.length > 0) {
      const lastEntryScore = entries[entries.length - 1].score;
      const gap = lastEntryScore - myFp;
      if (gap > 0) {
        const threshold = smartThreshold(entries);
        if (gap <= threshold) {
          sessionStorage.setItem("lb_close_shown", "1");
          return `⚡ ${gap.toFixed(1)} FP from the leaderboard. One hand away.`;
        }
      }
    }
  }

  // ── Trigger 1: New-user intro (hands 1–3) ───────────────────────────────
  // Lowest priority — only if the user has never been on the board.
  if (introEligible) return fireIntro();

  return null;
}
