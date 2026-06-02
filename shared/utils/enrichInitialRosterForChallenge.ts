// shared/utils/enrichInitialRosterForChallenge.ts
//
// Phase 0 challenge-snapshot-enrichment. See
// docs/challenge-landing-v2-phase0-snapshot-enrichment-lock.md (DECISION
// — Path A). Merges sender holds + outcomes from the resolved final
// roster onto the starting hand before serializing into the challenge
// snapshot.
//
// Why this exists: GameView's two roster refs DIVERGE after deal time.
// `initialRosterRef.current` keeps the original deal-time objects (no
// wasHeld / actualFp ever set on them). `rosterRef.current` is reassigned
// to `finalRoster` after resolve and carries live wasHeld + actualFp on
// each card. To persist "the starting hand + what the sender did with
// it" we have to combine them at the create site: keep the starting
// hand's identity (so the recipient is dealt the same hand) but copy the
// sender's wasHeld + actualFp from the resolved card with the same
// basePlayerId.
//
// Discarded starting cards (sender redrew the slot) have no resolved
// counterpart by basePlayerId — they stay wasHeld:false, actualFp:0.
// That's correct: those cards were never played; the landing only reads
// actualFp on held cards for disagreement copy.

import type { GeneratedCard } from "@shared/types/index";

export function enrichInitialRosterForChallenge(
  initialRoster: GeneratedCard[],
  resolvedRoster: GeneratedCard[],
): GeneratedCard[] {
  return initialRoster.map((startCard, i) => {
    // Primary key: basePlayerId. A held card carries its starting
    // basePlayerId through to the resolved roster. A discarded card's
    // basePlayerId is absent from the resolved roster.
    const byId = resolvedRoster.find(
      (r) => r.basePlayerId === startCard.basePlayerId,
    );
    // Fallback: slotIndex match, but only when the resolved slot is
    // wasHeld:true. Without the wasHeld gate, a redrawn (different
    // player) card in the same slot would falsely match and bleed its
    // wasHeld:false / actualFp onto the discarded starting card — a
    // silent miscount of "what the sender held."
    const startSlot = (startCard as { slotIndex?: number }).slotIndex ?? i;
    const bySlotHeld = byId
      ? null
      : resolvedRoster.find(
          (r) =>
            ((r as { slotIndex?: number }).slotIndex ?? -1) === startSlot &&
            (r as { wasHeld?: boolean }).wasHeld === true,
        );
    const match = byId ?? bySlotHeld;
    if (!match) {
      return {
        ...startCard,
        wasHeld: false,
        actualFp: 0,
      };
    }
    return {
      ...startCard,
      wasHeld: (match as { wasHeld?: boolean }).wasHeld === true,
      actualFp: Number((match as { actualFp?: number }).actualFp ?? 0),
    };
  });
}
