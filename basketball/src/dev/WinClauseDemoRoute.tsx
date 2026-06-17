/**
 * basketball/src/dev/WinClauseDemoRoute.tsx — DEV ONLY.
 *
 * Deterministic seeded AGENCY WIN that fires the RD8 rivalry clause, rendered on
 * the real H2HResultsOverlay so the win clause can be glassed without hunting for
 * a rare live hand. You held a RED star (Jokić) who went off (A1 decisive line)
 * and the opponent FADED him → result-congruent win divergence → clause.
 *
 * Route: /basketball/dev/win-clause  (gated DEV-only in App.tsx).
 * Uses the live explainH2HResult, so it shows the CURRENT (Task-1-corrected) copy:
 *   "110-12-9 from Jokić — the hold you stuck with. Jon let him go."
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
// Jokić (real NBA id 203999) fires; everyone else gets a modest pool so
// percentiles compute and only Jokić reads as the dominant decisive line.
const DEMO_POOL: Record<string, ReturnType<typeof ps>> = { "203999": ps(45, 120) };

const card = (o: {
  bp: string; name: string; s: number; fp: number; h?: boolean; tier?: string; sal?: number; pos?: string; team?: string;
}): H2HCard => ({
  id: o.bp, basePlayerId: o.bp, personKey: o.bp, cardId: `${o.bp}_c`,
  name: o.name, team: o.team ?? "DEN", season: "2425", position: o.pos ?? "C",
  photoCode: null, salary: o.sal ?? 30, tier: (o.tier ?? "BLUE") as H2HCard["tier"],
  projectedFp: 30, slotIndex: o.s, wasHeld: !!o.h, actualFp: o.fp, fpDelta: 0,
  gameInfo: { date: "2025-01-15", opponent: "LAL", homeAway: "home" },
  statLine: { pts: o.fp, reb: 12, ast: 9, stl: 1, blk: 1, turnovers: 2, mp: 38 },
  achievements: [],
});

// You: held Jokić (RED, went for 110 → A1) + modest cast → big win.
const RECIPIENT_CARDS: H2HCard[] = [
  card({ bp: "203999", name: "Nikola Jokić", tier: "RED", sal: 90, h: true, fp: 110, s: 5, pos: "C", team: "DEN" }),
  ...[0, 1, 2, 3, 4].map((i) => card({ bp: `you${i}`, name: `Your Pick ${i + 1}`, fp: 14, s: i, h: i >= 3 })),
];
// Jon: FADED Jokić (not on his board) + a modest hand → loses.
const SENDER_CARDS: H2HCard[] = [0, 1, 2, 3, 4, 5].map((i) =>
  card({ bp: `jon${i}`, name: `Jon Pick ${i + 1}`, fp: 12 + i, s: i, h: i >= 3 }));
// The shared deal: Jokić was dealt (you held him, Jon faded him).
const DEAL: H2HCard[] = [
  card({ bp: "203999", name: "Nikola Jokić", tier: "RED", s: 5, fp: 110, pos: "C", team: "DEN" }),
  ...[0, 1, 2, 3, 4].map((i) => card({ bp: `deal${i}`, name: `Dealt ${i + 1}`, fp: 14, s: i })),
];
for (const c of [...RECIPIENT_CARDS, ...SENDER_CARDS, ...DEAL]) {
  if (!DEMO_POOL[c.basePlayerId]) DEMO_POOL[c.basePlayerId] = ps(12, 40);
}

const renderCard: CardRenderer = (c, options) => (
  <AthleteCard
    card={c as unknown as PlayerCard}
    phase={"RESULTS" as never}
    isFlipped={options?.flipped ?? false}
    canFlip
    locked={c.wasHeld}
    heldFpVisible
    staticEndState
    ignoreHeldStatus
    badges={c.achievements}
  />
);

export default function WinClauseDemoRoute() {
  // Register the demo pool provider synchronously on first render (DEV route only)
  // so explainH2HResult's classify() sees Jokić as the decisive line (A1).
  const reg = useRef(false);
  if (!reg.current) { registerPoolStatsProvider((bp) => DEMO_POOL[bp] ?? null); reg.current = true; }

  const { sender, recipient, displayExplanation } = useMemo(() => {
    const recipient: H2HHand = { handId: "you", totalFp: 180, tier: "MVP", cards: RECIPIENT_CARDS, displayName: "YOU" };
    const sender: H2HHand = { handId: "jon", totalFp: 90, tier: "STARTER", cards: SENDER_CARDS, displayName: "Jon" };
    const r = explainH2HResult({
      sender, recipient, sport: "basketball",
      initialRoster: DEAL as never, rivalryEnabled: true, opponentName: "Jon",
    });
    const displayExplanation = r ? r.text + (r.rivalryClause ? ` ${r.rivalryClause}` : "") : "";
    // eslint-disable-next-line no-console
    console.log("[win-clause-demo]", { base: r?.text, clause: r?.rivalryClause, composed: displayExplanation });
    return { sender, recipient, displayExplanation };
  }, []);

  return (
    <H2HResultsOverlay
      sender={sender}
      recipient={recipient}
      renderCard={renderCard}
      state={"WIN" satisfies ResultsOverlayState}
      visible
      explanation={displayExplanation}
      onSendItBack={() => {}}
      onTryAgain={() => {}}
      onPlayOwnHand={() => {}}
      onDismiss={() => {}}
    />
  );
}
