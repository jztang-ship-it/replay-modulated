/**
 * basketball/src/dev/WinClauseDemoRoute.tsx — DEV ONLY.
 *
 * Deterministic seeded hands that fire the RD8 rivalry clause, rendered on the
 * real H2HResultsOverlay so the composed line can be glassed on device (the only
 * verdict). Shows the CURRENT (corrected) composition: flavor tail suppressed
 * when the clause fires, smooth/beat punctuation on the named loss clause.
 *
 * Routes (gated DEV-only in App.tsx):
 *   /basketball/dev/win-clause             → WIN (coincident pronoun)
 *   /basketball/dev/win-clause?case=loss-a → LOSS, smooth named clause ("— you let him go.")
 *   /basketball/dev/win-clause?case=loss-b → LOSS, hard-beat named clause (". You let him go.")
 */
import { useMemo, useRef } from "react";
import { H2HResultsOverlay, type ResultsOverlayState } from "@shared/components/H2HResultsOverlay";
import type { H2HCard, H2HHand, CardRenderer } from "@shared/components/H2HRevealScreen";
import { explainH2HResult } from "@shared/explanation/explainH2HResult";
import { registerPoolStatsProvider } from "@shared/explanation/poolStatsProvider";
import { AthleteCard } from "../components/AthleteCard";
import type { PlayerCard } from "../adapters/types";

const ps = (p50: number, max: number) =>
  ({ n: 50, mean: p50, p10: Math.max(0, p50 - 12), p50, p90: (p50 + max) / 2, min: 0, max });
// Real NBA ids so the stars show real faces; everyone else gets a modest pool.
const JOKIC = "203999", BOOKER = "1626164", CURRY = "201939";
const DEMO_POOL: Record<string, ReturnType<typeof ps>> = {
  [JOKIC]: ps(45, 120), [BOOKER]: ps(50, 70), [CURRY]: ps(35, 80),
};

const card = (o: {
  bp: string; name: string; s: number; fp: number; h?: boolean; tier?: string; sal?: number; pos?: string;
}): H2HCard => ({
  id: o.bp, basePlayerId: o.bp, personKey: o.bp, cardId: `${o.bp}_c`,
  name: o.name, team: "X", season: "2425", position: o.pos ?? "G",
  photoCode: null, salary: o.sal ?? 30, tier: (o.tier ?? "BLUE") as H2HCard["tier"],
  projectedFp: 30, slotIndex: o.s, wasHeld: !!o.h, actualFp: o.fp, fpDelta: 0,
  gameInfo: { date: "2025-01-15", opponent: "LAL", homeAway: "home" },
  statLine: { pts: o.fp, reb: 12, ast: 9, stl: 1, blk: 1, turnovers: 2, mp: 38 },
  achievements: [],
});

// WIN — you held Jokić (went off → A1), Jon faded him. Coincident → pronoun clause.
const WIN = {
  recipient: { handId: "you", totalFp: 180, tier: "MVP", displayName: "YOU",
    cards: [card({ bp: JOKIC, name: "Nikola Jokić", tier: "RED", sal: 90, h: true, fp: 110, s: 5, pos: "C" }),
      ...[0, 1, 2, 3, 4].map((i) => card({ bp: `y${i}`, name: `Your Pick ${i + 1}`, fp: 14, s: i, h: i >= 3 }))] } as H2HHand,
  sender: { handId: "jon", totalFp: 90, tier: "STARTER", displayName: "Jon",
    cards: [0, 1, 2, 3, 4, 5].map((i) => card({ bp: `j${i}`, name: `Jon Pick ${i + 1}`, fp: 12 + i, s: i, h: i >= 3 })) } as H2HHand,
  deal: [card({ bp: JOKIC, name: "Nikola Jokić", tier: "RED", s: 5, fp: 110, pos: "C" }),
    ...[0, 1, 2, 3, 4].map((i) => card({ bp: `d${i}`, name: `Dealt ${i + 1}`, fp: 14, s: i }))],
  state: "WIN" as ResultsOverlayState,
};

// LOSS — you held Booker (busted → A2); Jon held Curry (you faded), who beat you.
// Non-coincident named clause → punctuation choice (smooth vs beat).
const LOSS = {
  recipient: { handId: "you", totalFp: 100, tier: "ROOKIE", displayName: "YOU",
    cards: [card({ bp: BOOKER, name: "Devin Booker", tier: "ORANGE", sal: 62, h: true, fp: 8, s: 0, pos: "G" }),
      ...[1, 2, 3, 4, 5].map((i) => card({ bp: `y${i}`, name: `Your Pick ${i}`, fp: 18, s: i, h: i >= 4 }))] } as H2HHand,
  sender: { handId: "jon", totalFp: 112, tier: "STARTER", displayName: "Jon",
    cards: [card({ bp: CURRY, name: "Stephen Curry", tier: "ORANGE", sal: 60, h: true, fp: 55, s: 1, pos: "G" }),
      ...[0, 2, 3, 4, 5].map((i) => card({ bp: `j${i}`, name: `Jon Pick ${i}`, fp: 11, s: i, h: i >= 4 }))] } as H2HHand,
  deal: [card({ bp: BOOKER, name: "Devin Booker", tier: "ORANGE", s: 0, pos: "G" }),
    card({ bp: CURRY, name: "Stephen Curry", tier: "ORANGE", s: 1, pos: "G" }),
    ...[2, 3, 4, 5].map((i) => card({ bp: `d${i}`, name: `Dealt ${i}`, fp: 14, s: i }))],
  state: "LOSS_CLOSED" as ResultsOverlayState,
};
for (const h of [WIN, LOSS]) for (const c of [...h.recipient.cards, ...h.sender.cards, ...h.deal]) {
  if (!DEMO_POOL[c.basePlayerId]) DEMO_POOL[c.basePlayerId] = ps(12, 40);
}

const renderCard: CardRenderer = (c, options) => (
  <AthleteCard card={c as unknown as PlayerCard} phase={"RESULTS" as never}
    isFlipped={options?.flipped ?? false} canFlip locked={c.wasHeld} heldFpVisible
    staticEndState ignoreHeldStatus badges={c.achievements} />
);

export default function WinClauseDemoRoute() {
  const reg = useRef(false);
  if (!reg.current) { registerPoolStatsProvider((bp) => DEMO_POOL[bp] ?? null); reg.current = true; }

  const { hand, displayExplanation } = useMemo(() => {
    const caseParam = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("case")
      : null;
    const isLoss = caseParam === "loss-a" || caseParam === "loss-b";
    const hand = isLoss ? LOSS : WIN;
    const namedStyle = caseParam === "loss-b" ? "beat" as const : "smooth" as const;
    const r = explainH2HResult({
      sender: hand.sender, recipient: hand.recipient, sport: "basketball",
      initialRoster: hand.deal as never, rivalryEnabled: true, opponentName: "Jon", namedStyle,
    });
    const displayExplanation = r ? r.text + (r.rivalryClause ? ` ${r.rivalryClause}` : "") : "";
    // eslint-disable-next-line no-console
    console.log("[win-clause-demo]", { case: caseParam ?? "win", base: r?.text, clause: r?.rivalryClause, composed: displayExplanation });
    return { hand, displayExplanation };
  }, []);

  return (
    <H2HResultsOverlay
      sender={hand.sender}
      recipient={hand.recipient}
      renderCard={renderCard}
      state={hand.state}
      visible
      windowClosesAtMs={null}
      explanation={displayExplanation}
      onSendItBack={() => {}}
      onTryAgain={() => {}}
      onPlayOwnHand={() => {}}
      onDismiss={() => {}}
    />
  );
}
