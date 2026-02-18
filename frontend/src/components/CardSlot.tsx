import type { GamePhase, PlayerCard } from "../adapters/types";
import { AthleteCardLegacy } from "./AthleteCard";

export function CardSlot(props: {
  card: PlayerCard;
  phase: GamePhase;

  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;
  isFaceDown?: boolean;  // true when showing generic back

  canFlip: boolean;
  visibleFp?: number;  // NEW: For emotional reveal FP animation

  onToggleLock: () => void;
  onToggleFlip: () => void;
}) {
  const { card, phase, isLocked, isMvp, isFlipped, isFaceDown, canFlip, visibleFp, onToggleLock, onToggleFlip } = props;

  const onClick = () => {
    if (phase === "HOLD") onToggleLock();
    else if (phase === "RESULTS" && canFlip && !isFaceDown) onToggleFlip();
  };

  return (
    <div
      onClick={onClick}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        cursor: phase === "HOLD" || (phase === "RESULTS" && canFlip && !isFaceDown) ? "pointer" : "default",
      }}
    >
      <AthleteCardLegacy
        card={card}
        phase={phase}
        isLocked={isLocked}
        isMvp={isMvp}
        isFlipped={isFlipped}
        canFlip={canFlip}
        onToggleFlip={onToggleFlip}
        isFaceDown={isFaceDown}
        visibleFp={visibleFp}
      />
    </div>
  );
}