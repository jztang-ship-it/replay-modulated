import { useEffect, useRef, useState } from "react";
import type { GamePhase, PlayerCard } from "../engine/types";
import { AthleteCard } from "./AthleteCard";

export function CardSlot(props: {
  card: PlayerCard;
  phase: GamePhase;
  locked: boolean;
  onToggleLock: () => void;
  isMvp: boolean;
}) {
  const { card, phase, locked, onToggleLock, isMvp } = props;
  const [flipped, setFlipped] = useState(false);

  // swap animation when cardId changes (only for unlocked replacements)
  const [animating, setAnimating] = useState(false);
  const prevId = useRef(card.cardId);

  useEffect(() => {
    if (prevId.current !== card.cardId) {
      setAnimating(true);
      prevId.current = card.cardId;
      const t = setTimeout(() => setAnimating(false), 220);
      return () => clearTimeout(t);
    }
  }, [card.cardId]);

  const canFlip = phase === "RESULTS";
  const canLock = phase === "HOLD";

  const onClick = () => {
    if (canLock) onToggleLock();
    else if (canFlip) setFlipped((v) => !v);
  };

  return (
    <div
      onClick={onClick}
      style={{
        cursor: canLock || canFlip ? "pointer" : "default",
        transform: animating && !locked ? "translateX(10px)" : "translateX(0px)",
        opacity: animating && !locked ? 0.7 : 1,
        transition: "transform 220ms ease, opacity 220ms ease",
      }}
    >
      <AthleteCard
        card={card}
        locked={locked}
        showBack={flipped && canFlip}
        phase={phase}
        isMvp={isMvp}
      />
    </div>
  );
}
