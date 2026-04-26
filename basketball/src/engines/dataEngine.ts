/**
 * basketball/src/engines/dataEngine.ts
 * Points the shared engine at basketball data files.
 */
import { configure } from "@shared/engines/dataEngine";

// Vite base is "/basketball/" so public/ files are served at /basketball/data/.
configure({
  players: "/basketball/data/players.json",
  logsFallback: "/basketball/data/game-logs.json",
});

export * from "@shared/engines/dataEngine";
