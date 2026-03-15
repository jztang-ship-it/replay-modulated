import { useEffect, useRef, useState, useCallback } from "react";

type GameState = "IDLE"|"DEALING"|"HOLD"|"DRAWING"|"REVEALING"|"RESULTS"|"WIN_CELEBRATION";
export type CoachLesson = "ftue_basics";

interface Props {
  isFTUE: boolean;
  gameState: GameState;
  lastRevealedCardId?: string | null;
  onResumeHeldReveal?: () => void;
  onCelebrationReady?: () => void;
  onBubbleActive?: (active: boolean) => void;
  onReplay?: () => void;
  // unused but kept for compat
  lockedCount?: number;
  revealIndex?: number;
  legendaryCardName?: string;
  lesson?: CoachLesson;
}

// ── UI chips ─────────────────────────────────────────────────────────────────
function DrawChip() {
  return (
    <span style={{
      display:"inline-block", padding:"2px 10px",
      background:"linear-gradient(135deg,#7FFF00,#5BBE00)",
      color:"#070A12", borderRadius:4,
      fontWeight:900, fontSize:14, letterSpacing:".12em",
      textTransform:"uppercase", verticalAlign:"middle", lineHeight:1.5,
    }}>DRAW</span>
  );
}
function DealChip() {
  return (
    <span style={{
      display:"inline-block", padding:"2px 10px",
      background:"linear-gradient(135deg,#4B9EE8,#2B7EC8)",
      color:"#fff", borderRadius:4,
      fontWeight:900, fontSize:14, letterSpacing:".12em",
      textTransform:"uppercase", verticalAlign:"middle", lineHeight:1.5,
    }}>DEAL</span>
  );
}

// ── Per-card reveal bubbles ───────────────────────────────────────────────────
const CARD_BUBBLES: Record<string, React.ReactNode> = {
  "ftue-westbrook": (
    <span>
      Westbrook put in a solid shift — nothing flashy, just steady work.
      That's what you want from a reliable piece of your lineup.&nbsp;💪
    </span>
  ),
  "ftue-cp3": (
    <span>
      <strong style={{color:"#FB923C"}}>On Fire!</strong> CP3 outperformed
      his expected fantasy points tonight —
      a masterclass in running the offense.&nbsp;🧠
    </span>
  ),
  "ftue-klay": (
    <span>
      Splash Brother no more… not the best night for Klay.{" "}
      <strong style={{color:"#9CA3AF", WebkitTextStroke:"0.5px #6B7280"}}>Ice Cold</strong>
      {" "}from the field and it really hurt your squad.&nbsp;🧊
    </span>
  ),
  "ftue-klove": (
    <span>
      Yikes. Love was{" "}
      <strong style={{color:"#1E40AF", WebkitTextStroke:"0.5px #1F2937"}}>Freezing</strong>
      {" "}— a game K. Love would love to forget. So would you.&nbsp;🥶
    </span>
  ),
  // ftue-patty: no bubble intentionally
  "ftue-booker": (
    <span>
      Devin was{" "}
      <strong style={{color:"#EF4444", border:"1.5px solid #EF4444", padding:"1px 6px", borderRadius:4, fontSize:"0.95em"}}>Smoking Hot!</strong>
      {" "}He really carried your team tonight. Be legendary.&nbsp;🔥
    </span>
  ),
};

// ── Bubble queue entry ────────────────────────────────────────────────────────
type OnDismiss = () => void;
interface QueueEntry {
  key: string;           // unique, prevents duplicate enqueue
  node: React.ReactNode;
  onDismiss?: OnDismiss;
  pulse?: "deal" | "draw";
}

type Pulse = "deal" | "draw" | null;

