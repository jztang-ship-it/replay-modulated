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
 * Stage-3 re-cast onto REAL 2025-26 game-logs (2026-07-01). Every cast line is a
 * real 2526 box score pinned by player + date; FP + badges are NOT hand-entered —
 * makeCard trues each line through the LIVE engine (computeBasketballFp +
 * computeBasketballBadges) at build time. projectedFp = that player's real 2526
 * avgFP baseline (the fire/ice denominator). Season tag = "2526" (real, not the
 * old synthetic "2024-25").
 *
 *   weights pts1.0 reb1.2 ast1.5 stl2.0 blk2.0 to-1.0 ; tiers ROOKIE190/STARTER205/ALLSTAR225
 *   ROLE       PLAYER    $   date/opp        line            engine FP  base  ratio  stamp
 *   lightIce   Draymond  34  01-20 vs TOR    6/6/5/0/0/2  →  18.7      23.7  0.79   🧊
 *   normal(R3) LeBron    57  11-25 vs LAC   25/6/6/1/1/3  →  42.2      39.6  1.07   —
 *   bomb(R3)   Murray    60  03-14 vs LAL    5/6/6/2/0/2  →  23.2      41.6  0.56   🧊🧊
 *   hero       Edwards   61  11-24 vs SAC   43/7/4/3/1/3  →  69.4      41.8  1.66   🔥🔥 👀
 *   anchor     Giannis   69  01-02 vs CHA   30/10/5/1/0/3 →  55.5      47.5  1.17   🏀🧲✌️ (no fire)
 *   TOTAL = 209.0 → STARTER (205-224); +4.0 over floor, 16 under ALL-STAR. Clean win.
 *   Reveal = salary-ascending (engine natural): Draymond 34 → LeBron 57 → Murray 60
 *            → Edwards 61 → Giannis 69 LAST. No custom reveal wiring.
 */

import type { GeneratedCard } from "@shared/types";
import { getPlayers } from "../engines/dataEngine";
import { computeBasketballFp } from "./fantasyPoints";
import { computeBasketballBadges } from "./badges";
import { BasketballSportConfig } from "./basketballConfig";

const FTUE_WEIGHTS = (BasketballSportConfig as any).projectionWeights;
const FTUE_BADGES = (BasketballSportConfig as any).badges;

/** True a real stat line through the LIVE engine — the ONLY source of the FTUE
 *  hand's FP + badges (no hand-entered numbers). */
function trueScriptLine(statLine: Record<string, number>): {
  actualFp: number;
  achievements: Array<{ id: string; icon: string; label: string; fp: number }>;
} {
  const achievements = computeBasketballBadges(statLine, FTUE_BADGES) as any;
  const badgeFp = achievements.reduce((a: number, b: any) => a + (b.fp ?? 0), 0);
  const fp = computeBasketballFp(statLine, FTUE_WEIGHTS) + badgeFp;
  return { actualFp: Math.round(fp * 10) / 10, achievements };
}

type TierColor = "RED" | "ORANGE" | "PURPLE" | "BLUE" | "GREEN" | "WHITE";

interface ScriptCard {
  cardId: string;
  basePlayerId: string;
  name: string;
  team: string;
  position: string;
  tier: TierColor;
  salary: number;
  /** Real 2526 avgFP baseline — the fire/ice denominator (actualFp / projectedFp). */
  projectedFp: number;
  date: string;
  opponent: string;
  homeAway: "H" | "A";
  /** Real 2526 box score. actualFp + badges are DERIVED from this by the engine. */
  statLine: Record<string, number>;
}

function makeCard(o: ScriptCard, slotIndex: number, wasHeld: boolean): GeneratedCard {
  const { actualFp, achievements } = trueScriptLine(o.statLine);
  return {
    ...o,
    id: o.cardId,
    personKey: o.basePlayerId,
    season: "2526",
    slotIndex,
    actualFp,
    projectedFp: o.projectedFp,
    fpDelta: Math.round((actualFp - o.projectedFp) * 10) / 10,
    gameInfo: { date: o.date, opponent: o.opponent, homeAway: o.homeAway },
    wasHeld,
    achievements,
  } as unknown as GeneratedCard;
}

// ── The directed holds (guaranteed to survive each round's redraw) ──────────
// Order = spotlight order: R1 lights Giannis then Edwards ("lock in 2 you trust",
// one at a time), R2 lights Draymond. R3 gives LeBron + Murray (no hold).
export const FTUE_DIRECTED_HOLD_IDS = ["ftue-giannis", "ftue-edwards", "ftue-draymond"] as const;

