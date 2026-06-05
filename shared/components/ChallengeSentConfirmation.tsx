// shared/components/ChallengeSentConfirmation.tsx
//
// Sender-side post-share confirmation, consolidated modal (rev 2,
// 2026-06-05). Used by the OAuth-resume path (ResumeShareSurface fires
// onResumeChallengeCreated → App renders this) because that path can't
// fall back to the signed-in path's implicit confirmation (the RESULTS-
// phase ChallengeSharePrompt with "Link Copied! ✓"): Supabase's full-
// page redirect re-mounts GameView in IDLE, so the share strip is gone
// by the time the resume handler finishes.
//
// Layout top→bottom:
//   - Header (title slot + close X)
//   - Message preview = shareHeadline rendered AS-IS. Empty slot when
//     the prop is empty. NO fallback copy authored here.
//   - Read-only, selectable share-link field showing shareUrl.
//   - 3×2 grid: X / Facebook / Bluesky / WhatsApp / Telegram / Reddit.
//     Each opens its shareIntents URL in a new tab via
//     window.open(url, "_blank", "noopener").
//   - Full-width Copy link bar reusing COPY_LINK_LABEL /
//     LINK_COPIED_LABEL. On-gesture clipboard write.
//
// NOT the recipient take-challenge page (`/${sport}/challenge/${id}`).
// This is the sender's surface.
//
// Hard rule (per build lock): no imports from shared/commentary/,
// shared/utils/, shared/data/, api/, or shared/hooks/useChallengeShare.
// Share-message strings are passed in by value via the shareHeadline
// prop; this file authors NO share copy.

import { useState } from "react";
import {
  COPY_LINK_LABEL,
  LINK_COPIED_LABEL,
  SHARE_X_LABEL,
  SHARE_FACEBOOK_LABEL,
  SHARE_BLUESKY_LABEL,
  SHARE_WHATSAPP_LABEL,
  SHARE_TELEGRAM_LABEL,
  SHARE_REDDIT_LABEL,
} from "@shared/components/shareCopyLabels";
import {
  twitterUrl,
  facebookUrl,
  blueskyUrl,
  whatsAppUrl,
  telegramUrl,
  redditUrl,
} from "@shared/components/shareIntents";

interface Props {
  shareUrl: string;
  sport: string;
  /** Pre-resolved share message string from upstream (effectiveHeadline:
   *  authored line when available, bank fallback otherwise). Rendered
   *  AS-IS in the preview slot — empty string renders an empty slot, no
   *  fallback text invented. */
  shareHeadline: string;
  onDismiss: () => void;
}

export function ChallengeSentConfirmation({
  shareUrl, sport, shareHeadline, onDismiss,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    // User gesture — clipboard.writeText is reliable here even on the
    // post-OAuth surface.
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // Clipboard refused (permissions, http context, etc.). Leave the
      // URL visible in the field so the user can manually select+copy.
    }
  };

  const openIntent = (url: string) => {
    // noopener — never expose window.opener to the target tab.
    try { window.open(url, "_blank", "noopener"); } catch { /* popup blocked */ }
  };

  const destinations: Array<{ key: string; label: string; url: string }> = [
    { key: "x",        label: SHARE_X_LABEL,        url: twitterUrl(shareHeadline, shareUrl) },
    { key: "facebook", label: SHARE_FACEBOOK_LABEL, url: facebookUrl(shareUrl) },
    { key: "bluesky",  label: SHARE_BLUESKY_LABEL,  url: blueskyUrl(shareHeadline, shareUrl) },
    { key: "whatsapp", label: SHARE_WHATSAPP_LABEL, url: whatsAppUrl(shareHeadline, shareUrl) },
    { key: "telegram", label: SHARE_TELEGRAM_LABEL, url: telegramUrl(shareHeadline, shareUrl) },
    { key: "reddit",   label: SHARE_REDDIT_LABEL,   url: redditUrl(shareHeadline, shareUrl) },
  ];

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
      <div
        style={{
          background: "#1a1a2e", borderRadius: 16,
          padding: "20px 20px 24px",
          color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
          maxWidth: 460, width: "100%",
          display: "flex", flexDirection: "column", gap: 14,
          boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
        }}
      >
        {/* Header: title slot + close (X). Title slot is structurally
            present (left flex child) but renders nothing — glass review
            may add a title element later. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 28 }}>
          <div data-testid="challenge-sent-title-slot" />
          <button
            onClick={onDismiss}
            aria-label="Close"
            style={{
              background: "transparent", border: "none",
              color: "rgba(255,255,255,0.55)", fontSize: 20,
              cursor: "pointer", padding: "2px 6px", lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Message preview — shareHeadline AS-IS. Empty slot when the
            prop is empty; NO fallback copy. */}
        <div
          data-testid="challenge-sent-message"
          style={{
            fontSize: 14, lineHeight: 1.45,
            color: "#EAF0FF",
          }}
        >
          {shareHeadline}
        </div>

        {/* Read-only, selectable share-link field. <input readOnly> keeps
            it tab-focusable and select-all-friendly. */}
        <input
          type="text"
          value={shareUrl}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          data-testid="challenge-sent-share-url"
          aria-label="Share link"
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, padding: "10px 12px",
            color: "rgba(234,240,255,0.92)",
            fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        />

        {/* 3×2 destination grid */}
        <div
          data-testid="challenge-sent-destinations"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          {destinations.map(({ key, label, url }) => (
            <button
              key={key}
              onClick={() => openIntent(url)}
              data-share-destination={key}
              style={{
                padding: "10px 8px", borderRadius: 10,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#EAF0FF",
                fontSize: 13, fontWeight: 600,
                cursor: "pointer", letterSpacing: 0.3,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Full-width Copy link bar */}
        <button
          onClick={handleCopy}
          data-testid="challenge-sent-copy"
          style={{
            width: "100%", padding: 14, borderRadius: 12,
            background: "#FFB14A", border: "none", color: "#070A12",
            fontSize: 15, fontWeight: 900, letterSpacing: 0.5,
            cursor: "pointer",
          }}
        >
          {copied ? LINK_COPIED_LABEL : COPY_LINK_LABEL}
        </button>
      </div>
    </div>
  );
}
