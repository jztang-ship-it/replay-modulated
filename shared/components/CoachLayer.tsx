import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type GameState = "IDLE"|"DEALING"|"HOLD"|"DRAWING"|"REVEALING"|"RESULTS"|"WIN_CELEBRATION";
export type CoachLesson = "ftue_basics";

export type BubbleAnchor =
  | "deal"
  | "draw"
  | "roster"
  | "roster-and-score"
  | "score-row"
  | "booker-and-gauge"
  | "ftue-darnit-focus"
  | "gauge"
  | "center"
  | { cardId: string };

type BubblePosition = "above" | "below" | "auto";

interface Props {
  isFTUE: boolean;
  gameState: GameState;
  lastRevealedCardId?: string | null;
  ftueBookerFlipped?: boolean;
  ftueWinCelebrationActive?: boolean;
  /** Active coach queue key (e.g. hold_roster_intro, hold_booker, card_ftue-westbrook) — for GameView roster highlight */
  onCoachBubbleKey?: (key: string | null) => void;
  onResumeHeldReveal?: () => void;
  onCelebrationReady?: () => void;
  onFtueReadyToFlip?: () => void;
  onFtueBookerHeld?: () => void;
  onFtueAllDone?: () => void;
  onBubbleActive?: (active: boolean) => void;
  onReplay?: () => void;
  onReplayReady?: () => void;
  lockedCount?: number; revealIndex?: number;
  legendaryCardName?: string; lesson?: CoachLesson;
}

// ── Inline chips matching the actual buttons ────────────────────────────────
function DrawChip() {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px",
      background: "linear-gradient(135deg,#7FFF00,#5BBE00)",
      color: "#070A12", borderRadius: 4, fontWeight: 900, fontSize: 14,
      letterSpacing: ".12em", textTransform: "uppercase",
      verticalAlign: "middle", lineHeight: 1.5,
    }}>DRAW</span>
  );
}
function DealChip() {
  return (
    <span style={{
      display: "inline-block", padding: "3px 14px",
      background: "#3AA0FF",
      color: "#000000", borderRadius: 16, fontWeight: 900, fontSize: 14,
      letterSpacing: ".12em", textTransform: "uppercase",
      verticalAlign: "middle", lineHeight: 1.6,
    }}>DEAL</span>
  );
}

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

// Row 1 (slots 0-2): message below card. Row 2 (slots 3-5): message above card.
const CARD_POSITION: Record<string, BubblePosition> = {
  "ftue-booker":    "below",
  "ftue-westbrook": "below",
  "ftue-cp3":       "below",
  "ftue-klay":      "above",
  "ftue-klove":     "above",
  "ftue-patty":     "above",
};

