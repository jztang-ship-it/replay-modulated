/**
 * shared/components/CoachLayer.tsx
 *
 * Type/config residual kept for baseball/football until the cross-sport
 * new-format pass; component body removed in the FTUE kill
 * (feat/kill-ftue-real-game).
 *
 * The scripted FTUE coach overlay + state machine that used to live here is
 * GONE — FTUE is removed and every user drops into the real game on hand 1.
 * What remains is ONLY the sport-config type + the basketball default config,
 * because these are still imported by off-limits sport code:
 *   - baseball/src/views/GameView.tsx        → `import type { FTUETextConfig }`
 *   - football/src/adapters/ftueRoster.ts    → `import type { FTUETextConfig }`
 *   - shared/views/GameAdapter.ts            → `ftueTextConfig: FTUETextConfig` (inert)
 *   - basketball/src/views/GameView.tsx      → `BASKETBALL_FTUE_CONFIG`
 * They are inert (nothing renders coach UI anymore) and retire together in the
 * cross-sport new-format pass. See the DEFERRED RESIDUALS catalog.
 */
import { type ReactNode } from "react";

/** Sport-specific text + card config for FTUE. INERT residual — no longer
 *  drives any rendered coach UI; consumed only as a structural type by the
 *  sport adapters until the cross-sport pass retires it. */
export interface FTUETextConfig {
  anchorCardId: string;
  rosterCount: number;
  salaryCap: number;
  sportLabel: string;
  cardPositions: Record<string, "above" | "below">;
  cardTexts: Record<string, string>;
  anchorRevealText: string;
  idleText: ReactNode;
  holdIntroText: string;
  holdAnchorText: ReactNode;
  nearMissText: string;
  anchorFlipHintText: string;
  anchorStatText: string;
  finalText: ReactNode;
  anchorIntroText?: ReactNode;
}

// ── Inline chips referenced only by the basketball default copy below ───────
function DrawChip() {
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px",
      background: "linear-gradient(135deg,#7FFF00,#5BBE00)",
      color: "#070A12", borderRadius: 4, fontWeight: 900, fontSize: 11,
      letterSpacing: ".10em", textTransform: "uppercase",
      verticalAlign: "middle", lineHeight: 1.2,
    }}>DRAW</span>
  );
}
function DealChip() {
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px",
      background: "#3AA0FF",
      color: "#000000", borderRadius: 10, fontWeight: 900, fontSize: 11,
      letterSpacing: ".10em", textTransform: "uppercase",
      verticalAlign: "middle", lineHeight: 1.2,
    }}>DEAL</span>
  );
}
function ReplayChip() {
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px",
      background: "#3AA0FF",
      color: "#FFFFFF", borderRadius: 10, fontWeight: 900, fontSize: 11,
      letterSpacing: ".10em", textTransform: "uppercase",
      verticalAlign: "middle", lineHeight: 1.2,
    }}>REPLAY</span>
  );
}

// Row 1 (slots 0-2): message below card. Row 2 (slots 3-5): message above card.
const DEFAULT_CARD_POSITION: Record<string, "above" | "below"> = {
  "ftue-tatum": "below",
  "ftue-curry": "below",
  "ftue-og": "below",
  "ftue-draymond": "above",
  "ftue-lowry": "above",
  "ftue-reddish": "above",
};

const DEFAULT_CARD_TEXTS: Record<string, string> = {
  "ftue-curry": "Chef Curry was cooking something hot. 26 pts, 10 asts and two badges got you 52 FP. 🔥",
  "ftue-og": "OG earned his Pickpocket badge — 3 steals plus 2 blocks. Elite two-way wing doing it on both ends. 39.6 FP on a $46 card. 👀",
  "ftue-draymond": "Yikes! Single digits from a $43 blue card. Draymond is one of the loudest voices in the game, but his stats sure were quiet tonight. 🧊",
  "ftue-lowry": "Kyle Lowry with the Pure badge — 5 assists, zero turnovers. 18.9 FP from a $20 card. Clean and efficient. 🎯",
  "ftue-reddish": "Kevin Love with only 4 pts and 5 boards against Minnesota — 12 FP. That's what the frost means, he definitely didn't help your team. 🧊",
};

/** Basketball default FTUE copy. INERT residual (kept because basketball's
 *  wrapper still imports it for the adapter's ftueTextConfig contract member). */
export const BASKETBALL_FTUE_CONFIG: FTUETextConfig = {
  anchorCardId: "ftue-tatum",
  rosterCount: 6,
  salaryCap: 250,
  sportLabel: "basketball",
  cardPositions: DEFAULT_CARD_POSITION,
  cardTexts: DEFAULT_CARD_TEXTS,
  anchorRevealText: "Tatum was the man tonight.",
  idleText: <span>Real stats. Real history. Your fantasy result instantly. Hit <DealChip /> to get started.</span>,
  holdIntroText: "Six players. $250 cap. Card colors mark tier — red/orange picks cost more but score more. Fantasy points come from real stats — pts, rbs, asts. Who do we keep?",
  holdAnchorText: <span>Tatum is your $66 anchor and your most dependable player. Tap him to hold, then hit <DrawChip /> and tap each card to see your replacements.</span>,
  nearMissText: "So close it hurts, 1 FP away from the ALL-STAR level 3x win. Dray was the weaklink tonight, one more rebound or assist would have pushed us over.",
  anchorFlipHintText: "Tatum on the other hand wore his super man cape, 92 FP(!) is nothing short of extraordinary. Flip his card to see what happened.",
  anchorStatText: "A 43pt, 15 rb, triple double against Chicago on the 21st of Dec in 2024, what's most important is he unlocked 6 badges for an extra 20 FP bonus. Bonuses = winning.",
  finalText: <span>Every game log is drawn from real moments in history—relive the journey of basketball at your fingertips. Hit <ReplayChip /> to begin.</span>,
};
