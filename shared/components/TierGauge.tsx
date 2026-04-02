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
 *      - GOAT: smooth fill + ding pulse.
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

import { useEffect, useRef, useState } from "react";

export type GaugeTier = "MVP" | "ALL_STAR" | "STARTER" | "ROOKIE" | "BUST" | "NONE";
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
  /** Smart post-reveal copy — replaces gap callout after results settle */
  postRevealCopy?: { primary: string; secondary?: string } | null;
}

const TIER_CFG: Record<string, { label: string; color: string; glow: string }> = {
  GOAT:     { label: "G.O.A.T.", color: "#EF4444", glow: "#EF444455" },
  MVP:      { label: "MVP",      color: "#FB923C", glow: "#FB923C55" },
  ALL_STAR: { label: "ALL-STAR", color: "#C084FC", glow: "#C084FC55" },
  STARTER:  { label: "STARTER",  color: "#00FFD8", glow: "#00FFD855" },
  ROOKIE:   { label: "ROOKIE",   color: "#22C55E", glow: "#22C55E55" },
  BUST:     { label: "BUST",     color: "#6B7280", glow: "#6B728033" },
};

const FF            = "'Rajdhani', 'Oswald', 'Arial Narrow', sans-serif";
const NEAR_MISS_PTS = 8;
const MAX_FP        = 235;   // GOAT threshold, used for duration scaling
const BIG_CARD_FP   = 35;    // single card FP above this = "big card"

/** FTUE Booker hand: five drawn cards only (see ftueRoster.ts) — bar starts here before scripted gauge */
const FTUE_FIVE_CARDS_FP = 105;
const FTUE_FINAL_FP      = 192.6;
/** Imagined peak FP for the “past Starter into All-Star” hero beat (All-Star line = 195) */
const FTUE_IMAGINE_PEAK_FP = 198;

// Underdamped spring: starts at 0, settles at 1. Never negative.
function spring(t: number, zeta: number, wn: number): number {
  if (t <= 0) return 0;
  const wd = wn * Math.sqrt(Math.max(0, 1 - zeta * zeta));
  const d  = Math.exp(-zeta * wn * t);
  if (wd < 0.001) return 1 - d * (1 + zeta * wn * t);
  return 1 - d * (Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t));
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, t), 3);
}

