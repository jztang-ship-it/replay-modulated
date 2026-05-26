/**
 * basketball/src/dev/H2HRevealMockRoute.tsx
 *
 * Dev-only mount for the phase-2 static H2H reveal. Wires the basketball
 * mock fixture into the sport-agnostic H2HRevealScreen with AthleteCard
 * as the battlefield card renderer.
 *
 * Mounted at pathname /basketball/dev/h2h-reveal-mock via regex match
 * in basketball/src/App.tsx. Production users have no entry point to
 * /dev/* paths.
 *
 * Phase 4 will replace the fixture import with a fetch against
 * /api/challenge/{id}/sender-hand; the same renderCard wiring + the
 * same H2HRevealScreen component carry forward.
 */

import { H2HRevealScreen, type H2HCard, type CardRenderer } from "@shared/components/H2HRevealScreen";
import { AthleteCard } from "../components/AthleteCard";
import { SENDER_HAND, RECIPIENT_HAND } from "./h2hMockFixture";
import type { PlayerCard } from "../adapters/types";

// AthleteCard wrapper that adapts the H2HCard shape into the props
// AthleteCard expects for a static post-reveal render.
//
// Props chosen for static end-state:
//   phase="RESULTS"         — CardFront treats this as fully revealed (FP
//                              shown, no count-up needed, tier colors
//                              visible from mount).
//   isFlipped=false         — front face. H2H design doc locks "no flip
//                              in reveal arc"; flip lives only in the
//                              results overlay (phase 6).
//   canFlip=false           — disable the tap-to-flip mechanic.
//   locked=card.wasHeld     — drives the existing gold corner triangle
//                              "H" indicator inside CardFront.tsx:857.
//                              No new visual needed for held cards.
//   heldFpVisible=true      — bypass the held-card FP-fade-in gate
//                              (CardFront.tsx:582) since phase 2 is
//                              fully-revealed end-state from mount.
//   isMvp/isSpotlight/etc.  — left default. Animation-time props don't
//                              apply to static render.
const renderBattlefieldCard: CardRenderer = (card: H2HCard) => (
  <AthleteCard
    card={card as unknown as PlayerCard}
    phase={"RESULTS" as any}
    isFlipped={false}
    canFlip={false}
    locked={card.wasHeld}
    heldFpVisible={true}
    badges={card.achievements}
  />
);

export function H2HRevealMockRoute() {
  return (
    <H2HRevealScreen
      sender={SENDER_HAND}
      recipient={RECIPIENT_HAND}
      renderCard={renderBattlefieldCard}
    />
  );
}

export default H2HRevealMockRoute;
