/**
 * basketball/src/dev/WinClauseDemoRoute.tsx — DEV ONLY.
 *
 * Glasses the RD8 rivalry clause on the real H2HResultsOverlay so the composed
 * line can be read on device (the only verdict).
 *
 * STEP-2 PROPERTY (no fabricated stat fields): the route NEVER hand-writes a
 * stat number. It boots the real data engine for season 2425, pulls each card's
 * statLine straight from that player's REAL game log, and derives actualFp with
 * the adapter's real computeFantasyPoints — the exact production resolve. The
 * card factory has NO `fp` / `pts` / `reb` parameters, so the old "fp stapled
 * into statLine.pts" bug (and any number production never emits) is structurally
 * impossible. Curating WHICH real game to showcase is scenario, not fabrication.
 *
 * Routes (gated DEV-only in App.tsx):
 *   /basketball/dev/win-clause             → WIN (coincident pronoun clause)
 *   /basketball/dev/win-clause?case=loss-a → LOSS, smooth named clause ("— you let him go.")
 *   /basketball/dev/win-clause?case=loss-b → LOSS, hard-beat named clause (". You let him go.")
 */
import { useEffect, useMemo, useState } from "react";
import { H2HResultsOverlay, type ResultsOverlayState } from "@shared/components/H2HResultsOverlay";
import type { H2HCard, H2HHand, CardRenderer } from "@shared/components/H2HRevealScreen";
import { explainH2HResult } from "@shared/explanation/explainH2HResult";
import { getPoolStats, subscribePoolStats } from "@shared/explanation/poolStatsProvider";
import { setActiveSeason, ensureLoaded, getPlayers, getLogsByKey } from "../engines/dataEngine";
import { sportAdapter } from "../adapters/SportAdapter";
import { AthleteCard } from "../components/AthleteCard";
import type { PlayerCard } from "../adapters/types";

const SEASON = "2425";

// The showcased players (real ids) and the real game (by date) each one shows.
// Chosen so the engine classifies the scenario we want to glass; every number
// comes from the log + the adapter, never from this file.
const BOOKER = "1626164";  // WIN star: a big real game → held by you, faded by Jon (A1)
const JOKIC = "203999";    // LOSS bust: a quiet real game → held by you (A2)
const CURRY = "201939";    // LOSS rival: a big real game → held by Jon, faded by you (named clause)
const BOOKER_WIN_GAME = "2025-02-07"; // 47-6-11 → big real game (A1 win star)
const JOKIC_DUD_GAME = "2024-12-13";  // 16-7-2 → quiet real game (A2 held bust)
// Curry is only the FADED RIVAL named in the clause — he doesn't need a monster
// game. Use his MEDIAN game (date null) so the loss stays close enough that the
// held-bust is the decisive line (A2); his real 86-fp blowout buried the margin.

type Players = ReturnType<typeof getPlayers>;
type Logs = ReturnType<typeof getLogsByKey>;

/** A card built ENTIRELY from real data: statLine = the real game log's stats;
 *  actualFp = the adapter's real fantasy-points calc on that statLine. No stat
 *  field is accepted as a parameter, so nothing can be fabricated. `date` null
 *  → the player's median-FP game (a non-decisive filler). */
function realCard(
  id: string, slot: number, held: boolean, date: string | null,
  players: Players, logs: Logs, strength: "median" | "high" | "low" = "median",
): H2HCard {
  const p = players.find((x) => String(x.basePlayerId) === id);
  const gl = logs.get(id) ?? [];
  let log = date ? gl.find((g) => String((g as { date?: string }).date) === date) : null;
  if (!log) {
    // Pick a real game at the requested point of the player's FP distribution.
    // "median" → swing ≈ 0 (non-decisive filler); high/low tune the side totals
    // into the close-loss band — still a real game, just which one we showcase.
    const ranked = gl
      .map((g) => ({ g, fp: sportAdapter.computeFantasyPoints((g as { stats: Record<string, number> }).stats) }))
      .sort((a, b) => a.fp - b.fp);
    const frac = strength === "high" ? 0.8 : strength === "low" ? 0.2 : 0.5;
    log = ranked.length ? ranked[Math.floor(ranked.length * frac)].g : gl[0];
  }
  const stats = (log as { stats?: Record<string, number> })?.stats ?? {};
  const actualFp = Math.round(sportAdapter.computeFantasyPoints(stats) * 10) / 10;
  const gi = log as { date?: string; opponent?: string; homeAway?: string } | undefined;
  return {
    id, basePlayerId: id, personKey: id, cardId: `${id}_c`,
    name: p?.name ?? id, team: p?.team ?? "—", season: SEASON,
    position: p?.position ?? "G", photoCode: p?.photoCode ?? null,
    salary: p?.salary ?? 30, tier: (p?.tier ?? "BLUE") as H2HCard["tier"],
    projectedFp: p?.projectedFp ?? 30, slotIndex: slot, wasHeld: held,
    actualFp, fpDelta: 0,
    gameInfo: { date: gi?.date ?? "", opponent: gi?.opponent ?? "OPP", homeAway: (gi?.homeAway as "home" | "away") ?? "home" },
    statLine: stats, achievements: [],
  };
}

const sum = (cards: H2HCard[]) => Math.round(cards.reduce((s, c) => s + c.actualFp, 0) * 10) / 10;

/** Pick N real filler ids (non-star tier, enough logs) deterministically. */
function fillerIds(players: Players, logs: Logs, exclude: Set<string>, n: number): string[] {
  return players
    .filter((p) => {
      const id = String(p.basePlayerId);
      const t = String(p.tier).toUpperCase();
      return !exclude.has(id) && t !== "RED" && t !== "ORANGE" && (logs.get(id)?.length ?? 0) > 15;
    })
    .map((p) => String(p.basePlayerId))
    .sort()
    .slice(0, n);
}

