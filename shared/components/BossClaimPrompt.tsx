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
import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "@shared/auth/useAuth";
import { isClaimPromptEligible, setLastPromptedBossId } from "@shared/utils/bossClaimPrompt";

// Lazy like GameView's RegisterModal mount — keeps auth off the boss-reveal chunk.
const RegisterModal = lazy(() =>
  import("./RegisterModal").then((m) => ({ default: m.RegisterModal })),
);

const FF = "'Rajdhani','Arial Narrow',sans-serif";

interface Props {
  /** boss bank id (e.g. "DET-0304"); team token = split("-")[0]. */
  bossIdentityId?: string;
  /** inline live-win (myScore >= targetScore) — the immediate decision. */
  won: boolean;
  /** breathe elapsed — parent gates the ~1.5-2s post-celebration timing. */
  active: boolean;
  /** parent close (clears the card region). */
  onDismiss: () => void;
}

export function BossClaimPrompt({ bossIdentityId, won, active, onDismiss }: Props) {
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
      style={{
        width: "100%", maxWidth: 420, margin: "10px auto 0",
        padding: "14px 16px", borderRadius: 14,
        border: "1px solid rgba(255,177,74,0.45)", background: "rgba(255,177,74,0.08)",
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 4,
      }}
    >
      <div style={{ fontSize: 19, fontWeight: 950, color: "#EAF0FF", fontFamily: FF, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {team} down.
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(234,240,255,0.75)", marginBottom: 8 }}>
        Want it on the record?
      </div>
      <div style={{ display: "flex", gap: 10, width: "100%" }}>
        <button
          data-testid="boss-claim-primary"
          onClick={() => setShowModal(true)}
          style={{
            flex: 1, padding: "13px", borderRadius: 12, border: "none",
            background: "#FFB14A", color: "#070A12", fontSize: 14, fontWeight: 900, cursor: "pointer",
          }}
        >
          Put it on the record
        </button>
        <button
          data-testid="boss-claim-secondary"
          onClick={dismiss}
          style={{
            flex: "0 0 auto", padding: "13px 16px", borderRadius: 12, cursor: "pointer",
            background: "transparent", border: "1px solid rgba(255,255,255,0.22)",
            color: "rgba(234,240,255,0.8)", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
          }}
        >
          Maybe later
        </button>
      </div>

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
