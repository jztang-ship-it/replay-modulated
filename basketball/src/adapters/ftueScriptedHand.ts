/**
 * ftueScriptedHand.ts — Basketball FTUE: the sealed scripted first hand.
 *
 * Per docs/ftue-scripted-hand-spec.md. A single canned hand, identical for all
 * first-run users, walled off from the live slate. Resolves CLIENT-SIDE (no
 * server mirror) — actualFp/badges are baked here to the LIVE engine + computeBadges.
 *
 * RAIL (5-card / 3-round):
 *   R1: deal 5 → coach directs "lock in 2 you trust" (LeBron + Edwards) → replace the 3 unheld
 *   R2: deal 3 replacements → "lock in 1 more" (Draymond) → replace the 2 unheld
 *   R3: give the final 2 (Davis + Fox), no choice → reveal
 * Directed holds are GUARANTEED: the scripted redraw keeps the directed cards and
 * replaces the rest regardless of exact taps, so the final 5 is always the engineered set.
 *
 * FP (trued-up against basketballConfig projectionWeights + badges; STARTER re-tune +
 *  star-power recast 2026-07-01 — roles/FP/stat-lines LOCKED, only names/teams/logs change):
 *   weights pts1.0 reb1.2 ast1.5 stl2.0 blk2.0 to-1.0 ; tiers ROOKIE190/STARTER205/ALLSTAR225/MVP235
 *   ROLE            PLAYER          $   stat line         FP    proj  Δ      flame
 *   Normal          De'Aaron Fox   30  24/5/6/2/0/1   = 42.0   40  +2.0   none
 *   Bomb 🧊🧊        Anthony Davis  52   8/9/4/0/0/3   = 21.8   46  -24.2  biggest ice
 *   Light-ice 🧊     Draymond Green 43   4/6/5/1/1/2   = 20.7   30  -9.3   light
 *   Anchor (floor)  LeBron James   66  33/8/7/1/0/2   = 55.1   53  +2.1   none (no fire, "floor held")
 *   Hero 🔥🔥        Anthony Edwards41  41/7/9/2/1/1   = 72.9   38  +34.9  lone FIRE, clear top
 *   TOTAL = 212.5 → STARTER (mid-band; +7.5 above 205 floor, -12.5 below 225 ALL-STAR). Controlled win.
 *   Floor-vs-hero gap = Edwards 72.9 - LeBron 55.1 = 17.8 → contrast reads on raw FP, not just flame.
 *   AD proj 46 ≫ Draymond proj 30 → AD renders the BIGGER ice. Edwards proj 38 ≪ 72.9 → 🔥🔥 pops.
 *   LeBron proj 53 ≈ 55.1 actual → no flame. Natural boxes (no stuffing).
 *   Game logs are representative real-style box scores [verify box score].
 */

import type { GeneratedCard } from "@shared/types";
import { getPlayers } from "../engines/dataEngine";

type TierColor = "RED" | "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";

interface ScriptCard {
  cardId: string;
  basePlayerId: string;
  name: string;
  team: string;
  position: string;
  tier: TierColor;
  salary: number;
  projectedFp: number;
  actualFp: number;
  date: string;
  opponent: string;
  homeAway: "H" | "A";
  statLine: Record<string, number>;
  achievements?: Array<{ id: string; icon: string; label: string; fp: number }>;
}

function makeCard(o: ScriptCard, slotIndex: number, wasHeld: boolean): GeneratedCard {
  const { achievements = [], ...rest } = o;
  return {
    ...rest,
    id: rest.cardId,
    personKey: rest.basePlayerId,
    season: "2024-25",
    slotIndex,
    fpDelta: rest.actualFp - rest.projectedFp,
    gameInfo: { date: rest.date, opponent: rest.opponent, homeAway: rest.homeAway },
    wasHeld,
    achievements,
  } as unknown as GeneratedCard;
}

// ── The directed holds (guaranteed to survive each round's redraw) ──────────
export const FTUE_DIRECTED_HOLD_IDS = ["ftue-lebron", "ftue-edwards", "ftue-draymond"] as const;

// Card-id → reveal role (drives which FTUE_COPY beat the coach speaks per card).
export const FTUE_CARD_ROLE: Record<string, "anchor" | "hero" | "bomb" | "lightIce" | "normal"> = {
  "ftue-lebron": "anchor",
  "ftue-edwards": "hero",
  "ftue-davis": "bomb",
  "ftue-draymond": "lightIce",
  "ftue-fox": "normal",
};

