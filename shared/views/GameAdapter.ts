/**
 * shared/views/GameAdapter.ts
 *
 * The adapter prop consumed by shared/views/GameView.tsx. Each sport's
 * wrapper builds a GameAdapter literal bundling the existing sportAdapter
 * singleton + sport-specific React components + sport-specific config.
 *
 * Shared GameView contains zero `if (sportKey === ...)` branches; all
 * variation flows through this adapter, sportAdapter, optional component
 * slots, or shared/featureFlags.ts.
 */

import type { ComponentType } from "react";
import type { SportAdapter as SharedSportAdapter } from "@shared/adapters/SportAdapter";
import type { PlayerCard } from "@shared/types";
import type { RosterGridCardProps } from "@shared/components/RosterGrid";
import type { FTUETextConfig } from "@shared/components/CoachLayer";
import type { CardRenderer } from "@shared/components/H2HRevealScreen";
import type {
  WinTierKey,
  WinTierMap,
  StreakTier,
} from "@shared/utils/payoutLogic";
import type { WinTierDisplay, LegendData } from "@shared/components/GameBar";
import type { TierThreshold as GaugeTierThreshold } from "@shared/components/TierGauge";
import type { DailyBonusPlayer } from "@shared/utils/dailyBonus";

export interface GameAdapter {
  // ── Identity ───────────────────────────────────────────────────────
  sportKey: "basketball" | "baseball" | "football";
  sportAdapter: SharedSportAdapter;

  // ── Persistence + scope (explicit seams to prevent cross-sport state bleed) ──
  /** Prefix for sport-scoped localStorage keys.
   *  Phase 2 ships with "" (current behavior preserved). A follow-up PR
   *  sets per-sport values + adds migration logic. Field exists now so
   *  call sites never hardcode keys. */
  localStorageNamespace: string;
  /** Routed to /api/leaderboard sport param. Already implemented at the
   *  API layer in PR #11; this adapter removes hardcoded sport literals. */
  leaderboardScope: "basketball" | "baseball" | "football";
  /** Competition slug (e.g. "world_cup") for sports with multi-competition
   *  support. Used by both /api/bonus-pool and /api/leaderboard to scope
   *  KV keys per competition (so EPL hands don't mix with World Cup hands).
   *  Sports with one competition (basketball/NBA, baseball/MLB) omit this. */
  competition?: string;
  /** Optional Vite base path ("/basketball/", "/baseball/") for any
   *  sport-specific internal navigation. */
  routeBasePath?: string;

  // ── Tier system (real data divergence) ─────────────────────────────
  gaugeThresholds: GaugeTierThreshold[];
  tierFromSalary: (salary: number) => string;

  // ── Win-tier math (per-sport, passed in via adapter so shared reveal
  //    callbacks can use them without sport branches) ─────────────────
  /** Maps a final FP total to a tier key. Basketball uses BASKETBALL_WIN_TIERS;
   *  baseball will plug in equivalents in Task 6. */
  calculateWinTier: (totalFp: number) => WinTierKey;
  /** Calculates the payout, with streak bonus folded in. */
  calculatePayoutWithStreak: (
    tier: WinTierKey,
    bet: number,
    streak: number,
  ) => number;
  /** Win-tier table — used by the celebration banner for tier multipliers. */
  winTiersMap: WinTierMap;
  /** Streak multiplier function. Reads the sport's per-sport STREAK_TIERS
   *  internally — caller passes streak count only. */
  getStreakMultiplier: (streak: number) => number;
  /** The sport's streak schedule (e.g., 3-win/5-win/10-win tiers with their
   *  multipliers). Used by shared GameBar (display labels) and shared
   *  CommentaryInput (streak_proximity nudges) so the UI/copy match the
   *  active sport's schedule. */
  streakTiers: StreakTier[];

  // ── GameBar visual config (per-sport thresholds, colors, legend copy) ──
  /** Win-tier visual rows (label, minFp, color, glow) for the tier bar. */
  gameBarWinTiers: WinTierDisplay[];
  /** Legend modal data (payout rows, badges, scoring rules). */
  gameBarLegend: LegendData;

  // ── Roster lifecycle (non-FTUE) ────────────────────────────────────
  dealInitialRoster: () => Promise<{ roster: PlayerCard[] }>;
  redrawRoster: (args: { currentCards: PlayerCard[]; lockedCardIds: Set<string> })
                => Promise<{ roster: PlayerCard[] }>;
  resolveRoster: (args: { finalCards: PlayerCard[] })
                => Promise<{ roster: PlayerCard[]; mvpCardId?: string }>;

  // ── Roster lifecycle (FTUE) — DEPRECATED + OPTIONAL ────────────────
  // FTUE removed (feat/kill-ftue-real-game): shared GameView no longer calls
  // these. Kept as OPTIONAL members so baseball/football still satisfy the
  // contract until the cross-sport pass retires them; basketball no longer
  // provides them.
  ftueDealRoster?: () => Promise<{ roster: PlayerCard[] }>;
  ftueRedrawRoster?: (args: { currentCards: PlayerCard[]; lockedCardIds: Set<string> })
                    => Promise<{ roster: PlayerCard[] }>;
  ftueResolveRoster?: (args: { finalCards: PlayerCard[] })
                    => Promise<{ roster: PlayerCard[]; mvpCardId?: string }>;

