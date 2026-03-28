/**
 * basketball/src/components/AthleteCardFront.tsx
 * Thin wrapper — passes basketball hero (headshot photo) into shared CardFront.
 */

import { useState } from "react";
import { CardFront, type CardFrontProps, type CardFrontHeroProps } from "@shared/components/CardFront";
import type { PlayerCard } from "@shared/types";

function BasketballHero({ card, initials, isActiveReveal }: CardFrontHeroProps) {
  const [imgReady, setImgReady] = useState(false);
  const headshotSrc = (() => {
    const base = String((card as any)?.basePlayerId ?? "").trim();
    return base ? `/headshots/${base}.png` : "";
  })();

  return (
    <>
      {headshotSrc ? (
        <img
          key={headshotSrc}
          src={headshotSrc}
          alt={String((card as any)?.name ?? "")}
          style={{
            position: "absolute",
            top: "12%", left: "-5%", width: "110%", height: "100%",
            objectFit: "cover", objectPosition: "50% 10%",
            opacity: imgReady ? 1 : 0, transition: "opacity 0.2s ease",
          }}
          draggable={false}
          onLoad={() => setImgReady(true)}
          onError={() => setImgReady(false)}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 32, fontWeight: 950, color: "rgba(255,255,255,0.70)", userSelect: "none" }}>
          {initials}
        </div>
      )}
    </>
  );
}

export type { CardFrontProps as AthleteCardFrontProps };
export type PerformanceTag = "ICE_COLD" | "COLD" | "OK" | "HOT" | "ON_FIRE" | "CAREER_NIGHT";
export type PulseStyle = "NEG" | "NEUTRAL" | "POS" | "BONUS_POOL";

export function AthleteCardFront(props: CardFrontProps) {
  return (
    <CardFront
      {...props}
      renderHero={(heroProps) => <BasketballHero {...heroProps} />}
    />
  );
}