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
}: TierGaugeProps) {
  const [barFill,   setBarFill]   = useState(0);
  const [barColor,  setBarColor]  = useState("transparent");
  const [ftueOscGlow, setFtueOscGlow] = useState<string | null>(null);
  const [isDinging, setIsDinging] = useState(false);
  const rafRef      = useRef<number>(0);
  const prevFillRef = useRef<number>(0);
  const prevTierRef = useRef<string>("BUST");
  const ftueOscCompleteFiredRef = useRef(false);
  const onFtueOscillateCompleteRef = useRef(onFtueOscillateComplete);
  onFtueOscillateCompleteRef.current = onFtueOscillateComplete;

  // Gauge stops — GOAT/BONUS_POOL are bonus pool wins, not gauge stops
  const sorted = [...thresholds]
    .filter(t => (t.tier as string) !== "BONUS_POOL" && (t.tier as string) !== "GOAT")
    .sort((a, b) => a.minFP - b.minFP);

  // Derive tier position from totalFp
  let derivedTier = "BUST";
  let nextTier: string | null = sorted[0]?.tier ?? null;
  let curMin = 0;
  let nextMin = sorted[0]?.minFP ?? 155;

  for (let i = 0; i < sorted.length; i++) {
    if (totalFp >= sorted[i].minFP) {
      derivedTier = sorted[i].tier;
      curMin      = sorted[i].minFP;
      nextTier    = sorted[i + 1]?.tier ?? null;
      nextMin     = sorted[i + 1]?.minFP ?? 9999;
    }
  }

  const goatMin    = thresholds.find(t => (t.tier as string) === "GOAT")?.minFP ?? 235;
  const isGoat     = totalFp >= goatMin;

  // When derivedTier is MVP (last gauge stop), nextTier should be GOAT — not null
  // This gives us the orange→red gradient and correct right label
  if (derivedTier === "MVP" && nextTier === null) {
    nextTier = "GOAT";
    nextMin  = goatMin;
  }

  // actualTier: winTierProp is post-reveal source of truth (from calculateWinTier)
  // During live flips winTierProp is null — use derivedTier
  const actualTier = winTierProp ?? (isGoat ? "GOAT" : derivedTier);

  // isMaxLevel: ONLY when score is at or above GOAT threshold
  // MVP is NOT max level — it still shows progress toward GOAT on the gauge
  // (right label = G.O.A.T. in red when in MVP band)
  const isMaxLevel = isGoat || actualTier === "GOAT";

  const tierCfg   = TIER_CFG[actualTier] ?? TIER_CFG.BUST;
  const targetCfg = isMaxLevel ? TIER_CFG.GOAT : (TIER_CFG[nextTier ?? ""] ?? tierCfg);

  const gap        = isMaxLevel ? 0 : Math.max(0, nextMin - totalFp);
  const isNearMiss = !isMaxLevel && winTierProp != null && gap > 0 && gap <= NEAR_MISS_PTS;

  // Bar fill: progress within current tier band (0→1)
  const tierSpan  = Math.max(1, nextMin - curMin);
  const finalFill = isMaxLevel ? 1.0 : Math.min(1, Math.max(0, (totalFp - curMin) / tierSpan));

  // Near-miss overshoot: more so-close = more overshoot
  const nmOvershoot = isNearMiss ? 0.11 * (1 - gap / NEAR_MISS_PTS) : 0;
  const nmTarget    = Math.min(1.12, 1.0 + nmOvershoot);

  const normalColor    = isGoat
    ? TIER_CFG.GOAT.color
    : `linear-gradient(90deg, ${tierCfg.color}88, ${targetCfg.color})`;
  const overshootColor = `linear-gradient(90deg, ${tierCfg.color}88 0%, ${targetCfg.color} 50%, ${targetCfg.color} 100%)`;

  // Detect tier crossing (this update moved into a new tier band, including BUST → first tier)
  const tierCrossed = derivedTier !== prevTierRef.current;

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
      setBarFill(finalFill);
      setBarColor(normalColor);
      setFtueOscGlow(null);
      return;
    }
    if (ftueSuppressNormal) { cancelAnimationFrame(rafRef.current); setBarFill(0); setBarColor("transparent"); return; }
    if (!visible || totalFp <= 0) {
      cancelAnimationFrame(rafRef.current);
      prevFillRef.current = 0;
      prevTierRef.current = "BUST";
      setBarFill(0);
      setBarColor("transparent");
      return;
    }

    cancelAnimationFrame(rafRef.current);

    // On tier crossing, always start visually from 0 within the new tier band
    // so the bar animates rightward, never left
    const startFill = tierCrossed ? 0 : prevFillRef.current;
    const delta     = finalFill - startFill;

    // ── Determine animation mode ──────────────────────────────────────────
    type AnimMode = "goat" | "near_miss_spring" | "tier_cross" | "skip_spring" | "final_card_spring" | "ease";
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
    } else if (tierCrossed) {
      mode = "tier_cross";
      duration = 550;
    } else {
      // Single card: duration proportional to this card's FP delta
      duration = lastCardFp > BIG_CARD_FP ? 480 : Math.max(220, Math.round(lastCardFp / 40 * 400));
      mode = "ease";
    }

    // ── Spring params by mode ─────────────────────────────────────────────
    // zeta: damping ratio. Lower = more oscillations. 0.3 = springy, 0.8 = barely bounces.
    // wn: natural frequency. Higher = faster oscillation.
    const springCfg = {
      near_miss_spring: { zeta: 0.28, wn: 9  },
      skip_spring:      { zeta: 0.45, wn: 8  },
      tier_cross:       { zeta: 0.50, wn: 8  },
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

          case "tier_cross":
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
          setBarFill(finalFill);
          setBarColor(normalColor);
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
  }, [totalFp, visible, ftueSuppressNormal, ftueOscillate, ftueLockStaticBar, regularFinalCardKick, finalFill, normalColor, derivedTier]); // eslint-disable-line

  useEffect(() => {
    if (!visible) {
      prevFillRef.current = 0;
      prevTierRef.current = "BUST";
    }
  }, [visible]);

  if (!visible || totalFp <= 0 || ftueSuppressNormal) return null;

  return (
    <div style={{ padding: "4px 0 2px", display: "flex", flexDirection: "column", gap: 4 }}>

      {/* Gap callout */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        {isMaxLevel ? (
          <span style={{ fontSize: 13, fontWeight: 800, color: TIER_CFG.GOAT.color, fontFamily: FF, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            You've reached the maximum level
          </span>
        ) : (
          <>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#FFFFFF", fontFamily: FF, letterSpacing: "-0.5px" }}>
              {gap.toFixed(1)}
            </span>
            <span style={{ fontSize: 12, color: "#888", fontFamily: FF, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {" "}FP TO{" "}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, color: targetCfg.color, fontFamily: FF, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {targetCfg.label}
            </span>
          </>
        )}
      </div>

      {/* Bar */}
      <div style={{ position: "relative", height: 8, background: "#ffffff0d", borderRadius: 999, overflow: "hidden" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%", borderRadius: 999,
          width: `${barFill * 100}%`,
          background: barColor,
          boxShadow: `0 0 12px ${ftueOscGlow ?? targetCfg.glow}`,
          animation: isDinging ? "tgDing 0.30s ease-in-out 5, tgGlow 0.60s ease-in-out 3" : "none",
        }} />
      </div>
    </div>
  );
}