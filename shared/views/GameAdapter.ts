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
import type {
  WinTierKey,
  WinTierMap,
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
  /** Streak multiplier function (1.0 → 1.3 → 1.7 → 2.5). */
  getStreakMultiplier: (streak: number) => number;

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

  // ── Roster lifecycle (FTUE) — sport-specific scripted hands ────────
  ftueDealRoster: () => Promise<{ roster: PlayerCard[] }>;
  ftueRedrawRoster: (args: { currentCards: PlayerCard[]; lockedCardIds: Set<string> })
                    => Promise<{ roster: PlayerCard[] }>;
  ftueResolveRoster: (args: { finalCards: PlayerCard[] })
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
}
