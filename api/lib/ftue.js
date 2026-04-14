/**
 * ftue.js — Server-side FTUE (First-Time User Experience) hand resolution
 *
 * Ported from basketball/src/adapters/ftueRoster.ts
 * The server is the source of truth for FTUE status and card data.
 *
 * Salary cap: $250 | Tier thresholds (from economyEngine.ts):
 *   RED >= $73 | ORANGE >= $58 | PURPLE >= $44 | BLUE >= $30 | GREEN >= $23 | WHITE < $23
 *
 * DEAL HAND — $245 total:
 *   Tatum  $66 ORANGE SF  ← ANCHOR (92 FP triple-double at CHI)
 *   LaMelo $58 ORANGE PG, JBrown $53 PURPLE SG,
 *   Klay   $33 BLUE   SG  (cold, obvious swap)
 *   Merrill $21 WHITE SG, Kleber $14 WHITE PF  ← swap candidates
 *
 * DRAWN HAND — $248 total (Tatum held):
 *   Tatum $66 ORANGE SF  ← was held
 *   Curry $57 PURPLE PG (HOT 52 FP), OG $46 PURPLE SF (normal 39.6)
 *   Draymond $43 BLUE PF (COLD 9.5), Lowry $20 WHITE PG (normal 18.9)
 *   Reddish $16 WHITE SF (COLD 12.1)  ← drawn
 *
 * TOTAL FP: 224.1 — STARTER tier (205+). ALL-STAR requires 225. Gap: 0.9 FP.
 */

// ─── FTUE Eligibility ────────────────────────────────────────────────────────

/**
 * Determine if a player is eligible for the FTUE scripted hand.
 *
 * @param {object|null|undefined} playerState - Row from player_state table
 * @returns {boolean}
 */
export function isFtueEligible(playerState) {
  if (playerState == null) return true;
  if (playerState.ftue_completed === true) return false;
  if (playerState.hands_played > 0) return false;
  return true;
}

// ─── DEAL HAND ───────────────────────────────────────────────────────────────
// $245 total. Coach guides user to hold Tatum. All others are swap candidates.
// Tatum's 92 FP is the obvious standout — no other card comes close.

