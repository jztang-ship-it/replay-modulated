import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type GameState = "IDLE" | "DEALING" | "HOLD" | "DRAWING" | "REVEALING" | "RESULTS" | "WIN_CELEBRATION";
export type CoachLesson = "ftue_basics";

export type BubbleAnchor =
  | "deal"
  | "draw"
  | "roster"
  | "roster-and-score"
  | "roster-and-commentary"
  | "score-row"
  | "anchor-and-gauge"
  | "anchor-gauge-balance"
  | "anchor-and-commentary"
  | "booker-and-gauge"       // legacy alias
  | "booker-gauge-balance"   // legacy alias
  | "ftue-darnit-focus"
  | "gauge"
  | "center"
  | { cardId: string };

/** Sport-specific text + card config for FTUE. All fields optional — defaults to basketball. */
export interface FTUETextConfig {
  anchorCardId: string;
  rosterCount: number;
  salaryCap: number;
  sportLabel: string;
  cardPositions: Record<string, "above" | "below">;
  cardTexts: Record<string, string>;
  anchorRevealText: string;
  idleText: ReactNode;
  holdIntroText: string;
  holdAnchorText: ReactNode;
  nearMissText: string;
  anchorFlipHintText: string;
  anchorStatText: string;
  finalText: string;
}

type BubblePosition = "above" | "below" | "auto";

interface Props {
  isFTUE: boolean;
  gameState: GameState;
  lastRevealedCardId?: string | null;
  ftueBookerFlipped?: boolean;
  ftueWinCelebrationActive?: boolean;
  ftueCommentaryDone?: boolean;
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
  /** Routes bubble text into the commentary area instead of a floating pill */
  onCommentaryText?: (parts: React.ReactNode[] | null, sticky?: boolean) => void;
  /** Called by GameView when commentary override is tapped — auto-dismisses current spotlight */
  dismissRef?: React.MutableRefObject<(() => void) | null>;
  lockedCount?: number; revealIndex?: number;
  legendaryCardName?: string; lesson?: CoachLesson;
  /** Sport-specific text/card config for FTUE. Omit for basketball defaults. */
  ftueTextConfig?: FTUETextConfig;
}

// ── Inline chips matching the actual buttons ────────────────────────────────
function DrawChip() {
  return (
    <span style={{
      display: "inline-block", padding: "1px 6px",
      background: "linear-gradient(135deg,#7FFF00,#5BBE00)",
      color: "#070A12", borderRadius: 4, fontWeight: 900, fontSize: 11,
      letterSpacing: ".10em", textTransform: "uppercase",
      verticalAlign: "middle", lineHeight: 1.2,
    }}>DRAW</span>
  );
}
function DealChip() {
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px",
      background: "#3AA0FF",
      color: "#000000", borderRadius: 10, fontWeight: 900, fontSize: 11,
      letterSpacing: ".10em", textTransform: "uppercase",
      verticalAlign: "middle", lineHeight: 1.2,
    }}>DEAL</span>
  );
}
function ReplayChip() {
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px",
      background: "#3AA0FF",
      color: "#FFFFFF", borderRadius: 10, fontWeight: 900, fontSize: 11,
      letterSpacing: ".10em", textTransform: "uppercase",
      verticalAlign: "middle", lineHeight: 1.2,
    }}>REPLAY</span>
  );
}

// Row 1 (slots 0-2): message below card. Row 2 (slots 3-5): message above card.
const DEFAULT_CARD_POSITION: Record<string, BubblePosition> = {
  "ftue-tatum": "below",
  "ftue-curry": "below",
  "ftue-og": "below",
  "ftue-draymond": "above",
  "ftue-lowry": "above",
  "ftue-reddish": "above",
};

const DEFAULT_CARD_TEXTS: Record<string, string> = {
  "ftue-curry": "Chef Curry was cooking something hot. 26 pts, 10 asts and two badges got you 52 FP. 🔥",
  "ftue-og": "OG earned his Pickpocket badge — 3 steals plus 2 blocks. Elite two-way wing doing it on both ends. 39.6 FP on a $46 card. 👀",
  "ftue-draymond": "Yikes! Single digits from a $43 blue card. Draymond is one of the loudest voices in the game, but his stats sure were quiet tonight. 🧊",
  "ftue-lowry": "Kyle Lowry with the Pure badge — 5 assists, zero turnovers. 18.9 FP from a $20 card. Clean and efficient. 🎯",
  "ftue-reddish": "Kevin Love with only 4 pts and 5 boards against Minnesota — 12 FP. That's what the frost means, he definitely didn't help your team. 🧊",
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
  pillLayout?: "anchor" | "viewport-center" | "above-spotlight" | "page-center" | "below-score-row";
  pulseCardLabels?: boolean;
}
type Pulse = "deal" | "draw" | null;

