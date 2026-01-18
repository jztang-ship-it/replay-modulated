import { useMemo, useState } from "react";
import type { GamePhase, PlayerCard } from "./engine/types";
import { dealInitialRoster, redrawRoster, resolveRoster } from "./engine/engineAdapter";
import { RosterGrid } from "./components/RosterGrid";
import { ScoreHeader } from "./components/ScoreHeader";

const CAP_MAX = 180;

/**
 * IMPORTANT:
 * engineAdapter expects lockedCardIds to correspond to the card's real identifier.
 * PlayerCard in this repo apparently does NOT have `id` typed, so we infer a stable key.
 */
function cardId(card: any): string {
  // Prefer the most "card identity" fields first
  const v =
    card?.cardId ??
    card?.id ??
    card?.playerId ??
    card?.basePlayerId ??
    card?.uid ??
    card?.name;

  return String(v ?? "");
}

function sumSalary(roster: PlayerCard[]) {
  return roster.reduce((acc, c: any) => acc + Number(c?.salary ?? 0), 0);
}

export default function GameView() {
  const [phase, setPhase] = useState<GamePhase>("HOLD" as GamePhase);
  const [roster, setRoster] = useState<PlayerCard[]>([]);

  // locks are stored by the same IDs we pass to the adapter
  const [lockedCardIds, setLockedCardIds] = useState<Set<string>>(new Set());

  // flip uses same keying system
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [mvpId, setMvpId] = useState<string | undefined>(undefined);

  const isIdle = roster.length === 0;

  const capUsed = useMemo(() => sumSalary(roster), [roster]);

  const heldSalary = useMemo(() => {
    return roster.reduce((acc, c: any) => {
      const k = cardId(c);
      if (!lockedCardIds.has(k)) return acc;
      return acc + Number(c?.salary ?? 0);
    }, 0);
  }, [roster, lockedCardIds]);

  const capRemaining = useMemo(() => Math.max(0, CAP_MAX - capUsed), [capUsed]);

  const totalFp = useMemo(() => {
    if (phase === "RESULTS") return roster.reduce((a, c: any) => a + Number(c?.actualFp ?? 0), 0);
    return roster.reduce((a, c: any) => a + Number(c?.projectedFp ?? 0), 0);
  }, [roster, phase]);

  const subtitle = useMemo(() => {
    if (isIdle) return "Tap DEAL to start";
    if (phase === "HOLD") return "Tap cards to PROTECT, then REDRAW or REVEAL";
    if (phase === "RESULTS") return "Tap cards to view box score";
    return "";
  }, [phase, isIdle]);

  function toggleLock(cardKey: string) {
    if (phase !== "HOLD") return;
    setLockedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardKey)) next.delete(cardKey);
      else next.add(cardKey);
      return next;
    });
  }

  function toggleFlip(cardKey: string) {
    if (phase !== "RESULTS") return;
    setFlippedId((prev) => (prev === cardKey ? null : cardKey));
  }

  async function onDeal() {
    setFlippedId(null);
    setMvpId(undefined);
    setLockedCardIds(new Set());

    const res: any = await dealInitialRoster();
    const nextRoster: PlayerCard[] = (res?.roster ?? res?.cards ?? res?.lineup ?? []) as PlayerCard[];
    setRoster(nextRoster);

    setPhase("HOLD" as GamePhase);
  }

  async function onRedraw() {
    if (phase !== "HOLD" || isIdle) return;

    const res: any = await redrawRoster({
      currentCards: roster,
      lockedCardIds,
    });

    const nextRoster: PlayerCard[] = (res?.roster ?? res?.cards ?? res?.lineup ?? res?.finalCards ?? roster) as PlayerCard[];
    setRoster(nextRoster);

    // Keep HOLD phase (adapter likely does too)
    setPhase("HOLD" as GamePhase);
  }

  async function onReveal() {
    if (phase !== "HOLD" || isIdle) return;

    // On reveal, we resolve the *final* current roster
    const res: any = await resolveRoster({
      finalCards: roster,
    });

    const nextRoster: PlayerCard[] = (res?.roster ?? res?.cards ?? res?.finalCards ?? roster) as PlayerCard[];
    setRoster(nextRoster);

    // Try to pick up MVP id if adapter provides it
    const maybeMvp: string | undefined = res?.mvpId ?? res?.mvpCardId ?? res?.topCardId;
    if (typeof maybeMvp === "string") setMvpId(maybeMvp);

    setPhase("RESULTS" as GamePhase);
  }

  function onReset() {
    setRoster([]);
    setLockedCardIds(new Set());
    setFlippedId(null);
    setMvpId(undefined);
    setPhase("HOLD" as GamePhase);
  }

  // IMPORTANT: RosterGrid expects lock set and flip id based on keys.
  // Our RosterGrid implementation uses `cardKey()` internally (cardId/cardId fallback),
  // but to avoid mismatch, we pass ids that match our `cardId` helper.
  // RosterGrid uses Set<string> keys; we’re aligned.

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#f6f7fb",
      }}
    >
      <div style={{ flex: "0 0 auto", padding: 12 }}>
        <ScoreHeader
          totalFp={totalFp}
          capUsed={capUsed}
          capMax={CAP_MAX}
          heldSalary={heldSalary}
          capRemaining={capRemaining}
          phase={phase}
          subtitle={subtitle}
        />
      </div>

      <div style={{ flex: "1 1 auto", padding: 12, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            borderRadius: 16,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(0,0,0,0.06)",
            padding: 10,
            overflow: "hidden",
          }}
        >
          <RosterGrid
            roster={roster}
            phase={phase}
            lockedIds={lockedCardIds}
            mvpId={mvpId}
            flippedId={flippedId}
            onToggleLock={(k) => toggleLock(k)}
            onToggleFlip={(k) => toggleFlip(k)}
          />
        </div>
      </div>

      <div style={{ flex: "0 0 auto", padding: 12 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onDeal}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              fontWeight: 900,
            }}
          >
            DEAL
          </button>

          <button
            onClick={onRedraw}
            disabled={isIdle || phase !== "HOLD"}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              fontWeight: 900,
              opacity: isIdle || phase !== "HOLD" ? 0.5 : 1,
            }}
          >
            REDRAW
          </button>

          <button
            onClick={onReveal}
            disabled={isIdle || phase !== "HOLD"}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#fff",
              fontWeight: 900,
              opacity: isIdle || phase !== "HOLD" ? 0.5 : 1,
            }}
          >
            REVEAL
          </button>

          <button
            onClick={onReset}
            style={{
              width: 90,
              height: 44,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "rgba(0,0,0,0.04)",
              fontWeight: 900,
            }}
          >
            RESET
          </button>
        </div>
      </div>
    </div>
  );
}
