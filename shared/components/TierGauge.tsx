/**
 * TierGauge.tsx — Slot-machine feel for tier progress.
 *
 * BAR MATH: progress within current tier only.
 *   fill = (totalFp - tierMin) / (nextTierMin - tierMin)
 *   Each tier shows as a full 0→100% gauge. BUST spans 0→155.
 *
 * SPRING SYSTEM — 5 cases:
 *
 *   1. SKIP (all cards at once):
 *      Duration ∝ totalFp. Ease-out to final, then:
 *      - Near-miss (≤8 FP): spring overshoots into next-tier color, snaps back.
 *      - High tier (MVP): mild spring to emphasise achievement.
 *      - LEGEND: smooth fill + ding pulse.
 *
 *   2. TIER CROSSING (this card moved into a new tier):
 *      Brief spring to show the crossing — bar dips back then settles.
 *      Duration 600ms.
 *
 *   3. NEAR-MISS (final result, ≤8 FP from next tier):
 *      Only fires when winTier is set (post-reveal).
 *      Overshoot ∝ closeness: gap=1 FP → 11% overshoot, gap=8 → 0%.
 *      Spring zeta=0.30, feels like a rubber band snapping.
 *
 *   4. BIG SINGLE CARD (delta > 35 FP — e.g. Zion 44.7):
 *      Ease-out 500ms. If near-miss applies after this card, spring fires.
 *
 *   5. NORMAL SINGLE CARD (delta ≤ 35 FP):
 *      Ease-out, 250–400ms proportional to delta. No spring. Smooth.
 *
 * NEVER resets to 0 mid-hand. Animates from prevFill always.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Line, LinePart, StampToken } from "@shared/commentary/chadChallenge";

export type GaugeTier = "LEGEND" | "MVP" | "ALL_STAR" | "STARTER" | "ROOKIE" | "BUST" | "NONE";
export interface TierThreshold { tier: GaugeTier; minFP: number; }

interface TierGaugeProps {
  totalFp: number;
  thresholds: TierThreshold[];
  visible: boolean;
  winTier?: string;
  /** FP of the most recently revealed card — used to detect big single-card jumps */
  lastCardFp?: number;
  /** True when user pressed SKIP — triggers full spring sequence */
  isSkip?: boolean;
  /** FTUE: when true, suppress normal bar animation — gauge stays hidden until oscillation fires */
  ftueSuppressNormal?: boolean;
  /** FTUE: when true, run the scripted overshoot-to-All-Star animation */
  ftueOscillate?: boolean;
  /** Called when the FTUE oscillation animation completes */
  onFtueOscillateComplete?: () => void;
  /** FTUE: after scripted oscillation, lock bar — no near-miss / skip animations until next hand */
  ftueLockStaticBar?: boolean;
  /** Regular game: trigger one-shot spring when final anchor card has finished counting */
  regularFinalCardKick?: boolean;
  /** True when the anchor (last) card's FP is being added — triggers dramatic deceleration */
  isAnchorReveal?: boolean;
  /** Called when the animated gauge bar crosses a tier boundary — used for tier name flip */
  onTierCross?: (tier: string) => void;
  /** Smart post-reveal copy — replaces gap callout after results settle.
   *  `primary` may be a plain string (legacy/baseline path) or a Line
   *  (parts array: strings + inline StampToken chips) when a TOP-slot
   *  trigger framing fires (bucket 2 S1 slot-split). The renderer below
   *  walks parts when given a Line. */
  postRevealCopy?: { primary: string | Line; secondary?: string } | null;
  /** Tier label for inline StampToken renders of stamp="miss". Sourced
   *  by GameView from challengeTrigger.nearMissNextTier. Mirrors
   *  TeamStamp's missTier prop — same source-of-truth pattern for both
   *  panel and inline stamps (bucket 2 model-(b) tier substitution).
   *  When absent on a miss-stamp render, the chip falls back to bare
   *  "MISS" with no tier prefix.
   *
   *  Note on stamp="big_score": the renderer uses winTier (this
   *  component's existing prop) for the tier prefix. Today GameView
   *  passes winTier={undefined} to this component, so big_score chips
   *  render as bare "BIG SCORE" without prefix. That's acceptable for
   *  placeholder copy; a real-copy session that wants tier-prefixed
   *  big_score chips will need to thread the resolved hand winTier in
   *  through a separate prop (existing winTier carries animation
   *  semantics — best not to repurpose it). */
  missTier?: string;
  /** FTUE: use typewriter reveal for commentary text */
  ftueTypewriter?: boolean;
  /** When true, the last commentary override part stays visible (no dismiss, no "TAP TO CONTINUE") */
  stickyLastOverride?: boolean;
  /** FTUE: called when typewriter commentary finishes */
  onCommentaryDone?: () => void;
  /** Override commentary with multi-part bubble content — tap advances to next part */
  commentaryOverride?: { parts: ReactNode[]; sticky?: boolean } | null;
  /** Called when user taps through all parts of commentaryOverride */
  onCommentaryOverrideDone?: () => void;
  /** When true, hide the gauge bar (but keep commentary visible) */
  hideBar?: boolean;
  /** Slot rendered between the gauge bar and commentary area */
  belowBarSlot?: ReactNode;
}

