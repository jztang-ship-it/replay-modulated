// shared/inbox/InboxCard.tsx
// Inline inbox card on Profile. Renders all messages. Auto-marks read 1.5s after mount.
// Anonymous variant renders a sign-up nudge instead.
// Feedback footer link is feature-flag gated.

import { useEffect, useState } from "react";
import {
  listMessages, markRead, submitSurveyResponse,
  type InboxMessage, type SurveyPayload,
} from "./inbox";
import { track } from "@shared/analytics/analytics";

const FEEDBACK_FLAG = (import.meta.env.VITE_FEATURE_FEEDBACK_FORM ?? "0") === "1";

type Props = {
  userId: string;
  isAnonymous: boolean;
  onSaveAccount: () => void;
  onOpenFeedback: () => void;
};

export function InboxCard({ userId, isAnonymous, onSaveAccount, onOpenFeedback }: Props) {
  if (isAnonymous) {
    return <InboxAnonPlaceholder onSaveAccount={onSaveAccount} />;
  }
  return <InboxCardSignedIn userId={userId} onOpenFeedback={onOpenFeedback} />;
}

// ---------- Anonymous placeholder ----------

function InboxAnonPlaceholder({ onSaveAccount }: { onSaveAccount: () => void }) {
  return (
    <div style={{
      border: "1px solid #2a3550", borderRadius: 10, padding: 14, background: "#11192b",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#EAF0FF", marginBottom: 6 }}>📬 INBOX</div>
      <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.45, marginBottom: 10 }}>
        Save your account to start receiving messages from the team — recaps, news, and the occasional question.
      </div>
      <button onClick={onSaveAccount} style={{
        background: "#FFB14A", color: "#0d1320", border: "none", borderRadius: 6,
        padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
      }}>Save account</button>
    </div>
  );
}

// ---------- Signed-in card ----------

function InboxCardSignedIn({ userId, onOpenFeedback }: { userId: string; onOpenFeedback: () => void }) {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    listMessages(userId).then((all) => {
      if (cancelled) return;
      setMessages(all);
      setLoading(false);
      const unread = all.filter((m) => m.read_at == null).length;
      track('inbox', 'opened', { source: 'profile', unread_count: unread }, 'system');
      timer = setTimeout(() => {
        if (cancelled) return;
        all.filter((m) => m.read_at == null).forEach((m) => {
          markRead(m.id);
          track('inbox', 'message_read', { message_type: m.message_type }, 'system');
        });
      }, 1500);
    });
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [userId]);

  const unreadCount = messages.filter((m) => m.read_at == null).length;
  const hasUnread = unreadCount > 0;

  return (
    <div style={{
      border: hasUnread ? "2px solid #EF4444" : "1px solid #2a3550",
      borderRadius: 10, padding: 14,
      background: hasUnread ? "rgba(239,68,68,0.04)" : "#11192b",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#EAF0FF", letterSpacing: 0.5 }}>
          📬 INBOX{hasUnread ? ` · ${unreadCount} new` : ""}
        </div>
      </div>

      {loading && <div style={{ fontSize: 11, color: "#7c8aa3", padding: 8 }}>Loading...</div>}

      {!loading && messages.length === 0 && (
        <div style={{ fontSize: 11, color: "#7c8aa3", padding: 12, textAlign: "center" }}>
          No messages yet — we'll be in touch.
        </div>
      )}

      {messages.map((m) => <MessageItem key={m.id} message={m} />)}

      <div style={{
        marginTop: 10, paddingTop: 8, borderTop: "1px dashed #2a3550",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        {FEEDBACK_FLAG ? (
          <span onClick={() => { onOpenFeedback(); track('inbox', 'feedback_modal_opened', {}, 'system'); }}
                style={{ fontSize: 11, color: "#FFB14A", cursor: "pointer" }}>
            💬 Send feedback ✏️
          </span>
        ) : <span />}
        <span style={{ fontSize: 10, color: "#7c8aa3" }}>
          {messages.length} message{messages.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

// ---------- Single message renderer ----------

function MessageItem({ message }: { message: InboxMessage }) {
  const isUnread = message.read_at == null;
  const survey = message.payload.survey;

  return (
    <div style={{
      border: survey ? "1px solid #FFB14A" : "1px solid #2a3550",
      borderRadius: 6, padding: 8, marginTop: 6,
      background: isUnread ? "rgba(239,68,68,0.04)" : "#0d1320",
    }}>
      {message.payload.title && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#EAF0FF", marginBottom: 4 }}>
          <span>{iconFor(message.message_type)}</span>
          <span>{message.payload.title}</span>
          {isUnread && <span style={{ marginLeft: "auto", width: 6, height: 6, background: "#EF4444", borderRadius: "50%" }} />}
        </div>
      )}
      <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.45 }}>{message.payload.body}</div>

      {message.payload.cta && (
        <button
          onClick={() => track('inbox', 'cta_clicked', { message_type: message.message_type, cta_url: message.payload.cta!.url }, 'system')}
          style={{
            marginTop: 6, padding: "4px 10px", fontSize: 11,
            background: "#FFB14A", color: "#0d1320", border: "none", borderRadius: 4, cursor: "pointer",
          }}
        >{message.payload.cta.label}</button>
      )}

      {survey && <SurveyAnswerBlock messageId={message.id} survey={survey} />}
    </div>
  );
}

function SurveyAnswerBlock({ messageId, survey }: { messageId: string; survey: SurveyPayload }) {
  const [response, setResponse] = useState<string | string[] | undefined>(survey.response);
  const answered = response !== undefined && response !== "" && (!Array.isArray(response) || response.length > 0);

  function pickSingle(opt: string) {
    setResponse(opt);
    submitSurveyResponse(messageId, opt);
    track('inbox', 'survey_answered', { inbox_message_id: messageId, answer: opt }, 'system');
  }

  function toggleMulti(opt: string) {
    const current = Array.isArray(response) ? response : [];
    const next = current.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt];
    setResponse(next);
    submitSurveyResponse(messageId, next);
    track('inbox', 'survey_answered', { inbox_message_id: messageId, answer: next.join('|') }, 'system');
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: "#EAF0FF", marginBottom: 6 }}>{survey.question}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {survey.options.map((opt) => {
          const selected = survey.type === 'single'
            ? response === opt
            : Array.isArray(response) && response.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => survey.type === 'single' ? pickSingle(opt) : toggleMulti(opt)}
              style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                background: selected ? "rgba(255,177,74,0.18)" : "transparent",
                border: selected ? "1px solid #FFB14A" : "1px solid #2a3550",
                color: "#EAF0FF",
              }}
            >{opt}{selected ? " ✓" : ""}</button>
          );
        })}
      </div>
      {answered && (
        <div style={{ fontSize: 10, color: "#7c8aa3", marginTop: 6 }}>Thanks — answer saved.</div>
      )}
    </div>
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
