/**
 * shared/components/CardFront.tsx
 * LAYER 1: Universal notched card front face.
 *
 * Layout (per 3/18 designer spec — 329×478px):
 *   - Notched SVG clip-path shape
 *   - Tier gradient background
 *   - Salary (top-left, italic bold)
 *   - Position only (top-right, e.g. PG / SG / C)
 *   - Season + team in the notch (e.g. "LAL 24-25")
 *   - Hero area (headshot)
 *   - Black strip (~72%–86%): name on top 2 lines, FP row below
 *     - Pre-reveal: shows "AVG" label + average FP value (greyed)
 *     - Post-reveal: fades to actual FP number
 *   - Accent strip (~86%–99%): badges only
 *   - Stamp overlay, pulse ring, hold indicator
 */

import { useEffect, useMemo, useState, useRef } from "react";
import type { GamePhase, PlayerCard } from "@shared/types";
import { getTier, type TierKey, TIER_POSITION_TEXT } from "@shared/theme";
import { soundManager } from "@shared/utils/soundManager";
import type { OverlayStamp } from "@shared/components/PlayerCardShell";
import { CARD_CLIP_PATH_OBJECT_BOX } from "@shared/components/cardClipShape";

// ── CSS injected once ──────────────────────────────────────────────────────

const STYLE_ID = "card-front-styles-v2";
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
    @keyframes cfFpFadeIn {
      0%   { opacity: 0; transform: translateY(3px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes cfFpFadeOut {
      0%   { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-3px); }
    }
    @keyframes cfGlowFlash {
      0%   { opacity: 0; }
      12%  { opacity: 1; }
      48%  { opacity: 0.98; }
      100% { opacity: 0; }
    }
    @keyframes cfFireA {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.15; }
    }
    @keyframes cfFireB {
      0%, 100% { opacity: 0.15; }
      50% { opacity: 1; }
    }
    @keyframes cfIceA {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.1; }
    }
    @keyframes cfIceB {
      0%, 100% { opacity: 0.1; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(st);
}

// ── Helpers ────────────────────────────────────────────────────────────────

export type PulseStyle = "NEG" | "NEUTRAL" | "POS" | "GOAT";

function clampText(v: any) { return String(v ?? "").trim(); }

function initialsFromName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

function formatSeasonRange(season: any): string {
  const s = clampText(season);
  if (/^\d{4}$/.test(s)) return `${s.slice(0, 2)}-${s.slice(2, 4)}`;
  let m = s.match(/(\d{4})\D+(\d{4})/);
  if (m) return `${m[1].slice(2)}-${m[2].slice(2)}`;
  m = s.match(/(\d{2})\D+(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/(\d{4})/);
  if (m) { const a = m[1].slice(2); return `${a}-${String((Number(a) + 1) % 100).padStart(2, "0")}`; }
  return s;
}

function safeKeyFor(card: any) {
  const base = String(card?.basePlayerId ?? "").trim();
  const season = String(card?.season ?? "").trim();
  return season ? `${base}|${season}` : base;
}

function splitNameLines(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    const n = parts[0];
    return [n.length > 10 ? n.slice(0, 10) + "." : n, ""];
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");
  const line1 = firstName.length > 10 ? firstName.slice(0, 10) + "." : firstName;
  const line2 = lastName.length > 10 ? lastName.slice(0, 10) + "." : lastName;
  return [line1, line2];
}

function pulsePalette(pulse?: PulseStyle) {
  switch (pulse) {
    case "GOAT": return { ring: "rgba(255,215,80,0.60)", glow: "rgba(255,205,70,0.30)" };
    case "POS": return { ring: "rgba(255,150,70,0.55)", glow: "rgba(255,140,60,0.25)" };
    case "NEG": return { ring: "rgba(120,180,235,0.55)", glow: "rgba(110,170,230,0.22)" };
    default: return { ring: "rgba(255,255,255,0.10)", glow: "rgba(255,255,255,0.06)" };
  }
}

const CARD_PATH = CARD_CLIP_PATH_OBJECT_BOX;

// ── Public types ───────────────────────────────────────────────────────────

export interface CardFrontHeroProps {
  card: PlayerCard;
  initials: string;
  isActiveReveal: boolean;
}

export interface CardFrontProps {
  card: PlayerCard;
  stableCard?: PlayerCard;
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
  renderHero: (props: CardFrontHeroProps) => React.ReactNode;
  heldFpVisible?: boolean;
  isTapTarget?: boolean;
  /**
   * Performance percentile (0–100) derived from actualFp / projectedFp ratio.
   * Shown in accent strip after FP roll completes. Null = don't show.
   */
  perfPct?: number | null;
  /** Tier PNG glow — rendered inside the notched clip (full card), not in the shell. */
  glowActive?: boolean;
  glowSrc?: string;
  glowDurationMs?: number;
  glowTier?: string;
}

// ── CardFront ──────────────────────────────────────────────────────────────

export function CardFront(props: CardFrontProps) {
  const {
    card, stableCard, phase, isLocked, visibleFp, isRevealing, revealActive,
    isFlipped, heldFpVisible, isTapTarget,
    pulse, fpCountUpMs, stamp, onRollComplete, badges, renderHero,
    glowActive, glowSrc, glowDurationMs, glowTier, perfPct,
  } = props;

  const name = clampText((card as any)?.name);
  const team = clampText((card as any)?.team).toUpperCase();
  const season = (card as any)?.season ?? (card as any)?.year ?? (card as any)?.seasonLabel;
  const seasonFmt = formatSeasonRange(season);
  const posRaw = clampText((card as any)?.position);
  const posMap: Record<string, string> = {
    "PG": "PG", "SG": "SG", "G": "PG", "SF": "SF", "PF": "PF", "F": "SF",
    "G/F": "SG", "F/G": "SG", "F/C": "PF", "C": "C",
  };
  const pos = posRaw ? (posMap[posRaw.toUpperCase()] ?? posRaw) : "";
  const salary = Number((card as any)?.salary ?? 0);
  const proj = Number((card as any)?.projectedFp ?? 0);
  const isHeldCard = !!(card as any).wasHeld;
  const isDrawing = phase === ("DRAWING" as any);
  const isPreReveal = !!(isRevealing && !isHeldCard && visibleFp === undefined);
  const showResults = !isPreReveal && (phase === "RESULTS" || isHeldCard);
  const showTierColors = (!isFlipped && !isPreReveal) || revealActive || isLocked || isRevealing || isDrawing;

  const [displayedFp, setDisplayedFp] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [rollComplete, setRollComplete] = useState(false);
  const [fpRevealed, setFpRevealed] = useState(false);
  const cardKey = useMemo(() => safeKeyFor(card), [card]);
  const animRafRef = useRef<number>(0);
  const animStartRef = useRef<number | null>(null);
  const animatingRef = useRef(false);

  // Triggered once when visibleFp first goes above 0 — runs its own RAF loop
  // to completion. Never cancelled by other cards tapping (no revealActive in deps).
  useEffect(() => {
    if (visibleFp === undefined) {
      // visibleFpMap was cleared (skip triggered) — reset so animation can restart
      cancelAnimationFrame(animRafRef.current);
      animatingRef.current = false;
      animStartRef.current = null;
      return;
    }
    if (visibleFp <= 0) return;
    if (animatingRef.current) return;
    if (rollComplete) return; // already done — ignore any late visibleFp updates

    const actual = Math.max(0, Number((card as any)?.actualFp ?? 0));
    setFpRevealed(true);

    if (actual <= 0) {
      setDisplayedFp(0); setIsRolling(false); setRollComplete(true); onRollComplete?.(); return;
    }

    animatingRef.current = true;
    animStartRef.current = null;
    setIsRolling(true); setRollComplete(false);

    const duration = Math.max(300, Math.min(2200, Number(fpCountUpMs ?? 500)));

    const animate = (timestamp: number) => {
      if (animStartRef.current === null) animStartRef.current = timestamp;
      const elapsed = timestamp - animStartRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedFp(Math.round(actual * eased * 10) / 10);
      if (progress < 1) {
        // Tick sound every ~50ms (not every frame) for slot machine feel
        if (elapsed % 50 < 17) soundManager.playFpTick(progress);
        animRafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayedFp(actual);
        setIsRolling(false); setRollComplete(true);
        onRollComplete?.();
        // animatingRef intentionally stays true — blocks any re-trigger from late visibleFp updates
      }
    };
    animRafRef.current = requestAnimationFrame(animate);
    // No cleanup cancellation — intentional. Cancelling on dep change would kill
    // this card's animation when other cards are tapped. Reset only on cardKey change.
  }, [visibleFp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cancelAnimationFrame(animRafRef.current);
    animatingRef.current = false;
    animStartRef.current = null;
    setRollComplete(false); setDisplayedFp(0); setIsRolling(false); setFpRevealed(false);
  }, [cardKey]);

  // Sound 5 — fire/ice reveal sound, fires once when stamp first appears
  const heatSoundFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!stamp || heatSoundFiredRef.current === stamp) return;
    const isHot = stamp === "SMOKING HOT" || stamp === "ON FIRE";
    const isCold = stamp === "ICE COLD" || stamp === "FREEZING";
    if (isHot || isCold) {
      heatSoundFiredRef.current = stamp;
      soundManager.playHeatReveal(isHot);
    }
  }, [stamp]);

  // Determine what to show in the FP slot
  // Pre-reveal (isTapTarget or phase != RESULTS): show projected FP greyed out
  // Post-reveal: show actual FP with count-up
  const isShowingActualFp = fpRevealed || (showResults && !isPreReveal);
  const fpValue = isShowingActualFp
    ? (visibleFp !== undefined ? displayedFp : Number((card as any)?.actualFp ?? 0))
    : 0;
  const fpText = Number.isFinite(fpValue) && fpValue > 0 ? fpValue.toFixed(1) : "0.0";

  const badgeBonusFp = useMemo(() => badges?.reduce((s, b) => s + (b.fp ?? 0), 0) ?? 0, [badges]);
  const hasBadges = (badges?.length ?? 0) > 0;
  const hasRevealed = rollComplete || (!!isRevealing && !!revealActive && visibleFp !== undefined && visibleFp > 0);
  const pulsePal = pulsePalette(pulse);
  const showPulse = !!pulse && pulse !== "NEUTRAL" && hasRevealed;

  const cardSalary = Number((stableCard as any)?.salary ?? (card as any)?.salary ?? 0);
  const derivedTier = cardSalary >= 52 ? "ORANGE" : cardSalary >= 40 ? "PURPLE" : cardSalary >= 28 ? "BLUE" : cardSalary >= 16 ? "GREEN" : "WHITE";
  const tier = getTier(derivedTier);
  const isWhiteTier = derivedTier === "WHITE";
  const onCardText = isWhiteTier ? "#FFFFFF" : "#000000";
  const positionTextColor = TIER_POSITION_TEXT[(derivedTier as TierKey)] ?? TIER_POSITION_TEXT.WHITE;
  const initials = initialsFromName(name || `${team} ${pos}`);
  const [nameLine1, nameLine2] = splitNameLines(name);
  const isActiveReveal = !!(isRevealing && revealActive && visibleFp !== undefined && visibleFp > 0);
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

        {/* Tier gradient — hidden until card face is visible */}
        {showTierColors && <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, ${tier.bg} 0%, ${tier.bgEnd} 70%, ${tier.bgEnd} 100%)`,
        }} />}

        {/* HERO — sport-specific content, covers top 72% */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: "27.8%" }}>
          {renderHero({ card, initials, isActiveReveal })}
        </div>

        {/* SALARY — top-left */}
        <div style={{ position: "absolute", top: "6.5%", left: "6%", zIndex: 8, pointerEvents: "none", lineHeight: 1 }}>
          <span data-ftue-label="salary" style={{ fontSize: 16, fontWeight: 900, fontStyle: "italic", color: onCardText, letterSpacing: -0.5, lineHeight: 1 }}>
            ${salary}
          </span>
        </div>

        {/* POSITION — top-right; tier-colored per designer (salary left still uses onCardText) */}
        <div style={{ position: "absolute", top: "6%", right: "6%", zIndex: 8, pointerEvents: "none" }}>
          <span style={{ fontSize: 16, fontWeight: 900, fontStyle: "italic", color: positionTextColor, letterSpacing: -0.5, lineHeight: 1, textTransform: "uppercase" }}>
            {pos}
          </span>
        </div>

        {/* ── BLACK STRIP (72% → 86.2%) — left: name 2 lines | right: FP ── */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "72%", height: "14.2%",
          background: "#000000",
          display: "flex", flexDirection: "row",
          alignItems: "stretch",
          paddingLeft: 7, paddingRight: 7,
          gap: 6,           // minimum guaranteed gap between name and FP
          zIndex: 4, overflow: "hidden",
        }}>
          {/* LEFT — player name, two lines, vertically centered */}
          <div style={{
            flex: 1,
            display: "flex", flexDirection: "column",
            alignItems: "flex-start", justifyContent: "center",
            gap: 2, minWidth: 0, maxWidth: "55%",
          }}>
            {nameLine1 && (
              <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: "#FFFFFF", lineHeight: 1, whiteSpace: "nowrap", display: "block", maxWidth: "100%" }}>
                {nameLine1}
              </span>
            )}
            {nameLine2 && (
              <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: "#FFFFFF", lineHeight: 1, whiteSpace: "nowrap", display: "block", maxWidth: "100%" }}>
                {nameLine2}
              </span>
            )}
          </div>

          {/* RIGHT — FP column */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", flexShrink: 0, minWidth: 52, maxWidth: 68 }}>

            {/* PRE-REVEAL layer: "AVG" label + average FP number */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "flex-end", justifyContent: "center",
              gap: 2,
              opacity: isShowingActualFp ? 0 : 1,
              transition: "opacity 350ms ease",
              pointerEvents: "none",
            }}>
              <span data-ftue-label="avg" style={{ fontSize: 7, fontWeight: 700, color: "rgba(255,255,255,0.38)", letterSpacing: 1, textTransform: "uppercase", lineHeight: 1 }}>AVG</span>
              <span data-ftue-label="avg" style={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.40)", letterSpacing: -0.3, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {proj.toFixed(1)}
              </span>
            </div>

            {/* POST-REVEAL layer: big actual FP — no label, fills both line heights */}
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "flex-end", justifyContent: "center",
              opacity: isShowingActualFp ? (isHeldCard ? ((heldFpVisible || fpRevealed) ? 1 : 0) : 1) : 0,
              transition: isHeldCard ? "opacity 800ms ease" : "opacity 350ms ease",
              pointerEvents: "none",
            }}>
              {/* FP number — no badge bonus here, that lives in accent strip */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
                <span style={{
                  fontSize: 22, fontWeight: 950, color: "#FFFFFF", letterSpacing: -0.5,
                  lineHeight: 1, fontVariantNumeric: "tabular-nums", display: "inline-block",
                  transform: isRolling ? "scale(1.06)" : "scale(1)",
                  transition: isRolling ? "none" : "transform 100ms ease",
                }}>
                  {isShowingActualFp ? displayedFp.toFixed(1) : fpText}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* ── ACCENT STRIP (86.2% → 99%) — badges + total bonus + perf percentile ── */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "86.2%", bottom: 0,
          background: tier.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          paddingLeft: 4, paddingRight: 4,
          zIndex: 4, overflow: "hidden",
          gap: 3,
        }}>
          {hasBadges ? (
            <>
              {badges!.slice(0, 6).map((badge, i) => (
                <span
                  key={badge.id ?? badge.label ?? i}
                  style={{
                    animation: `cfBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${i * 70}ms both`,
                    fontSize: 8, lineHeight: 1, flexShrink: 0,
                  }}
                >{badge.icon}</span>
              ))}
              {badgeBonusFp > 0 && (
                <span style={{
                  animation: `cfBadgePop 0.35s cubic-bezier(0.175,0.885,0.32,1.275) ${Math.min(badges!.length, 6) * 70}ms both`,
                  fontSize: 8, fontWeight: 900, color: "#FFEA86", letterSpacing: 0.3, flexShrink: 0,
                }}>+{badgeBonusFp}</span>
              )}
            </>
          ) : null}

          {/* PERF PERCENTILE text removed — ratio expressed via fire/ice overlay instead */}
        </div>

        {/* FIRE/ICE EFFECT — two overlay images flickering out of phase, clipped above badges */}
        {(stamp === "SMOKING HOT" || stamp === "ON FIRE" || stamp === "ICE COLD" || stamp === "FREEZING") && (() => {
          const isFire = stamp === "SMOKING HOT" || stamp === "ON FIRE";
          const src = isFire ? "/火焰.png" : "/冰雪.png";
          const animA = isFire ? "cfFireA" : "cfIceA";
          const animB = isFire ? "cfFireB" : "cfIceB";
          const intensity = (stamp === "SMOKING HOT" || stamp === "FREEZING") ? 1.0 : 0.4;
          const opacity = isFire ? 0.28 + intensity * 0.32 : 0.22 + intensity * 0.30;
          const animSpeed = isFire ? `${2.2 - intensity * 0.9}s` : `${3.0 - intensity * 1.2}s`;
          const spreadH = intensity * 18;
          const spreadTop = intensity * 24;
          const tintFilter = isFire
            ? `hue-rotate(${intensity * 15}deg) saturate(${1 + intensity * 0.6}) brightness(${1 - intensity * 0.15})`
            : `hue-rotate(${intensity * -20}deg) saturate(${1 - intensity * 0.4}) brightness(${1 + intensity * 0.5})`;
          const twinOpacity = 0.15 + intensity * 0.40;
          const clipStyle: React.CSSProperties = {
            position: "absolute", top: -spreadTop, left: -spreadH, right: -spreadH, bottom: "28%",
            borderRadius: "20px 20px 0 0", overflow: "hidden", pointerEvents: "none", zIndex: 39,
          };
          const imgBase: React.CSSProperties = {
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", mixBlendMode: "screen", filter: tintFilter,
          };
          return (
            <div style={clipStyle}>
              <img src={src} style={{ ...imgBase, opacity, animation: `${animA} ${animSpeed} ease-in-out infinite` }} />
              <img src={src} style={{ ...imgBase, opacity: twinOpacity, transform: "scaleX(-1)", animation: `${animB} ${animSpeed} ease-in-out infinite` }} />
            </div>
          );
        })()}

        {/* Glow burst is now rendered in PlayerCardShell as a sibling of pcs-inner,
            outside pcs-face overflow:hidden, so it can bloom beyond card boundaries. */}

      </div>{/* end clipped content */}

      {/* SEASON + TEAM — hidden when card is face-down to prevent mirror bleed */}
      {showTierColors && (
        <div style={{ position: "absolute", top: 0, height: "5.8%", left: "34.2%", right: "36.4%", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 35, pointerEvents: "none", overflow: "hidden" }}>
          <span style={{ fontSize: 5.5, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase", color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap", lineHeight: 1 }}>
            {team ? `${team} ${seasonFmt}` : seasonFmt}
          </span>
        </div>
      )}

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

      {/* BORDER TRIM — hidden until card face is visible */}
      {showTierColors && (
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 50, overflow: "hidden" }} viewBox="0 0 1 1" preserveAspectRatio="none">
          <defs>
            <clipPath id={`border-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")}`} clipPathUnits="objectBoundingBox">
              <path d={CARD_PATH} />
            </clipPath>
          </defs>
          <path d={CARD_PATH} fill="none" stroke={tier.bg} strokeWidth="2" strokeOpacity="1.0" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#border-clip-${cardKey.replace(/[^a-z0-9]/gi, "_")})`} />
        </svg>
      )}

    </div>
  );
}