/** Sorted gauge stops (excludes GOAT as a bar segment — it's the overflow tier). */
function sortedGaugeThresholds(thresholds: TierThreshold[]) {
  return [...thresholds]
    .filter(t => (t.tier as string) !== "GOAT")
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

  const goatMin = thresholds.find(t => (t.tier as string) === "GOAT")?.minFP ?? 235;
  const isGoat = fp >= goatMin;

  if (derivedTier === "MVP" && nextTier === null) {
    nextTier = "GOAT";
    nextMin = goatMin;
  }

  const actualTier = winTierProp ?? (isGoat ? "GOAT" : derivedTier);
  const isMaxLevel = isGoat || actualTier === "GOAT";

  const tierCfg = TIER_CFG[actualTier] ?? TIER_CFG.BUST;
  const targetCfg = isMaxLevel ? TIER_CFG.GOAT : (TIER_CFG[nextTier ?? ""] ?? tierCfg);

  const gap = isMaxLevel ? 0 : Math.max(0, nextMin - fp);
  const isNearMiss = !isMaxLevel && winTierProp != null && gap > 0 && gap <= nearMissPts;

  const tierSpan = Math.max(1, nextMin - curMin);
  const finalFill = isMaxLevel ? 1.0 : Math.min(1, Math.max(0, (fp - curMin) / tierSpan));

  const normalColor = isGoat
    ? TIER_CFG.GOAT.color
    : `linear-gradient(90deg, ${tierCfg.color}88, ${targetCfg.color})`;
  const overshootColor = `linear-gradient(90deg, ${tierCfg.color}88 0%, ${targetCfg.color} 50%, ${targetCfg.color} 100%)`;

  return {
    derivedTier,
    nextTier,
    curMin,
    nextMin,
    goatMin,
    isGoat,
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
  const goatMin = thresholds.find(t => (t.tier as string) === "GOAT")?.minFP;
  if (goatMin && fromFp < goatMin && toFp >= goatMin) n++;
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

/** FP waypoints for roll-up: start, each tier min strictly between from→to, end (GOAT line included). */
function buildFpWaypoints(fromFp: number, toFp: number, thresholds: TierThreshold[]): number[] {
  if (toFp <= fromFp + 0.001) return [fromFp, toFp];
  const w: number[] = [fromFp];
  const sorted = sortedGaugeThresholds(thresholds);
  for (const t of sorted) {
    const m = t.minFP;
    if (m > fromFp + 0.001 && m < toFp - 0.001) w.push(m);
  }
  const goatMin = thresholds.find(tt => (tt.tier as string) === "GOAT")?.minFP;
  if (goatMin != null && goatMin > fromFp + 0.001 && goatMin < toFp - 0.001) {
    if (!w.some(x => Math.abs(x - goatMin) < 0.01)) w.push(goatMin);
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
  `;
  document.head.appendChild(st);
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
}: TierGaugeProps) {
  const [barFill,   setBarFill]   = useState(0);
  const [barColor,  setBarColor]  = useState("transparent");
  const [ftueOscGlow, setFtueOscGlow] = useState<string | null>(null);
  const [isDinging, setIsDinging] = useState(false);
  const rafRef      = useRef<number>(0);
  const delayRef    = useRef<number>(0);
  const animatedFpRef = useRef<number>(0);
  const animTierRef  = useRef<string>("BUST");
  const onTierCrossRef = useRef(onTierCross);
  onTierCrossRef.current = onTierCross;
  const prevFillRef = useRef<number>(0);
  const prevTierRef = useRef<string>("BUST");
  /** Last totalFp we fully animated to — prevents duplicate roll-up on re-renders */
  const lastAnimatedTotalFpRef = useRef<number | null>(null);
  const nearMissSpringFiredRef = useRef(false);
  const hasLockedRef = useRef(false);
  const ftueOscCompleteFiredRef = useRef(false);
  const onFtueOscillateCompleteRef = useRef(onFtueOscillateComplete);
  onFtueOscillateCompleteRef.current = onFtueOscillateComplete;

  const snap = computeGaugeState(totalFp, thresholds, winTierProp ?? null, NEAR_MISS_PTS);
  const {
    derivedTier,
    nextTier,
    curMin,
    nextMin,
    isGoat,
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
  const nmTarget    = Math.min(1.12, 1.0 + nmOvershoot);

  // ── FTUE oscillation — runs once when ftueOscillate becomes true ─────
  // Ease FP to 198 (3 FP into All-Star vs floor 195): bar shows a *small* All-Star segment
  // (proportional within the All-Star→MVP band), then springs down to 192.6 Starter and settles.
  useEffect(() => {
    if (!ftueOscillate || !visible) return;
    cancelAnimationFrame(rafRef.current);
    ftueOscCompleteFiredRef.current = false;

    // Must match basketball FTUE TierGauge thresholds (GameView)
    const rookieMin   = 155;
    const starterMin  = 175;
    const allStarMin  = 195;
    const mvpMin      = 215;
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
    const peakFp  = FTUE_IMAGINE_PEAK_FP;
    const realFp  = FTUE_FINAL_FP;
    const realFill = Math.min(1, Math.max(0, (realFp - starterMin) / starterSpan));

    // Slower than normal play — FTUE “slot machine” near-miss read (linger on tier crossing + wobble)
    const PHASE1_MS = 1650;
    const PHASE2_MS = 5200;
    const ENVELOPE_DECAY = 1.55;
    const OMEGA        = 2 * Math.PI * 0.62;

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
        const u  = elapsed / PHASE1_MS;
        const fp = startFp + (peakFp - startFp) * easeOut(u);
        const v  = fpToOscVisual(fp);
        setBarFill(v.fill);
        setBarColor(v.color);
        setFtueOscGlow(v.glow);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const t2   = elapsed - PHASE1_MS;
      const tSec = t2 / 1000;
      const env  = Math.exp(-ENVELOPE_DECAY * tSec);
      const fp   = realFp + (peakFp - realFp) * env * Math.cos(OMEGA * tSec);
      const v    = fpToOscVisual(fp);
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
      return;
    }

    // Once winTier is set and we've done one final animation, lock forever
    if (hasLockedRef.current) return;

    // Already settled at this totalFp — avoid restarting animation on dependency churn
    if (lastAnimatedTotalFpRef.current !== null && Math.abs(totalFp - lastAnimatedTotalFpRef.current) < 0.05) {
      return;
    }

    cancelAnimationFrame(rafRef.current);
    clearTimeout(delayRef.current);

    // ── Direct-set: bar tracks totalFp frame-by-frame ──────────────────
    // If winTier not yet set, bar is being driven externally (by spring in GameView).
    // Always direct-set — TierGauge must be a passive follower, no internal spring.
    if (!winTierProp || (!isGoat && !regularFinalCardKick && !isNearMiss && !isSkip)) {
      const snap = computeGaugeState(totalFp, thresholds, winTierProp ?? null, NEAR_MISS_PTS);
      prevFillRef.current = snap.finalFill;
      prevTierRef.current = snap.derivedTier;
      animatedFpRef.current = totalFp;
      lastAnimatedTotalFpRef.current = totalFp;
      setBarFill(snap.finalFill);
      setBarColor(snap.normalColor);
      // Fire tier cross callback when tier changes
      if (snap.derivedTier !== animTierRef.current) {
        animTierRef.current = snap.derivedTier;
        onTierCrossRef.current?.(snap.derivedTier);
      }
      return;
    }

    // Always animate from last bar end (never reset to 0 on tier cross) for spring modes
    const startFill = prevFillRef.current;
    const delta     = finalFill - startFill;

    // ── Determine animation mode ──────────────────────────────────────────
    type AnimMode = "goat" | "near_miss_spring" | "skip_spring" | "final_card_spring" | "ease";
    let mode: AnimMode = "ease";
    let duration = 300;

    if (isGoat) {
      mode = "goat";
      duration = 900;
    } else if (regularFinalCardKick) {
      mode = "final_card_spring";
      duration = 1100;
    } else if (isNearMiss) {
      mode = "near_miss_spring";
      duration = 1600;
    } else if (isSkip) {
      // Skip: duration proportional to score; mild spring for high tiers
      duration = Math.max(500, Math.round(totalFp / MAX_FP * 1400));
      mode = (actualTier === "MVP" || actualTier === "ALL_STAR") ? "skip_spring" : "ease";
    } else {
      // Unreachable if FP roll-up path is correct — keep short ease fallback
      mode = "ease";
      duration = 300;
    }

    // ── Spring params by mode ─────────────────────────────────────────────
    // zeta: damping ratio. Lower = more oscillations. 0.3 = springy, 0.8 = barely bounces.
    // wn: natural frequency. Higher = faster oscillation.
    const springCfg = {
      near_miss_spring: { zeta: 0.28, wn: 9  },
      skip_spring:      { zeta: 0.45, wn: 8  },
      final_card_spring:{ zeta: 0.44, wn: 8.5 },
      goat:             { zeta: 1.00, wn: 5  }, // critically damped — smooth fill
      ease:             { zeta: 1.00, wn: 5  }, // unused for ease mode
    };
    const { zeta, wn } = springCfg[mode] ?? springCfg.ease;

    const delayId = setTimeout(() => {
      const t0 = performance.now();

      function tick(now: number) {
        const elapsed = (now - t0) / duration;
        const t       = Math.min(elapsed, 1);
        let pos: number;

        switch (mode) {
          case "goat":
            pos = easeOut(t);
            break;

          case "near_miss_spring": {
            // Phase 1 (0→0.6): ease-out to finalFill
            // Phase 2 (0.6→1.0): spring overshoots nmTarget then snaps back to finalFill
            if (t < 0.6) {
              pos = startFill + easeOut(t / 0.6) * (finalFill - startFill);
            } else {
              const t2  = (t - 0.6) / 0.4;
              const raw = spring(t2 * 1.8, zeta, wn);
              pos = finalFill + raw * (nmTarget - finalFill);
            }
            break;
          }

          case "skip_spring": {
            // Spring from start to finalFill — mild natural bounce
            const raw = spring(t * 1.5, zeta, wn);
            pos = startFill + raw * (finalFill - startFill);
            break;
          }
          case "final_card_spring": {
            // Slot-machine style: overshoot ~5% of current target, then bounce back.
            const oscFp = totalFp * 1.05;
            const target = isMaxLevel
              ? 1
              : Math.min(1, Math.max(0, (oscFp - curMin) / tierSpan));
            const raw = spring(t * 1.55, zeta, wn);
            pos = startFill + raw * (target - startFill);
            break;
          }

          default:
            // Simple ease-out — no spring, no nonsense
            pos = startFill + easeOut(t) * delta;
        }

        const barWidth = Math.min(1, Math.max(0, pos));
        setBarFill(barWidth);

        // Color: show next-tier color when overshooting past 1.0
        if ((mode === "near_miss_spring" || mode === "final_card_spring") && pos > finalFill + 0.005) {
          setBarColor(overshootColor);
        } else {
          setBarColor(normalColor);
        }

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          prevFillRef.current = finalFill;
          prevTierRef.current = derivedTier;
          lastAnimatedTotalFpRef.current = totalFp;
          setBarFill(finalFill);
          setBarColor(normalColor);
          if (winTierProp) hasLockedRef.current = true; // post-spring: lock forever
          if (isGoat) {
            setIsDinging(true);
            setTimeout(() => setIsDinging(false), 1500);
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }, 60);

    return () => {
      clearTimeout(delayId);
      cancelAnimationFrame(rafRef.current);
    };
  }, [totalFp, winTierProp, visible, ftueSuppressNormal, ftueOscillate, ftueLockStaticBar, regularFinalCardKick, isSkip, isNearMiss, isGoat, thresholds]); // eslint-disable-line

  useEffect(() => {
    if (!visible) {
      prevFillRef.current = 0;
      prevTierRef.current = "BUST";
      lastAnimatedTotalFpRef.current = null;
      nearMissSpringFiredRef.current = false;
      hasLockedRef.current = false;
    }
  }, [visible]);

  if (!visible || ftueSuppressNormal) return null;

  return (
    <div style={{
      padding: "3px 0 4px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      overflow: "visible",
      boxSizing: "border-box",
    }}>

      {/* Bar — min 14px track */}
      <div style={{ position: "relative", height: 14, minHeight: 14, background: "#ffffff0d", borderRadius: 999, overflow: "hidden" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 999,
          width: `${barFill * 100}%`,
          background: barColor,
          boxShadow: `0 0 12px ${ftueOscGlow ?? targetCfg.glow}`,
          animation: isDinging ? "tgDing 0.30s ease-in-out 5, tgGlow 0.60s ease-in-out 3" : "none",
        }} />
      </div>

      {/* Gap callout — below bar: pre-reveal shows X FP TO NEXT TIER, post-reveal shows smart copy */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexDirection: "column", minHeight: 28, textAlign: "center" }}>
        {postRevealCopy ? (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#CCCCCC", fontFamily: FF, letterSpacing: "0.04em", lineHeight: 1.3 }}>
              {postRevealCopy.primary}
            </span>
            {postRevealCopy.secondary && (
              <span style={{ fontSize: 10, color: "#666", fontFamily: FF, letterSpacing: "0.04em" }}>
                {postRevealCopy.secondary}
              </span>
            )}
          </>
        ) : isMaxLevel ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: TIER_CFG.GOAT.color, fontFamily: FF, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            You've reached the maximum level
          </span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#FFFFFF", fontFamily: FF, letterSpacing: "-0.5px" }}>
              {gap.toFixed(1)}
            </span>
            <span style={{ fontSize: 12, color: "#888", fontFamily: FF, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {" "}FP TO{" "}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: targetCfg.color, fontFamily: FF, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {targetCfg.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}