// ── R1 deal — 5 cards. Coach directs hold of LeBron (star anchor) + Edwards (the trust pick). ──
const R1: ScriptCard[] = [
  // Slot 0 — LeBron James $66 ORANGE — DIRECTED HOLD (star anchor). 33/8/7 modest reliable star
  // line (actual 55.1 ≈ proj 53 → no flame, "the floor held"); clearly below Edwards's hero pop.
  { cardId: "ftue-lebron", basePlayerId: "2544", name: "LeBron James", team: "LAL", position: "SF",
    tier: "ORANGE", salary: 66, projectedFp: 53, actualFp: 55.1,
    date: "2025-02-22", opponent: "DEN", homeAway: "H",
    statLine: { pts: 33, reb: 8, ast: 7, stl: 1, blk: 0, turnovers: 2, min: 36 },
    achievements: [{ id: "BUCKET", icon: "🏀", label: "Bucket", fp: 2 }] },
  // Slot 1 — Anthony Edwards $41 PURPLE — DIRECTED HOLD (the trust pick → 🔥🔥). 41-pt ceiling
  // night, FIRE only, the lone big over (actual 72.9 vs proj 38 → Δ+35) — clear top of the board.
  { cardId: "ftue-edwards", basePlayerId: "1630162", name: "Anthony Edwards", team: "MIN", position: "SG",
    tier: "PURPLE", salary: 41, projectedFp: 38, actualFp: 72.9,
    date: "2025-01-21", opponent: "HOU", homeAway: "H",
    statLine: { pts: 41, reb: 7, ast: 9, stl: 2, blk: 1, turnovers: 1, min: 38 },
    achievements: [{ id: "FIRE", icon: "🔥", label: "Fire", fp: 5 }] },
  // Slots 2-4 — released after R1 (never scored).
  { cardId: "ftue-capela", basePlayerId: "203991", name: "Clint Capela", team: "ATL", position: "C",
    tier: "BLUE", salary: 38, projectedFp: 28, actualFp: 24.0,
    date: "2025-01-15", opponent: "MIL", homeAway: "A",
    statLine: { pts: 8, reb: 11, ast: 0, stl: 0, blk: 1, turnovers: 1, min: 24 } },
  { cardId: "ftue-hield", basePlayerId: "1627741", name: "Buddy Hield", team: "GSW", position: "SG",
    tier: "GREEN", salary: 27, projectedFp: 22, actualFp: 19.5,
    date: "2025-01-18", opponent: "SAC", homeAway: "H",
    statLine: { pts: 14, reb: 3, ast: 2, stl: 1, blk: 0, turnovers: 1, min: 28 } },
  { cardId: "ftue-bertans", basePlayerId: "202722", name: "Davis Bertans", team: "OKC", position: "PF",
    tier: "WHITE", salary: 16, projectedFp: 11, actualFp: 8.4,
    date: "2024-12-30", opponent: "POR", homeAway: "H",
    statLine: { pts: 6, reb: 2, ast: 0, stl: 0, blk: 0, turnovers: 0, min: 17 } },
];

// ── R2 replacements (3) — fill the released slots. Coach directs hold of Draymond. ──
const R2: ScriptCard[] = [
  // Draymond $43 PURPLE — DIRECTED HOLD (3rd trust pick → light 🧊). @ MIA: quiet all-around line.
  { cardId: "ftue-draymond", basePlayerId: "203110", name: "Draymond Green", team: "GSW", position: "PF",
    tier: "PURPLE", salary: 43, projectedFp: 30, actualFp: 20.7,
    date: "2025-03-25", opponent: "MIA", homeAway: "A",
    statLine: { pts: 4, reb: 6, ast: 5, stl: 1, blk: 1, turnovers: 2, min: 23 } },
  { cardId: "ftue-naz", basePlayerId: "1626156", name: "Naz Reid", team: "MIN", position: "C",
    tier: "BLUE", salary: 31, projectedFp: 24, actualFp: 21.0,
    date: "2025-02-10", opponent: "POR", homeAway: "H",
    statLine: { pts: 12, reb: 5, ast: 1, stl: 0, blk: 1, turnovers: 1, min: 23 } },
  { cardId: "ftue-trent", basePlayerId: "1628971", name: "Gary Trent Jr.", team: "MIL", position: "SG",
    tier: "GREEN", salary: 24, projectedFp: 18, actualFp: 15.0,
    date: "2025-02-12", opponent: "CHA", homeAway: "A",
    statLine: { pts: 11, reb: 2, ast: 1, stl: 1, blk: 0, turnovers: 1, min: 26 } },
];

