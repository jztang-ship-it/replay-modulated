/**
 * shared/components/PlayerCardShell.tsx
 * LAYER 1: Sport-agnostic card shell.
 *
 * Owns everything identical across sports:
 *   - CSS (shake + flip animations, unified class names)
 *   - 3D flip mechanics (pcs-inner / pcs-face)
 *   - Shake classes (big / hype / cold)
 *   - Spotlight / dim scaling + opacity
 *   - Economy freeze (salary/tier/projectedFp locked at deal time)
 *   - Overlay/stamp state machine (CAREER NIGHT / ICE COLD)
 *   - handleRollComplete orchestration
 *
 * Sport-specific rendering injected via:
 *   renderFront(CardFrontProps) -> ReactNode   (the visual card face)
 *   renderBack(CardBackProps)   -> ReactNode   (the stats back, results only)
 *
 * Usage:
 *   import { PlayerCardShell, resetAllOverlays } from "@shared/components/PlayerCardShell";
 *   import type { CardShellProps, CardFrontProps, CardBackProps, OverlayStamp } from "@shared/components/PlayerCardShell";
 */

import React, { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { GamePhase, PlayerCard } from "@shared/types";
import { CardBackGeneric } from "@shared/components/CardBackGeneric";
import type { ShakeType } from "@shared/components/types";

// ── CSS injected once ──────────────────────────────────────────────────────

const STYLE_ID = "player-card-shell-styles-v1";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .pcs-inner {
      position: relative; width: 100%; height: 100%;
      transform-style: preserve-3d;
      transition: transform var(--flip-ms, 450ms) cubic-bezier(0.4, 0.0, 0.2, 1);
      will-change: transform;
      border-radius: 18px;
    }
    .pcs-inner.no-transition { transition: none !important; }
    .pcs-inner.is-flipped { transform: rotateY(180deg); }
    .pcs-face {
      position: absolute; inset: 0; border-radius: 18px;
      backface-visibility: hidden; -webkit-backface-visibility: hidden;
      overflow: hidden;
      transform: translateZ(0);
    }
    .pcs-face-back {
      transform: rotateY(180deg) translateZ(0);
      background: linear-gradient(160deg, #0E1628 0%, #080E1C 50%, #050810 100%);
    }

    /* Blast overlay — floods the card face at impact, hiding the player briefly */
    .pcs-face::before {
      content: ""; position: absolute; inset: 0; z-index: 90;
      opacity: 0; pointer-events: none; border-radius: 18px;
    }
    @keyframes pcsBlastOrange {
      0%   { opacity: 1;    background: radial-gradient(ellipse at center, rgba(255,220,140,1) 0%, rgba(255,140,0,0.95) 50%, rgba(200,80,0,0.85) 100%); }
      40%  { opacity: 0.9;  background: radial-gradient(ellipse at center, rgba(255,200,100,0.95) 0%, rgba(255,120,0,0.85) 60%, rgba(180,60,0,0.7) 100%); }
      100% { opacity: 0; }
    }
    @keyframes pcsBlastPurple {
      0%   { opacity: 1;    background: radial-gradient(ellipse at center, rgba(240,210,255,1) 0%, rgba(192,132,252,0.95) 50%, rgba(130,60,220,0.85) 100%); }
      40%  { opacity: 0.9;  background: radial-gradient(ellipse at center, rgba(220,180,255,0.95) 0%, rgba(168,100,240,0.85) 60%, rgba(110,40,200,0.7) 100%); }
      100% { opacity: 0; }
    }
    @keyframes pcsBlastBlue {
      0%   { opacity: 1;    background: radial-gradient(ellipse at center, rgba(200,230,255,1) 0%, rgba(96,165,250,0.95) 50%, rgba(30,80,200,0.85) 100%); }
      40%  { opacity: 0.9;  background: radial-gradient(ellipse at center, rgba(170,210,255,0.95) 0%, rgba(70,140,240,0.85) 60%, rgba(20,60,180,0.7) 100%); }
      100% { opacity: 0; }
    }
    @keyframes pcsBlastGreen {
      0%   { opacity: 1;    background: radial-gradient(ellipse at center, rgba(200,255,220,1) 0%, rgba(74,222,128,0.95) 50%, rgba(20,140,60,0.85) 100%); }
      40%  { opacity: 0.9;  background: radial-gradient(ellipse at center, rgba(170,255,200,0.95) 0%, rgba(50,200,100,0.85) 60%, rgba(10,120,50,0.7) 100%); }
      100% { opacity: 0; }
    }
    @keyframes pcsBlastWhite {
      0%   { opacity: 1;    background: radial-gradient(ellipse at center, rgba(255,255,255,1) 0%, rgba(220,230,240,0.95) 50%, rgba(160,180,200,0.85) 100%); }
      40%  { opacity: 0.9;  background: radial-gradient(ellipse at center, rgba(240,245,255,0.95) 0%, rgba(190,210,230,0.85) 60%, rgba(130,160,190,0.7) 100%); }
      100% { opacity: 0; }
    }
    .pcs-glow-orange .pcs-face::before { animation: pcsBlastOrange var(--glow-ms, 700ms) ease-out forwards; }
    .pcs-glow-purple .pcs-face::before { animation: pcsBlastPurple var(--glow-ms, 700ms) ease-out forwards; }
    .pcs-glow-blue   .pcs-face::before { animation: pcsBlastBlue   var(--glow-ms, 700ms) ease-out forwards; }
    .pcs-glow-green  .pcs-face::before { animation: pcsBlastGreen  var(--glow-ms, 700ms) ease-out forwards; }
    .pcs-glow-white  .pcs-face::before { animation: pcsBlastWhite  var(--glow-ms, 700ms) ease-out forwards; }

    @keyframes pcsShakeHype {
      0%   { transform: translate(0,0) rotate(0deg); }
      10%  { transform: translate(-3px,-2px) rotate(-1.5deg); }
      20%  { transform: translate(3px,2px) rotate(1.5deg); }
      30%  { transform: translate(-4px,1px) rotate(-2deg); }
      40%  { transform: translate(4px,-1px) rotate(2deg); }
      50%  { transform: translate(-3px,2px) rotate(-1deg); }
      60%  { transform: translate(3px,-2px) rotate(1deg); }
      70%  { transform: translate(-2px,1px) rotate(-1.5deg); }
      80%  { transform: translate(2px,-1px) rotate(1.5deg); }
      90%  { transform: translate(-1px,1px) rotate(-0.5deg); }
      100% { transform: translate(0,0) rotate(0deg); }
    }
    @keyframes pcsShakeBig {
      0%   { transform: translate(0,0) rotate(0deg) scale(1); }
      8%   { transform: translate(-5px,-3px) rotate(-2.5deg) scale(1.02); }
      16%  { transform: translate(6px,3px) rotate(2.5deg) scale(1.04); }
      24%  { transform: translate(-7px,2px) rotate(-3deg) scale(1.06); }
      32%  { transform: translate(7px,-2px) rotate(3deg) scale(1.08); }
      40%  { transform: translate(-6px,3px) rotate(-2deg) scale(1.06); }
      48%  { transform: translate(6px,-3px) rotate(2deg) scale(1.04); }
      58%  { transform: translate(-4px,2px) rotate(-2.5deg) scale(1.10); }
      68%  { transform: translate(4px,-2px) rotate(2.5deg) scale(1.12); }
      80%  { transform: translate(-2px,1px) rotate(-1deg) scale(1.08); }
      90%  { transform: translate(1px,-1px) rotate(0.5deg) scale(1.04); }
      100% { transform: translate(0,0) rotate(0deg) scale(1); }
    }
    @keyframes pcsShakeCold {
      0%   { transform: translate(0,0) rotate(0deg); }
      15%  { transform: translate(-6px,0) rotate(-1deg); }
      30%  { transform: translate(5px,0) rotate(1deg); }
      45%  { transform: translate(-4px,0) rotate(-0.7deg); }
      60%  { transform: translate(3px,0) rotate(0.5deg); }
      75%  { transform: translate(-2px,0) rotate(-0.3deg); }
      88%  { transform: translate(1px,0) rotate(0.2deg); }
      100% { transform: translate(0,0) rotate(0deg); }
    }
      @keyframes pcsShakeLegendary {
      0%   { transform: translate(0,0) rotate(0deg) scale(1); }
      10%  { transform: translate(-4px,-3px) rotate(-2deg) scale(1.04); }
      20%  { transform: translate(4px,3px) rotate(2deg) scale(1.06); }
      30%  { transform: translate(-5px,2px) rotate(-1.5deg) scale(1.05); }
      40%  { transform: translate(5px,-2px) rotate(1.5deg) scale(1.04); }
      50%  { transform: translate(-3px,3px) rotate(-1deg) scale(1.03); }
      60%  { transform: translate(3px,-1px) rotate(1deg) scale(1.02); }
      75%  { transform: translate(-2px,1px) rotate(-0.5deg) scale(1.01); }
      90%  { transform: translate(1px,0) rotate(0.3deg) scale(1); }
      100% { transform: translate(0,0) rotate(0deg) scale(1); }
    }
    @keyframes pcsShakeFrozen {
      0%   { transform: translate(0,0) rotate(0deg); filter: brightness(1); }
      20%  { transform: translate(-3px,0) rotate(-0.5deg); filter: brightness(0.85); }
      40%  { transform: translate(3px,0) rotate(0.5deg); filter: brightness(0.8); }
      60%  { transform: translate(-2px,0) rotate(-0.3deg); filter: brightness(0.85); }
      80%  { transform: translate(2px,0) rotate(0.3deg); filter: brightness(0.9); }
      100% { transform: translate(0,0) rotate(0deg); filter: brightness(1); }
    }
    .pcs-shake-hype     { animation: pcsShakeHype     0.6s cubic-bezier(0.36,0.07,0.19,0.97) both; }
    .pcs-shake-big      { animation: pcsShakeBig      0.6s cubic-bezier(0.36,0.07,0.19,0.97) both; }
    .pcs-shake-cold     { animation: pcsShakeCold     0.65s ease-in-out both; }
    .pcs-shake-legendary { animation: pcsShakeLegendary 0.7s cubic-bezier(0.36,0.07,0.19,0.97) both; }
    .pcs-shake-frozen   { animation: pcsShakeFrozen   0.8s ease-in-out both; }
    @keyframes pcsTapBounce {
      0%,100% { transform: translateY(0); }
      40%     { transform: translateY(-6px); }
      60%     { transform: translateY(-3px); }
    }
    .pcs-tap-bounce { animation: pcsTapBounce 1.4s ease-in-out infinite; }
    @keyframes pcsTapHintPulse { 0%,100%{opacity:.4} 50%{opacity:.9} }
    @keyframes pcsGlowOrange {
      0%   { box-shadow: 0 0 0px   0px rgba(255,140,0,0); }
      12%  { box-shadow: 0 0 90px 68px rgba(255,140,0,0.85), 0 0 158px 102px rgba(255,100,0,0.45); }
      45%  { box-shadow: 0 0 79px 62px rgba(255,140,0,0.75), 0 0 135px 90px rgba(255,100,0,0.35); }
      100% { box-shadow: 0 0 0px   0px rgba(255,140,0,0); }
    }
    @keyframes pcsGlowPurple {
      0%   { box-shadow: 0 0 0px   0px rgba(192,132,252,0); }
      12%  { box-shadow: 0 0 90px 68px rgba(192,132,252,0.85), 0 0 158px 102px rgba(168,85,247,0.45); }
      45%  { box-shadow: 0 0 79px 62px rgba(192,132,252,0.75), 0 0 135px 90px rgba(168,85,247,0.35); }
      100% { box-shadow: 0 0 0px   0px rgba(192,132,252,0); }
    }
    @keyframes pcsGlowBlue {
      0%   { box-shadow: 0 0 0px   0px rgba(96,165,250,0); }
      12%  { box-shadow: 0 0 90px 68px rgba(96,165,250,0.85), 0 0 158px 102px rgba(59,130,246,0.45); }
      45%  { box-shadow: 0 0 79px 62px rgba(96,165,250,0.75), 0 0 135px 90px rgba(59,130,246,0.35); }
      100% { box-shadow: 0 0 0px   0px rgba(96,165,250,0); }
    }
    @keyframes pcsGlowGreen {
      0%   { box-shadow: 0 0 0px   0px rgba(74,222,128,0); }
      12%  { box-shadow: 0 0 90px 68px rgba(74,222,128,0.85), 0 0 158px 102px rgba(34,197,94,0.45); }
      45%  { box-shadow: 0 0 79px 62px rgba(74,222,128,0.75), 0 0 135px 90px rgba(34,197,94,0.35); }
      100% { box-shadow: 0 0 0px   0px rgba(74,222,128,0); }
    }
    @keyframes pcsGlowWhite {
      0%   { box-shadow: 0 0 0px   0px rgba(226,232,240,0); }
      12%  { box-shadow: 0 0 90px 68px rgba(226,232,240,0.75), 0 0 158px 102px rgba(200,210,220,0.35); }
      45%  { box-shadow: 0 0 79px 62px rgba(226,232,240,0.65), 0 0 135px 90px rgba(200,210,220,0.25); }
      100% { box-shadow: 0 0 0px   0px rgba(226,232,240,0); }
    }
    .pcs-glow-orange { animation: pcsGlowOrange var(--glow-ms, 700ms) ease-out forwards; }
    .pcs-glow-purple { animation: pcsGlowPurple var(--glow-ms, 700ms) ease-out forwards; }
    .pcs-glow-blue   { animation: pcsGlowBlue   var(--glow-ms, 700ms) ease-out forwards; }
    .pcs-glow-green  { animation: pcsGlowGreen  var(--glow-ms, 700ms) ease-out forwards; }
    .pcs-glow-white  { animation: pcsGlowWhite  var(--glow-ms, 700ms) ease-out forwards; }
  `;
  document.head.appendChild(style);
}

// ── Public types ───────────────────────────────────────────────────────────

export type OverlayStamp = "SMOKING HOT" | "ON FIRE" | "ICE COLD" | "FREEZING" | null;

/** Everything the shell passes into the sport's front face renderer */
export interface CardFrontProps {
  card: PlayerCard;
  stableCard: PlayerCard;
  phase: GamePhase;
  isLocked: boolean;
  isMvp: boolean;
  isFlipped: boolean;
  canFlip: boolean;
  onToggleFlip: () => void;
  visibleFp?: number;
  visibleBadgeCount?: number;
  isRevealing?: boolean;
  revealActive?: boolean;
  fpCountUpMs?: number;
  stamp: OverlayStamp;
  onRollComplete: () => void;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
  glowActive?: boolean;
  glowSrc?: string;
  glowDurationMs?: number;
  glowTier?: string;
}

/** Everything the shell passes into the sport's back face renderer */
export interface CardBackProps {
  card: PlayerCard;
  stableCard: PlayerCard;
}

export interface CardShellProps {
  card: PlayerCard;
  phase: GamePhase;
  locked?: boolean;
  isLocked?: boolean;
  isMvp?: boolean;
  flipped?: boolean;
  isFlipped?: boolean;
  canFlip?: boolean;
  onToggleLock?: () => void;
  onToggleFlip?: () => void;
  isRevealing?: boolean;
  visibleFp?: number;
  visibleBadgeCount?: number;
  noTransition?: boolean;
  flipDurationMs?: number;
  fpCountUpMs?: number;
  pulse?: any;
  shakeType?: ShakeType | null;
  cardShakeType?: ShakeType | null;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  isSpotlight?: boolean;
  spotlightLevel?: number;
  isDimmed?: boolean;
  onRollComplete?: () => void;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
  glowActive?: boolean;
  glowTier?: string;
  glowDurationMs?: number;
  /** Sport provides its own front face */
  renderFront: (props: CardFrontProps) => React.ReactNode;
  /** Sport provides its stats back face (only used when canFlip=true) */
  renderBack: (props: CardBackProps) => React.ReactNode;
}

// ── Session-level overlay map ──────────────────────────────────────────────

type OverlayState = { stamp: OverlayStamp; stamping: boolean };
const overlayMap = new Map<string, OverlayState>();
export function resetAllOverlays() { overlayMap.clear(); }

function tierToGlowFile(tier: string): string {
  const t = tier?.toUpperCase();
  if (t === "ORANGE") return "orange";
  if (t === "PURPLE") return "purple";
  if (t === "BLUE")   return "blue";
  if (t === "GREEN")  return "green";
  return "white";
}

/** Same breakpoints as CardFront salary tier (fallback when glowTier prop missing). */
function tierFromSalaryForGlow(salary: number): string {
  const s = Number(salary ?? 0);
  return s >= 52 ? "ORANGE" : s >= 40 ? "PURPLE" : s >= 28 ? "BLUE" : s >= 16 ? "GREEN" : "WHITE";
}

// ── PlayerCardShell ────────────────────────────────────────────────────────

export function PlayerCardShell(props: CardShellProps) {
  const locked  = props.locked ?? props.isLocked ?? false;
  const flipped = props.flipped ?? props.isFlipped ?? false;
  const canFlip = props.canFlip ?? false;

  const {
    card, phase, isMvp = false, onToggleFlip,
    isRevealing, visibleFp, visibleBadgeCount,
    noTransition, flipDurationMs, fpCountUpMs,
    shakeType, cardShakeType, badges,
    isSpotlight, spotlightLevel, isDimmed, onRollComplete,
    heldFpVisible, isTapTarget,
    glowActive, glowTier, glowDurationMs,
    renderFront, renderBack,
  } = props;

  const id = String((card as any).cardId ?? "");

  // ── Economy freeze ────────────────────────────────────────────────────
  const economyRef = useRef<Map<string, { tier: any; salary: any; projectedFp: any; headshotUrl: any }>>(new Map());
  useEffect(() => {
    if (!id) return;
    const m = economyRef.current;
    if (!m.has(id)) {
      m.set(id, {
        tier: (card as any).tier,
        salary: (card as any).salary,
        projectedFp: (card as any).projectedFp,
        headshotUrl: (card as any).headshotUrl,
      });
    }
  }, [id, card]);

  const stableCard = useMemo(() => {
    if (!id) return card;
    const snap = economyRef.current.get(id);
    if (!snap) return card;
    return {
      ...(card as any),
      tier: snap.tier,
      salary: snap.salary,
      projectedFp: snap.projectedFp,
      headshotUrl: (card as any).headshotUrl,
    } as PlayerCard;
  }, [card, id]);

  // ── Overlay / stamp state machine ─────────────────────────────────────
  // Strategy: fire the stamp as soon as visibleFp reaches actualFp AND
  // cardShakeType is known. This bypasses the onRollComplete callback chain
  // which races against gameState changing (REVEALING → WIN_CELEBRATION).
  const [overlay, setOverlay]    = useState<OverlayState>({ stamp: null, stamping: false });
  const stampFiredRef            = useRef(false);
  const rollCompleteFiredRef     = useRef(false);

  // Reset when card identity changes
  useEffect(() => {
    setOverlay({ stamp: null, stamping: false });
    stampFiredRef.current = false;
    rollCompleteFiredRef.current = false;
  }, [id]);

  // Clear stamp when card returns to pre-reveal state
  useEffect(() => {
    if (!flipped && !cardShakeType) {
      overlayMap.delete(id);
      setOverlay({ stamp: null, stamping: false });
      stampFiredRef.current = false;
    }
  }, [flipped, id, cardShakeType]);

  // ── Direct stamp trigger: fires when FP roll-up completes ──────────────
  // visibleFp reaching actualFp is the reliable signal — it doesn't depend
  // on isRevealing, revealActive, or gameState.
  const actualFp = Number((card as any).actualFp ?? 0);
  useEffect(() => {
    if (stampFiredRef.current) return;
    if (!cardShakeType) return;
    if (visibleFp === undefined) return;
    // visibleFp >= actualFp means roll-up is complete (or skipped)
    if (visibleFp < actualFp) return;
    stampFiredRef.current = true;
    const stamp: OverlayStamp =
      cardShakeType === "legendary" ? "SMOKING HOT" :
      cardShakeType === "big"      ? "ON FIRE" :
      cardShakeType === "frozen"   ? "FREEZING" :
      cardShakeType === "cold"     ? "ICE COLD" : null;
    const next: OverlayState = { stamp, stamping: true };
    overlayMap.set(id, next);
    setOverlay(next);
  }, [visibleFp, cardShakeType, id, actualFp]);

  // onRollComplete fires when CardFront's FP animation finishes.
  // Fire unconditionally — the stamp animation is purely visual and must not
  // block the sequencing chain. pendingDoneRef in the hook receives this signal.
  const handleRollComplete = useCallback(() => {
    if (rollCompleteFiredRef.current) return;
    rollCompleteFiredRef.current = true;
    props.onRollComplete?.();
  }, [id]); // eslint-disable-line

  useEffect(() => {
    if (overlay.stamping) {
      const t = window.setTimeout(() => {
        setOverlay(prev => {
          const next = { ...prev, stamping: false };
          overlayMap.set(id, next);
          return next;
        });
      }, 300);
      return () => clearTimeout(t);
    }
    if (overlay.stamp && !overlay.stamping && !rollCompleteFiredRef.current) {
      rollCompleteFiredRef.current = true;
      props.onRollComplete?.();
    }
  }, [overlay.stamping, overlay.stamp, id]);

  // ── Classes + styles ──────────────────────────────────────────────────
  const shakeClass =
    shakeType === "big"      ? "pcs-shake-big"      :
    shakeType === "hype"     ? "pcs-shake-hype"     :
    shakeType === "cold"     ? "pcs-shake-cold"     :
    shakeType === "legendary" ? "pcs-shake-legendary" :
    shakeType === "frozen"   ? "pcs-shake-frozen"   : "";

  const glowClass = glowActive ? (() => {
    const t = (glowTier ?? "").toUpperCase();
    if (t === "ORANGE") return "pcs-glow-orange";
    if (t === "PURPLE") return "pcs-glow-purple";
    if (t === "BLUE")   return "pcs-glow-blue";
    if (t === "GREEN")  return "pcs-glow-green";
    return "pcs-glow-white";
  })() : "";

  const innerClass = [
    "pcs-inner",
    flipped ? "is-flipped" : "",
    noTransition ? "no-transition" : "",
    glowClass,
  ].filter(Boolean).join(" ");

  const innerStyle = {
    ["--flip-ms" as any]: `${Math.max(0, flipDurationMs ?? 450)}ms`,
    ["--glow-ms" as any]: `${glowDurationMs ?? 700}ms`,
  } as React.CSSProperties;

  const outerStyle: React.CSSProperties = {
    width: "100%", height: "100%", perspective: "1000px", position: "relative",
    transform: isSpotlight
      ? `scale(${spotlightLevel === 3 ? 1.08 : spotlightLevel === 2 ? 1.06 : 1.04})`
      : "scale(1)",
    transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
    zIndex: isSpotlight ? 100 : 1,
    background: "transparent",
  };

  // ── Front face props ──────────────────────────────────────────────────
  const frontProps: CardFrontProps = {
    card: { ...(stableCard as any), headshotUrl: (card as any).headshotUrl } as PlayerCard,
    stableCard,
    phase,
    isLocked: locked,
    isMvp,
    isFlipped: flipped,
    canFlip,
    onToggleFlip: onToggleFlip ?? (() => {}),
    visibleFp,
    visibleBadgeCount,
    isRevealing,
    revealActive: !!(isRevealing && isSpotlight),
    fpCountUpMs,
    stamp: overlay.stamp,
    onRollComplete: handleRollComplete,
    badges,
    heldFpVisible,
    isTapTarget,
    glowActive: !!glowActive,
    glowSrc: glowActive
      ? `${import.meta.env.BASE_URL}glow-${tierToGlowFile(
          glowTier
            ?? tierFromSalaryForGlow(Number((stableCard as any).salary ?? (card as any).salary ?? 0)),
        )}.png`
      : undefined,
    glowDurationMs,
    glowTier:
      glowTier
      ?? tierFromSalaryForGlow(Number((stableCard as any).salary ?? (card as any).salary ?? 0)),
  };

  return (
    <div className={`${shakeClass}${isTapTarget ? " pcs-tap-bounce" : ""}`} style={outerStyle}>
      {isTapTarget && (
        <div style={{
          position: "absolute", inset: -3, borderRadius: 21,
          border: "2px solid rgba(255,255,255,0.7)",
          pointerEvents: "none", zIndex: 70,
          animation: "pcsTapHintPulse 1.4s ease-in-out infinite",
          boxShadow: "0 0 12px rgba(255,255,255,0.35)",
        }} />
      )}
      <div className={innerClass} style={innerStyle}>
        <div className="pcs-face">
          {renderFront(frontProps)}
        </div>
        <div className="pcs-face pcs-face-back">
          {canFlip
            ? renderBack({ card, stableCard })
            : <CardBackGeneric />
          }
        </div>
      </div>{/* end pcs-inner */}

    </div>
  );
}