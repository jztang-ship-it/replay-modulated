/**
 * shared/components/CardFront.tsx
 * LAYER 1: Universal notched card front face.
 *
 * Owns all visual structure that is ReplayMod brand identity:
 *   - Notched SVG clip-path shape
 *   - Tier gradient background
 *   - Salary (top-left), Proj (top-right)
 *   - Season text in the notch
 *   - Name strip (black bar)
 *   - Team/pos/FP strip (tier accent)
 *   - Badges strip
 *   - Stamp overlay (CAREER NIGHT / ICE COLD)
 *   - Pulse ring
 *   - Hold indicator (gold triangle)
 *   - FP count-up animation
 *
 * Sport-specific hero content injected via:
 *   renderHero(card: PlayerCard) → ReactNode
 *
 * Basketball: headshot photo (or initials fallback)
 * Worldcup:   flag emoji + initials
 * Future sports: jersey, action photo, etc.
 *
 * Usage:
 *   import { CardFront, type CardFrontHeroProps } from "@shared/components/CardFront";
 */

import { useEffect, useMemo, useState, useRef } from "react";
import type { GamePhase, PlayerCard } from "@shared/types";
import { getTier } from "@shared/theme";
import type { OverlayStamp } from "@shared/components/PlayerCardShell";

// ── CSS injected once ──────────────────────────────────────────────────────