  // ── Sport-specific data lookups ────────────────────────────────────
  /** Today's bonus players (used by the CollectScreen + GameBar legend). */
  getTodaysStars: () => DailyBonusPlayer[];
  /** Sum of personal-peak FP across the resolved roster (basketball ceiling
   *  display in RESULTS). Optional — sports without a peak corpus omit. */
  computeRosterCeiling?: (roster: PlayerCard[]) => number;

  // ── Components — sport-specific render slots ───────────────────────
  /** The roster card component (basketball: AthleteCard, baseball: BaseballCard).
   *  Receives the shared RosterGridCardProps shape. */
  CardComponent: ComponentType<RosterGridCardProps>;
  /** Number of grid columns for RosterGrid (basketball=3, worldcup=2,
   *  baseball=6 with custom .bb-dice5 layout — see rosterGridLayoutCss). */
  rosterGridColumns: number;
  /** Optional sport-specific CSS rules + class wrapping the RosterGrid.
   *  Baseball uses this to render its 2-row 5-card "dice 5" layout.
   *  Basketball/worldcup omit. Shape:
   *    { className: "bb-dice5", css: "..."}                        */
  rosterGridLayout?: { className: string; css: string };
  /** Build-phase v1 (basketball). Max hold/reroll rounds in one hand. The shared
   *  GameView reads `adapter.maxRounds ?? 1`; absent ⇒ 1 ⇒ single-shot (today's
   *  flow), so baseball/football are unchanged until their own cross-sport port. */
  maxRounds?: number;
  /** Build-phase v1 (basketball). When false, the bet collapses to a single
   *  entryFee — the multiplier is pinned to 1 and its selector hidden, but the
   *  betMultiplier state/setter stay intact (re-wireable). GameView reads
   *  `adapter.multiplierEnabled ?? true`; absent ⇒ true ⇒ multiplier live (today's
   *  flow). The `?? true` / `?? 1` defaults live at the shared read site so a
   *  sport that doesn't set these fields keeps current behavior. */
  multiplierEnabled?: boolean;
  /** Build-phase v1 (basketball). When false, win streaks are PAUSED: the streak
   *  fire-row display is hidden, the streak multiplier is neutralized (no effect on
   *  the cosmetic payout / celebration), and no streak-driven surfacing fires. The
   *  streak STATE, counting logic (incrementStreak/resetStreak), and the
   *  streak_at_play column stay intact and re-wireable for the economy layer —
   *  same hide-don't-delete pattern as the dormant multiplier. GameView reads
   *  `adapter.streaksEnabled ?? true`; absent ⇒ true ⇒ streaks live (today's flow),
   *  so baseball/football are unchanged. */
  streaksEnabled?: boolean;
  /** Optional per-slot label badge (e.g. football's FLEX slot showing
   *  "ANY OUTFIELD" with a tooltip explaining the rule). Keyed by slot
   *  index. Basketball/baseball omit. */
  slotLabels?: Record<number, { label: string; tooltip?: string }>;
  /** Resets all card overlay state (per-sport AthleteCard module-local
   *  state). Called when starting a new hand. */
  resetAllOverlays: () => void;

  // ── FTUE ───────────────────────────────────────────────────────────
  /** Sport-specific coach text + bubble config. REQUIRED — every sport
   *  must be explicit about its FTUE copy (no silent fallback to
   *  basketball). Basketball imports BASKETBALL_FTUE_CONFIG from
   *  @shared/components/CoachLayer; baseball builds its own literal. */
  ftueTextConfig: FTUETextConfig;

  // ── Optional sport-specific overlays ───────────────────────────────
  /** Post-hand recap sheet — baseball-only today; basketball passes
   *  undefined and the shared conditional render skips. */
  PostHandSheet?: ComponentType<{
    totalFp: number;
    winTier: string;
    isBust: boolean;
    nearMissGap: number;
    nearMissNextTier: string | null;
    winPayout: number;
    currentUid: string;
    onPlayAgain: () => void;
    onViewLeaderboard: () => void;
  }>;

  // ── Audio ──────────────────────────────────────────────────────────
  audioBedSrc: string | null;

  // ── Slate v2 — optional in-game chip slot ──────────────────────────
  /** Optional sport-bound slate chip + overlay component. When provided
   *  (and only when provided), the shared GameView mounts it in the
   *  in-game header. Sport wrappers gate this slot by isSlateV2Enabled
   *  so flag-OFF callers pass undefined and no slate code mounts. */
  SlateChipComponent?: ComponentType<{}>;

  // ── H2H reveal renderers (phase 5a commit 3) ───────────────────────
  // Sport-specific card renderers consumed by H2HRecipientReveal — the
  // recipient flow's H2H arc + results overlay. Both are optional:
  // sports without H2H wired up leave them undefined and the shared
  // GameView's H2HRecipientReveal mount returns null. Basketball
  // populates these with AthleteCard-wrapping renderers.
  /** Renderer for the reveal arc (battlefield + strip cells). Reads
   *  options.visibleFp / shakeType / glowActive / revealed to drive
   *  per-card state. Strip cells receive no visibleFp; the active
   *  battlefield card receives the rollup sentinel. */
  h2hArcRenderer?: CardRenderer;
  /** Renderer for the results overlay. Reads options.flipped to drive
   *  the back-face render. Cards mount in resolved end-state (no
   *  visibleFp; staticEndState=true). */
  h2hOverlayRenderer?: CardRenderer;
}
