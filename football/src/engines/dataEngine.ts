/**
 * Configures the shared dataEngine to point at football data files,
 * then re-exports everything.
 */
import { configure } from "@shared/engines/dataEngine";

// Vite base is "/football/" so public/ files are served at /football/data/.
// Root-relative paths (e.g. "/data/...") would resolve against the domain
// root and 404 (or fall through Vercel's catch-all rewrite to index.html,
// which is what manifested as "Failed to load data, check your connection"
// — the JSON parser hit "<!doctype html>"). Match basketball/baseball pattern.
configure({
  players: "/football/data/players.json",
  logsFallback: "/football/data/game-logs.json",
});

export * from "@shared/engines/dataEngine";
