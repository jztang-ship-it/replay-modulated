// shared/components/SenderLegacyFallbackCard.tsx
//
// Phase 5b commit 3 (2026-05-28): minimal text-summary card shown on the
// sender side when the notification payload lacks `attempter_roster` —
// either a pre-commit-2 legacy notification, or a path where the
// sender-hand fetch failed/returned `sender_resolved:false`. The full
// H2HResultsOverlay needs both hands to render meaningfully; without
// them, this card carries the same information in flat text and
// preserves the placeholder CTA so behavior stays consistent.
//
// ChallengeComparisonScreen is NOT reusable here — it fires
// useChallengeAttempt-on-mount (would write a duplicate attempt row from
// the sender's identity) and its copy + 1-hour-window logic assumes
// recipient-just-played semantics. See commit 3 investigation report.

import { isRealName } from "@shared/utils/isRealName";

export interface SenderLegacyFallbackCardProps {
  /** The notification payload — same shape attempt.ts writes (commit 2). */
  payload: Record<string, any>;
  onPlayAnother: () => void;
  onDismiss: () => void;
}

export function SenderLegacyFallbackCard({ payload, onPlayAnother, onDismiss }: SenderLegacyFallbackCardProps) {
  const realName = isRealName(payload?.attempter_name) ? String(payload.attempter_name) : null;
  const subject = realName ?? "Someone";
  const attempterScore = Number(payload?.attempter_score ?? 0);
  const targetScore = Number(payload?.target_score ?? 0);
  const isAttempterWinner = Boolean(payload?.is_winner);
  const deltaAbs = Math.abs(attempterScore - targetScore).toFixed(1);

  const headline = isAttempterWinner
    ? `${subject} beat your challenge by ${deltaAbs} FP.`
    : `${subject} took a swing and missed by ${deltaAbs} FP.`;

  const headlineColor = isAttempterWinner ? "#EF4444" : "#22C55E";

  return (
    <div
      data-h2h-sender-legacy-fallback="true"
      data-is-winner={isAttempterWinner ? "true" : "false"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9100,
        background: "linear-gradient(180deg, #070A12 0%, #0A1020 38%, #070A12 100%)",
        color: "#EAF0FF",
        fontFamily: "'Inter', system-ui, sans-serif",
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(env(safe-area-inset-top, 0px) + 20px) 24px calc(env(safe-area-inset-bottom, 0px) + 20px)",
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        data-h2h-sender-fallback-close="true"
        onClick={onDismiss}
        aria-label="Close"
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 14px)",
          right: 14,
          width: 32,
          height: 32,
          borderRadius: 16,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          color: "rgba(255,255,255,0.55)",
          fontSize: 16,
          fontWeight: 700,
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ×
      </button>

      <div style={{ textAlign: "center", maxWidth: 380, display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          data-h2h-sender-fallback-headline="true"
          style={{
            fontSize: 22,
            fontWeight: 900,
            lineHeight: 1.2,
            color: headlineColor,
            letterSpacing: 0.2,
          }}
        >
          {headline}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 28,
            paddingTop: 4,
            color: "rgba(255,255,255,0.85)",
            fontSize: 14,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
              {subject}
            </span>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{attempterScore.toFixed(1)}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
              Your target
            </span>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{targetScore.toFixed(1)}</span>
          </div>
        </div>

        <button
          type="button"
          data-h2h-sender-fallback-cta="true"
          onClick={onPlayAnother}
          style={{
            marginTop: 12,
            padding: "14px 24px",
            borderRadius: 12,
            border: "none",
            background: "#FFB14A",
            color: "#0A0F1C",
            fontFamily: "inherit",
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Play another hand
        </button>
      </div>
    </div>
  );
}
