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

export interface GameAdapter {
  // Identity
  sportKey: "basketball" | "baseball";
  sportAdapter: SharedSportAdapter;

  // Persistence + scope (explicit seams to prevent cross-sport state bleed)
  /** Prefix for sport-scoped localStorage keys.
   *  Phase 2 ships with "" (current behavior preserved). A follow-up PR
   *  sets per-sport values + adds migration logic. Field exists now so
   *  call sites never hardcode keys. */
  localStorageNamespace: string;
  /** Routed to /api/leaderboard sport param. Already implemented at the
   *  API layer in PR #11; this adapter removes hardcoded sport literals. */
  leaderboardScope: "basketball" | "baseball" | "worldcup";
  /** Optional Vite base path ("/basketball/", "/baseball/") for any
   *  sport-specific internal navigation. */
  routeBasePath?: string;

  // Tier system (real data divergence)
  gaugeThresholds: { tier: string; minFP: number }[];
  tierFromSalary: (salary: number) => string;

  // Roster lifecycle
  dealInitialRoster: () => Promise<{ roster: PlayerCard[] }>;
  redrawRoster: (args: { currentCards: PlayerCard[]; lockedCardIds: Set<string> })
                => Promise<{ roster: PlayerCard[] }>;
  resolveRoster: (args: { finalCards: PlayerCard[] })
                => Promise<{ roster: PlayerCard[]; mvpCardId?: string }>;

  // Components — types loose for now; tighten in Task 5
  CardComponent: ComponentType<any>;
  resetAllOverlays: () => void;

  // FTUE — types loose for now; tighten in Task 5
  ftueRoster: PlayerCard[];
  ftueDrawnRoster: PlayerCard[];
  ftueTextConfig: any;

  // Optional sport-specific overlays
  PostHandSheet?: ComponentType<any>;

  // Audio
  audioBedSrc: string | null;
}
