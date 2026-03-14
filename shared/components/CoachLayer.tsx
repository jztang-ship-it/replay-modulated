import { useEffect, useRef, useState, useCallback } from "react";

type GameState = "IDLE"|"DEALING"|"HOLD"|"DRAWING"|"REVEALING"|"RESULTS"|"WIN_CELEBRATION";
export type CoachLesson = "ftue_basics";

interface Props {
  isFTUE: boolean;
  gameState: GameState;
  lockedCount: number;
  revealIndex?: number;
  legendaryCardName?: string;
  lesson?: CoachLesson;
  /** cardId of the most recently completed card reveal */
  lastRevealedCardId?: string | null;
  /** Call this after the last non-Booker card bubble is dismissed to start Booker reveal */
  onResumeHeldReveal?: () => void;
  /** Call this after Booker bubble is dismissed to trigger WIN_CELEBRATION */
  onCelebrationReady?: () => void;
  /** Call this when user taps Replay to enter the real game */
  onReplay?: () => void;
}

function DrawChip() {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px",
      background: "linear-gradient(135deg,#7FFF00,#5BBE00)",
      color: "#070A12", borderRadius: 4,
      fontWeight: 900, fontSize: 14, letterSpacing: ".12em",
      textTransform: "uppercase", verticalAlign: "middle", lineHeight: 1.5,
    }}>DRAW</span>
  );
}

function DealChip() {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px",
      background: "linear-gradient(135deg,#4B9EE8,#2B7EC8)",
      color: "#fff", borderRadius: 4,
      fontWeight: 900, fontSize: 14, letterSpacing: ".12em",
      textTransform: "uppercase", verticalAlign: "middle", lineHeight: 1.5,
    }}>DEAL</span>
  );
}

type Pulse = "deal" | "draw" | null;

// Per-card bubbles — keyed by cardId
const CARD_BUBBLES: Record<string, React.ReactNode> = {
  "ftue-westbrook": (
    <span>
      Westbrook put in a solid shift — nothing flashy, just steady work.
      That's what you want from a reliable piece of your lineup.&nbsp;💪
    </span>
  ),
  "ftue-cp3": (
    <span>
      <strong style={{ color: "#FFD700" }}>Career Night!</strong> That means
      CP3 outperformed his expected fantasy points —
      a masterclass in running the offense.&nbsp;🧠
    </span>
  ),
  "ftue-klay": (
    <span>
      Splash Brother no more… not the best night for Klay.
      Ice cold from the field and it really hurt your squad.&nbsp;🧊
    </span>
  ),
  "ftue-klove": (
    <span>
      Yikes. A game K.Love would love to forget — and so would you.
      He sure didn't help your team tonight.&nbsp;😬
    </span>
  ),
  // ftue-patty: intentionally omitted — no bubble
  "ftue-booker": (
    <span>
      <strong style={{ color: "#FF6B00" }}>DEVIN the killing machine!</strong>{" "}
      He absolutely carried your team's performance tonight.
      Be legendary.&nbsp;🔥
    </span>
  ),
};

// Which cards are "last non-Booker" — i.e. Patty is last tappable, Klay second-last, etc.
// We need to know: is this card the last one BEFORE Booker?
// We detect this by checking if onResumeHeldReveal is pending when we dismiss.
type PostPhase = "none" | "booker" | "streak_collect" | "runback";

