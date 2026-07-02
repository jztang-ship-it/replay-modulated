/**
 * ftueScriptedHand.ts — Basketball FTUE: the sealed scripted first hand.
 *
 * Per docs/ftue-scripted-hand-spec.md. A single canned hand, identical for all
 * first-run users, walled off from the live slate. Resolves CLIENT-SIDE (no
 * server mirror) — actualFp/badges are baked here to the LIVE engine + computeBadges.
 *
 * RAIL (5-card / 3-round):
 *   R1: deal 5 → coach directs "lock in 2 you trust" (Giannis + Edwards) → replace the 3 unheld
 *   R2: deal 3 replacements → "lock in 1 more" (Draymond) → replace the 2 unheld
 *   R3: give the final 2 (Tobias + Zion), no choice → reveal
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
 *   normal(R3) Tobias    36  03-07 vs BKN  18/10/0/1/0/3 →  34.0      24.8  1.37   — (no fire)
 *   bomb(R3)   Zion      49  12-18 vs HOU   9/3/5/0/1/2  →  20.1      33.6  0.60   🧊🧊
 *   hero       Edwards   61  11-24 vs SAC   43/7/4/3/1/3  →  69.4      41.8  1.66   🔥🔥 👀
 *   anchor     Giannis   69  11-03 vs IND  33/13/5/2/0/3 →  64.1      47.5  1.35   🏀🧲✌️ (no fire)
 *   TOTAL = 206.3 → STARTER (205-224); +1.3 over floor. Cheap-fire killed: only Edwards
 *   carries a stamp. Salary sum $249 (≤ $250).
 *   Reveal = salary-ascending (engine natural): Draymond 34 → Tobias 36 → Zion 49
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
// one at a time), R2 lights Draymond. R3 gives Tobias + Zion (no hold).
export const FTUE_DIRECTED_HOLD_IDS = ["ftue-giannis", "ftue-edwards", "ftue-draymond"] as const;

// Card-id → reveal role (drives which FTUE_COPY beat the coach speaks per card).
export const FTUE_CARD_ROLE: Record<string, "anchor" | "hero" | "bomb" | "lightIce" | "normal"> = {
  "ftue-giannis": "anchor",
  "ftue-edwards": "hero",
  "ftue-zion": "bomb",
  "ftue-draymond": "lightIce",
  "ftue-tobias": "normal",
};

// ── The reveal-beat walk (feat/ftue-scripted-hand Pass A) ────────────────────
// The EXPERIENCED order the user taps through at REVEALING (NOT the engine's
// salary-ascending reveal order). The two GIVEN cards (Tobias, Zion) lead; the
// three HELD cards (Draymond, Edwards, Giannis) follow, Giannis last as the
// STARTER-win climax. GameView's tap-advance walk reveals one card per beat in
// this order — each card's FP + fire/ice rolls up ON its beat (walk-drives-the-
// reveal), the gauge accrues across the walk, and the anchor (Giannis) fires the
// spring/STARTER stamp on the final beat. Draymond/Edwards/Giannis are held
// (face-up); their per-beat rollup is gated via useEmotionalReveal's
// onBeforeEachHeld seam.
export const FTUE_WALK_ORDER = [
  "ftue-tobias",   // beat 1 — given, normal (34.0, no flame)
  "ftue-zion",     // beat 2 — given, 🧊🧊 bomb (20.1)
  "ftue-draymond", // beat 3 — held, 🧊 light-ice (18.7)
  "ftue-edwards",  // beat 4 — held, 🔥🔥 hero (69.4)
  "ftue-giannis",  // beat 5 — held anchor, STARTER climax (64.1 → total 206.3)
] as const;

// ── R1 deal — 5 cards. Coach directs hold of Giannis (anchor) + Edwards (hero). ──
// projectedFp = real 2526 avgFP baseline. actualFp + badges are engine-derived
// from statLine (trueScriptLine) — never hand-entered here.
const R1: ScriptCard[] = [
  // Slot 0 — Giannis $69 ORANGE — DIRECTED HOLD (anchor, reveals LAST). Warmed 33/13/5, no fire:
  // → 🏀Bucket 🧲Glass ✌️DD = 64.1 (base 57.1 +7), ratio 64.1/47.5 = 1.35 (no stamp). Bigger anchor
  // night via boards, no scoring flame — "your expensive anchor delivered even bigger".
  { cardId: "ftue-giannis", basePlayerId: "203507", name: "Giannis Antetokounmpo", team: "MIL", position: "SF",
    tier: "ORANGE", salary: 69, projectedFp: 47.5,
    date: "2025-11-03", opponent: "IND", homeAway: "A",
    statLine: { pts: 33, reb: 13, ast: 5, stl: 2, blk: 0, turnovers: 3, min: 32 } },
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
  { cardId: "ftue-hjones", basePlayerId: "1630529", name: "Herbert Jones", team: "NOP", position: "SF",
    tier: "GREEN", salary: 29, projectedFp: 19.9,
    date: "2025-10-22", opponent: "MEM", homeAway: "A",
    statLine: { pts: 17, reb: 9, ast: 3, stl: 3, blk: 1, turnovers: 2, min: 36 } },
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

// ── R3 given (2) — no choice. Tobias = the normal (filler); Zion = the 🧊🧊 bomb. ──
const R3: ScriptCard[] = [
  // Tobias Harris $36 BLUE — normal (calm filler, NO stamp). 18/10, 🧲Glass ✌️DD = 34.0
  // (base 29 +5), ratio 34.0/24.8 = 1.37 (< 1.4 → no flame). Unremarkable double-double.
  { cardId: "ftue-tobias", basePlayerId: "202699", name: "Tobias Harris", team: "DET", position: "SF",
    tier: "BLUE", salary: 36, projectedFp: 24.8,
    date: "2026-03-07", opponent: "BKN", homeAway: "H",
    statLine: { pts: 18, reb: 10, ast: 0, stl: 1, blk: 0, turnovers: 3, min: 34 } },
  // Zion Williamson $49 PURPLE — 🧊🧊 bomb (the overpaid star who vanished). 9/3/5 = 20.1 (no badge),
  // ratio 20.1/33.6 = 0.60 → FREEZING. Given in R3 — not the player's fault.
  { cardId: "ftue-zion", basePlayerId: "1629627", name: "Zion Williamson", team: "NOP", position: "SF",
    tier: "PURPLE", salary: 49, projectedFp: 33.6,
    date: "2025-12-18", opponent: "HOU", homeAway: "H",
    statLine: { pts: 9, reb: 3, ast: 5, stl: 0, blk: 1, turnovers: 2, min: 21 } },
];

/** R1 deal — the initial 5. */
export async function dealFtueScriptedRoster(): Promise<{ roster: GeneratedCard[] }> {
  return { roster: R1.map((c, i) => makeCard(c, i, false)) };
}

