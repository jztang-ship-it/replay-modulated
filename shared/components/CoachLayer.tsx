import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type GameState = "IDLE"|"DEALING"|"HOLD"|"DRAWING"|"REVEALING"|"RESULTS"|"WIN_CELEBRATION";
export type CoachLesson = "ftue_basics";

/** Where to place the callout so it points at gameplay UI instead of covering it */
export type BubbleAnchor =
  | "deal"
  | "draw"
  | "roster"
  | "gauge"
  | "center"
  | { cardId: string };

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

const CARD_BUBBLES: Record<string, ReactNode> = {
  "ftue-westbrook": (
    <span>Westbrook put in a solid shift — nothing flashy, just steady work. That's what you want from a reliable piece of your lineup.&nbsp;💪</span>
  ),
  "ftue-cp3": (
    <span><Stamp label="On Fire!" {...STAMP_STYLES["ON FIRE"]} /> CP3 outperformed his projected fantasy points — a masterclass in running the offense.&nbsp;🧠</span>
  ),
  "ftue-klay": (
    <span>Klay was <Stamp label="Freezing" {...STAMP_STYLES["FREEZING"]} /> — not the best night for Klay. Splash Brother no more.&nbsp;🧊</span>
  ),
  "ftue-klove": (
    <span>Yikes, Love was <Stamp label="Ice Cold" {...STAMP_STYLES["ICE COLD"]} /> this game — a performance I'm sure you and him would both like to forget.&nbsp;🥶</span>
  ),
  "ftue-patty": (
    <span>
      10.7 isn't bad for a white card like Patty — our players are ranked by
      salary and color code to tell you how they should do, then actual game
      logs are converted into fantasy points.&nbsp;💡
    </span>
  ),
  "ftue-booker": (
    <span>Devin was <Stamp label="Smoking Hot!" {...STAMP_STYLES["SMOKING HOT"]} /> He really carried your team tonight. Be legendary.&nbsp;🔥</span>
 ),
};

type OnDismiss = () => void;
interface QueueEntry {
  key: string;
  node: ReactNode;
  onDismiss?: OnDismiss;
  pulse?: "deal" | "draw";
  anchor?: BubbleAnchor;
}
type Pulse = "deal" | "draw" | null;

const FTUE_SPOTLIGHT_STYLE_ID = "ftue-coach-spotlight-styles";