const CARD_BUBBLES: Record<string, ReactNode> = {
  "ftue-westbrook": (
    <span>Westbrook put in a solid shift — nothing flashy, just steady work. That's what you want from a reliable piece of your lineup.&nbsp;💪</span>
  ),
  "ftue-cp3": (
    <span><Stamp label="On Fire!" {...STAMP_STYLES["ON FIRE"]} /> CP3 outperformed his average fantasy points — a masterclass in running the offense.&nbsp;🧠</span>
  ),
  "ftue-klay": (
    <span>Klay was <Stamp label="Freezing" {...STAMP_STYLES["FREEZING"]} /> — not the best night for Klay. Splash Brother no more.&nbsp;🧊</span>
  ),
  "ftue-klove": (
    <span>Yikes, Love was <Stamp label="Ice Cold" {...STAMP_STYLES["ICE COLD"]} /> this game — a performance I'm sure you and him would both like to forget.&nbsp;🥶</span>
  ),
  "ftue-patty": (
    <span>10.7 isn't bad for a white card like Patty — remember, colors help you see what average fantasy points to expect.&nbsp;💡</span>
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
  position?: BubblePosition;
  /** Explicit pill placement mode; spotlight anchor is still independent */
  pillLayout?: "anchor" | "viewport-center" | "above-spotlight" | "page-center";
  pulseCardLabels?: boolean;
}
type Pulse = "deal" | "draw" | null;

// Gap between spotlight edge and message pill (px)
const PILL_GAP = 22;
// Padding around spotlight rect — smaller for individual cards so we don't
// bleed into adjacent cards (grid gap is 8px, safe pad is 3px)
const PAD_CARD  = 3;
const PAD_OTHER = 10;

/** Full grid stage (all 6 cards) + Team FP / Budget row — outer roster port + score row */
function unionRosterAndScoreRect(): DOMRect | null {
  const rosterEl = document.querySelector('[data-ftue-anchor="roster-inner"]') ?? document.querySelector('[data-ftue-anchor="roster"]');
  const scoreEl  = document.querySelector('[data-ftue-anchor="score-row"]');
  if (!rosterEl) return null;
  const r1 = rosterEl.getBoundingClientRect();
  const r2 = scoreEl ? scoreEl.getBoundingClientRect() : r1;
  const top    = Math.min(r1.top,    r2.top);
  const bottom = Math.max(r1.bottom, r2.bottom);
  const left   = Math.min(r1.left,   r2.left);
  const right  = Math.max(r1.right,  r2.right);
  return {
    top, bottom, left, right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Booker card + TierGauge + score row — for the FTUE RESULTS dual spotlight */
function unionBookerAndGaugeRect(): DOMRect | null {
  const bookerEl = document.querySelector('[data-ftue-card="ftue-booker"]');
  const gaugeEl  = document.querySelector('[data-ftue-anchor="tier-gauge"]');
  const scoreEl  = document.querySelector('[data-ftue-anchor="score-row"]');
  if (!bookerEl || !gaugeEl) return null;
  const r1 = bookerEl.getBoundingClientRect();
  const r2 = gaugeEl.getBoundingClientRect();
  const r3 = scoreEl ? scoreEl.getBoundingClientRect() : r2;
  const top    = Math.min(r1.top,    r2.top,    r3.top);
  const bottom = Math.max(r1.bottom, r2.bottom, r3.bottom);
  const left   = Math.min(r1.left,   r2.left,   r3.left);
  const right  = Math.max(r1.right,  r2.right,  r3.right);
  return {
    top, bottom, left, right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function resolveAnchorElement(anchor: BubbleAnchor | undefined): HTMLElement | null {
  if (!anchor || anchor === "center") return null;
  if (typeof anchor === "object") {
    return document.querySelector(`[data-ftue-card="${anchor.cardId}"]`) as HTMLElement | null;
  }
  if (anchor === "deal")   return document.querySelector('[data-ftue-anchor="deal"]') as HTMLElement | null;
  if (anchor === "draw")   return document.querySelector('[data-ftue-anchor="draw"]') as HTMLElement | null;
  if (anchor === "roster") return document.querySelector('[data-ftue-anchor="roster"]') as HTMLElement | null;
  if (anchor === "gauge")  return document.querySelector('[data-ftue-anchor="tier-gauge"]') as HTMLElement | null;
  if (anchor === "ftue-darnit-focus") {
    return document.querySelector('[data-ftue-anchor="ftue-darnit-focus"]') as HTMLElement | null;
  }
  if (anchor === "roster-and-score") {
    const rect = unionRosterAndScoreRect();
    if (!rect) return null;
    return { getBoundingClientRect: () => rect } as unknown as HTMLElement;
  }
  if (anchor === "booker-and-gauge") {
    const rect = unionBookerAndGaugeRect();
    if (!rect) return null;
    return { getBoundingClientRect: () => rect } as unknown as HTMLElement;
  }
  return null;
}

/**
 * Returns a CSS position spec for the message pill container.
 * Uses `bottom` (distance from viewport bottom) when placing above,
 * `top` when placing below — so the pill never clips off screen.
 */
function computePillPlacement(
  rect: DOMRect,
  position: BubblePosition,
  pad: number,
  gapPx: number = PILL_GAP,
): { top: number } | { bottom: number } {
  const vh = window.innerHeight;
  const spotTop    = rect.top    - pad;
  const spotBottom = rect.bottom + pad;

  const side: "above" | "below" =
    position === "auto"
      ? (spotBottom > vh * 0.55 ? "above" : "below")
      : position;

  if (side === "above") {
    // Pin pill bottom edge at gapPx above spotlight top
    return { bottom: vh - spotTop + gapPx };
  } else {
    // Pin pill top edge at gapPx below spotlight bottom
    return { top: spotBottom + gapPx };
  }
}

export function CoachLayer({
  isFTUE, gameState,
  lastRevealedCardId, ftueBookerFlipped, ftueWinCelebrationActive,
  lockedCount,
  onCoachBubbleKey,
  onResumeHeldReveal, onCelebrationReady, onFtueReadyToFlip, onFtueBookerHeld, onFtueAllDone, onBubbleActive, onReplayReady,
}: Props) {
  const queue            = useRef<QueueEntry[]>([]);
  const shown            = useRef<Set<string>>(new Set());
  const [current,        setCurrent]   = useState<QueueEntry|null>(null);
  const [animKey,        setAnimKey]   = useState(0);
  const [pulsing,        setPulsing]   = useState<Pulse>(null);
  const [replayReady,    setReplayReady] = useState(false);
  const [spotlightRect,  setSpotlightRect] = useState<DOMRect | null>(null);
  const pulseTimer       = useRef<ReturnType<typeof setTimeout>|null>(null);
  const prevState        = useRef<GameState|null>(null);
  const revealIntroShown = useRef(false);
  const bookerFlipBubbleShown = useRef(false);

  // ── Drain / enqueue ────────────────────────────────────────────────────
  function enqueue(entry: QueueEntry, delayMs = 0) {
    if (shown.current.has(entry.key)) return;
    shown.current.add(entry.key);
    const go = () => {
      queue.current.push(entry);
      setCurrent(prev => {
        if (prev) return prev; // already showing — will drain on dismiss
        const next = queue.current.shift();
        if (!next) return prev;
        setAnimKey(k => k + 1);
        setTimeout(() => onBubbleActive?.(true), 0);
        return next;
      });
    };
    if (delayMs > 0) setTimeout(go, delayMs);
    else go();
  }

  const dismiss = useCallback(() => {
    setCurrent(prev => {
      if (!prev) return null;
      // Call onDismiss synchronously inside the updater — this pushes
      // any next bubble onto queue.current before we read it below
      prev.onDismiss?.();
      if (prev.pulse) {
        if (pulseTimer.current) clearTimeout(pulseTimer.current);
        setPulsing(prev.pulse);
        if (prev.pulse === "deal") {
          pulseTimer.current = setTimeout(() => setPulsing(null), 8000);
        }
      }
      // Swap directly to next — single React render, zero gap
      const next = queue.current.shift();
      if (next) {
        setAnimKey(k => k + 1);
        setTimeout(() => onBubbleActive?.(true), 0);
        return next;
      }
      setTimeout(() => onBubbleActive?.(false), 0);
      return null;
    });
  }, [onBubbleActive]);

  // Parent can align roster “lit” slot (e.g. Booker) with coach bubbles
  useEffect(() => {
    onCoachBubbleKey?.(current?.key ?? null);
  }, [current, onCoachBubbleKey]);

  // ── Resolve spotlight rect (double rAF = after layout; card holes line up with taps) ──
  const prevAnchorRef = useRef<string>("");
  useEffect(() => {
    if (!isFTUE || !current) {
      setSpotlightRect(null);
      prevAnchorRef.current = "";
      document.body.classList.remove("ftue-spotlight-active");
      return;
    }

    const snapshot = current;
    const anchorKey = typeof snapshot.anchor === "object"
      ? (snapshot.anchor as { cardId: string }).cardId
      : (snapshot.anchor ?? "none");

    if (anchorKey !== prevAnchorRef.current) {
      setSpotlightRect(null);
    }
    prevAnchorRef.current = anchorKey;

    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    let retryT: ReturnType<typeof setTimeout> | null = null;

    const applyRect = (rect: DOMRect | null) => {
      if (cancelled) return;
      if (!rect || rect.width < 2 || rect.height < 2) {
        setSpotlightRect(null);
        document.body.classList.remove("ftue-spotlight-active");
        return;
      }
      setSpotlightRect(rect);
      document.body.classList.add("ftue-spotlight-active");
    };

    const measure = () => {
      if (cancelled) return;
      if (snapshot.anchor === "roster-and-score") {
        const rect = unionRosterAndScoreRect();
        applyRect(rect);
        return;
      }
      if (snapshot.anchor === "booker-and-gauge") {
        const rect = unionBookerAndGaugeRect();
        applyRect(rect);
        return;
      }
      const el = resolveAnchorElement(snapshot.anchor);
      if (!el) {
        retryT = setTimeout(() => {
          if (cancelled) return;
          const el2 = resolveAnchorElement(snapshot.anchor);
          if (el2) applyRect(el2.getBoundingClientRect());
          else setSpotlightRect(null);
        }, 48);
        return;
      }
      applyRect(el.getBoundingClientRect());
    };

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        measure();
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (retryT) clearTimeout(retryT);
      document.body.classList.remove("ftue-spotlight-active");
    };
  }, [isFTUE, current, animKey]);

  // ── Card label pulse via CSS class on roster wrapper ─────────────────
  useEffect(() => {
    const roster = document.querySelector('[data-ftue-anchor="roster"]');
    if (!roster) return;
    if (current?.pulseCardLabels) {
      roster.classList.add("ftue-pulse-labels");
    } else {
      roster.classList.remove("ftue-pulse-labels");
    }
    return () => { roster.classList.remove("ftue-pulse-labels"); };
  }, [current]);

  // ── Pulse DOM action button ───────────────────────────────────────────
  useEffect(() => {
    const btns = Array.from(document.querySelectorAll("[data-action]")) as HTMLElement[];
    btns.forEach(btn => { btn.style.animation = ""; });
    if (!pulsing) return;
    const btn = btns.find(b => b.getAttribute("data-action") === pulsing);
    if (btn) btn.style.animation = "coachBtnPulse 1s ease-in-out infinite";
  }, [pulsing]);

  // ── Clear draw pulse when user actually hits DRAW ────────────────────
  useEffect(() => {
    if (gameState !== "HOLD" && pulsing === "draw") {
      setPulsing(null);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    }
  }, [gameState, pulsing]);

  // ── Draw pulse fires once Booker is held (lockedCount > 0 in HOLD) ───
  useEffect(() => {
    if (!isFTUE || gameState !== "HOLD" || (lockedCount ?? 0) === 0) return;
    onFtueBookerHeld?.();
    setPulsing("draw");
  }, [lockedCount, gameState, isFTUE]); // eslint-disable-line

  // ── IDLE reset ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || gameState !== "IDLE") return;
    if (prevState.current === "IDLE") return;
    prevState.current = "IDLE";
    queue.current = [];
    shown.current.clear();
    revealIntroShown.current = false;
    bookerFlipBubbleShown.current = false;
    setCurrent(null);
    onBubbleActive?.(false);
    enqueue({
      key: "idle_deal",
      node: <span>Hit <DealChip /> to reveal your starting hand.</span>,
      pulse: "deal",
      // no anchor → pill centers vertically, deal button stays visible below
    }, 500);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── HOLD — roster+score overview first, then Booker spotlight ────────
  useEffect(() => {
    if (!isFTUE || gameState !== "HOLD") return;
    if (prevState.current === "HOLD") return;
    prevState.current = "HOLD";

    // 1st: spotlight all 6 cards + Team FP/Budget row, salary+avg pulse
    // hold_booker only fires after this is dismissed — guaranteed ordering via onDismiss
    enqueue({
      key: "hold_roster_intro",
      node: (
        <span>
          Players are ranked by color and salary — guides to help you build your best lineup with a $200 salary cap. The higher ranked players have higher average fantasy points.&nbsp;🎯
        </span>
      ),
      anchor: "score-row",
      position: "above",
      pulseCardLabels: true,
      onDismiss: () => {
        shown.current.delete("hold_booker");
        queue.current = queue.current.filter(e => e.key !== "hold_booker");
        enqueue({
          key: "hold_booker",
          node: (
            <span>
              Devin Booker is our most dependable player — tap him to hold, then hit <DrawChip /> to get replacement players.
            </span>
          ),
          anchor: { cardId: "ftue-booker" },
          position: "below",
        });
      },
    }, 50);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── REVEALING — no intro bubble, go straight to per-card reveals ─────
  useEffect(() => {
    if (!isFTUE || gameState !== "REVEALING") return;
    if (prevState.current === "REVEALING") return;
    prevState.current = "REVEALING";
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── Per-card reveal bubbles ───────────────────────────────────────────
  useEffect(() => {
    if (!isFTUE || !lastRevealedCardId) return;
    // Booker's reveal is handled by the gauge oscillation + darnit flow — no bubble here
    if (lastRevealedCardId === "ftue-booker") return;

    const node = CARD_BUBBLES[lastRevealedCardId];
    const cardAnchor: BubbleAnchor = { cardId: lastRevealedCardId };
    const cardPos: BubblePosition = CARD_POSITION[lastRevealedCardId] ?? "below";

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
      position: cardPos,
      onDismiss: () => onResumeHeldReveal?.(),
    }, 0);
  }, [lastRevealedCardId, isFTUE]); // eslint-disable-line

  // After gauge oscillation → RESULTS: "Darn it" (gauge) → dismiss → Devin flip hint (Booker card)
  useEffect(() => {
    if (!ftueWinCelebrationActive) return;
    shown.current.delete("darnit");
    shown.current.delete("results_devin");
    const t = setTimeout(() => {
      enqueue({
        key: "darnit",
        node: (
          <span>
            Darn it — we only missed the{" "}
            <strong style={{ color:"#C084FC", border:"1.5px solid #C084FC", padding:"1px 6px", borderRadius:4, fontSize:"0.92em" }}>All‑Star</strong>{" "}
            tier by 2.4 points. If only Love or Klay showed up tonight we would have won an extra 5x.&nbsp;😤
          </span>
        ),
        anchor: { cardId: "ftue-booker" },
        position: "below",
        onDismiss: () => {
          shown.current.delete("results_devin");
          enqueue({
            key: "results_devin",
            node: (
              <span>
                Devin was <Stamp label="Smoking Hot!" {...STAMP_STYLES["SMOKING HOT"]} /> tonight. He really carried your team. Flip his card to see what game he pulled.&nbsp;🔥
              </span>
            ),
            anchor: { cardId: "ftue-booker" },
            position: "below",
            onDismiss: () => onFtueReadyToFlip?.(),
          });
        },
      });
    }, 600);
    return () => clearTimeout(t);
  }, [ftueWinCelebrationActive]); // eslint-disable-line

  // ── After Booker flipped — game log bubble → final centered bubble ───
  useEffect(() => {
    if (!isFTUE || !ftueBookerFlipped) return;
    if (bookerFlipBubbleShown.current) return;
    bookerFlipBubbleShown.current = true;
    onBubbleActive?.(true);
    setTimeout(() => {
      shown.current.delete("booker_gamelogs");
      enqueue({
        key: "booker_gamelogs",
        node: (
          <span>
            Devin pulled the March 17th, 2025 game against TOR — he had himself A GAME. Fantasy points are all computed from real historical games. Be Legendary!&nbsp;🔥
          </span>
        ),
        anchor: { cardId: "ftue-booker" },
        position: "below",
        onDismiss: () => {
          shown.current.delete("final_replay");
          enqueue({
            key: "final_replay",
            node: (
              <span>
                Relive history by pulling all past games of these players. You did good for a newbie — two more wins and we unlock a special reward. Run it back?&nbsp;🏀
              </span>
            ),
            onDismiss: () => { onFtueAllDone?.(); setReplayReady(true); },
            pulse: "deal",
            // no anchor → centered on screen
          });
        },
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

  // ── Add/remove ftue-results-phase body class for chrome dimming ───────
  useEffect(() => {
    if (!isFTUE) return;
    if (gameState === "RESULTS" || gameState === "WIN_CELEBRATION") {
      document.body.classList.add("ftue-results-phase");
    } else {
      document.body.classList.remove("ftue-results-phase");
    }
    return () => document.body.classList.remove("ftue-results-phase");
  }, [gameState, isFTUE]);

  if (!isFTUE) return null;

  // ── Compute pill placement ────────────────────────────────────────────
  const isCardAnchor = current?.anchor != null && typeof current.anchor === "object";
  const activePad = isCardAnchor ? PAD_CARD : PAD_OTHER;

  // When bubble has an anchor, wait for spotlightRect before showing pill
  // This prevents pill rendering at wrong position before spotlight resolves
  const pillReady = current?.key === "darnit" || current?.anchor == null || spotlightRect != null;

  const isDarnit = current?.key === "darnit";

  const pillPlacement: React.CSSProperties =
    current?.pillLayout === "page-center"
      ? {
          top: "50vh",
          left: 16,
          right: 16,
          transform: "translateY(-50%)",
        }
      : current?.pillLayout === "above-spotlight" && spotlightRect
      ? computePillPlacement(spotlightRect, current?.position ?? "above", activePad, 28)
      : current?.pillLayout === "viewport-center"
        ? { top: "38%", left: 16, right: 16 }
        : spotlightRect
          ? computePillPlacement(spotlightRect, current?.position ?? "below", activePad)
          : (current?.anchor == null)
            ? { top: "38%" }
            : { bottom: 110 };

  return (
    <>
      <style>{`
        @keyframes coachBtnPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(127,255,0,0) }
          50%      { box-shadow: 0 0 0 10px rgba(127,255,0,0.4) }
        }
        @keyframes spotlightPulse {
          0%,100% { box-shadow: 0 0 0 9999px rgba(0,0,0,0.92), 0 0 0 0 rgba(255,255,255,0) }
          50%      { box-shadow: 0 0 0 9999px rgba(0,0,0,0.92), 0 0 20px 6px rgba(255,255,255,0.22) }
        }
        @keyframes coachTextIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes labelPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
        [data-ftue-anchor="roster"].ftue-pulse-labels [data-ftue-label="salary"],
        [data-ftue-anchor="roster"].ftue-pulse-labels [data-ftue-label="avg"] {
          animation: labelPulse 1.1s ease-in-out infinite;
        }
        body.ftue-results-phase [data-ftue-chrome] {
          opacity: 0 !important;
          pointer-events: none !important;
          transition: opacity 0.3s ease;
        }
      `}</style>

      {current && (
        <>
          {/* Full-screen tap-to-dismiss overlay — dark when no spotlight, transparent when spotlight handles dim */}
          <div
            key={`overlay-${animKey}`}
            role="button"
            tabIndex={0}
            aria-label="Continue"
            onClick={dismiss}
            onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") dismiss(); }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 999,
              background: spotlightRect ? "transparent" : "rgba(0,0,0,0.92)",
              cursor: "pointer",
            }}
          />

          {/* Spotlight hole — positioned over the target, box-shadow dims everything outside */}
          {spotlightRect && (
            <div
              onClick={dismiss}
              style={{
                position: "fixed",
                top:    spotlightRect.top    - activePad,
                left:   spotlightRect.left   - activePad,
                width:  spotlightRect.width  + activePad * 2,
                height: spotlightRect.height + activePad * 2,
                borderRadius: isCardAnchor ? 18 : 14,
                zIndex: 1001,
                cursor: "pointer",
                pointerEvents: "all",
                animation: "spotlightPulse 2s ease-in-out infinite",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.92)",
                background: "transparent",
              }}
            />
          )}

          {/* Message pill — only render once spotlight is resolved */}
          {pillReady && (isDarnit ? (
            <div
              key={`text-${animKey}`}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1002,
                display: "grid",
                placeItems: "center",
                pointerEvents: "none",
                padding: "0 16px",
                textAlign: "center",
              }}
            >
              <div style={{
                display: "inline-block",
                background: "rgba(10,12,20,0.93)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 16,
                padding: "12px 20px",
                maxWidth: 340,
                color: "#FFFFFF",
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.5,
                fontFamily: "system-ui, -apple-system, sans-serif",
                backdropFilter: "blur(4px)",
              }}>
                {current.node}
              </div>
            </div>
          ) : <div
            key={`text-${animKey}`}
            style={{
              position: "fixed",
              left: 16,
              right: 16,
              zIndex: 1002,
              textAlign: "center",
              pointerEvents: "none",
              animation: current.pillLayout === "page-center" ? "none" : "coachTextIn 0.25s ease-out both",
              ...pillPlacement,
            }}
          >
            <div style={{
              display: "inline-block",
              background: "rgba(10,12,20,0.93)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 16,
              padding: "12px 20px",
              maxWidth: 340,
              color: "#FFFFFF",
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.5,
              fontFamily: "system-ui, -apple-system, sans-serif",
              backdropFilter: "blur(4px)",
            }}>
              {current.node}
            </div>
          </div>)}
        </>
      )}
    </>
  );
}