/**
 * Round-aware scripted redraw. Keeps the DIRECTED holds (Giannis/Edwards after R1,
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
// Stage-4 (Pass A) — John's authored slots, wired verbatim. Keys are STABLE
// (role-based + walk beats); John does a final wording pass against the live
// flow. The result-sequence keys (resultWin/…/Handoff) are PARKED placeholders
// for Pass A — the Giannis beat carries the STARTER-win finale, so GameView
// suppresses the result-sequence override (no placeholder junk on glass).
export const FTUE_COPY = {
  // Hold prompts (R1 spotlights Giannis+Edwards; R2 spotlights Draymond)
  holdR1: "You get three rounds, Greek beast and Ant are no brainers, tap them to hold but know that holding them takes more than half of your cap.",
  holdR2: "With your remaining cap, Draymond is a good bet to give you the best return, tap him to hold and your two remaining spots will be randomly assigned to you.",

  // R3-entry (REVEALING beat 0 — the two given cards still face-down)
  revealIntro: "tap to reveal or hit GAME TIME to see who your last two cards are.",

  // ── Pass B — the historical-flip finale (RESULTS, after the Giannis slam) ──
  // Ant's card back is a NORMAL flipped-card back (real box score / stat tiles) —
  // the box score IS the proof the beat teaches; the sentence is commentary, not
  // card content. BOTH lines route through the standard commentary channel.
  // historyPrompt: before the flip. historyDone: after — the historical sentence
  // lives here (John's copy; pts/date are Edwards's pinned 2526 log, fixed for the
  // sealed hand; "Sactown" is authored — the raw log is "SAC"). John polishes wording.
  historyPrompt: "tap Ant to see the game that he pulled",
  historyDone: "43 points against Sactown on Nov 24, 2025. Now that you've gotten the hang of it, lets run it back for reals now.",

  // Post-FTUE welcome — the first NORMAL-game entry commentary, shown ONCE after
  // the exit reel lands on IDLE (John's copy, verbatim). Paragraphs are "\n\n"-
  // separated; GameView splits them into tap-advance parts (the 96px commentary
  // slot can't show all at once). Shown once via the shared pregame-intro flag →
  // never on later normal entries; returning users get the standard welcome.
  postFtueWelcome: [
    "Welcome to the 2025-26 season.",
    "Build a 5-player lineup under a $250 cap — then watch real game logs from this season decide how your basketball instincts hold up.",
    "Stars matter — but value wins games when it shows up at the right time.",
    "Everyone gets the same players. Not everyone sees the same game.",
    "Tap the i for scoring rules, then hit DEAL to draft your first lineup.",
  ].join("\n\n"),

  // Per-card reveal beats — spoken as each card lights on its walk beat.
  // Keyed by role via FTUE_CARD_ROLE: revealNormal=Tobias, revealBomb=Zion,
  // revealLightIce=Draymond, revealHero=Edwards, revealAnchor=Giannis.
  revealNormal: "Tobias, the steady veteran with 34 fp, not to mention two badges that give you bonus fp.",
  revealBomb: "Yikes! Zion really bombed with that score, he was ICE COLD, definitely not what you'd expect from a star player.",
  revealLightIce: "Too much trash talk from Dray, if only his game was as loud, lets see if your big guns can save your squad.",
  revealHero: "ANTMAN to the rescue! That fire tells you he vastly outperformed his value, Lets call him Super Ant from now on.",
  revealAnchor: "Giannis did what super stars do, A normal monster game. Your team scored a STARTER win — and ALL-STAR is right there on the board to chase next time.",

  // Result sequence — PARKED for Pass A (Giannis beat is the finale). Retained
  // as stable keys for a later result-copy pass; not rendered by the walk.
  giveR3: "[R3 given — parked; the reveal walk names the given cards on their beats]",
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