function ensureSpotlightStylesInjected() {
  if (typeof document === "undefined") return;
  if (document.getElementById(FTUE_SPOTLIGHT_STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = FTUE_SPOTLIGHT_STYLE_ID;
  st.textContent = `.ftue-spotlight {}`;
  document.head.appendChild(st);
}

function resolveAnchorElement(anchor: BubbleAnchor | undefined): HTMLElement | null {
  if (!anchor || anchor === "center") return null;
  if (typeof anchor === "object") {
    return document.querySelector(`[data-ftue-card="${anchor.cardId}"]`) as HTMLElement | null;
  }
  if (anchor === "deal") return document.querySelector('[data-ftue-anchor="deal"]') as HTMLElement | null;
  if (anchor === "draw") return document.querySelector('[data-ftue-anchor="draw"]') as HTMLElement | null;
  if (anchor === "roster") return document.querySelector('[data-ftue-anchor="roster"]') as HTMLElement | null;
  if (anchor === "gauge") return document.querySelector('[data-ftue-anchor="tier-gauge"]') as HTMLElement | null;
  return null;
}

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

  const [replayReady,  setReplayReady] = useState(false);
  const pulseTimer     = useRef<ReturnType<typeof setTimeout>|null>(null);
  const prevState      = useRef<GameState|null>(null);
  const celebFired     = useRef(false);
  const revealIntroShown = useRef(false);
  const bookerFlipBubbleShown = useRef(false);

  // ── Drain / enqueue ────────────────────────────────────────────────────
  const tryDrain = useCallback(() => {
    const next = queue.current[0];
    if (!next) return;
    setCurrent(prev => {
      if (prev) return prev;
      queue.current.shift();
      setAnimKey(k => k + 1);
      setTimeout(() => onBubbleActive?.(true), 0);
      return next;
    });
  }, [onBubbleActive]);

  function enqueue(entry: QueueEntry, delayMs = 0) {
    if (shown.current.has(entry.key)) return;
    shown.current.add(entry.key);
    const go = () => {
      queue.current.push(entry);
      setTimeout(tryDrain, 0);
    };
    if (delayMs > 0) setTimeout(go, delayMs);
    else go();
  }

  const dismiss = useCallback(() => {
    let dismissEntry: QueueEntry | null = null;
    setCurrent(prev => {
      if (!prev) return null;
      dismissEntry = prev;
      return null;
    });
    setTimeout(() => {
      if (dismissEntry) {
        dismissEntry.onDismiss?.();
        if (dismissEntry.pulse) {
          if (pulseTimer.current) clearTimeout(pulseTimer.current);
          setPulsing(dismissEntry.pulse);
          pulseTimer.current = setTimeout(() => setPulsing(null), 8000);
        }
      }
      onBubbleActive?.(false);
      setTimeout(tryDrain, 150);
    }, 0);
  }, [onBubbleActive, tryDrain]);

  useEffect(() => {
    if (!isFTUE || !current) return;
    ensureSpotlightStylesInjected();
    const el = resolveAnchorElement(current.anchor);
    if (el) el.classList.add("ftue-spotlight");
    return () => {
      if (el) el.classList.remove("ftue-spotlight");
    };
  }, [isFTUE, current, animKey]);

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
    enqueue({ key: "idle_deal", node: <span>Hit <DealChip /> to reveal your starting hand.</span>, pulse: "deal", anchor: "deal" }, 500);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── HOLD ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "HOLD") return;
    if (prevState.current === "HOLD") return;
    prevState.current = "HOLD";
    enqueue({
      key: "hold_booker",
      node: <span>Devin Booker is our most dependable player — tap him to hold, then hit <DrawChip /> to get replacement players.</span>,
      pulse: "draw",
      anchor: "roster",
    }, 700);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── REVEALING intro ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "REVEALING") return;
    if (prevState.current === "REVEALING") return;
    prevState.current = "REVEALING";
    if (revealIntroShown.current) return;
    revealIntroShown.current = true;
    enqueue({
      key: "reveal_intro",
      node: <span>You got five replacement players — let's see who you got. Tap them to find out!&nbsp;🏀</span>,
      anchor: "roster",
    }, 400);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── Per-card reveal bubbles ───────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || !lastRevealedCardId) return;
    const node = CARD_BUBBLES[lastRevealedCardId];
    const cardAnchor: BubbleAnchor = { cardId: lastRevealedCardId };

    if (lastRevealedCardId === "ftue-booker") {
      enqueue({
        key: "card_ftue-booker",
        node,
        anchor: cardAnchor,
        onDismiss: () => {
          if (!celebFired.current) {
            celebFired.current = true;
            setTimeout(() => {
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
                anchor: "gauge",
                onDismiss: () => onCelebrationReady?.(),
              });
            }, 800);
          }
        },
      }, 600);
      return;
    }

    if (!node) {
      setTimeout(() => {
        onBubbleActive?.(false);
        onResumeHeldReveal?.();
      }, 600);
      return;
    }

    enqueue({
      key: `card_${lastRevealedCardId}`,
      node,
      anchor: cardAnchor,
      onDismiss: () => onResumeHeldReveal?.(),
    }, 400);
  }, [lastRevealedCardId, isFTUE]); // eslint-disable-line

  // ── RESULTS: show "tap to see Booker stats" bubble ────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "RESULTS") return;
    if (prevState.current === "RESULTS") return;
    prevState.current = "RESULTS";
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    setPulsing(null);
    enqueue({
      key: "results_intro",
      node: (
        <span>
          All game logs are actual historical games — let's tap Booker's card to see what game we drew.&nbsp;🏀
        </span>
      ),
      anchor: { cardId: "ftue-booker" },
    }, 500);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── After Booker flipped — show final bubble ──────────────────────────
  useEffect(() => {
    if (!isFTUE || !ftueBookerFlipped) return;
    if (bookerFlipBubbleShown.current) return;
    bookerFlipBubbleShown.current = true;
    onBubbleActive?.(true);
    setTimeout(() => {
      shown.current.delete("final_not_bad");
      enqueue({
        key: "final_not_bad",
        node: (
          <span>
            Not bad for a newbie — we lucked out and drew Booker's game against TOR on March 17th 2025, what a game! Two more wins and we unlock 5% of the bonus pool. Run it back?&nbsp;🏀
          </span>
        ),
        onDismiss: () => setReplayReady(true),
        pulse: "deal",
        anchor: "deal",
      });
    }, 800);
  }, [ftueBookerFlipped, isFTUE, onBubbleActive]); // eslint-disable-line

  useEffect(() => {
    if (replayReady) onReplayReady?.();
  }, [replayReady]); // eslint-disable-line

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
        @keyframes coachBtnPulse { 0%,100%{box-shadow:0 0 0 0 rgba(127,255,0,0)} 50%{box-shadow:0 0 0 10px rgba(127,255,0,0.4)} }
      `}</style>

      {current && (
        <>
          <div
            key={animKey}
            role="button"
            tabIndex={0}
            aria-label="Continue"
            onClick={dismiss}
            onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") dismiss(); }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999,
              background: "rgba(0,0,0,0)",
              cursor: "pointer",
            }}
          />
          <div
            style={{
              position: "fixed",
              bottom: 140,
              left: 0,
              right: 0,
              zIndex: 1001,
              textAlign: "center",
              color: "#FFFFFF",
              fontSize: 15,
              fontWeight: 600,
              padding: "0 32px",
              pointerEvents: "none",
              lineHeight: 1.45,
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
          >
            {current.node}
          </div>
        </>
      )}
    </>
  );
}
