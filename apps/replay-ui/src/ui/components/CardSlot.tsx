import { useEffect, useRef, useState } from "react";
import type { GamePhase, PlayerCard } from "../engine/types";
import { AthleteCard } from "./AthleteCard";

type AnimState = "idle" | "out" | "in";

export function CardSlot(props: {
  card: PlayerCard;
  phase: GamePhase;
  locked: boolean;
  onToggleLock: () => void;
  isMvp: boolean;
}) {
  const { card, phase, locked, onToggleLock, isMvp } = props;

  const [flipped, setFlipped] = useState(false);
  const [anim, setAnim] = useState<AnimState>("idle");

  const prevCardId = useRef<string>(card.cardId);
  const firstMount = useRef(true);

  // Reset flip when leaving results
  useEffect(() => {
    if (phase !== "RESULTS") setFlipped(false);
  }, [phase]);

  // Animate when the card actually changes (cardId changes)
  useEffect(() => {
    const changed = prevCardId.current !== card.cardId;

    // On first mount, do nothing
    if (firstMount.current) {
      firstMount.current = false;
      prevCardId.current = card.cardId;
      return;
    }

    // Only animate replacements during DRAW, and only if slot isn't locked
    if (changed && phase === "DRAW" && !locked) {
      setAnim("out");
      const t1 = window.setTimeout(() => {
        prevCardId.current = card.cardId;
        setAnim("in");
      }, 140);

      const t2 = window.setTimeout(() => {
        setAnim("idle");
      }, 320);

      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }

    // If card changed but not in DRAW, just update reference without animation
    if (changed) {
      prevCardId.current = card.cardId;
      setAnim("idle");
    }
  }, [card.cardId, phase, locked]);

  const canFlip = phase === "RESULTS";
  const canLock = phase === "HOLD";

  const onClick = () => {
    if (canLock) onToggleLock();
    else if (canFlip) setFlipped((v) => !v);
  };

  // Visual treatment: keep anchored size; animate transform/opacity only
  let transform = "translateX(0px)";
  let opacity = 1;

  if (anim === "out") {
    transform = "translateX(-10px)";
    opacity = 0.55;
  } else if (anim === "in") {
    transform = "translateX(10px)";
    opacity = 0.85;
  }

  // Locked cards should feel "bolted down"
  const lockScale = locked && phase === "HOLD" ? "scale(0.995)" : "scale(1)";

  return (
    <div
      onClick={onClick}
      style={{
        cursor: canLock || canFlip ? "pointer" : "default",
        transform: `${lockScale} ${transform}`,
        opacity,
        transition: "transform 180ms ease, opacity 180ms ease",
        willChange: "transform, opacity",
      }}
    >
      <AthleteCard
  card={card}
  phase={phase}
  isLocked={locked}
  isMvp={isMvp}
  isFlipped={flipped}
  canFlip={canFlip}
  onToggleFlip={() => setFlipped((v) => !v)}
/>

    </div>
  );
}