// Padding around spotlight rect — smaller for individual cards so we don't
// bleed into adjacent cards (grid gap is 8px, safe pad is 3px)
const PAD_CARD = 3;
const PAD_OTHER = 10;

/** Full grid stage (all 6 cards) + Team FP / Budget row — outer roster port + score row */
function unionRosterAndScoreRect(): DOMRect | null {
  const rosterEl = document.querySelector('[data-ftue-anchor="roster-inner"]') ?? document.querySelector('[data-ftue-anchor="roster"]');
  const scoreEl = document.querySelector('[data-ftue-anchor="score-row"]');
  if (!rosterEl) return null;
  const r1 = rosterEl.getBoundingClientRect();
  const r2 = scoreEl ? scoreEl.getBoundingClientRect() : r1;
  const top = Math.min(r1.top, r2.top);
  const bottom = Math.max(r1.bottom, r2.bottom);
  const left = Math.min(r1.left, r2.left);
  const right = Math.max(r1.right, r2.right);
  return {
    top, bottom, left, right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Roster grid + commentary area — cards and commentary only, no gauge/score */
function unionRosterAndCommentaryRect(): DOMRect | null {
  const rosterEl = document.querySelector('[data-ftue-anchor="roster-inner"]') ?? document.querySelector('[data-ftue-anchor="roster"]');
  const commentaryEl = document.querySelector('[data-ftue-anchor="commentary"]');
  if (!rosterEl) return null;
  const rects = [rosterEl, commentaryEl].filter(Boolean).map(el => el!.getBoundingClientRect());
  const top = Math.min(...rects.map(r => r.top));
  const bottom = Math.max(...rects.map(r => r.bottom));
  const left = Math.min(...rects.map(r => r.left));
  const right = Math.max(...rects.map(r => r.right));
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

/** Anchor card + TierGauge + score row — for the FTUE RESULTS dual spotlight */
function unionAnchorAndGaugeRect(anchorId: string): DOMRect | null {
  const bookerEl = document.querySelector(`[data-ftue-card="${anchorId}"]`);
  const gaugeEl = document.querySelector('[data-ftue-anchor="tier-gauge"]');
  const scoreEl = document.querySelector('[data-ftue-anchor="score-row"]');
  if (!bookerEl || !gaugeEl) return null;
  const r1 = bookerEl.getBoundingClientRect();
  const r2 = gaugeEl.getBoundingClientRect();
  const r3 = scoreEl ? scoreEl.getBoundingClientRect() : r2;
  const top = Math.min(r1.top, r2.top, r3.top);
  const bottom = Math.max(r1.bottom, r2.bottom, r3.bottom);
  const left = Math.min(r1.left, r2.left, r3.left);
  const right = Math.max(r1.right, r2.right, r3.right);
  return {
    top, bottom, left, right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Anchor + score row + gauge + balance/wage row — full FTUE results spotlight */
function unionAnchorGaugeBalanceRect(anchorId: string): DOMRect | null {
  const bookerEl = document.querySelector(`[data-ftue-card="${anchorId}"]`);
  const gaugeEl = document.querySelector('[data-ftue-anchor="tier-gauge"]');
  const scoreEl = document.querySelector('[data-ftue-anchor="score-row"]');
  const balanceEl = document.querySelector('[data-ftue-anchor="balance-row"]');
  if (!bookerEl || !gaugeEl) return null;
  const rects = [bookerEl, gaugeEl, scoreEl, balanceEl].filter(Boolean).map(el => el!.getBoundingClientRect());
  const top = Math.min(...rects.map(r => r.top));
  const bottom = Math.max(...rects.map(r => r.bottom));
  const left = Math.min(...rects.map(r => r.left));
  const right = Math.max(...rects.map(r => r.right));
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

/** Anchor card + commentary area only — no info row, no gauge bar */
function unionAnchorAndCommentaryRect(anchorId: string): DOMRect | null {
  const cardEl = document.querySelector(`[data-ftue-card="${anchorId}"]`);
  const commentaryEl = document.querySelector('[data-ftue-anchor="commentary"]');
  if (!cardEl) return null;
  const rects = [cardEl, commentaryEl].filter(Boolean).map(el => el!.getBoundingClientRect());
  const top = Math.min(...rects.map(r => r.top));
  const bottom = Math.max(...rects.map(r => r.bottom));
  const left = Math.min(...rects.map(r => r.left));
  const right = Math.max(...rects.map(r => r.right));
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function resolveAnchorElement(anchor: BubbleAnchor | undefined, anchorCardId: string): HTMLElement | null {
  if (!anchor || anchor === "center") return null;
  if (typeof anchor === "object") {
    return document.querySelector(`[data-ftue-card="${anchor.cardId}"]`) as HTMLElement | null;
  }
  if (anchor === "deal") return document.querySelector('[data-ftue-anchor="deal"]') as HTMLElement | null;
  if (anchor === "draw") return document.querySelector('[data-ftue-anchor="draw"]') as HTMLElement | null;
  if (anchor === "roster") return document.querySelector('[data-ftue-anchor="roster"]') as HTMLElement | null;
  if (anchor === "gauge") return document.querySelector('[data-ftue-anchor="tier-gauge"]') as HTMLElement | null;
  if (anchor === "ftue-darnit-focus") {
    return document.querySelector('[data-ftue-anchor="ftue-darnit-focus"]') as HTMLElement | null;
  }
  if (anchor === "score-row") return document.querySelector('[data-ftue-anchor="score-row"]') as HTMLElement | null;
  if (anchor === "roster-and-score") {
    const rect = unionRosterAndScoreRect();
    if (!rect) return null;
    return { getBoundingClientRect: () => rect } as unknown as HTMLElement;
  }
  if (anchor === "booker-and-gauge" || anchor === "anchor-and-gauge") {
    const rect = unionAnchorAndGaugeRect(anchorCardId);
    if (!rect) return null;
    return { getBoundingClientRect: () => rect } as unknown as HTMLElement;
  }
  if (anchor === "booker-gauge-balance" || anchor === "anchor-gauge-balance") {
    const rect = unionAnchorGaugeBalanceRect(anchorCardId);
    if (!rect) return null;
    return { getBoundingClientRect: () => rect } as unknown as HTMLElement;
  }
  return null;
}

export function CoachLayer({
  isFTUE, gameState,
  lastRevealedCardId, ftueBookerFlipped, ftueWinCelebrationActive, ftueCommentaryDone,
  lockedCount,
  onCoachBubbleKey,
  onResumeHeldReveal, onCelebrationReady, onFtueReadyToFlip, onFtueBookerHeld, onFtueAllDone, onBubbleActive, onReplayReady,
  onCommentaryText,
  dismissRef,
  ftueTextConfig: cfg,
}: Props) {
  // Resolve sport-specific text — defaults are basketball
  const anchorCardId = cfg?.anchorCardId ?? "ftue-tatum";
  const CARD_POS = cfg?.cardPositions ?? DEFAULT_CARD_POSITION;
  const CARD_TXT = cfg?.cardTexts ?? DEFAULT_CARD_TEXTS;
  const queue = useRef<QueueEntry[]>([]);
  const shown = useRef<Set<string>>(new Set());
  const [current, setCurrent] = useState<QueueEntry | null>(null);
  const [animKey, setAnimKey] = useState(0);
  const [pulsing, setPulsing] = useState<Pulse>(null);
  const [replayReady, setReplayReady] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevState = useRef<GameState | null>(null);
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
        // DRAW pulse has no timeout — clears when user hits DRAW
        // DEAL pulse also loops indefinitely until user taps DEAL
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

  // Expose dismiss so GameView can auto-dismiss when commentary is tapped
  useEffect(() => {
    if (dismissRef) dismissRef.current = dismiss;
    return () => { if (dismissRef) dismissRef.current = null; };
  }, [dismiss, dismissRef]);

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
      if (snapshot.anchor === "roster-and-commentary") {
        const rect = unionRosterAndCommentaryRect();
        applyRect(rect);
        return;
      }
      if (snapshot.anchor === "booker-and-gauge" || snapshot.anchor === "anchor-and-gauge") {
        const rect = unionAnchorAndGaugeRect(anchorCardId);
        applyRect(rect);
        return;
      }
      if (snapshot.anchor === "booker-gauge-balance" || snapshot.anchor === "anchor-gauge-balance") {
        const rect = unionAnchorGaugeBalanceRect(anchorCardId);
        applyRect(rect);
        return;
      }
      if (snapshot.anchor === "anchor-and-commentary") {
        const rect = unionAnchorAndCommentaryRect(anchorCardId);
        applyRect(rect);
        return;
      }
      const el = resolveAnchorElement(snapshot.anchor, anchorCardId);
      if (!el) {
        retryT = setTimeout(() => {
          if (cancelled) return;
          const el2 = resolveAnchorElement(snapshot.anchor, anchorCardId);
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

  // ── Clear deal pulse when user actually hits DEAL ─────────────────────
  useEffect(() => {
    if (gameState === "DEALING" && pulsing === "deal") {
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
    prevState.current = null; // reset so HOLD/REVEALING gates re-arm for next hand
    queue.current = [];
    shown.current.clear();
    revealIntroShown.current = false;
    bookerFlipBubbleShown.current = false;
    setCurrent(null);
    onBubbleActive?.(false);
    setTimeout(() => {
      onCommentaryText?.([
        cfg?.idleText ?? <span>Real stats. Real history. Your fantasy result instantly. Hit <DealChip /> to get started.</span>
      ], true);
      setPulsing("deal");
    }, 500);
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── HOLD — roster+score overview first, then Booker spotlight ────────
  useEffect(() => {
    if (!isFTUE || gameState !== "HOLD") return;
    if (prevState.current === "HOLD") return; // already ran this hand
    prevState.current = "HOLD";

    // Step 1: roster overview — no spotlight, full screen visible
    onCommentaryText?.([cfg?.holdIntroText ?? "Six players. $250 cap. Fantasy points come from real stats — pts, rbs, asts. Who do we keep?"], true);

    enqueue({
      key: "hold_roster_intro",
      node: null as any,
      anchor: "roster-and-commentary",
      position: "below",
      pulseCardLabels: true,
      onDismiss: () => {
        // Step 2: After tap — spotlight anchor card, anchor text appears.
        onCommentaryText?.([
          cfg?.holdAnchorText ?? <span>Tatum is your $66 anchor and your most dependable player. Tap him to hold, then hit <DrawChip /> and tap each card to see your replacements.</span>
        ], true);
        const holdKey = `hold_${anchorCardId.replace("ftue-", "")}`;
        enqueue({
          key: holdKey,
          node: null as any,
          anchor: { cardId: anchorCardId },
          position: CARD_POS[anchorCardId] ?? "below",
        });
        onCoachBubbleKey?.(holdKey);
      },
    });
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── REVEALING — no intro bubble, go straight to per-card reveals ─────
  useEffect(() => {
    if (!isFTUE || gameState !== "REVEALING") return;
    if (prevState.current === "REVEALING") return;
    prevState.current = "REVEALING";
  }, [gameState, isFTUE]); // eslint-disable-line

  // ── Per-card reveal bubbles → commentary area ────────────────────────
  useEffect(() => {
    if (!isFTUE || !lastRevealedCardId) return;
    if (lastRevealedCardId === anchorCardId) return;

    const text = CARD_TXT[lastRevealedCardId];
    const cardAnchor: BubbleAnchor = { cardId: lastRevealedCardId };
    const cardPos: BubblePosition = CARD_POS[lastRevealedCardId] ?? "below";

    if (!text) {
      setTimeout(() => {
        onBubbleActive?.(false);
        onResumeHeldReveal?.();
      }, 600);
      return;
    }

    // Send text to commentary area. Marked sticky so the text persists until the
    // NEXT card's commentary replaces it (instead of clearing on tap).
    onCommentaryText?.([text], true);

    // Still spotlight the card via a no-text bubble entry
    enqueue({
      key: `card_${lastRevealedCardId}`,
      node: null as any, // spotlight only — text is in commentary
      anchor: cardAnchor,
      position: cardPos,
      onDismiss: () => {
        // Don't clear commentary — let the next card's reveal replace it.
        onResumeHeldReveal?.();
      },
    }, 0);
  }, [lastRevealedCardId, isFTUE]); // eslint-disable-line

  // After tier slam settles → "So close" → tap → Booker flip hint (spotlight booker+gauge)
  useEffect(() => {
    if (!ftueWinCelebrationActive) return;
    if (!ftueCommentaryDone) return;
    // Fire immediately — no artificial delay between tier panel landing and commentary.
    {
      // Show "So close" commentary — spotlight roster + commentary only
      onCommentaryText?.([cfg?.nearMissText ?? "So close it hurts, 1 FP away from the ALL-STAR level 3x win. Dray was the weaklink tonight, one more rebound or assist would have pushed us over."], true);
      enqueue({
        key: "darnit",
        node: null as any,
        anchor: "roster-and-commentary",
        position: "below",
        onDismiss: () => {
          onCommentaryText?.([cfg?.anchorFlipHintText ?? "Tatum on the other hand wore his super man cape, 92 FP(!) is nothing short of extraordinary. Flip his card to see what happened."], true);
          enqueue({
            key: "results_anchor",
            node: null as any,
            anchor: "anchor-and-commentary",
            position: "below",
            onDismiss: () => {
              // Don't clear commentary — let the booker_gamelogs effect replace it
              // when the user actually flips the card.
              onFtueReadyToFlip?.();
            },
          });
        },
      });
    }
  }, [ftueWinCelebrationActive, ftueCommentaryDone]); // eslint-disable-line

  // ── After Booker flipped — spotlight Booker for stat explanation, then light up screen for final text ──
  useEffect(() => {
    if (!isFTUE || !ftueBookerFlipped) return;
    if (bookerFlipBubbleShown.current) return;
    bookerFlipBubbleShown.current = true;
    onBubbleActive?.(true);
    setTimeout(() => {
      // Part 1: Spotlight anchor — explain the stat line + badges
      onCommentaryText?.([
        cfg?.anchorStatText ?? "A 43pt, 15 rb, triple double against Chicago on the 21st of Dec in 2024, what's most important is he unlocked 6 badges for an extra 20 FP bonus. Bonuses = winning.",
      ]);
      enqueue({
        key: "anchor_gamelogs",
        node: null as any,
        anchor: "anchor-and-commentary",
        position: "below",
        onDismiss: () => {
          // Part 2: Screen lights up — no spotlight, final text in commentary
          onBubbleActive?.(false);
          setCurrent(null);
          onFtueAllDone?.();
          onReplayReady?.();
          onCommentaryText?.([
            cfg?.finalText ?? <span>Every game log is drawn from real moments in history—relive the journey of basketball at your fingertips. Hit <ReplayChip /> to begin.</span>,
          ]);
        },
      });
    }, 800);
  }, [ftueBookerFlipped, isFTUE, onBubbleActive]); // eslint-disable-line

  useEffect(() => {
    if (replayReady) onReplayReady?.();
  }, [replayReady]); // eslint-disable-line

  useEffect(() => {
    if (!isFTUE) return;
    if (["DRAWING", "DEALING", "WIN_CELEBRATION"].includes(gameState)) {
      prevState.current = gameState as GameState;
      // Auto-dismiss any active bubble during transitions (removes blank screen after Deal)
      setCurrent(null);
      onBubbleActive?.(false);
    }
  }, [gameState, isFTUE]); // eslint-disable-line

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

  // ── Spotlight padding ─────────────────────────────────────────────────
  const isCardAnchor = current?.anchor != null && typeof current.anchor === "object";
  const activePad = isCardAnchor ? PAD_CARD : PAD_OTHER;

  return (
    <>
      <style>{`
        @keyframes coachBtnPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(58,160,255,0) }
          50%      { box-shadow: 0 0 0 10px rgba(58,160,255,0.4) }
        }
        @keyframes spotlightPulse {
          0%,100% { box-shadow: 0 0 0 9999px rgba(0,0,0,1), 0 0 0 0 rgba(255,255,255,0) }
          50%      { box-shadow: 0 0 0 9999px rgba(0,0,0,1), 0 0 20px 6px rgba(255,255,255,0.22) }
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
              background: spotlightRect ? "transparent" : "rgba(0,0,0,1)",
              cursor: "pointer",
            }}
          />

          {/* Spotlight hole — positioned over the target, box-shadow dims everything outside */}
          {spotlightRect && (
            <div
              onClick={dismiss}
              style={{
                position: "fixed",
                top: spotlightRect.top - activePad,
                left: spotlightRect.left - activePad,
                width: spotlightRect.width + activePad * 2,
                height: spotlightRect.height + activePad * 2,
                borderRadius: isCardAnchor ? 18 : 14,
                zIndex: 1001,
                cursor: "pointer",
                pointerEvents: "all",
                animation: "spotlightPulse 2s ease-in-out infinite",
                boxShadow: "0 0 0 9999px rgba(0,0,0,1)",
                background: "transparent",
              }}
            />
          )}
          {/* All text routes to TierGauge commentary via onCommentaryText — no pill rendered here */}
        </>
      )}
    </>
  );
}