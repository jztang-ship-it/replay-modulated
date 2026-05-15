// shared/components/NotificationsPanel.tsx
//
// Simple bottom-sheet listing the user's recent in-app notifications.
// Tap a row → caller hooks the row's payload into the challenge-back
// flow (sets challengeBackCtx targeting the attempter, closes the
// panel, deals a fresh normal hand). The share prompt at that hand's
// results fires as a back-challenge.

import type { ChallengeNotification } from "@shared/hooks/useChallengeNotifications";
import { isRealName } from "@shared/utils/isRealName";

interface Props {
  notifications: ChallengeNotification[];
  onClose: () => void;
  onTapNotification: (n: ChallengeNotification) => void;
}

function relativeTime(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const diffMs = Date.now() - t;
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    return `${d}d ago`;
  } catch { return ""; }
}

function notificationCopy(n: ChallengeNotification): { title: string; sub: string } {
  if (n.type === "challenge_attempted") {
    const p = n.payload ?? {};
    const realName = isRealName(p.attempter_name) ? p.attempter_name : null;
    const subject = realName ?? "Someone";
    const isWinner = Boolean(p.is_winner);
    const delta = isWinner
      ? Math.abs(Number(p.attempter_score ?? 0) - Number(p.target_score ?? 0)).toFixed(1)
      : Math.abs(Number(p.target_score ?? 0) - Number(p.attempter_score ?? 0)).toFixed(1);
    const title = isWinner
      ? `${subject} beat your challenge by ${delta} FP.`
      : `${subject} took a swing at your challenge and missed.`;
    const sub = isWinner ? "Run it back?" : "Challenge them back?";
    return { title, sub };
  }
  return { title: "Notification", sub: "" };
}

export function NotificationsPanel({ notifications, onClose, onTapNotification }: Props) {
  return (
    <>
      <style>{`
        @keyframes notifSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9599,
        }}
      />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9600,
        maxHeight: "75vh", overflowY: "auto",
        background: "#0D1117",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "16px 16px 0 0",
        padding: "16px 18px calc(20px + env(safe-area-inset-bottom, 0px))",
        animation: "notifSlideUp 320ms cubic-bezier(0.32, 0.72, 0, 1) both",
        color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "#FFB14A" }}>
            Activity
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, padding: "4px 10px",
              color: "rgba(255,255,255,0.55)", fontSize: 13, cursor: "pointer",
            }}
          >Close</button>
        </div>

        {notifications.length === 0 ? (
          <div style={{ padding: "32px 8px", textAlign: "center", color: "rgba(255,255,255,0.45)", fontSize: 13 }}>
            No activity yet. Challenge a friend to start a rivalry.
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {notifications.map(n => {
              const { title, sub } = notificationCopy(n);
              const unread = n.read_at == null;
              return (
                <li key={n.notification_id}>
                  <button
                    onClick={() => onTapNotification(n)}
                    style={{
                      width: "100%", textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: unread ? "rgba(255,177,74,0.10)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${unread ? "rgba(255,177,74,0.35)" : "rgba(255,255,255,0.1)"}`,
                      color: "#EAF0FF", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 14,
                      display: "flex", flexDirection: "column", gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 700 }}>{title}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                    {sub && (
                      <div style={{ fontSize: 12, color: unread ? "#FFB14A" : "rgba(255,255,255,0.55)", fontWeight: 600 }}>
                        {sub}
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
