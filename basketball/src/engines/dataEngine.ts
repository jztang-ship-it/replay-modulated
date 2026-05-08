/**
 * basketball/src/engines/dataEngine.ts
 *
 * Configures the shared engine in per-season mode. The active season is
 * pinned at game-entry time by DailySeasonReelGate (it picks today's
 * season and calls setActiveSeason). Vite base is "/basketball/" so
 * public/ files are served at /basketball/data/seasons/{key}/.
 */
import { configurePerSeason } from "@shared/engines/dataEngine";

configurePerSeason({
  seasonsBaseUrl: "/basketball/data/seasons",
});

export * from "@shared/engines/dataEngine";
