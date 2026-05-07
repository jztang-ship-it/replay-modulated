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

import type { ExternalIds, ProcessedQuality } from "@shared/media/playerImages";
import { setProcessedQualityRegistry } from "@shared/media/playerImages";
import processedQuality from "./playerProcessingQuality.json";

// Register the per-id processed-quality map at module load. The shared
// resolver uses it to refuse damaged/manual-bad processed cutouts and
// fall back to the raw local image (or further fallbacks).
//
// The JSON is written by football/scripts/processPlayerHeadshots.mjs.
// Each entry: { quality: "cleanCutout" | "badCutout" | ..., mode, pctTrans, pctFaceTrans }.
// We pass the whole object through — the resolver only reads `.quality`.
setProcessedQualityRegistry(
  processedQuality as Record<string, { quality: ProcessedQuality }>,
);

export const PLAYER_IMAGE_MANIFEST: Record<string, ExternalIds> = {
  // Kylian Mbappé Lottin (France)
  "3009": { apiFootballId: 278, local: true, processed: true },
  // Danilo Luiz da Silva (Brazil)
  "3063": { apiFootballId: 224405, local: true, processed: true },
  // Hugo Lloris (France)
  "3099": { apiFootballId: 159, local: true, processed: true },
  // Thomas Lemar (France)
  "3245": { apiFootballId: 1095, local: true, processed: true },
  // Thiago Emiliano da Silva (Brazil)
  "3295": { apiFootballId: 160587, local: true, processed: true },
  // Daley Blind (Netherlands)
  "3311": { apiFootballId: 531, local: true, processed: true },
  // Youssouf Sabaly (Senegal)
  "3404": { apiFootballId: 1264, local: true, processed: true },
  // Jordan Pickford (England)
  "3468": { apiFootballId: 2932, local: true, processed: true },
  // Wayne Hennessey (Wales)
  "3488": { apiFootballId: 18836, local: true, processed: true },
  // Thibaut Courtois (Belgium)
  "3509": { apiFootballId: 730, local: true, processed: true },
  // Faustino Marcos Alberto Rojo (Argentina)
  "3602": { apiFootballId: 1116, local: true, processed: true },
  // Virgil van Dijk (Netherlands)
  "3669": { apiFootballId: 290, local: true, processed: true },
  // Kasper Schmeichel (Denmark)
  "3815": { apiFootballId: 2728, local: true, processed: true },
  // Andreas Christensen (Denmark)
  "3959": { apiFootballId: 378712, local: true, processed: true },
  // Marcos Aoás Corrêa (Brazil)
  "4372": { apiFootballId: 292036, local: true, processed: true },
  // Jules Koundé (France)
  "4445": { apiFootballId: 1257, local: true, processed: true },
  // Lucas Vázquez Iglesias (Spain)
  "5200": { apiFootballId: 762, local: true, processed: true },
  // Romain Saïss (Morocco)
  "5219": { apiFootballId: 2716, local: true, processed: true },
  // Alireza Safar Beiranvand (Iran)
  "5227": { apiFootballId: 2682, local: true, processed: true },
  // Aziz Eraltay Behich (Australia)
  "5479": { apiFootballId: 225, local: true, processed: true },
  // Raphaël Varane (France)
  "5485": { apiFootballId: 742, local: true, processed: true },
  // Lionel Andrés Messi Cuccittini (Argentina)
  "5503": { apiFootballId: 154, local: true, processed: true },
  // Nicolás Alejandro Tagliafico (Argentina)
  "5507": { apiFootballId: 529, local: true, processed: true },
  // Fabian Lukas Schär (Switzerland)
  "5537": { apiFootballId: 2806, local: true, processed: true },
  // Alisson Ramsés Becker (Brazil)
  "5547": { apiFootballId: 280, local: true, processed: true },
  // Manuel Obafemi Akanji (Switzerland)
  "5549": { apiFootballId: 5, local: true, processed: true },
  // Yann Sommer (Switzerland)
  "5550": { apiFootballId: 2802, local: true, processed: true },
  // Manuel Neuer (Germany)
  "5570": { apiFootballId: 497, local: true, processed: true },
  // Héctor Alfredo Moreno Herrera (Mexico)
  "5573": { apiFootballId: 5747, local: true, processed: true },
  // Filip Kostić (Serbia)
  "5591": { apiFootballId: 227954, local: true, processed: true },
  // Nikola Milenković (Serbia)
  "5603": { apiFootballId: 2817, local: true, processed: true },
  // Yassine Meriah (Tunisia)
  "5651": { apiFootballId: 1597, local: true, processed: true },
  // Dylan Daniel Mahmoud Bronn (Tunisia)
  "5655": { apiFootballId: 2945, local: true, processed: true },
  // Wojciech Szczęsny (Poland)
  "5669": { apiFootballId: 851, local: true, processed: true },
  // Kalidou Koulibaly (Senegal)
  "5675": { apiFootballId: 318, local: true, processed: true },
  // Mohammed Khalil Al Owais (Saudi Arabia)
  "5714": { apiFootballId: 44411, local: true, processed: true },
  // Nemanja Radonjić (Serbia)
  "5833": { apiFootballId: 1920, local: true, processed: true },
  // Andrija Živković (Serbia)
  "6318": { apiFootballId: 579, local: true, processed: true },
  // Milos Veljkovic (Serbia)
  "6321": { apiFootballId: 2821, local: true, processed: true },
  // Yassine Bounou (Morocco)
  "6785": { apiFootballId: 2701, local: true, processed: true },
  // Damián Emiliano Martínez (Argentina)
  "6909": { apiFootballId: 33163, local: true, processed: true },
  // Alex Sandro Lobo Silva (Brazil)
  "6945": { apiFootballId: 371716, local: true, processed: true },
  // João Pedro Cavaco Cancelo (Portugal)
  "7005": { apiFootballId: 855, local: true, processed: true },
  // Axel Disasi (France)
  "7439": { apiFootballId: 21998, local: true, processed: true },
  // Jawad El Yamiq (Morocco)
  "7459": { apiFootballId: 31386, local: true, processed: true },
  // Silvan Widmer (Switzerland)
  "7796": { apiFootballId: 48378, local: true, processed: true },
  // André Onana (Cameroon)
  "8064": { apiFootballId: 526, local: true, processed: true },
  // Denzel Dumfries (Netherlands)
  "8125": { apiFootballId: 226, local: true, processed: true },
  // Joachim Andersen (Denmark)
  "8247": { apiFootballId: 216485, local: true, processed: true },
  // Andries Noppert (Netherlands)
  "8326": { apiFootballId: 31632, local: true, processed: true },
  // Dayotchanculle Upamecano (France)
  "8519": { apiFootballId: 1149, local: true, processed: true },
  // Abdou Diallo (Senegal)
  "8553": { apiFootballId: 2190, local: true, processed: true },
  // Mohamed Dräger (Tunisia)
  "9236": { apiFootballId: 2952, local: true, processed: true },
  // Ricardo Jorge Luz Horta (Portugal)
  "10868": { apiFootballId: 41103, local: true, processed: true },
  // Ibrahima Konaté (France)
  "11135": { apiFootballId: 86964, local: true, processed: true },
  // Miloš Degenek (Australia)
  "15957": { apiFootballId: 2742, local: true, processed: true },
  // Milan Borjan (Canada)
  "15958": { apiFootballId: 336, local: true, processed: true },
  // José Diogo Dalot Teixeira (Portugal)
  "16028": { apiFootballId: 187931, local: true, processed: true },
  // Rasmus Nissen Kristensen (Denmark)
  "16190": { apiFootballId: 533, local: true, processed: true },
  // Nemanja Gudelj (Serbia)
  "16489": { apiFootballId: 1489, local: true, processed: true },
  // Dominik Livaković (Croatia)
  "16531": { apiFootballId: 1305, local: true, processed: true },
  // Vinícius José Paixão de Oliveira Júnior (Brazil)
  "18395": { apiFootballId: 19062, local: true, processed: true },
  // Marcos Javier Acuña (Argentina)
  "19597": { apiFootballId: 1493, local: true, processed: true },
  // Luuk de Jong (Netherlands)
  "20033": { apiFootballId: 246, local: true, processed: true },
  // Vanja Milinković Savić (Serbia)
  "20600": { apiFootballId: 31156, local: true, processed: true },
  // Jurriën David Norman Timber (Netherlands)
  "21809": { apiFootballId: 38746, local: true, processed: true },
  // Bukayo Saka (England)
  "22084": { apiFootballId: 19220, local: true, processed: true },
  // Harry Souttar (Australia)
  "22293": { apiFootballId: 20079, local: true, processed: true },
  // Pervis Josué Estupiñán Tenorio (Ecuador)
  "24085": { apiFootballId: 649655, local: true, processed: true },
  // Strahinja Pavlović (Serbia)
  "27719": { apiFootballId: 45826, local: true, processed: true },
  // Exequiel Alejandro Palacios (Argentina)
  "28268": { apiFootballId: 6002, local: true, processed: true },
  // Fran Karačić (Australia)
  "28370": { apiFootballId: 14386, local: true, processed: true },
  // Felix Eduardo Torres Caicedo (Ecuador)
  "30111": { apiFootballId: 1861, local: true, processed: true },
  // Ali Abdi (Tunisia)
  "30681": { apiFootballId: 49583, local: true, processed: true },
  // Jude Bellingham (England)
  "30714": { apiFootballId: 5503, local: true, processed: true },
  // Yahia Attiyat allah (Morocco)
  "31295": { apiFootballId: 135836, local: true, processed: true },
  // Montassar Omar Talbi (Tunisia)
  "32450": { apiFootballId: 50030, local: true, processed: true },
  // Ismail Jakobs (Senegal)
  "32915": { apiFootballId: 158121, local: true, processed: true },
  // Diogo Meireles Costa (Portugal)
  "32975": { apiFootballId: 142706, local: true, processed: true },
  // Kye Rowles (Australia)
  "33495": { apiFootballId: 7038, local: true, processed: true },
  // Angelo Smit Preciado Quiñónez (Ecuador)
  "37737": { apiFootballId: 63963, local: true, processed: true },
  // Min Jae Kim (South Korea)
  "43565": { apiFootballId: 645996, local: true, processed: true },
  // Aymen Dahmen (Tunisia)
  "105943": { apiFootballId: 49424, local: true, processed: true },
  // Wajdi Kechrida (Tunisia)
  "105944": { apiFootballId: 2954, local: true, processed: true },
  // Meshaal Aissa Barsham (Qatar)
  "124510": { apiFootballId: 42021, local: true, processed: true },
  // Achraf Dari (Morocco)
  "139016": { apiFootballId: 36540, local: true, processed: true },
};

/** Look up external IDs for a player. Returns undefined when unmanifested. */
export function getExternalIds(basePlayerId: string | null | undefined): ExternalIds | undefined {
  if (!basePlayerId) return undefined;
  return PLAYER_IMAGE_MANIFEST[String(basePlayerId)];
}