const TIER_CFG: Record<string, { label: string; color: string; glow: string }> = {
  LEGEND: { label: "LEGEND", color: "#EF4444", glow: "#EF444455" },
  MVP: { label: "MVP", color: "#FB923C", glow: "#FB923C55" },
  ALL_STAR: { label: "ALL-STAR", color: "#C084FC", glow: "#C084FC55" },
  STARTER: { label: "STARTER", color: "#3B82F6", glow: "#3B82F655" },
  ROOKIE: { label: "ROOKIE", color: "#22C55E", glow: "#22C55E55" },
  BUST: { label: "BUST", color: "#6B7280", glow: "#6B728033" },
};

const FF = "'Rajdhani', 'Oswald', 'Arial Narrow', sans-serif";
const NEAR_MISS_PTS = 8;
const MAX_FP = 235;   // LEGEND threshold, used for duration scaling
const BIG_CARD_FP = 35;    // single card FP above this = "big card"

/** FTUE anchor hand: drawn cards only (see ftueRoster.ts) — bar starts here before scripted gauge */
const FTUE_FIVE_CARDS_FP = 105;
const FTUE_FINAL_FP = 189.4;
/** Imagined peak FP for the “past Starter into All-Star” hero beat (All-Star line = 195) */
const FTUE_IMAGINE_PEAK_FP = 198;

// Underdamped spring: starts at 0, settles at 1. Never negative.
function spring(t: number, zeta: number, wn: number): number {
  if (t <= 0) return 0;
  const wd = wn * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  const d = Math.exp(-zeta * wn * t);
  if (wd < 0.001) return 1 - d * (1 + zeta * wn * t);
  return 1 - d * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, t), 3);
}

/** Sorted gauge stops (excludes LEGEND as a bar segment — it's the overflow tier). */
function sortedGaugeThresholds(thresholds: TierThreshold[]) {
  return [...thresholds]
    .filter(t => (t.tier as string) !== "LEGEND")
    .sort((a, b) => a.minFP - b.minFP);
}

export function computeGaugeState(
  fp: number,
  thresholds: TierThreshold[],
  winTierProp: string | null | undefined,
  nearMissPts: number,
) {
  const sorted = sortedGaugeThresholds(thresholds);
  let derivedTier = "BUST";
  let nextTier: string | null = sorted[0]?.tier ?? null;
  let curMin = 0;
  let nextMin = sorted[0]?.minFP ?? 155;

  for (let i = 0; i < sorted.length; i++) {
    if (fp >= sorted[i].minFP) {
      derivedTier = sorted[i].tier;
      curMin = sorted[i].minFP;
      nextTier = sorted[i + 1]?.tier ?? null;
      nextMin = sorted[i + 1]?.minFP ?? 9999;
    }
  }

  const legendMin = thresholds.find(t => (t.tier as string) === "LEGEND")?.minFP ?? 235;
  const isLegend = fp >= legendMin;

  if (derivedTier === "MVP" && nextTier === null) {
    nextTier = "LEGEND";
    nextMin = legendMin;
  }

  const actualTier = winTierProp ?? (isLegend ? "LEGEND" : derivedTier);
  const isMaxLevel = isLegend || actualTier === "LEGEND";

  const tierCfg = TIER_CFG[actualTier] ?? TIER_CFG.BUST;
  const targetCfg = isMaxLevel ? TIER_CFG.LEGEND : (TIER_CFG[nextTier ?? ""] ?? tierCfg);

  const gap = isMaxLevel ? 0 : Math.max(0, nextMin - fp);
  const isNearMiss = !isMaxLevel && winTierProp != null && gap > 0 && gap <= nearMissPts;

  const tierSpan = Math.max(1, nextMin - curMin);
  const finalFill = isMaxLevel ? 1.0 : Math.min(1, Math.max(0, (fp - curMin) / tierSpan));

  // Gradient: even fade from current tier color → next tier color across the bar
  const normalColor = isLegend
    ? TIER_CFG.LEGEND.color
    : `linear-gradient(90deg, ${tierCfg.color} 0%, ${tierCfg.color} 30%, ${targetCfg.color} 100%)`;
  const overshootColor = `linear-gradient(90deg, ${tierCfg.color} 0%, ${targetCfg.color} 60%, ${targetCfg.color} 100%)`;

  return {
    derivedTier,
    nextTier,
    curMin,
    nextMin,
    legendMin,
    isLegend,
    actualTier,
    isMaxLevel,
    tierCfg,
    targetCfg,
    gap,
    isNearMiss,
    tierSpan,
    finalFill,
    normalColor,
    overshootColor,
  };
}

/** Count tier minFP boundaries strictly crossed when FP rises from → to. */
function countTierBoundaryCrossings(fromFp: number, toFp: number, thresholds: TierThreshold[]): number {
  if (toFp <= fromFp + 0.001) return 0;
  const sorted = sortedGaugeThresholds(thresholds);
  const mins = sorted.map(t => t.minFP).filter(m => m > 0);
  let n = 0;
  for (const m of mins) {
    if (fromFp < m && m <= toFp + 0.001) n++;
  }
  const legendMin = thresholds.find(t => (t.tier as string) === "LEGEND")?.minFP;
  if (legendMin && fromFp < legendMin && toFp >= legendMin) n++;
  return n;
}