// ── Component ─────────────────────────────────────────────────────────────────
export function CoachLayer({
  isFTUE, gameState,
  lastRevealedCardId,
  onResumeHeldReveal, onCelebrationReady, onBubbleActive,
}: Props) {

  // ── Queue state ────────────────────────────────────────────────────────────
  const queue        = useRef<QueueEntry[]>([]);
  const shown        = useRef<Set<string>>(new Set());   // keys already shown/enqueued
  const [current,    setCurrent]   = useState<QueueEntry|null>(null);
  const [animKey,    setAnimKey]   = useState(0);
  const [pulsing,    setPulsing]   = useState<Pulse>(null);
  const pulseTimer   = useRef<ReturnType<typeof setTimeout>|null>(null);
  const prevState    = useRef<GameState|null>(null);

  // Whether Booker's card has been seen yet (gates WIN_CELEBRATION fire)
  const celebFired   = useRef(false);
  // Whether the "streak_collect" bubble has been shown
  const streakShown  = useRef(false);
  // Whether the "runback" bubble has been shown
  const runbackShown = useRef(false);
  // During REVEALING: whether the intro "tap to find out" bubble was shown
  const revealIntroShown = useRef(false);

  // ── Drain queue → show next ─────────────────────────────────────────────
  const drainQueue = useCallback(() => {
    const next = queue.current.shift();
    if (next) {
      setCurrent(next);
      setAnimKey(k => k + 1);
      onBubbleActive?.(true);
    } else {
      setCurrent(null);
      onBubbleActive?.(false);
    }
  }, [onBubbleActive]);

  // ── Enqueue helper — skips if key already shown ──────────────────────────
  function enqueue(entry: QueueEntry, delayMs = 0) {
    if (shown.current.has(entry.key)) return;
    shown.current.add(entry.key);
    const doEnqueue = () => {
      queue.current.push(entry);
      // If nothing showing right now, drain immediately
      setCurrent(prev => {
        if (!prev) {
          const next = queue.current.shift();
          if (next) {
            setAnimKey(k => k + 1);
            onBubbleActive?.(true);
            return next;
          }
        }
        return prev;
      });
    };
    if (delayMs > 0) setTimeout(doEnqueue, delayMs);
    else doEnqueue();
  }

  // ── Dismiss current bubble ───────────────────────────────────────────────
  const dismiss = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      // Fire onDismiss callback
      prev.onDismiss?.();
      // Pulse after dismiss if requested
      if (prev.pulse) {
        if (pulseTimer.current) clearTimeout(pulseTimer.current);
        setPulsing(prev.pulse);
        pulseTimer.current = setTimeout(() => setPulsing(null), 6000);
      }
      return null;
    });
    onBubbleActive?.(false);
    // Drain next from queue after short gap
    setTimeout(() => {
      const next = queue.current.shift();
      if (next) {
        setCurrent(next);
        setAnimKey(k => k + 1);
        onBubbleActive?.(true);
      }
    }, 120);
  }, [onBubbleActive]);

  // ── Pulse DOM button ─────────────────────────────────────────────────────
  useEffect(() => {
    const btns = Array.from(document.querySelectorAll("[data-action]")) as HTMLElement[];
    btns.forEach(btn => { btn.style.animation = ""; });
    if (!pulsing) return;
    const btn = btns.find(b => b.getAttribute("data-action") === pulsing);
    if (btn) btn.style.animation = "coachBtnPulse 1s ease-in-out infinite";
  }, [pulsing]);

  // ── Reset on new game (IDLE) ─────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE) return;
    if (gameState !== "IDLE") return;
    if (prevState.current === "IDLE") return;
    prevState.current = "IDLE";
    // Full reset
    queue.current = [];
    shown.current.clear();
    celebFired.current    = false;
    streakShown.current   = false;
    runbackShown.current  = false;
    revealIntroShown.current = false;
    setCurrent(null);
    onBubbleActive?.(false);
    // Show DEAL bubble
    enqueue({
      key: "idle_deal",
      node: <span>Hit <DealChip /> to reveal your starting hand.</span>,
      pulse: "deal",
    }, 500);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── HOLD bubble ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "HOLD") return;
    if (prevState.current === "HOLD") return;
    prevState.current = "HOLD";
    enqueue({
      key: "hold_booker",
      node: (
        <span>
          Devin Booker is our most dependable player — tap him to hold,
          then hit <DrawChip /> to get replacement players.
        </span>
      ),
      pulse: "draw",
    }, 700);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── REVEALING intro bubble ───────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "REVEALING") return;
    if (prevState.current === "REVEALING") return;
    prevState.current = "REVEALING";
    if (revealIntroShown.current) return;
    revealIntroShown.current = true;
    enqueue({
      key: "reveal_intro",
      node: (
        <span>
          You got five replacement players — let's see who you got.
          Tap them to find out!&nbsp;🏀
        </span>
      ),
    }, 400);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── Per-card bubble (fires when lastRevealedCardId changes) ─────────────
  useEffect(() => {
    if (!isFTUE) return;
    if (!lastRevealedCardId) return;
    const node = CARD_BUBBLES[lastRevealedCardId];

    if (lastRevealedCardId === "ftue-booker") {
      // Booker is the held card — show bubble, then on dismiss fire WIN_CELEBRATION
      enqueue({
        key: "card_ftue-booker",
        node,
        onDismiss: () => {
          if (!celebFired.current) {
            celebFired.current = true;
            onCelebrationReady?.();
            // After 2.8s for tier gauge + coins, show streak bubble
            setTimeout(() => {
              enqueue({
                key: "streak_collect",
                node: (
                  <span>
                    You're on a streak — two more wins and you get a special reward!&nbsp;🔥
                    <br /><br />
                    Don't forget to collect your rewards&nbsp;🪙 — tap the{" "}
                    <strong style={{color:"#FFD700"}}>coins area</strong> to collect.
                  </span>
                ),
              });
              drainQueue();
            }, 2800);
          }
        },
      }, 600);
      return;
    }

    if (!node) {
      // No bubble (Patty) — just resume Booker reveal after a short pause
      setTimeout(() => onResumeHeldReveal?.(), 600);
      return;
    }

    // Non-Booker, non-Patty card
    enqueue({
      key: `card_${lastRevealedCardId}`,
      node,
      onDismiss: () => {
        // Resume Booker reveal — safe to call multiple times, only fires when ref is populated
        onResumeHeldReveal?.();
      },
    }, 400);
  }, [lastRevealedCardId, isFTUE]); // eslint-disable-line

  // ── RESULTS bubbles (after coins collected) ──────────────────────────────
  // Sequence: 1) near-miss/runback → 2) "not bad for a first timer" → pulse replay
  useEffect(() => {
    if (!isFTUE || gameState !== "RESULTS") return;
    if (prevState.current === "RESULTS") return;
    prevState.current = "RESULTS";
    if (runbackShown.current) return;
    runbackShown.current = true;
    enqueue({
      key: "runback",
      node: (
        <span>
          Darn it — see that bar below in{" "}
          <strong style={{color:"#C084FC"}}>purple</strong>.
          You were just 2 points away from an{" "}
          <strong style={{color:"#C084FC"}}>All Star</strong>{" "}
          win. If only Klay or Love showed up we'd have won an extra 5x.
          Flip the cards to see their game logs.
        </span>
      ),
    }, 600);
    // Enqueue the final bubble immediately after — it will wait in queue
    enqueue({
      key: "final_runback",
      node: (
        <span>
          Not bad for a first timer — all game logs are{" "}
          <strong style={{color:"#22C55E"}}>TRUE</strong>{" "}
          games your players had last season.
          Win three in a row for an extra bonus.
          Ready to run it back?&nbsp;🏀
        </span>
      ),
      pulse: "deal",
    });
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── Track gameState transitions not handled above ────────────────────────
  useEffect(() => {
    if (!isFTUE) return;
    if (gameState === "DRAWING" || gameState === "DEALING") {
      prevState.current = gameState;
    }
    if (gameState === "WIN_CELEBRATION") {
      prevState.current = "WIN_CELEBRATION";
    }
  }, [gameState, isFTUE]);

  if (!isFTUE) return null;

  const isRunback = current?.key === "runback";

  return (
    <>
      <style>{`
        @keyframes coachFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes coachSlideUp {
          from { opacity:0; transform:translateY(20px) scale(.94) }
          to   { opacity:1; transform:translateY(0)    scale(1)   }
        }
        @keyframes coachBtnPulse {
          0%,100% { box-shadow:0 0 0 0 rgba(127,255,0,0); }
          50%     { box-shadow:0 0 0 10px rgba(127,255,0,0.4); }
        }
        @keyframes hintPulse {
          0%,100% { opacity:0.7; transform:translateY(-50%) scale(1); }
          50%     { opacity:1;   transform:translateY(-50%) scale(1.06); }
        }
        @keyframes arrowBounce {
          0%,100% { transform:translateX(0); }
          50%     { transform:translateX(4px); }
        }
      `}</style>

      {/* Booker flip hint during RESULTS */}
      {gameState === "RESULTS" && !current && (
        <BookerFlipHint />
      )}

      {current && (
        <div
          key={animKey}
          onClick={dismiss}
          style={{
            position:"fixed", inset:0, zIndex:300,
            display:"flex", alignItems:"center", justifyContent:"center",
            padding:"0 28px",
            background:"rgba(0,0,0,0.68)",
            backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)",
            animation:"coachFadeIn 0.2s ease forwards",
            cursor:"pointer",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              animation:"coachSlideUp 0.3s cubic-bezier(.2,.8,.4,1) forwards",
              background:"rgba(10,13,20,0.98)",
              border:"1px solid rgba(255,255,255,0.13)",
              borderRadius:20,
              padding:"32px 32px 24px",
              maxWidth:320, width:"100%",
              textAlign:"center",
              boxShadow:"0 28px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)",
              cursor:"default",
            }}
          >
            <div style={{
              width:48, height:48, borderRadius:"50%",
              background:"linear-gradient(135deg,#1a2540,#0d1320)",
              border:"1.5px solid rgba(255,255,255,0.1)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:24, margin:"0 auto 18px",
            }}>🏀</div>

            <p style={{
              fontFamily:"system-ui,-apple-system,sans-serif",
              fontSize:18, fontWeight:500, color:"#F0F2F5",
              lineHeight:1.65, margin:"0 0 22px", letterSpacing:"0.01em",
            }}>{current.node}</p>

            <div
              onClick={dismiss}
              style={{
                display:"inline-block", padding:"8px 22px",
                background:"rgba(255,255,255,0.07)",
                border:"1px solid rgba(255,255,255,0.15)",
                borderRadius:8, fontSize:12, fontWeight:700,
                color:"rgba(240,242,245,0.55)",
                letterSpacing:"0.08em", textTransform:"uppercase",
                cursor:"pointer",
              }}
            >Got it</div>
          </div>
        </div>
      )}
    </>
  );
}

function BookerFlipHint() {
  const [pos, setPos] = useState<{top:number; left:number}|null>(null);
  useEffect(() => {
    function measure() {
      const slot = document.querySelector("[data-slot='0']") as HTMLElement|null;
      if (!slot) return;
      const r = slot.getBoundingClientRect();
      setPos({ top: r.top + r.height / 2, left: r.left + r.width / 2 });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  if (!pos) return null;
  return (
    <div style={{
      position:"fixed",
      top: pos.top,
      left: pos.left,
      transform:"translate(-50%,-50%)",
      zIndex:50,
      animation:"hintPulse 1.4s ease-in-out infinite",
      pointerEvents:"none",
    }}>
      <div style={{
        background:"rgba(255,215,0,0.92)", color:"#070A12",
        padding:"7px 14px", borderRadius:8,
        fontSize:12, fontWeight:900,
        letterSpacing:"0.06em", textTransform:"uppercase",
        whiteSpace:"nowrap",
        boxShadow:"0 0 16px rgba(255,215,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        border:"1.5px solid rgba(255,215,0,0.8)",
      }}>Tap to flip</div>
    </div>
  );
}