/** @type {Array<object>} */
export const FTUE_DEAL_ROSTER = [

  // Slot 0 — LaMelo Ball | ORANGE $58 | PG | swap
  // 2024-11-01 vs BOS (H) — 31pts solid but turnover-heavy. BUCKET badge fires,
  // SLOPPY penalty fires (-3). Worth swapping: similar salary to Tatum but clearly inferior.
  {
    cardId: "ftue-lamelo",
    basePlayerId: "1630163",
    name: "LaMelo Ball",
    team: "CHA",
    position: "PG",
    tier: "ORANGE",
    salary: 58,
    projectedFp: 41,
    actualFp: 36.4,
    statLine: { pts: 31, reb: 2, ast: 4, stl: 1, blk: 0, turnovers: 4, min: 31 },
    achievements: [
      { id: "BUCKET", icon: "🏀", label: "Bucket", fp: 2 },
      { id: "SLOPPY", icon: "💦", label: "Sloppy", fp: -3 },
    ],
    gameInfo: { date: "2024-11-01", opponent: "BOS", homeAway: "H" },
  },

  // Slot 1 — Jaylen Brown | PURPLE $53 | SG | swap
  // 2025-01-23 at LAL — 17pts steady game. Clean (0 turnovers) but unspectacular.
  // Decent FP for a PURPLE card, but coach points to Tatum as the clear anchor.
  {
    cardId: "ftue-jbrown",
    basePlayerId: "1627759",
    name: "Jaylen Brown",
    team: "BOS",
    position: "SG",
    tier: "PURPLE",
    salary: 53,
    projectedFp: 38,
    actualFp: 33.1,
    statLine: { pts: 17, reb: 8, ast: 3, stl: 1, blk: 0, turnovers: 0, min: 33 },
    achievements: [],
    gameInfo: { date: "2025-01-23", opponent: "LAL", homeAway: "A" },
  },

  // Slot 2 — Jayson Tatum | ORANGE $66 | SF | HOLD ← ANCHOR
  // 2024-12-21 at CHI — TRIPLE DOUBLE: 43pts / 15reb / 10ast / 4to → 92 FP
  // Badges: FIRE(+5) + BEAST(+5) + DIME(+3) + SLOPPY(-3) + TRIPLE_DBL(+8) + DOUBLE_DBL(+2) = +20
  // Coach: "Tatum just dropped 92 FP — hold that card and draw new ones."
  {
    cardId: "ftue-tatum",
    basePlayerId: "1628369",
    name: "Jayson Tatum",
    team: "BOS",
    position: "SF",
    tier: "ORANGE",
    salary: 66,
    projectedFp: 42,
    actualFp: 92.0,
    statLine: { pts: 43, reb: 15, ast: 10, stl: 0, blk: 0, turnovers: 4, min: 36 },
    achievements: [
      { id: "FIRE",       icon: "🔥", label: "Fire",          fp: 5 },
      { id: "BEAST",      icon: "🦍", label: "Beast",         fp: 5 },
      { id: "DIME",       icon: "🧠", label: "Dime",          fp: 3 },
      { id: "SLOPPY",     icon: "💦", label: "Sloppy",        fp: -3 },
      { id: "TRIPLE_DBL", icon: "👑", label: "Triple Double", fp: 8 },
      { id: "DOUBLE_DBL", icon: "✌️", label: "Double Double", fp: 2 },
    ],
    gameInfo: { date: "2024-12-21", opponent: "CHI", homeAway: "A" },
  },

  // Slot 3 — Klay Thompson | BLUE $33 | SG | swap
  // 2025-01-25 at BOS — ICE COLD: 6pts / 3reb / 0ast. 10.6 FP. Obvious swap candidate.
  {
    cardId: "ftue-klay",
    basePlayerId: "202691",
    name: "Klay Thompson",
    team: "DAL",
    position: "SG",
    tier: "BLUE",
    salary: 33,
    projectedFp: 23,
    actualFp: 10.6,
    statLine: { pts: 6, reb: 3, ast: 0, stl: 0, blk: 1, turnovers: 1, min: 26 },
    achievements: [],
    gameInfo: { date: "2025-01-25", opponent: "BOS", homeAway: "H" },
  },

  // Slot 4 — Sam Merrill | WHITE $21 | SG | swap
  // 2025-03-27 vs SAS (H) — 13pts / 1blk / 2ast / 1to. Decent bench role player.
  // FP=19.4 (blk=1 adds to base). Still clearly below Tatum — swap.
  {
    cardId: "ftue-merrill",
    basePlayerId: "1630241",
    name: "Sam Merrill",
    team: "CLE",
    position: "SG",
    tier: "WHITE",
    salary: 21,
    projectedFp: 15,
    actualFp: 19.4,
    statLine: { pts: 13, reb: 2, ast: 2, stl: 0, blk: 1, turnovers: 1, min: 24 },
    achievements: [],
    gameInfo: { date: "2025-03-27", opponent: "SAS", homeAway: "H" },
  },

  // Slot 5 — Maxi Kleber | WHITE $14 | PF | swap
  // 2024-11-27 at NYK — garbage time: 1pts / 1reb. 1.2 FP. Worst card in the hand.
  {
    cardId: "ftue-kleber",
    basePlayerId: "1628467",
    name: "Maxi Kleber",
    team: "DAL",
    position: "PF",
    tier: "WHITE",
    salary: 14,
    projectedFp: 10,
    actualFp: 1.2,
    statLine: { pts: 1, reb: 1, ast: 0, stl: 0, blk: 0, turnovers: 1, min: 24 },
    achievements: [],
    gameInfo: { date: "2024-11-27", opponent: "NYK", homeAway: "A" },
  },

];

// ─── DRAW CARDS ──────────────────────────────────────────────────────────────
// Replacement cards for non-held slots. Keyed by slot index.
// Slot 2 (Tatum) is held — included for completeness / reference.
//
// FINAL FP BREAKDOWN after draw (Tatum held):
//   Tatum    $66 ORANGE: 92.0 FP  (TRIPLE DOUBLE at CHI)
//   Curry    $57 PURPLE: 52.0 FP  (HOT — 26pts/10ast vs DAL)
//   OG       $46 PURPLE: 39.6 FP  (normal — 22pts/3stl/2blk vs UTA)
//   Draymond $43 BLUE  :  9.5 FP  ← COLD (2pts/5reb/3ast/3to at MIA)
//   Lowry    $20 WHITE : 18.9 FP  (PURE badge — 0pts/5ast/2stl/1blk/0 TOs)
//   Reddish  $16 WHITE : 12.1 FP  ← COLD (5pts/3reb/1ast/2stl at MIN)
//   ─────────────────────────────────────────────────────────────────────
//   TOTAL: 224.1 FP → STARTER tier (205+). ALL-STAR requires 225. Gap: 0.9 FP.