// Card-id → reveal role (drives which FTUE_COPY beat the coach speaks per card).
export const FTUE_CARD_ROLE: Record<string, "anchor" | "hero" | "bomb" | "lightIce" | "normal"> = {
  "ftue-giannis": "anchor",
  "ftue-edwards": "hero",
  "ftue-murray": "bomb",
  "ftue-draymond": "lightIce",
  "ftue-lebron": "normal",
};

// ── R1 deal — 5 cards. Coach directs hold of Giannis (anchor) + Edwards (hero). ──
// projectedFp = real 2526 avgFP baseline. actualFp + badges are engine-derived
// from statLine (trueScriptLine) — never hand-entered here.
const R1: ScriptCard[] = [
  // Slot 0 — Giannis $69 ORANGE — DIRECTED HOLD (anchor, reveals LAST). 30/10/5, no fire:
  // → 🏀Bucket 🧲Glass ✌️DD = 55.5 (base 48.5 +7), ratio 55.5/47.5 = 1.17. Delivers, no flame.
  { cardId: "ftue-giannis", basePlayerId: "203507", name: "Giannis Antetokounmpo", team: "MIL", position: "SF",
    tier: "ORANGE", salary: 69, projectedFp: 47.5,
    date: "2026-01-02", opponent: "CHA", homeAway: "H",
    statLine: { pts: 30, reb: 10, ast: 5, stl: 1, blk: 0, turnovers: 3, min: 30 } },
  // Slot 1 — Edwards $61 ORANGE — DIRECTED HOLD (hero → 🔥🔥). 43-pt ceiling: 🔥Fire 👀Pickpocket
  // = 69.4 (base 62.4 +7), ratio 69.4/41.8 = 1.66 → SMOKING HOT. The trusted star paid off big.
  { cardId: "ftue-edwards", basePlayerId: "1630162", name: "Anthony Edwards", team: "MIN", position: "PG",
    tier: "ORANGE", salary: 61, projectedFp: 41.8,
    date: "2025-11-24", opponent: "SAC", homeAway: "A",
    statLine: { pts: 43, reb: 7, ast: 4, stl: 3, blk: 1, turnovers: 3, min: 40 } },
  // Slots 2-4 — real 2526 decoys, released after R1 (never scored; statLine is cosmetic).
  { cardId: "ftue-podziemski", basePlayerId: "1641764", name: "Brandin Podziemski", team: "GSW", position: "PG",
    tier: "BLUE", salary: 38, projectedFp: 26.4,
    date: "2025-10-21", opponent: "LAL", homeAway: "A",
    statLine: { pts: 7, reb: 7, ast: 2, stl: 1, blk: 0, turnovers: 1, min: 33 } },
  { cardId: "ftue-santos", basePlayerId: "1630611", name: "Gui Santos", team: "GSW", position: "SF",
    tier: "GREEN", salary: 27, projectedFp: 18.3,
    date: "2025-11-19", opponent: "MIA", homeAway: "A",
    statLine: { pts: 4, reb: 6, ast: 0, stl: 0, blk: 1, turnovers: 2, min: 18 } },
  { cardId: "ftue-powell", basePlayerId: "203939", name: "Dwight Powell", team: "DAL", position: "PF",
    tier: "WHITE", salary: 16, projectedFp: 11.1,
    date: "2025-10-29", opponent: "IND", homeAway: "H",
    statLine: { pts: 18, reb: 6, ast: 0, stl: 1, blk: 2, turnovers: 1, min: 29 } },
];

// ── R2 replacements (3) — fill the released slots. Coach directs hold of Draymond. ──
const R2: ScriptCard[] = [
  // Draymond $34 BLUE — DIRECTED HOLD (light 🧊). Quiet: 6/6/5 = 18.7 (no badge),
  // ratio 18.7/23.7 = 0.79 → ICE COLD. Won't sink you, won't carry you.
  { cardId: "ftue-draymond", basePlayerId: "203110", name: "Draymond Green", team: "GSW", position: "SF",
    tier: "BLUE", salary: 34, projectedFp: 23.7,
    date: "2026-01-20", opponent: "TOR", homeAway: "H",
    statLine: { pts: 6, reb: 6, ast: 5, stl: 0, blk: 0, turnovers: 2, min: 22 } },
  // real 2526 decoys, released after R2 (never scored).
  { cardId: "ftue-oneale", basePlayerId: "1626220", name: "Royce O'Neale", team: "PHX", position: "SF",
    tier: "BLUE", salary: 31, projectedFp: 21.2,
    date: "2025-10-22", opponent: "SAC", homeAway: "H",
    statLine: { pts: 12, reb: 5, ast: 2, stl: 1, blk: 0, turnovers: 1, min: 29 } },
  { cardId: "ftue-dort", basePlayerId: "1629652", name: "Luguentz Dort", team: "OKC", position: "PG",
    tier: "GREEN", salary: 24, projectedFp: 16.3,
    date: "2025-10-21", opponent: "HOU", homeAway: "H",
    statLine: { pts: 6, reb: 6, ast: 5, stl: 1, blk: 0, turnovers: 1, min: 45 } },
];

