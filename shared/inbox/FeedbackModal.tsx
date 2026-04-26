// shared/inbox/FeedbackModal.tsx
// Multi-question feedback modal. Questions live in a config array — content is
// intentionally placeholder for v1; finalize before flipping the feature flag.
// 100-coin reward on first submission; re-submissions get a "thanks for the update".

import { useState } from "react";
import {
  getSubmissionNumber, submitFeedback, grantFeedbackCoins,
  type FeedbackAnswers, type FeedbackMetadata,
} from "./inbox";
import { track } from "@shared/analytics/analytics";

type Question =
  | { id: string; type: 'single';   label: string; options: string[]; required?: boolean }
  | { id: string; type: 'multi';    label: string; options: string[]; required?: boolean }
  | { id: string; type: 'rating';   label: string; min: number; max: number; required?: boolean }
  | { id: string; type: 'freetext'; label: string; placeholder?: string; required?: boolean };

const FEEDBACK_QUESTIONS: Question[] = [
  // PLACEHOLDER — replace before flipping the feature flag.
  // See spec "Rollout & feature flag" section.
  { id: 'general',   type: 'single',   label: 'How are you finding ReplayMod so far?',
    options: ['Loving it', 'Pretty good', 'Mixed', 'Not great', 'Confused'] },
  { id: 'pain',      type: 'multi',    label: 'Anything bugging you? (pick any)',
    options: ['Rules unclear', 'Too slow', 'UI clunky', 'Not enough sports', 'Nothing major'] },
  { id: 'wishlist',  type: 'freetext', label: 'One feature you wish existed (optional)',
    placeholder: "e.g., 'multiplayer', 'NFL', 'rematch button'..." },
];

const COIN_REWARD = 100;

type Props = {
  userId: string;
  onClose: () => void;
  metadata?: FeedbackMetadata;
};

export function FeedbackModal({ userId, onClose, metadata = {} }: Props) {
  const [answers, setAnswers] = useState<FeedbackAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ coinsGranted: number } | null>(null);

  function setAnswer(id: string, value: FeedbackAnswers[string]) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function handleSubmit() {
    setSubmitting(true);
    const submissionNumber = await getSubmissionNumber(userId);
    const ok = await submitFeedback(userId, answers, submissionNumber, metadata);
    let coinsGranted = 0;
    if (ok && submissionNumber === 1) {
      await grantFeedbackCoins(COIN_REWARD);
      coinsGranted = COIN_REWARD;
    }
    track('inbox', 'feedback_submitted', {
      submission_number: submissionNumber,
      has_freetext: typeof answers['wishlist'] === 'string' && (answers['wishlist'] as string).trim().length > 0,
      completed_questions: Object.keys(answers).length,
    }, 'system');
    setDone({ coinsGranted });
    setSubmitting(false);
  }

  function handleDismiss() {
    if (submitting) return; // don't close mid-submit — user would miss the coin celebration
    if (!done) {
      track('inbox', 'feedback_dismissed', { questions_filled: Object.keys(answers).length }, 'system');
    }
    onClose();
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
        {done ? (
          <DoneScreen coinsGranted={done.coinsGranted} onClose={onClose} />
        ) : (
          <FormScreen
            questions={FEEDBACK_QUESTIONS}
            answers={answers}
            onAnswer={setAnswer}
            onSubmit={handleSubmit}
            onCancel={handleDismiss}
            submitting={submitting}
          />
        )}
      </div>
    </>
  );
}

// ---------- Form ----------

function FormScreen({
  questions, answers, onAnswer, onSubmit, onCancel, submitting,
}: {
  questions: Question[];
  answers: FeedbackAnswers;
  onAnswer: (id: string, v: FeedbackAnswers[string]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#EAF0FF" }}>💬 Help shape ReplayMod</div>
          <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4, lineHeight: 1.45 }}>
            You're one of our first players. We read every answer.
          </div>
        </div>
        <span onClick={onCancel} style={{ fontSize: 14, color: "#7c8aa3", cursor: "pointer", marginLeft: 8 }}>×</span>
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
          <button onClick={onCancel} disabled={submitting} style={{
            fontSize: 11, padding: "6px 12px",
            background: "transparent", border: "1px solid #2a3550",
            color: "#7c8aa3", borderRadius: 4, cursor: "pointer",
          }}>Cancel</button>
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

function chipStyle(selected: boolean): React.CSSProperties {
  return {
    fontSize: 11, padding: "4px 9px", borderRadius: 4, cursor: "pointer",
    background: selected ? "rgba(255,177,74,0.18)" : "transparent",
    border: selected ? "1px solid #FFB14A" : "1px solid #2a3550",
    color: "#EAF0FF",
  };
}

// ---------- Done screen ----------

function DoneScreen({ coinsGranted, onClose }: { coinsGranted: number; onClose: () => void }) {
  const isFirst = coinsGranted > 0;
  return (
    <div style={{ textAlign: "center", padding: "20px 8px" }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>{isFirst ? "🪙" : "📬"}</div>
      {isFirst ? (
        <div style={{ fontSize: 18, fontWeight: 700, color: "#FFB14A", marginBottom: 6 }}>+{coinsGranted} coins added</div>
      ) : (
        <div style={{ fontSize: 16, fontWeight: 600, color: "#EAF0FF", marginBottom: 6 }}>Thanks for the update</div>
      )}
      <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5, marginBottom: 14 }}>
        {isFirst
          ? "Got it — we read every one. Watch your inbox 📬 — that's where we'll respond."
          : "Your earlier reward stands. We'll factor in your latest answers."}
      </div>
      <button onClick={onClose} style={{
        fontSize: 12, padding: "8px 16px",
        background: "#FFB14A", color: "#0d1320", border: "none",
        borderRadius: 4, cursor: "pointer", fontWeight: 600,
      }}>Back to game</button>
    </div>
  );
}
