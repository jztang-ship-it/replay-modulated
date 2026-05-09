/**
 * shared/components/CardHero.tsx
 *
 * Single shared hero renderer for the front of every sport's card. Takes an
 * image URL (or null) and an optional fallback node. Always renders the
 * fallback as a behind-layer so the card never appears empty during image
 * load, then overlays the photo on top once loaded. If the image errors,
 * the fallback stays visible.
 *
 * Sport responsibility shrinks to one of:
 *   {imageUrl: "/basketball/headshots/123.png"}                // basketball
 *   {imageUrl: "/baseball/headshots/123.png"}                  // baseball
 *   {imageUrl: "/football/players-processed/123.png",
 *    fallback: <FlagAndInitials team="Argentina" initials="LM"/>}  // football
 *
 * Positioning constants (top/left/width/height/objectPosition) are owned
 * here — there is no per-sport override. Earlier divergence between
 * AthleteCard.tsx (110/100/10) and SoccerCard.tsx (108/98/14) is what
 * caused football cards to render a different size than basketball; this
 * file is the single source of truth.
 */

import React from "react";

const HEADSHOT_TOP_PCT = 12;
const HEADSHOT_LEFT_PCT = -5;
const HEADSHOT_WIDTH_PCT = 110;
const HEADSHOT_HEIGHT_PCT = 100;
const HEADSHOT_OBJECT_X = 50;
const HEADSHOT_OBJECT_Y = 10;

export interface HeroSlot {
  /** Image URL, or null when no image is available. */
  imageUrl: string | null;
  /** Optional name used for <img alt>. */
  alt?: string;
  /** Optional fallback node. When omitted, renders centered initials in
   *  white at 32px (basketball/baseball default). Football overrides with
   *  flag emoji + initials. */
  fallback?: React.ReactNode;
  /** Per-sport img style overrides — merged on top of CardHero's defaults.
   *  Football uses this for per-player portrait adjustments (scale + translate).
   *  Basketball and baseball leave this undefined; the defaults apply. */
  imageStyle?: Pick<React.CSSProperties, "top" | "left" | "width" | "height" | "objectPosition">;
}

interface CardHeroProps {
  hero: HeroSlot;
  initials: string;
  isActiveReveal: boolean;
}

export function CardHero({ hero, initials, isActiveReveal }: CardHeroProps) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const showImage = hero.imageUrl != null && !imgFailed;
  const opacity = isActiveReveal ? 0.15 : 1;

  const fallback = hero.fallback ?? (
    <div
      style={{
        position: "absolute", inset: 0,
        display: "grid", placeItems: "center",
        fontSize: 32, fontWeight: 950,
        color: "rgba(255,255,255,0.50)",
        userSelect: "none",
        opacity, transition: "opacity 0.3s ease",
        pointerEvents: "none",
      }}
    >
      {initials}
    </div>
  );

  return (
    <>
      {fallback}
      {showImage && (
        <img
          key={hero.imageUrl!}
          src={hero.imageUrl!}
          alt={hero.alt ?? ""}
          onError={() => setImgFailed(true)}
          draggable={false}
          style={{
            position: "absolute",
            top: `${HEADSHOT_TOP_PCT}%`,
            left: `${HEADSHOT_LEFT_PCT}%`,
            width: `${HEADSHOT_WIDTH_PCT}%`,
            height: `${HEADSHOT_HEIGHT_PCT}%`,
            objectFit: "cover",
            objectPosition: `${HEADSHOT_OBJECT_X}% ${HEADSHOT_OBJECT_Y}%`,
            ...hero.imageStyle,
            transformOrigin: "top center",
            imageRendering: "auto",
            opacity, transition: "opacity 0.3s ease",
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}
