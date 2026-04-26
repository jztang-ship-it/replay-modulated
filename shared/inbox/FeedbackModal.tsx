// shared/inbox/FeedbackModal.tsx
// Multi-question feedback modal. Two paths:
//   - Survey: 6 multi-choice questions + optional free text. 100-coin reward
//     on first survey submission.
//   - Message: free-text only. No reward.
// Direct contact email surfaces in the intro and the post-submit screen.

import { useEffect, useState } from "react";
import {
  getSurveySubmissionNumber,
  getMessageSubmissionNumber,
  submitFeedback, grantFeedbackCoins,
  type FeedbackAnswers, type FeedbackMetadata,
} from "./inbox";
import { track } from "@shared/analytics/analytics";

type Question =
  | { id: string; type: 'single';   label: string; options: string[]; required?: boolean }
  | { id: string; type: 'multi';    label: string; options: string[]; required?: boolean }
  | { id: string; type: 'rating';   label: string; min: number; max: number; required?: boolean }
  | { id: string; type: 'freetext'; label: string; placeholder?: string; required?: boolean };

const FEEDBACK_QUESTIONS: Question[] = [
  {
    id: 'discovery',
    type: 'single',
    label: 'How did you find ReplayMod?',
    options: ['Reddit', 'A friend', 'Twitter / X', 'Discord', 'Search', 'Somewhere else'],
  },
  {
    id: 'best_part',
    type: 'single',
    label: "What's the best part for you?",
    options: [
      'The drama of watching the hand play out',
      'Building the roster',
      'The commentary',
      'The daily competition',
      'The vibe / theme',
      'Something else',
    ],
  },
  {
    id: 'cash_prizes',
    type: 'single',
    label: 'If real cash prizes were on the line — how would your play change?',
    options: [
      "I'd play way more — that's the point",
      'Somewhat more',
      'About the same',
      "A bit less — I'd worry about losing",
      "I'd stop — not a betting-game person",
    ],
  },
  {
    id: 'next_sport',
    type: 'single',
    label: 'Which sport should we add next?',
    options: ['NFL (football)', 'Soccer (full league)', 'NHL (hockey)', 'WNBA', 'Tennis', 'Olympics-style', 'Something else'],
  },
  {
    id: 'discord',
    type: 'single',
    label: 'Would you join a private Discord for ReplayMod early players?',
    options: ['Yes — count me in', 'Maybe, send me details', 'Not for me'],
  },
  {
    id: 'wishlist',
    type: 'freetext',
    label: "One feature you wish ReplayMod had",
    placeholder: 'e.g., "rematch button", "head-to-head with friends", "stat trends"...',
  },
];

const COIN_REWARD = 100;
const CONTACT_EMAIL = 'wayzztoai@gmail.com';

type Mode = 'choice' | 'survey' | 'message' | 'done';

type DoneState = {
  source: 'survey' | 'message';
  coinsGranted: number;
};

type Props = {
  userId: string;
  onClose: () => void;
  metadata?: FeedbackMetadata;
};

