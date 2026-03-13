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
}

// ─── Inline styled chips ─────────────────────────────────────────────────────
// These visually mirror the real Deal / Draw buttons so the user knows exactly
// what to tap.

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

// ─── Bubble content map ──────────────────────────────────────────────────────
type BubbleId = "idle"|"hold"|"draw_pending"|"legendary"|"results";
type Pulse    = "deal"|"draw"|null;

const BUBBLE_CONTENT: Record<BubbleId, () => React.ReactNode> = {
  idle: () => (
    <span>Hit <DealChip /> to see<br />what players you got.</span>
  ),
  hold: () => (
    <span>
      Interesting lineup. Tap to hold<br />
      players you trust, then hit <DrawChip /><br />
      for replacements.
    </span>
  ),
  draw_pending: () => (
    <span>
      Unheld players will be<br />
      randomly replaced. Tap each<br />
      card to see the result.
    </span>
  ),
  legendary: () => null, // built dynamically with the player name
  results: () => (
    <span>
      You're on a streak. Two more<br />
      wins and you get a special reward.&nbsp;🔥
    </span>
  ),
};

const AFTER_DISMISS: Record<BubbleId, Pulse> = {
  idle:         "deal",
  hold:         "draw",
  draw_pending: null,
  legendary:    null,
  results:      null,
};

export function CoachLayer({
  isFTUE, gameState, legendaryCardName,
}: Props) {
  const [visible,      setVisible]      = useState(false);
  const [content,      setContent]      = useState<React.ReactNode>(null);
  const [animKey,      setAnimKey]      = useState(0);
  // blocksInput: true while a bubble is pending or showing — swallows card taps
  const [blocksInput,  setBlocksInput]  = useState(false);
  const [pulsing,      setPulsing]      = useState<Pulse>(null);

  const prevState       = useRef<GameState|null>(null);
  const shownLegendary  = useRef(false);
  const pendingPulse    = useRef<Pulse>(null);
  const pulseTimer      = useRef<ReturnType<typeof setTimeout>|null>(null);

  // ─── Apply / remove CSS animation on the real DOM button ────────────────
  useEffect(() => {
    const btn = document.querySelector("[data-action]") as HTMLElement | null;
    if (!btn) return;
    if (pulsing) {
      const action = btn.getAttribute("data-action");
      if (action === pulsing) {
        btn.style.animation = "coachBtnPulse 1s ease-in-out infinite";
      }
    } else {
      btn.style.animation = "";
    }
  }, [pulsing]);

  // ─── Start pulse timer ───────────────────────────────────────────────────
  function startPulse(target: Pulse) {
    if (!target) return;
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulsing(target);
    pulseTimer.current = setTimeout(() => setPulsing(null), 4000);
  }

  // ─── Show a bubble ───────────────────────────────────────────────────────
  function show(node: React.ReactNode, afterDismiss: Pulse) {
    pendingPulse.current = afterDismiss;
    setContent(node);
    setAnimKey(k => k + 1);
    setVisible(true);
    setBlocksInput(true);
    setPulsing(null);                      // clear any running pulse
  }

  // ─── Dismiss (called by "Got it" or tap anywhere on overlay) ────────────
  const dismiss = useCallback(() => {
    setVisible(false);
    setBlocksInput(false);
    const next = pendingPulse.current;
    pendingPulse.current = null;
    startPulse(next);
  }, []); // eslint-disable-line

  // ─── State-change handler ────────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE) return;
    if (gameState === prevState.current) return;
    prevState.current = gameState;

    // Always clear bubble + blocker when state changes
    setVisible(false);
    setBlocksInput(false);
    setPulsing(null);

    if (gameState === "IDLE") {
      setTimeout(() =>
        show(BUBBLE_CONTENT.idle(), AFTER_DISMISS.idle), 500);

    } else if (gameState === "HOLD") {
      setTimeout(() =>
        show(BUBBLE_CONTENT.hold(), AFTER_DISMISS.hold), 700);

    } else if (gameState === "DRAWING") {
      // draw_pending bubble fires when DRAWING starts.
      // cards stay blocked until the user taps "Got it".
      shownLegendary.current = false;
      setTimeout(() =>
        show(BUBBLE_CONTENT.draw_pending(), AFTER_DISMISS.draw_pending), 400);

    } else if (gameState === "REVEALING") {
      // draw_pending already dismissed by this point → no new bubble.
      // blocksInput is false so cards are tappable.
    } else if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      setTimeout(() =>
        show(BUBBLE_CONTENT.results(), AFTER_DISMISS.results), 800);
    }
  }, [gameState, isFTUE]); // eslint-disable-line

  // ─── Legendary card reaction ─────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE) return;
    if (!legendaryCardName) return;
    if (shownLegendary.current) return;
    if (gameState !== "REVEALING" && gameState !== "RESULTS" && gameState !== "WIN_CELEBRATION") return;
    shownLegendary.current = true;
    setVisible(false);
    setTimeout(() => show(
      <span>
        You got lucky —{" "}
        <strong style={{ color: "#FFD700" }}>{legendaryCardName}</strong>{" "}
        had an awesome game. Career Night really boosts your team's points!&nbsp;🔥
      </span>,
      null,
    ), 300);
  }, [legendaryCardName, isFTUE, gameState]); // eslint-disable-line

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
          0%,100% { box-shadow: 0 0 0 0   rgba(75,158,232,0); }
          50%     { box-shadow: 0 0 0 8px rgba(75,158,232,.38); }
        }
      `}</style>

      {/* ── Transparent input-blocker (sits below the bubble, above cards) ── */}
      {blocksInput && !visible && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 298,
          background: "transparent", cursor: "default",
        }} />
      )}

      {/* ── Bubble overlay ─────────────────────────────────────────────────── */}
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
            cursor: "pointer",
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
                display: "inline-block",
                padding: "8px 22px",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8,
                fontSize: 12, fontWeight: 700,
                color: "rgba(240,242,245,0.55)",
                letterSpacing: "0.08em", textTransform: "uppercase",
                cursor: "pointer",
              }}
            >Got it</div>
          </div>
        </div>
      )}
    </>
  );
}