/** @type {Record<number, object>} */
export const FTUE_DRAW_CARDS = {

  // Slot 0 → Steph Curry | PURPLE $57 | PG | drawn | HOT
  // 2024-12-15 vs DAL (H) — 26pts / 5reb / 10ast / 1stl / 2to → 52 FP (DIME + DOUBLE_DBL)
  0: {
    cardId: "ftue-curry",
    basePlayerId: "201939",
    name: "Steph Curry",
    team: "GSW",
    position: "PG",
    tier: "PURPLE",
    salary: 57,
    projectedFp: 36,
    actualFp: 52.0,
    statLine: { pts: 26, reb: 5, ast: 10, stl: 1, blk: 0, turnovers: 2, min: 35 },
    achievements: [
      { id: "DIME",       icon: "🧠", label: "Dime",          fp: 3 },
      { id: "DOUBLE_DBL", icon: "✌️", label: "Double Double", fp: 2 },
    ],
    gameInfo: { date: "2024-12-15", opponent: "DAL", homeAway: "H" },
  },

  // Slot 1 → OG Anunoby | PURPLE $46 | SF | drawn
  // 2025-01-01 vs UTA (H) — 22pts / 3reb / 2ast / 3stl / 2blk / 1to → 39.6 FP (PICKPOCKET)
  1: {
    cardId: "ftue-og",
    basePlayerId: "1628384",
    name: "OG Anunoby",
    team: "NYK",
    position: "SF",
    tier: "PURPLE",
    salary: 46,
    projectedFp: 32,
    actualFp: 39.6,
    statLine: { pts: 22, reb: 3, ast: 2, stl: 3, blk: 2, turnovers: 1, min: 41 },
    achievements: [
      { id: "PICKPOCKET", icon: "👀", label: "Pickpocket", fp: 2 },
    ],
    gameInfo: { date: "2025-01-01", opponent: "UTA", homeAway: "H" },
  },

  // Slot 2 → Jayson Tatum | ORANGE $66 | SF | HELD (no replacement)
  // Included for completeness — wasHeld: true at resolution time.
  2: {
    cardId: "ftue-tatum",
    basePlayerId: "1628369",
    name: "Jayson Tatum",
    team: "BOS",
    position: "SF",
    tier: "ORANGE",
    salary: 66,
    projectedFp: 42,
    actualFp: 92.0,
    statLine: { pts: 43, reb: 15, ast: 10, stl: 0, blk: 0, turnovers: 4, min: 36 },
    achievements: [
      { id: "FIRE",       icon: "🔥", label: "Fire",          fp: 5 },
      { id: "BEAST",      icon: "🦍", label: "Beast",         fp: 5 },
      { id: "DIME",       icon: "🧠", label: "Dime",          fp: 3 },
      { id: "SLOPPY",     icon: "💦", label: "Sloppy",        fp: -3 },
      { id: "TRIPLE_DBL", icon: "👑", label: "Triple Double", fp: 8 },
      { id: "DOUBLE_DBL", icon: "✌️", label: "Double Double", fp: 2 },
    ],
    gameInfo: { date: "2024-12-21", opponent: "CHI", homeAway: "A" },
  },

  // Slot 3 → Draymond Green | BLUE $43 | PF | drawn | COLD
  // 2025-03-25 at MIA — 2pts / 5reb / 3ast / 3to → 9.5 FP (no badges)
  3: {
    cardId: "ftue-draymond",
    basePlayerId: "203110",
    name: "Draymond Green",
    team: "GSW",
    position: "PF",
    tier: "BLUE",
    salary: 43,
    projectedFp: 31,
    actualFp: 9.5,
    statLine: { pts: 2, reb: 5, ast: 3, stl: 0, blk: 0, turnovers: 3, min: 23 },
    achievements: [],
    gameInfo: { date: "2025-03-25", opponent: "MIA", homeAway: "A" },
  },

  // Slot 4 → Kyle Lowry | WHITE $20 | PG | drawn
  // 2024-12-28 at UTA — 0pts / 2reb / 5ast / 2stl / 1blk / 0to → 18.9 FP (PURE badge)
  4: {
    cardId: "ftue-lowry",
    basePlayerId: "200768",
    name: "Kyle Lowry",
    team: "PHI",
    position: "PG",
    tier: "WHITE",
    salary: 20,
    projectedFp: 14,
    actualFp: 18.9,
    statLine: { pts: 0, reb: 2, ast: 5, stl: 2, blk: 1, turnovers: 0, min: 19 },
    achievements: [
      { id: "PURE", icon: "🎯", label: "Pure", fp: 3 },
    ],
    gameInfo: { date: "2024-12-28", opponent: "UTA", homeAway: "A" },
  },

  // Slot 5 → Cam Reddish | WHITE $16 | SF | drawn | COLD
  // 2024-12-13 at MIN — 5pts / 3reb / 1ast / 2stl / 2to → 12.1 FP (no badges)
  5: {
    cardId: "ftue-reddish",
    basePlayerId: "1629629",
    name: "Cam Reddish",
    team: "LAL",
    position: "SF",
    tier: "WHITE",
    salary: 16,
    projectedFp: 20,
    actualFp: 12.1,
    statLine: { pts: 5, reb: 3, ast: 1, stl: 2, blk: 0, turnovers: 2, min: 23 },
    achievements: [],
    gameInfo: { date: "2024-12-13", opponent: "MIN", homeAway: "A" },
  },

};