// ── R3 given (2) — no choice. Davis = the 🧊🧊 bomb; Fox = the normal anchor. ──
const R3: ScriptCard[] = [
  // Anthony Davis $52 ORANGE — 🧊🧊 genuine under (mid-tier bomb). 8/9/4, 3 TOs; proj 46 → Δ-24.
  { cardId: "ftue-davis", basePlayerId: "203076", name: "Anthony Davis", team: "DAL", position: "C",
    tier: "ORANGE", salary: 52, projectedFp: 46, actualFp: 21.8,
    date: "2025-03-14", opponent: "GSW", homeAway: "A",
    statLine: { pts: 8, reb: 9, ast: 4, stl: 0, blk: 0, turnovers: 3, min: 31 } },
  // De'Aaron Fox $30 BLUE — normal (≈ expected). 24/5/6, solid floor, no badge (Δ+2).
  { cardId: "ftue-fox", basePlayerId: "1628368", name: "De'Aaron Fox", team: "SAC", position: "PG",
    tier: "BLUE", salary: 30, projectedFp: 40, actualFp: 42.0,
    date: "2025-01-25", opponent: "POR", homeAway: "H",
    statLine: { pts: 24, reb: 5, ast: 6, stl: 2, blk: 0, turnovers: 1, min: 33 } },
];

/** R1 deal — the initial 5. */
export async function dealFtueScriptedRoster(): Promise<{ roster: GeneratedCard[] }> {
  return { roster: R1.map((c, i) => makeCard(c, i, false)) };
}

/**
 * Round-aware scripted redraw. Keeps the DIRECTED holds (LeBron/Edwards after R1,
 * + Draymond after R2) regardless of the user's exact taps, and fills the rest:
 *   round 1 redraw (roundsUsed 1) → R2 replacements in the non-directed slots
 *   round 2 redraw (roundsUsed 2) → R3 given cards in the remaining 2 slots
 * Guarantees the engineered final 5 for the sealed hand.
 */
export async function redrawFtueScriptedRoster(params: {
  currentCards: any[];
  roundsUsed: number;
}): Promise<{ roster: GeneratedCard[] }> {
  const { currentCards, roundsUsed } = params;
  const incoming = roundsUsed <= 1 ? R2 : R3;
  let fill = 0;
  const roster = currentCards.map((card, idx) => {
    const cId = String((card as any).cardId ?? (card as any).id ?? "");
    if ((FTUE_DIRECTED_HOLD_IDS as readonly string[]).includes(cId)) {
      return makeCard(toScript(card), idx, true); // directed hold survives, re-marked held
    }
    const rep = incoming[fill++];
    return rep ? makeCard(rep, idx, false) : card;
  });
  return { roster };
}

/** Final resolve — cards already carry baked actualFp/badges; Edwards is the hero/top. */
export async function resolveFtueScriptedRoster(params: {
  finalCards: any[];
}): Promise<{ roster: GeneratedCard[]; mvpCardId: string }> {
  return { roster: params.finalCards, mvpCardId: "ftue-edwards" };
}

// Re-hydrate a held card (already a GeneratedCard) back into ScriptCard shape for makeCard.
function toScript(card: any): ScriptCard {
  return {
    cardId: card.cardId ?? card.id, basePlayerId: card.basePlayerId ?? card.personKey,
    name: card.name, team: card.team, position: card.position, tier: card.tier,
    salary: card.salary, projectedFp: card.projectedFp, actualFp: card.actualFp,
    date: card.gameInfo?.date ?? card.date, opponent: card.gameInfo?.opponent ?? card.opponent,
    homeAway: card.gameInfo?.homeAway ?? card.homeAway, statLine: card.statLine ?? {},
    achievements: card.achievements ?? [],
  };
}

