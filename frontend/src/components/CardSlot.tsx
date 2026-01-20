import type { GamePhase, PlayerCard } from "../adapters/types";
import AthleteCard from "./AthleteCard";

export function CardSlot(props: {
  card: PlayerCard;
  phase: GamePhase;

  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;

  canFlip: boolean;

  onToggleLock: () => void;
  onToggleFlip: () => void;
}) {
  const { card, phase, isLocked, isMvp, isFlipped, canFlip, onToggleLock, onToggleFlip } = props;

  return (
    <div
      onClick={phase === "HOLD" ? onToggleLock : undefined}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <AthleteCard
        card={card}
        phase={phase}
        isLocked={isLocked}
        isMvp={isMvp}
        isFlipped={isFlipped}
        canFlip={canFlip}
        onToggleFlip={onToggleFlip}
      />
    </div>
  );
}
