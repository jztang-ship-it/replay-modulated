/**
 * basketball/src/components/AthleteCardFront.tsx
 * Thin wrapper — passes basketball hero (headshot photo) into shared CardFront.
 */

import { useState } from "react";
import { CardFront, type CardFrontProps, type CardFrontHeroProps } from "@shared/components/CardFront";
import { headshotUrl } from "@shared/utils/headshotUrl";
import { shouldRenderSilhouette } from "../data/silhouettePlayerIds";
import type { PlayerCard } from "@shared/types";

const SILHOUETTE_URL = headshotUrl("_silhouette");

function BasketballHero({ card, initials, isActiveReveal }: CardFrontHeroProps) {
  const [imgReady, setImgReady] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const basePlayerId = String((card as any)?.basePlayerId ?? "").trim();
  const useSilhouette = shouldRenderSilhouette(basePlayerId) || imgFailed;
  const headshotSrc = useSilhouette ? SILHOUETTE_URL : headshotUrl(basePlayerId);

  return (
    <>
      {!useSilhouette && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 32, fontWeight: 950, color: "rgba(255,255,255,0.70)", userSelect: "none" }}>
          {initials}
        </div>
      )}
      {headshotSrc && (
        <img
          key={headshotSrc}
          src={headshotSrc}
          alt={String((card as any)?.name ?? "")}
          decoding="async"
          loading="eager"
          fetchPriority="high"
          style={{
            position: "absolute",
            top: "12%", left: "-5%", width: "110%", height: "100%",
            objectFit: "cover", objectPosition: "50% 10%",
            opacity: useSilhouette || imgReady ? 1 : 0, transition: "opacity 0.2s ease",
          }}
          draggable={false}
          onLoad={() => setImgReady(true)}
          onError={() => { setImgReady(false); setImgFailed(true); }}
        />
      )}
    </>
  );
}

export type { CardFrontProps as AthleteCardFrontProps };
export type PerformanceTag = "ICE_COLD" | "COLD" | "OK" | "HOT" | "ON_FIRE" | "CAREER_NIGHT";
export type PulseStyle = "NEG" | "NEUTRAL" | "POS" | "LEGEND";

export function AthleteCardFront(props: CardFrontProps) {
  return (
    <CardFront
      {...props}
      renderHero={(heroProps) => <BasketballHero {...heroProps} />}
    />
  );
}