const TIER_ROLL_PAUSE_MS = 350;

/** Dramatic easing: fast start (70% of distance in first 50%), then decelerating crawl.
 *  "Can I reach the next tier?" — roulette ball losing momentum. */
function dramaticEase(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  if (u < 0.5) {
    const s = u / 0.5;
    return 0.7 * (1 - Math.pow(1 - s, 2));  // fast ease-out — covers 70% in first half
  }
  const s = (u - 0.5) / 0.5;
  return 0.7 + 0.3 * (s * s);               // slow ease-in — crawls through last 30%
}

/** FP waypoints for roll-up: start, each tier min strictly between from→to, end (LEGEND line included). */
function buildFpWaypoints(fromFp: number, toFp: number, thresholds: TierThreshold[]): number[] {
  if (toFp <= fromFp + 0.001) return [fromFp, toFp];
  const w: number[] = [fromFp];
  const sorted = sortedGaugeThresholds(thresholds);
  for (const t of sorted) {
    const m = t.minFP;
    if (m > fromFp + 0.001 && m < toFp - 0.001) w.push(m);
  }
  const legendMin = thresholds.find(tt => (tt.tier as string) === "LEGEND")?.minFP;
  if (legendMin != null && legendMin > fromFp + 0.001 && legendMin < toFp - 0.001) {
    if (!w.some(x => Math.abs(x - legendMin) < 0.01)) w.push(legendMin);
  }
  w.sort((a, b) => a - b);
  if (Math.abs(w[w.length - 1] - toFp) > 0.01) w.push(toFp);
  return w;
}

function totalTierPacedRollMs(waypoints: number[], motionMs: number, pauseMs: number): number {
  if (waypoints.length < 2) return 0;
  return motionMs + Math.max(0, waypoints.length - 2) * pauseMs;
}

/** Elapsed time → FP: dramatic ease per segment + spring overshoot at tier boundaries. */
function fpAtDramaticRoll(elapsedMs: number, waypoints: number[], motionMs: number, pauseMs: number): number {
  if (waypoints.length < 2) return waypoints[0] ?? 0;
  const nSeg = waypoints.length - 1;
  const totalDelta = waypoints[nSeg] - waypoints[0];
  const segDeltas = waypoints.slice(1).map((v, i) => v - waypoints[i]);
  const segMotion = segDeltas.map(df =>
    totalDelta > 0.001 ? (df / totalDelta) * motionMs : motionMs / Math.max(1, nSeg),
  );

  let acc = 0;
  for (let i = 0; i < nSeg; i++) {
    const dur = segMotion[i];
    if (elapsedMs < acc + dur) {
      const u = dur > 0.001 ? (elapsedMs - acc) / dur : 1;
      const eased = dramaticEase(Math.min(1, Math.max(0, u)));
      return waypoints[i] + eased * segDeltas[i];
    }
    acc += dur;
    if (i < nSeg - 1) {
      // At tier boundary — spring overshoot during pause
      if (elapsedMs < acc + pauseMs) {
        const pt = (elapsedMs - acc) / pauseMs;
        const overshoot = 3.5 * Math.exp(-4.5 * pt) * Math.sin(pt * Math.PI * 2.2);
        return waypoints[i + 1] + overshoot;
      }
      acc += pauseMs;
    }
  }
  return waypoints[nSeg];
}