// ── R3 given (2) — no choice. Murray = the 🧊🧊 bomb; LeBron = the normal. ──
const R3: ScriptCard[] = [
  // LeBron $57 PURPLE — normal (≈ baseline). 25/6/6, no badge = 42.2, ratio 42.2/39.6 = 1.07.
  { cardId: "ftue-lebron", basePlayerId: "2544", name: "LeBron James", team: "LAL", position: "SF",
    tier: "PURPLE", salary: 57, projectedFp: 39.6,
    date: "2025-11-25", opponent: "LAC", homeAway: "H",
    statLine: { pts: 25, reb: 6, ast: 6, stl: 1, blk: 1, turnovers: 3, min: 32 } },
  // Jamal Murray $60 ORANGE — 🧊🧊 bomb (the overpaid star who vanished). 5/6/6 = 23.2 (no badge),
  // ratio 23.2/41.6 = 0.56 → FREEZING. Given in R3 — not the player's fault.
  { cardId: "ftue-murray", basePlayerId: "1627750", name: "Jamal Murray", team: "DEN", position: "PG",
    tier: "ORANGE", salary: 60, projectedFp: 41.6,
    date: "2026-03-14", opponent: "LAL", homeAway: "A",
    statLine: { pts: 5, reb: 6, ast: 6, stl: 2, blk: 0, turnovers: 2, min: 36 } },
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

/** Final resolve — each card's actualFp/badges were engine-trued in makeCard from
 *  its real 2526 line; Edwards (69.4) is the hero/top → MVP. */
export async function resolveFtueScriptedRoster(params: {
  finalCards: any[];
}): Promise<{ roster: GeneratedCard[]; mvpCardId: string }> {
  return { roster: params.finalCards, mvpCardId: "ftue-edwards" };
}

// Re-hydrate a held card (already a GeneratedCard) back into ScriptCard shape for makeCard.
// actualFp/achievements are NOT preserved — makeCard re-trues them from statLine.
function toScript(card: any): ScriptCard {
  return {
    cardId: card.cardId ?? card.id, basePlayerId: card.basePlayerId ?? card.personKey,
    name: card.name, team: card.team, position: card.position, tier: card.tier,
    salary: card.salary, projectedFp: card.projectedFp,
    date: card.gameInfo?.date ?? card.date, opponent: card.gameInfo?.opponent ?? card.opponent,
    homeAway: card.gameInfo?.homeAway ?? card.homeAway, statLine: card.statLine ?? {},
  };
}

// ── THE COMMENTARY DECK — PLACEHOLDER ONLY (Stage-3). ────────────────────────
// John writes every final beat in a dedicated copy pass AFTER structure glasses.
// These are role/slot-tagged placeholders so the FTUE renders the beat slots
// without leaking wrong wording. Keys are stable (role-based via FTUE_CARD_ROLE);
// only the strings change in the copy pass. {total}/{tier} are runtime tokens.
export const FTUE_COPY = {
  // Hold prompts
  holdR1: "[R1 hold — lock the two stars: Giannis (anchor) + Edwards (hero)]",
  holdR2: "[R2 hold — lock one more: Draymond (light-ice)]",
  giveR3: "[R3 given — the last two are on us: LeBron + Murray]",

  // Per-card reveal beats (reveal order salary-asc: Draymond, LeBron, Murray, Edwards, Giannis)
  revealLightIce: "[reveal — light-ice: Draymond, quiet 🧊 below baseline]",
  revealNormal: "[reveal — normal: LeBron, ~baseline, no flame]",
  revealBomb: "[reveal — bomb: Murray, the vanished star 🧊🧊]",
  revealHero: "[reveal — hero: Edwards, the trusted star pays off big 🔥🔥]",
  revealAnchor: "[reveal — anchor: Giannis LAST, delivers without a flame]",

  // Result sequence (after tier slam; {total}/{tier} filled at runtime)
  resultWin: "[result — {total} FP, {tier}: clean first-hand win]",
  resultBaseline: "[result — baseline: each player swings above/below their season average]",
  resultThesis: "[result — thesis: salary is likely-not-certain; the whole squad under the cap]",
  resultHandoff: "[result — handoff: off the training wheels, live slate next]",
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
