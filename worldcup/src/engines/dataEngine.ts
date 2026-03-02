/**
 * Configures the shared dataEngine to point at worldcup data files,
 * then re-exports everything.
 */
import { configure } from "@shared/engines/dataEngine";

configure({
  players: "/data/players.json",
  logsFallback: "/data/game-logs.json",
});

export * from "@shared/engines/dataEngine";
