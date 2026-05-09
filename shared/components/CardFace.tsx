/**
 * shared/components/CardFace.tsx
 *
 * Single canonical card component for every sport. Orchestrates:
 *   PlayerCardShell  → flip + locks + glow + overlay state
 *   CardFront        → notched front face + tier gradient + badges + fire/ice
 *   CardHero         → image + initials/flag fallback (positioning shared)
 *   CardBack         → date/opp + FP + badges + stat-tile grid
 *
 * Sport responsibility (the *only* per-sport surface area for card UI):
 *   - getHero(card)            → { imageUrl, alt?, fallback? }
 *   - getStatTiles(card)       → ordered StatTile[]
 *   - getDisplayPosition(card) → string or ReactNode (e.g. baseball BatGlyph)
 *   - showStatTileFp           → opt-in per-tile FP attribution (football yes)
 *
 * Sport wrappers (AthleteCard / BaseballCard / SoccerCard) shrink to a few
 * lines that build these slots from the SportAdapter and forward props.
 */

import type { CardShellProps, CardFrontProps as ShellFrontProps, CardBackProps as ShellBackProps } from "./PlayerCardShell";
import { PlayerCardShell } from "./PlayerCardShell";
import { CardFront, type CardFrontHeroProps } from "./CardFront";
import { CardHero, type HeroSlot } from "./CardHero";
import { CardBack, type StatTile } from "./CardBack";
import type { TopGameTier } from "../commentary/types";
import type { PlayerCard } from "@shared/types";

export type { HeroSlot, StatTile };

export interface CardFaceSlots {
  getHero: (card: PlayerCard) => HeroSlot;
  getStatTiles: (card: PlayerCard) => StatTile[];
  getDisplayPosition: (card: PlayerCard) => React.ReactNode;
  showStatTileFp?: boolean;
}

export interface CardFaceProps extends Omit<CardShellProps, "renderFront" | "renderBack">, CardFaceSlots {
  /** Top Games tier — drives shimmer/stamp/recoil. null = no top-game treatment. */
  topGameTier?: TopGameTier | null;
}

export function CardFace(props: CardFaceProps) {
  const {
    getHero, getStatTiles, getDisplayPosition, showStatTileFp,
    topGameTier,
    ...shell
  } = props;

  return (
    <PlayerCardShell
      {...shell}
      renderFront={(p: ShellFrontProps) => (
        <CardFront
          {...p}
          topGameTier={topGameTier ?? null}
          displayPosition={getDisplayPosition(p.card)}
          renderHero={(heroProps: CardFrontHeroProps) => (
            <CardHero hero={getHero(heroProps.card)} initials={heroProps.initials} isActiveReveal={heroProps.isActiveReveal} />
          )}
        />
      )}
      renderBack={(p: ShellBackProps) => (
        <CardBack
          card={p.card}
          tiles={getStatTiles(p.card)}
          showStatTileFp={!!showStatTileFp}
          topGameTier={topGameTier ?? null}
        />
      )}
    />
  );
}
