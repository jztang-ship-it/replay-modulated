/**
 * shared/components/BossClaimPrompt.tsx
 *
 * Post-win boss "claim" prompt — a small in-flow card (NOT a wall) mounted as a
 * sibling in the boss ctaSlot of H2HRecipientReveal. Surfaces ~1.5-2s after the
 * win celebration breathes (the parent gates `active` off onArcResolved + a
 * surface-local breathe timer).
 *
 * Eligibility (shared/utils/bossClaimPrompt): won(current) && !baseline.has &&
 * current !== lastPrompted && !registered (registered = !isAnonymous, any auth
 * path) — OR ?claim=force in DEV. Once shown it LATCHES (renders on `shown`, not
 * live eligibility) so registration flipping isAnonymous can't unmount the modal
 * mid-flow.
 *
 * "Put it on the record" → RegisterModal (the existing auth surface). "Maybe
 * later" → write lastPromptedBossId + dismiss (same boss never re-prompts; a NEW
 * boss win re-arms via the fresh boss id). Card scaffold mirrors BossOutwardEnding.
 *
 * Copy is LOCKED (chat-authored to the boss-story voice) — do not edit.
 */
import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { useAuth } from "@shared/auth/useAuth";
import { isClaimPromptEligible, setLastPromptedBossId } from "@shared/utils/bossClaimPrompt";

// Lazy like GameView's RegisterModal mount — keeps auth off the boss-reveal chunk.
const RegisterModal = lazy(() =>
  import("./RegisterModal").then((m) => ({ default: m.RegisterModal })),
);

const FF = "'Rajdhani','Arial Narrow',sans-serif";

// boss-winscreen-cta (direction A): in CLAIM state the claim card is the single
// amber primary, top of the merged stack; "Maybe later" is a quiet text dismiss
// below it. Presentation only — handlers/gate/testids unchanged.
const CLAIM_PRIMARY_BTN: CSSProperties = {
  width: "100%", maxWidth: 420, padding: "14px", borderRadius: 12, border: "none",
  background: "#FFB14A", color: "#070A12", fontSize: 15, fontWeight: 900, cursor: "pointer",
};
const CLAIM_QUIET_BTN: CSSProperties = {
  background: "transparent", border: "none", color: "rgba(234,240,255,0.55)",
  fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "8px 12px",
};

interface Props {
  /** boss bank id (e.g. "DET-0304"); team token = split("-")[0]. */
  bossIdentityId?: string;
  /** inline live-win (myScore >= targetScore) — the immediate decision. */
  won: boolean;
  /** breathe elapsed — parent gates the ~1.5-2s post-celebration timing. */
  active: boolean;
  /** parent close (clears the card region). */
  onDismiss: () => void;
  /** boss-mobile-fit §2 (2026-06-27): when true, render CHROMELESS — drop the
   *  bordered card (border/bg/padding/margin) and the heading/body ("{team}
   *  down." / "Want it on the record?"), keeping ONLY the claim button row
   *  (+ RegisterModal). Used by the merged anon-win CTA so the claim sits in
   *  the shared scaffold instead of a second bordered card. Gate/latch/dismiss
   *  logic is identical in both modes — composition, not a fork. */
  embedded?: boolean;
  /** boss-winscreen-cta (direction A): presentation-only visibility signal so
   *  the parent merged scaffold can re-rank the sibling BossOutwardEnding
   *  (CLAIM when the claim shows → Challenge demotes to outline; SOCIAL when it
   *  doesn't → Challenge is the amber primary) and swap the helper line. Driven
   *  off the SAME `shown` latch — no second eligibility evaluation, no auth in
   *  the parent. Does NOT touch the gate or the RegisterModal invocation. */
  onVisibilityChange?: (visible: boolean) => void;
}

export function BossClaimPrompt({ bossIdentityId, won, active, onDismiss, embedded = false, onVisibilityChange }: Props) {
  const { isAnonymous, signUp, linkGoogle, signIn, signInGoogle } = useAuth();
  const [shown, setShown] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Latch on first eligible+active so a later isAnonymous flip (registration)
  // can't unmount the open modal. Never un-latches via eligibility — only via
  // dismiss / success below.
  const eligible = isClaimPromptEligible({ bossId: bossIdentityId, won, registered: !isAnonymous });
  useEffect(() => {
    if (active && eligible && !shown) setShown(true);
  }, [active, eligible, shown]);

  // boss-winscreen-cta (direction A): mirror the `shown` latch out to the parent
  // for CTA re-ranking. SEPARATE effect — the gate effect above is untouched.
  useEffect(() => {
    onVisibilityChange?.(shown);
  }, [shown, onVisibilityChange]);

  if (!shown) return null;

  const team = String(bossIdentityId ?? "").split("-")[0];

  const dismiss = () => {
    setLastPromptedBossId(bossIdentityId ?? "");
    setShown(false);
    onDismiss();
  };

  return (
    <div
      data-testid="boss-claim-prompt"
      data-embedded={embedded ? "true" : undefined}
      style={
        embedded
          ? {
              // boss-mobile-fit §2: chromeless — no border/bg/padding/margin,
              // no heading/body. Just the button row, inside the merged
              // scaffold (the merged container owns spacing).
              width: "100%", maxWidth: 420, margin: "0 auto",
              display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6,
            }
          : {
              width: "100%", maxWidth: 420, margin: "10px auto 0",
              padding: "14px 16px", borderRadius: 14,
              border: "1px solid rgba(255,177,74,0.45)", background: "rgba(255,177,74,0.08)",
              display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4,
            }
      }
    >
      {!embedded && (
        <div style={{ fontSize: 19, fontWeight: 950, color: "#EAF0FF", fontFamily: FF, letterSpacing: 0.4, textTransform: "uppercase" }}>
          {team} down.
        </div>
      )}
      {!embedded && (
        <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(234,240,255,0.75)", marginBottom: 8 }}>
          Want it on the record?
        </div>
      )}
      {/* boss-winscreen-cta (direction A): vertical tier — "Put it on the record"
          is the single amber primary (top of the merged stack); "Maybe later" is
          a quiet text dismiss below it. Handlers + testids unchanged. */}
      <button
        data-testid="boss-claim-primary"
        onClick={() => setShowModal(true)}
        style={CLAIM_PRIMARY_BTN}
      >
        Put it on the record
      </button>
      <button
        data-testid="boss-claim-secondary"
        onClick={dismiss}
        style={CLAIM_QUIET_BTN}
      >
        Maybe later
      </button>

      {showModal && (
        <Suspense fallback={null}>
          <RegisterModal
            context="normal"
            claim={{ heading: "Put it on the record", subheading: "It only counts if you save it." }}
            onClose={() => setShowModal(false)}
            onSuccess={() => { setShowModal(false); setShown(false); onDismiss(); }}
            signUp={signUp}
            linkGoogle={linkGoogle}
            signIn={signIn}
            signInGoogle={signInGoogle}
          />
        </Suspense>
      )}
    </div>
  );
}
