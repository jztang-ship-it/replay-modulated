// shared/components/NameCaptureModal.tsx
//
// Purely controlled name-capture overlay. The component is intentionally
// dumb about WHY it's being shown — `mode` decides between fresh capture
// ("Who's challenging?") and confirm-existing ("That's you, right?"),
// callbacks fire back to the caller, the caller owns flow control.
//
// Designed so the deferred auth-gate work can mount the same modal
// for the post-share signup nudge later without coupling either flow.
// Component never imports from playerIdentity / chadChallenge / share
// hooks — those are caller concerns.
//
// Trim semantics: the modal trims input before firing onSubmit, so the
// caller doesn't have to. Submit gated on `trimmed.length >= 2` (matches
// ProfileScreen.handleSave guard). Enter fires the primary action in
// both modes — confirm mode fires "That's me" by default so returning
// users send fast.

import { useEffect, useRef, useState } from "react";

export type NameCaptureMode = "fresh" | "confirm" | "anon";

interface Props {
  /** Render gate. False = modal not in DOM (backdrop closed). */
  isOpen: boolean;
  /** "fresh" → empty input. "confirm" → shows currentName + confirm button.
   *  "anon" → no input; renders sign-up + sign-in CTAs only. Phase 5b
   *  piece 1 (2026-05-28, doc lock 3da7f02): R2 — tap-time gating on
   *  the share-CTA surface. Caller picks "anon" when isAnonymous. */
  mode: NameCaptureMode;
  /** Required when mode === "confirm". Ignored in fresh and anon modes. */
  currentName?: string;
  /** Fires with trimmed name. In confirm mode and the user pressed the
   *  confirm button, fires with currentName trimmed. In fresh mode or
   *  confirm→edit submit, fires with the typed value trimmed. Not fired
   *  in anon mode (anon CTAs use onSignUp / onSignIn instead). */
  onSubmit: (name: string) => void;
  /** Fires on X tap, backdrop tap, or Escape. Caller decides whether
   *  to fall back to anonymous, retain prior name, etc. The modal does
   *  not know. */
  onCancel: () => void;
  /** Fires when the user taps the sign-up CTA in anon mode. Caller
   *  opens the existing auth surface (e.g., RegisterModal in sign-up
   *  pane). Required when mode === "anon". */
  onSignUp?: () => void;
  /** Fires when the user taps the sign-in CTA in anon mode. Caller
   *  opens the existing auth surface in sign-in mode. Required when
   *  mode === "anon". */
  onSignIn?: () => void;
  /** Copy overrides — caller-provided so the modal stays surface-agnostic.
   *  Reusable for the deferred auth-gate post-share signup nudge etc.
   *  Defaults are generic; caller overrides what's action-specific. */
  freshHeading?: string;     // shown in fresh mode + confirm→edit branch
  confirmHeading?: string;   // shown in confirm mode (before edit toggle)
  anonHeading?: string;      // shown in anon mode (above sign-up/sign-in CTAs)
  anonSubheading?: string;   // optional explainer line shown below anonHeading
  placeholder?: string;      // input placeholder text
  submitLabel?: string;      // primary button label in fresh mode
  editSubmitLabel?: string;  // primary button label in confirm→edit branch
  confirmLabel?: string;     // primary button label in confirm mode
  editLabel?: string;        // secondary button in confirm mode
  signUpLabel?: string;      // primary CTA label in anon mode
  signInLabel?: string;      // secondary CTA label in anon mode
}

