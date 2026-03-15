import { useEffect, useRef, useState, useCallback } from "react";

type GameState = "IDLE"|"DEALING"|"HOLD"|"DRAWING"|"REVEALING"|"RESULTS"|"WIN_CELEBRATION";
export type CoachLesson = "ftue_basics";

interface Props {
  isFTUE: boolean;
  gameState: GameState;
  lastRevealedCardId?: string | null;
  ftueBookerFlipped?: boolean;
  onResumeHeldReveal?: () => void;
  onCelebrationReady?: () => void;
  onBubbleActive?: (active: boolean) => void;
  onReplay?: () => void;
  /** Called when replay button should become active (after final bubble dismissed) */
  onReplayReady?: () => void;
  // compat
  lockedCount?: number; revealIndex?: number;
  legendaryCardName?: string; lesson?: CoachLesson;
}

function DrawChip() {
  return <span style={{display:"inline-block",padding:"2px 10px",background:"linear-gradient(135deg,#7FFF00,#5BBE00)",color:"#070A12",borderRadius:4,fontWeight:900,fontSize:14,letterSpacing:".12em",textTransform:"uppercase",verticalAlign:"middle",lineHeight:1.5}}>DRAW</span>;
}
function DealChip() {
  return <span style={{display:"inline-block",padding:"2px 10px",background:"linear-gradient(135deg,#4B9EE8,#2B7EC8)",color:"#fff",borderRadius:4,fontWeight:900,fontSize:14,letterSpacing:".12em",textTransform:"uppercase",verticalAlign:"middle",lineHeight:1.5}}>DEAL</span>;
}

// Stamp label styled to match actual card stamp appearance
function Stamp({ label, color, border }: { label: string; color: string; border: string }) {
  return (
    <strong style={{
      color, border: `1.5px solid ${border}`,
      padding: "1px 7px", borderRadius: 4,
      fontSize: "0.92em", letterSpacing: "0.05em",
    }}>{label}</strong>
  );
}

const STAMP_STYLES: Record<string, { color: string; border: string }> = {
  "SMOKING HOT": { color: "#EF4444", border: "#EF4444" },
  "ON FIRE":     { color: "#FB923C", border: "#FB923C" },
  "ICE COLD":    { color: "#9CA3AF", border: "#6B7280" },
  "FREEZING":    { color: "#1E40AF", border: "#1F2937" },
};

const CARD_BUBBLES: Record<string, React.ReactNode> = {
  "ftue-westbrook": (
    <span>Westbrook put in a solid shift — nothing flashy, just steady work. That's what you want from a reliable piece of your lineup.&nbsp;💪</span>
  ),
  "ftue-cp3": (
    <span><Stamp label="On Fire!" {...STAMP_STYLES["ON FIRE"]} /> CP3 outperformed his projected fantasy points — a masterclass in running the offense.&nbsp;🧠</span>
  ),
  "ftue-klay": (
    <span>Klay's performance is <Stamp label="Freezing" {...STAMP_STYLES["FREEZING"]} /> — not the best night for Klay. Splash Brother no more.&nbsp;🧊</span>
  ),
  "ftue-klove": (
    <span>Yikes, Love was <Stamp label="Ice Cold" {...STAMP_STYLES["ICE COLD"]} /> this game — a performance I'm sure you and him would both like to forget.&nbsp;🥶</span>
  ),
  // ftue-patty: no bubble
  "ftue-booker": (
    <span>Devin was <Stamp label="Smoking Hot!" {...STAMP_STYLES["SMOKING HOT"]} /> He really carried your team tonight. Be legendary.&nbsp;🔥</span>
  ),
};

type OnDismiss = () => void;
interface QueueEntry {
  key: string;
  node: React.ReactNode;
  onDismiss?: OnDismiss;
  pulse?: "deal" | "draw";
}
type Pulse = "deal" | "draw" | null;

