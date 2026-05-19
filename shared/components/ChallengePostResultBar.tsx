// shared/components/ChallengePostResultBar.tsx
//
// Persistent bottom action bar shown when the user has dismissed the
// challenge comparison sheet but is still in the post-result limbo —
// challenge cards visible on the game surface, no fresh hand started
// yet. State-appropriate CTAs:
//   WIN          → [Send It Back] + [DEAL]
//   LOSS_OPEN    → [Try Again] + [DEAL]
//   LOSS_CLOSED  → [DEAL] only
//
// Also renders the trash-talk chip above the bar (item 8). Chip
// auto-clears after 10 seconds; tap to clear sooner. The bar persists
// until the user enters a new hand (DEAL) or navigates away.

import { useEffect, useState } from "react";

export type PostResultState = "WIN" | "LOSS_OPEN" | "LOSS_CLOSED";

interface Props {
  state: PostResultState;
  /** Trash-talk line carried over from the comparison sheet. Same line
   *  the sheet used, so the chip reads as continuation. */
  trashTalk: string | null;
  /** Re-summons the comparison sheet (collapsed → visible). */
  onSeeResult: () => void;
  /** Win-state primary CTA — routes to fresh hand + challengeBackCtx. */
  onSendItBack: () => void;
  /** Loss-window-open primary CTA — replays the snapshot. */
  onTryAgain: () => void;
  /** Universal "leave challenge mode, deal a fresh normal hand" path.
   *  Bound to the secondary CTA in every state. */
  onDeal: () => void;
}

const CHIP_AUTO_DISMISS_MS = 10_000;

export function ChallengePostResultBar({
  state, trashTalk, onSeeResult, onSendItBack, onTryAgain, onDeal,
}: Props) {
  const [chipVisible, setChipVisible] = useState(true);

  // Reset chip visibility when the trash-talk line changes (e.g. user
  // re-summons sheet then dismisses again on a new attempt). Also
  // schedule the 10s auto-dismiss.
  useEffect(() => {
    if (!trashTalk) { setChipVisible(false); return; }
    setChipVisible(true);
    const id = setTimeout(() => setChipVisible(false), CHIP_AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [trashTalk]);

  const hasPrimaryCta = state !== "LOSS_CLOSED";
  const primaryLabel = state === "WIN" ? "Send It Back" : "Try Again";
  const primaryAction = state === "WIN" ? onSendItBack : onTryAgain;

  return (
    <>
      {/* Trash-talk chip — floats above the action bar. Tap to dismiss. */}
      {chipVisible && trashTalk && (
        <button
          onClick={() => setChipVisible(false)}
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
            zIndex: 9498,
            maxWidth: "calc(100vw - 32px)",
            padding: "8px 14px",
            borderRadius: 999,
            background: "rgba(13,17,23,0.92)",
            border: "1px solid rgba(255,177,74,0.35)",
            color: "#FFB14A",
            fontSize: 13, fontWeight: 700, lineHeight: 1.3,
            cursor: "pointer",
            fontFamily: "'Inter', system-ui, sans-serif",
            boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
          }}
          aria-label="Dismiss trash talk"
        >{trashTalk}</button>
      )}

      {/* Persistent action bar — bottom of screen, above safe-area inset. */}
      <div
        style={{
          position: "fixed",
          left: 0, right: 0, bottom: 0,
          zIndex: 9497,
          padding: "10px 12px calc(10px + env(safe-area-inset-bottom, 0px))",
          background: "linear-gradient(0deg, rgba(7,10,18,0.96) 0%, rgba(7,10,18,0.86) 80%, rgba(7,10,18,0) 100%)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* "See result" — re-summons the sheet. Small icon-style on the left. */}
        <button
          onClick={onSeeResult}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.65)",
            fontSize: 12, fontWeight: 700,
            cursor: "pointer", lineHeight: 1,
          }}
          aria-label="See result"
        >ⓘ Result</button>

        {/* Primary state-CTA (omitted in LOSS_CLOSED — just DEAL there). */}
        {hasPrimaryCta && (
          <button
            onClick={primaryAction}
            style={{
              flex: 1,
              padding: "13px",
              borderRadius: 12,
              background: "#FFB14A",
              border: "none",
              color: "#070A12",
              fontSize: 15, fontWeight: 900,
              cursor: "pointer", lineHeight: 1,
            }}
          >{primaryLabel}</button>
        )}

        {/* DEAL — universal path to a fresh normal hand. */}
        <button
          onClick={onDeal}
          style={{
            flex: hasPrimaryCta ? 0 : 1,
            padding: "13px 18px",
            borderRadius: 12,
            background: hasPrimaryCta ? "transparent" : "#FFB14A",
            border: hasPrimaryCta ? "1px solid rgba(255,255,255,0.2)" : "none",
            color: hasPrimaryCta ? "rgba(255,255,255,0.75)" : "#070A12",
            fontSize: 14, fontWeight: 800,
            cursor: "pointer", lineHeight: 1,
            letterSpacing: 1,
          }}
        >DEAL</button>
      </div>
    </>
  );
}