const STYLE_ID = "card-front-styles-v1";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
    @keyframes cfPulseRing {
      0%,100% { transform: scale(1.00); opacity: 0.35; }
      35%     { transform: scale(1.02); opacity: 0.70; }
      70%     { transform: scale(1.01); opacity: 0.45; }
    }
    @keyframes cfBadgePop {
      0%   { transform: scale(0) rotate(-15deg); opacity: 0; }
      60%  { transform: scale(1.3) rotate(5deg);  opacity: 1; }
      80%  { transform: scale(0.9) rotate(-2deg); }
      100% { transform: scale(1)   rotate(0deg);  opacity: 1; }
    }
  `;
  document.head.appendChild(st);
}

// ── Helpers ────────────────────────────────────────────────────────────────

export type PulseStyle = "NEG" | "NEUTRAL" | "POS" | "JACKPOT";

function clampText(v: any) { return String(v ?? "").trim(); }

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

function formatSeasonRange(season: any): string {
  const s = clampText(season);
  if (/^\d{4}$/.test(s)) return `${s.slice(0,2)}-${s.slice(2,4)}`;
  let m = s.match(/(\d{4})\D+(\d{4})/);
  if (m) return `${m[1].slice(2)}-${m[2].slice(2)}`;
  m = s.match(/(\d{2})\D+(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/(\d{4})/);
  if (m) { const a = m[1].slice(2); return `${a}-${String((Number(a)+1)%100).padStart(2,"0")}`; }
  return s;
}

function safeKeyFor(card: any) {
  const base = String(card?.basePlayerId ?? "").trim();
  const season = String(card?.season ?? "").trim();
  return season ? `${base}|${season}` : base;
}

function abbreviateName(name: string, maxLen = 13): string {
  if (name.length <= maxLen) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.slice(0, maxLen - 1) + "…";
  const last = parts.slice(1).join(" ");
  const abbr = `${parts[0][0]}. ${last}`;
  return abbr.length <= maxLen ? abbr : abbr.slice(0, maxLen - 1) + "…";
}

function pulsePalette(pulse?: PulseStyle) {
  switch (pulse) {
    case "JACKPOT": return { ring: "rgba(255,215,80,0.60)",  glow: "rgba(255,205,70,0.30)"  };
    case "POS":     return { ring: "rgba(255,150,70,0.55)",  glow: "rgba(255,140,60,0.25)"  };
    case "NEG":     return { ring: "rgba(120,180,235,0.55)", glow: "rgba(110,170,230,0.22)" };
    default:        return { ring: "rgba(255,255,255,0.10)", glow: "rgba(255,255,255,0.06)" };
  }
}

const BADGE_H = 24;

// Card shape paths — objectBoundingBox normalized (0→1)
// Notch geometry measured from designer SVG (card 344×503px)
const CARD_PATH =
  "M 0.0678 0 L 0.2486 0 L 0.3190 0.0338 Q 0.3190 0.0497 0.3418 0.0497 " +
  "L 0.6356 0.0497 Q 0.6582 0.0497 0.6582 0.0338 L 0.6949 0 L 0.9322 0 " +
  "Q 1 0 1 0.0677 L 1 0.9323 Q 1 1 0.9322 1 L 0.0678 1 " +
  "Q 0 1 0 0.9323 L 0 0.0677 Q 0 0 0.0678 0 Z";

// ── Public types ───────────────────────────────────────────────────────────

/** Props the sport provides to customize the hero area */
export interface CardFrontHeroProps {
  card: PlayerCard;
  /** Precomputed initials fallback (sport can use or ignore) */
  initials: string;
  /** True while card is in active reveal animation */
  isActiveReveal: boolean;
}

export interface CardFrontProps {
  card: PlayerCard;
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
  pulse?: PulseStyle;
  fpCountUpMs?: number;
  stamp: OverlayStamp;
  onRollComplete?: () => void;
  badges?: Array<{ id: string; icon: string; label: string; fp: number }>;
  /** Sport injects its hero content (headshot, flag, etc.) */
  renderHero: (props: CardFrontHeroProps) => React.ReactNode;
  /** tap mode: held card FP fades in after all unheld cards revealed */
  heldFpVisible?: boolean;
  /** tap mode: this card is waiting for a tap */
  isTapTarget?: boolean;
}

// ── CardFront ──────────────────────────────────────────────────────────────

export function CardFront(props: CardFrontProps) {
  const {
    card, phase, isLocked, visibleFp, isRevealing, revealActive,
    heldFpVisible, isTapTarget,
    pulse, fpCountUpMs, stamp, onRollComplete, badges, renderHero,
  } = props;

  const name      = clampText((card as any)?.name);
  const team      = clampText((card as any)?.team).toUpperCase();
  const season    = (card as any)?.season ?? (card as any)?.year ?? (card as any)?.seasonLabel;
  const seasonFmt = formatSeasonRange(season);
  const posRaw    = clampText((card as any)?.position);
  const posMap: Record<string, string> = {
    "PG":"G","SG":"G","G":"G","SF":"F","PF":"F","F":"F",
    "G/F":"G/F","F/G":"G/F","F/C":"F/C","C":"C",
  };
  const pos       = posRaw ? (posMap[posRaw.toUpperCase()] ?? posRaw) : "";
  const salary    = Number((card as any)?.salary ?? 0);
  const proj      = Number((card as any)?.projectedFp ?? 0);
  const isHeldCard  = !!(card as any).wasHeld;
  // Held cards always show the FP strip (opacity handles visibility)
  // so the fade-in has something to transition into
  const showResults = phase === "RESULTS" || isHeldCard;

  const [displayedFp,  setDisplayedFp]  = useState(0);
  const [isRolling,    setIsRolling]    = useState(false);
  const [rollComplete, setRollComplete] = useState(false);
  const cardKey     = useMemo(() => safeKeyFor(card), [card]);
  const targetFpRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRevealing || !revealActive) return;
    const finalTarget = Number((card as any)?.actualFp ?? 0);
    if (!Number.isFinite(finalTarget) || finalTarget <= 0) return;
    if (targetFpRef.current === null) targetFpRef.current = finalTarget;
  }, [card, isRevealing, revealActive]);

  useEffect(() => { targetFpRef.current = null; }, [cardKey]);

  useEffect(() => {
    if (visibleFp === undefined) { setDisplayedFp(showResults ? Number((card as any)?.actualFp ?? proj) : proj); return; }
    if (isRevealing && !revealActive && !isHeldCard && visibleFp === undefined) return;
    const target = targetFpRef.current ?? visibleFp;
    if (visibleFp > 0 && displayedFp !== target) {
      if (target === 0) { setDisplayedFp(0); setIsRolling(false); setRollComplete(true); onRollComplete?.(); return; }
      setIsRolling(true); setRollComplete(false);
      const duration = Math.max(220, Math.min(2200, Number(fpCountUpMs ?? 500)));
      const startTime = Date.now();
      let raf = 0;
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayedFp(target * eased);
        if (progress < 1) { raf = requestAnimationFrame(animate); }
        else { setDisplayedFp(target); setIsRolling(false); setRollComplete(true); onRollComplete?.(); }
      };
      raf = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(raf);
    }
  }, [visibleFp, fpCountUpMs, revealActive, isRevealing]);

  useEffect(() => { setRollComplete(false); setDisplayedFp(0); setIsRolling(false); }, [cardKey]);

  const fpValue      = showResults ? (visibleFp !== undefined ? displayedFp : Number((card as any)?.actualFp ?? 0)) : proj;
  const valueText    = Number.isFinite(fpValue) ? fpValue.toFixed(1) : "0.0";
  const badgeBonusFp = useMemo(() => badges?.reduce((s, b) => s + (b.fp ?? 0), 0) ?? 0, [badges]);
  const hasBadges    = (badges?.length ?? 0) > 0;
  const hasRevealed  = rollComplete || (!!isRevealing && !!revealActive && visibleFp !== undefined && visibleFp > 0);
  const pulsePal     = pulsePalette(pulse);
  const showPulse    = !!pulse && pulse !== "NEUTRAL" && hasRevealed;
  const cardSalary = Number((card as any)?.salary ?? 0);
  const derivedTier = cardSalary >= 52 ? "ORANGE" : cardSalary >= 40 ? "PURPLE" : cardSalary >= 28 ? "BLUE" : cardSalary >= 16 ? "GREEN" : "WHITE";
  const tier         = getTier(derivedTier);
  const isWhiteTier  = derivedTier === "WHITE";
  const onCardText   = isWhiteTier ? "#FFFFFF" : "#000000";
  const onCardTextMuted = isWhiteTier ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.55)";
  const initials     = initialsFromName(name || `${team} ${pos}`);
  const shortName    = abbreviateName(name, 13);
  const isActiveReveal = !!(isRevealing && revealActive && visibleFp !== undefined && visibleFp > 0);
  const stripFadeOpacity = isActiveReveal ? 0.08 : 1;
  const fadeTransition   = "opacity 0.3s ease";
  const clipId = useMemo(() => `card-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")}`, [cardKey]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "transparent" }}>
      {/* Clip-path definition */}
      <svg width="0" height="0" style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d={CARD_PATH} />
          </clipPath>
        </defs>
      </svg>

      {/* ── CLIPPED CARD CONTENT ── */}
      <div style={{ position: "absolute", inset: 0, clipPath: `url(#${clipId})` }}>

        {/* Tier gradient */}
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, ${tier.bg} 0%, ${tier.bgEnd} 70%, ${tier.bgEnd} 100%)`,
        }} />

        {/* HERO — sport-specific content (headshot, flag, etc.) */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: "26.5%" }}>
          {renderHero({ card, initials, isActiveReveal })}
        </div>

        {/* SALARY */}
        <div style={{ position: "absolute", top: "6.5%", left: "6%", zIndex: 8, pointerEvents: "none", lineHeight: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 900, fontStyle: "italic", color: onCardText, letterSpacing: -0.5, lineHeight: 1 }}>${salary}</span>
        </div>

        {/* PROJ */}
        <div style={{ position: "absolute", top: "6%", right: "6%", zIndex: 8, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 900, fontStyle: "italic", color: onCardText, lineHeight: 1 }}>{proj.toFixed(1)}</span>
          <span style={{ fontSize: 5, fontWeight: 800, color: onCardTextMuted, letterSpacing: 0.8, textTransform: "uppercase", lineHeight: 1 }}>PROJ</span>
        </div>

        {/* NAME STRIP */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "73.5%", height: "10.5%",
          background: "#000000",
          display: "flex", alignItems: "center", justifyContent: "center",
          paddingLeft: 6, paddingRight: 6, zIndex: 4, overflow: "hidden",
        }}>
          <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.2, textTransform: "uppercase", color: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1, display: "block", textAlign: "center" }}>
            {shortName}
          </span>
        </div>

        {/* TEAM / POS / FP STRIP */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "84%", bottom: 0,
          background: tier.accent,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingLeft: 6, paddingRight: 6, zIndex: 4, overflow: "hidden",
          opacity: stripFadeOpacity, transition: fadeTransition,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.3, textTransform: "uppercase", color: tier.isLight ? "rgba(0,0,0,0.85)" : "#FFFFFF", lineHeight: 1 }}>{team}</span>
            <span style={{ fontSize: 8, color: isWhiteTier ? "rgba(255,255,255,0.40)" : onCardTextMuted, lineHeight: 1 }}>·</span>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.3, textTransform: "uppercase", color: tier.isLight ? "rgba(0,0,0,0.85)" : "#FFFFFF", lineHeight: 1 }}>{pos}</span>
          </div>
          {showResults && (
            <div style={{
              display: "flex", alignItems: "center", gap: 1, flexShrink: 0,
              // Held card FP fades in; normal cards show immediately
              opacity: isHeldCard ? (heldFpVisible ? 1 : 0) : 1,
              transition: isHeldCard ? "opacity 800ms ease" : "none",
            }}>
              <span style={{ fontSize: 13, fontWeight: 950, color: isWhiteTier ? "#FFFFFF" : onCardText, lineHeight: 1, fontVariantNumeric: "tabular-nums", display: "inline-block", transform: isRolling ? "scale(1.08)" : "scale(1)", transition: isRolling ? "none" : "transform 100ms ease" }}>
                {valueText}
              </span>
              {badgeBonusFp > 0 && (
                <span style={{ fontSize: 6, fontWeight: 700, color: "#FFEA86", marginLeft: 1 }}>+{badgeBonusFp}</span>
              )}
            </div>
          )}
        </div>

        {/* BADGES */}
        {hasBadges && (
          <div style={{ position: "absolute", left: 3, right: 3, bottom: "calc(22% + 3px)", height: BADGE_H, display: "flex", gap: 2, justifyContent: "center", alignItems: "center", zIndex: 7, pointerEvents: "none", flexWrap: "nowrap", overflow: "hidden" }}>
            {badges!.slice(0, 5).map((badge, i) => (
              <div key={badge.id ?? badge.label ?? i} style={{ animation: `cfBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${i * 90}ms both`, display: "flex", alignItems: "center", gap: 2, background: "rgba(0,0,0,0.82)", borderRadius: 5, padding: "2px 4px", border: "1px solid rgba(255,255,255,0.20)", flexShrink: 0 }}>
                <span style={{ fontSize: 11, lineHeight: 1 }}>{badge.icon}</span>
                <span style={{ fontSize: 6.5, fontWeight: 700, color: "#FFEA86" }}>+{badge.fp}</span>
              </div>
            ))}
          </div>
        )}

        {/* STAMP */}
        {stamp && (
          <div style={{
            position: "absolute",
            bottom: hasBadges ? `calc(27.4% + ${BADGE_H + 6}px)` : "calc(27.4% + 3px)",
            left: "50%", transform: "translateX(-50%) rotate(-3deg)",
            zIndex: 40, pointerEvents: "none", whiteSpace: "nowrap",
            fontSize: 10, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase",
            color: stamp === "SMOKING HOT" ? "#EF4444" : stamp === "ON FIRE" ? "#FB923C" : stamp === "ICE COLD" ? "#9CA3AF" : stamp === "FREEZING" ? "#374151" : "#EF4444",
            textShadow: stamp === "SMOKING HOT" ? "0 0 14px rgba(239,68,68,0.9), 0 2px 4px rgba(0,0,0,0.8)" : stamp === "ON FIRE" ? "0 0 14px rgba(251,146,60,0.8), 0 2px 4px rgba(0,0,0,0.8)" : "0 0 4px rgba(0,0,0,0.6), 0 2px 4px rgba(0,0,0,0.8)",
            border: `2px solid ${stamp === "SMOKING HOT" ? "#EF4444" : stamp === "ON FIRE" ? "#FB923C" : stamp === "ICE COLD" ? "#6B7280" : "#1F2937"}`,
            borderRadius: 4, padding: "2px 7px", background: "rgba(0,0,0,0.72)",
          }}>{stamp}</div>
        )}

      </div>{/* end clipped content */}

      {/* SEASON TEXT — outside clip, floats in the notch */}
      <div style={{ position: "absolute", top: 0, height: "5.8%", left: "24.9%", right: "30.5%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 35, pointerEvents: "none" }}>
        <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap", lineHeight: 1 }}>{seasonFmt}</span>
      </div>

      {/* HOLD INDICATOR */}
      {isLocked && (() => {
        const frontClipId = `card-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")}`;
        return (
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 60, clipPath: `url(#${frontClipId})` }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }} viewBox="0 0 1 1" preserveAspectRatio="none">
              <polygon points="0,0 0.18,0 0,0.13" fill="#F5C850" />
            </svg>
            <span style={{ position: "absolute", top: "2.5%", left: "3%", fontSize: 8, fontWeight: 950, color: "rgba(0,0,0,0.85)", lineHeight: 1, userSelect: "none" }}>H</span>
          </div>
        );
      })()}

      {/* PULSE RING */}
      {showPulse && (
        <div style={{ position: "absolute", inset: 0, clipPath: `url(#${clipId})`, pointerEvents: "none", zIndex: 25 }}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} viewBox="0 0 1 1" preserveAspectRatio="none">
            <path d={CARD_PATH} fill="none" stroke={pulsePal.ring} strokeWidth="6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ animation: "cfPulseRing 950ms ease-in-out infinite" }} />
          </svg>
        </div>
      )}

      {/* BORDER TRIM — always on top, contained by clip */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50, overflow: "visible" }} viewBox="0 0 1 1" preserveAspectRatio="none">
        <defs>
          <clipPath id={`border-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")}`} clipPathUnits="objectBoundingBox">
            <path d={CARD_PATH} />
          </clipPath>
        </defs>
        <path d={CARD_PATH} fill="none" stroke={tier.bg} strokeWidth="2" strokeOpacity="1.0" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#border-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")})`} />
      </svg>

    </div>
  );
}