export function CoachLayer({
  isFTUE, gameState,
  lastRevealedCardId, ftueBookerFlipped,
  onResumeHeldReveal, onCelebrationReady, onBubbleActive, onReplayReady,
}: Props) {
  const queue          = useRef<QueueEntry[]>([]);
  const shown          = useRef<Set<string>>(new Set());
  const [current,      setCurrent]   = useState<QueueEntry|null>(null);
  const [animKey,      setAnimKey]   = useState(0);
  const [pulsing,      setPulsing]   = useState<Pulse>(null);
  const [showCollect,  setShowCollect] = useState(false);
  const [replayReady,  setReplayReady] = useState(false);
  const pulseTimer     = useRef<ReturnType<typeof setTimeout>|null>(null);
  const prevState      = useRef<GameState|null>(null);
  const celebFired     = useRef(false);
  const revealIntroShown = useRef(false);
  const bookerFlipBubbleShown = useRef(false);

  // ── Drain / enqueue ────────────────────────────────────────────────────
  const tryDrain = useCallback(() => {
    setCurrent(prev => {
      if (prev) return prev; // already showing
      const next = queue.current.shift();
      if (next) {
        setAnimKey(k => k + 1);
        onBubbleActive?.(true);
        return next;
      }
      return null;
    });
  }, [onBubbleActive]);

  function enqueue(entry: QueueEntry, delayMs = 0) {
    if (shown.current.has(entry.key)) return;
    shown.current.add(entry.key);
    const go = () => {
      queue.current.push(entry);
      tryDrain();
    };
    if (delayMs > 0) setTimeout(go, delayMs);
    else go();
  }

  const dismiss = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      prev.onDismiss?.();
      if (prev.pulse) {
        if (pulseTimer.current) clearTimeout(pulseTimer.current);
        setPulsing(prev.pulse);
        pulseTimer.current = setTimeout(() => setPulsing(null), 8000);
      }
      return null;
    });
    onBubbleActive?.(false);
    setTimeout(() => {
      const next = queue.current.shift();
      if (next) {
        setCurrent(next);
        setAnimKey(k => k + 1);
        onBubbleActive?.(true);
      }
    }, 120);
  }, [onBubbleActive]);

  // ── Pulse DOM button ─────────────────────────────────────────────────
  useEffect(() => {
    const btns = Array.from(document.querySelectorAll("[data-action]")) as HTMLElement[];
    btns.forEach(btn => { btn.style.animation = ""; });
    if (!pulsing) return;
    const btn = btns.find(b => b.getAttribute("data-action") === pulsing);
    if (btn) btn.style.animation = "coachBtnPulse 1s ease-in-out infinite";
  }, [pulsing]);

  // ── IDLE reset ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "IDLE") return;
    if (prevState.current === "IDLE") return;
    prevState.current = "IDLE";
    queue.current = [];
    shown.current.clear();
    celebFired.current = false;
    revealIntroShown.current = false;
    bookerFlipBubbleShown.current = false;
    setCurrent(null);
    onBubbleActive?.(false);
    enqueue({ key: "idle_deal", node: <span>Hit <DealChip /> to reveal your starting hand.</span>, pulse: "deal" }, 500);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── HOLD ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "HOLD") return;
    if (prevState.current === "HOLD") return;
    prevState.current = "HOLD";
    enqueue({ key: "hold_booker", node: <span>Devin Booker is our most dependable player — tap him to hold, then hit <DrawChip /> to get replacement players.</span>, pulse: "draw" }, 700);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── REVEALING intro ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "REVEALING") return;
    if (prevState.current === "REVEALING") return;
    prevState.current = "REVEALING";
    if (revealIntroShown.current) return;
    revealIntroShown.current = true;
    enqueue({ key: "reveal_intro", node: <span>You got five replacement players — let's see who you got. Tap them to find out!&nbsp;🏀</span> }, 400);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── Per-card reveal bubbles ───────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || !lastRevealedCardId) return;
    const node = CARD_BUBBLES[lastRevealedCardId];

    if (lastRevealedCardId === "ftue-booker") {
      enqueue({
        key: "card_ftue-booker",
        node,
        onDismiss: () => {
          if (!celebFired.current) {
            celebFired.current = true;
            onCelebrationReady?.();
            // After 2.8s for tier gauge + coins to animate, show darn-it bubble
            setTimeout(() => {
              setShowCollect(true);
              enqueue({
                key: "darnit",
                node: (
                  <span>
                    Darn it — we only missed the{" "}
                    <strong style={{color:"#C084FC",border:"1.5px solid #C084FC",padding:"1px 6px",borderRadius:4,fontSize:"0.92em"}}>All Star</strong>{" "}
                    win by 2.4 points. If only Love or Klay showed up we would have won an extra 5x.
                    Don't forget to collect your rewards!&nbsp;🪙
                  </span>
                ),
                onDismiss: () => setShowCollect(false),
              });
              tryDrain();
            }, 1600);
          }
        },
      }, 600);
      return;
    }

    if (!node) {
      // Patty — no bubble, just resume
      setTimeout(() => onResumeHeldReveal?.(), 600);
      return;
    }

    enqueue({
      key: `card_${lastRevealedCardId}`,
      node,
      onDismiss: () => onResumeHeldReveal?.(),
    }, 400);
  }, [lastRevealedCardId, isFTUE]); // eslint-disable-line

  // ── RESULTS: show "tap to see Booker stats" bubble ────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "RESULTS") return;
    if (prevState.current === "RESULTS") return;
    prevState.current = "RESULTS";
    enqueue({
      key: "results_intro",
      node: (
        <span>
          All game logs are actual historical games — let's tap Booker's card to see what game we drew.&nbsp;🏀
        </span>
      ),
    }, 500);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── After Booker flipped — show final bubble ──────────────────────────
  useEffect(() => {
    if (!isFTUE || !ftueBookerFlipped) return;
    if (bookerFlipBubbleShown.current) return;
    bookerFlipBubbleShown.current = true;
    enqueue({
      key: "final_not_bad",
      node: (
        <span>
          Not bad for a newbie — you lucked out and drew one of Booker's strongest games of the season.
          Win two more and you get a special reward. Run it back?&nbsp;🏀
        </span>
      ),
      onDismiss: () => setReplayReady(true),
    }, 600);
  }, [ftueBookerFlipped, isFTUE]); // eslint-disable-line

  // When replayReady set, notify GameView to enable the replay button
  useEffect(() => {
    if (replayReady) onReplayReady?.();
  }, [replayReady]); // eslint-disable-line

  // ── Track other state transitions ─────────────────────────────────────
  useEffect(() => {
    if (!isFTUE) return;
    if (["DRAWING","DEALING","WIN_CELEBRATION"].includes(gameState)) {
      prevState.current = gameState as GameState;
    }
  }, [gameState, isFTUE]);

  if (!isFTUE) return null;

  return (
    <>
      <style>{`
        @keyframes coachFadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes coachSlideUp { from{opacity:0;transform:translateY(20px) scale(.94)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes coachBtnPulse { 0%,100%{box-shadow:0 0 0 0 rgba(127,255,0,0)} 50%{box-shadow:0 0 0 10px rgba(127,255,0,0.4)} }
        @keyframes collectPulse { 0%,100%{opacity:0.5;transform:translateY(0)} 50%{opacity:1;transform:translateY(-3px)} }
      `}</style>

      {/* Pulsing "Tap to collect" — fixed below coins area, shows during WIN_CELEBRATION darnit phase */}
      {showCollect && (
        <div style={{
          position:"fixed", bottom:140, left:"50%", transform:"translateX(-50%)",
          zIndex:299, pointerEvents:"none",
          display:"flex", flexDirection:"column", alignItems:"center", gap:4,
          animation:"collectPulse 1.1s ease-in-out infinite",
        }}>
          <div style={{fontSize:18}}>🪙</div>
          <div style={{
            fontSize:11, fontWeight:900, letterSpacing:"0.1em", textTransform:"uppercase",
            color:"#FFD700",
            textShadow:"0 0 10px rgba(255,215,0,0.6)",
          }}>Tap to collect</div>
          <div style={{fontSize:14, color:"#FFD700", opacity:0.8}}>↓</div>
        </div>
      )}

      {current && (
        <div key={animKey} onClick={dismiss} style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 28px",background:"rgba(0,0,0,0.68)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",animation:"coachFadeIn 0.2s ease forwards",cursor:"pointer"}}>
          <div onClick={e => e.stopPropagation()} style={{animation:"coachSlideUp 0.3s cubic-bezier(.2,.8,.4,1) forwards",background:"rgba(10,13,20,0.98)",border:"1px solid rgba(255,255,255,0.13)",borderRadius:20,padding:"32px 32px 24px",maxWidth:320,width:"100%",textAlign:"center",boxShadow:"0 28px 80px rgba(0,0,0,0.7)",cursor:"default"}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#1a2540,#0d1320)",border:"1.5px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,margin:"0 auto 18px"}}>🏀</div>
            <p style={{fontFamily:"system-ui,-apple-system,sans-serif",fontSize:18,fontWeight:500,color:"#F0F2F5",lineHeight:1.65,margin:"0 0 22px",letterSpacing:"0.01em"}}>{current.node}</p>

            <div onClick={dismiss} style={{display:"inline-block",padding:"8px 22px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,fontSize:12,fontWeight:700,color:"rgba(240,242,245,0.55)",letterSpacing:"0.08em",textTransform:"uppercase",cursor:"pointer"}}>Got it</div>
          </div>
        </div>
      )}
    </>
  );
}
