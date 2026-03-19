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
}: TierGaugeProps) {
  const [barFill,   setBarFill]   = useState(0);
  const [barColor,  setBarColor]  = useState("transparent");
  const [isDinging, setIsDinging] = useState(false);
  const rafRef      = useRef<number>(0);
  const prevFillRef = useRef<number>(0);
  const prevTierRef = useRef<string>("BUST");

  // Gauge stops — GOAT/JACKPOT are bonus pool wins, not gauge stops
  const sorted = [...thresholds]
    .filter(t => (t.tier as string) !== "JACKPOT" && (t.tier as string) !== "GOAT")
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
      nextMin     = sorted[i + 1]?.minFP ?? sorted[i].minFP;
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

  // Detect tier crossing (this update moved into a new tier)
  const tierCrossed = derivedTier !== prevTierRef.current && prevTierRef.current !== "BUST";

  useEffect(() => {
    if (!visible || totalFp <= 0) {
      cancelAnimationFrame(rafRef.current);
      prevFillRef.current = 0;
      prevTierRef.current = "BUST";
      setBarFill(0);
      setBarColor("transparent");
      return;
    }

    cancelAnimationFrame(rafRef.current);

    const startFill = prevFillRef.current;
    const delta     = finalFill - startFill;

    // ── Determine animation mode ──────────────────────────────────────────
    type AnimMode = "goat" | "near_miss_spring" | "tier_cross" | "skip_spring" | "ease";
    let mode: AnimMode = "ease";
    let duration = 300;

    if (isGoat) {
      mode = "goat";
      duration = 900;
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

          default:
            // Simple ease-out — no spring, no nonsense
            pos = startFill + easeOut(t) * delta;
        }

        const barWidth = Math.min(1, Math.max(0, pos));
        setBarFill(barWidth);

        // Color: show next-tier color when overshooting past 1.0
        if (mode === "near_miss_spring" && pos > finalFill + 0.005) {
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
  }, [totalFp, visible]); // eslint-disable-line

  useEffect(() => {
    if (!visible) {
      prevFillRef.current = 0;
      prevTierRef.current = "BUST";
    }
  }, [visible]);

  if (!visible || totalFp <= 0) return null;

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
            <span style={{ fontSize: 18, fontWeight: 800, color: targetCfg.color, fontFamily: FF, letterSpacing: "-0.5px" }}>
              {gap.toFixed(1)}
            </span>
            <span style={{ fontSize: 12, color: "#555", fontFamily: FF, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              FP to {targetCfg.label}
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
          boxShadow: `0 0 12px ${targetCfg.glow}`,
          animation: isDinging ? "tgDing 0.30s ease-in-out 5, tgGlow 0.60s ease-in-out 3" : "none",
        }} />
      </div>

      {/* Labels: left = actual win tier, right = next tier */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: tierCfg.color, fontSize: 10, fontFamily: FF, letterSpacing: "0.08em" }}>
          {tierCfg.label}
        </span>
        {!isMaxLevel && nextTier && (
          <span style={{ color: targetCfg.color, fontSize: 10, fontFamily: FF, letterSpacing: "0.08em" }}>
            {targetCfg.label}
          </span>
        )}
      </div>
    </div>
  );
}