// ── THE COMMENTARY DECK (verbatim per spec — economy-clean; FINAL, John adjusts at glass) ──
// Keys are role-based (anchor/hero/bomb/lightIce/normal via FTUE_CARD_ROLE) so a future
// recast only touches the strings, not the wiring. Point-values fixed; only names re-synced.
export const FTUE_COPY = {
  // Hold prompts
  holdR1: "Lock in two you trust. LeBron's your franchise guy — you already knew that. And Ant Edwards? $41 and fearless, the kind of flyer that pays off. Tap 'em both, then we replace the rest.",
  holdR2: "One more. Draymond — three-time champ, never shuts up, always involved. Lock him.",
  giveR3: "Last two are on us — Anthony Davis and De'Aaron Fox round out your five. Now let's see what tonight actually gave us.",

  // Per-card reveal beats (reveal order 1→5: normal, bomb, lightIce, anchor, hero)
  revealNormal: "De'Aaron Fox, $30, did exactly what $30 should — 24 and 6, no fireworks, no faceplant. That's your floor. Solid.",
  revealBomb: "Oof. Anthony Davis is a $52 stud most nights — tonight? 8 and 9, turned it over three times. 🧊 That's the game: you pay for the average, but you play one night. Even the studs no-show.",
  revealLightIce: "Draymond did Draymond things — a little of everything, not a lot of anything. 🧊 Loud guy, quiet box score. He won't sink you, but he won't carry you either.",
  revealAnchor: "There's the franchise. LeBron drops 33, fills the sheet — exactly what a $66 star is supposed to do. No fireworks needed. He's your floor, and the floor held.",
  revealHero: "And THIS is why you play. Anthony Edwards — your $41 flyer — went for FORTY-ONE. 🔥🔥 Career kind of night. Your star delivered AND your flyer hit the ceiling — THAT'S a team. The cap makes you find both.",

  // Result sequence (after tier slam; {total}/{tier} filled at runtime)
  resultWin: "{total} FP. {tier} — and you're sitting pretty above the line. First hand, clean win. 🏀",
  resultBaseline: "Every player has a baseline from their season average — tonight, some swung above it, some below. That swing is the game.",
  resultThesis: "Salary tells you what's LIKELY — never what's certain. A winning hand needs your stars to deliver AND your value picks to surprise. That's why the total works — not one steal, the whole squad under the cap.",
  resultHandoff: "That's a real number to beat. Now you're off the training wheels — same deal, live slate, your calls. Go cook.",
} as const;

// ── THE OPENING CEREMONY (pre-deal wall) ────────────────────────────────────
// Five REAL 2025-26 All-NBA First-Team cards, pulled by basePlayerId from the
// loaded 2526 pool (season pinned by DailySeasonReelGate). Shown face-up before
// the scripted deal, then flipped to backs L→R as the deal's payoff. The cards
// carry no game outcome (actualFp 0) — this is the "here's what a dream team
// looks like" teaching wall, not a played hand. Order is L→R wall order.
//
// Verbatim ceremony line (John's copy — wired, not edited):
export const FTUE_CEREMONY_LINE =
  "250 dollar budget to assemble your own dream team, the higher the projected fantasy points(fp) the more expensive player. Show em how its done.";

// L→R: SGA, Jokić, Wembanyama, Luka Dončić, Cade Cunningham (2025-26 First Team).
const FTUE_CEREMONY_IDS = ["1628983", "203999", "1641705", "1629029", "1630595"] as const;

/** Build the five real 2526 ceremony cards from the loaded pool. Returns [] if
 *  the pool isn't loaded yet OR any of the five is missing — GameView then skips
 *  the ceremony rather than render a broken/partial wall (STOP-safe). */
export function ceremonyFtueRoster(): GeneratedCard[] {
  let players: any[] = [];
  try { players = getPlayers(); } catch { return []; } // pool not loaded → no ceremony
  const byId = new Map(players.map((p: any) => [String(p.basePlayerId), p]));
  const out: GeneratedCard[] = [];
  FTUE_CEREMONY_IDS.forEach((bid, i) => {
    const p = byId.get(bid);
    if (!p) return;
    out.push({
      id: `${bid}_${p.season}`,
      basePlayerId: bid,
      personKey: bid,
      cardId: `ftue-ceremony-${bid}`,
      name: p.name,
      team: p.team,
      season: p.season,
      position: p.position,
      photoCode: p.photoCode ?? bid,
      salary: Number(p.salary),
      tier: p.tier,
      slotIndex: i,
      projectedFp: Number(p.projectedFp ?? p.avgFP ?? 0),
      actualFp: 0,
      fpDelta: 0,
      statLine: {},
      gameInfo: { date: "", opponent: "", homeAway: "" },
      achievements: [],
      wasHeld: false,
    } as unknown as GeneratedCard);
  });
  // All-or-nothing: a partial wall is a bug, not a fallback.
  return out.length === FTUE_CEREMONY_IDS.length ? out : [];
}
