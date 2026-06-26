// shared/hooks/useBossReveal.ts
//
// Boss Surface Consolidation — Phase 1 (HUB). One reveal timeline consumed by the
// hub's TWO separated regions: the "Target to beat" line (section 3) reads
// `running` (0→target, snaps), and the lineup strip (section 4) reads `optsFor`
// per card (idle → present, rolling → FP rolls + blast, settled → final). ONE
// state, no swap: the real reveal cards ARE the resting state — they settle and
// stay (no handoff back to LineupTile); returning/seen players see the same cards
// static. LineupTile is only the no-renderer fallback (other sports).
//
// INVARIANT (load-bearing): the count-up lands on `target`, which === Σ the five
// cards' FP (the boss-target seam). The snap (setRunning(target) at the window end)
// ENFORCES it; the animation SHOWS the number, never derives it. See
// docs/boss-surface-consolidation-spec.md.

import { useEffect, useState } from "react";

// Roll duration MUST match h2hArcRenderer's fixed fpCountUpMs (MATCHUP_DURATION_MS
// = 1800) so the aggregate lands with the cards. Glass-tunable knobs.
const REVEAL_DURATION_MS = 1800;
const START_DELAY_MS = 250;   // brief "cards present" beat before the roll
const GLOW_MS = 700;          // per-card blast duration

export interface BossRevealCardOpts {
  revealed: boolean;
  visibleFp?: number;
  glowActive?: boolean;
  glowTier?: string;
  glowDurationMs?: number;
}

export interface BossRevealState {
  phase: "idle" | "rolling" | "settled";
  running: number;     // the "Target to beat" value (0→target, snapped)
  optsFor: (card: { actualFp?: number; fp?: number; tier?: unknown }) => BossRevealCardOpts;
}

/** `sig` = a stable signature of the cards/boss so a new daily boss re-arms. */
export function useBossReveal(armReveal: boolean, target: number, sig: string): BossRevealState {
  const [phase, setPhase] = useState<"idle" | "rolling" | "settled">(armReveal ? "idle" : "settled");
  const [running, setRunning] = useState<number>(armReveal ? 0 : target);

  useEffect(() => {
    if (!armReveal) { setPhase("settled"); setRunning(target); return; }
    setPhase("idle"); setRunning(0);
    let raf = 0; let startT = 0;
    let settleTimer: ReturnType<typeof setTimeout>;
    const startTimer = setTimeout(() => {
      setPhase("rolling");
      const tick = (now: number) => {
        if (!startT) startT = now;
        const p = Math.min(1, (now - startT) / REVEAL_DURATION_MS);
        const eased = 1 - Math.pow(1 - p, 3); // matched cubic-out (== the card RAF curve)
        setRunning(Math.round(target * eased * 10) / 10);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      settleTimer = setTimeout(() => {
        setRunning(target);   // SNAP — locks to the exact baked target (the invariant)
        setPhase("settled");  // ONE state: cards settle and STAY (no handoff)
      }, REVEAL_DURATION_MS);
    }, START_DELAY_MS);
    return () => {
      clearTimeout(startTimer); clearTimeout(settleTimer);
      cancelAnimationFrame(raf);
    };
  }, [armReveal, target, sig]);

  const optsFor = (card: { actualFp?: number; fp?: number; tier?: unknown }): BossRevealCardOpts => {
    if (!armReveal || phase === "settled") return { revealed: true };
    if (phase === "idle") return { revealed: false };           // card present, FP not yet rolled
    return {                                                    // rolling: FP rolls 0→fp + blast
      revealed: false,
      visibleFp: Number(card.actualFp ?? card.fp ?? 0),
      glowActive: true,
      glowTier: String(card.tier ?? "WHITE"),
      glowDurationMs: GLOW_MS,
    };
  };

  return { phase, running, optsFor };
}
