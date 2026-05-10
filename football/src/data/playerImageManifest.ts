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
  // Youri Tielemans (Belgium)
  "2954": { apiFootballId: 2926, local: true, processed: true },
  // Kylian Mbappé Lottin (France)
  "3009": { apiFootballId: 278, local: true, processed: true },
  // Adrien Rabiot (France)
  "3026": { apiFootballId: 272, local: true, processed: true },
  // Kamil Glik (Poland)
  "3034": { apiFootballId: 97, local: true, processed: true },
  // Christian Dannemann Eriksen (Denmark)
  "3043": { apiFootballId: 174, local: true, processed: true },
  // Leroy Sané (Germany)
  "3053": { apiFootballId: 644, local: true, processed: true },
  // Danilo Luiz da Silva (Brazil)
  "3063": { apiFootballId: 224405, local: true, processed: true },
  // Kevin De Bruyne (Belgium)
  "3089": { apiFootballId: 629, local: true, processed: true },
  // Nicolás Hernán Otamendi (Argentina)
  "3090": { apiFootballId: 624, local: true, processed: true },
  // Hugo Lloris (France)
  "3099": { apiFootballId: 159, local: true, processed: true },
  // Thomas Meunier (Belgium)
  "3176": { apiFootballId: 264, local: true, processed: true },
  // Wahbi Khazri (Tunisia)
  "3196": { apiFootballId: 22102, local: true, processed: true },
  // Kyle Walker (England)
  "3205": { apiFootballId: 171, local: true, processed: true },
  // John Stones (England)
  "3244": { apiFootballId: 626, local: true, processed: true },
  // Thomas Lemar (France)
  "3245": { apiFootballId: 1095, local: true, processed: true },
  // Fábio Henrique Tavares (Brazil)
  "3247": { apiFootballId: 391104, local: true, processed: true },
  // Richarlison de Andrade (Brazil)
  "3280": { apiFootballId: 116605, local: true, processed: true },
  // Aaron Mooy (Australia)
  "3281": { apiFootballId: 19050, local: true, processed: true },
  // Thiago Emiliano da Silva (Brazil)
  "3295": { apiFootballId: 160587, local: true, processed: true },
  // Kieran Trippier (England)
  "3308": { apiFootballId: 169, local: true, processed: true },
  // Daley Blind (Netherlands)
  "3311": { apiFootballId: 531, local: true, processed: true },
  // Harry Maguire (England)
  "3336": { apiFootballId: 2935, local: true, processed: true },
  // Luke Shaw (England)
  "3382": { apiFootballId: 393299, local: true, processed: true },
  // Youssouf Sabaly (Senegal)
  "3404": { apiFootballId: 1264, local: true, processed: true },
  // Idrissa Gana Gueye (Senegal)
  "3436": { apiFootballId: 2990, local: true, processed: true },
  // Jordan Pickford (England)
  "3468": { apiFootballId: 2932, local: true, processed: true },
  // Álvaro Borja Morata Martín (Spain)
  "3477": { apiFootballId: 183672, local: true, processed: true },
  // Wayne Hennessey (Wales)
  "3488": { apiFootballId: 18836, local: true, processed: true },
  // Thibaut Courtois (Belgium)
  "3509": { apiFootballId: 730, local: true, processed: true },
  // Xherdan Shaqiri (Switzerland)
  "3533": { apiFootballId: 307, local: true, processed: true },
  // Faustino Marcos Alberto Rojo (Argentina)
  "3602": { apiFootballId: 1116, local: true, processed: true },
  // Eden Hazard (Belgium)
  "3621": { apiFootballId: 2296, local: true, processed: true },
  // Virgil van Dijk (Netherlands)
  "3669": { apiFootballId: 290, local: true, processed: true },
  // Ellyes Joris Skhiri (Tunisia)
  "3767": { apiFootballId: 21587, local: true, processed: true },
  // Kasper Schmeichel (Denmark)
  "3815": { apiFootballId: 2728, local: true, processed: true },
  // Andreas Christensen (Denmark)
  "3959": { apiFootballId: 378712, local: true, processed: true },
  // Aleksandar Mitrović (Serbia)
  "4269": { apiFootballId: 271605, local: true, processed: true },
  // Neymar da Silva Santos Junior (Brazil)
  "4320": { apiFootballId: 225804, local: true, processed: true },
  // Aymeric Laporte (Spain)
  "4353": { apiFootballId: 622, local: true, processed: true },
  // Marcos Aoás Corrêa (Brazil)
  "4372": { apiFootballId: 292036, local: true, processed: true },
  // Jules Koundé (France)
  "4445": { apiFootballId: 1257, local: true, processed: true },
  // Artur Jędrzejczyk (Poland)
  "4685": { apiFootballId: 3002, local: true, processed: true },
  // Matty Cash (Poland)
  "4734": { apiFootballId: 19298, local: true, processed: true },
  // Abdullah Ibrahim Otayf (Saudi Arabia)
  "5173": { apiFootballId: 44350, local: true, processed: true },
  // Salman Mohammed Al Faraj (Saudi Arabia)
  "5178": { apiFootballId: 44341, local: true, processed: true },
  // Salem Mohammed Al Dawsari (Saudi Arabia)
  "5187": { apiFootballId: 44340, local: true, processed: true },
  // Lucas Vázquez Iglesias (Spain)
  "5200": { apiFootballId: 762, local: true, processed: true },
  // Bruno Miguel Borges Fernandes (Portugal)
  "5204": { apiFootballId: 337369, local: true, processed: true },
  // Romain Saïss (Morocco)
  "5219": { apiFootballId: 2716, local: true, processed: true },
  // Mehdi Taremi (Iran)
  "5226": { apiFootballId: 42315, local: true, processed: true },
  // Alireza Safar Beiranvand (Iran)
  "5227": { apiFootballId: 2682, local: true, processed: true },
  // Sofyan Amrabat (Morocco)
  "5234": { apiFootballId: 74, local: true, processed: true },
  // Ramin Rezaeian (Iran)
  "5235": { apiFootballId: 2691, local: true, processed: true },
  // Hakim Ziyech (Morocco)
  "5237": { apiFootballId: 548, local: true, processed: true },
  // Alireza Jahanbakhsh (Iran)
  "5239": { apiFootballId: 2700, local: true, processed: true },
  // Vahid Amiri (Iran)
  "5241": { apiFootballId: 2692, local: true, processed: true },
  // Mateo Kovačić (Croatia)
  "5456": { apiFootballId: 429600, local: true, processed: true },
  // Luka Modrić (Croatia)
  "5463": { apiFootballId: 754, local: true, processed: true },
  // Marcelo Brozović (Croatia)
  "5469": { apiFootballId: 201, local: true, processed: true },
  // Ivan Perišić (Croatia)
  "5474": { apiFootballId: 207, local: true, processed: true },
  // Aziz Eraltay Behich (Australia)
  "5479": { apiFootballId: 225, local: true, processed: true },
  // Mathew Leckie (Australia)
  "5481": { apiFootballId: 2751, local: true, processed: true },
  // Raphaël Varane (France)
  "5485": { apiFootballId: 742, local: true, processed: true },
  // Antoine Griezmann (France)
  "5487": { apiFootballId: 56, local: true, processed: true },
  // Lionel Andrés Messi Cuccittini (Argentina)
  "5503": { apiFootballId: 154, local: true, processed: true },
  // Nicolás Alejandro Tagliafico (Argentina)
  "5507": { apiFootballId: 529, local: true, processed: true },
  // Jens Stryger Larsen (Denmark)
  "5524": { apiFootballId: 2733, local: true, processed: true },
  // Yussuf Yurary Poulsen (Denmark)
  "5536": { apiFootballId: 1167, local: true, processed: true },
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
  // Héctor Miguel Herrera López (Mexico)
  "5575": { apiFootballId: 92650, local: true, processed: true },
  // Joshua Kimmich (Germany)
  "5579": { apiFootballId: 502, local: true, processed: true },
  // Filip Kostić (Serbia)
  "5591": { apiFootballId: 227954, local: true, processed: true },
  // Francisco Javier Calvo Quesada (Costa Rica)
  "5600": { apiFootballId: 658364, local: true, processed: true },
  // Nikola Milenković (Serbia)
  "5603": { apiFootballId: 2817, local: true, processed: true },
  // Ali Maâloul (Tunisia)
  "5647": { apiFootballId: 2947, local: true, processed: true },
  // Yassine Meriah (Tunisia)
  "5651": { apiFootballId: 1597, local: true, processed: true },
  // Dylan Daniel Mahmoud Bronn (Tunisia)
  "5655": { apiFootballId: 2945, local: true, processed: true },
  // Robert Lewandowski (Poland)
  "5668": { apiFootballId: 147229, local: true, processed: true },
  // Wojciech Szczęsny (Poland)
  "5669": { apiFootballId: 851, local: true, processed: true },
  // Bartosz Bereszyński (Poland)
  "5673": { apiFootballId: 3000, local: true, processed: true },
  // Kalidou Koulibaly (Senegal)
  "5675": { apiFootballId: 318, local: true, processed: true },
  // Gaku Shibasaki (Japan)
  "5693": { apiFootballId: 2604, local: true, processed: true },
  // Mohammed Khalil Al Owais (Saudi Arabia)
  "5714": { apiFootballId: 44411, local: true, processed: true },
  // Nemanja Radonjić (Serbia)
  "5833": { apiFootballId: 1920, local: true, processed: true },
  // Andrija Živković (Serbia)
  "6318": { apiFootballId: 579, local: true, processed: true },
  // Milos Veljkovic (Serbia)
  "6321": { apiFootballId: 2821, local: true, processed: true },
  // Thomas Teye Partey (Ghana)
  "6383": { apiFootballId: 49, local: true, processed: true },
  // Yassine Bounou (Morocco)
  "6785": { apiFootballId: 2701, local: true, processed: true },
  // Damián Emiliano Martínez (Argentina)
  "6909": { apiFootballId: 33163, local: true, processed: true },
  // Alex Sandro Lobo Silva (Brazil)
  "6945": { apiFootballId: 371716, local: true, processed: true },
  // João Pedro Cavaco Cancelo (Portugal)
  "7005": { apiFootballId: 855, local: true, processed: true },
  // Jean-Charles Castelletto (Cameroon)
  "7426": { apiFootballId: 20545, local: true, processed: true },
  // Axel Disasi (France)
  "7439": { apiFootballId: 21998, local: true, processed: true },
  // Jawad El Yamiq (Morocco)
  "7459": { apiFootballId: 31386, local: true, processed: true },
  // Silvan Widmer (Switzerland)
  "7796": { apiFootballId: 48378, local: true, processed: true },
  // André Onana (Cameroon)
  "8064": { apiFootballId: 526, local: true, processed: true },
  // Frenkie de Jong (Netherlands)
  "8118": { apiFootballId: 538, local: true, processed: true },
  // Denzel Dumfries (Netherlands)
  "8125": { apiFootballId: 226, local: true, processed: true },
  // Joachim Andersen (Denmark)
  "8247": { apiFootballId: 216485, local: true, processed: true },
  // Andries Noppert (Netherlands)
  "8326": { apiFootballId: 31632, local: true, processed: true },
  // Serge Gnabry (Germany)
  "8400": { apiFootballId: 510, local: true, processed: true },
  // Thilo Kehrer (Germany)
  "8511": { apiFootballId: 261, local: true, processed: true },
  // Dayotchanculle Upamecano (France)
  "8519": { apiFootballId: 1149, local: true, processed: true },
  // Niclas Füllkrug (Germany)
  "8546": { apiFootballId: 25391, local: true, processed: true },
  // Abdou Diallo (Senegal)
  "8553": { apiFootballId: 2190, local: true, processed: true },
  // Nico Elvedi (Switzerland)
  "8814": { apiFootballId: 2803, local: true, processed: true },
  // Kai Havertz (Germany)
  "8966": { apiFootballId: 978, local: true, processed: true },
  // Mohamed Dräger (Tunisia)
  "9236": { apiFootballId: 2952, local: true, processed: true },
  // Ricardo Jorge Luz Horta (Portugal)
  "10868": { apiFootballId: 41103, local: true, processed: true },
  // Eric Dier (England)
  "10956": { apiFootballId: 175, local: true, processed: true },
  // Ibrahima Konaté (France)
  "11135": { apiFootballId: 86964, local: true, processed: true },
  // Vincent Paté Aboubakar (Cameroon)
  "11174": { apiFootballId: 386, local: true, processed: true },
  // Stephen Antunes Eustáquio (Canada)
  "11187": { apiFootballId: 35570, local: true, processed: true },
  // David Raum (Germany)
  "12034": { apiFootballId: 25158, local: true, processed: true },
  // João Félix Sequeira (Portugal)
  "12041": { apiFootballId: 196958, local: true, processed: true },
  // Alphonso Davies (Canada)
  "12365": { apiFootballId: 509, local: true, processed: true },
  // Famara Diedhiou (Senegal)
  "13314": { apiFootballId: 19278, local: true, processed: true },
  // Noussair Mazraoui (Morocco)
  "15890": { apiFootballId: 545, local: true, processed: true },
  // Miloš Degenek (Australia)
  "15957": { apiFootballId: 2742, local: true, processed: true },
  // Milan Borjan (Canada)
  "15958": { apiFootballId: 336, local: true, processed: true },
  // Nicolas Moumi Ngamaleu (Cameroon)
  "16015": { apiFootballId: 955, local: true, processed: true },
  // José Diogo Dalot Teixeira (Portugal)
  "16028": { apiFootballId: 187931, local: true, processed: true },
  // Rasmus Nissen Kristensen (Denmark)
  "16190": { apiFootballId: 533, local: true, processed: true },
  // Nemanja Gudelj (Serbia)
  "16489": { apiFootballId: 1489, local: true, processed: true },
  // Mislav Oršić (Croatia)
  "16527": { apiFootballId: 1330, local: true, processed: true },
  // Dominik Livaković (Croatia)
  "16531": { apiFootballId: 1305, local: true, processed: true },
  // Daniel Olmo Carvajal (Spain)
  "16532": { apiFootballId: 189011, local: true, processed: true },
  // Mohammed Kudus (Ghana)
  "17033": { apiFootballId: 15911, local: true, processed: true },
  // Vinícius José Paixão de Oliveira Júnior (Brazil)
  "18395": { apiFootballId: 19062, local: true, processed: true },
  // Marcos Javier Acuña (Argentina)
  "19597": { apiFootballId: 1493, local: true, processed: true },
  // Luuk de Jong (Netherlands)
  "20033": { apiFootballId: 246, local: true, processed: true },
  // Vanja Milinković Savić (Serbia)
  "20600": { apiFootballId: 31156, local: true, processed: true },
  // Cody Mathès Gakpo (Netherlands)
  "20750": { apiFootballId: 247, local: true, processed: true },
  // Jurriën David Norman Timber (Netherlands)
  "21809": { apiFootballId: 38746, local: true, processed: true },
  // Bukayo Saka (England)
  "22084": { apiFootballId: 19220, local: true, processed: true },
  // Randal Kolo Muani (France)
  "22097": { apiFootballId: 21104, local: true, processed: true },
  // Harry Souttar (Australia)
  "22293": { apiFootballId: 20079, local: true, processed: true },
  // Lucas Tolentino Coelho de Lima (Brazil)
  "22600": { apiFootballId: 303263, local: true, processed: true },
  // Youssef Msakni (Tunisia)
  "23910": { apiFootballId: 2964, local: true, processed: true },
  // Tajon Buchanan (Canada)
  "24024": { apiFootballId: 51016, local: true, processed: true },
  // Pervis Josué Estupiñán Tenorio (Ecuador)
  "24085": { apiFootballId: 649655, local: true, processed: true },
  // Eduardo Camavinga (France)
  "24778": { apiFootballId: 2207, local: true, processed: true },
  // Orbelín Pineda Alvarado (Mexico)
  "26280": { apiFootballId: 577163, local: true, processed: true },
  // Strahinja Pavlović (Serbia)
  "27719": { apiFootballId: 45826, local: true, processed: true },
  // Alexis Mac Allister (Argentina)
  "27886": { apiFootballId: 6716, local: true, processed: true },
  // Exequiel Alejandro Palacios (Argentina)
  "28268": { apiFootballId: 6002, local: true, processed: true },
  // Fran Karačić (Australia)
  "28370": { apiFootballId: 14386, local: true, processed: true },
  // Ko Itakura (Japan)
  "29595": { apiFootballId: 38114, local: true, processed: true },
  // Gabriel Teodoro Martinelli Silva (Brazil)
  "29976": { apiFootballId: 253732, local: true, processed: true },
  // Felix Eduardo Torres Caicedo (Ecuador)
  "30111": { apiFootballId: 1861, local: true, processed: true },
  // Mohamed Salisu (Ghana)
  "30519": { apiFootballId: 47480, local: true, processed: true },
  // Ali Abdi (Tunisia)
  "30681": { apiFootballId: 49583, local: true, processed: true },
  // Jude Bellingham (England)
  "30714": { apiFootballId: 5503, local: true, processed: true },
  // Salis Abdul Samed (Ghana)
  "31029": { apiFootballId: 128987, local: true, processed: true },
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
  // Josip Šutalo (Croatia)
  "37148": { apiFootballId: 14701, local: true, processed: true },
  // Ao Tanaka (Japan)
  "37208": { apiFootballId: 32966, local: true, processed: true },
  // Moisés Isaac Caicedo Corozo (Ecuador)
  "37726": { apiFootballId: 16414, local: true, processed: true },
  // Angelo Smit Preciado Quiñónez (Ecuador)
  "37737": { apiFootballId: 63963, local: true, processed: true },
  // Enzo Fernandez (Argentina)
  "38718": { apiFootballId: 218263, local: true, processed: true },
  // Gonçalo Matias Ramos (Portugal)
  "38803": { apiFootballId: 384066, local: true, processed: true },
  // Jamal Musiala (Germany)
  "39565": { apiFootballId: 181812, local: true, processed: true },
  // Min Jae Kim (South Korea)
  "43565": { apiFootballId: 645996, local: true, processed: true },
  // Jakub Piotr Kiwior (Poland)
  "44166": { apiFootballId: 61431, local: true, processed: true },
  // Alidu Seidu (Ghana)
  "45047": { apiFootballId: 196187, local: true, processed: true },
  // Azzedine Ounahi (Morocco)
  "46258": { apiFootballId: 129678, local: true, processed: true },
  // Josip Stanišić (Croatia)
  "49337": { apiFootballId: 125171, local: true, processed: true },
  // Abdulelah Al Amri (Saudi Arabia)
  "51094": { apiFootballId: 44475, local: true, processed: true },
  // Riyadh Sharahili (Saudi Arabia)
  "51470": { apiFootballId: 104652, local: true, processed: true },
  // Sultan Abdullah Salim Al Ghannam (Saudi Arabia)
  "57620": { apiFootballId: 44309, local: true, processed: true },
  // Aymen Dahmen (Tunisia)
  "105943": { apiFootballId: 49424, local: true, processed: true },
  // Wajdi Kechrida (Tunisia)
  "105944": { apiFootballId: 2954, local: true, processed: true },
  // Boualem Khoukhi (Qatar)
  "124493": { apiFootballId: 2532, local: true, processed: true },
  // Assim Omer Al Haj Madibo (Qatar)
  "124500": { apiFootballId: 2535, local: true, processed: true },
  // Pedro Miguel Correia (Qatar)
  "124506": { apiFootballId: 549117, local: true, processed: true },
  // Meshaal Aissa Barsham (Qatar)
  "124510": { apiFootballId: 42021, local: true, processed: true },
  // Ismaeel Mohammad Mohammad (Qatar)
  "124899": { apiFootballId: 42088, local: true, processed: true },
  // Homam Alamin Ahmed (Qatar)
  "124900": { apiFootballId: 175439, local: true, processed: true },
  // Achraf Dari (Morocco)
  "139016": { apiFootballId: 36540, local: true, processed: true },
};

/** Look up external IDs for a player. Returns undefined when unmanifested. */
export function getExternalIds(basePlayerId: string | null | undefined): ExternalIds | undefined {
  if (!basePlayerId) return undefined;
  return PLAYER_IMAGE_MANIFEST[String(basePlayerId)];
}