export function CoachLayer({
  isFTUE, gameState,
  lastRevealedCardId,
  onResumeHeldReveal, onCelebrationReady,
}: Props) {
  const [visible,     setVisible]     = useState(false);
  const [content,     setContent]     = useState<React.ReactNode>(null);
  const [animKey,     setAnimKey]     = useState(0);
  const [blocksInput, setBlocksInput] = useState(false);
  const [pulsing,     setPulsing]     = useState<Pulse>(null);
  const [postPhase,   setPostPhase]   = useState<PostPhase>("none");

  const prevState        = useRef<GameState|null>(null);
  const shownCardBubbles = useRef<Set<string>>(new Set());
  const pendingPulse     = useRef<Pulse>(null);
  const pulseTimer       = useRef<ReturnType<typeof setTimeout>|null>(null);
  // What action to take on next dismiss
  const dismissAction    = useRef<
    "resume_held" | "fire_celebration" | "pulse_replay" | "none"
  >("none");

  // ── Pulse DOM button ────────────────────────────────────────────────────
  useEffect(() => {
    const btns = Array.from(document.querySelectorAll("[data-action]")) as HTMLElement[];
    btns.forEach(btn => { btn.style.animation = ""; });
    if (!pulsing) return;
    const btn = btns.find(b => b.getAttribute("data-action") === pulsing);
    if (btn) btn.style.animation = "coachBtnPulse 1s ease-in-out infinite";
  }, [pulsing]);

  function startPulse(target: Pulse) {
    if (!target) return;
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulsing(target);
    pulseTimer.current = setTimeout(() => setPulsing(null), 6000);
  }

  function show(node: React.ReactNode, afterDismiss: Pulse = null, blocks = true) {
    pendingPulse.current = afterDismiss;
    setContent(node);
    setAnimKey(k => k + 1);
    setVisible(true);
    setBlocksInput(blocks);
    setPulsing(null);
  }

  const dismiss = useCallback(() => {
    setVisible(false);
    setBlocksInput(false);
    const next = pendingPulse.current;
    pendingPulse.current = null;
    startPulse(next);

    const action = dismissAction.current;
    dismissAction.current = "none";

    if (action === "resume_held") {
      onResumeHeldReveal?.();
    } else if (action === "fire_celebration") {
      onCelebrationReady?.();
      setPostPhase("streak_collect");
    } else if (action === "pulse_replay") {
      startPulse("deal");
    }
  }, [onResumeHeldReveal, onCelebrationReady]);

  // ── Post-phase side effects ──────────────────────────────────────────────
  useEffect(() => {
    if (postPhase === "streak_collect") {
      setTimeout(() => show(
        <span>
          You're on a streak — two more wins and you get a special reward!&nbsp;🔥
          <br />Don't forget to collect your rewards.&nbsp;🪙
        </span>
      ), 500);
    }
    // "runback" is triggered by RESULTS state below
  }, [postPhase]); // eslint-disable-line

  // ── State-change handler ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE) return;
    if (gameState === prevState.current) return;
    prevState.current = gameState;

    if (gameState !== "REVEALING" && gameState !== "WIN_CELEBRATION") {
      setVisible(false);
      setBlocksInput(false);
      setPulsing(null);
    }

    if (gameState === "IDLE") {
      shownCardBubbles.current.clear();
      dismissAction.current = "none";
      setPostPhase("none");
      setTimeout(() => show(
        <span>Hit <DealChip /> to reveal your starting hand.</span>, "deal"
      ), 500);

    } else if (gameState === "HOLD") {
      setTimeout(() => show(
        <span>
          Devin Booker is our most dependable player — tap him to hold,
          then hit <DrawChip /> to get replacement players.
        </span>, "draw"
      ), 700);

    } else if (gameState === "REVEALING") {
      setTimeout(() => show(
        <span>
          You got five replacement players — let's see who you got.
          Tap them to find out!&nbsp;🏀
        </span>
      ), 400);

    } else if (gameState === "RESULTS") {
      // Coins have been collected — now show the "run it back" bubble
      if (postPhase === "streak_collect" || postPhase === "runback") {
        setPostPhase("runback");
        setTimeout(() => {
          dismissAction.current = "pulse_replay";
          setContent(
            <span>
              Darn it, if not for Klay or Love we would have won an extra 5x.
              Flip cards over to see what their game logs are.
              Ready to run it back?&nbsp;💪
            </span>
          );
          setAnimKey(k => k + 1);
          setVisible(true);
          setBlocksInput(true);
        }, 600);
      }
    }
  }, [gameState, isFTUE, postPhase]); // eslint-disable-line

  // ── Per-card reveal bubble ───────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE) return;
    if (!lastRevealedCardId) return;
    if (shownCardBubbles.current.has(lastRevealedCardId)) return;
    const node = CARD_BUBBLES[lastRevealedCardId];
    if (!node) {
      // No bubble for this card (Patty) — but if onResumeHeldReveal is pending,
      // we still need to fire it (Patty is last unheld card, no bubble needed)
      if (lastRevealedCardId !== "ftue-booker") {
        // Small delay to let the reveal animation settle, then resume
        setTimeout(() => onResumeHeldReveal?.(), 600);
      }
      return;
    }
    shownCardBubbles.current.add(lastRevealedCardId);

    if (lastRevealedCardId === "ftue-booker") {
      // Booker bubble → on dismiss, fire WIN_CELEBRATION
      dismissAction.current = "fire_celebration";
      setTimeout(() => show(node), 600);
    } else {
      // Non-Booker card bubble → on dismiss, resume held reveal
      // (only relevant when this is the last non-Booker card)
      dismissAction.current = "resume_held";
      setTimeout(() => show(node), 400);
    }
  }, [lastRevealedCardId, isFTUE, onResumeHeldReveal]); // eslint-disable-line

  if (!isFTUE) return null;

  return (
    <>
      <style>{`
        @keyframes coachFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes coachSlideUp {
          from { opacity:0; transform:translateY(20px) scale(.94) }
          to   { opacity:1; transform:translateY(0)    scale(1)   }
        }
        @keyframes coachBtnPulse {
          0%,100% { box-shadow: 0 0 0 0   rgba(127,255,0,0); }
          50%     { box-shadow: 0 0 0 10px rgba(127,255,0,0.4); }
        }
      `}</style>

      {blocksInput && !visible && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 298,
          background: "transparent", cursor: "default",
        }} />
      )}

      {visible && (
        <div
          key={animKey}
          onClick={dismiss}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 28px",
            background: "rgba(0,0,0,0.68)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            animation: "coachFadeIn 0.2s ease forwards",
            cursor: postPhase === "runback" ? "default" : "pointer",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              animation: "coachSlideUp 0.3s cubic-bezier(.2,.8,.4,1) forwards",
              background: "rgba(10,13,20,0.98)",
              border: "1px solid rgba(255,255,255,0.13)",
              borderRadius: 20,
              padding: "32px 32px 24px",
              maxWidth: 320, width: "100%",
              textAlign: "center",
              boxShadow: "0 28px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)",
              cursor: "default",
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "linear-gradient(135deg,#1a2540,#0d1320)",
              border: "1.5px solid rgba(255,255,255,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, margin: "0 auto 18px",
            }}>🏀</div>

            <p style={{
              fontFamily: "system-ui,-apple-system,sans-serif",
              fontSize: 18, fontWeight: 500, color: "#F0F2F5",
              lineHeight: 1.65, margin: "0 0 22px", letterSpacing: "0.01em",
            }}>{content}</p>

            <div
                onClick={dismiss}
                style={{
                  display: "inline-block", padding: "8px 22px",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8, fontSize: 12, fontWeight: 700,
                  color: "rgba(240,242,245,0.55)",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >Got it</div>
          </div>
        </div>
      )}
      {/* Booker flip hint — pulsing tab left of slot 0 during runback */}
      {gameState === "RESULTS" && postPhase === "runback" && !visible && (
        <BookerFlipHint />
      )}
    </>
  );
}

