// shared/inbox/BellSheet.tsx
// Slim popover triggered by the header bell. Shows latest 3 messages + "View all on Profile →".
// Same fetch on open; no realtime subscription.

import { useEffect, useState } from "react";
import { listMessages, markRead, type InboxMessage } from "./inbox";
import { track } from "@shared/analytics/analytics";

type Props = {
  userId: string;
  onClose: () => void;
  onViewAll: () => void;
};

export function BellSheet({ userId, onClose, onViewAll }: Props) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    listMessages(userId).then((all) => {
      if (cancelled) return;
      setMessages(all.slice(0, 3));
      setLoading(false);
      const unread = all.filter((m) => m.read_at == null).length;
      track('inbox', 'opened', { source: 'bell', unread_count: unread }, 'system');
      // Auto-mark visible-in-popover as read after 1.5s
      timer = setTimeout(() => {
        if (cancelled) return;
        all.slice(0, 3).filter((m) => m.read_at == null).forEach((m) => {
          markRead(m.id);
          track('inbox', 'message_read', { message_type: m.message_type }, 'system');
        });
      }, 1500);
    });
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [userId]);

  return (
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, zIndex: 90, background: "transparent",
      }} />
      <div style={{
        position: "fixed", top: 56, right: 12,
        width: 320, maxWidth: "calc(100vw - 24px)",
        background: "#11192b", border: "1px solid #2a3550", borderRadius: 10,
        boxShadow: "0 12px 28px rgba(0,0,0,0.55)", zIndex: 100,
        padding: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#EAF0FF", letterSpacing: 0.5 }}>📬 INBOX</div>
          <span onClick={onClose} style={{ fontSize: 14, color: "#7c8aa3", cursor: "pointer" }}>×</span>
        </div>

        {loading && <div style={{ fontSize: 11, color: "#7c8aa3", padding: 8 }}>Loading...</div>}

        {!loading && messages.length === 0 && (
          <div style={{ fontSize: 11, color: "#7c8aa3", padding: 12, textAlign: "center" }}>
            No messages yet.
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} style={{
            border: "1px solid #2a3550", borderRadius: 6, padding: 8, marginBottom: 6,
            background: m.read_at == null ? "rgba(239,68,68,0.04)" : "#0d1320",
          }}>
            {m.payload.title && (
              <div style={{ fontSize: 11, fontWeight: 700, color: "#EAF0FF", marginBottom: 2 }}>
                {iconFor(m.message_type)} {m.payload.title}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.4 }}>{m.payload.body}</div>
          </div>
        ))}

        <div style={{
          marginTop: 8, paddingTop: 8, borderTop: "1px dashed #2a3550",
          textAlign: "right", fontSize: 11, color: "#FFB14A", cursor: "pointer",
        }} onClick={() => { onViewAll(); onClose(); }}>
          View all on Profile →
        </div>
      </div>
    </>
  );
}

function iconFor(type: InboxMessage["message_type"]): string {
  switch (type) {
    case 'welcome':     return '👋';
    case 'big_win':     return '🎉';
    case 'bonus_pool':  return '💰';
    case 'promo':       return '📢';
    case 'survey':      return '📋';
  }
}
