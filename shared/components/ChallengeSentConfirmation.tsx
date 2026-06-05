// shared/components/ChallengeSentConfirmation.tsx
//
// Sender-side post-share confirmation. Used by the OAuth-resume path
// (ResumeShareSurface fires onResumeChallengeCreated → App renders this)
// because that path can't fall back to the signed-in path's implicit
// confirmation (the RESULTS-phase GameView with ChallengeSharePrompt
// showing "Link Copied! ✓"): Supabase's full-page redirect re-mounts
// GameView in IDLE, so the share strip is gone by the time the resume
// handler finishes.
//
// Deliberately undesigned: a minimal overlay card with the share URL
// and a Copy link button. NOT the recipient take-challenge page
// (`/${sport}/challenge/${id}`) — this is the sender's surface.

import { useState } from "react";
import { COPY_LINK_LABEL, LINK_COPIED_LABEL } from "@shared/components/shareCopyLabels";

interface Props {
  shareUrl: string;
  sport: string;
  onDismiss: () => void;
}

export function ChallengeSentConfirmation({ shareUrl, sport, onDismiss }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    // User gesture — clipboard.writeText is allowed here even on the
    // post-OAuth surface (the auto-share/clipboard attempt inside
    // ResumeShareSurface.handlePostChallenge runs without a fresh user
    // gesture and may silently fail on some browsers; this button is the
    // reliable path).
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // Clipboard refused (permissions, http context, etc.). Leave the
      // URL visible so the user can long-press / select-copy manually.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-sport={sport}
      data-testid="challenge-sent-confirmation"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        padding: 20,
      }}
    >
      <div style={{
        background: "#1a1a2e", borderRadius: 16, padding: "24px 20px",
        color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
        maxWidth: 420, width: "100%",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div
          data-testid="challenge-sent-share-url"
          style={{
            fontSize: 13, lineHeight: 1.4, wordBreak: "break-all",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "10px 12px",
            color: "rgba(234,240,255,0.85)",
          }}
        >
          {shareUrl}
        </div>
        <button
          onClick={handleCopy}
          style={{
            width: "100%", padding: 14, borderRadius: 12,
            background: "#FFB14A", border: "none", color: "#070A12",
            fontSize: 15, fontWeight: 900, letterSpacing: 0.5,
            cursor: "pointer",
          }}
        >
          {copied ? LINK_COPIED_LABEL : COPY_LINK_LABEL}
        </button>
        <button
          onClick={onDismiss}
          style={{
            width: "100%", padding: 10, borderRadius: 10,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.7)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