const STYLE_ID = "tg-v5";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    @keyframes tgDing {
      0%,100%{transform:scaleX(1)} 15%{transform:scaleX(1.06)}
      35%{transform:scaleX(0.95)} 55%{transform:scaleX(1.03)} 80%{transform:scaleX(0.99)}
    }
    @keyframes tgGlow {
      0%,100%{box-shadow:0 0 8px #EF444455} 50%{box-shadow:0 0 32px #EF4444cc}
    }
    @keyframes tgTextReveal {
      from { clip-path: inset(0 100% 0 0); opacity: 0.4; }
      to   { clip-path: inset(0 0% 0 0);   opacity: 1;   }
    }
  `;
  document.head.appendChild(st);
}

function Typewriter({ text, style, onDone, msPerChar = 25, rush = false, start = true, inline = false }: {
  text: string; style: React.CSSProperties; onDone?: () => void; msPerChar?: number; rush?: boolean;
  /** When false, the typewriter pauses at charCount=0 until flipped true.
   *  Used to chain a secondary line behind the primary so they don't both
   *  type out simultaneously. */
  start?: boolean;
  /** Render as <span> instead of <div>. Used by the parts-walker so
   *  string segments and inline stamp chips share one wrapping row. */
  inline?: boolean;
}) {
  const [charCount, setCharCount] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (!start) return;
    if (charCount >= text.length) {
      if (!doneRef.current) { doneRef.current = true; onDone?.(); }
      return;
    }
    // Rush: reveal 4 chars per tick at 1ms intervals
    const delay = rush ? 1 : msPerChar;
    const step = rush ? 4 : 1;
    const t = setTimeout(() => setCharCount(c => Math.min(c + step, text.length)), delay);
    return () => clearTimeout(t);
  }, [charCount, text.length, msPerChar, rush, onDone, start]);
  useEffect(() => { setCharCount(0); doneRef.current = false; }, [text]);
  // <div> (block) so primary + secondary always stack top-to-bottom regardless
  // of parent layout. <span> (inline) was sometimes letting a short secondary
  // line wrap onto the primary's last row. `inline` mode opts into <span>
  // for the parts-walker, where multiple segments share one row.
  if (inline) return <span style={style}>{text.slice(0, charCount)}</span>;
  return <div style={style}>{text.slice(0, charCount)}</div>;
}

// ── Inline trigger stamps (bucket 2 — S1 slot-split restoration) ─────────
//
// Visual idiom adapted from FTUE DEAL/DRAW chips in CoachLayer.tsx
// (inline-block, fontWeight 900, fontSize 11, letterSpacing .10em,
// uppercase, lineHeight 1.2, vertical-align middle). Per-trigger color
// palette mirrors the win-tier panel TeamStamp so inline + panel stamps
// read as one visual family. Slant / thud animation are panel-only; the
// inline form is flat by spec.

const INLINE_STAMP_STYLE_ID = "tg-inline-stamp-styles-v1";
if (typeof document !== "undefined" && !document.getElementById(INLINE_STAMP_STYLE_ID)) {
  const st = document.createElement("style");
  st.id = INLINE_STAMP_STYLE_ID;
  st.textContent = `
    .tg-inline-stamp {
      display: inline-block; vertical-align: middle;
      padding: 1px 6px; border-radius: 4px;
      font-weight: 900; font-size: 11px; letter-spacing: .10em;
      text-transform: uppercase; line-height: 1.2;
      white-space: nowrap;
      font-family: 'Rajdhani','Oswald','Arial Narrow',sans-serif;
      margin: 0 2px;
      animation: tgInlineStampPop 220ms cubic-bezier(0.22, 1.4, 0.36, 1) both;
    }
    .tg-inline-stamp-bad-beat {
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 60%, #7f1d1d 100%);
      color: #fff5f5;
    }
    .tg-inline-stamp-miss {
      background: linear-gradient(135deg, #fde68a 0%, #f59e0b 55%, #b45309 100%);
      color: #3a2000;
    }
    .tg-inline-stamp-big-score {
      background: #3AA0FF;
      color: #000;
    }
    .tg-inline-stamp-rare-pull {
      background: linear-gradient(135deg, #7FFF00 0%, #5BBE00 100%);
      color: #070A12;
    }
    @keyframes tgInlineStampPop {
      0%   { transform: scale(0.4); opacity: 0; }
      60%  { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(1);    opacity: 1; }
    }
  `;
  document.head.appendChild(st);
}

const INLINE_STAMP_KIND_CLASS: Record<StampToken["stamp"], string> = {
  bad_beat:  "tg-inline-stamp-bad-beat",
  miss:      "tg-inline-stamp-miss",
  big_score: "tg-inline-stamp-big-score",
  rare_pull: "tg-inline-stamp-rare-pull",
};

const INLINE_STAMP_BASE_LABEL: Record<StampToken["stamp"], string> = {
  bad_beat:  "BAD BEAT",
  miss:      "MISS",
  big_score: "BIG SCORE",
  rare_pull: "RARE PULL",
};

function formatTier(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/_/g, " ").trim().toUpperCase();
}

/** Resolve the visible label for a StampToken from runtime context
 *  (model-(b) tier substitution — see StampToken type def in
 *  chadChallenge.ts). The token itself carries no tier; this function
 *  looks up the tier from winTier (big_score) or missTier (miss) and
 *  formats the label accordingly. Token's `tier` field is an escape
 *  hatch — when set, it overrides the context lookup. */
function stampLabel(token: StampToken, winTier: string | undefined, missTier: string | undefined): string {
  const explicit = token.tier ? formatTier(token.tier) : "";
  if (token.stamp === "miss") {
    const prefix = explicit || formatTier(missTier);
    return prefix ? `${prefix} MISS` : "MISS";
  }
  if (token.stamp === "big_score") {
    const prefix = explicit || formatTier(winTier);
    return prefix ? `${prefix} BIG SCORE` : "BIG SCORE";
  }
  return INLINE_STAMP_BASE_LABEL[token.stamp];
}

function InlineStampChip({ token, winTier, missTier }: {
  token: StampToken; winTier?: string; missTier?: string;
}) {
  return (
    <span className={`tg-inline-stamp ${INLINE_STAMP_KIND_CLASS[token.stamp]}`}>
      {stampLabel(token, winTier, missTier)}
    </span>
  );
}

/** Render a Line (parts array) as one inline-wrapping row. String parts
 *  flow through Typewriter (inline=true) and chain via revealedIdx;
 *  StampToken parts pop in as inline chips as soon as the preceding
 *  string finishes (or immediately if they lead the line). Fires onDone
 *  once the last part is revealed. Click-to-rush is handled by the
 *  parent wrapper toggling `rush`. */
function PartsLine({ parts, rush, winTier, missTier, style, onDone }: {
  parts: Line;
  rush: boolean;
  winTier?: string;
  missTier?: string;
  style: React.CSSProperties;
  onDone?: () => void;
}) {
  const [revealedIdx, setRevealedIdx] = useState(0);

  // Auto-advance past stamp tokens — they pop instantly, no typing wait.
  useEffect(() => {
    if (revealedIdx >= parts.length) return;
    const part = parts[revealedIdx];
    if (typeof part !== "string") {
      setRevealedIdx(i => i + 1);
    }
  }, [revealedIdx, parts]);

  // Rush: snap everything visible.
  useEffect(() => {
    if (rush && revealedIdx < parts.length) setRevealedIdx(parts.length);
  }, [rush, parts.length, revealedIdx]);

  // Fire onDone once when the line is fully revealed.
  const doneRef = useRef(false);
  useEffect(() => {
    if (revealedIdx >= parts.length && !doneRef.current) {
      doneRef.current = true;
      onDone?.();
    }
  }, [revealedIdx, parts.length, onDone]);

  // Reset on parts identity change (new hand → new bank pick).
  useEffect(() => { setRevealedIdx(0); doneRef.current = false; }, [parts]);

  return (
    <div style={style}>
      {parts.map((part: LinePart, i: number) => {
        const fullyVisible = i < revealedIdx;
        const isActiveString = i === revealedIdx && typeof part === "string";
        if (typeof part === "string") {
          if (fullyVisible) return <span key={i}>{part}</span>;
          if (isActiveString) {
            return (
              <Typewriter
                key={i}
                inline
                text={part}
                rush={rush}
                style={{ display: "inline" }}
                msPerChar={18}
                onDone={() => setRevealedIdx(idx => Math.max(idx, i + 1))}
              />
            );
          }
          return null; // hidden — not yet reached
        }
        // stamp token
        if (fullyVisible) {
          return <InlineStampChip key={i} token={part} winTier={winTier} missTier={missTier} />;
        }
        return null;
      })}
    </div>
  );
}

export function TierGauge({
  totalFp, thresholds, visible,
  winTier: winTierProp,
  lastCardFp = 0,
  isSkip = false,
  ftueSuppressNormal = false,
  ftueOscillate = false,
  onFtueOscillateComplete,
  ftueLockStaticBar = false,
  regularFinalCardKick = false,
  isAnchorReveal = false,
  onTierCross,
  postRevealCopy,
  missTier,
  ftueTypewriter = false,
  stickyLastOverride = false,
  onCommentaryDone,
  commentaryOverride = null,
  onCommentaryOverrideDone,
  hideBar = false,
  belowBarSlot,
}: TierGaugeProps) {
  const [barFill, setBarFill] = useState(0);
  const [barColor, setBarColor] = useState("transparent");
  const [ftueOscGlow, setFtueOscGlow] = useState<string | null>(null);
  const [isDinging, setIsDinging] = useState(false);
  // Commentary override state — multi-part tap-to-advance
  const [overridePart, setOverridePart] = useState(0);
  const [overrideTyping, setOverrideTyping] = useState(false);
  // postRevealCopy: secondary line waits until primary finishes typing.
  const [primaryDone, setPrimaryDone] = useState(false);
  useEffect(() => { setPrimaryDone(false); }, [postRevealCopy?.primary]);
  // Tap-to-rush: speeds up typewriter reveal on any commentary
  const [commentaryRushed, setCommentaryRushed] = useState(false);
  const rafRef = useRef<number>(0);
  const delayRef = useRef<number>(0);
  const animatedFpRef = useRef<number>(0);
  const animTierRef = useRef<string>("BUST");
  const onTierCrossRef = useRef(onTierCross);
  onTierCrossRef.current = onTierCross;
  const prevFillRef = useRef<number>(0);
  const prevTierRef = useRef<string>("BUST");
  /** Last totalFp we fully animated to — prevents duplicate roll-up on re-renders */
  const lastAnimatedTotalFpRef = useRef<number | null>(null);
  const nearMissSpringFiredRef = useRef(false);
  const hasLockedRef = useRef(false);
  const animRunningRef = useRef(false); // true while a spring/ease RAF loop is in-flight
  const ftueOscCompleteFiredRef = useRef(false);
  const onFtueOscillateCompleteRef = useRef(onFtueOscillateComplete);
  onFtueOscillateCompleteRef.current = onFtueOscillateComplete;

  const snap = computeGaugeState(totalFp, thresholds, winTierProp ?? null, NEAR_MISS_PTS);
  const {
    derivedTier,
    nextTier,
    curMin,
    nextMin,
    isLegend,
    actualTier,
    isMaxLevel,
    tierCfg,
    targetCfg,
    gap,
    isNearMiss,
    tierSpan,
    finalFill,
    normalColor,
    overshootColor,
  } = snap;

  const nmOvershoot = isNearMiss ? 0.11 * (1 - gap / NEAR_MISS_PTS) : 0;
  const nmTarget = Math.min(1.12, 1.0 + nmOvershoot);

  // ── FTUE oscillation — runs once when ftueOscillate becomes true ─────
  // Ease FP to 198 (3 FP into All-Star vs floor 195): bar shows a *small* All-Star segment
  // (proportional within the All-Star→MVP band), then springs down to 192.6 Starter and settles.
  useEffect(() => {
    if (!ftueOscillate || !visible) return;
    cancelAnimationFrame(rafRef.current);
    ftueOscCompleteFiredRef.current = false;

    // Must match basketball FTUE TierGauge thresholds (GameView)
    const rookieMin = 155;
    const starterMin = 175;
    const allStarMin = 195;
    const mvpMin = 215;
    const starterSpan = Math.max(1, allStarMin - starterMin);
    const allStarSpan = Math.max(1, mvpMin - allStarMin);

    /** Map animated FP to bar fill + colors — same tier-band math as live gauge */
    function fpToOscVisual(fp: number): { fill: number; color: string; glow: string } {
      if (fp < rookieMin) {
        const fill = Math.min(1, Math.max(0, fp / rookieMin));
        return {
          fill,
          color: `linear-gradient(90deg, ${TIER_CFG.BUST.color}88, ${TIER_CFG.ROOKIE.color})`,
          glow: TIER_CFG.ROOKIE.glow,
        };
      }
      if (fp < starterMin) {
        const fill = Math.min(1, Math.max(0, (fp - rookieMin) / (starterMin - rookieMin)));
        return {
          fill,
          color: `linear-gradient(90deg, ${TIER_CFG.ROOKIE.color}88, ${TIER_CFG.STARTER.color})`,
          glow: TIER_CFG.STARTER.glow,
        };
      }
      if (fp < allStarMin) {
        const fill = Math.min(1, Math.max(0, (fp - starterMin) / starterSpan));
        return {
          fill,
          color: `linear-gradient(90deg, ${TIER_CFG.STARTER.color}88, ${TIER_CFG.ALL_STAR.color})`,
          glow: TIER_CFG.STARTER.glow,
        };
      }
      // All-Star band: narrow left segment (e.g. 198 → 3/20 across All-Star→MVP)
      const fill = Math.min(1, Math.max(0, (fp - allStarMin) / allStarSpan));
      return {
        fill,
        color: `linear-gradient(90deg, ${TIER_CFG.ALL_STAR.color}88, ${TIER_CFG.MVP.color}88)`,
        glow: TIER_CFG.ALL_STAR.glow,
      };
    }

    const startFp = FTUE_FIVE_CARDS_FP;
    const peakFp = FTUE_IMAGINE_PEAK_FP;
    const realFp = FTUE_FINAL_FP;
    const realFill = Math.min(1, Math.max(0, (realFp - starterMin) / starterSpan));

    // Slower than normal play — FTUE “slot machine” near-miss read (linger on tier crossing + wobble)
    const PHASE1_MS = 1650;
    const PHASE2_MS = 5200;
    const ENVELOPE_DECAY = 1.55;
    const OMEGA = 2 * Math.PI * 0.62;

    const v0 = fpToOscVisual(startFp);
    prevFillRef.current = v0.fill;
    setBarFill(v0.fill);
    setBarColor(v0.color);
    setFtueOscGlow(v0.glow);

    const t0 = performance.now();

    function finish() {
      setBarFill(realFill);
      setBarColor(
        `linear-gradient(90deg, ${TIER_CFG.STARTER.color}88, ${TIER_CFG.ALL_STAR.color})`,
      );
      setFtueOscGlow(null);
      prevFillRef.current = realFill;
      lastAnimatedTotalFpRef.current = realFp;
      if (!ftueOscCompleteFiredRef.current) {
        ftueOscCompleteFiredRef.current = true;
        onFtueOscillateCompleteRef.current?.();
      }
    }

    function tick(now: number) {
      const elapsed = now - t0;

      if (elapsed < PHASE1_MS) {
        const u = elapsed / PHASE1_MS;
        const fp = startFp + (peakFp - startFp) * easeOut(u);
        const v = fpToOscVisual(fp);
        setBarFill(v.fill);
        setBarColor(v.color);
        setFtueOscGlow(v.glow);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const t2 = elapsed - PHASE1_MS;
      const tSec = t2 / 1000;
      const env = Math.exp(-ENVELOPE_DECAY * tSec);
      const fp = realFp + (peakFp - realFp) * env * Math.cos(OMEGA * tSec);
      const v = fpToOscVisual(fp);
      setBarFill(v.fill);
      setBarColor(v.color);
      setFtueOscGlow(v.glow);

      const settled = env < 0.022 && Math.abs(fp - realFp) < 0.35;
      if (t2 >= PHASE2_MS || settled) {
        finish();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      setFtueOscGlow(null);
    };
  }, [ftueOscillate, visible]);

  useEffect(() => {
    // Never interfere with the FTUE oscillation
    if (ftueOscillate) return;
    // FTUE: scripted oscillation already ran — hold bar steady (skip near-miss spring, etc.)
    if (ftueLockStaticBar) {
      cancelAnimationFrame(rafRef.current);
      prevFillRef.current = finalFill;
      prevTierRef.current = derivedTier;
      lastAnimatedTotalFpRef.current = totalFp;
      setBarFill(finalFill);
      setBarColor(normalColor);
      setFtueOscGlow(null);
      return;
    }
    if (ftueSuppressNormal) { cancelAnimationFrame(rafRef.current); setBarFill(0); setBarColor("transparent"); return; }
    if (!visible) {
      cancelAnimationFrame(rafRef.current);
      prevFillRef.current = 0;
      prevTierRef.current = "BUST";
      lastAnimatedTotalFpRef.current = null;
      setBarFill(0);
      setBarColor("transparent");
      return;
    }
    if (totalFp <= 0) {
      prevFillRef.current = 0;
      prevTierRef.current = "BUST";
      lastAnimatedTotalFpRef.current = null;
      hasLockedRef.current = false;
      animRunningRef.current = false;
      nearMissSpringFiredRef.current = false;
      setBarFill(0);
      setBarColor("transparent");
      return;
    }

    // Once locked after spring settles, bar never moves again
    if (hasLockedRef.current) return;

    // Already at this totalFp — skip unconditionally
    if (lastAnimatedTotalFpRef.current !== null && Math.abs(totalFp - lastAnimatedTotalFpRef.current) < 0.05) {
      return;
    }

    cancelAnimationFrame(rafRef.current);
    clearTimeout(delayRef.current);

    // ── Direct-set: TierGauge is a passive follower ──────────────────────
    // GameView's springFp drives gaugeTotalFp frame-by-frame.
    // TierGauge just maps FP→fill and sets the bar immediately.
    // Only isSkip gets its own animation. isLegend ding only fires when winTierProp is set
    // (post-spring). During reveal/spring, always direct-set — the spring drives totalFp.
    const hasActiveAnimation = (isLegend && winTierProp != null) || isSkip;
    if (!hasActiveAnimation) {
      const snap = computeGaugeState(totalFp, thresholds, winTierProp ?? null, NEAR_MISS_PTS);
      prevFillRef.current = snap.finalFill;
      prevTierRef.current = snap.derivedTier;
      animatedFpRef.current = totalFp;
      lastAnimatedTotalFpRef.current = totalFp;
      setBarFill(snap.finalFill);
      setBarColor(snap.normalColor);
      if (snap.derivedTier !== animTierRef.current) {
        animTierRef.current = snap.derivedTier;
        onTierCrossRef.current?.(snap.derivedTier);
      }
      return;
    }

    // Always animate from last bar end
    const startFill = prevFillRef.current;
    const delta = finalFill - startFill;

    // ── Determine animation mode (only legend/skip reach here) ────────────
    type AnimMode = "legend" | "skip_spring" | "ease";
    let mode: AnimMode = "ease";
    let duration = 300;

    if (isLegend) {
      mode = "legend";
      duration = 900;
    } else if (isSkip) {
      duration = Math.max(500, Math.round(totalFp / MAX_FP * 1400));
      mode = (actualTier === "MVP" || actualTier === "ALL_STAR") ? "skip_spring" : "ease";
    } else {
      mode = "ease";
      duration = 300;
    }

    // ── Spring params by mode ─────────────────────────────────────────────
    const springCfg: Record<string, { zeta: number; wn: number }> = {
      skip_spring: { zeta: 0.45, wn: 8 },
      legend: { zeta: 1.00, wn: 5 },
      ease: { zeta: 1.00, wn: 5 },
    };
    const { zeta, wn } = springCfg[mode] ?? springCfg.ease;

    const alreadyAtFinal = Math.abs(startFill - finalFill) < 0.015;
    const startupDelay = alreadyAtFinal ? 0 : 60;

    // Mark animation in-flight — blocks re-entry from dependency-churn re-renders
    animRunningRef.current = true;

    const delayId = setTimeout(() => {
      const t0 = performance.now();

      function tick(now: number) {
        const elapsed = (now - t0) / duration;
        const t = Math.min(elapsed, 1);
        let pos: number;

        switch (mode) {
          case "legend":
            pos = easeOut(t);
            break;

          case "skip_spring": {
            const raw = spring(t * 1.5, zeta, wn);
            pos = startFill + raw * (finalFill - startFill);
            break;
          }

          default:
            pos = startFill + easeOut(t) * delta;
        }

        // Cap bar width to valid range
        const barWidth = Math.min(1, Math.max(0, pos));
        setBarFill(barWidth);
        setBarColor(normalColor);

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          animRunningRef.current = false;
          prevFillRef.current = finalFill;
          prevTierRef.current = derivedTier;
          lastAnimatedTotalFpRef.current = totalFp;
          setBarFill(finalFill);
          setBarColor(normalColor);
          if (winTierProp) hasLockedRef.current = true;
          if (isLegend) {
            setIsDinging(true);
            setTimeout(() => setIsDinging(false), 1500);
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }, startupDelay);

    return () => {
      clearTimeout(delayId);
      cancelAnimationFrame(rafRef.current);
      // Do NOT reset animRunningRef here — the in-flight guard must persist across
      // re-renders triggered by setBarFill(). It is cleared only when the animation
      // completes (t>=1) or when a legitimate new animation mode takes over below.
    };
  }, [totalFp, winTierProp, visible, ftueSuppressNormal, ftueOscillate, ftueLockStaticBar, regularFinalCardKick, isSkip, isNearMiss, isLegend, thresholds]); // eslint-disable-line

  useEffect(() => {
    if (!visible) {
      prevFillRef.current = 0;
      prevTierRef.current = "BUST";
      lastAnimatedTotalFpRef.current = null;
      nearMissSpringFiredRef.current = false;
      hasLockedRef.current = false;
      animRunningRef.current = false;
    }
  }, [visible]);

  // Reset rush + override part index when new commentary arrives
  useEffect(() => { setCommentaryRushed(false); }, [postRevealCopy]);
  useEffect(() => {
    setOverridePart(0);
    setCommentaryRushed(false);
    setOverrideTyping(!!commentaryOverride);
  }, [commentaryOverride]);

  if (!visible || ftueSuppressNormal) return null;

  return (
    <div style={{
      display: "grid",
      gridTemplateRows: "14px 96px",
      gap: 4,
      boxSizing: "border-box",
      width: "100%",
    }}>

      {/* Row 1: Bar — locked height */}
      <div style={{ position: "relative", height: 14, background: "#ffffff0d", borderRadius: 999, overflow: "hidden", zIndex: 2, visibility: hideBar ? "hidden" : "visible" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 999,
          width: `${barFill * 100}%`,
          background: barColor,
          boxShadow: `0 0 12px ${ftueOscGlow ?? targetCfg.glow}`,
          animation: isDinging ? "tgDing 0.30s ease-in-out 5, tgGlow 0.60s ease-in-out 3" : "none",
        }} />
      </div>

      {/* Row 2: Commentary — locked height, maximized */}
      <div data-ftue-anchor="commentary" style={{ display: "flex", alignItems: "stretch", justifyContent: "flex-start", flexDirection: "column", height: 96, textAlign: "left", overflow: "hidden", position: "relative", zIndex: commentaryOverride ? 1100 : 1 }}>
        {commentaryOverride && commentaryOverride.parts.length > 0 ? (() => {
          const part = commentaryOverride.parts[overridePart];
          const isString = typeof part === "string";
          const isLast = overridePart >= commentaryOverride.parts.length - 1;
          return (
            <div
              onClick={() => {
                if (overrideTyping) { setCommentaryRushed(true); return; }
                if (!isLast) {
                  setOverridePart(overridePart + 1);
                  setOverrideTyping(true);
                  setCommentaryRushed(false);
                } else if (stickyLastOverride) {
                  return;
                } else if (commentaryOverride?.sticky) {
                  return;
                } else {
                  onCommentaryOverrideDone?.();
                }
              }}
              style={{ padding: "2px 4px 0", width: "100%", cursor: "pointer" }}
            >
              {isString ? (
                <Typewriter
                  key={`override-${overridePart}`}
                  text={part as string}
                  rush={commentaryRushed}
                  style={{
                    fontSize: 12, fontWeight: 700, color: "#FFFFFF",
                    fontFamily: FF, letterSpacing: "0.01em", lineHeight: 1.45,
                    textAlign: "left", maxWidth: "100%",
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any,
                    overflow: "hidden",
                  }}
                  msPerChar={20}
                  onDone={() => setOverrideTyping(false)}
                />
              ) : (
                <div
                  key={`override-${overridePart}`}
                  style={{
                    fontSize: 12, fontWeight: 700, color: "#FFFFFF",
                    fontFamily: FF, letterSpacing: "0.01em", lineHeight: 1.45,
                    textAlign: "left", maxWidth: "100%",
                    display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any,
                    overflow: "hidden",
                    animation: "tgTextReveal 0.5s ease both",
                  }}
                  ref={() => { setTimeout(() => setOverrideTyping(false), 500); }}
                >
                  {part}
                </div>
              )}
            </div>
          );
        })() : postRevealCopy ? (
            <div
              onClick={() => { if (!commentaryRushed) setCommentaryRushed(true); }}
              style={{ padding: "4px 0 2px", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 2, maxWidth: "100%", height: "100%", cursor: "pointer" }}
            >
              {Array.isArray(postRevealCopy.primary) ? (
                <PartsLine
                  parts={postRevealCopy.primary}
                  rush={commentaryRushed}
                  winTier={winTierProp}
                  missTier={missTier}
                  style={{
                    fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.92)",
                    fontFamily: FF, letterSpacing: "0.02em", lineHeight: 1.5,
                    textAlign: "left", maxWidth: "100%",
                  }}
                  onDone={() => setPrimaryDone(true)}
                />
              ) : (
                <Typewriter
                  text={postRevealCopy.primary}
                  rush={commentaryRushed}
                  style={{
                    fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.92)",
                    fontFamily: FF, letterSpacing: "0.02em", lineHeight: 1.5,
                    textAlign: "left", maxWidth: "100%",
                  }}
                  msPerChar={18}
                  onDone={() => setPrimaryDone(true)}
                />
              )}
              {postRevealCopy.secondary && (
                <Typewriter
                  text={postRevealCopy.secondary}
                  rush={commentaryRushed}
                  start={primaryDone}
                  style={{
                    fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.80)",
                    fontFamily: FF, letterSpacing: "0.02em", lineHeight: 1.5,
                    textAlign: "left", maxWidth: "100%",
                  }}
                  msPerChar={18}
                  onDone={onCommentaryDone}
                />
              )}
            </div>
        ) : commentaryOverride === null && ftueTypewriter ? (
          null
        ) : null}
      </div>
    </div>
  );
}