export function NameCaptureModal({
  isOpen, mode, currentName, onSubmit, onCancel,
  onSignUp, onSignIn,
  freshHeading = "What's your name?",
  confirmHeading = "Is this you?",
  anonHeading = "Sign in to send",
  anonSubheading,
  placeholder = "Your name",
  submitLabel = "Continue",
  editSubmitLabel = "Save",
  confirmLabel = "Yes",
  editLabel = "Edit",
  signUpLabel = "Sign up",
  signInLabel = "Sign in",
}: Props) {
  // Edit branch toggles inside confirm mode — the user tapped [Edit]
  // and now sees the same input UX as fresh mode, pre-filled.
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset internal state every time the modal opens. Without this, the
  // edit-branch toggle and input value would persist across consecutive
  // opens (e.g. user opens, edits, cancels, reopens — would still be in
  // edit mode with stale value).
  useEffect(() => {
    if (!isOpen) return;
    setIsEditing(false);
    setValue(mode === "confirm" ? (currentName ?? "") : "");
  }, [isOpen, mode, currentName]);

  // Autofocus the input when it becomes visible (fresh mode or edit
  // branch in confirm mode). Returning-user confirm-mode default
  // doesn't autofocus the input — it just listens for Enter to fire
  // [That's me] without the user touching anything.
  useEffect(() => {
    const showsInput = mode === "fresh" || isEditing;
    if (isOpen && showsInput) {
      // Small delay so the modal mount animation doesn't fight focus
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, mode, isEditing]);

  // Keyboard Escape closes — matches X tap / backdrop tap. Confirm-mode
  // Enter-to-confirm is handled via the button's native form behavior;
  // see the form's onSubmit below.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const trimmed = value.trim();
  const canSubmit = trimmed.length >= 2;
  const showInput = mode === "fresh" || isEditing;

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (showInput) {
      if (!canSubmit) return;
      onSubmit(trimmed);
    } else {
      // Confirm mode default — [That's me]. Submit with currentName trimmed.
      onSubmit(String(currentName ?? "").trim());
    }
  }

  return (
    <>
      {/* Backdrop — tap-to-cancel */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 10000,
        }}
        aria-hidden
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          width: "calc(100vw - 40px)", maxWidth: 360, zIndex: 10001,
          background: "#0D1117", borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.1)",
          padding: "22px 22px calc(20px + env(safe-area-inset-bottom, 0px))",
          color: "#EAF0FF", fontFamily: "'Inter', system-ui, sans-serif",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        {/* Close × */}
        <button
          onClick={onCancel}
          aria-label="Cancel"
          style={{
            position: "absolute", top: 10, right: 12,
            width: 28, height: 28, borderRadius: 14,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.55)",
            fontSize: 14, fontWeight: 700, lineHeight: 1, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >×</button>

        {mode === "anon" ? (
          // Phase 5b piece 1 (2026-05-28): tap-time auth gate. The
          // share-CTA button is universal (renders for everyone), but
          // anonymous tappers land here and must auth before the
          // challenge POST can fire. No input field pre-auth.
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>
              {anonHeading}
            </div>
            {anonSubheading && (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.4 }}>
                {anonSubheading}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                onClick={onSignUp}
                style={{
                  padding: "13px", borderRadius: 12,
                  background: "#FFB14A", border: "none", color: "#070A12",
                  fontSize: 15, fontWeight: 900, cursor: "pointer",
                }}
              >{signUpLabel}</button>
              <button
                type="button"
                onClick={onSignIn}
                style={{
                  padding: "13px", borderRadius: 12,
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 14, fontWeight: 800, cursor: "pointer",
                }}
              >{signInLabel}</button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Heading — copy comes from caller props */}
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.3 }}>
            {mode === "fresh" || isEditing ? freshHeading : confirmHeading}
          </div>

          {/* Confirm mode: stored name display */}
          {mode === "confirm" && !isEditing && (
            <div style={{
              fontSize: 26, fontWeight: 950, color: "#FFB14A",
              lineHeight: 1.1, padding: "4px 0 2px",
            }}>
              {currentName}
            </div>
          )}

          {/* Input — fresh mode OR confirm→edit branch */}
          {showInput && (
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={placeholder}
              maxLength={32}
              autoCapitalize="words"
              autoComplete="off"
              style={{
                width: "100%", padding: "12px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.16)",
                color: "#EAF0FF", fontSize: 16, fontWeight: 600,
                boxSizing: "border-box", outline: "none",
              }}
            />
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {mode === "confirm" && !isEditing ? (
              <>
                <button
                  type="submit"
                  style={{
                    flex: 1, padding: "13px", borderRadius: 12,
                    background: "#FFB14A", border: "none", color: "#070A12",
                    fontSize: 15, fontWeight: 900, cursor: "pointer",
                  }}
                >{confirmLabel}</button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  style={{
                    padding: "13px 18px", borderRadius: 12, background: "transparent",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "rgba(255,255,255,0.75)",
                    fontSize: 14, fontWeight: 800, cursor: "pointer",
                  }}
                >{editLabel}</button>
              </>
            ) : (
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  flex: 1, padding: "13px", borderRadius: 12,
                  background: canSubmit ? "#FFB14A" : "rgba(255,177,74,0.3)",
                  border: "none",
                  color: canSubmit ? "#070A12" : "rgba(7,10,18,0.5)",
                  fontSize: 15, fontWeight: 900,
                  cursor: canSubmit ? "pointer" : "default",
                }}
              >{mode === "fresh" ? submitLabel : editSubmitLabel}</button>
            )}
          </div>
        </form>
        )}
      </div>
    </>
  );
}
