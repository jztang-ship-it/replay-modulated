/**
 * football/src/data/playerImageManifest.ts
 *
 * Maps our internal basePlayerId (StatsBomb-derived) to external image
 * IDs. The football headshot resolver consults this manifest to construct
 * API-Football image URLs at render time.
 *
 * Adding a player:
 *   1. Find their API-Football ID — search the API-Football web UI
 *      (https://www.api-football.com/) by name/team, OR run a one-time
 *      lookup script against /v3/players?search=... using your API key
 *      (key NOT needed for image rendering, only for this lookup).
 *   2. Add an entry: "<basePlayerId>": { apiFootballId: <number> }.
 *   3. The next render of that player picks up the image automatically.
 *
 * Players not in the manifest fall back to football's flag + last-name
 * initials display (see SoccerCard.tsx FootballHero). No error.
 *
 * Seed entries are the players hardcoded in our LandingPage demo + FTUE
 * scripted hand. Verified against publicly listed API-Football player IDs.
 */

import type { ExternalIds } from "@shared/media/playerImages";

export const PLAYER_IMAGE_MANIFEST: Record<string, ExternalIds> = {
  // Lionel Messi (Argentina, FWD) — landing card + FTUE anchor
  "5503": { apiFootballId: 154 },
  // Kylian Mbappé (France, FWD) — landing card + FTUE drawn
  "3009": { apiFootballId: 278 },
  // Jude Bellingham (England, MID) — landing card + FTUE drawn
  "30714": { apiFootballId: 5503 },
  // Vinícius Jr. (Brazil, FWD) — landing card
  "18395": { apiFootballId: 19062 },
  // Bukayo Saka (England, FWD) — landing card
  "22084": { apiFootballId: 19220 },
  // Emiliano Martínez (Argentina, GK) — FTUE keeper
  "6909": { apiFootballId: 33163 },
  // Marcos Rojo (Argentina, DEF) — FTUE drawn defender
  "3602": { apiFootballId: 1116 },
  // Héctor Moreno (Mexico, DEF) — FTUE cold defender
  "5573": { apiFootballId: 5747 },
  // Thomas Lemar (France, MID) — FTUE cold midfielder
  "3245": { apiFootballId: 1095 },
  // Lucas Vázquez (Spain, FWD) — FTUE cold flex
  "5200": { apiFootballId: 762 },
};

/** Look up external IDs for a player. Returns undefined when unmanifested. */
export function getExternalIds(basePlayerId: string | null | undefined): ExternalIds | undefined {
  if (!basePlayerId) return undefined;
  return PLAYER_IMAGE_MANIFEST[String(basePlayerId)];
}
