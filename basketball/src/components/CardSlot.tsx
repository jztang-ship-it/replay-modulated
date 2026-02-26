import type { GamePhase, PlayerCard } from "../adapters/types";
import { AthleteCard } from "./AthleteCard";

export function CardSlot(props: {
  card: PlayerCard;
  phase: GamePhase;

  // Hold / lock
  isLocked: boolean;
  onToggleLock: () => void;

  // MVP highlight
  isMvp: boolean;

  // Flip
  isFlipped: boolean;
  onToggleFlip: () => void;
  canFlip: boolean;

  // Optional reveal helpers
  visibleFp?: number;
  isFaceDown?: boolean;
}) {
  const { card, phase, isLocked, onToggleLock, isMvp, isFlipped, onToggleFlip, canFlip, visibleFp, isFaceDown } = props;

  // Let AthleteCard handle click-to-flip; we only pass the right props.
  // (Wrapping div clicks often fight with button clicks inside the card.)
  return (
    <div style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <AthleteCard
        card={card}
        phase={phase}
        locked={isLocked}
        onToggleLock={onToggleLock}
        isMvp={isMvp}
        flipped={isFlipped}
        onToggleFlip={isFaceDown ? undefined : onToggleFlip}
        canFlip={canFlip && !isFaceDown}
        visibleFp={visibleFp}
      />
    </div>
  );
}