function buildHands(caseKey: "win" | "loss", players: Players, logs: Logs) {
  const excl = new Set([BOOKER, JOKIC, CURRY]);
  const f = fillerIds(players, logs, excl, 12);

  if (caseKey === "win") {
    // You HELD Booker's big game (A1 star); Jon FADED him (absent from his hand).
    const recip: H2HCard[] = [
      realCard(BOOKER, 0, true, BOOKER_WIN_GAME, players, logs),
      ...f.slice(0, 5).map((id, i) => realCard(id, i + 1, i >= 3, null, players, logs)),
    ];
    const send: H2HCard[] = f.slice(5, 11).map((id, i) => realCard(id, i, i >= 4, null, players, logs));
    const deal: H2HCard[] = [
      realCard(BOOKER, 0, false, BOOKER_WIN_GAME, players, logs),
      ...f.slice(0, 5).map((id, i) => realCard(id, i + 1, false, null, players, logs)),
    ];
    return { recipient: { handId: "you", totalFp: sum(recip), tier: "MVP", displayName: "YOU", cards: recip } as H2HHand,
             sender: { handId: "jon", totalFp: sum(send), tier: "STARTER", displayName: "Jon", cards: send } as H2HHand,
             deal, state: "WIN" as ResultsOverlayState };
  }

  // LOSS: you HELD Jokić's dud (A2 bust); Jon HELD Curry's big game (you faded him).
  const recip: H2HCard[] = [
    realCard(JOKIC, 0, true, JOKIC_DUD_GAME, players, logs),
    // 2 stronger real games on your side closes the gap into the close-loss band
    // (≤15) so the held bust is the decisive line (A2), not a diffuse beatdown.
    ...f.slice(0, 5).map((id, i) => realCard(id, i + 1, i >= 4, null, players, logs, i < 2 ? "high" : "median")),
  ];
  const send: H2HCard[] = [
    realCard(CURRY, 1, true, null, players, logs),
    ...f.slice(5, 10).map((id, i) => realCard(id, i, i >= 4, null, players, logs)),
  ];
  const deal: H2HCard[] = [
    realCard(JOKIC, 0, false, JOKIC_DUD_GAME, players, logs),
    realCard(CURRY, 1, false, null, players, logs),
    ...f.slice(0, 4).map((id, i) => realCard(id, i + 2, false, null, players, logs)),
  ];
  return { recipient: { handId: "you", totalFp: sum(recip), tier: "ROOKIE", displayName: "YOU", cards: recip } as H2HHand,
           sender: { handId: "jon", totalFp: sum(send), tier: "STARTER", displayName: "Jon", cards: send } as H2HHand,
           deal, state: "LOSS_CLOSED" as ResultsOverlayState };
}

const renderCard: CardRenderer = (c, options) => (
  <AthleteCard card={c as unknown as PlayerCard} phase={"RESULTS" as never}
    isFlipped={options?.flipped ?? false} canFlip locked={c.wasHeld} heldFpVisible
    staticEndState ignoreHeldStatus badges={c.achievements} />
);

export default function WinClauseDemoRoute() {
  const [ready, setReady] = useState(false);

  // Boot the real data engine + warm real pool stats (classify needs percentile).
  useEffect(() => {
    let alive = true;
    (async () => {
      setActiveSeason(SEASON);
      await ensureLoaded();
      getPoolStats(BOOKER, SEASON); // kick the lazy pool-stats fetch
      await new Promise<void>((res) => {
        if (getPoolStats(BOOKER, SEASON)) return res();
        const unsub = subscribePoolStats(() => { if (getPoolStats(BOOKER, SEASON)) { unsub(); res(); } });
      });
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  const view = useMemo(() => {
    if (!ready) return null;
    const players = getPlayers();
    const logs = getLogsByKey();
    const caseParam = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("case") : null;
    const isLoss = caseParam === "loss-a" || caseParam === "loss-b";
    const namedStyle = caseParam === "loss-b" ? "beat" as const : "smooth" as const;
    const hand = buildHands(isLoss ? "loss" : "win", players, logs);
    const r = explainH2HResult({
      sender: hand.sender, recipient: hand.recipient, sport: "basketball",
      initialRoster: hand.deal as never, rivalryEnabled: true, opponentName: "Jon", namedStyle,
    });
    const displayExplanation = r ? r.text + (r.rivalryClause ? ` ${r.rivalryClause}` : "") : "";
    // eslint-disable-next-line no-console
    console.log("[win-clause-demo]", {
      case: caseParam ?? "win", leaf: r?.classification.leaf, register: r?.classification.register,
      margin: hand.recipient.totalFp - hand.sender.totalFp,
      base: r?.text, clause: r?.rivalryClause, composed: displayExplanation,
    });
    return { hand, displayExplanation };
  }, [ready]);

  if (!view) {
    return <div style={{ color: "#fff", padding: 24, fontFamily: "system-ui" }}>Loading real {SEASON} resolve…</div>;
  }
  return (
    <H2HResultsOverlay
      sender={view.hand.sender}
      recipient={view.hand.recipient}
      renderCard={renderCard}
      state={view.hand.state}
      visible
      windowClosesAtMs={null}
      explanation={view.displayExplanation}
      onSendItBack={() => {}}
      onTryAgain={() => {}}
      onPlayOwnHand={() => {}}
      onDismiss={() => {}}
    />
  );
}
