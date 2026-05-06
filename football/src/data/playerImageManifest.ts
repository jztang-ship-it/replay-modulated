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
  // Kylian Mbappé Lottin (France)
  "3009": { apiFootballId: 278 },
  // Hugo Lloris (France)
  "3099": { apiFootballId: 159 },
  // Thomas Lemar (France)
  "3245": { apiFootballId: 1095 },
  // Jordan Pickford (England)
  "3468": { apiFootballId: 2932 },
  // Wayne Hennessey (Wales)
  "3488": { apiFootballId: 18836 },
  // Thibaut Courtois (Belgium)
  "3509": { apiFootballId: 730 },
  // Faustino Marcos Alberto Rojo (Argentina)
  "3602": { apiFootballId: 1116 },
  // Kasper Schmeichel (Denmark)
  "3815": { apiFootballId: 2728 },
  // Lucas Vázquez Iglesias (Spain)
  "5200": { apiFootballId: 762 },
  // Alireza Safar Beiranvand (Iran)
  "5227": { apiFootballId: 2682 },
  // Lionel Andrés Messi Cuccittini (Argentina)
  "5503": { apiFootballId: 154 },
  // Fabian Lukas Schär (Switzerland)
  "5537": { apiFootballId: 2806 },
  // Alisson Ramsés Becker (Brazil)
  "5547": { apiFootballId: 280 },
  // Manuel Obafemi Akanji (Switzerland)
  "5549": { apiFootballId: 5 },
  // Yann Sommer (Switzerland)
  "5550": { apiFootballId: 2802 },
  // Manuel Neuer (Germany)
  "5570": { apiFootballId: 497 },
  // Héctor Alfredo Moreno Herrera (Mexico)
  "5573": { apiFootballId: 5747 },
  // Filip Kostić (Serbia)
  "5591": { apiFootballId: 227954 },
  // Nikola Milenković (Serbia)
  "5603": { apiFootballId: 2817 },
  // Wojciech Szczęsny (Poland)
  "5669": { apiFootballId: 851 },
  // Mohammed Khalil Al Owais (Saudi Arabia)
  "5714": { apiFootballId: 44411 },
  // Nemanja Radonjić (Serbia)
  "5833": { apiFootballId: 1920 },
  // Andrija Živković (Serbia)
  "6318": { apiFootballId: 579 },
  // Milos Veljkovic (Serbia)
  "6321": { apiFootballId: 2821 },
  // Yassine Bounou (Morocco)
  "6785": { apiFootballId: 2701 },
  // Damián Emiliano Martínez (Argentina)
  "6909": { apiFootballId: 33163 },
  // Silvan Widmer (Switzerland)
  "7796": { apiFootballId: 48378 },
  // André Onana (Cameroon)
  "8064": { apiFootballId: 526 },
  // Andries Noppert (Netherlands)
  "8326": { apiFootballId: 31632 },
  // Milan Borjan (Canada)
  "15958": { apiFootballId: 336 },
  // Dominik Livaković (Croatia)
  "16531": { apiFootballId: 1305 },
  // Vinícius José Paixão de Oliveira Júnior (Brazil)
  "18395": { apiFootballId: 19062 },
  // Vanja Milinković Savić (Serbia)
  "20600": { apiFootballId: 31156 },
  // Bukayo Saka (England)
  "22084": { apiFootballId: 19220 },
  // Jude Bellingham (England)
  "30714": { apiFootballId: 5503 },
  // Diogo Meireles Costa (Portugal)
  "32975": { apiFootballId: 142706 },
  // Aymen Dahmen (Tunisia)
  "105943": { apiFootballId: 49424 },
  // Meshaal Aissa Barsham (Qatar)
  "124510": { apiFootballId: 42021 },
};

/** Look up external IDs for a player. Returns undefined when unmanifested. */
export function getExternalIds(basePlayerId: string | null | undefined): ExternalIds | undefined {
  if (!basePlayerId) return undefined;
  return PLAYER_IMAGE_MANIFEST[String(basePlayerId)];
}