function BookerFlipHint() {
  return (
    <>
      <style>{`
        @keyframes hintPulse {
          0%,100% { opacity: 0.7; transform: translateY(-50%) scale(1); }
          50%      { opacity: 1;   transform: translateY(-50%) scale(1.06); }
        }
        @keyframes arrowBounce {
          0%,100% { transform: translateX(0); }
          50%      { transform: translateX(4px); }
        }
      `}</style>
      <HintPositioner />
    </>
  );
}

function HintPositioner() {
  const [pos, setPos] = useState<{top: number; left: number} | null>(null);

  useEffect(() => {
    function measure() {
      // Find Booker's card slot (data-slot="0")
      const slot = document.querySelector("[data-slot='0']") as HTMLElement | null;
      if (!slot) return;
      const rect = slot.getBoundingClientRect();
      setPos({ top: rect.top + rect.height / 2, left: rect.left - 8 });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (!pos) return null;

  return (
    <div style={{
      position: "fixed",
      top: pos.top,
      left: pos.left,
      transform: "translate(-100%, -50%)",
      zIndex: 50,
      display: "flex", alignItems: "center", gap: 6,
      animation: "hintPulse 1.4s ease-in-out infinite",
      pointerEvents: "none",
    }}>
      <div style={{
        background: "rgba(255,215,0,0.92)",
        color: "#070A12",
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 11, fontWeight: 800,
        letterSpacing: "0.06em", textTransform: "uppercase",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 12px rgba(255,215,0,0.5)",
      }}>
        Tap to flip
      </div>
      <div style={{
        fontSize: 16,
        color: "#FFD700",
        animation: "arrowBounce 0.8s ease-in-out infinite",
        textShadow: "0 0 8px rgba(255,215,0,0.8)",
      }}>→</div>
    </div>
  );
}
