import type { GamePhase, PlayerCard } from "../engine/types";
import { CardSlot } from "./CardSlot";

export function RosterGrid(props: {
  cards: PlayerCard[];
  phase: GamePhase;
  lockedCardIds: Set<string>;
  onToggleLock: (cardId: string) => void;
  mvpCardId: string;
}) {
  const { cards, phase, lockedCardIds, onToggleLock, mvpCardId } = props;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
      {Array.from({ length: 6 }).map((_, idx) => {
        const card = cards[idx];
        if (!card) {
          return (
            <div
              key={idx}
              style={{
                height: 190,
                borderRadius: 16,
                border: "1px dashed rgba(0,0,0,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.6,
              }}
            >
              Waiting…
            </div>
          );
        }

        return (
          <CardSlot
            key={card.cardId}
            card={card}
            phase={phase}
            locked={lockedCardIds.has(card.cardId)}
            onToggleLock={() => onToggleLock(card.cardId)}
            isMvp={phase === "RESULTS" && card.cardId === mvpCardId}
          />
        );
      })}
    </div>
  );
}