export function FeedbackModal({ userId, onClose, metadata = {} }: Props) {
  const [mode, setMode] = useState<Mode>('choice');
  const [surveyAnswers, setSurveyAnswers] = useState<FeedbackAnswers>({});
  const [messageText, setMessageText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<DoneState | null>(null);

  function setSurveyAnswer(id: string, value: FeedbackAnswers[string]) {
    setSurveyAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmitSurvey() {
    setSubmitting(true);
    const submissionNumber = await getSurveySubmissionNumber(userId);
    const ok = await submitFeedback(userId, { kind: 'survey', ...surveyAnswers }, submissionNumber, metadata);
    let coinsGranted = 0;
    if (ok && submissionNumber === 1) {
      await grantFeedbackCoins(COIN_REWARD);
      coinsGranted = COIN_REWARD;
    }
    track('inbox', 'feedback_submitted', {
      kind: 'survey',
      submission_number: submissionNumber,
      has_freetext: typeof surveyAnswers['wishlist'] === 'string' && (surveyAnswers['wishlist'] as string).trim().length > 0,
      completed_questions: Object.keys(surveyAnswers).length,
    }, 'system');
    setDone({ source: 'survey', coinsGranted });
    setMode('done');
    setSubmitting(false);
  }

  async function handleSubmitMessage() {
    if (!messageText.trim()) return;
    setSubmitting(true);
    const submissionNumber = await getMessageSubmissionNumber(userId);
    const ok = await submitFeedback(userId, { kind: 'message', text: messageText.trim() }, submissionNumber, metadata);
    track('inbox', 'feedback_submitted', {
      kind: 'message',
      submission_number: submissionNumber,
      message_length: messageText.trim().length,
    }, 'system');
    if (ok) {
      setDone({ source: 'message', coinsGranted: 0 });
      setMode('done');
    }
    setSubmitting(false);
  }

  function handleDismiss() {
    if (submitting) return;
    if (mode !== 'done') {
      track('inbox', 'feedback_dismissed', { mode }, 'system');
    }
    onClose();
  }

  function backToChoice() {
    if (submitting) return;
    setMode('choice');
  }

  return (
    <>
      <div onClick={handleDismiss} style={{
        position: "fixed", inset: 0, zIndex: 110, background: "rgba(0,0,0,0.65)",
      }} />
      <div style={{
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        width: "90%", maxWidth: 380, maxHeight: "90vh", overflowY: "auto",
        background: "#11192b", border: "1px solid #2a3550", borderRadius: 10,
        padding: 16, zIndex: 120,
      }}>
        {mode === 'choice' && (
          <ChoiceScreen
            userId={userId}
            onPickSurvey={() => setMode('survey')}
            onPickMessage={() => setMode('message')}
            onClose={handleDismiss}
          />
        )}
        {mode === 'survey' && (
          <FormScreen
            questions={FEEDBACK_QUESTIONS}
            answers={surveyAnswers}
            onAnswer={setSurveyAnswer}
            onSubmit={handleSubmitSurvey}
            onBack={backToChoice}
            submitting={submitting}
          />
        )}
        {mode === 'message' && (
          <MessageScreen
            text={messageText}
            onChange={setMessageText}
            onSubmit={handleSubmitMessage}
            onBack={backToChoice}
            submitting={submitting}
          />
        )}
        {mode === 'done' && done && (
          <DoneScreen source={done.source} coinsGranted={done.coinsGranted} onClose={onClose} />
        )}
      </div>
    </>
  );
}

// ---------- Choice screen ----------

function ChoiceScreen({
  userId, onPickSurvey, onPickMessage, onClose,
}: {
  userId: string;
  onPickSurvey: () => void;
  onPickMessage: () => void;
  onClose: () => void;
}) {
  const [coinEligible, setCoinEligible] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    getSurveySubmissionNumber(userId).then((n) => {
      if (!cancelled) setCoinEligible(n === 1);
    });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#EAF0FF" }}>💬 Talk to the team</div>
          <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4, lineHeight: 1.45 }}>
            Pick a path. Or email us anytime at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#FFB14A", textDecoration: "none" }}>{CONTACT_EMAIL}</a>.
          </div>
        </div>
        <span onClick={onClose} style={{ fontSize: 14, color: "#7c8aa3", cursor: "pointer", marginLeft: 8 }}>×</span>
      </div>

      <button onClick={onPickSurvey} style={{
        display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8,
        background: "#0d1320", border: "1px solid #2a3550", borderRadius: 8, cursor: "pointer",
        color: "#EAF0FF",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>📋 Take the quick survey</span>
          {coinEligible && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: "#FFB14A", letterSpacing: 0.4,
              border: "1px solid rgba(255,177,74,0.4)", background: "rgba(255,177,74,0.08)",
              borderRadius: 4, padding: "2px 6px",
            }}>🪙 +{COIN_REWARD}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#7c8aa3", lineHeight: 1.4 }}>
          6 multi-choice questions. ~30 seconds. Helps us decide what to build next.
        </div>
      </button>

      <button onClick={onPickMessage} style={{
        display: "block", width: "100%", textAlign: "left", padding: "12px 14px",
        background: "#0d1320", border: "1px solid #2a3550", borderRadius: 8, cursor: "pointer",
        color: "#EAF0FF",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>✏️ Write us a message</div>
        <div style={{ fontSize: 11, color: "#7c8aa3", lineHeight: 1.4 }}>
          Anything on your mind. We read every one.
        </div>
      </button>
    </>
  );
}

// ---------- Form (survey) ----------

function FormScreen({
  questions, answers, onAnswer, onSubmit, onBack, submitting,
}: {
  questions: Question[];
  answers: FeedbackAnswers;
  onAnswer: (id: string, v: FeedbackAnswers[string]) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span onClick={onBack} style={{ fontSize: 13, color: "#7c8aa3", cursor: "pointer" }}>‹</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#EAF0FF" }}>📋 Help shape ReplayMod</div>
          </div>
          <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4, lineHeight: 1.45 }}>
            You're one of our first players. Your answers shape what we build next.
          </div>
        </div>
      </div>

      <div style={{
        margin: "10px 0 14px", padding: "8px 10px",
        border: "1px solid rgba(255,177,74,0.4)", borderRadius: 6,
        background: "rgba(255,177,74,0.08)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>🪙</span>
        <div style={{ fontSize: 11, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, color: "#FFB14A" }}>+{COIN_REWARD} coins on submit</div>
          <div style={{ color: "#cbd5e1", opacity: 0.8 }}>First time only — about 1 free hand on us.</div>
        </div>
      </div>

      {questions.map((q, i) => (
        <div key={q.id} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#EAF0FF", marginBottom: 6 }}>
            {i + 1} · {q.label}
            {q.type === 'multi' && <span style={{ fontWeight: 400, color: "#7c8aa3", marginLeft: 6 }}>(pick any)</span>}
            {!q.required && q.type === 'freetext' && <span style={{ fontWeight: 400, color: "#7c8aa3", marginLeft: 6 }}>(optional)</span>}
          </div>

          {q.type === 'single' && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt;
                return (
                  <button key={opt} onClick={() => onAnswer(q.id, opt)} style={chipStyle(selected)}>
                    {opt}{selected ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'multi' && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {q.options.map((opt) => {
                const current = (answers[q.id] as string[] | undefined) ?? [];
                const selected = current.includes(opt);
                return (
                  <button key={opt} onClick={() => {
                    const next = selected ? current.filter((x) => x !== opt) : [...current, opt];
                    onAnswer(q.id, next);
                  }} style={chipStyle(selected)}>
                    {opt}{selected ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          )}

          {q.type === 'rating' && (
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              {Array.from({ length: q.max - q.min + 1 }, (_, k) => k + q.min).map((n) => {
                const selected = answers[q.id] === n;
                return (
                  <button key={n} onClick={() => onAnswer(q.id, n)} style={{
                    ...chipStyle(selected), minWidth: 24, padding: "3px 6px", fontSize: 10,
                  }}>{n}</button>
                );
              })}
            </div>
          )}

          {q.type === 'freetext' && (
            <textarea
              value={(answers[q.id] as string | undefined) ?? ""}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              placeholder={q.placeholder}
              style={{
                width: "100%", minHeight: 60, fontSize: 11, padding: 6,
                background: "#0d1320", color: "#EAF0FF",
                border: "1px solid #2a3550", borderRadius: 4, resize: "none",
              }}
            />
          )}
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: "#7c8aa3" }}>🪙 +{COIN_REWARD} on submit</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onBack} disabled={submitting} style={{
            fontSize: 11, padding: "6px 12px",
            background: "transparent", border: "1px solid #2a3550",
            color: "#7c8aa3", borderRadius: 4, cursor: submitting ? "wait" : "pointer",
          }}>Back</button>
          <button onClick={onSubmit} disabled={submitting} style={{
            fontSize: 12, fontWeight: 600, padding: "6px 14px",
            background: "#FFB14A", color: "#0d1320", border: "none",
            borderRadius: 4, cursor: submitting ? "wait" : "pointer",
          }}>{submitting ? "Sending..." : "Send to the team"}</button>
        </div>
      </div>
    </>
  );
}

// ---------- Message screen ----------

function MessageScreen({
  text, onChange, onSubmit, onBack, submitting,
}: {
  text: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  const canSubmit = text.trim().length > 0 && !submitting;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span onClick={onBack} style={{ fontSize: 13, color: "#7c8aa3", cursor: submitting ? "wait" : "pointer" }}>‹</span>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#EAF0FF" }}>✏️ Send us a message</div>
          </div>
          <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4, lineHeight: 1.45 }}>
            Anything on your mind. We read every one.
          </div>
        </div>
      </div>

      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type away..."
        rows={6}
        style={{
          width: "100%", minHeight: 120, fontSize: 12, padding: 10,
          background: "#0d1320", color: "#EAF0FF",
          border: "1px solid #2a3550", borderRadius: 6, resize: "vertical",
          marginBottom: 12,
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: "#7c8aa3" }}>{text.trim().length} characters</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onBack} disabled={submitting} style={{
            fontSize: 11, padding: "6px 12px",
            background: "transparent", border: "1px solid #2a3550",
            color: "#7c8aa3", borderRadius: 4, cursor: submitting ? "wait" : "pointer",
          }}>Back</button>
          <button onClick={onSubmit} disabled={!canSubmit} style={{
            fontSize: 12, fontWeight: 600, padding: "6px 14px",
            background: canSubmit ? "#FFB14A" : "#2a3550", color: canSubmit ? "#0d1320" : "#7c8aa3", border: "none",
            borderRadius: 4, cursor: canSubmit ? "pointer" : "not-allowed",
          }}>{submitting ? "Sending..." : "Send"}</button>
        </div>
      </div>
    </>
  );
}

// ---------- Done screen ----------

function DoneScreen({ source, coinsGranted, onClose }: { source: 'survey' | 'message'; coinsGranted: number; onClose: () => void }) {
  const isFirstSurvey = source === 'survey' && coinsGranted > 0;
  return (
    <div style={{ textAlign: "center", padding: "20px 8px" }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>{isFirstSurvey ? "🪙" : "📬"}</div>
      {isFirstSurvey ? (
        <div style={{ fontSize: 18, fontWeight: 700, color: "#FFB14A", marginBottom: 6 }}>+{coinsGranted} coins added</div>
      ) : (
        <div style={{ fontSize: 16, fontWeight: 600, color: "#EAF0FF", marginBottom: 6 }}>
          {source === 'message' ? "Message sent" : "Thanks for the update"}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 10 }}>
        {isFirstSurvey
          ? "Got it — we read every one. Watch your inbox 📬 — that's where we'll respond."
          : source === 'message'
            ? "We read every one. Expect a reply in your inbox 📬 if it warrants one."
            : "Your earlier reward stands. We'll factor in your latest answers."}
      </div>
      <div style={{ fontSize: 11, color: "#7c8aa3", lineHeight: 1.5, marginBottom: 14 }}>
        Want to keep talking? Email us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#FFB14A", textDecoration: "none" }}>{CONTACT_EMAIL}</a>.
      </div>
      <button onClick={onClose} style={{
        fontSize: 12, padding: "8px 16px",
        background: "#FFB14A", color: "#0d1320", border: "none",
        borderRadius: 4, cursor: "pointer", fontWeight: 600,
      }}>Back to game</button>
    </div>
  );
}

function chipStyle(selected: boolean): React.CSSProperties {
  return {
    fontSize: 11, padding: "4px 9px", borderRadius: 4, cursor: "pointer",
    background: selected ? "rgba(255,177,74,0.18)" : "transparent",
    border: selected ? "1px solid #FFB14A" : "1px solid #2a3550",
    color: "#EAF0FF",
  };
}
