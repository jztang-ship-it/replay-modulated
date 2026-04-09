/**
 * baseball/src/engines/dataEngine.ts
 * Points the shared engine at baseball data files.
 */
import { configure } from "@shared/engines/dataEngine";

// Vite base is "/baseball/" so public/ files are served at /baseball/data/.
configure({
  players: "/baseball/data/players.json",
  logsFallback: "/baseball/data/game-logs.json",
});

export * from "@shared/engines/dataEngine";
